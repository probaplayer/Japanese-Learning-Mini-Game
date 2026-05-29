const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testsDir = __dirname;
const testFiles = fs.readdirSync(testsDir)
  .filter(file => file.endsWith('.test.js'))
  .sort();

let failed = false;

testFiles.forEach(file => {
  const fullPath = path.join(testsDir, file);
  const result = spawnSync(process.execPath, [fullPath], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    failed = true;
  }
});

if (failed) {
  process.exit(1);
}

console.log(`${testFiles.length} test files passed`);
