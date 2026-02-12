const STORAGE_KEY = "eetrade-state-v2";
const SESSION_KEY = "eetrade-session-v2";
const OAUTH_STATE_KEY = "eetrade-oauth-state";
const OAUTH_PKCE_VERIFIER_KEY = "eetrade-pkce-verifier";

const state = {
  config: null,
  session: null,
  users: [],
  auctions: [],
  bids: [],
  selectedAuctionId: null
};

const el = {
  testLoginModal: document.getElementById("testLoginModal"),
  testLoginForm: document.getElementById("testLoginForm"),
  loginScreen: document.getElementById("loginScreen"),
  appScreen: document.getElementById("appScreen"),
  oauthLoginBtn: document.getElementById("oauthLoginBtn"),
  oauthHint: document.getElementById("oauthHint"),
  logoutBtn: document.getElementById("logoutBtn"),
  currentUserChip: document.getElementById("currentUserChip"),
  sessionChip: document.getElementById("sessionChip"),
  auctionList: document.getElementById("auctionList"),
  auctionDetail: document.getElementById("auctionDetail"),
  createAuctionForm: document.getElementById("createAuctionForm"),
  adminPanel: document.getElementById("adminPanel"),
  adminUsers: document.getElementById("adminUsers")
};

void bootstrap();

async function bootstrap() {
  state.config = await loadConfig();
  hydrateState();
  hydrateSession();

  el.oauthLoginBtn.addEventListener("click", startOAuthLogin);
  el.logoutBtn.addEventListener("click", logout);
  el.createAuctionForm.addEventListener("submit", onCreateAuction);
  el.testLoginForm?.addEventListener("submit", onTestLogin);

  await handleOAuthCallbackIfPresent();
  render();
}

function isTestLoginMode() {
  return Boolean(state.config.oauth?.disableOAuthLoginForTesting);
}

async function loadConfig() {
  const response = await fetch("./config.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("config.json konnte nicht geladen werden.");
  }
  return response.json();
}

function hydrateState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state.users = [{ id: "u-admin", username: "admin", isAdmin: true, isBlocked: false }];
    persistState();
    return;
  }

  const parsed = JSON.parse(raw);
  state.users = parsed.users ?? [];
  state.auctions = parsed.auctions ?? [];
  state.bids = parsed.bids ?? [];
}

function persistState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ users: state.users, auctions: state.auctions, bids: state.bids })
  );
}

function hydrateSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return;

  const parsed = JSON.parse(raw);
  if (Date.now() > parsed.expiresAt) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }

  state.session = parsed;
}

function persistSession() {
  if (!state.session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
}

function getCurrentUser() {
  if (!state.session) return null;
  return state.users.find((user) => user.id === state.session.userId) ?? null;
}

function resolveIsAdmin(username) {
  return state.config.admin.adminUsernames.map((entry) => entry.toLowerCase()).includes(username.toLowerCase());
}

async function startOAuthLogin() {
  if (isTestLoginMode()) {
    setHint("OAuth ist in config.json deaktiviert. Nutze den Test-Login.");
    return;
  }

  const oauth = state.config.oauth;

  if (!oauth.clientId || oauth.clientId === "YOUR_CLIENT_ID") {
    setHint("Bitte trage zuerst OAuth-Werte in config.json ein (clientId, redirectUri, scope).");
    return;
  }

  const stateValue = crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: oauth.responseType,
    client_id: oauth.clientId,
    redirect_uri: oauth.redirectUri,
    scope: oauth.scope,
    state: stateValue
  });

  localStorage.setItem(OAUTH_STATE_KEY, stateValue);

  if (oauth.usePkce) {
    const verifier = createPkceVerifier();
    const challenge = await createCodeChallenge(verifier);
    localStorage.setItem(OAUTH_PKCE_VERIFIER_KEY, verifier);
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
  }

  window.location.href = `${oauth.authorizeUrl}?${params.toString()}`;
}

async function handleOAuthCallbackIfPresent() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const callbackState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    setHint(`OAuth-Fehler: ${oauthError}`);
    return;
  }

  if (!code || !callbackState) return;

  const expectedState = localStorage.getItem(OAUTH_STATE_KEY);
  if (!expectedState || expectedState !== callbackState) {
    setHint("OAuth-Login abgebrochen: ungültiger State.");
    return;
  }

  try {
    const username = await resolveOAuthIdentity(code);
    ensureUser(username);
    loginAs(username);
    setHint(`Erfolgreich angemeldet als ${username}.`);
  } catch (error) {
    setHint(error.message || "OAuth Callback konnte nicht verarbeitet werden.");
  }

  localStorage.removeItem(OAUTH_STATE_KEY);
  localStorage.removeItem(OAUTH_PKCE_VERIFIER_KEY);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  url.searchParams.delete("error");
  window.history.replaceState({}, "", url.toString());
}

