# Mein Tages-Briefing (PWA, kostenlose Variante)

Ein tägliches Nachrichten-Briefing (max. 5 Meldungen, Schwerpunkt Technik/KI) als installierbare Web-App mit Push-Benachrichtigung. Läuft ohne eigenen Server auf GitHub (Pages + Actions) und ohne KI-Dienst.

> **Status:** Dieses Paket ist ein Gerüst. Echte Briefings und Push-Nachrichten gibt es erst, nachdem du die Schritte unten durchlaufen und getestet hast. Die Oberfläche allein (auch `?demo=1`) liefert nichts Echtes.

## So funktioniert es

| Teil | Datei(en) | Aufgabe |
|---|---|---|
| Oberfläche | `docs/index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest` | zeigt Briefing, Archiv, Einstellungen; meldet Push an |
| Tägliche Ausführung | `.github/workflows/briefing.yml`, `scripts/should-run.js` | startet alle 30 Min. im Zeitband, prüft Berliner Uhrzeit, erzeugt höchstens ein Briefing pro Tag |
| Nachrichtenbeschaffung | `scripts/lib/fetch-news.js`, `xml.js` | liest RSS-Feeds (tagesschau.de, heise online, Deutsche Welle) |
| Auswahl | `scripts/lib/rank.js` | entfernt Duplikate, bewertet nach Aktualität, Themen und Zahl der Quellen |
| Zusammenfassung | `scripts/lib/summarize.js` | Version 1: Teaser aus dem Feed, auf 1–2 Sätze gekürzt (keine KI) |
| Push-Versand | `scripts/send-push.js` | sendet Web-Push über deine VAPID-Schlüssel |
| Archiv | `docs/data/*.json` | wird vom Workflow ins Repo geschrieben, die App liest es |

Es werden nur Artikel angezeigt, die wirklich in den Feeds stehen. Titel, Link und Quelle stammen unverändert aus dem Feed.

## Einrichtung

### 1. Repository anlegen und Dateien hochladen
1. Auf github.com einloggen → **New repository**. Name z. B. `briefing`, Sichtbarkeit **Public** (kostenloses Pages braucht ein öffentliches Repo).
2. ZIP entpacken und den **Inhalt** in das Repo hochladen (**Add file → Upload files**).
3. Der Ordner `.github` ist ein versteckter Ordner und wird beim Hochladen gern übersehen. Prüfe im Repo, ob `.github/workflows/briefing.yml` vorhanden ist. Falls nicht: **Add file → Create new file**, als Dateiname `.github/workflows/briefing.yml` eingeben und den Inhalt der Datei einfügen.
   (Mac: im Finder werden versteckte Dateien mit Cmd+Shift+. sichtbar.)

### 2. Schreibrechte und Pages
1. **Settings → Actions → General → Workflow permissions** → *Read and write permissions* → Save.
2. **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`, Ordner `/docs` → Save.
3. Nach ca. 1–2 Minuten ist die App erreichbar unter `https://DEIN-NAME.github.io/REPO-NAME/`.

### 3. Push-Schlüssel erzeugen (einmalig)
Auf einem Rechner mit Node.js:

```bash
npx web-push generate-vapid-keys
```

- Den **Public Key** trägst du in `docs/config.json` bei `"vapidPublicKey"` ein (im Repo bearbeiten und speichern).
- Unter **Settings → Secrets and variables → Actions → New repository secret** legst du an:
  - `VAPID_PUBLIC_KEY` = Public Key
  - `VAPID_PRIVATE_KEY` = Private Key (geheim halten, nirgends posten, auch nicht im Chat)
  - `VAPID_SUBJECT` = `mailto:deine-adresse@beispiel.de`

### 4. Erster Test ohne Push
**Actions → Tägliches Briefing → Run workflow** mit *force* an und *push* aus. Nach ca. 1 Minute liegt `docs/data/<Datum>.json` im Repo, nach weiteren 1–2 Minuten ist es in der App sichtbar. Sieh in den Logs nach, ob alle drei Quellen erreicht wurden. Ausgefallene Quellen erscheinen als Hinweis im Briefing.

