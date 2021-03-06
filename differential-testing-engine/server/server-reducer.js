// Author: Satia Herfert

/**
 * Different server that sends files that were found to have
 * inconsistent results to minimize them. It is important that
 * the (EXACTLY TWO) browsers exposing the inconsistency connect to this server.
 *
 * XXX forbid more than nbBrowsers connections.
 */
(function () {
    try {
        var express = require('express');
        var bodyParser = require('body-parser');
        var jsonfile = require('jsonfile');
        var deasync = require('deasync');
    } catch (err) {
        console.log(err.message);
        console.log("Can't continue until you fix above error/s..");
        process.exit(1);
    }
    var fs = require('fs');
    var child_process = require('child_process');
    var Tester = require("../../gtr/tree-reducer/inputTester").Tester;
    var treeProvider = require("../../program-generation/js-ast/jsAstProvider");
    var treeGenerator = require("../../program-generation/js-ast/jsAstGenerator");
    var execWithCode = require("../../gtr/tree-reducer/ddMinTree").executeWithCode;
    var hdd = require("../../gtr/tree-reducer/hdd");
    var ddminLine = require("../../gtr/tree-reducer/ddMinLine").ddminLine;
    var ddminChar = require("../../gtr/tree-reducer/ddMinChar").ddminChar;
    var gtrAlgo = require("../../gtr/tree-reducer/gtr");
    var util = require('./util-server');

    var stringify = require('json-stable-stringify');

    /* Configurations */
    var config = jsonfile.readFileSync("config.json");
    var preprocessor = require(config.preprocessor);
    var codeDir = config.reduceCodeDirectory;
    var reduceRefreshSleep = config.reduceRefreshSleep; // milliseconds between re-scans of the the queue
    var nbBrowsers = config.reduceBrowsersExpected;
    var port = config.port;
    var useEval = config.useEval;

    var fileNameToState = {};
    var listOfAgents = [];
    var reducerQueue = {};

    // File state (different from the one in server.js)
    // for minimizing code.
    function JSFileState(fileName, rawCode) {
        this.fileName = fileName;
        this.rawCode = rawCode;
        this.origSize = rawCode.length;
        this.userAgentToResults = {}; // user agent string --> result
        this.results = {}; // minimization results with different algorithms
    }

    /**
     * Starts the server. The API consists of
     * GET /getCode that will return a piece of code to test and
     * POST /resportResult that must be used to report the results of tested code.
     */
    function startServer() {
        var app = express();
        app.use(express.static('client'));
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({
            extended: true
        }));

        app.get('/getCode', function (request, response) {
            var userAgent = request.headers['user-agent'];
            var parsedAgent = util.parsedUserAgent(userAgent);

            // Save the agent name
            if(listOfAgents.indexOf(parsedAgent) < 0) {
                console.log("First connection of " + parsedAgent);
                listOfAgents.push(parsedAgent);
                reducerQueue[parsedAgent] = [];
            }

            sendReductionRequestOnceAvailable(parsedAgent, response);
        });

        app.post('/reportResult', function (request, response) {
            var userAgent = request.headers['user-agent'];
            var fileName = request.body.fileName;
            var result = request.body.result;

            var parsedAgent = util.parsedUserAgent(userAgent);
            if (request.body.hasOwnProperty("library") && request.body.library !== "nil") {
                parsedAgent = parsedAgent + " + " + request.body["library"];
            }

            handleResponse(fileName, parsedAgent, result);
            response.send("OK");
        });

        var server = app.listen(port, function () {
            var host = server.address().address;
            var port = server.address().port;

            console.log("\nServer listening at http://%s:%s", host, port);
        });
    }
    
    function readCodeFromFiles() {
        var nbNewFiles = 0;
        var allFiles = fs.readdirSync(codeDir);
        for (var i = 0; i < allFiles.length; i++) {
            var file = allFiles[i];
            if (file.indexOf(".js") === file.length - 3) {
                var stats = fs.statSync(codeDir + "/" + file);
                if (stats.isFile()) {
                    if (!fileNameToState.hasOwnProperty(file)) {
                        // .js file that has not yet been read --> read it now
                        var rawCode = fs.readFileSync(codeDir + "/" + file, {
                            encoding: "utf8"
                        });
                        // Obtain the old fileState or create a new one
                        fileNameToState[file] = util.getFileState(codeDir, file, rawCode) || new JSFileState(file, rawCode);
                        nbNewFiles++;
                    }
                }
            }
        }
        if (nbNewFiles > 0) {
            console.log("Have read " + nbNewFiles + " new files.");
        }
    }

    function handleResponse(fileName, userAgent, result) {
        var fileState = fileNameToState[fileName];
        if (!fileState) {
            throw "Error: Received response for unknown file " + fileName;
        }

        if (!fileState.userAgentToResults.hasOwnProperty(userAgent)) {
            fileState.userAgentToResults[userAgent] = result['result'];
        }
        //console.log("RES: \n" + JSON.stringify(result, 0, 2));
        
        /* If it crashes in at least one of the browsers then set it to true */
        if (JSON.parse(result['isCrashing'])) {
            fileState.isCrashing = result['isCrashing'];
        }
    }

    /**
     * Reschedules itself if there is no pending request in the queue.
     * Otherwise, pops the first request (for this agent) and sends it to the client.
     * @param userAgent the user agent name
     * @param response the response object to send data to the client
     */
    function sendReductionRequestOnceAvailable(userAgent, response) {
        if(reducerQueue[userAgent].length == 0) {
            // Retry after some time, to see if now there is a new request
            setTimeout(sendReductionRequestOnceAvailable.bind(null, userAgent, response), reduceRefreshSleep);
            return;
        }

        var request = reducerQueue[userAgent].shift();
        var fileState = fileNameToState[request.name];
        response.send({
            code: fileState.testCode,
            fileName: fileState.fileName,
            useEval: useEval
        });
    }

    /**
     * This functions tests given code in browsers
     * and waits until all have returned a result
     *
     * @param {String} c the code to test
     * @param {JSFileState} fileState the fileState of the file to test.
     * @returns {object} (user agent string --> result) for all browsers
     */
    function testInBrowsers(c, fileState) {
        // Update the code
        fileState.testCode = preprocessor.preProcess(c);
        // Instrumentation can fail. In that case we have undefined results
        if(!fileState.testCode) {
            return undefined;
        }

        // At the moment a request is just defined by the filename.
        // Using an object in case this gets more complex.
        var request = {
            name:fileState.fileName
        };
        // Push the request to the queue for all agents
        for (var i = 0; i < listOfAgents.length; i++) {
            var agent = listOfAgents[i];
            reducerQueue[agent].push(request);
        }

        // Wait for the results from the browsers
        var res = fileState.userAgentToResults;
        deasync.loopWhile(function() {
            return Object.keys(res).length < nbBrowsers;
        });
        // Remove the results for the next iteration
        fileState.userAgentToResults = {};
        // Return the results
        return res;
    }

    /**
     * Advanced oracle for delta debugging. Uses the given filestate to compare the results.
     *
     * In comparison to the basic version this:
     * - Ignores R/W when having a crash vs. non-crash difference
     * - Only considers the first encountered difference in the traces.
     *
     * @param {String} c the code to evaluate using the oracle
     * @param {object} cmpWith the result to compare with (object obtained from invoking getExecutionDifferences)
     * @param {JSFileState} fileState the fileState of the file to test
     * @returns {String} "fail" or "?"
     */
    function advancedTestOracle(c, cmpWith, fileState) {
        // Obtain results for the given code
        var resArr = [];
        for(var i = 0; i < 3; i++) {
            let res = testInBrowsers(c, fileState);
            resArr.push(res)
        }

        var res = resArr[0];
        if(stringify(resArr[0]) != stringify(resArr[1])
            || stringify(resArr[0]) != stringify(resArr[2])) {

            console.log("Inconsistency!");
            console.log("0: " + stringify(resArr[0]));
            console.log("1: " + stringify(resArr[1]));
            console.log("2: " + stringify(resArr[2]));

            if(stringify(resArr[1]) == stringify(resArr[2])) {
                res = resArr[1];
            }
        }


        // Get diff to compare with original results
        var s = getExecutionDifferences(res);

        if(equalDiffObjects(s,cmpWith)) {
            // Same inconsistency
            return "fail";
        }
        // All other cases, we do not care further
        return "?";
    }

    /**
     * XXX This function assumes exactly two traces to compare. Not more, not less.
     * XXX This function compares execution difference by serializing JSON strings. This is not very
     * effective.
     *
     * It looks at the two execution traces obtained by jalangi and isolates the first
     * difference. In the case where only one of the traces ends with a crash, the other
     * trace is irrelevant.
     *
     * @param traces
     */
    function getExecutionDifferences(traces) {
        var agent0 = listOfAgents[0];
        var agent1 = listOfAgents[1];

        var result = {};
        // The traces may be undefined, in which case we don't have a difference
        if(!traces) {
            result[agent0] = {};
            result[agent1] = {};
            return result;
        }

        var trace0 = traces[agent0];
        var trace1 = traces[agent1];

        // Iterate through the entries
        for(let i = 0; i < Math.max(trace0.length, trace1.length); i++) {
            let elem0 = trace0[i];
            let elem1 = trace1[i];
            // Replace undefined with dummy objects (lists can have different lengths)
            if(!elem0) { elem0 = {};}
            if(!elem1) { elem1 = {};}

            if(!equalTraceElements(elem0, elem1)) {
                // Test if it is Error vs. non-Error
                if(elem0.key == "Error" && elem1.key != "Error") {
                    result[agent0] = elem0;
                    result[agent1] = {};
                } else if(elem0.key != "Error" && elem1.key == "Error") {
                    result[agent0] = {};
                    result[agent1] = elem1;
                } else {
                    result[agent0] = elem0;
                    result[agent1] = elem1;
                }
                return result;
            }
        }

        // If we reach that point, no difference was found
        result[agent0] = {};
        result[agent1] = {};
        return result;
    }

    /**
     * Compares two trace elements (key value pairs) and return true if they are equal.
     */
    function equalTraceElements(e0, e1) {
        return JSON.stringify(e0) === JSON.stringify(e1);
    }

    /**
     * Compares two diff objects obtained from getExecutionDifferences
     */
    function equalDiffObjects(e0, e1) {
        return JSON.stringify(e0) === JSON.stringify(e1);
    }

    /**
     * Reduces the code of one file using a reduction algorithm to a hopefully smaller piece of code
     * that exposes the same inconsistency.
     *
     * @param {JSFileState} fileState the fileState of the file to minimize.
     * @param algorithm a function reference to the algorithm to use
     * @param {String} algoPrefix the prefix to use for the given algorithm for the JSON file
     * @param treeAlgo true, if algorithm refers to a tree-based algorith; false, if it refers to a code-based algorithm
     */
    function reduce(fileState, algorithm, algoPrefix, treeAlgo) {
        console.log("Starting reduction of " + fileState.fileName);

        // First, send the original code to the browsers to have results for the comparison
        var originalResults = testInBrowsers(fileState.rawCode, fileState);
        var cmpWith = getExecutionDifferences(originalResults);
        console.log("Got initial results: " + JSON.stringify(cmpWith));
        fileState.diff = cmpWith;

        // DD algorithm
        var ddAlgo;
        if(treeAlgo) {
            ddAlgo = function(code, test) {
                return execWithCode(treeProvider, treeGenerator, algorithm, code, test);
            };
        } else {
            ddAlgo = function(code, test) {
                return algorithm(code, test);
            };
        }

        // Test function that just expects code, so we can pass it to DD
        var test = function(c) {
            return advancedTestOracle(c, cmpWith, fileState);
        };

        var c2t = treeProvider.codeToTree(fileState.rawCode);
        fileState.origSizeNodes = c2t.nbNodes();

        var tester = new Tester(test, ddAlgo);
        fileState.results[algoPrefix] = {};
        fileState.results[algoPrefix].minCode  = tester.runTest(fileState.rawCode);
        fileState.results[algoPrefix].size = fileState.results[algoPrefix].minCode.length;
        var newTree = treeProvider.codeToTree(fileState.results[algoPrefix].minCode);
        fileState.results[algoPrefix].sizeNodes  = newTree.nbNodes();
        fileState.results[algoPrefix].testsRun = tester.testsRun;
        fileState.results[algoPrefix].timeTaken = tester.timeTaken;
        fileState.results[algoPrefix].timeInOracle = tester.timeInOracle;
        console.log("Num tests: " + tester.testsRun + ` in ${fileState.results[algoPrefix].timeTaken} nanoseconds`);

        // Restore original results
        fileState.userAgentToResults = originalResults;
        // Write to file
        util.writeResult(codeDir, fileState);
        console.log("Reduction done of " + fileState.fileName);
    }

    /**
     * Reducing all files found, one after the other.
     *
     * @param algorithm a function reference to the algorithm to use
     * @param {String} algoPrefix the prefix to use for the given algorithm for the JSON file
     * @param treeAlgo true, if algorithm refers to a tree-based algorith; false, if it refers to a code-based algorithm
     */
    function reduceAllFiles(algorithm, algoPrefix, treeAlgo) {
        var totalTimeMS = 0;
        for (var key in fileNameToState) {
            if (fileNameToState.hasOwnProperty(key)) {
                reduce(fileNameToState[key], algorithm, algoPrefix, treeAlgo);
                // Accumulate total time taken
                totalTimeMS += (fileNameToState[key].results[algoPrefix].timeTaken / 1000000);
            }
        }
        console.log(`Total time: ${totalTimeMS.toFixed(0)} milliseconds with ${algoPrefix}`);
    }

    var chrome, firefox;
    /**
     * Opens Chrome 48 and Firefox 25.
     */
    function openBrowsers() {
        chrome = child_process.spawn("./chrome-runner.sh", [], {
            encoding: 'utf8',
            shell: true,
            cwd: "../differential-testing-browsers",
        });

        firefox = child_process.spawn("./firefox -profile testing-profile http://localhost:4000", [], {
            encoding: 'utf8',
            shell: true,
            cwd: "../differential-testing-browsers/firefox25.0.1",
        });
    }

    startServer();
    readCodeFromFiles();
    openBrowsers();

    // Invoke reduce as soon as n browsers have connected.
    console.log("Waiting for browsers to connect");
    deasync.loopWhile(function() { return listOfAgents.length < nbBrowsers; });

    //DDMin char
    //reduceAllFiles(ddminChar, "DD char-based", false);

    //DDMin line
    reduceAllFiles(ddminLine, "DD line-based", false);

    //HDD and the like
    reduceAllFiles(hdd.hdd, "HDD", true);
    reduceAllFiles(hdd.hddStar, "HDD*", true);

    var gtr = (pTree, pTest) => gtrAlgo.gtr("JS", pTree, pTest, false);
    reduceAllFiles(gtr, "GTR", true);
    var gtr2 = (pTree, pTest) => gtrAlgo.gtr("JS", pTree, pTest, true);
    reduceAllFiles(gtr2, "GTR (no language information)", true);
    var gtrS = (pTree, pTest) => gtrAlgo.gtrStar("JS", pTree, pTest, false);
    reduceAllFiles(gtrS, "GTR*", true);

    console.log("Hit CTRL+C to finish");

})();
