import { spawn } from 'child_process';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const appPath = path.resolve(process.cwd());

const requested = (process.argv[2] || '').trim();
const explicitUrl = (process.env.VITE_DEV_SERVER_URL || '').trim();
const defaultUrl = `http://127.0.0.1:${requested || '5173'}`;
const env = { ...process.env, VITE_DEV_SERVER_URL: explicitUrl || defaultUrl };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(String(electronPath), [appPath], {
  stdio: 'inherit',
  env,
  cwd: appPath,
  shell: false,
});
child.on('exit', (code) => process.exit(code ?? 0));
