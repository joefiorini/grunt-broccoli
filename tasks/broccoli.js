module.exports = function(grunt) {
  var broccoli = require('broccoli');
  var chain = require('connect-chain');
  var http = require('http');
  var broccoliMiddleware = require('broccoli/lib/middleware');
  var proxy = require('proxy-middleware');
  var url = require('url');
  var Watcher = require('broccoli/lib/watcher');
  var path = require('path');
  var rimraf = require('rimraf');
  var helpers = require('broccoli-kitchen-sink-helpers');
  var copyRecursivelySync = helpers.copyRecursivelySync;
  var connect = require('connect');

  grunt.registerMultiTask('broccoli', 'Execute Custom Broccoli task', broccoliTask);

  function broccoliTask() {
    var options = this.options({ middleware: null, host: 'localhost', port: 4200 });
    var config = options.config;
    var tree;

    process.env['BROCCOLI_ENV'] = this.data.env || 'development';

    if (typeof config === 'function') {
      tree = config();
    } else if (typeof config === 'string' || typeof config === 'undefined') {
      var configFile = config || 'Brocfile.js';
      var configPath = path.join(process.cwd(), configFile);
      try {
        tree = require(configPath);
      } catch(e) {
        grunt.fatal("Unable to load Broccoli config file: " + e.message);
      }
    }

    var command = this.args[0];

    var builder = new broccoli.Builder(tree);

    if (command === 'build') {
      var dest = options.dest;

      if (!dest) {
        grunt.fatal('You must specify a destination folder, eg. `dest: "dist"`.');
      }
      var done = this.async();

      builder.build()
        /**
         * As of Broccoli 0.10.0, build() returns { directory, graph }
         */
        .then(function(output) {
          // TODO: Don't delete files outside of cwd unless a flag is set.
          rimraf.sync(dest);
          copyRecursivelySync(output.directory, dest);
        })
        .then(done, function (err) {
          grunt.log.error(err);
        });
    } else if (command === 'serve') {
      var host = options.host;
      var port = options.port;
      var watcher = new Watcher(builder);
      var middleware = chain(broccoliMiddleware(watcher));

      if(options.proxy) {
        var urlopts = url.parse(options.proxy);
        grunt.log.writeln('Proxying to ' + options.proxy + '\n');
        middleware = chain(middleware, proxy(urlopts));
      }

      var app = connect().use(middleware);
      var server = http.createServer(app);

      watcher.on('change', function(results) {
        grunt.log.writeln('Built - ' + Math.round(results.totalTime / 1e6) + ' ms');
      });

      watcher.on('error', function(err) {
        grunt.log.error('Built with error:');
        // Should also show file and line/col if present; see cli.js
        if (err.file) {
          grunt.log.error('File: ' + err.file);
        }
        grunt.log.error(err.stack);
        grunt.log.error('');
      });

      this.async();
      server.listen(port, host);
    } else {
      grunt.fatal('You must specify either the :build or :serve command after the target.');
    }

  }

};
