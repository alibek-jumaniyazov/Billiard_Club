const { readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const result = spawnSync(process.execPath, [
  '--require', 'ts-node/register', '--test',
  ...readdirSync(__dirname).filter((file) => file.endsWith('.test.ts')).sort().map((file) => join(__dirname, file)),
], { cwd: resolve(__dirname, '..'), stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
