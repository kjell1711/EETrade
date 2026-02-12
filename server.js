const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (requestUrl.pathname === "/api/health") {
      return json(res, 200, { ok: true });
    }

    if (requestUrl.pathname === "/api/oauth/exchange" && req.method === "POST") {
      const body = await readJson(req);
      const config = readConfig();
      return await handleOAuthExchange(res, body, config);
    }

    return serveStatic(res, requestUrl.pathname);
  } catch (error) {
    return json(res, 500, { error: error.message || "Serverfehler" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`EETrade läuft auf http://${HOST}:${PORT}`);
});

function serveStatic(res, pathname) {
  const filePath = pathname === "/" ? path.join(ROOT, "index.html") : path.join(ROOT, pathname);
  const normalized = path.normalize(filePath);

  if (!normalized.startsWith(ROOT)) {
    return json(res, 403, { error: "forbidden" });
  }

  if (!fs.existsSync(normalized) || fs.statSync(normalized).isDirectory()) {
    return json(res, 404, { error: "not_found" });
  }

  const ext = path.extname(normalized);
  const contentType = MIME[ext] || "application/octet-stream";
  const stream = fs.createReadStream(normalized);

  res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
  stream.pipe(res);
}

async function handleOAuthExchange(res, body, config) {
  const oauth = config.oauth;

  if (!body?.code) {
    return json(res, 400, { error: "code fehlt" });
  }

  if (!oauth.clientId || !oauth.clientSecret || oauth.clientSecret === "YOUR_CLIENT_SECRET") {
    return json(res, 500, { error: "OAuth ist nicht vollständig konfiguriert (clientId/clientSecret)." });
  }

  const tokenResponse = await fetch(oauth.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      redirect_uri: oauth.redirectUri,
      code: body.code,
      code_verifier: body.codeVerifier || ""
    })
  });

  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok) {
    return json(res, 502, { error: "Token-Endpoint Fehler", details: tokenData });
  }

  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return json(res, 502, { error: "Kein access_token erhalten", details: tokenData });
  }

  const username = await resolveUsername(oauth.userInfoUrl, accessToken);
  if (!username) {
    return json(res, 502, { error: "Nutzername konnte nicht aufgelöst werden", details: tokenData });
  }

  return json(res, 200, { username });
}

async function resolveUsername(userInfoUrl, accessToken) {
  const response = await fetch(userInfoUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return null;

  return data.preferred_username || data.username || data.name || data.sub || data.id || null;
}

function readConfig() {
  const configPath = path.join(ROOT, "config.json");
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request zu groß"));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Ungültiges JSON"));
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}
