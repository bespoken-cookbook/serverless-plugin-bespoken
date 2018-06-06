import { BSTProxy } from "bespoken-tools";

// TODO: investigate additions to bespoken-tools api to make this reaching into internal api's unecessary ...?
import { Global } from "bespoken-tools/lib/core/global";
import { URLMangler } from "bespoken-tools/lib/client/url-mangler";
import { LoggingHelper } from "bespoken-tools/lib/core/logging-helper";
import { ModuleManager } from "bespoken-tools/lib/client/module-manager";
import { NodeUtil } from "bespoken-tools/lib/core/node-util";

import { homedir } from "os"

import {
  outputFileSync,
  copySync,
  removeSync,
  writeJsonSync,
  ensureDirSync
} from "fs-extra";
import { join } from "path";
import { watch } from "chokidar";
import { debounce } from "lodash";

/**
 * Monkey patch bespoken's NodeUtil.resetCache method to make it work with symlinks --
 * Due to limitations of serverless project, symlinks are often needed to share code between stacks --
 * allowing code reload to work with serverless projects that use symlinks is useful ...
 */
NodeUtil.resetCache = function () {
  // don't use a directory prefix when clearing require cache because the cache entry corresponds to
  // resolved filename -- if project uses symlinks the underlying file might be a path outside of project base directory
  // NOTE: this is true even if actual require(...) call refers to a path within project directory ...
  // let directory: string = process.cwd();
  for (const file of Object.keys(require.cache)) {
    // if (file.startsWith(directory) && file.indexOf("node_modules") === -1) {
    if (file.indexOf("node_modules") === -1) {
      delete require.cache[require.resolve(file)];
    }
  }
};

/**
Create a directory structure with passthru modules for each specified handler

Example: 
  buildPassThruModules(["foo/bar/baz.handler", "foo/bar/baz.otherhandler", "foo/been.handler"], "./someDirectory") 
Result:
  outputDirectory will contain files: 
    - foo/bar/baz.js
    - foo/been.handler
    - node_modules/bespoken-lambda-passthru/index.js

 * @param handlers array of function path specifications as used in serverless/lambda -- example: ["foo/bar/baz.handler"]
 * @param outputDirectory directory into which passthru stubs will be written
 */
const buildPassThruModules = (handlers: string[], outputDirectory: string) => {
  let modulesWithHandlers: { [index: string]: string[] } = {};

  for (const handler of handlers) {
    const [modulePath, handlerName] = handler.split(".");

    if (modulesWithHandlers[modulePath]) {
      modulesWithHandlers[modulePath].push(handlerName);
    } else {
      modulesWithHandlers[modulePath] = [handlerName];
    }
  }

  for (const modulePath in modulesWithHandlers) {
    const handlerNames = modulesWithHandlers[modulePath];
    // create a little shim which imports and re-exports the passthru handler with the correct handler name(s)
    const moduleContents = `
  const passThruModule = require("bespoken-lambda-passthru")
  ${handlerNames.map(handlerName => {
        return `exports.${handlerName} = passThruModule.passThruHandler
    `;
      })}
  `;

    // then write the passthru stub module to filesystem
    outputFileSync(join(outputDirectory, `${modulePath}.js`), moduleContents);
  }

  // copy the passthru implementation into node_modules/ directory (so it can be required from the created module stubs)
  copySync(
    join(__dirname, "injected_node_modules"),
    join(outputDirectory, "node_modules")
  );
};

const mutateProcessEnvironmentVariables = (vars: any) => {
  for (const key in vars) {
    process.env[key] = vars[key];
  }
  // filter out ridiculous number of npm_ env variables
  for (const key in process.env) {
    if (key.startsWith("npm_")) {
      delete process.env[key];
    }
  }
};

const extractHandlerObject = (
  serverlessFunctions: any,
  specifiedFunction: string | undefined
) => {
  // We use the first function that provides a handler
  let sFunction;

  if (specifiedFunction) {
    sFunction = serverlessFunctions[specifiedFunction];
    if (!sFunction || !sFunction.handler) {
      throw new Error("No available function found");
    }
  } else {
    for (const key in serverlessFunctions) {
      // If the handler Function is specified only validate for it
      if (!serverlessFunctions[key].handler) {
        continue;
      }
      sFunction = serverlessFunctions[key];
      break;
    }
  }

  if (!sFunction) {
    throw new Error("No available function found");
  }

  return createFunctionObject(sFunction);
};

const createFunctionObject = (serverlessFunction: { handler: string }) => {
  const splitHandler = serverlessFunction.handler.split(".");
  const file = splitHandler[0];
  const exportedFunction = splitHandler[1];
  return {
    file,
    exportedFunction
  };
};

type IServerlessPluginBespokenConfig = {
  ["serverless-plugin-bespoken"]?: {
    sourceID: string;
    secretKey: string;
  };
};

