// Oberfläche der Briefing-PWA. Reines JavaScript, keine Abhängigkeiten.
// Alle Inhalte aus Feeds werden ausschließlich als Text eingefügt (kein innerHTML).
(() => {
  'use strict';

  const view = document.querySelector('#view');
  const titleEl = document.querySelector('#title');
  const subtitleEl = document.querySelector('#subtitle');
  const tabs = [...document.querySelectorAll('.tabs button')];
  const params = new URLSearchParams(location.search);
  const demo = params.get('demo') === '1';

  const state = { index: null, config: null, current: 'today', date: params.get('d') };

  const CATEGORY = { de: 'Deutschland', welt: 'Welt', tech: 'Technik & KI' };

  // ---------- Hilfsfunktionen ----------
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const safeUrl = (u) => {
    try {
      const url = new URL(u);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  };

  const fmtDate = (iso, opts) =>
    new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ...opts }).format(new Date(`${iso}T12:00:00Z`));

  async function getJSON(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  }

  function setHeader(title, subtitle = '') {
    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
  }

  function show(name) {
    state.current = name;
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    view.replaceChildren();
    window.scrollTo(0, 0);
    const render = { today: renderToday, archive: renderArchive, settings: renderSettings }[name];
    render().catch((err) => {
      view.replaceChildren(h('div', { class: 'notice' }, h('p', {}, 'Das konnte nicht geladen werden.'), h('p', {}, String(err.message || err))));
    });
  }

  // ---------- Daten ----------
  async function loadIndex() {
    if (state.index) return state.index;
    try {
      state.index = await getJSON('data/index.json');
    } catch {
      state.index = { briefings: [] };
    }
    return state.index;
  }

  async function loadConfig() {
    if (state.config) return state.config;
    try {
      state.config = await getJSON('config.json');
    } catch {
      state.config = null;
    }
    return state.config;
  }

  const SAMPLE = {
    date: new Date().toISOString().slice(0, 10),
    notes: [],
    items: [
      { rank: 1, title: 'Beispielmeldung zu KI', summary: 'So sieht eine Meldung mit kurzer Erklärung aus.', url: 'https://example.org/', source: 'Beispielquelle', category: 'tech', alsoReportedBy: ['Zweite Quelle'] },
      { rank: 2, title: 'Beispielmeldung aus Deutschland', summary: 'Zweite Beispielmeldung. Alles hier ist erfunden und nur zur Ansicht des Layouts.', url: 'https://example.org/', source: 'Beispielquelle', category: 'de', alsoReportedBy: [] },
      { rank: 3, title: 'Beispielmeldung aus der Welt', summary: 'Dritte Beispielmeldung.', url: 'https://example.org/', source: 'Beispielquelle', category: 'welt', alsoReportedBy: [] }
    ]
  };

  // ---------- Ansicht: Heute ----------
  function articleCard(item) {
    const href = safeUrl(item.url);
    return h(
      'article',
      { class: 'card' },
      h('div', { class: 'meta' }, h('span', { class: 'rank', 'aria-label': `Platz ${item.rank}` }, item.rank), item.category && h('span', { class: 'chip' }, CATEGORY[item.category] || item.category)),
      h('h2', {}, item.title),
      h('p', {}, item.summary),
      h(
        'div',
        { class: 'meta' },
        h('span', {}, `Quelle: ${item.source}`),
        item.alsoReportedBy && item.alsoReportedBy.length ? h('span', {}, `auch: ${item.alsoReportedBy.join(', ')}`) : null
      ),
      href ? h('p', { style: 'margin-top:12px' }, h('a', { class: 'btn', href, target: '_blank', rel: 'noopener noreferrer' }, 'Zur Quelle ↗')) : null
    );
  }

  function emptyState() {
    return h(
      'div',
      { class: 'empty' },
      h('p', {}, 'Noch kein Briefing vorhanden.'),
      h('p', {}, 'Das erste entsteht, sobald der tägliche Workflow gelaufen ist (siehe README). Mit ?demo=1 an der Adresse siehst du eine Layout-Vorschau mit Beispieldaten.')
    );
  }

  async function renderToday() {
    if (demo) {
      setHeader('Vorschau', fmtDate(SAMPLE.date, { weekday: 'long', day: 'numeric', month: 'long' }));
      view.append(h('div', { class: 'notice' }, h('p', {}, 'BEISPIELDATEN – kein echtes Briefing. Nur zur Ansicht des Layouts.')), ...SAMPLE.items.map(articleCard));
      return;
    }
    const index = await loadIndex();
    const date = state.date || index.briefings[0]?.date;
    if (!date) {
      setHeader('Briefing');
      view.append(emptyState());
      return;
    }
    const b = await getJSON(`data/${date}.json`);
    setHeader('Briefing', fmtDate(b.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    if (b.notes && b.notes.length) view.append(h('div', { class: 'notice' }, b.notes.map((n) => h('p', {}, n))));
    view.append(...b.items.map(articleCard));
    view.append(
      h(
        'p',
        { class: 'muted', style: 'font-size:0.8rem' },
        `Erstellt ${new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' }).format(new Date(b.generatedAt))} Uhr. ` +
          (b.mode === 'regeln'
            ? 'Auswahl nach Regeln, Texte stammen aus den Feeds der Quellen (keine KI).'
            : `Modus: ${b.mode}.`)
      )
    );
  }

  // ---------- Ansicht: Archiv ----------
  async function renderArchive() {
    setHeader('Archiv', 'Bisherige Briefings');
    const index = await loadIndex();
    if (!index.briefings.length) {
      view.append(emptyState());
      return;
    }
    const ul = h('ul', { class: 'list' });
    for (const b of index.briefings) {
      ul.append(
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              onclick: () => {
                state.date = b.date;
                show('today');
              }
            },
            h('span', { class: 'when' }, fmtDate(b.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
            h('span', { class: 'what' }, `${b.count} Meldungen · ${b.title}`)
          )
        )
      );
    }
    view.append(h('div', { class: 'card' }, ul));
  }

  // ---------- Ansicht: Einstellungen ----------
  const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function urlBase64ToUint8Array(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function renderSettings() {
    setHeader('Einstellungen');
    const cfg = await loadConfig();
    view.append(pushCard(cfg), configCard(cfg), aboutCard());
  }

  function pushCard(cfg) {
    const card = h('section', { class: 'card' }, h('h3', {}, 'Benachrichtigungen'));
    const out = h('div');
    card.append(out);

    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

    if (!supported) {
      out.append(
        h(
          'div',
          { class: 'notice' },
          isIOS() && !isStandalone()
            ? h('div', {}, h('p', {}, 'Auf dem iPhone funktioniert Push nur in der installierten App (iOS 16.4 oder neuer):'), h('ol', { class: 'steps' }, h('li', {}, 'In Safari auf „Teilen" tippen.'), h('li', {}, '„Zum Home-Bildschirm" wählen und hinzufügen.'), h('li', {}, 'Die App über das neue Icon öffnen und hier erneut nachsehen.')))
            : h('p', {}, 'Dieser Browser unterstützt keine Web-Push-Nachrichten.')
        )
      );
      return card;
    }

    const status = h('p', {});
    const textarea = h('textarea', { readonly: true, 'aria-label': 'Push-Anmeldung als Text', hidden: true });
    const copyBtn = h('button', { type: 'button', class: 'btn', hidden: true, onclick: copy }, 'Text kopieren');
    const subBtn = h('button', { type: 'button', class: 'btn primary', onclick: enable }, 'Benachrichtigungen aktivieren');
    const testBtn = h('button', { type: 'button', class: 'btn', onclick: localTest }, 'Lokaler Test (kein echter Push)');
    const help = h('div', { class: 'notice', hidden: true });

    out.append(status, h('p', {}, subBtn, ' ', testBtn), textarea, h('p', {}, copyBtn), help);

    function showSubscription(sub) {
      textarea.value = JSON.stringify(sub.toJSON());
      textarea.hidden = false;
      copyBtn.hidden = false;
      help.hidden = false;
      help.replaceChildren(
        h('p', {}, 'Letzter Schritt (einmalig): Diesen Text als GitHub-Secret speichern, damit der Server dir Push senden kann.'),
        h('ol', { class: 'steps' }, h('li', {}, 'Text kopieren.'), h('li', {}, 'GitHub-Repository → Settings → Secrets and variables → Actions → New repository secret.'), h('li', {}, 'Name: PUSH_SUBSCRIPTIONS, Wert: der kopierte Text.')),
        h('p', {}, 'Der Text enthält Adressdaten deines Geräts. Gib ihn nicht weiter und poste ihn nirgends öffentlich.')
      );
    }

    async function refresh() {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const perm = Notification.permission;
      if (perm === 'denied') {
        status.textContent = 'Benachrichtigungen sind für diese App blockiert. Erlaube sie in den iPhone-Einstellungen unter Mitteilungen.';
      } else if (sub) {
        status.textContent = 'Auf diesem Gerät angemeldet. Ob der Server tatsächlich sendet, hängt vom Secret PUSH_SUBSCRIPTIONS ab.';
        showSubscription(sub);
      } else {
        status.textContent = isIOS() && !isStandalone() ? 'Bitte zuerst zum Home-Bildschirm hinzufügen und die App von dort öffnen.' : 'Noch nicht angemeldet.';
      }
    }

    async function enable() {
      try {
        if (!cfg || !cfg.vapidPublicKey) {
          status.textContent = 'In docs/config.json fehlt „vapidPublicKey". Siehe README, Schritt 3.';
          return;
        }
        if (isIOS() && !isStandalone()) {
          status.textContent = 'Bitte zuerst zum Home-Bildschirm hinzufügen und die App von dort öffnen.';
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          status.textContent = 'Die Berechtigung wurde nicht erteilt.';
          return;
        }
        const sub =
          (await reg.pushManager.getSubscription()) ||
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey) }));
        status.textContent = 'Angemeldet.';
        showSubscription(sub);
      } catch (err) {
        status.textContent = `Anmeldung fehlgeschlagen: ${err.message || err}`;
      }
    }

    async function localTest() {
      try {
        if (Notification.permission !== 'granted') {
          status.textContent = 'Zuerst Benachrichtigungen aktivieren.';
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification('Lokaler Test', { body: 'Diese Anzeige kommt von der App selbst, nicht vom Server.', icon: 'icons/icon-192.png', tag: 'local-test' });
      } catch (err) {
        status.textContent = `Test fehlgeschlagen: ${err.message || err}`;
      }
    }

    async function copy() {
      try {
        await navigator.clipboard.writeText(textarea.value);
        copyBtn.textContent = 'Kopiert ✓';
      } catch {
        textarea.select();
        copyBtn.textContent = 'Bitte manuell kopieren';
      }
    }

    refresh().catch((e) => (status.textContent = String(e.message || e)));
    return card;
  }

  function configCard(cfg) {
    const card = h('section', { class: 'card' }, h('h3', {}, 'Themen und Uhrzeit'));
    if (!cfg) {
      card.append(h('p', {}, 'config.json konnte nicht geladen werden.'));
      return card;
    }
    card.append(
      h('p', {}, `Briefing täglich ab ${cfg.time} Uhr (Europa/Berlin), höchstens ${cfg.maxItems} Meldungen.`),
      h('ul', {}, cfg.topics.map((t) => h('li', {}, `${t.label}: ${t.enabled ? 'an' : 'aus'} (Gewicht ${t.weight})`))),
      h('p', {}, 'Quellen: ', cfg.feeds.map((f) => f.name).join(', ')),
      h('p', { class: 'muted' }, 'Hier wird nur angezeigt. Änderungen nimmst du in der Datei docs/config.json im GitHub-Repository vor; der nächste Lauf übernimmt sie.')
    );
    const owner = location.hostname.endsWith('.github.io') ? location.hostname.split('.')[0] : null;
    const repo = location.pathname.split('/')[1];
    if (owner && repo) {
      card.append(h('p', {}, h('a', { class: 'btn', href: `https://github.com/${owner}/${repo}/edit/main/docs/config.json`, target: '_blank', rel: 'noopener noreferrer' }, 'config.json bearbeiten ↗')));
    }
    return card;
  }

  function aboutCard() {
    return h(
      'section',
      { class: 'card' },
      h('h3', {}, 'Hinweise'),
      h('p', {}, 'Die Meldungen stammen direkt aus den RSS-Feeds der genannten Quellen. Die App erfindet nichts und fasst nur den Feed-Text kurz zusammen.'),
      h('p', {}, `Installiert als App: ${isStandalone() ? 'ja' : 'nein'}.`)
    );
  }

  // ---------- Start ----------
  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      if (t.dataset.view === 'today') state.date = null;
      show(t.dataset.view);
    })
  );

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker:', err));
  }

  show('today');
})();
