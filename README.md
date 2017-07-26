# Bespoken Serverless Framework Plugin

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

A [serverless](http://www.serverless.com) plugin to test your work without deploying with [bespoken tools](https://bespoken.tools).

If you have to deploy your work everytime you are making changes, this tool will help you reduce that time. We generate a local server
that is a attached to a proxy online so that you can use that url to access the functionality that you have in your code in your laptop.

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