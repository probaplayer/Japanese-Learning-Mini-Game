import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFiles = fs.readdirSync(__dirname)
  .filter(file => file.endsWith('.test.js'))
  .sort();

let failed = false;

testFiles.forEach(file => {
  const fullPath = path.join(__dirname, file);
  const result = spawnSync(process.execPath, [fullPath], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.status !== 0) failed = true;
});

if (failed) process.exit(1);
console.log(`${testFiles.length} test files passed`);
