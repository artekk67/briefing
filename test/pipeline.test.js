// Tests mit Beispiel-XML (kein Netzwerk nötig). Ausführen: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../scripts/lib/fetch-news.js';
import { rank, select, tokens, jaccard } from '../scripts/lib/rank.js';
import { shorten, summarize } from '../scripts/lib/summarize.js';
import { berlinParts, parseTime } from '../scripts/lib/berlin-time.js';

const NOW = new Date('2026-10-09T05:00:00Z');
const iso = (h) => new Date(NOW.getTime() - h * 36e5).toUTCString();

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Bundestag beschließt neues Gesetz</title><link>https://www.tagesschau.de/inland/gesetz-100.html</link>
<description><![CDATA[<p>Der Bundestag hat ein Gesetz beschlossen. Weitere Details folgen.</p>]]></description><pubDate>${iso(2)}</pubDate></item>
<item><title>Krieg in der Region eskaliert</title><link>https://www.tagesschau.de/ausland/krieg-100.html</link>
<description>Neue Kämpfe.</description><pubDate>${iso(3)}</pubDate></item>
<item><title>Ohne Datum</title><link>https://example.org/x</link></item>
<item><title>Kaputter Link</title><link>javascript:alert(1)</link><pubDate>${iso(1)}</pubDate></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>OpenAI stellt neues Sprachmodell vor</title><link rel="alternate" href="https://www.heise.de/news/ki-modell-1.html"/>
<updated>${new Date(NOW.getTime() - 1 * 36e5).toISOString()}</updated><summary>Das neue KI-Modell soll schneller sein.</summary></entry>
<entry><title>Neuer Chip von Nvidia angekündigt</title><link href="https://www.heise.de/news/chip-2.html"/>
<updated>${new Date(NOW.getTime() - 5 * 36e5).toISOString()}</updated></entry>
</feed>`;

const RDF = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<item rdf:about="https://www.dw.com/de/a-1"><title>OpenAI präsentiert neues Sprachmodell</title><link>https://www.dw.com/de/a-1</link>
<description>Ein Sprachmodell wurde vorgestellt.</description><dc:date>${new Date(NOW.getTime() - 2 * 36e5).toISOString()}</dc:date></item>
</rdf:RDF>`;

const feeds = {
  ts: { id: 'tagesschau', name: 'tagesschau.de', category: 'de', pathRules: [{ contains: '/ausland/', category: 'welt' }, { contains: '/inland/', category: 'de' }] },
  heise: { id: 'heise', name: 'heise online', category: 'tech' },
  dw: { id: 'dw', name: 'Deutsche Welle', category: 'welt' }
};

const cfg = {
  maxItems: 5,
  maxAgeHours: 36,
  dedupeThreshold: 0.5,
  summaryMaxChars: 260,
  summarizer: 'regeln',
  slots: { tech: 2, de: 1, welt: 1 },
  topics: [
    { id: 'ki', enabled: true, weight: 10, keywords: ['KI', 'OpenAI', 'Sprachmodell'] },
    { id: 'technik', enabled: true, weight: 5, keywords: ['Chip'] },
    { id: 'politik', enabled: true, weight: 4, keywords: ['Bundestag'] }
  ]
};

test('RSS: Datum und gültiger Link sind Pflicht, HTML wird entfernt, Kategorie per Pfadregel', () => {
  const items = parseFeed(RSS, feeds.ts);
  assert.equal(items.length, 2);
  assert.equal(items[0].category, 'de');
  assert.equal(items[1].category, 'welt');
  assert.equal(items[0].summary, 'Der Bundestag hat ein Gesetz beschlossen. Weitere Details folgen.');
});

test('Atom: rel=alternate und href werden gelesen, fehlende Beschreibung ist leer', () => {
  const items = parseFeed(ATOM, feeds.heise);
  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://www.heise.de/news/ki-modell-1.html');
  assert.equal(items[1].summary, '');
});

