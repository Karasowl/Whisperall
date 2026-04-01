/**
 * bundle-backend.mjs
 *
 * Creates apps/desktop/backend-bundle/ with:
 *   python-runtime/  — embeddable Python (downloaded)
 *   site-packages/   — pip-installed API deps
 *   api/app/         — FastAPI application code
 *   api/.env         — environment variables
 *
 * Usage:  node scripts/bundle-backend.mjs
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const ROOT = path.resolve(process.cwd());
const API_DIR = path.resolve(ROOT, '..', '..', 'apps', 'api');
const BUNDLE = path.join(ROOT, 'backend-bundle');
const PY_VERSION = '3.11.9';
const PY_EMBED_URL = `https://www.python.org/ftp/python/${PY_VERSION}/python-${PY_VERSION}-embed-amd64.zip`;
const PY_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';

function log(msg) { console.log(`[bundle-backend] ${msg}`); }
function fatal(msg) { console.error(`[bundle-backend] FATAL: ${msg}`); process.exit(1); }

function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }

function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }

function copyDirSync(src, dest) {
  mkdirp(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

async function downloadFile(url, dest) {
  log(`Downloading ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) fatal(`HTTP ${res.status} downloading ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function extractZip(zipPath, destDir) {
  // Use PowerShell to extract (available on all Windows)
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${destDir}'"`,
    { stdio: 'inherit' }
  );
}

async function main() {
  // Validate
  const reqFile = path.join(API_DIR, 'requirements.txt');
  const envFile = path.join(API_DIR, '.env');
  const appDir = path.join(API_DIR, 'app');
  if (!fs.existsSync(reqFile)) fatal(`Missing ${reqFile}`);
  if (!fs.existsSync(envFile)) fatal(`Missing ${envFile}`);
  if (!fs.existsSync(appDir)) fatal(`Missing ${appDir}`);

  // Clean previous
  log('Cleaning previous bundle...');
  rmrf(BUNDLE);
  mkdirp(BUNDLE);

  const pyDir = path.join(BUNDLE, 'python-runtime');
  const siteDir = path.join(BUNDLE, 'site-packages');
  const apiDest = path.join(BUNDLE, 'api');

  // --- Step 1: Download embeddable Python ---
  log(`Downloading embeddable Python ${PY_VERSION}...`);
  const zipPath = path.join(BUNDLE, 'python-embed.zip');
  await downloadFile(PY_EMBED_URL, zipPath);
  mkdirp(pyDir);
  await extractZip(zipPath, pyDir);
  fs.unlinkSync(zipPath);

  // Enable site-packages by editing python311._pth
  const pthFiles = fs.readdirSync(pyDir).filter(f => f.endsWith('._pth'));
  for (const pth of pthFiles) {
    const pthPath = path.join(pyDir, pth);
    let content = fs.readFileSync(pthPath, 'utf8');
    // Uncomment import site and add our site-packages + api dir
    content = content.replace(/^#\s*import site/m, 'import site');
    // Add relative paths to our site-packages and api dir (for "from app.xxx" imports)
    content += '\n..\\site-packages\n..\\api\n';
    fs.writeFileSync(pthPath, content);
    log(`Patched ${pth} to enable site-packages`);
  }

  // --- Step 2: Install pip into embeddable Python ---
  const pyExe = path.join(pyDir, 'python.exe');
  if (!fs.existsSync(pyExe)) fatal(`python.exe not found in ${pyDir}`);

  const getPipPath = path.join(BUNDLE, 'get-pip.py');
  await downloadFile(PY_PIP_URL, getPipPath);
  log('Installing pip...');
  execSync(`"${pyExe}" "${getPipPath}" --no-warn-script-location`, { stdio: 'inherit', cwd: pyDir });
  fs.unlinkSync(getPipPath);

  // --- Step 3: Install API requirements ---
  log('Installing API dependencies...');
  mkdirp(siteDir);

  // Filter out test-only packages from requirements
  const reqContent = fs.readFileSync(reqFile, 'utf8');
  const prodReqs = reqContent
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return false;
      // Skip test-only deps
      if (/^(pytest|respx)/.test(trimmed)) return false;
      return true;
    })
    .join('\n');

  const prodReqFile = path.join(BUNDLE, 'requirements-prod.txt');
  fs.writeFileSync(prodReqFile, prodReqs);

  execSync(
    `"${pyExe}" -m pip install --no-warn-script-location --target "${siteDir}" -r "${prodReqFile}"`,
    { stdio: 'inherit' }
  );
  fs.unlinkSync(prodReqFile);

  // --- Step 4: Copy API application code ---
  log('Copying API code...');
  mkdirp(path.join(apiDest, 'app'));
  copyDirSync(appDir, path.join(apiDest, 'app'));
  fs.copyFileSync(envFile, path.join(apiDest, '.env'));

  // --- Step 5: Cleanup unnecessary files to reduce size ---
  log('Cleaning up...');
  const cleanDirs = ['__pycache__', 'tests', 'test', '.dist-info'];
  function cleanRecursive(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (cleanDirs.some(c => entry.name.endsWith(c) || entry.name === c)) {
          rmrf(path.join(dir, entry.name));
        } else {
          cleanRecursive(path.join(dir, entry.name));
        }
      }
    }
  }
  cleanRecursive(siteDir);

  // Calculate size
  let totalBytes = 0;
  function countBytes(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) countBytes(p);
      else totalBytes += fs.statSync(p).size;
    }
  }
  countBytes(BUNDLE);
  const sizeMB = (totalBytes / 1024 / 1024).toFixed(1);

  log(`Backend bundle ready: ${sizeMB} MB`);
  log(`Location: ${BUNDLE}`);
}

main().catch(err => { console.error(err); process.exit(1); });
