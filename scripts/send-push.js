// Push-Versand per Web-Push (VAPID). Läuft nur im Backend (GitHub Actions); der private Schlüssel
// kommt ausschließlich aus Umgebungsvariablen/Secrets.
//
// Benötigte Umgebungsvariablen:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   (npx web-push generate-vapid-keys)
//   VAPID_SUBJECT                         (z. B. mailto:du@example.org)
//   PUSH_SUBSCRIPTIONS                    (JSON-Objekt oder Array aus der App, Einstellungen)
// Optional: PAGES_URL (Basisadresse der App; es wird gewartet, bis das Briefing dort erreichbar ist)
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import webpush from 'web-push';
import { loadConfig, DATA } from './lib/paths.js';
import { berlinParts } from './lib/berlin-time.js';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_SUBSCRIPTIONS } = process.env;

const missing = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'PUSH_SUBSCRIPTIONS'].filter((k) => !process.env[k]);
if (missing.length) {
  console.warn(`Push übersprungen: Secret(s) fehlen: ${missing.join(', ')}`);
  process.exit(0);
}

let subs;
try {
  const parsed = JSON.parse(PUSH_SUBSCRIPTIONS);
  subs = Array.isArray(parsed) ? parsed : [parsed];
} catch {
  console.error('PUSH_SUBSCRIPTIONS ist kein gültiges JSON.');
  process.exit(1);
}

const cfg = await loadConfig();
const { date } = berlinParts();
const briefing = JSON.parse(await readFile(path.join(DATA, `${date}.json`), 'utf8'));

// Nach dem Commit braucht GitHub Pages etwas Zeit. Erst pushen, wenn die Datei online ist (max. 8 Min.).
const pagesUrl = (cfg.pagesUrl || process.env.PAGES_URL || '').replace(/\/?$/, '/');
if (pagesUrl !== '/') {
  const target = `${pagesUrl}data/${date}.json`;
  let online = false;
  for (let i = 0; i < 32 && !online; i++) {
    try {
      const r = await fetch(`${target}?t=${Date.now()}`, { signal: AbortSignal.timeout(10000) });
      online = r.ok;
    } catch {
      /* noch nicht erreichbar */
    }
    if (!online) await new Promise((r) => setTimeout(r, 15000));
  }
  if (!online) console.warn('Briefing war nach 8 Minuten noch nicht online erreichbar. Push wird trotzdem gesendet.');
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const dayLabel = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  weekday: 'long',
  day: 'numeric',
  month: 'long'
}).format(new Date(`${date}T12:00:00Z`));
const more = briefing.items.length > 1 ? ` (+${briefing.items.length - 1} weitere)` : '';
const payload = JSON.stringify({
  title: `Briefing ${dayLabel}`,
  body: `${briefing.items[0].title}${more}`,
  url: `./?d=${date}`,
  tag: `briefing-${date}`
});

let failed = 0;
for (const [i, sub] of subs.entries()) {
  try {
    await webpush.sendNotification(sub, payload, { TTL: 6 * 3600, urgency: 'normal' });
    console.log(`Push an Gerät ${i + 1} gesendet.`);
  } catch (err) {
    failed++;
    const gone = err.statusCode === 404 || err.statusCode === 410;
    console.error(
      `Push an Gerät ${i + 1} fehlgeschlagen (HTTP ${err.statusCode ?? '?'})` +
        (gone ? ': Anmeldung abgelaufen. In der App Benachrichtigungen neu aktivieren und das Secret erneuern.' : '')
    );
  }
}
process.exit(failed > 0 ? 1 : 0);
