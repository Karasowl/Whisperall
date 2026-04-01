/**
 * pre-dist.mjs — Validates that backend-bundle exists before building installer.
 * Run bundle:backend first if it doesn't exist.
 */
import fs from 'fs';
import path from 'path';

const BUNDLE = path.join(process.cwd(), 'backend-bundle');
const required = [
  'python-runtime/python.exe',
  'site-packages',
  'api/app/main.py',
  'api/.env',
];

if (!fs.existsSync(BUNDLE)) {
  console.error('\n[pre-dist] ERROR: backend-bundle/ does not exist.');
  console.error('  Run this first:  pnpm bundle:backend\n');
  process.exit(1);
}

for (const rel of required) {
  const full = path.join(BUNDLE, rel);
  if (!fs.existsSync(full)) {
    console.error(`\n[pre-dist] ERROR: Missing ${rel} in backend-bundle/`);
    console.error('  Run:  pnpm bundle:backend\n');
    process.exit(1);
  }
}

console.log('[pre-dist] backend-bundle/ verified OK');
