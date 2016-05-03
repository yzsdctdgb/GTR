// Author: Michael Pradel

/**
 * Takes a piece of JS code, instruments it with Jalangi, and
 * appends the outcome of the execution (= a summary of all computed
 * values) as the final expression.
 */
(function () {

    var jalangi = require("../jalangi2/src/js/utils/api");

    var engineStateVarName = "__diffTestingEngineState__";
    var endOfCodeMarker = "__diffTestingEndOfCode__";

    /* jshint multistr: true */
    var template = '__diffTestingEngineState__ = { state: [], result: "noResultYet", isCrashing: false };\
    var print = function (ip) {\n\
        return console.log(ip);\
    };\
    var alert = function(ip) {\
        return console.log(ip);\
    };\
    var uneval = function(code) {\
        return code;\
    };\
    try {\
        CODE\
    } catch (e) {\
        __diffTestingEngineState__.isCrashing=true;\
        if (e instanceof TypeError) {\
            __diffTestingEngineState__.result = "TypeError";\
        } else if (e instanceof RangeError) {\
            __diffTestingEngineState__.result = "RangeError";\
        } else if (e instanceof EvalError) {\
            __diffTestingEngineState__.result = "EvalError";\
        } else if (e instanceof ReferenceError) {\
            __diffTestingEngineState__.result = "ReferenceError";\
        }\
        else if (e instanceof URIError) {\
            __diffTestingEngineState__.result = "URIError";\
        }\
        else {\
            __diffTestingEngineState__.result = "crash";\
        }\
    } __diffTestingEngineState__.result;';

    function preProcess(code) {
        var instrumented = jalangi.instrumentString(code + "\n'" + endOfCodeMarker + "'");
        if (instrumented.instAST === undefined) return; // instrumentation failed; probably code is syntactically incorrect
        /* Using String.prototype.replace() will break if the insturmented code contains '$' which has special meaning */
        var transformedCode = template.split("CODE").join(instrumented.code);
        return transformedCode;
    }

    exports.preProcess = preProcess;

})();
