// Minimaler, abhängigkeitsfreier Leser für RSS 2.0, Atom und RSS 1.0 (RDF).
// Bewusst klein gehalten: Er liest nur die wenigen Felder, die das Briefing braucht.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// CDATA-Inhalt bleibt unverändert, normaler Text wird entity-dekodiert.
function textValue(raw) {
  if (raw.includes('<![CDATA[')) return raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  return decodeEntities(raw).trim();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function tagText(block, name) {
  const re = new RegExp(`<${escapeRe(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRe(name)}>`, 'i');
  const m = re.exec(block);
  return m ? textValue(m[1]) : '';
}

function firstText(block, names) {
  for (const n of names) {
    const v = tagText(block, n);
    if (v) return v;
  }
  return '';
}

function attr(tag, name) {
  const m = new RegExp(`\\b${escapeRe(name)}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? '') : '';
}

function linkOf(block) {
  const plain = tagText(block, 'link');
  if (plain) return plain;
  const tags = block.match(/<link\b[^>]*>/gi) ?? [];
  const alt = tags.find((t) => attr(t, 'rel') === 'alternate' && attr(t, 'href')) ?? tags.find((t) => !attr(t, 'rel') && attr(t, 'href')) ?? tags.find((t) => attr(t, 'href'));
  return alt ? attr(alt, 'href') : tagText(block, 'guid');
}

// Rückgabe: Liste roher Einträge { title, link, description, date }
export function readFeed(xml) {
  let blockRe;
  if (/<rss[\s>]/i.test(xml)) blockRe = /<item\b[\s\S]*?<\/item>/gi;
  else if (/<feed[\s>]/i.test(xml)) blockRe = /<entry\b[\s\S]*?<\/entry>/gi;
  else if (/<rdf:RDF[\s>]/i.test(xml)) blockRe = /<item\b[\s\S]*?<\/item>/gi;
  else throw new Error('Unbekanntes Feed-Format (weder RSS, Atom noch RDF)');

  return (xml.match(blockRe) ?? []).map((block) => ({
    title: firstText(block, ['title']),
    link: linkOf(block),
    description: firstText(block, ['description', 'summary', 'content:encoded', 'content']),
    date: firstText(block, ['pubDate', 'published', 'updated', 'dc:date'])
  }));
}
