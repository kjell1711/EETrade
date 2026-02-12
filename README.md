# EETrade (Roblox OAuth + Auktionen)

Moderne Auktions-Webseite im iOS-inspirierten Dark-Design mit Roblox OAuth, Auktionsfeed, Bieten und Admin-Panel.

## Dateien

- `index.html` – komplette UI (Login, Feed, Erstellen, Detail, Admin)
- `app.js` – gesamte Frontend-Logik (OAuth-Flow, Session, Auktionen, Bieten, Admin)
- `server.js` – lokaler Server + sicherer OAuth Code->Token Austausch
- `config.json` – zentrale Konfiguration für OAuth, Preise, Session, Admins

## Sehr wichtig: Redirect URL wird in Roblox eingetragen (nicht im Script)

Du trägst die Redirect URL in **Roblox Creator Dashboard** bei deiner OAuth App ein.

### Schritt-für-Schritt

1. Öffne dein Roblox OAuth Application Dashboard.
2. Gehe zu den OAuth-Einstellungen deiner App.
3. Füge unter **Redirect URLs / Callback URLs** genau diese URL hinzu:
   - `http://localhost:8080/`
4. Speichern.
5. Stelle sicher, dass **die gleiche URL** in `config.json` unter `oauth.redirectUri` steht.

Wenn die URL in Roblox und `config.json` nicht exakt gleich ist, schlägt Login fehl.

## OAuth Konfiguration (zentral)

Alle OAuth-Werte sind in `config.json` gesammelt:

- `clientId`
- `clientSecret`
- `redirectUri`
- `scope`
- `authorizeUrl`
- `tokenUrl`
- `userInfoUrl`

Die Website sendet den OAuth-Code an `/api/oauth/exchange`, und **server.js** macht den Token-Tausch sicher auf dem Server.

## Starten

```bash
node server.js
```

Dann öffnen:

- `http://localhost:8080/`

## Was funktioniert jetzt

- Roblox OAuth Start (Authorization Code + PKCE)
- Callback-Verarbeitung im Frontend
- Serverseitiger Token-Austausch (`/api/oauth/exchange`)
- User-Login Session (TTL in Config)
- Auktion erstellen mit Preisgrenzen
- Bieten mit festen Steps + individueller Erhöhung
- Sortierung nach letzter Aktivität
- Admin-Panel (User sperren/entsperren, Auktion löschen)

## Hinweis für Produktion

In Produktion sollte `clientSecret` aus einer sicheren Secret-Umgebung kommen (nicht aus einer öffentlichen Datei).
