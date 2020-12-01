const { OriginalSource, SourceMapSource, ReplaceSource } = require('webpack-sources');

const path = require('path');

const { dirname, relative } = path;
const { runInNewContext } = require('vm');

/**
 * @param {*} loader
 * @param {RegExpExecArray} match
 * @param {string} code
 * @return {Promise<void>}
 */
function rewriteBindings(loader, match, code) {
  return new Promise((resolve, reject) => {
    loader.resolve(loader.context, 'bindings', (error, modulePath) => {
      if (error) return reject(error);

      try {
        const nodeModule = require(modulePath);

        const args = {
          bindings: runInNewContext(match[1], {
            __dirname: dirname(loader.resourcePath),
            __filename: loader.resourcePath,
            path,
          }),
          path: true,
          module_root: nodeModule.getRoot(loader.resourcePath),
        };

        const resolvePath = relative(dirname(loader.resourcePath), nodeModule(args)).replace(/\\/g, '/');
        code.replace(match.index, match.index + match[0].length - 1, `require('./${resolvePath}')`);
      } catch (err) {
        return reject(err);
      }

      return resolve();
    });
  });
}

/**
 * @param {*} loader
 * @param {RegExpExecArray} match
 * @param {string} code
 * @return {Promise<void>}
 */
function rewriteNodeGypBuild(loader, match, code) {
  return new Promise((resolve, reject) => {
    loader.resolve(loader.context, 'node-gyp-build', (error, modulePath) => {
      if (error) return reject(error);

      try {
        const nodeModule = require(modulePath);

        const args = runInNewContext(match[1], {
          __dirname: dirname(loader.resourcePath),
          __filename: loader.resourcePath,
          path,
        });

        const resolvePath = relative(dirname(loader.resourcePath), nodeModule.path(args)).replace(/\\/g, '/');
        code.replace(match.index, match.index + match[0].length - 1, `require('./${resolvePath}')`);
      } catch (err) {
        return reject(module_error);
      }

      return resolve();
    });
  });
}

module.exports = async function (source, map) {
  const callback = this.async();

  const bindingsRegex = /\brequire\((?:'bindings'|"bindings")\)\s*\(((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*)\)/g;
  const nodeGypBuildRegex = /\brequire\((?:'node-gyp-build'|"node-gyp-build")\)\s*\(((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*)\)/g;

  const code = new ReplaceSource(map
    ? new SourceMapSource(source, this.resourcePath, map)
    : new OriginalSource(source, this.resourcePath));

  try {
    while (match = bindingsRegex.exec(source)) await rewriteBindings(this, match, code);
    while (match = nodeGypBuildRegex.exec(source)) await rewriteNodeGypBuild(this, match, code);
  } catch (error) {
    return callback(error);
  }

  const loaderCode = code.sourceAndMap();
  return callback(null, loaderCode.source, loaderCode.map);
};
