import * as esbuild from 'esbuild';
import { globalExternals } from "@fal-works/esbuild-plugin-global-externals";

const entry = process.argv[2];

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
