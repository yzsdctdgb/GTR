// Author: Michael Pradel

(function () {

    var pollTimeout = 3600 * 1000; // milliseconds

    var userAgent = navigator.userAgent;

    console.log("Loaded.");

    function executeCode(dataReceivedForExecution) {
        var code = dataReceivedForExecution.code;
        var fileNameForDifferentialTesting = dataReceivedForExecution.fileName;
        console.log("Executing received code " + fileNameForDifferentialTesting);
        executeInWebWorker(code, fileNameForDifferentialTesting);
    }

    function executeInWebWorker(code, fileNameForDifferentialTesting) {
        /*
         * Deferring the execution of the code to a web worker in order to keep the current global context clean.
         * Adding the jalangi context to the worker using importScripts() call available only in Web workers.
         * Creating a blob type (temporary file) that mimics a physical file required by worker execution.
         * */
        var currentHost = window.location.host;
        currentHost = "http://" + currentHost;
        var jalangiFolder = "/jalangiRuntime/";
        var pathToJalangi = currentHost + jalangiFolder;
        var jalangiRuntime = "importScripts('" + pathToJalangi +
            "esotope.js','" + pathToJalangi +
            "acorn.js', '" + pathToJalangi +
            "Constants.js', '" + pathToJalangi +
            "Config.js', '" + pathToJalangi +
            "astUtil.js', '" + pathToJalangi +
            "esnstrument.js', '" + pathToJalangi +
            "iidToLocation.js', '" + pathToJalangi +
            "analysis.js','" + currentHost +
            "/executionSummarizer.js');";

        /* Post the result back to the main thread on receiving a message from it */
        var workerEventHandler = "onmessage = function(eevent) {" +
            " postMessage(__diffTestingEngineState__); " +
            "}";
        /* The code for sending to the worker */
        var appendedCode = jalangiRuntime + code + workerEventHandler;

        /* Create a blob from the code */
        var blob = new Blob([appendedCode], {
            type: 'application/javascript'
        });

        var worker = new Worker(URL.createObjectURL(blob));
        /*
         *        There are three cases when the current page needs to be reloaded.
         *            1) The worker runs into an error that is uncaught.
         *            2) The execution ran fine and the next code needs to be fetched.
         *            3) The execution in the worker does not return within specified time.
         */

        /* In case of uncaught (Some ES6 syntax errors that jalangi can't catch. Nor does the try-catch net) errors in
         the generated code, avoid crash of the engine. Reload and get the next code */
        worker.onerror = function (eevent) {
            console.log("Error during execution of the worker " + eevent.message + " Line no: " +
                eevent.lineno);
            var errobj = {result: "Error", isCrashing: true};
            sendResultReloadPage(errobj, fileNameForDifferentialTesting);
        };
        /* Reload the page upon message from the worker */
        worker.onmessage = function (eevent) {
            console.log("Result for " + fileNameForDifferentialTesting + " is " + eevent.data.result + " from " + userAgent);
            delete eevent.data.state;
            var pattern = new RegExp("error");
            /*if (pattern.test(eevent.data.result.toLowerCase())) {
                // eevent.data.result = executeOutofWebWorker(code);
            }*/
            sendResultReloadPage(eevent.data, fileNameForDifferentialTesting);
        };

        worker.postMessage("Send me results..."); // send a message to the worker (The content of the message does not matter)
        /* Kill the worker if it does not return in 5 seconds. Then reload the page and get the next code */
        setTimeout(function () {
            worker.terminate();
            worker = null;
            console.log("Killing the worker. It timed out...");
            var errobj = {result: "Timed-out", isCrashing: false};
            sendResultReloadPage(errobj, fileNameForDifferentialTesting);
        }, 5000);
    }

    function executeOutofWebWorker(code, fileNameForDifferentialTesting) {
        return eval(code);
    }

    function ajaxFailed(xhr, textStatus, errorThrown) {
        if (xhr.readyState === 0 || xhr.status === 0)
            console.log("ajax failed due to unload");
        else
            console.log("ajax failed: " + textStatus + " -- " + errorThrown);
    }

    function pollForCode() {
        console.log("Polling for code");
        $.ajax({
            url: "getCode",
            success: executeCode,
            error: ajaxFailed,
            dataType: "json",
            timeout: pollTimeout,
            complete: function (xhr, textStatus) {
                if (textStatus === "timeout")
                    setTimeout(pollForCode, 0);
            }
        });
    }

    function sendResultReloadPage(executionResult, filename) {
        $.post("reportResult", {
            result: executionResult,
            fileName: filename
            //library: "nil"
        }, function () {
            console.log("Reloading..");
            document.location.reload(true);
        });
    }

    $(document).ajaxError(function (evt, xhr, settings, error) {
        console.log("ajax error: " + evt + " -- " + error);
    });

    pollForCode();

})();