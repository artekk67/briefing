// Entscheidet, ob JETZT ein Briefing erzeugt werden soll.
// Läuft ohne npm-Abhängigkeiten, damit der Workflow bei den vielen Cron-Takten sehr schnell endet.
//
// Hintergrund: GitHub-Cron kennt nur UTC und keine Sommerzeit. Der Workflow startet deshalb alle
// 30 Minuten in einem Zeitband; dieses Skript prüft die Berliner Uhrzeit und ob das Briefing für
// heute schon existiert. So entsteht genau ein Briefing pro Tag, zur eingestellten Uhrzeit.
import { existsSync } from 'node:fs';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, DATA } from './lib/paths.js';
import { berlinParts, parseTime } from './lib/berlin-time.js';

const cfg = await loadConfig();
const now = berlinParts();
const target = parseTime(cfg.time);
const windowMin = (cfg.windowHours ?? 4) * 60;
const force = String(process.env.FORCE ?? '').toLowerCase() === 'true';
const exists = existsSync(path.join(DATA, `${now.date}.json`));

let run = false;
let reason;
if (force) {
  run = true;
  reason = 'manuell erzwungen';
} else if (exists) {
  reason = `Briefing für ${now.date} existiert bereits`;
} else if (now.minutes < target) {
  reason = `noch zu früh (Berlin ${now.minutes} min seit Mitternacht, geplant ${cfg.time})`;
} else if (now.minutes > target + windowMin) {
  reason = `Zeitfenster von ${cfg.windowHours ?? 4} h nach ${cfg.time} verpasst`;
} else {
  run = true;
  reason = `fällig (geplant ${cfg.time} Berlin)`;
}

console.log(`Briefing ${run ? 'wird erzeugt' : 'wird NICHT erzeugt'}: ${reason}`);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\ndate=${now.date}\n`);
}
