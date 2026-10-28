// Node built-ins without @types/node (the app's tsconfig has no Node types)
declare const require: (id: string) => any;
declare const __dirname: string;
declare const process: { platform: string; exit(code: number): never };
const { readdirSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

/**
 * `npm test`: runs every scripts/test_*.ts suite with tsx and stops with a failure code when
 * one of them fails. Each suite prints its own RESULTS line.
 */
const suites = readdirSync(__dirname)
  .filter((f: string) => /^test_.*\.ts$/.test(f))
  .sort();

const failed: string[] = [];
for (const suite of suites) {
  const run = spawnSync('npx', ['tsx', join(__dirname, suite)], { encoding: 'utf8', shell: process.platform === 'win32' });
  const summary = String(run.stdout || '')
    .split('\n')
    .find((l: string) => l.startsWith('RESULTS')) || 'no RESULTS line';
  console.log(`${run.status === 0 ? '✅' : '❌'} ${suite.padEnd(28)} ${summary.trim()}`);
  if (run.status !== 0) {
    failed.push(suite);
    console.log(String(run.stdout || '').split('\n').filter((l: string) => l.includes('FAIL')).join('\n'));
    if (run.stderr) console.log(run.stderr);
  }
}

console.log(failed.length ? `\n${failed.length} suite(s) failed: ${failed.join(', ')}` : `\nAll ${suites.length} suites passed.`);
process.exit(failed.length ? 1 : 0);
