import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const SOURCES = ['index.js', 'service.js', 'core.js', 'activity.js', 'user-api.js'];

// `--check` never needs a bundler: it only proves the committed host.js is not
// older than its sources, so publishing works on a machine without dev deps.
if (process.argv.includes('--check')) {
  let newest = 0;
  let newestName = '';
  for (const name of SOURCES) {
    const info = await stat(`${here}${name}`);
    if (info.mtimeMs > newest) { newest = info.mtimeMs; newestName = name; }
  }
  let host;
  try {
    host = await stat(`${here}host.js`);
  } catch {
    console.error('host.js is missing: run `npm install && npm run build`.');
    process.exit(1);
  }
  if (host.mtimeMs < newest) {
    console.error(`host.js is older than ${newestName}: run \`npm run build\` before publishing.`);
    process.exit(1);
  }
  console.log('host.js is up to date with its sources.');
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
