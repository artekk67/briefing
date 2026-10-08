// Zusammenfassung. Version 1 arbeitet ohne KI und nutzt den Teaser aus dem Feed.
// Die Schnittstelle ist so gehalten, dass später eine KI-Variante ergänzt werden kann,
// ohne Beschaffung, Auswahl oder Push anzufassen.

export function shorten(text, maxChars) {
  const clean = String(text ?? '').trim();
  if (!clean) return '';
  const sentences = clean.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const s of sentences.slice(0, 2)) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > maxChars) break;
    out = next;
  }
  if (out) return out;
  // Erster Satz allein zu lang: an Wortgrenze kürzen.
  const cut = clean.slice(0, maxChars).replace(/\s+\S*$/, '');
  return `${cut}…`;
}

export async function summarize(selected, cfg) {
  if (cfg.summarizer !== 'regeln') {
    throw new Error(
      `summarizer "${cfg.summarizer}" ist in dieser Version nicht implementiert. ` +
        'Setze "summarizer" in docs/config.json auf "regeln" (kostenlos, ohne KI).'
    );
  }
  return selected.map((c, i) => ({
    rank: i + 1,
    title: c.title,
    summary: shorten(c.summary, cfg.summaryMaxChars) || 'Keine Kurzbeschreibung im Feed. Details über den Quellenlink.',
    url: c.url,
    source: c.source,
    category: c.category,
    publishedAt: c.publishedAt.toISOString(),
    alsoReportedBy: c.alsoReportedBy
  }));
}
