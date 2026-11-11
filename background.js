/* Velvet Proxy v1.3.3. Keep proxy secrets local, never answer site authentication. */
importScripts("parser.js");

const STORAGE_KEY = "velvet_proxy_state_v1"; // v1 compatibility: existing saved profiles remain.
const PROBE_RECOVERY_KEY = "velvet_proxy_pending_probe_v11";
const DEFAULT_STATE = { profiles: [], activeId: null, enabled: false };
const IP_CHECK_URLS = ["https://api.ipify.org?format=json", "https://api.myip.com"];
const GEO_URL = "https://ipwho.is/";
// Keep the full verification transaction under Chrome MV3's service-worker
// network and lifetime limits, even if a proxy ignores AbortController.abort().
const DIRECT_ECHO_TIMEOUT_MS = 4000;
const PROXY_ECHO_TIMEOUT_MS = 6000;
const GEO_TIMEOUT_MS = 3500;

const AUTH_MAX_RETRIES = 1;
const authAttemptCounts = new Map();
const verifiedImports = new Map();
let probeProfile = null;
let probeAuth = null;
let directBaseline = null;
let mutationQueue = Promise.resolve();

function queueMutation(action) {
  const next = mutationQueue.then(action, action);
  mutationQueue = next.catch(() => {});
  return next;
}
async function readState() {
  const obj = await chrome.storage.local.get(STORAGE_KEY);
  const raw = obj[STORAGE_KEY];
  if (!raw || !Array.isArray(raw.profiles)) return { ...DEFAULT_STATE, profiles: [] };
  return {
    profiles: raw.profiles,
    activeId: typeof raw.activeId === "string" ? raw.activeId : null,
    enabled: raw.enabled === true
  };
}
async function writeState(state) { await chrome.storage.local.set({ [STORAGE_KEY]: state }); }
function proxySettingsSet(config) {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set({ value: config, scope: "regular" }, () => {
      const error = chrome.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve();
    });
  });
}
function proxySettingsClear() {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.clear({ scope: "regular" }, () => {
      const error = chrome.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve();
    });
  });
}
function proxySettingsGet() {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.get({ incognito: false }, value => {
      const error = chrome.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve(value);
    });
  });
}
function proxyConfig(profile) {
  const p = ProxyParser.validateProfile(profile);
  // Chrome's fixed_servers singleProxy has no DIRECT fallback for remote URLs.
  return { mode: "fixed_servers", rules: {
    singleProxy: { scheme: p.scheme, host: p.host, port: p.port },
    bypassList: p.bypass ? p.bypass.split(/[,\n]+/).map(x => x.trim()).filter(Boolean) : ["<local>"]
  } };
}
function comparableHost(host) { return String(host || "").toLowerCase().replace(/^\[|\]$/g, ""); }
function ensureControl(setting) {
  if (["controlled_by_other_extensions", "not_controllable"].includes(setting.levelOfControl)) {
    throw new Error("Another extension, Chrome policy or system setting prevents proxy testing.");
  }
}
async function snapshot() {
  const [state, setting] = await Promise.all([readState(), proxySettingsGet()]);
  return {
    state, control: setting.levelOfControl,
    effectiveMode: setting.value?.mode || "unknown",
    effectiveProxy: setting.value?.rules?.singleProxy || null
  };
}
// Only accept flag SVGs hosted at the documented ipwho.is flag CDN.
// Display them as normal <img> elements; never inject remote SVG markup.
function safeFlagUrl(value, countryCode = "") {
  try {
    const url = new URL(String(value || ""));
    const match = /^\/flags\/([a-z]{2})\.svg$/i.exec(url.pathname);
    if (url.protocol !== "https:" || url.hostname !== "cdn.ipwhois.io" ||
        url.port || url.username || url.password || url.search || url.hash || !match ||
        (countryCode && match[1].toUpperCase() !== countryCode.toUpperCase())) return "";
    return `https://cdn.ipwhois.io/flags/${match[1].toLowerCase()}.svg`;
  } catch { return ""; }
}
function cleanCheck(input) {
  if (!input || input.status !== "live") return null;
  const trim = (v, max = 80) => String(v || "").slice(0, max);
  const code = trim(input.countryCode, 2).toUpperCase();
  return {
    status: "live", ip: trim(input.ip), country: trim(input.country),
    countryCode: code, city: trim(input.city),
    cityCode: trim(input.cityCode, 2).toUpperCase(), region: trim(input.region),
    flagUrl: safeFlagUrl(input.flagUrl, code),
    flagEmoji: trim(input.flagEmoji, 12),
    latencyMs: Math.max(0, Math.min(120000, Number(input.latencyMs) || 0)),
    checkedAt: Number.isFinite(input.checkedAt) ? input.checkedAt : Date.now()
  };
}
function cityCode(location) {
  const city = String(location.city || "").trim();
  if (!city) return "";
  const significant = city.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  if (!significant.length) return "";
  return (significant.length > 1 ? significant.map(w => w[0]).join("") : city.slice(0, 2)).slice(0, 2).toUpperCase();
}
async function updateToolbarIcon(state, effectiveSetting) {
  const active = state.profiles.find(p => p.id === state.activeId);
  let connected = false;
  try {
    const setting = effectiveSetting ?? await proxySettingsGet();
    const configured = setting.value?.rules?.singleProxy;
    connected = Boolean(state.enabled && active &&
      setting.levelOfControl === "controlled_by_this_extension" &&
      setting.value?.mode === "fixed_servers" && configured &&
      comparableHost(configured.host) === comparableHost(active.host) &&
      Number(configured.port) === Number(active.port) &&
      configured.scheme === active.scheme);
  } catch { /* If Chrome cannot confirm the configuration, display the off icon. */ }
  const mode = connected ? "on" : "off";
  await chrome.action.setIcon({ path: {
    "16": `icons/icon16-${mode}.png`,
    "32": `icons/icon32-${mode}.png`
  } });
  await chrome.action.setBadgeText({ text: "" }); // Clear country/city badges from earlier versions.
  await chrome.action.setTitle({
    title: connected ? `Velvet Proxy · Connected to ${active.name}` :
      state.enabled ? "Velvet Proxy · Proxy inactive or overridden" : "Velvet Proxy · Proxy off"
  });
}
async function restoreAccordingToState(state) {
  const active = state.enabled && state.profiles.find(p => p.id === state.activeId);
  if (active) await proxySettingsSet(proxyConfig(active));
  else await proxySettingsClear();
  await updateToolbarIcon(state);
}
async function applyProfile(state, id) {
  const active = state.profiles.find(p => p.id === id);
  if (!active) throw new Error("This proxy profile no longer exists.");
  const next = { ...state, activeId: id, enabled: true };
  await writeState(next);
  try {
    await proxySettingsSet(proxyConfig(active));
    const effective = await proxySettingsGet();
    if (effective.levelOfControl !== "controlled_by_this_extension") throw new Error("Chrome proxy settings are overridden.");
    await updateToolbarIcon(next, effective);
  } catch (error) {
    await writeState(state);
    await restoreAccordingToState(state).catch(() => {});
    throw error;
  }
  return snapshot();
}
async function disableProxy(state) {
  await proxySettingsClear();
  const next = { ...state, enabled: false };
  await writeState(next);
  await updateToolbarIcon(next);
  return snapshot();
}
// AbortController alone is insufficient for a stalled CONNECT/authentication
// handshake: wait for whichever finishes first, including JSON body reading.
// The timer rejection is always observed by Promise.race, and no pending
// network request is treated as a successful proxy check.
async function fetchJsonBounded(url, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`Timed out after ${Math.round(timeoutMs / 1000)} seconds`));
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function fetchPublicIp(perServiceTimeoutMs = PROXY_ECHO_TIMEOUT_MS) {
  // Two independent public-IP services, each with a strict deadline.
  let errorText = "Connection failed";
  let proxyAuthFailed = false;
  const started = performance.now();
  for (const url of IP_CHECK_URLS) {
    try {
      const target = `${url}${url.includes("?") ? "&" : "?"}nonce=${crypto.randomUUID()}`;
      if (probeAuth) probeAuth.urls.add(target);
      const body = await fetchJsonBounded(target, perServiceTimeoutMs);
      const ip = String(body.ip || "");
      if (!/^[0-9a-f.:]{3,80}$/i.test(ip)) throw new Error("Invalid public IP response.");
      return { ip, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      errorText = error.message || "Request failed";
      proxyAuthFailed ||= errorText === "HTTP 407";
    }
  }
  throw new Error(`Both IP verification services failed (${proxyAuthFailed ? "HTTP 407" : errorText}).`);
}
async function fetchGeo(ip) {
  try {
    const data = await fetchJsonBounded(`${GEO_URL}${encodeURIComponent(ip)}`, GEO_TIMEOUT_MS);
    if (data.success === false || data.ip !== ip) return {};
    return {
      country: String(data.country || "").slice(0, 80),
      countryCode: String(data.country_code || "").slice(0, 2).toUpperCase(),
      region: String(data.region || "").slice(0, 80),
      city: String(data.city || "").slice(0, 80),
      cityCode: cityCode(data),
      flagUrl: safeFlagUrl(data.flag?.img, String(data.country_code || "").slice(0, 2)),
      flagEmoji: String(data.flag?.emoji || "").slice(0, 12)
    };
  } catch { return {}; } // Location is optional, never blocks a confirmed LIVE result.
}
async function getDirectBaseline() {
  if (directBaseline && (Date.now() - directBaseline.at < 90000)) return directBaseline.ip;
  // Temporarily use underlying Chrome settings to establish the non-extension IP.
  await proxySettingsClear();
  try {
    const result = await fetchPublicIp(DIRECT_ECHO_TIMEOUT_MS);
    directBaseline = { ip: result.ip, at: Date.now() };
    return result.ip;
  } catch { return null; } // Don't claim LIVE without a baseline.
}

// A probe temporarily replaces the browser-wide proxy. Finally always restores the previous profile.
async function probeCandidate(candidate) {
  const profile = ProxyParser.validateProfile(candidate);
  const before = await readState();
  const setting = await proxySettingsGet();
  ensureControl(setting);
  const result = { status: "unverified", checkedAt: Date.now(), message: "Unable to verify proxy traffic." };
  let networkResult = null;
  let baseline = null;
  // A recovery marker lets a restarted service worker repair a truncated probe.
  await chrome.storage.local.set({ [PROBE_RECOVERY_KEY]: Date.now() });
  try {
    baseline = await getDirectBaseline();
    probeProfile = { ...profile, id: `probe_${crypto.randomUUID()}` };
    await proxySettingsSet(proxyConfig(profile));
    const effective = await proxySettingsGet();
    const selected = effective.value?.rules?.singleProxy;
    if (effective.levelOfControl !== "controlled_by_this_extension" ||
        effective.value?.mode !== "fixed_servers" ||
        !selected || comparableHost(selected.host) !== comparableHost(profile.host) ||
        Number(selected.port) !== profile.port || selected.scheme !== profile.scheme) {
      throw new Error("Chrome did not apply this proxy configuration.");
    }
    probeAuth = { urls: new Set(), seen: false, supplied: false, retried: false };
    networkResult = await fetchPublicIp();
    result.ip = networkResult.ip;
    result.latencyMs = networkResult.latencyMs;
    if (!baseline) {
      result.message = "IP service responded, but a direct-connection baseline was unavailable.";
    } else if (networkResult.ip === baseline) {
      result.message = "Same IP as the direct connection. Proxy use could not be confirmed.";
    } else {
      result.status = "live";
      result.message = "Proxy route verified using a different public IP.";
    }
  } catch (error) {
    result.status = "failed";
    result.message = (error.message || "Network request failed.").slice(0, 170);
    if (probeAuth && result.message.includes("HTTP 407")) {
      const diagnostic = !profile.username ? "No proxy username was configured."
        : !probeAuth.seen ? "No proxy authentication callback was observed for the IP checks."
        : !probeAuth.supplied ? "Authentication callback ran without returning credentials."
        : probeAuth.retried ? "A repeat challenge followed the credential response."
        : "The extension returned credentials to the browser, but verification still failed.";
      result.message = `HTTP 407 · ${diagnostic}`;
    }
  } finally {
    probeProfile = null;
    probeAuth = null;
    try {
      await restoreAccordingToState(before);
      await chrome.storage.local.remove(PROBE_RECOVERY_KEY);
    } catch (restoreError) {
      // Never report a verified result when the previous proxy could not be restored.
      throw new Error(`Proxy tested, but original Chrome proxy could not be restored: ${restoreError.message}`);
    }
  }
  if (result.status === "live" && result.ip) Object.assign(result, await fetchGeo(result.ip));
  result.checkedAt = Date.now();
  return result;
}
async function verifyAndSave(profilePayload) {
  const clean = ProxyParser.validateProfile(profilePayload);
  const result = await probeCandidate(clean);
  if (result.status !== "live") {
    return { saved: false, check: result, snapshot: await snapshot() };
  }
  const state = await readState();
  const index = state.profiles.findIndex(p => p.id === clean.id);
  const profiles = state.profiles.slice();
  if (index >= 0) {
    clean.createdAt = profiles[index].createdAt;
    profiles[index] = { ...clean, favorite: profiles[index].favorite === true, check: cleanCheck(result) };
  } else {
    if (profiles.length >= ProxyParser.MAX_PROFILES) throw new Error(`Maximum ${ProxyParser.MAX_PROFILES} profiles.`);
    clean.id = crypto.randomUUID();
    profiles.unshift({ ...clean, check: cleanCheck(result) });
  }
  const next = { ...state, profiles };
  await writeState(next);
  try {
    if (state.enabled && state.activeId === clean.id) await proxySettingsSet(proxyConfig(clean));
    await updateToolbarIcon(next);
  } catch (error) {
    await writeState(state);
    await restoreAccordingToState(state).catch(() => {});
    throw error;
  }
  return { saved: true, check: result, snapshot: await snapshot() };
}
async function setFavorite(id, favorite) {
  if (typeof favorite !== "boolean") throw new Error("Invalid favorite status.");
  const state = await readState();
  const index = state.profiles.findIndex(profile => profile.id === id);
  if (index < 0) throw new Error("Proxy not found.");
  const profiles = state.profiles.slice();
  profiles[index] = { ...profiles[index], favorite };
  await writeState({ ...state, profiles });
  return snapshot();
}
async function deleteProfile(id) {
  const state = await readState();
  if (!state.profiles.some(p => p.id === id)) throw new Error("Proxy not found.");
  if (state.enabled && state.activeId === id) await proxySettingsClear();
  const next = {
    ...state,
    profiles: state.profiles.filter(p => p.id !== id),
    enabled: state.activeId === id ? false : state.enabled,
    activeId: state.activeId === id ? null : state.activeId
  };
  await writeState(next);
  await updateToolbarIcon(next);
  return snapshot();
}
async function checkOneImport(payload) {
  const profile = ProxyParser.validateProfile(payload);
  const result = await probeCandidate(profile);
  const key = ProxyParser.dedupeKey(profile);
  verifiedImports.delete(key);
  if (result.status === "live") verifiedImports.set(key, { checkedAt: Date.now(), check: cleanCheck(result) });
  // Limit the cache. No passwords or analytics are transmitted.
  if (verifiedImports.size > 1100) verifiedImports.clear();
  return result;
}
async function importVerified(payload) {
  if (!Array.isArray(payload) || payload.length > ProxyParser.MAX_PROFILES) {
    throw new Error(`Select no more than ${ProxyParser.MAX_PROFILES} verified proxies.`);
  }
  const state = await readState();
  const known = new Set(state.profiles.map(ProxyParser.dedupeKey));
  const incoming = [];
  let duplicates = 0, expired = 0;
  for (const entry of payload) {
    const clean = ProxyParser.validateProfile(entry);
    const key = ProxyParser.dedupeKey(clean);
    if (known.has(key)) { duplicates++; continue; }
    const record = verifiedImports.get(key);
    if (!record || Date.now() - record.checkedAt > 20 * 60 * 1000) { expired++; continue; }
    known.add(key);
    clean.id = crypto.randomUUID();
    incoming.push({ ...clean, check: record.check });
  }
  if (state.profiles.length + incoming.length > ProxyParser.MAX_PROFILES) {
    throw new Error(`Only ${ProxyParser.MAX_PROFILES} total saved profiles are supported.`);
  }
  const next = { ...state, profiles: [...incoming, ...state.profiles] };
  await writeState(next);
  await updateToolbarIcon(next);
  return { imported: incoming.length, duplicates, expired, snapshot: await snapshot() };
}
async function testActive() {
  const state = await readState();
  const active = state.enabled && state.profiles.find(p => p.id === state.activeId);
  if (!active) throw new Error("Enable a proxy before checking its IP.");
  const result = await probeCandidate(active);
  const latest = await readState();
  const profiles = latest.profiles.map(p => p.id === active.id ? { ...p, check: result.status === "live" ? cleanCheck(result) : { status: result.status, checkedAt: Date.now(), message: result.message } } : p);
  const next = { ...latest, profiles };
  await writeState(next);
  await updateToolbarIcon(next);
  return result;
}
async function handleMessage(message) {
  if (!message || typeof message !== "object") throw new Error("Invalid command.");
  switch (message.type) {
    case "GET_STATE": return snapshot();
    case "SAVE_PROFILE": return queueMutation(() => verifyAndSave(message.profile));
    case "CHECK_CANDIDATE": return queueMutation(() => checkOneImport(message.profile));
    case "SET_FAVORITE": return queueMutation(() => setFavorite(message.id, message.favorite));
    case "DELETE_PROFILE": return queueMutation(() => deleteProfile(message.id));
    case "SELECT_PROFILE": return queueMutation(async () => applyProfile(await readState(), message.id));
    case "SET_ENABLED": return queueMutation(async () => {
      const state = await readState();
      if (message.enabled) {
        if (!state.activeId) throw new Error("Select a proxy first.");
        return applyProfile(state, state.activeId);
      }
      return disableProxy(state);
    });
    case "IMPORT_PROFILES": return queueMutation(() => importVerified(message.profiles));
    case "TEST_CONNECTION": return queueMutation(testActive);
    default: throw new Error("Unknown command.");
  }
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(data => sendResponse({ ok: true, data }))
    .catch(error => sendResponse({ ok: false, error: String(error.message || error) }));
  return true;
});
chrome.webRequest.onAuthRequired.addListener((details, callback) => {
  if (!details.isProxy) { callback({}); return; }
  const diagnostic = probeAuth?.urls.has(details.url) ? probeAuth : null;
  if (diagnostic) diagnostic.seen = true;
  (async () => {
    const state = await readState();
    const active = probeProfile || (state.enabled ? state.profiles.find(p => p.id === state.activeId) : null);
    if (!active || !["http", "https"].includes(active.scheme) || !active.username) return {};
    const setting = await proxySettingsGet();
    const configured = setting.value?.rules?.singleProxy;
    if (setting.levelOfControl !== "controlled_by_this_extension" || setting.value?.mode !== "fixed_servers" ||
        !configured || comparableHost(configured.host) !== comparableHost(active.host) ||
        Number(configured.port) !== active.port ||
        (details.challenger?.port && Number(details.challenger.port) !== active.port)) return {};
    const attempts = authAttemptCounts.get(details.requestId) || new Map();
    const count = attempts.get(active.id) || 0;
    if (count >= AUTH_MAX_RETRIES) {
      if (diagnostic) diagnostic.retried = true;
      return { cancel: true };
    }
    attempts.set(active.id, count + 1);
    authAttemptCounts.set(details.requestId, attempts);
    if (authAttemptCounts.size > 3000) authAttemptCounts.clear();
    return { authCredentials: { username: active.username, password: active.password } };
  })().then(response => {
    callback(response);
    if (diagnostic && response.authCredentials) diagnostic.supplied = true;
  }).catch(() => callback({}));
}, { urls: ["<all_urls>"] }, ["asyncBlocking"]);
function cleanupAuth(details) {
  authAttemptCounts.delete(details.requestId);
}
chrome.webRequest.onCompleted.addListener(cleanupAuth, { urls: ["<all_urls>"] });
chrome.webRequest.onErrorOccurred.addListener(cleanupAuth, { urls: ["<all_urls>"] });

