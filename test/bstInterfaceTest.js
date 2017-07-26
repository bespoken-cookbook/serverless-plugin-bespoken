const assert = require("assert");
const bstInterface = require("../bstInterface")

describe("BSTInterface", function () {
    it("extracts handler correctly", function () {
        const mockFunctionsObject = {
            helloWorld: {
                handler: "handler.helloWorld",
            },
        };

        const result = bstInterface.extractHandlerObject(mockFunctionsObject);

        assert.equal(result.file, "handler");
        assert.equal(result.exportedFunction, "helloWorld");
    });

    it("extracts handler correctly when it's second", function () {
        const mockFunctionsObject = {
            randomFunction: {},
            helloWorld: {
                handler: "handler.helloWorld",
            },
        };

        const result = bstInterface.extractHandlerObject(mockFunctionsObject);

        assert.equal(result.file, "handler");
        assert.equal(result.exportedFunction, "helloWorld");
    });

    it("throws error if not function is found with handler", function () {
        const mockFunctionsObject = {
            helloWorld: {},
        };

        try {
            bstInterface.extractHandlerObject(mockFunctionsObject);
        } catch (error) {
            assert.equal(error.message, "No available function found");
        }
    });
});
