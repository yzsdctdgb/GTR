(function () {

    var fs = require('fs');
    var jsonfile = require('jsonfile');
    var parser = require('ua-parser-js');

    function getFileState(dir, fileName, rawCode) {
        var resultFileName = fileName + "on"; // .js --> .json
        try {
            var res = jsonfile.readFileSync(dir + "/" + resultFileName);
            // Override some fields
            res.fileName = fileName;
            res.rawCode = rawCode;
            res.origSize = rawCode.length;
            res.userAgentToResults = {};
            res.testCode = undefined;
            res.diff = undefined;
            res.lastTested = undefined;

            return res;
        } catch(e) {
            return undefined;
        }
    }

    /**
     * Writes the result of the fileState into a json file in the given directory.
     * @param dir the directory where to place the file.
     * @param fileState the fileState to serialize.
     */
    function writeResult(dir, fileState) {
        fileState.lastTested = new Date().toLocaleString();
        fs.writeFileSync("last-read.txt", fileState.fileName);
        var resultFileName = fileState.fileName + "on"; // .js --> .json
        fs.writeFileSync(dir + "/" + resultFileName, JSON.stringify(fileState, 0, 2));
    }

    /**
     * Parses a user agent
     * @param userAgent
     * @returns {*}
     */
    function parsedUserAgent(userAgent) {
        var ua = parser(userAgent);
        var parsedUa = "-";
        if (ua) {
            if (ua.hasOwnProperty("browser")) {
                parsedUa = ua.browser.name + " ";
                parsedUa += ua.browser.version;
            }
            if (ua.hasOwnProperty("os")) {
                parsedUa = parsedUa + " (" + ua.os.name + ")";
            }
            return parsedUa;
        } else {
            return userAgent;
        }
    }

    exports.getFileState = getFileState;
    exports.writeResult = writeResult;
    exports.parsedUserAgent = parsedUserAgent;
})();