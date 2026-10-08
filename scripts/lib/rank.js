// Auswahl und Sortierung nach Relevanz (regelbasiert, ohne KI).
//
// Punkte = Aktualität (max. 30) + Themen-Schlüsselwörter (aus config.json) + Bonus, wenn mehrere
// Quellen über dasselbe berichten. Ähnliche Überschriften werden zu einer Meldung zusammengefasst.

const STOP = new Set(
  'der die das den dem des ein eine einer eines einem einen und oder aber nicht mit von für auf aus bei nach über unter vor zum zur im in am an als auch noch nur wie wird werden wurde wurden ist sind hat haben sein seine ihre ihrer dass sich es er sie wir ihr ihn mehr neue neuen neues soll sollen kann können will wollen'.split(' ')
);

export function tokens(title) {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

export function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Kurze Schlüsselwörter (<= 3 Zeichen, z. B. "KI", "EU") nur als ganzes, groß geschriebenes Wort.
// Längere Schlüsselwörter dürfen am Wortende weitergehen (Chip -> Chips, Chipfabrik).
function keywordRegex(keyword) {
  const k = escapeRe(keyword);
  const start = '(?<![\\p{L}\\p{N}])';
  if (keyword.length <= 3) return new RegExp(`${start}${k}(?![\\p{L}\\p{N}])`, 'u');
  return new RegExp(`${start}${k}`, 'iu');
}

function topicScore(item, topics) {
  let score = 0;
  const matched = [];
  for (const t of topics) {
    if (!t.enabled) continue;
    let hits = 0;
    for (const kw of t.keywords) {
      const re = keywordRegex(kw);
      if (re.test(item.title)) hits += 2;
      else if (re.test(item.summary)) hits += 1;
    }
    if (hits > 0) {
      score += t.weight * Math.min(hits, 4);
      matched.push(t.id);
    }
  }
  return { score, matched };
}

export function scoreItem(item, cfg, now) {
  const ageH = (now.getTime() - item.publishedAt.getTime()) / 36e5;
  const recency = Math.max(0, 30 * (1 - Math.max(ageH, 0) / cfg.maxAgeHours));
  const { score, matched } = topicScore(item, cfg.topics);
  return { score: recency + score, topics: matched };
}

// Liefert Cluster (je Meldung) mit Gesamtpunktzahl, absteigend sortiert.
export function rank(items, cfg, now = new Date()) {
  const fresh = items
    .filter((i) => (now.getTime() - i.publishedAt.getTime()) / 36e5 <= cfg.maxAgeHours)
    .map((i) => ({ ...i, ...scoreItem(i, cfg, now), tok: tokens(i.title) }))
    .sort((a, b) => b.score - a.score);

  const clusters = [];
  for (const item of fresh) {
    const hit = clusters.find((c) => c.lead.url === item.url || jaccard(c.lead.tok, item.tok) >= cfg.dedupeThreshold);
    if (hit) {
      if (item.sourceId !== hit.lead.sourceId && !hit.also.includes(item.source)) hit.also.push(item.source);
      continue;
    }
    clusters.push({ lead: item, also: [] });
  }

  return clusters
    .map((c) => ({
      title: c.lead.title,
      summary: c.lead.summary,
      url: c.lead.url,
      source: c.lead.source,
      category: c.lead.category,
      publishedAt: c.lead.publishedAt,
      alsoReportedBy: c.also,
      topics: c.lead.topics,
      score: c.lead.score + 12 * Math.min(c.also.length, 2)
    }))
    .sort((a, b) => b.score - a.score);
}

// Wählt maxItems Meldungen: zuerst die Plätze je Kategorie (Technik/KI zuerst), dann nach Punkten auffüllen.
export function select(clusters, cfg) {
  const chosen = [];
  const used = new Set();
  for (const [cat, n] of Object.entries(cfg.slots ?? {})) {
    for (const c of clusters.filter((x) => x.category === cat && !used.has(x)).slice(0, n)) {
      chosen.push(c);
      used.add(c);
    }
  }
  for (const c of clusters) {
    if (chosen.length >= cfg.maxItems) break;
    if (!used.has(c)) {
      chosen.push(c);
      used.add(c);
    }
  }
  return chosen.sort((a, b) => b.score - a.score).slice(0, cfg.maxItems);
}
