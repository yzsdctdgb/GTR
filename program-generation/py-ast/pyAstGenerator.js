// Author: Michael Pradel

(function() {
    var fs = require('fs');
    var child_process = require('child_process');

    // Information from: https://docs.python.org/2/library/ast.html
    // Some nodes have properties that must be an array
    var mandatoryArrayProperties = {
        Module:["body"],
        Interactive:["body"],
        Suite:["body"],
        FunctionDef:["body", "decorator_list"],
        ClassDef:["bases", "body", "decorator_list"],
        Delete:["targets"],
        Assign:["targets"],
        Print:["values"],
        For:["body", "orelse"],
        While:["body", "orelse"],
        If:["body", "orelse"],
        With:["body"],
        TryExcept:["body", "handlers", "orelse"],
        TryFinally:["body", "finalbody"],
        Import:["names"],
        ImportFrom:["names"],
        Global:["names"],
        BoolOp:["values"],
        Dict:["keys", "values"],
        Set:["elts"],
        ListComp:["generators"],
        SetComp:["generators"],
        DictComp:["generators"],
        GeneratorExp:["generators"],
        Compare:["ops", "comparators"],
        Call:["args", "keywords"],
        List:["elts"],
        Tuple:["elts"],
        ExtSlice:["dims"],
        ExceptHandler:["body"],
        comprehension:["ifs"],
        arguments:["args", "defaults"]
    };
    // Nodes that are empty but not primitives
    var emptyNodeNames = [
        "Pass",
        "Break",
        "Continue",
        "Dict",
        "Load",
        "Store",
        "Del",
        "AugLoad",
        "AugStore",
        "Param",
        "Ellipsis",
        "And",
        "Or",
        "Add",
        "Sub",
        "Mult",
        "Div",
        "Mod",
        "Pow",
        "LShift",
        "RShift",
        "BitOr",
        "BitXor",
        "BitAnd",
        "FloorDiv",
        "Invert",
        "Not",
        "UAdd",
        "USub",
        "Eq",
        "NotEq",
        "Lt",
        "LtE",
        "Gt",
        "GtE",
        "Is",
        "IsNot",
        "In",
        "NotIn"
    ];

    /**
     * Converts a tree to code.
     *
     * @param {Node} tree the tree
     * @returns {String|Error} the code or the caught exception.
     */
    function treeToCode(tree) {
        var obj = tree.createObj("ast_type", emptyNodeNames, mandatoryArrayProperties);
        //console.log(JSON.stringify(obj, null, 2));
        var json = JSON.stringify(obj);
        var result = child_process.spawnSync("python2.7", ["unparse.py"], {
            encoding: 'utf8',
            cwd: '../program-generation/py-ast',
            input: json,
            //shell: true,
            //timeout: 500,
            //killSignal: 'SIGKILL'
        });
        //console.log(result);
        return result.stdout;
    }

    // Just to be compatible with the previous archticture... (jsAstGenerator)
    function treeToCodeNoFileIO(tree) {
        return treeToCode(tree);
    }

    exports.treeToCode = treeToCode;
    exports.treeToCodeNoFileIO = treeToCodeNoFileIO;

})();
