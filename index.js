const bstProxy = require("./bstCommand").bstProxy;
const bstInterface = require("./bstInterface");

class ServerlessPlugin {
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;

        this.commands = {
            proxy: {
                usage: 'Plugin to call bespoken bst lambda service',
                lifecycleEvents: [
                    'start',
                 ],
            },
        };

        this.hooks = {
            'before:proxy:start': this.beforeProxyStart.bind(this),
            'proxy:start': this.proxyStart.bind(this),
        };
    }

    beforeProxyStart() {
        try {
            const handlerFunction = bstInterface.extractHandlerObject(this.serverless.service.functions);
            const servicePath = this.serverless.config.servicePath;
            bstInterface.createInterfaceFile(servicePath, handlerFunction);
        } catch (error) {
            this.serverless.cli.log("Unable to create an interface to be able to run the proxy.");
        }
    }

    proxyStart() {
        bstProxy(["lambda", "bespoken-interface.js"]);
    }
}

module.exports = ServerlessPlugin;
