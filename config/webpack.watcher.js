const webpack = require('webpack');
const chokidar = require('chokidar');
const decache = require('decache');
const fs = require('fs');

function WebpackWatcher(config) {
  this.webpackConfigFile = config.webpackConfigFile;
  this.basePath = config.basePath;
  this.writeErrorFile = config.writeErrorFile;
  this.watchFolders = config.watchFolders;
  this.watchFiles = config.watchFiles;
  this.onCompile = config.onCompile;

  this.webpackWatcher = null;
  this.chokidarWatcher = null;
}

WebpackWatcher.prototype.start = function start() {
  this.chokidarWatcher = chokidar.watch([...this.watchFolders, ...this.watchFiles], {
    cwd: this.basePath,
    ignored: /[\/]\./,
    ignoreInitial: true,
  });

  // Watches for add/delete files
  this.chokidarWatcher
    .on('add', this.restart.bind(this))
    .on('unlink', this.restart.bind(this))
    .on('change', (path) => { if (this.watchFiles.findIndex(f => f === path) !== -1) this.restart(); })
  ;

  this.webpackWatcher = this.getCompiler().watch(undefined, this.handleCompiledResponse.bind(this));
};

WebpackWatcher.prototype.stop = function stop() {
  return new Promise((resolve) => {
    this.chokidarWatcher.close();
    this.webpackWatcher.close(resolve);
  });
};

WebpackWatcher.prototype.restart = function restart() {
  console.log('Restarting webpack...'); // eslint-disable-line no-console
  this.stop().then(this.start.bind(this));
};

WebpackWatcher.prototype.handleCompiledResponse = function handleCompiledResponse(err, stats) {
  const errorFile = `${this.basePath}/${this.writeErrorFile}`;
  const output = this.formatOutput(stats, err);

  if (this.onCompile) {
    this.onCompile(output);
  }

  // Dumps errors and warnings to a file
  if (stats.hasErrors() || stats.hasWarnings()) {
    fs.writeFile(errorFile, output.messages.join('\n'));
  } else {
    // Delete the webpack-error file if it exist
    fs.access(errorFile, fs.constants.F_OK, (fsErr) => { if (!fsErr) { fs.unlink(errorFile); } });
  }

  // Exit if it's a fatal error
  if (err) {
    process.exit(1);
  }
};

WebpackWatcher.prototype.formatOutput = function formatOutput(stats, err) {
  const resultObject = { messages: [], time: null };

  if (err) {
    resultObject.messages = [err.stack || err]; // eslint-disable-line no-console
    if (err.details) {
      resultObject.messages.push(err.details); // eslint-disable-line no-console
    }

    return resultObject;
  }

  resultObject.time = stats.toJson({
    context: this.basePath,
    hash: false,
    version: false,
    timings: true,
    assets: false,
    chunks: false,
    chunkModules: false,
    modules: false,
    children: false,
    cached: false,
    reasons: false,
    source: false,
    errorDetails: false,
    chunkOrigins: false,
  }).time;

  if (stats.hasWarnings()) {
    resultObject.messages.push(stats.toString('minimal'));
  }

  if (stats.hasErrors()) {
    resultObject.messages.push(stats.toString({
      context: this.basePath,
      colors: true,
      hash: false,
      version: false,
      timings: false,
      assets: false,
      chunks: false,
      chunkModules: false,
      modules: false,
      children: false,
      cached: false,
      reasons: false,
      source: false,
      errorDetails: false,
      chunkOrigins: false,
    }));
  }

  return resultObject;
};

WebpackWatcher.prototype.getCompiler = function getCompiler() {
  const configFile = `${this.basePath}/${this.webpackConfigFile}`;
  decache(configFile);
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return webpack(require(configFile));
};

module.exports = WebpackWatcher;
