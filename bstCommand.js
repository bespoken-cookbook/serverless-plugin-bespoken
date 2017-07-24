const bstExec = ".serverless_plugins/serverless-plugin-bespoken/node_modules/bespoken-tools/bin/bst.js";

bstCommand = function(command, args) {
    const extendedArgs = args.reduce((acc, arg) => {
        return acc + " " + arg;
    }, "");
    const completeCommand = "node " + bstExec + " " + command + extendedArgs;
    exec(completeCommand);
};

bstProxy = function(args) {
    bstCommand("proxy", args);
};

module.exports = {
    bstCommand,
    bstProxy
};