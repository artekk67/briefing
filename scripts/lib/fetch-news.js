// Nachrichtenbeschaffung: holt RSS-/Atom-/RDF-Feeds und liefert normalisierte Artikel.
// Es werden ausschließlich Daten aus den Feeds verwendet. Nichts wird ergänzt oder erfunden.
import { readFeed } from './xml.js';

export function clean(html) {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function categoryFor(feed, url) {
  for (const rule of feed.pathRules ?? []) {
    if (url.includes(rule.contains)) return rule.category;
  }
  return feed.category;
}

export function parseFeed(xml, feed) {
  const items = [];
  for (const raw of readFeed(xml)) {
    const title = clean(raw.title);
    const url = raw.link.trim();
    const publishedAt = raw.date ? new Date(raw.date) : null;
    if (!title || !/^https?:\/\//.test(url)) continue;
    if (!publishedAt || Number.isNaN(publishedAt.getTime())) continue;
    let summary = clean(raw.description);
    if (summary.toLowerCase() === title.toLowerCase()) summary = '';
    items.push({
      title,
      summary,
      url,
      source: feed.name,
      sourceId: feed.id,
      category: categoryFor(feed, url),
      publishedAt
    });
  }
  return items;
}

async function fetchXml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'TagesBriefingPWA/1.0 (privates Nachrichten-Briefing; RSS)',
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchFeed(feed) {
  const urls = [feed.url, ...(feed.fallbackUrls ?? [])];
  const errors = [];
  for (const url of urls) {
    try {
      const xml = await fetchXml(url);
      const items = parseFeed(xml, feed);
      if (items.length === 0) throw new Error('Feed enthält keine verwertbaren Einträge');
      return items;
    } catch (err) {
      errors.push(`${url}: ${err.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

// Gibt { items, notes } zurück. Ausgefallene Feeds landen als Hinweis im Briefing.
export async function fetchAll(feeds) {
  const results = await Promise.allSettled(feeds.map(fetchFeed));
  const items = [];
  const notes = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      items.push(...r.value);
    } else {
      notes.push(`Quelle „${feeds[i].name}" war nicht erreichbar.`);
      console.error(`Feed ${feeds[i].id} fehlgeschlagen: ${r.reason.message}`);
    }
  });
  return { items, notes };
}