/**
 * Defines command:
 * - `serverless proxy`
 *    Initiates connection to public bespoken proxy so requests to public url are forwarded to local machine and starts
 *    a local server that responds to requests by dispatching to the appropriate lambda function.  Can be started in 'single function' mode which will dispatch requests to a single specified lambda
 *    or on '
 *
 *
 *
 * - `serverless deploy --inject-passthru`
 *   When --inject-passthru is passed on command line, the plugin will intercept the serverless package lifecycle and replace the deployed bundle with passthru lambda handlers
 *   that forward requests to the bespoken proxy server (and subsequently back to developer machine)
 */
export class ServerlessPluginBespoken {
  private serverless: any;
  private options: any;
  private proxy!: BSTProxy;
  private originalServicePath!: string;
  private passThruServicePath!: string;

  private get pluginConfig(): IServerlessPluginBespokenConfig | null {
    const pluginConfig = this.serverless.service.custom[
      "serverless-plugin-bespoken"
    ];
    if (pluginConfig) {
      return pluginConfig;
    }
    return null;
  }

  private get selectedFunctionFromCommandLine(): string | undefined {
    return this.options.function;
  }

  private get injectPassThruOption(): string | undefined {
    return this.options["inject-passthru"];
  }

  private get withPassThruRoutingOption(): string | undefined {
    return this.options["with-passthru-routing"];
  }

  private get functionsFromServerlessConfig(): any {
    return this.serverless.service.functions;
  }

  private get environmentVariablesFromServerlessConfig(): object {
    const env = this.serverless.service.provider.environment;
    if (env) {
      this.serverless.cli.log(
        "Configuring environment variables from serverless config"
      );
    } else {
      this.serverless.cli.log(
        "No Environment variables found in serverless config"
      );
    }
    return env || {};
  }

  private get handlers(): string[] {
    const handlers = this.serverless.service.functions || {};

    return Object.values(handlers).map((lambdaDefinition: any) => {
      return lambdaDefinition.handler;
    });
  }

  /**
   * Enable security if --secure option specified or if in pass-thru routing mode.
   */
  private get enableSecurity(): boolean {
    return (
      !(this.options.secure == null) ||
      !(this.withPassThruRoutingOption == null)
    );
  }

  public commands = {
    proxy: {
      usage: "Plugin to call bespoken bst lambda service",
      lifecycleEvents: ["start"],
      options: {
        function: {
          usage:
            "Specify the function in your config that you want to use" +
            '(e.g. "--function myFunction" or "-f myFunction")',
          required: false,
          shortcut: "f"
        },
        secure: {
          usage:
            "Make bespoken server to require that 'secure' token be specified -- used to reduce likelihood of arbitrary hosts contacting your service via the proxy server",
          required: false,
          shortcut: "s"
        },
        "with-passthru-routing": {
          usage:
            "Configure local proxy server to route requests to lambda functions based on url.  'function' option is ignored if this option is specified.  " +
            "This option would normally be enabled after deploying passthru's with `deploy-passthru`",
          required: false
        }
      }
    }
  };

  public get hooks() {
    return {
      "proxy:start": this.proxyStart,
      "before:package:createDeploymentArtifacts": this.deployPassThru,
      "after:package:createDeploymentArtifacts": this.injectPassThruModules
    };
  }

  constructor(serverless: any, options: any) {
    this.serverless = serverless;
    this.options = options;
  }

  loadBespokenPluginConfig = async () => {
    if (this.pluginConfig) {
      this.serverless.cli.log("Configuring bespoken to use parameters from serverless.yml")
      const directory = `${homedir()}/.bst`
      ensureDirSync(directory);
      writeJsonSync(`${directory}/config`, {
        ...this.pluginConfig,
        version: "1.0.7"
      }, { spaces: 2 });
    }

    // parse the bespoken config
    await Global.loadConfig();
  };

