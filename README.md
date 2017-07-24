# Bespoken Serverless Framework Plugin

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

A [serverless](http://www.serverless.com) plugin to test your work without deploying with [bespoken tools](https://bespoken.tools).

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