import { clipboard } from 'electron';
import { spawn } from 'child_process';

let lastPasteAt = 0;

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { windowsHide: true, stdio: 'ignore' });
    proc.on('exit', () => resolve());
    proc.on('error', () => resolve());
  });
}

function sendKeystroke(keys: string): Promise<void> {
  if (process.platform === 'win32') {
    return runCommand('powershell', [
      '-NoProfile',
      '-Command',
      `$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys('${keys}')`,
    ]);
  }
  if (process.platform === 'darwin') {
    const keyMap: Record<string, string> = { '^v': '"v" using command down', '^z': '"z" using command down' };
    const osa = keyMap[keys] ?? `"${keys}"`;
    return runCommand('osascript', ['-e', `tell application "System Events" to keystroke ${osa}`]);
  }
  return Promise.resolve();
}

function restoreCaretAndPaste(): Promise<void> {
  const script = `
$wsh = New-Object -ComObject WScript.Shell;
Start-Sleep -Milliseconds 20;
$wsh.SendKeys('{ESC}');
Start-Sleep -Milliseconds 35;
$wsh.SendKeys('^{END}');
Start-Sleep -Milliseconds 35;
$wsh.SendKeys('^v')
`;
  return runCommand('powershell', ['-NoProfile', '-Command', script]);
}

/** Write text to the system clipboard without pasting. */
export function writeClipboard(text: string): void {
  clipboard.writeText(text);
}

export async function pasteText(text: string): Promise<void> {
  if (!text) return;
  const now = Date.now();
  if (now - lastPasteAt < 700) return;
  lastPasteAt = now;
  clipboard.writeText(text);

  if (process.platform === 'win32') {
    await restoreCaretAndPaste();
    return;
  }

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
