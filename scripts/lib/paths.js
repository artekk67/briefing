// Gemeinsame Pfade und Konfiguration. Keine externen Abhängigkeiten.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DOCS = path.join(ROOT, 'docs');
export const DATA = path.join(DOCS, 'data');
export const CONFIG_PATH = path.join(DOCS, 'config.json');

export async function loadConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
}
