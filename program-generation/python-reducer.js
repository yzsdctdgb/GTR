// Author: Satia Herfert

/**
 * Compares all python test files with different algorithms and saves statistics.
 */
(function() {
    var fs = require('fs');
    var pyTreeProvider = require('./py-ast/pyAstProvider');
    var pyTreeGenerator = require('./py-ast/pyAstGenerator');
    var createStats = require("./tree-reducer/createStats").createStats;
    var inputTester = require("./tree-reducer/inputTester");

    var execWithCode = require("./tree-reducer/ddMinTree").executeWithCode;
    var hdd = require("./tree-reducer/hdd");
    var modelHdd = require("./tree-reducer/modelHdd");
    var rdd = require("./tree-reducer/rdd");
    var ddminLine = require("./tree-reducer/ddMinLine").ddminLine;
    var ddminChar = require("./tree-reducer/ddMinChar").ddminChar;


    /**
     * Reduces the code of one file using HDD (or other tree algorithm) to a hopefully smaller piece of code
     * that exposes the same bug.
     *
     * @param fileState the fileState of the file to minimize.
     * @param algorithm a function reference to the algorithm to use
     * @param {String} algoPrefix the prefix to use for the given algorithm for the JSON file
     * @param treeAlgo true, if algorithm refers to a tree-based algorith; false, if it refers to a code-based algorithm
     */
    function reduce(fileState, algorithm, algoPrefix, treeAlgo) {
        console.log("Starting reduction of " + fileState.fileName);

        // DD algorithm
        var ddAlgo;
        if(treeAlgo) {
            ddAlgo = function(code, test) {
                return execWithCode(pyTreeProvider, pyTreeGenerator, algorithm, code, test);
            };
        } else {
            ddAlgo = function(code, test) {
                return algorithm(code, test);
            };
        }

        var pycode = "" + fs.readFileSync(fileState.fileName);
        var tester = new inputTester.PyCrashTester(fileState.command, ddAlgo);
        var newCode = tester.runTest(pycode);

        // Create an results object if inexistant
        if(!fileState.results) {
            fileState.results = {};
        }

        fileState.results[algoPrefix] = {};
        fileState.results[algoPrefix].minCode  = newCode;
        fileState.results[algoPrefix].testsRun = tester.testsRun;
        fileState.results[algoPrefix].timeTaken = `${tester.timeTaken[0] * 1e9 + tester.timeTaken[1]}`;
        console.log("Num tests: " + tester.testsRun + ` in ${fileState.results[algoPrefix].timeTaken} nanoseconds`);

        // Write to file
        var resultFileName = fileState.fileName.replace(new RegExp('py$'), 'json');// .py --> .json
        fs.writeFileSync(resultFileName, JSON.stringify(fileState, 0, 2));

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
        for(let i = 0; i < allPyTests.length; i++) {
            reduce(allPyTests[i], algorithm, algoPrefix, treeAlgo);
            // Accumulate total time taken
            totalTimeMS += (allPyTests[i].results[algoPrefix].timeTaken / 1000000);
        }
        console.log(`Total time: ${totalTimeMS.toFixed(0)} milliseconds with ${algoPrefix}`);
    }

    var codeDir = "tree-reducer/input/python";

    // When having either too many files or too many algorithms
    // (In essence, too many synchronously spawned childs)
    // node crashes. Sadly, I am the only one on the Internet
    // with this particular failure.
    var allPyTests = [
        // { fileName: codeDir + "/bug1.py", command: "python3.4"},
        // { fileName: codeDir + "/bug2.py", command: "python2.7"},
        // //{ fileName: codeDir + "/bug3.py", command: "python3.4"}, // Non-detetministic
        // { fileName: codeDir + "/bug4.py", command: "python3.4"},
        // { fileName: codeDir + "/bug5.py", command: "python2.7"},
        // { fileName: codeDir + "/bug6.py", command: "python2.7"},
        // { fileName: codeDir + "/bug7.py", command: "python3.4"},
        // { fileName: codeDir + "/bug8.py", command: "python2.7"},
        // { fileName: codeDir + "/bug9.py", command: "python3.4"},
        { fileName: codeDir + "/bug10.py", command: "python2.7"}
    ];

    /**
     * Compares all files with different algorithms and saves statistics.
     */
    function runTests() {
        // DDMin line
        //reduceAllFiles(ddminLine, "ddmin", false);
        // HDD
        reduceAllFiles(hdd.hdd, "HDD", true);
        // Model-HDD with inferred knowledge
        modelHdd.setUseInferredKnowledge(true);
        reduceAllFiles(modelHdd.postLevelTransformationHddStar, "PLTM", true);

        // Create statistics
        createStats(codeDir);
    }

    runTests();

})();