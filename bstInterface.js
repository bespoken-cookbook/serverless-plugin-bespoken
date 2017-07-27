const fs = require("fs");
const path = require("path");

const extractHandlerObject = function(serverlessFunctions, specifiedFunction) {
    // We use the first function that provides a handler
    for (const key in serverlessFunctions) {
        const sFunction = serverlessFunctions[key];
        // If the handler Function is specified only validate for it
        if (specifiedFunction && specifiedFunction !== key) {
            continue;
        }
        if (!sFunction.handler) {
            continue;
        }
        const splitHandler =  sFunction.handler.split(".");
        const file = splitHandler[0];
        const exportedFunction = splitHandler[1];
        return {
            file,
            exportedFunction,
        };
    }

    throw new Error("No available function found");
};

const createInterfaceFile = function(localPath, { file, exportedFunction}) {
    const configBuffer = Buffer.from("exports.handler = require(\"./"+ file +"\")." + exportedFunction + ";");
    fs.writeFileSync(path.join(localPath, "bespoken-interface.js"), configBuffer);
};

module.exports = {
    extractHandlerObject,
    createInterfaceFile,
};