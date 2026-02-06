import { clipboard } from 'electron';
import { spawn } from 'child_process';

let lastPasteAt = 0;

function sendKeystroke(keys: string): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const proc = spawn(
        'powershell',
        ['-NoProfile', '-Command', `$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys('${keys}')`],
        { windowsHide: true },
      );
      proc.on('exit', () => resolve());
      proc.on('error', () => resolve());
    } else if (process.platform === 'darwin') {
      const keyMap: Record<string, string> = { '^v': '"v" using command down', '^z': '"z" using command down' };
      const osa = keyMap[keys] ?? `"${keys}"`;
      const proc = spawn('osascript', ['-e', `tell application "System Events" to keystroke ${osa}`], { stdio: 'ignore' });
      proc.on('exit', () => resolve());
      proc.on('error', () => resolve());
    } else {
      resolve();
    }
  });
}

export async function pasteText(text: string): Promise<void> {
  if (!text) return;
  const now = Date.now();
  if (now - lastPasteAt < 700) return; // debounce
  lastPasteAt = now;
  clipboard.writeText(text);
  await sendKeystroke('^v');
}

export async function undoPaste(): Promise<void> {
  await sendKeystroke('^z');
}

export function readClipboard(): string {
  try {
    return clipboard.readText();
  } catch {
    return '';
  }
}