test('RDF wird gelesen', () => {
  const items = parseFeed(RDF, feeds.dw);
  assert.equal(items.length, 1);
  assert.equal(items[0].source, 'Deutsche Welle');
});

test('Unbekanntes Format wirft einen Fehler', () => {
  assert.throws(() => parseFeed('<html></html>', feeds.dw), /Unbekanntes Feed-Format/);
});

test('Duplikate werden zusammengeführt, mehrere Quellen geben Bonus', () => {
  const all = [...parseFeed(RSS, feeds.ts), ...parseFeed(ATOM, feeds.heise), ...parseFeed(RDF, feeds.dw)];
  const clusters = rank(all, cfg, NOW);
  const ki = clusters.filter((c) => /Sprachmodell/.test(c.title));
  assert.equal(ki.length, 1, 'zwei Sprachmodell-Meldungen sind eine');
  assert.deepEqual(ki[0].alsoReportedBy.length, 1);
  assert.equal(clusters[0].title.includes('Sprachmodell'), true, 'KI-Meldung steht oben');
});

test('Alte Artikel werden verworfen', () => {
  const old = parseFeed(`<rss><channel><item><title>Alt</title><link>https://example.org/a</link><pubDate>${iso(100)}</pubDate></item></channel></rss>`, feeds.ts);
  assert.equal(rank(old, cfg, NOW).length, 0);
});

test('Kurze Schlüsselwörter treffen nur ganze Wörter (KI nicht in "Kind")', () => {
  const items = parseFeed(`<rss><channel><item><title>Kind findet Schatz</title><link>https://example.org/k</link><pubDate>${iso(1)}</pubDate></item></channel></rss>`, feeds.ts);
  const [c] = rank(items, cfg, NOW);
  assert.deepEqual(c.topics, []);
});

test('Auswahl: höchstens maxItems, Plätze je Kategorie, nach Punkten sortiert', () => {
  const all = [...parseFeed(RSS, feeds.ts), ...parseFeed(ATOM, feeds.heise), ...parseFeed(RDF, feeds.dw)];
  const chosen = select(rank(all, cfg, NOW), cfg);
  assert.ok(chosen.length <= cfg.maxItems);
  assert.ok(chosen.some((c) => c.category === 'tech'));
  for (let i = 1; i < chosen.length; i++) assert.ok(chosen[i - 1].score >= chosen[i].score);
});

test('Zusammenfassung: höchstens zwei Sätze, Länge begrenzt, Lücke wird benannt', async () => {
  assert.equal(shorten('Eins. Zwei. Drei.', 260), 'Eins. Zwei.');
  assert.ok(shorten('wort '.repeat(200), 50).endsWith('…'));
  const out = await summarize([{ title: 'T', summary: '', url: 'https://example.org', source: 'Q', category: 'de', publishedAt: NOW, alsoReportedBy: [] }], cfg);
  assert.match(out[0].summary, /Keine Kurzbeschreibung/);
  await assert.rejects(() => summarize([], { ...cfg, summarizer: 'claude' }), /nicht implementiert/);
});

test('Berliner Zeit: Sommer- und Winterzeit', () => {
  assert.deepEqual(berlinParts(new Date('2026-10-09T05:00:00Z')), { date: '2026-10-09', minutes: 7 * 60 });
  assert.deepEqual(berlinParts(new Date('2026-11-09T06:00:00Z')), { date: '2026-11-09', minutes: 7 * 60 });
  assert.deepEqual(berlinParts(new Date('2026-10-09T22:30:00Z')), { date: '2026-10-10', minutes: 30 });
  assert.equal(parseTime('07:30'), 450);
  assert.throws(() => parseTime('25:00'));
});

test('Hilfsfunktionen', () => {
  assert.ok(jaccard(tokens('OpenAI stellt Sprachmodell vor'), tokens('OpenAI präsentiert Sprachmodell')) >= 0.5);
});
