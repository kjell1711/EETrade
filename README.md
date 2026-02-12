# EETrade (Roblox OAuth + Auktionen)

Moderne Auktions-Webseite im iOS-inspirierten Dark-Design mit Roblox OAuth, Auktionsfeed, Bieten und Admin-Panel.

## Dateien

- `index.html` – komplette UI (Login, Feed, Erstellen, Detail, Admin)
- `app.js` – gesamte Frontend-Logik (OAuth-Flow, Session, Auktionen, Bieten, Admin)
- `server.js` – lokaler Server + sicherer OAuth Code->Token Austausch
- `config.json` – zentrale Konfiguration für OAuth, Preise, Session, Admins

## Roblox Creator Dashboard: Was du genau eintragen musst

Hier ist eine kompakte Checkliste für die OAuth-App in Roblox.

### 1) Basisdaten bei „Create App"

- **Name**: frei wählbar, z. B. `EETrade Login`
- **Description**: kurz erklären, z. B. `OAuth login for EETrade auction web app`
- **Creator/Owner**:
  - Wenn privat: dein persönlicher Account
  - Wenn Teamprojekt: die Gruppe, unter der die App laufen soll

> Eine extra "Account-ID" musst du in der Regel **nicht manuell** eintippen. Die ergibt sich aus dem gewählten Owner/Creator.

### 2) App-Icon / Bild

- Lade ein sauberes Quadrat hoch (z. B. 512x512 PNG).
- Das ist primär für Darstellung/Branding, nicht für OAuth-Funktion.

### 3) Rechtliche URLs (sehr wichtig)

Du brauchst in der Regel:

- **Privacy Policy URL (Datenschutz)**
- **Terms of Service URL (Nutzungsbedingungen)**

Wenn du noch keine echte Website hast, nimm für Testzwecke einfache statische Seiten (z. B. Notion/GitHub Pages). Für Produktion sollten es echte, öffentliche Seiten sein.

### 4) Redirect URL / Callback URL (entscheidend)

Für lokalen Test exakt eintragen:

- `http://localhost:8080/`

**Muss 1:1 identisch** sein mit `oauth.redirectUri` in `config.json`.

### 5) Scopes

Für deinen aktuellen Login-Flow reichen minimal:

- `openid`
- `profile`

(Genau so ist es aktuell in `config.json` hinterlegt.)

---

## Was in `config.json` stehen muss (1:1 mit Roblox App abgleichen)

Im Block `oauth`:

- `clientId` → aus Roblox OAuth App
- `clientSecret` → aus Roblox OAuth App
- `redirectUri` → exakt wie im Dashboard (`http://localhost:8080/`)
- `scope` → z. B. `openid profile`
- `authorizeUrl`, `tokenUrl`, `userInfoUrl` → Roblox Endpoints

Wenn Dashboard und Config unterschiedlich sind, schlägt OAuth fehl.


## Testmodus ohne OAuth (neu)

Wenn du Login kurzfristig ohne Roblox testen willst, setze in `config.json`:

```json
"disableOAuthLoginForTesting": true
```

Dann wird OAuth deaktiviert und stattdessen ein kleines Start-Modal angezeigt, in dem du einen Username eingibst.

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

## Fehlercheck (wenn Login nicht geht)

1. Redirect URL stimmt nicht exakt überein.
2. Falsche `clientId` oder `clientSecret`.
3. Scope in Dashboard passt nicht zu Scope in Config.
4. App ist im Dashboard noch nicht korrekt veröffentlicht/freigeschaltet.

## Hinweis für Produktion

`clientSecret` sollte nicht in einer öffentlich verteilten `config.json` liegen. In Produktion Secrets immer per Server-Umgebungsvariablen laden.
