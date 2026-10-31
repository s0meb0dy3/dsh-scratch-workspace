import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const SOURCES = ['index.js', 'service.js', 'core.js', 'activity.js', 'user-api.js'];
const LOCK = `${here}build.lock.json`;

// Content hash of every host source. Timestamps are useless here: a fresh clone
// gives every file the same mtime, so ordering cannot prove anything.
async function sourceHash() {
  const hash = createHash('sha256');
  for (const name of [...SOURCES].sort()) {
    hash.update(name);
    hash.update('\0');
    hash.update(await readFile(`${here}${name}`));
    hash.update('\0');
  }
  return hash.digest('hex');
}

// `--check` never needs a bundler: it compares the committed fingerprint with the
// current sources, so publishing works on a machine without dev dependencies.
if (process.argv.includes('--check')) {
  const expected = await sourceHash();
  let locked = null;
  try {
    locked = JSON.parse(await readFile(LOCK, 'utf8')).sources;
  } catch {
    console.error('build.lock.json is missing: run `npm install && npm run build`.');
    process.exit(1);
  }
  try {
    await readFile(`${here}host.js`);
  } catch {
    console.error('host.js is missing: run `npm install && npm run build`.');
    process.exit(1);
  }
  if (locked !== expected) {
    console.error('host.js is stale: sources changed since the last build. Run `npm run build`.');
    process.exit(1);
  }
  console.log('host.js matches its sources (content hash).');
  process.exit(0);
}

let build;
try {
  ({ build } = await import('esbuild'));
} catch {
  console.error('esbuild is required to build host.js: run `npm install` first.');
  process.exit(1);
}

await build({
  entryPoints: [`${here}index.js`],
  outfile: `${here}host.js`,
  platform: 'node',
  format: 'esm',
  bundle: true,
  packages: 'external',
  target: 'node22',
});

// Written only after a successful bundle, so a failed build never claims freshness.
const sources = await sourceHash();
await writeFile(LOCK, `${JSON.stringify({ sources }, null, 2)}\n`);
console.log(`built host.js (sources ${sources.slice(0, 12)})`);
