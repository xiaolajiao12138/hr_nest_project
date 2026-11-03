const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const files = readdirSync('src', { recursive: true }).filter(file => file.endsWith('.spec.ts')).map(file => join('src', file)).sort();
if (process.argv.includes('--list')) { console.log(files.join('\n')); process.exit(0); }
const result = spawnSync(process.execPath, ['--require', 'ts-node/register/transpile-only', '--test', '--test-concurrency=1', ...files], {
  stdio: 'inherit', env: { ...process.env, ...(process.argv.includes('--with-db') ? { RUN_DB_SECURITY_TEST: '1' } : {}) },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
