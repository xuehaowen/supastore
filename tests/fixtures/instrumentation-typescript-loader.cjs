const ts = require("typescript");

// Exercise webpack's runtime branching without depending on the native SWC binary.
module.exports = function (source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
};
