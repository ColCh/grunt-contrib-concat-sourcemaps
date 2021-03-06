/*
 * grunt-contrib-concat
 * http://gruntjs.com/
 *
 * Copyright (c) 2013 "Cowboy" Ben Alman, contributors
 * Licensed under the MIT license.
 */

'use strict';

exports.init = function(grunt) {
  var exports = {};

  // Node first party libs
  var path = require('path');

  // Third party libs
  var chalk = require('chalk');
  var SourceMapConsumer = require('source-map').SourceMapConsumer;
  var SourceMapGenerator = require('source-map').SourceMapGenerator;
  var SourceNode = require('source-map').SourceNode;

  // Return an object that is used to track sourcemap data between calls.
  exports.helper = function(files, options) {
    // Figure out the source map destination.
    var dest = files.dest;
    if (options.sourceMapStyle === 'inline') {
      // Leave dest as is. It will be used to compute relative sources.
    } else if (typeof options.sourceMapName === 'string') {
      dest = options.sourceMapName;
    } else if (typeof options.sourceMapName === 'function') {
      dest = options.sourceMapName(dest);
    } else {
      dest = dest + '.map';
    }

    // Inline style and sourceMapName together doesn't work
    if (options.sourceMapStyle === 'inline' && options.sourceMapName) {
      grunt.log.warn(
        'Source map will be inlined, sourceMapName option ignored.'
      );
    }

    return new SourceMapConcatHelper({
      files: files,
      dest: dest,
      options: options
    });
  };

  function SourceMapConcatHelper(options) {
    this.files = options.files;
    this.dest = options.dest;
    this.options = options.options;

    // Create the source map node we'll add concat files into.
    this.node = new SourceNode();

    // Create an array to store source maps that are referenced from files
    // being concatenated.
    this.maps = [];
  }

  // Add some arbitraty text to the sourcemap.
  SourceMapConcatHelper.prototype.add = function(src) {
    this.node.add(src);
  };

  // Add the lines of a given file to the sourcemap. If in the file, store a
  // prior sourcemap and return src with sourceMappingURL removed.
  SourceMapConcatHelper.prototype.addlines = function(src, filename) {
    var lines = src.split(grunt.util.linefeed);

    var relativeFilename = path.relative(path.dirname(this.dest), filename).replace(/\\/g, '/');;

    if(this.options.prefix) {
      for (var prefixCounter = 0; prefixCounter < this.options.prefix; prefixCounter++) {
        relativeFilename = relativeFilename.substring(relativeFilename.indexOf('/') + 1);
      }
    }

    src = lines.map(function(line, j) {
      // Add back a linefeed to all but the last line.
      if (j < lines.length - 1) {
        line += grunt.util.linefeed;
      }

      if (
        /\/\/[@#]\s+sourceMappingURL=(.+)/.test(line) ||
          /\/\*#\s+sourceMappingURL=(\S+)\s+\*\//.test(line)
      ) {
        var sourceMapFile = RegExp.$1;
        var sourceMapPath;

        var sourceContent;
        // Browserify, as an example, stores a datauri at sourceMappingURL.
        if (/data:application\/json;base64,([^\s]+)/.test(sourceMapFile)) {
          // Set sourceMapPath to the file that the map is inlined.
          sourceMapPath = filename;
          sourceContent = new Buffer(RegExp.$1, 'base64').toString();
        } else {
          if (path.resolve(sourceMapFile) === sourceMapFile) {
            sourceMapPath = sourceMapFile;
          } else {
            // Set sourceMapPath relative to file that is refering to it.
            sourceMapPath = path.join(path.dirname(filename), sourceMapFile);
          }
          sourceContent = grunt.file.read(sourceMapPath);
        }
        var sourceMap = JSON.parse(sourceContent);
        // Store the sourceMap so that it may later be consumed.
        this.maps.push([
          new SourceMapConsumer(sourceMap),
          relativeFilename,
          // Consider the relative path from source files to new sourcemap.
          path.relative(path.dirname(this.dest), path.dirname(sourceMapPath))
        ]);
        // Remove the old sourceMappingURL.
        line = line.replace(/[@#]\s+sourceMappingURL=[^\s]+/, '');
      }

      this.node.add(new SourceNode(j + 1, 0, relativeFilename, line));
      return line;
    }, this).join('');

    if (this.options.sourceMapStyle !== 'link') {
      this.node.setSourceContent(relativeFilename, src);
    }

    return src;
  };

  // Return the comment sourceMappingURL that must be appended to the
  // concatenated file.
  SourceMapConcatHelper.prototype.url = function() {
    // Create the map filepath. Either datauri or destination path.
    var mapfilepath;
    if (this.options.sourceMapStyle === 'inline') {
      var inlineMap = new Buffer(this._write()).toString('base64');
      mapfilepath = 'data:application/json;base64,' + inlineMap;
    } else {
      // Compute relative path to source map destination.
      mapfilepath = path.relative(path.dirname(this.files.dest), this.dest);
    }
    // Create the sourceMappingURL.
    var url;
    if (/\.css$/.test(this.files.dest)) {
      url = '\n/*# sourceMappingURL=' + mapfilepath + ' */';
    } else {
      url = '\n//# sourceMappingURL=' + mapfilepath;
    }

    return url;
  };

  // Return a string for inline use or write the source map to disk.
  SourceMapConcatHelper.prototype._write = function() {
    var code_map = this.node.toStringWithSourceMap({
      file: path.relative(path.dirname(this.dest), this.files.dest)
    });
    // Consume the new sourcemap.
    var generator = SourceMapGenerator.fromSourceMap(
      new SourceMapConsumer(code_map.map.toJSON())
    );
    // Consume sourcemaps for source files.
    this.maps.forEach(Function.apply.bind(generator.applySourceMap, generator));
    // New sourcemap.
    var newSourceMap = generator.toJSON();
    // Return a string for inline use or write the map.
    if (this.options.sourceMapStyle === 'inline') {
      grunt.log.writeln(
        'Source map for ' + chalk.cyan(this.files.dest) + ' inlined.'
      );
      return JSON.stringify(newSourceMap, null, '');
    } else {
      if (this.options.sourceRoot) {
        newSourceMap.sourceRoot = this.options.sourceRoot;
      }
      grunt.file.write(
        this.dest,
        JSON.stringify(newSourceMap, null, '')
      );
      grunt.log.writeln('Source map ' + chalk.cyan(this.dest) + ' created.');
    }
  };

  // Non-private function to write the sourcemap. Shortcuts if writing a inline
  // style map.
  SourceMapConcatHelper.prototype.write = function() {
    if (this.options.sourceMapStyle !== 'inline') {
      this._write();
    }
  };

  return exports;
};
