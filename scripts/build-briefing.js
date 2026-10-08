// Erzeugt das Briefing für heute (Berliner Datum) und schreibt es nach docs/data/.
// Ablauf: Beschaffung -> Auswahl -> Zusammenfassung -> Speichern (Archiv-Index inklusive).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, DATA } from './lib/paths.js';
import { berlinParts } from './lib/berlin-time.js';
import { fetchAll } from './lib/fetch-news.js';
import { rank, select } from './lib/rank.js';
import { summarize } from './lib/summarize.js';

const cfg = await loadConfig();
const { date } = berlinParts();

const { items, notes } = await fetchAll(cfg.feeds);
if (items.length === 0) {
  console.error('Kein einziger Artikel abrufbar. Es wird kein Briefing erzeugt.');
  process.exit(1);
}

const clusters = rank(items, cfg, new Date());
const selected = select(clusters, cfg);
if (selected.length === 0) {
  console.error(`Keine Artikel der letzten ${cfg.maxAgeHours} Stunden gefunden. Es wird kein Briefing erzeugt.`);
  process.exit(1);
}
if (selected.length < cfg.maxItems) {
  notes.push(`Nur ${selected.length} passende Meldungen gefunden (gewünscht: ${cfg.maxItems}).`);
}

const final = await summarize(selected, cfg);

const briefing = {
  date,
  generatedAt: new Date().toISOString(),
  mode: cfg.summarizer,
  items: final,
  notes
};

await mkdir(DATA, { recursive: true });
await writeFile(path.join(DATA, `${date}.json`), JSON.stringify(briefing, null, 2) + '\n');

// Archiv-Index (neueste zuerst)
const indexPath = path.join(DATA, 'index.json');
let index = { briefings: [] };
try {
  index = JSON.parse(await readFile(indexPath, 'utf8'));
} catch {
  /* erster Lauf */
}
index.briefings = [
  { date, title: final[0].title, count: final.length },
  ...index.briefings.filter((b) => b.date !== date)
].sort((a, b) => b.date.localeCompare(a.date));
index.updatedAt = briefing.generatedAt;
await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');

console.log(`Briefing ${date} gespeichert: ${final.length} Meldungen, ${notes.length} Hinweis(e).`);
final.forEach((i) => console.log(` ${i.rank}. [${i.source}] ${i.title}`));
