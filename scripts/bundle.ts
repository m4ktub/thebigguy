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
  target: ts.ScriptTarget.ES2016
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
  jquery: "$"
};

esbuild.build({
  entryPoints: [ entry ],
  bundle: true,
  target: [ "es2016" ],
  outfile: "dist/src/frontend/js/bundle.js",
  plugins: [ globalExternals(globals) ]
});