// If Chrome terminates a worker mid-probe, next startup restores the saved profile.
queueMutation(async () => {
  const obj = await chrome.storage.local.get(PROBE_RECOVERY_KEY);
  const state = await readState();
  if (obj[PROBE_RECOVERY_KEY]) {
    await restoreAccordingToState(state);
    await chrome.storage.local.remove(PROBE_RECOVERY_KEY);
  } else {
    await updateToolbarIcon(state);
  }
}).catch(() => {});
chrome.runtime.onStartup.addListener(() => {
  queueMutation(async () => {
    const state = await readState();
    const setting = await proxySettingsGet();
    if (["controlled_by_other_extensions", "not_controllable"].includes(setting.levelOfControl)) {
      await updateToolbarIcon(state);
      return;
    }
    await restoreAccordingToState(state);
    await chrome.storage.local.remove(PROBE_RECOVERY_KEY);
  }).catch(() => {});
});
// Some Chromium-derived browsers omit StorageArea.setAccessLevel. This setting
// only controls extension content-script access, not the proxy or saved data.
// Do not crash the service worker if the optional API is unavailable.
try {
  const setAccessLevel = chrome.storage?.local?.setAccessLevel;
  if (typeof setAccessLevel === "function") {
    Promise.resolve(setAccessLevel.call(chrome.storage.local, {
      accessLevel: "TRUSTED_CONTEXTS"
    })).catch(() => {});
  }
} catch { /* Unsupported access control must not prevent startup. */ }

// Reflect externally changed proxy ownership while Chrome remains open.
chrome.proxy.settings.onChange.addListener(() => {
  queueMutation(async () => updateToolbarIcon(await readState())).catch(() => {});
});
