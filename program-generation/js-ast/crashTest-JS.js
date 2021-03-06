/**
 * Created by Jibesh Patra on 11 March, 2016.
 * Time: 17:31
 */
(function () {
    "use strict";
    var config = require("../config").config;
    var fs = require('fs');
    var child_process = require('child_process');
    var tmp = require('tmp');

    /**
     * Tests if a randomly generated program crashes in node.
     *
     * @param {string} filename - The filename to crash test on
     * @param {string} directory - The path of file that needs to be crash tested
     * @returns {string} 'pass' if the crash test passes, 'fail' other-wise
     * */
    function crashTestJS(filename, directory) {
        let nodePath = config.nodePath;
        let test_result = "pass";

        /* Check if node exists */
        if (!fs.existsSync(nodePath)) {
            console.error("Could not crash test, node not found in " + nodePath);
            test_result = "fail"; // Should we report the result as false, if node is not found?
        } else {
            let file = " " + directory + "/" + filename;
            let executableProgram = nodePath + file;
            try {
                /* FIXME node is not terminating for infinite loops even after the parent process terminates. */
                child_process.execSync(executableProgram, {
                    timeout: 2000,
                    stdio: 'pipe',
                    shell: true,
                    killSignal: 'SIGKILL'
                });

            } catch (err) {
                test_result = "fail";
            }
        }
        return test_result;
    }

    /**
     * Executes a piece of code in a child instance of node.js. Return the process result.
     * @param {string} code the code to execute
     * @returns {object} the result of child_process.spawnSync. Or, if node was not found, an object with
     *      {@code name:"NodeNotFound"} and an additional message property.
     */
    function crashTestJSCode(code) {
        let nodePath = config.nodePath;

        // Check if node exists
        if (!fs.existsSync(nodePath)) {
            console.error("Could not crash test, node not found in " + nodePath);
            return {name:"NodeNotFound", status:1, message:"Could not crash test, node not found in " + nodePath};
        } else {
            // Write the code to a temporary file (will be removed by library)
            let file = tmp.fileSync();
            fs.writeFileSync(file.name, code);
            // Return the result of spawning a child process
            return child_process.spawnSync(nodePath, [file.name], {
                encoding: 'utf8',
                shell: false,
                timeout: 500,
                killSignal: 'SIGKILL'
            });
        }
    }

    exports.crashTestJS = crashTestJS;
    exports.crashTestJSCode = crashTestJSCode;
})();