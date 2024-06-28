import fs from 'fs';

function noTypeScript(src: string, dest: String) {
  return !src.endsWith(".ts");
}

const source = process.argv[2];
const target = process.argv[3];
fs.cpSync(source, target, { recursive: true, filter: noTypeScript });
