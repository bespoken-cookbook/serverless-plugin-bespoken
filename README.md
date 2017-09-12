# Bespoken Serverless Framework Plugin

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

A [serverless](http://www.serverless.com) plugin using [bespoken](https://bespoken.io) proxy to test your work without deploying.

If you have to deploy your work everytime you are making changes, this tool will help you reduce that time. We generate a local server
that is a attached to a proxy online so that you can use that url to access the functionality that you have in your code in your laptop.
# What Does This Do?
The `bst proxy` service makes your local AWS Lambda available to debug and test via public URL. And though the URL is public, it is unique to you, and known only to you.

It is great for developing and testing:
* Webhooks
* Callbacks
* Anything where you want to try out your Lambda locally before deploying it

It creates a unique public URL through which you can access it. Once installed, all you need to access it is:
```bash
sls proxy
```

You can now send and receive data to your locally running Lambda! Here is a demo of in action using Postman:

[![serverless Plugin](/ServerlessPluginDemo.gif)](/ServerlessPluginDemo.gif)

More detailed info on how the proxy works can be [found here](http://docs.bespoken.io/en/latest/tutorials/tutorial_lambda_local/).
# Install

```
npm install serverless-plugin-bespoken --save-dev
```

Add the plugin to your `serverless.yml` file:
```yaml
plugins:
  - serverless-plugin-bespoken
```

You're set! The plugin will run by using `sls proxy`.

Now you can use the generated url and access directly to your local server.
