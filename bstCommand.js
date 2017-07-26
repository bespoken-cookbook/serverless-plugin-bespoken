const path = require("path");
const fs = require("fs");

const bstFile = "node_modules/bespoken-tools/bin/bst.js";
const serverlessPlugin = ".serverless_plugins/serverless-plugin-bespoken/";

const lookupBespokenFolder = function() {
    try {
        // this throws if file not accessible
        const npmAccess = path.join(".", bstFile);
        fs.accessSync(npmAccess);
        return npmAccess;
    } catch(error) {
        const pluginAccess = path.join(serverlessPlugin, bstFile);
        fs.accessSync(pluginAccess);
        return pluginAccess;
    }
}

const bstCommand = function(command, args) {
    const bstExec = lookupBespokenFolder();
    const extendedArgs = args.reduce((acc, arg) => {
        return acc + " " + arg;
    }, "");
    const completeCommand = "node " + bstExec + " " + command + extendedArgs;
    exec(completeCommand);
};

const bstProxy = function(args) {
    bstCommand("proxy", args);
};

module.exports = {
    bstCommand,
    bstProxy
};