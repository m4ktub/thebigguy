import { globalExternals } from "@fal-works/esbuild-plugin-global-externals";
import * as esbuild from 'esbuild';
import os from 'os';
import ts from 'typescript';

const entry = process.argv[2];

//
// check types through TypeScript compilation
//

const program = ts.createProgram([ entry ], {
  noEmit: true,
  esModuleInterop: true,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020
});

const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length > 0) {
  const diagnosticsText = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file,
    getNewLine: () => os.EOL,
    getCurrentDirectory: () => process.cwd(),
  });

  console.log(diagnosticsText);
  process.exit(1);
}

//
// produce JS bundle with esbuild
//

const globals = {
  jquery: "$",
  // short circuit unused import with potential side-effects
  "./database": {
    varName: "{ storeContract: 0 }",
    namedExports: [ "storeContract" ]
  }
};

esbuild.build({
  entryPoints: [ entry ],
  bundle: true,
  target: [ "es2020" ],
  outfile: "dist/src/frontend/js/bundle.js",
  plugins: [ globalExternals(globals) ],
  // ensure that browser version are used, and remove unused server code
  platform: 'browser',
  treeShaking: true,
  // needed for a correct resolution of the wasm file, based on import.meta
  format: 'esm'
});
