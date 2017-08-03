const createFunctionObject = function(serverlessFunction) {
    const splitHandler =  serverlessFunction.handler.split(".");
    const file = splitHandler[0];
    const exportedFunction = splitHandler[1];
    return {
        file,
        exportedFunction,
    };
}

const extractHandlerObject = function(serverlessFunctions, specifiedFunction) {
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

module.exports = {
    extractHandlerObject,
};