### 5. iPhone: App installieren und Push anmelden
1. Adresse in **Safari** öffnen → **Teilen → Zum Home-Bildschirm** → Hinzufügen.
2. App über das **Icon auf dem Home-Bildschirm** öffnen (nicht im Safari-Tab). Voraussetzung: iOS 16.4 oder neuer.
3. **Einstellungen → Benachrichtigungen aktivieren** → Erlauben.
4. Den angezeigten Text kopieren und als GitHub-Secret `PUSH_SUBSCRIPTIONS` speichern.

### 6. Push testen
**Run workflow** mit *force* an und *push* an. Die Nachricht kommt erst, wenn das Briefing online erreichbar ist (bis zu 8 Minuten Wartezeit im Workflow). Mit „Lokaler Test" in den Einstellungen prüfst du nur, ob das iPhone Mitteilungen der App anzeigen darf, das ist kein echter Push.

### 7. Automatik
Danach läuft der Zeitplan von selbst. Die Uhrzeit steht in `docs/config.json` (`"time": "07:00"`, Berliner Zeit, Sommer-/Winterzeit wird berücksichtigt).

## Einstellungen ändern
Themen, Gewichte, Uhrzeit, Anzahl der Meldungen und Quellen stehen in `docs/config.json`. Bearbeiten über GitHub (Stift-Symbol). Die Einstellungsseite der App zeigt sie nur an; Änderungen aus der App heraus bräuchten ein kleines Backend (mögliche Version 2).

## Kosten
- **Kostenlos:** GitHub Pages und Actions für öffentliche Repositories (im üblichen Kontingent), Web-Push, RSS-Feeds, `github.io`-Adresse. Kein Apple-Developer-Account nötig.
- **Nicht enthalten:** KI-Zusammenfassung (würde bei der Claude API pro Nutzung kosten) und eigene Domain.
- Konditionen können sich ändern. Prüfe sie bei GitHub, wenn du dich darauf verlassen willst.

## Bekannte Grenzen
- **Pünktlichkeit:** GitHub startet geplante Läufe oft verspätet. Rechne mit „kurz nach 07:00", nicht punktgenau.
- **Inaktive Repos:** GitHub kann geplante Workflows in Repos ohne Aktivität pausieren. Das tägliche Commit des Briefings spricht dagegen, garantiert ist es nicht.
- **Öffentliches Repo:** Briefings und `config.json` sind öffentlich lesbar. Geheim bleiben nur die Secrets. Die Push-Anmeldung gehört **nur** ins Secret, nie ins Repo.
- **Auswahl ohne KI:** Die Relevanz ist eine Näherung durch Schlüsselwörter, Aktualität und Mehrfachberichterstattung. Die „Erklärung" ist der Teaser des Verlags; manche Feeds (z. B. heise) liefern keinen, dann steht ein Hinweis.
- **Feed-Adressen:** Sie sind eingetragen, aber noch nicht live geprüft. Der erste Testlauf zeigt es. Pro Quelle gibt es eine Ersatz-Adresse.
- **iPhone:** Push nur in der installierten App, Fokus-Modi können Mitteilungen unterdrücken, und läuft die Anmeldung ab (Fehler 404/410 im Log), muss sie in der App erneuert werden.
- **Nicht im Paket:** Mehrere Geräte brauchen ein Array im Secret (`[{...},{...}]`).

## Entwicklung
```bash
npm install
npm test          # Tests mit Beispiel-XML, kein Netzwerk nötig
npm run briefing  # holt echte Feeds und schreibt docs/data/
```

## Fehlersuche
- **Kein Briefing im Archiv:** Actions-Log öffnen. „noch zu früh" / „existiert bereits" heißt: Die Zeitsteuerung hat bewusst nichts getan. Zum Erzwingen *force* nutzen.
- **Push kommt nicht:** Secrets vorhanden? `VAPID_SUBJECT` als `mailto:` gültig? App vom Home-Bildschirm geöffnet? Log von „Push-Nachricht senden" prüfen.
- **App zeigt Altes:** App schließen und neu öffnen (Cache wird bei Netz aktualisiert).
