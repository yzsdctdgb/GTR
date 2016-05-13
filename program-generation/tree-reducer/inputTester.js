// Author: Satia Herfert

(function() {
    var config = require("./../config").config;
    var crashTester = require("../js-ast/crashTest-JS");
    var syntaxTester = require("../js-ast/validityCheck-JS");
    var treeGenerator = require("../" + config.treeGenerator);

    /**
     * A generalized tester for some kind of testable input.
     */
    class Tester {
        /**
         *
         * @param {function(string) : string} testMethod A method that executes the input and returns
         *      an error message obtained from the execution.
         * @param initialInput the input for an initial execution to obtain an error message to compare with
         */
        constructor(testMethod, initialInput) {
            this.testMethod = testMethod;
            // Run the initial code and save error message
            this.errorMessage = testMethod(initialInput);
            console.log("Error obtained: " + this.errorMessage);
        }

        /**
         * Tests an input by executing it and comparing the error to the error obtained in the initial execution.
         * @param {string} input the input to execute
         * @returns {string} "pass" if the input runs without exception, "fail" if the input reproduces the same
         *      error as in the initial execution, "?" if another error is produced.
         */
        test(input) {
            var errmsg = this.testMethod(input);
            console.log("Error obtained: " + errmsg);
            if(errmsg == this.errorMessage) {
                // The same error is triggered
                return "fail";
            } else if(!errmsg) {
                // The program runs fine
                return "pass";
            } else {
                // A different error is triggered
                return "?";
            }
        }
    }

    /**
     * Tester for trees that can be converted to executable JavaScript code.
     */
    class JSTreeTester extends Tester {
        /**
         * @param initialInput the input for an initial execution to obtain an error message to compare with
         */
        constructor(initialInput) {
            super(testJSTreeWithChildProcess, initialInput);
        }
    }

    /**
     * Tests trees that can be converted to JavaScript code.
     * @param {string} tree the tree to test
     * @returns {string} the error message or {@code "" } if the code runs without exception.
     */
    function testJSTreeWithChildProcess(tree) {
        // First, try to convert the tree to code
        var code = treeGenerator.treeToCodeNoFileIO(tree);
        if(!code) {
            return "InvalidTree";
        }
        // Afterwards the usual test procedure for code
        return testJSWithChildProcess(code);
    }

    /**
     * Tester for exetubale JavaScript code.
     */
    class CodeTester extends Tester {
        /**
         * @param initialInput the input for an initial execution to obtain an error message to compare with
         */
        constructor(initialInput) {
            super(testJSWithChildProcess, initialInput);
        }
    }

    /**
     * Tests arbitrary code first with esprima for syntax errors and afterwards with node for runtime errors.
     * @param {string} code the code to test
     * @returns {string} the error message or {@code "" } if the code runs without exception.
     */
    function testJSWithChildProcess(code) {
        // First run a syntax check
        var err = syntaxTester.testValidityJSCode(code);
        if(err) {
            // There was a syntax error
            return err;
        }
        // Then actually execute the code
        var res = crashTester.crashTestJSCode(code);
        if(res.name === "NodeNotFound") {
            // Node was not found
            return res.name + ": " + res.message;
        }
        if(res.status == 0) {
            // It ran successfully - no error
            return "";
        } else {
            // Parse stderr and obtain the error message
            var lines = res.stderr.split('\n', 5);
            // Remove the empty line node generates for non-syntax errors (seriously, why!?)
            if(lines[3] === "") {
                lines.splice(3, 1);
            }
            // The third line in the array contains the error message
            return lines[3];
        }
    }

    /**
     * Runs arbitrary code in eval and returns the error, if any.
     * FIXME hangs if the code contains an endless loop.
     * FIXME can create global variables, in which case consecutive executions depend on previous ones
     * @param {string} code the code to execute
     * @returns {string} the error message or {@code "" } if the code runs without exception.
     */
    function testCodeWithTryCatchEval(code) {
        console.log("Testing:");
        console.log(code);
        try {
            eval(code);
        } catch(e) {
            return e.toString();
        }
        return "";
    }

    exports.CodeTester = CodeTester;
    exports.JSTreeTester = JSTreeTester;
})();