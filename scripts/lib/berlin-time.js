// Zeit in Europe/Berlin, unabhängig von der Zeitzone des Rechners (GitHub-Runner laufen in UTC).
// Keine externen Abhängigkeiten.

export function berlinParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute)
  };
}

// "07:30" -> 450
export function parseTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) throw new Error(`Ungültige Uhrzeit in config.json: "${hhmm}" (erwartet HH:MM)`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Ungültige Uhrzeit in config.json: "${hhmm}"`);
  return h * 60 + min;
}
