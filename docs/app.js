// Oberfläche der Briefing-PWA. Reines JavaScript, keine Abhängigkeiten.
// Alle Inhalte aus Feeds werden ausschließlich als Text eingefügt (kein innerHTML).
(() => {
  'use strict';

  const view = document.querySelector('#view');
  const titleEl = document.querySelector('#title');
  const subtitleEl = document.querySelector('#subtitle');
  const mixEl = document.querySelector('#mix');
  const tabs = [...document.querySelectorAll('.tabs button')];
  const params = new URLSearchParams(location.search);
  const demo = params.get('demo') === '1';

  const state = { index: null, config: null, current: 'today', date: params.get('d'), shownAt: Date.now() };

  const CAT = {
    de: { label: 'Deutschland', cls: 'cat-de' },
    welt: { label: 'Welt', cls: 'cat-welt' },
    tech: { label: 'Technik und KI', cls: 'cat-tech' }
  };
  const catOf = (c) => CAT[c] || { label: c || 'Meldung', cls: 'cat-other' };

  // ---------- Hilfsfunktionen ----------
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function externalIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.4');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5');
    svg.append(p);
    return svg;
  }

  const safeUrl = (u) => {
    try {
      const url = new URL(u);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  };

  const dayFmt = (iso, opts) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ...opts }).format(new Date(`${iso}T12:00:00Z`));
  const timeFmt = (iso) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  async function getJSON(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  }

  function repoInfo() {
    const owner = location.hostname.endsWith('.github.io') ? location.hostname.split('.')[0] : null;
    const repo = location.pathname.split('/')[1];
    return owner && repo ? { owner, repo } : null;
  }

  function setHeader(title, subtitle = [], mix = null) {
    titleEl.textContent = title;
    subtitleEl.replaceChildren(...[].concat(subtitle).filter(Boolean).map((s) => h('span', {}, s)));
    if (mix && mix.length) {
      mixEl.hidden = false;
      mixEl.setAttribute('role', 'img');
      const counts = {};
      mix.forEach((c) => (counts[catOf(c).label] = (counts[catOf(c).label] || 0) + 1));
      mixEl.setAttribute('aria-label', `Mischung: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
      mixEl.replaceChildren(...mix.map((c) => h('span', { class: catOf(c).cls })));
    } else {
      mixEl.hidden = true;
      mixEl.replaceChildren();
    }
  }

  function show(name) {
    state.current = name;
    state.shownAt = Date.now();
    tabs.forEach((t) => {
      const on = t.dataset.view === name;
      t.classList.toggle('active', on);
      if (on) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    view.replaceChildren();
    window.scrollTo(0, 0);
    const render = { today: renderToday, archive: renderArchive, settings: renderSettings }[name];
    render().catch((err) => {
      setHeader('Das hat nicht geklappt');
      view.replaceChildren(
        h('div', { class: 'notice' }, h('p', {}, 'Die Seite konnte nicht geladen werden. Prüfe die Verbindung und öffne die App erneut.'), h('p', {}, String(err.message || err)))
      );
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
    generatedAt: new Date().toISOString(),
    notes: ['BEISPIELDATEN: Kein echtes Briefing. Diese Ansicht zeigt nur das Layout.'],
    items: [
      { rank: 1, title: 'Beispiel: Eine längere Überschrift zeigt, wie die wichtigste Meldung des Tages aussieht', summary: 'Kurze Erklärung in ein bis zwei Sätzen. Alles hier ist erfunden und dient nur der Ansicht des Layouts.', url: 'https://example.org/', source: 'Beispielquelle', category: 'tech', alsoReportedBy: ['Zweite Quelle'] },
      { rank: 2, title: 'Beispiel: Meldung aus Deutschland', summary: 'Zweite Beispielmeldung mit einem Satz Erklärung.', url: 'https://example.org/', source: 'Beispielquelle', category: 'de', alsoReportedBy: [] },
      { rank: 3, title: 'Beispiel: Meldung aus der Welt', summary: 'Dritte Beispielmeldung.', url: 'https://example.org/', source: 'Beispielquelle', category: 'welt', alsoReportedBy: [] },
      { rank: 4, title: 'Beispiel: Noch eine Meldung aus Deutschland', summary: 'Vierte Beispielmeldung.', url: 'https://example.org/', source: 'Beispielquelle', category: 'de', alsoReportedBy: [] },
      { rank: 5, title: 'Beispiel: Technik-Meldung ohne Kurzbeschreibung', summary: 'Keine Kurzbeschreibung im Feed. Details über den Quellenlink.', url: 'https://example.org/', source: 'Beispielquelle', category: 'tech', alsoReportedBy: [] }
    ]
  };

  // ---------- Ansicht: Heute ----------
  function storyItem(item, lead) {
    const href = safeUrl(item.url);
    const cat = catOf(item.category);
    const title = href
      ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, item.title)
      : item.title;
    return h(
      'li',
      { class: `story ${cat.cls}${lead ? ' story--lead' : ''}` },
      h('p', { class: 'story-cat' }, cat.label),
      h('h2', { class: 'story-title' }, title),
      h('p', { class: 'story-sum' }, item.summary),
      h(
        'p',
        { class: 'story-meta' },
        h('strong', {}, item.source, href ? externalIcon() : null),
        item.alsoReportedBy && item.alsoReportedBy.length ? h('span', {}, `auch bei ${item.alsoReportedBy.join(', ')}`) : null
      )
    );
  }

  function emptyState() {
    const info = repoInfo();
    const when = state.config ? `${state.config.time} Uhr` : 'der eingestellten Uhrzeit';
    return h(
      'div',
      { class: 'sheet empty' },
      h('h2', {}, 'Noch kein Briefing da'),
      h('p', {}, `Das erste Briefing entsteht beim nächsten geplanten Lauf um ${when}. Du kannst es auch sofort erstellen lassen: In GitHub unter „Actions" den Workflow „Tägliches Briefing" starten.`),
      info ? h('a', { class: 'btn primary', href: `https://github.com/${info.owner}/${info.repo}/actions/workflows/briefing.yml`, target: '_blank', rel: 'noopener noreferrer' }, 'Workflow öffnen') : null
    );
  }

  async function renderToday() {
    await loadConfig();
    if (demo) {
      setHeader(dayFmt(SAMPLE.date, { weekday: 'long', day: 'numeric', month: 'long' }), ['Vorschau mit Beispieldaten'], SAMPLE.items.map((i) => i.category));
      view.append(h('div', { class: 'notice' }, SAMPLE.notes.map((n) => h('p', {}, n))), h('ol', { class: 'sheet stories' }, SAMPLE.items.map((i, n) => storyItem(i, n === 0))));
      return;
    }
    const index = await loadIndex();
    const latest = index.briefings[0]?.date;
    const date = state.date || latest;
    if (!date) {
      setHeader('Briefing');
      view.append(emptyState());
      return;
    }
    const b = await getJSON(`data/${date}.json`);
    const n = b.items.length;
    setHeader(
      dayFmt(b.date, { weekday: 'long', day: 'numeric', month: 'long' }),
      [`${n} ${n === 1 ? 'Meldung' : 'Meldungen'}`, `Stand ${timeFmt(b.generatedAt)} Uhr`],
      b.items.map((i) => i.category)
    );
    if (state.date && latest && state.date !== latest) {
      view.append(
        h(
          'div',
          { class: 'older' },
          h('span', {}, 'Das ist eine ältere Ausgabe.'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn small',
              onclick: () => {
                state.date = null;
                show('today');
              }
            },
            'Zum neuesten'
          )
        )
      );
    }
    if (b.notes && b.notes.length) view.append(h('div', { class: 'notice' }, b.notes.map((t) => h('p', {}, t))));
    view.append(h('ol', { class: 'sheet stories' }, b.items.map((i, k) => storyItem(i, k === 0))));
    view.append(
      h('p', { class: 'foot' }, b.mode === 'regeln' ? 'Die Auswahl folgt festen Regeln. Die Texte stammen aus den Feeds der Quellen, eine KI ist nicht beteiligt.' : `Modus: ${b.mode}.`)
    );
  }

  // ---------- Ansicht: Archiv ----------
  async function renderArchive() {
    const index = await loadIndex();
    setHeader('Archiv', index.briefings.length ? [`${index.briefings.length} ${index.briefings.length === 1 ? 'Ausgabe' : 'Ausgaben'}`] : []);
    if (!index.briefings.length) {
      await loadConfig();
      view.append(emptyState());
      return;
    }
    const box = h('div', { class: 'sheet' });
    for (const b of index.briefings) {
      box.append(
        h(
          'button',
          {
            type: 'button',
            class: 'archive-row',
            onclick: () => {
              state.date = b.date;
              show('today');
            }
          },
          h('div', { class: 'archive-day' }, h('b', {}, dayFmt(b.date, { day: 'numeric' })), h('span', {}, dayFmt(b.date, { month: 'short' }))),
          h('div', {}, h('p', { class: 'archive-head' }, b.title), h('span', { class: 'archive-count' }, `${dayFmt(b.date, { weekday: 'long' })}, ${b.count} ${b.count === 1 ? 'Meldung' : 'Meldungen'}`))
        )
      );
    }
    view.append(box);
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
    view.append(
      h('h2', { class: 'group-title' }, 'Benachrichtigungen'),
      pushSheet(cfg),
      h('h2', { class: 'group-title' }, 'Briefing'),
      briefingSheet(cfg),
      h('h2', { class: 'group-title' }, 'Hinweise'),
      aboutSheet()
    );
  }

  function pushSheet(cfg) {
    const sheet = h('div', { class: 'sheet' });
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

    if (!supported) {
      const iosHint = isIOS() && !isStandalone();
      sheet.append(
        h(
          'div',
          { class: 'text-block' },
          iosHint
            ? [
                h('p', {}, 'Auf dem iPhone funktioniert Push nur in der installierten App (iOS 16.4 oder neuer):'),
                h('ol', {}, h('li', {}, 'In Safari auf „Teilen" tippen.'), h('li', {}, '„Zum Home-Bildschirm" wählen und hinzufügen.'), h('li', {}, 'Die App über das neue Icon öffnen und hier erneut nachsehen.'))
              ]
            : h('p', {}, 'Dieser Browser unterstützt keine Web-Push-Nachrichten.')
        )
      );
      return sheet;
    }

    const stateEl = h('div', { class: 'state' }, h('span', {}, 'Wird geprüft'));
    const noteEl = h('p', { class: 'state-note' });
    const textarea = h('textarea', { readonly: true, 'aria-label': 'Push-Anmeldung als Text' });
    const details = h('details', { class: 'sub-text', hidden: true }, h('summary', {}, 'Anmeldetext anzeigen'), textarea);
    const copyBtn = h('button', { type: 'button', class: 'btn primary', hidden: true, onclick: copy }, 'Anmeldung kopieren');
    const subBtn = h('button', { type: 'button', class: 'btn primary', onclick: enable }, 'Benachrichtigungen aktivieren');
    const testBtn = h('button', { type: 'button', class: 'btn', onclick: localTest }, 'Lokaler Test (kein echter Push)');
    const help = h('div', { class: 'text-block', hidden: true });

    sheet.append(stateEl, noteEl, h('div', { class: 'actions' }, subBtn, copyBtn, testBtn), details, help);

    function setState(kind, text, note = '') {
      stateEl.className = `state ${kind}`;
      stateEl.replaceChildren(h('span', {}, text));
      noteEl.textContent = note;
      noteEl.hidden = !note;
    }

    function showSubscription(sub) {
      textarea.value = JSON.stringify(sub.toJSON());
      details.hidden = false;
      copyBtn.hidden = false;
      subBtn.hidden = true;
      help.hidden = false;
      help.replaceChildren(
        h('p', { class: 'muted' }, 'Letzter Schritt, einmalig: Kopiere die Anmeldung und speichere sie in GitHub als Secret, damit der Server dir Push senden kann.'),
        h('ol', {}, h('li', {}, '„Anmeldung kopieren" tippen.'), h('li', {}, 'Im GitHub-Repository: Settings, Secrets and variables, Actions, New repository secret.'), h('li', {}, 'Name PUSH_SUBSCRIPTIONS, Wert: der kopierte Text.')),
        h('p', { class: 'muted' }, 'Der Text enthält Adressdaten deines Geräts. Gib ihn nicht weiter und poste ihn nirgends öffentlich.')
      );
    }

    async function refresh() {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (Notification.permission === 'denied') {
        setState('off', 'Blockiert', 'Erlaube Mitteilungen für diese App in den iPhone-Einstellungen unter Mitteilungen.');
      } else if (sub) {
        setState('on', 'Auf diesem Gerät angemeldet', 'Ob der Server sendet, hängt vom Secret PUSH_SUBSCRIPTIONS ab.');
        showSubscription(sub);
      } else if (isIOS() && !isStandalone()) {
        setState('', 'Noch nicht angemeldet', 'Füge die App zuerst zum Home-Bildschirm hinzu und öffne sie von dort.');
      } else {
        setState('', 'Noch nicht angemeldet');
      }
    }

    async function enable() {
      try {
        if (!cfg || !cfg.vapidPublicKey) {
          setState('off', 'Public Key fehlt', 'Trage in docs/config.json bei „vapidPublicKey" den Public Key ein (README, Schritt 3).');
          return;
        }
        if (isIOS() && !isStandalone()) {
          setState('off', 'App nicht installiert', 'Füge die App zuerst zum Home-Bildschirm hinzu und öffne sie von dort.');
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          setState('off', 'Nicht erlaubt', 'Du hast Mitteilungen nicht erlaubt. Das lässt sich in den iPhone-Einstellungen ändern.');
          return;
        }
        const sub =
          (await reg.pushManager.getSubscription()) ||
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey) }));
        setState('on', 'Auf diesem Gerät angemeldet', 'Ob der Server sendet, hängt vom Secret PUSH_SUBSCRIPTIONS ab.');
        showSubscription(sub);
      } catch (err) {
        setState('off', 'Anmeldung fehlgeschlagen', String(err.message || err));
      }
    }

    async function localTest() {
      try {
        if (Notification.permission !== 'granted') {
          setState('off', 'Nicht erlaubt', 'Aktiviere zuerst die Benachrichtigungen.');
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification('Lokaler Test', { body: 'Diese Anzeige kommt von der App selbst, nicht vom Server.', icon: 'icons/icon-192.png', tag: 'local-test' });
      } catch (err) {
        setState('off', 'Test fehlgeschlagen', String(err.message || err));
      }
    }

    async function copy() {
      try {
        await navigator.clipboard.writeText(textarea.value);
        copyBtn.textContent = 'Kopiert';
      } catch {
        details.open = true;
        textarea.select();
        copyBtn.textContent = 'Text markiert, bitte manuell kopieren';
      }
    }

    refresh().catch((e) => setState('off', 'Status unbekannt', String(e.message || e)));
    return sheet;
  }

  function briefingSheet(cfg) {
    const sheet = h('div', { class: 'sheet' });
    if (!cfg) {
      sheet.append(h('div', { class: 'text-block' }, h('p', {}, 'Die Datei config.json konnte nicht geladen werden.')));
      return sheet;
    }
    sheet.append(
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Uhrzeit'), h('span', { class: 'v' }, `täglich ab ${cfg.time} Uhr (Berlin)`)),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Meldungen'), h('span', { class: 'v' }, `höchstens ${cfg.maxItems}`)),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Themen'), h('span', { class: 'v' }, cfg.topics.filter((t) => t.enabled).map((t) => t.label).join(', '))),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Quellen'), h('span', { class: 'v' }, cfg.feeds.map((f) => f.name).join(', ')))
    );
    const info = repoInfo();
    if (info) {
      sheet.append(
        h(
          'div',
          { class: 'text-block' },
          h('p', { class: 'muted' }, 'Änderungen machst du in der Datei config.json im GitHub-Repository. Der nächste Lauf übernimmt sie.'),
          h('a', { class: 'btn', href: `https://github.com/${info.owner}/${info.repo}/edit/main/docs/config.json`, target: '_blank', rel: 'noopener noreferrer' }, 'Einstellungen bearbeiten')
        )
      );
    }
    return sheet;
  }

  function aboutSheet() {
    return h(
      'div',
      { class: 'sheet' },
      h(
        'div',
        { class: 'text-block' },
        h('p', {}, 'Die Meldungen stammen direkt aus den RSS-Feeds der genannten Quellen. Die App erfindet nichts und kürzt nur den Text aus dem Feed.'),
        h('p', { class: 'muted' }, `Als App installiert: ${isStandalone() ? 'ja' : 'nein'}`)
      )
    );
  }

  // ---------- Start ----------
  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      if (t.dataset.view === 'today') state.date = null;
      show(t.dataset.view);
    })
  );

  // Die installierte App hat keinen Neu-laden-Knopf. Beim Zurückkehren nach über einer Minute neu laden.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (state.current === 'settings' || Date.now() - state.shownAt < 60000) return;
    state.index = null;
    show(state.current);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker:', err));
  }

  show('today');
})();
