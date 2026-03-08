import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

export function getAuthStoragePath(): string {
  return path.join(app.getPath('userData'), 'auth-storage.json');
}

export function isValidAuthStorageKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= 200;
}

export async function readAuthStorage(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(getAuthStoragePath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string',
    );
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export async function writeAuthStorage(storage: Record<string, string>): Promise<void> {
  const storagePath = getAuthStoragePath();
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  await fs.writeFile(storagePath, JSON.stringify(storage), 'utf8');
}
