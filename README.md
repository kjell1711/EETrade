# EETrade (MVP)

Moderne Auktions-Webseite im iOS-inspirierten Dark-Design mit OAuth-Login, Live-Auktionsfeed und Admin-Panel.

## Dateien

- `index.html` – komplette UI (Login, Feed, Erstellen, Detail, Admin)
- `app.js` – gesamte Frontend-Logik (OAuth, Session, Auktionen, Bieten, Admin)
- `config.json` – zentrale Konfiguration

## OAuth-Konfiguration

Bearbeite in `config.json` den Block `oauth`:

```json
{
  "oauth": {
    "providerName": "Roklus OAuth",
    "authorizeUrl": "https://auth.example.com/oauth/authorize",
    "tokenExchangeEndpoint": "",
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET",
    "redirectUri": "http://localhost:8080/",
    "scope": "openid profile email",
    "responseType": "code",
    "usePkce": true
  }
}
```

### Hinweise

- `clientId`, `clientSecret`, `redirectUri`, `scope` zentral nur in **einer** Datei pflegbar.
- In dieser MVP ist OAuth-End-to-End vorbereitet.
- Wenn `tokenExchangeEndpoint` gesetzt wird, sendet die App den Callback-Code dorthin und erwartet JSON mit `username`.
- Ohne Backend-Endpoint nutzt die App einen lokalen Fallback-Login (`oauth_<code>`), damit der Ablauf testbar bleibt.

## Starten

```bash
python3 -m http.server 8080
```

Dann öffnen:

- `http://localhost:8080/`

## MVP-Funktionen

- OAuth-Login + Session (mit TTL)
- Auktionen erstellen (Preisgrenzen aus Config)
- Bieten per Schnellschritten oder freiem Betrag
- Sortierung nach letzter Aktivität
- Verlaufsliste pro Auktion
- Admin-Panel: User sperren/entsperren + Auktion löschen

