const bstProxy = require("./bstCommand").bstProxy;
const bstInterface = require("./bstInterface");

class ServerlessPluginBespoken {
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;

        this.commands = {
            proxy: {
                usage: 'Plugin to call bespoken bst lambda service',
                lifecycleEvents: [
                    'start',
                 ],
                options: {
                    function: {
                        usage:
                        'Specify the function in your config that you want to use'
                        + '(e.g. "--function myFunction" or "-f myFunction")',
                        required: false,
                        shortcut: 'f',
                    },
                },
            },
        };

        this.hooks = {
            'proxy:start': this.proxyStart.bind(this),
        };
    }

    proxyStart() {
        const handlerFunction =
            bstInterface.extractHandlerObject(this.serverless.service.functions, this.options.function);
        bstProxy(["lambda", handlerFunction.file + ".js", handlerFunction.exportedFunction]);
    }
}

module.exports = ServerlessPluginBespoken;