  proxyStart = async () => {
    // create the bespoken config file if properties are specified in serverless config
    await this.loadBespokenPluginConfig();

    // initialize the bespoken cli
    await Global.initializeCLI();

    // enable verbose logging
    LoggingHelper.setVerbose(true);

    // ensure environment variables from serverless config are set
    mutateProcessEnvironmentVariables(
      this.environmentVariablesFromServerlessConfig
    );

    // create the lambda proxy
    if (this.withPassThruRoutingOption == null) {
      // run local server in 'single function mode' -- all requests are dispatched to a single lambda specified either on command line or
      // by choosing first function from serverless config ...
      const handler = extractHandlerObject(
        this.functionsFromServerlessConfig,
        this.selectedFunctionFromCommandLine
      );
      this.serverless.cli.log(
        `Server configured in single function mode.Requests will resolve via: ${
        handler.file
        }: ${handler.exportedFunction}`
      );
      this.proxy = BSTProxy.lambda(handler.file, handler.exportedFunction);
    } else {
      this.serverless.cli.log(
        "Server configured with passthru routing.  Url of requests will be interpreted as serverless handler specifications and dispatched to lambda function based on filesystem path."
      );
      // run local server in 'directory mode' -- requests are dispatched to appropriate lambda by mapping url to filesystem path
      this.proxy = BSTProxy.lambda();
    }

    // enable secure mode if enabled
    if (this.enableSecurity) {
      this.proxy.activateSecurity();
    }

    // start the lambda proxy
    this.proxy.start(async () => {
      // HACK: reach into proxy and grab the moduleManager instance
      const moduleManager = (this.proxy as any).lambdaServer
        .moduleManager as ModuleManager;

      // stop watching with watcher that uses node's fs.watch and use chokidar instead to allow for recursive symlink traversal
      (moduleManager as any).watcher.close();

      const ignoreFunc = (filename: string) => {
        if (filename.indexOf("node_modules") !== -1) {
          return true;
        } else if (filename.endsWith("___")) {
          return true;
        } else if (filename.startsWith(".")) {
          return true;
        }
        return false;
      };

      (moduleManager as any).watcher = watch(process.cwd(), {
        ignored: [ignoreFunc],
        followSymlinks: true
      });

      (moduleManager as any).watcher.on(
        "all",
        debounce(
          function (this: ModuleManager) {
            LoggingHelper.info(
              "FileWatcher",
              "FS.Watch Event(s) Detected: Reloading project code."
            );

            // reload project's modules after change events
            (this as any).modules = {};
            (this as any).dirty = true;
          }.bind(moduleManager),
          500
        )
      );

      if (this.enableSecurity) {
        this.serverless.cli.log("Bespoken proxy started in secure mode");
        this.serverless.cli.log(process.cwd());
        this.serverless.cli.log(
          "The public URL for accessing your local service"
        );
        this.serverless.cli.log("");

        this.serverless.cli.log(
          URLMangler.manglePipeToPath(
            Global.config().sourceID(),
            Global.config().secretKey()
          )
        );
      } else {
        this.serverless.cli.log(
          "Bespoken proxy started in publically accessible mode"
        );
        this.serverless.cli.log(process.cwd());
        this.serverless.cli.log(
          "The public URL for accessing your local service"
        );
        this.serverless.cli.log("");

        this.serverless.cli.log(
          URLMangler.manglePipeToPath(Global.config().sourceID())
        );
      }
      this.serverless.cli.log("");
      this.serverless.cli.log(
        "The URL for viewing transaction history of requests/responses sent through the proxy service"
      );
      this.serverless.cli.log("");
      this.serverless.cli.log(
        URLMangler.mangleNoPath(
          Global.config().sourceID(),
          Global.config().secretKey()
        )
      );
    });
  };

  deployPassThru = async () => {
    await this.loadBespokenPluginConfig();

    this.serverless.cli.log("cli options", this.options);

    // do nothing if inject-passthru not passed on command line
    if (!this.injectPassThruOption) {
      return;
    }

    this.serverless.cli.log(
      "Replacing lambda handlers with bespoken passthru functions"
    );

    const bespokenProxyUrl = URLMangler.manglePipeToPath(
      Global.config().sourceID()
    );

    const bespokenProxySecret = Global.config().secretKey();

    // inject environment variables with necessary bespoken connection parameters into lambda environment
    this.mutateLambdaEnvironmentVariables({
      bespoken_proxy_url: bespokenProxyUrl,
      bespoken_proxy_secret: bespokenProxySecret
    });

    this.serverless.cli.log(
      `Pass through handlers will proxy requests to: ${bespokenProxyUrl}`
    );

    const handlers = this.handlers;

    // save directory where serverless expects to look for source files
    this.originalServicePath = this.originalServicePath
      ? this.originalServicePath
      : this.serverless.config.servicePath;

    // tell serverless to instead look in this directory for files to package
    this.passThruServicePath = join(this.originalServicePath, ".passthru");
    this.serverless.config.servicePath = this.passThruServicePath;

    // if some other packager has told serverless what functions to package ... -- undo their decision...
    const allFunctions = this.serverless.service.getAllFunctions();

    for (const functionName of allFunctions) {
      const functionObject = this.serverless.service.getFunction(functionName);

      if (functionObject.package) {
        this.serverless.cli.log(
          `serverless - plugin - bespoken-- resetting packaging for function ${functionName}`
        );
        functionObject.package = {};
      }
    }

    this.serverless.cli.log(
      `Replace modules with pass thru handlers: ${handlers} `
    );

    buildPassThruModules(handlers, this.passThruServicePath);

    // tell the packager to include only our package contents
    this.serverless.service.package.include = ["*"];
  };

  injectPassThruModules = () => {
    // do nothing if inject-passthru not passed on command line
    if (!this.injectPassThruOption) {
      return;
    }

    // copy contents of 'faked' zip artificat service path
    copySync(
      join(this.passThruServicePath, ".serverless"),
      join(this.originalServicePath, ".serverless")
    );

    removeSync(this.passThruServicePath);

    this.serverless.config.servicePath = this.originalServicePath;
  };

  mutateLambdaEnvironmentVariables = (vars: any) => {
    for (const key in vars) {
      this.serverless.service.provider.environment[key] = vars[key];
    }
  };
}