async function resolveOAuthIdentity(code) {
  const oauth = state.config.oauth;
  const payload = {
    code,
    redirectUri: oauth.redirectUri,
    codeVerifier: localStorage.getItem(OAUTH_PKCE_VERIFIER_KEY) || "",
    provider: oauth.providerName
  };

  const response = await fetch(oauth.tokenExchangeEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token-Austausch fehlgeschlagen: ${errorText || response.status}`);
  }

  const data = await response.json();
  if (!data.username) {
    throw new Error("OAuth-Server lieferte keinen Benutzernamen zurück.");
  }

  return String(data.username);
}

function ensureUser(username) {
  if (state.users.some((user) => user.username === username)) return;

  state.users.push({
    id: `u-${crypto.randomUUID()}`,
    username,
    isAdmin: resolveIsAdmin(username),
    isBlocked: false
  });
  persistState();
}

function loginAs(username) {
  const user = state.users.find((entry) => entry.username === username);
  if (!user) return;

  if (user.isBlocked) {
    setHint("Dieser Account wurde gesperrt.");
    return;
  }

  const ttl = state.config.session.ttlMinutes;
  state.session = {
    userId: user.id,
    token: crypto.randomUUID(),
    expiresAt: Date.now() + ttl * 60_000
  };
  persistSession();
}

function logout() {
  state.session = null;
  persistSession();
  render();
}

function onTestLogin(event) {
  event.preventDefault();
  if (!isTestLoginMode()) return;

  const form = new FormData(el.testLoginForm);
  const username = String(form.get("testUsername") || "").trim();
  if (!username) return;

  ensureUser(username);
  loginAs(username);
  render();
}

function onCreateAuction(event) {
  event.preventDefault();
  const user = getCurrentUser();
  if (!user) return;
  if (user.isBlocked) return;

  const form = new FormData(el.createAuctionForm);
  const itemName = String(form.get("itemName") || "").trim();
  const startPrice = Number(form.get("startPrice") || 0);

  const { minStartPrice, maxStartPrice } = state.config.pricing;
  if (!itemName || startPrice < minStartPrice || startPrice > maxStartPrice) {
    alert(`Startpreis muss zwischen ${formatMoney(minStartPrice)} und ${formatMoney(maxStartPrice)} liegen.`);
    return;
  }

  const now = Date.now();
  const auction = {
    id: `a-${crypto.randomUUID()}`,
    itemName,
    sellerId: user.id,
    startPrice,
    currentPrice: startPrice,
    createdAt: now,
    updatedAt: now,
    status: "active"
  };

  state.auctions.push(auction);
  state.selectedAuctionId = auction.id;
  persistState();
  el.createAuctionForm.reset();
  render();
}

function placeBid(auctionId, increment) {
  const user = getCurrentUser();
  if (!user || user.isBlocked) return;

  const auction = state.auctions.find((entry) => entry.id === auctionId && entry.status === "active");
  if (!auction || increment <= 0) return;

  const nextAmount = auction.currentPrice + increment;
  const bid = {
    id: `b-${crypto.randomUUID()}`,
    auctionId,
    userId: user.id,
    amount: nextAmount,
    createdAt: Date.now()
  };

  auction.currentPrice = nextAmount;
  auction.updatedAt = bid.createdAt;
  state.bids.push(bid);
  persistState();
  render();
}

function deleteAuction(auctionId) {
  state.auctions = state.auctions.filter((auction) => auction.id !== auctionId);
  state.bids = state.bids.filter((bid) => bid.auctionId !== auctionId);
  if (state.selectedAuctionId === auctionId) state.selectedAuctionId = null;
  persistState();
  render();
}

function toggleUserBlock(userId) {
  const user = state.users.find((entry) => entry.id === userId);
  if (!user || user.username === "admin") return;
  user.isBlocked = !user.isBlocked;
  persistState();

  if (state.session?.userId === user.id && user.isBlocked) {
    logout();
    setHint("Dein Account wurde vom Admin gesperrt.");
    return;
  }

  render();
}

function render() {
  const user = getCurrentUser();
  const loggedIn = Boolean(user);
  const testMode = isTestLoginMode();

  el.testLoginModal?.classList.toggle("hidden", !(testMode && !loggedIn));

  el.loginScreen.classList.toggle("hidden", loggedIn || testMode);
  el.appScreen.classList.toggle("hidden", !loggedIn);

  if (!loggedIn) return;

  const remainingMinutes = Math.max(0, Math.floor((state.session.expiresAt - Date.now()) / 60_000));
  el.currentUserChip.textContent = `${user.username}${user.isAdmin ? " (Admin)" : ""}`;
  el.sessionChip.textContent = `Session: ${remainingMinutes} min`;

  renderAuctionList();
  renderAuctionDetail();
  renderAdminPanel();
}

function renderAuctionList() {
  const sorted = [...state.auctions].sort((a, b) => b.updatedAt - a.updatedAt);

  if (!state.selectedAuctionId && sorted.length > 0) {
    state.selectedAuctionId = sorted[0].id;
  }

  el.auctionList.innerHTML = "";
  if (sorted.length === 0) {
    el.auctionList.innerHTML = "<p class='subtitle'>Noch keine Auktionen vorhanden.</p>";
    return;
  }

  sorted.forEach((auction) => {
    const seller = state.users.find((user) => user.id === auction.sellerId);
    const isActive = auction.id === state.selectedAuctionId;

    const node = document.createElement("article");
    node.className = `auction-item ${isActive ? "active" : ""}`;
    node.innerHTML = `
      <strong>${escapeHtml(auction.itemName)}</strong>
      <p class="meta">Aktuell: ${formatMoney(auction.currentPrice)} · Verkäufer: ${escapeHtml(seller?.username || "Unbekannt")}</p>
      <p class="meta">Letzte Aktivität: ${new Date(auction.updatedAt).toLocaleString("de-DE")}</p>
    `;
    node.addEventListener("click", () => {
      state.selectedAuctionId = auction.id;
      renderAuctionList();
      renderAuctionDetail();
    });

    el.auctionList.appendChild(node);
  });
}

function renderAuctionDetail() {
  const user = getCurrentUser();
  const auction = state.auctions.find((entry) => entry.id === state.selectedAuctionId);

  if (!auction) {
    el.auctionDetail.innerHTML = "<h3>Details</h3><p class='subtitle'>Wähle links eine Auktion.</p>";
    return;
  }

  const seller = state.users.find((entry) => entry.id === auction.sellerId);
  const history = state.bids
    .filter((bid) => bid.auctionId === auction.id)
    .sort((a, b) => b.createdAt - a.createdAt);

  const historyHtml = history.length
    ? history
        .map((bid) => {
          const bidder = state.users.find((entry) => entry.id === bid.userId);
          return `<li>${formatMoney(bid.amount)} von ${escapeHtml(bidder?.username || "Unbekannt")} · ${new Date(
            bid.createdAt
          ).toLocaleString("de-DE")}</li>`;
        })
        .join("")
    : "<li>Noch keine Gebote.</li>";

  const bidButtons = state.config.pricing.defaultBidSteps
    .map((step) => `<button class="btn btn-secondary" data-bid-step="${step}">+${formatMoney(step)}</button>`)
    .join(" ");

  const progress = calcPriceProgress(auction, history);

  el.auctionDetail.innerHTML = `
    <h3>${escapeHtml(auction.itemName)}</h3>
    <p class="meta">Verkäufer: ${escapeHtml(seller?.username || "Unbekannt")}</p>
    <p><strong>Aktueller Preis:</strong> ${formatMoney(auction.currentPrice)}</p>
    <p class="meta">Preisverlauf: Start ${formatMoney(auction.startPrice)} → Jetzt ${formatMoney(
      auction.currentPrice
    )} (${progress})</p>
    <div class="bid-controls">${bidButtons}</div>
    <div class="form-row">
      <label for="customBid">Individuelle Erhöhung (€)</label>
      <input id="customBid" type="number" min="1" step="1" placeholder="z. B. 25000" />
      <button class="btn btn-primary" id="customBidBtn">Gebot abgeben</button>
    </div>
    <h4>Verlauf</h4>
    <ul class="history">${historyHtml}</ul>
    ${user?.isAdmin ? '<button class="btn btn-secondary" id="deleteAuctionBtn">Auktion löschen</button>' : ""}
  `;

  [...el.auctionDetail.querySelectorAll("[data-bid-step]")].forEach((node) => {
    node.addEventListener("click", () => placeBid(auction.id, Number(node.dataset.bidStep)));
  });

  el.auctionDetail.querySelector("#customBidBtn")?.addEventListener("click", () => {
    const input = el.auctionDetail.querySelector("#customBid");
    const amount = Number(input?.value || 0);
    if (amount > 0) placeBid(auction.id, amount);
  });

  el.auctionDetail.querySelector("#deleteAuctionBtn")?.addEventListener("click", () => deleteAuction(auction.id));
}

function renderAdminPanel() {
  const user = getCurrentUser();
  const show = Boolean(user?.isAdmin);
  el.adminPanel.classList.toggle("hidden", !show);
  if (!show) return;

  el.adminUsers.innerHTML = "";
  state.users.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "admin-user-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(entry.username)}</strong>
        <p class="meta">${entry.isAdmin ? "Admin" : "User"} · ${entry.isBlocked ? "Gesperrt" : "Aktiv"}</p>
      </div>
      ${!entry.isAdmin ? `<button class="btn btn-secondary">${entry.isBlocked ? "Entsperren" : "Sperren"}</button>` : ""}
    `;
    const actionButton = row.querySelector("button");
    if (actionButton) {
      actionButton.addEventListener("click", () => toggleUserBlock(entry.id));
    }
    el.adminUsers.appendChild(row);
  });
}

function setHint(message) {
  el.oauthHint.textContent = message;
}

function createPkceVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function createCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function calcPriceProgress(auction, history) {
  if (history.length === 0 || auction.startPrice === 0) return "0 %";
  const increase = auction.currentPrice - auction.startPrice;
  const pct = (increase / auction.startPrice) * 100;
  return `${pct.toFixed(2)} %`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(amount) {
  return new Intl.NumberFormat(state.config.app.defaultLocale, {
    style: "currency",
    currency: state.config.app.currency,
    maximumFractionDigits: 0
  }).format(amount);
}
