"use strict";
const $ = id => document.getElementById(id);
const LIST_BATCH = 32;
const verifiedDateFormat = new Intl.DateTimeFormat();
let current = null;
let visibleLimit = LIST_BATCH;
let searchFrame = 0;
let refreshSequence = 0;
let working = false;
let toastTimer;
let deleteTarget = null;
let importRows = [];
let importStats = { live: 0, failed: 0, unverified: 0, done: 0, total: 0 };
let importChecking = false;
let importStopRequested = false;
const svgStar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1 6.3-5.6-3-5.6 3 1-6.3L2.9 9.6l6.3-.9L12 3Z"/></svg>';
const svgEdit = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="m4 16.5-.7 4.2 4.3-.7L19.9 7.7a2 2 0 0 0-2.8-2.8L4 18" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const svgDelete = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v6m4-6v6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Show an actionable error instead of leaving the editor stuck in "Checking".
// This is an emergency UI watchdog, not a replacement for the worker's
// shorter per-request timeouts. A timed-out operation is NOT reported as saved.
function command(type, payload = {}) {
  const checking = ["SAVE_PROFILE", "CHECK_CANDIDATE", "TEST_CONNECTION"].includes(type);
  const timeoutMs = checking ? 38000 : 16000;
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(checking
        ? "Proxy verification timed out; no result was confirmed. Close and reopen the extension, then check your saved profiles before retrying."
        : "Chrome did not respond. Close and reopen the extension, then try again."));
    }, timeoutMs);
    try {
      chrome.runtime.sendMessage({ type, ...payload }, response => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        if (!response) return reject(new Error("Extension service worker did not respond. Reload the extension."));
        if (!response.ok) return reject(new Error(response.error || "Something went wrong."));
        resolve(response.data);
      });
    } catch (error) {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
    }
  });
}
function showToast(message) {
  const node = $("toast");
  clearTimeout(toastTimer);
  node.textContent = message;
  node.classList.add("show");
  toastTimer = setTimeout(() => node.classList.remove("show"), 3700);
}
function setMessage(id, message) {
  const el = $(id);
  el.textContent = message;
  el.hidden = !message;
}
function child(tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (value !== undefined) el.textContent = value;
  return el;
}
function button(label, className, title, fixedSvg) {
  const el = child("button", className, label);
  el.type = "button";
  if (fixedSvg) el.innerHTML = fixedSvg; // Only hard-coded developer SVGs.
  if (title) { el.title = title; el.setAttribute("aria-label", title); }
  return el;
}
function place(check) {
  if (!check || check.status !== "live") return "Location unknown";
  return [check.city, check.country].filter(Boolean).join(", ") || "Location unknown";
}
function countryCode(check) {
  const code = check?.status === "live" ? String(check.countryCode || "").toUpperCase() : "";
  return /^[A-Z]{2}$/.test(code) ? code : "";
}
function flagEmoji(check) {
  const code = countryCode(check);
  // Keep existing saved profiles usable without an additional location lookup.
  // New checks also store the emoji returned by ipwho.is.
  if (code && typeof check?.flagEmoji === "string" && check.flagEmoji.trim()) return check.flagEmoji.trim();
  if (!code) return "";
  return String.fromCodePoint(...[...code].map(ch => 127397 + ch.charCodeAt(0)));
}
function flagUrl(check) {
  const code = countryCode(check);
  if (!code || !check?.flagUrl) return "";
  try {
    const url = new URL(String(check.flagUrl));
    return url.protocol === "https:" && url.hostname === "cdn.ipwhois.io" &&
      !url.port && !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === `/flags/${code.toLowerCase()}.svg` ? url.href : "";
  } catch { return ""; }
}
function loadFlag(check, onLoad, onError) {
  const url = flagUrl(check);
  if (!url) return null;
  const flag = child("img", "proxy-flag");
  flag.alt = `${check.country || countryCode(check)} flag`;
  flag.referrerPolicy = "no-referrer";
  flag.decoding = "async";
  flag.addEventListener("load", () => onLoad(flag), { once: true });
  flag.addEventListener("error", () => onError?.(), { once: true });
  flag.src = url;
  return flag;
}
function verifiedDate(check) {
  const date = new Date(check.checkedAt);
  return Number.isFinite(date.getTime()) ? verifiedDateFormat.format(date) : "recently";
}
async function refresh() {
  const sequence = ++refreshSequence;
  try {
    const snapshot = await command("GET_STATE");
    if (sequence !== refreshSequence) return;
    current = snapshot;
    render();
  } catch (error) {
    if (sequence === refreshSequence) showToast(error.message);
  }
}
async function perform(action, message) {
  if (working) return null;
  working = true;
  try {
    const result = await action();
    ++refreshSequence;
    current = result;
    render();
    if (message) showToast(message);
    return result;
  } catch (error) { showToast(error.message); return null; }
  finally {
    // refresh() renders while working=true, temporarily disabling the master switch.
    // Once the command finishes, restore the button's enabled state. This is
    // especially important when turning the proxy OFF, as no IP check follows.
    working = false;
    if (current) render(false);
  }
}
async function checkActive(silent = true) {
  if (working) return;
  working = true;
  $("testBtn").disabled = true;
  $("testBtn").querySelector(".button-label").textContent = "Checking…";
  setMessage("testResult", "");
  try {
    const result = await command("TEST_CONNECTION");
    await refresh(); // The saved check is rendered exactly once, inside Current Connection.
    if (!silent && result.status !== "live") showToast("Proxy verification did not succeed");
  } catch (error) {
    $("testResult").className = "test-result error";
    setMessage("testResult", error.message); // API errors also stay inside the hero card.
  } finally {
    working = false;
    $("testBtn").querySelector(".button-label").textContent = "Check IP";
    if (current) render(false);
  }
}
async function connect(id) {
  if (working) return;
  setMessage("testResult", "");
  const result = await perform(() => command("SELECT_PROFILE", { id }), "Proxy configured. Checking IP…");
  if (result) await checkActive(true);
}
function render(updateList = true) {
  if (!current) return;
  const state = current.state;
  const active = state.profiles.find(p => p.id === state.activeId);
  const blocked = ["controlled_by_other_extensions", "not_controllable"].includes(current.control);
  const connected = Boolean(state.enabled && active && !blocked && current.control === "controlled_by_this_extension" && current.effectiveMode === "fixed_servers");
  $("profileCount").textContent = `${state.profiles.length} saved ${state.profiles.length === 1 ? "profile" : "profiles"}`;
  const currentIcon = $("currentIcon");
  const code = countryCode(active?.check);
  const iconFlagKey = [code, flagUrl(active?.check), flagEmoji(active?.check)].join("|");
  if (currentIcon.dataset.flagKey !== iconFlagKey) {
    currentIcon.querySelectorAll("img.proxy-flag, .flag-fallback").forEach(node => node.remove());
    currentIcon.dataset.flagKey = iconFlagKey;
    if (code) {
      const fallback = child("span", "flag-fallback", flagEmoji(active.check));
      currentIcon.append(fallback);
      const flag = loadFlag(active.check, loaded => {
        if (currentIcon.dataset.flagKey !== iconFlagKey) return;
        fallback.hidden = true;
        loaded.hidden = false;
      });
      if (flag) { flag.hidden = true; currentIcon.append(flag); }
    }
  }
  $("currentName").textContent = active?.name || "System connection";
  $("currentEndpoint").textContent = active ? `${active.scheme.toUpperCase()} · ${active.host}:${active.port}` : "Choose a proxy to get started";
  const chip = $("statusChip");
  chip.replaceChildren(child("i"), document.createTextNode(connected ? "Enabled" : blocked ? "Overridden" : state.enabled ? "Pending" : "System"));
  chip.className = `status-chip ${connected ? "connected" : blocked ? "warning" : ""}`;
  $("powerToggle").disabled = !active || working;
  $("powerToggle").classList.toggle("is-on", Boolean(state.enabled));
  $("powerToggle").setAttribute("aria-checked", String(Boolean(state.enabled)));
  $("powerToggle").title = state.enabled ? "Disable proxy" : "Enable selected proxy";
  $("testBtn").disabled = !connected || working;
  $("routingCaption").textContent = state.enabled ? "Proxy configured for Chrome" : "Chrome browser traffic";
  const geo = $("activeGeo");
  geo.replaceChildren();
  const check = active?.check;
  geo.className = "active-geo";
  if (connected && check?.status === "live") {
    const head = child("div", "geo-head");
    head.append(child("span", "geo-state", "● LIVE"), child("span", "geo-latency", `${check.latencyMs} ms`));
    geo.append(head, child("div", "geo-place", place(check)), child("div", "geo-ip", `Exit IP: ${check.ip}`));
    geo.hidden = false;
  } else if (connected && check && ["failed", "unverified"].includes(check.status)) {
    geo.classList.add("geo-problem", `geo-${check.status}`);
    geo.append(child("div", "geo-state", check.status.toUpperCase()),
      child("div", "geo-error", check.message || "Unable to verify this proxy."));
    geo.hidden = false;
  } else {
    geo.hidden = true;
  }
  const warning = blocked ? "Another extension or Chrome policy controls proxy settings. Disable its proxy feature to use Velvet Proxy."
    : state.enabled && !connected ? "Chrome has not confirmed the selected proxy settings." : "";
  setMessage("controlWarning", warning);
  if (updateList) renderList(state);
}
function renderList(state, start = 0) {
  const q = $("searchInput").value.toLowerCase().trim();
  const sorted = state.profiles.slice().sort((a, b) =>
    Number(b.favorite === true) - Number(a.favorite === true) ||
    Number(b.id === state.activeId) - Number(a.id === state.activeId));
  const list = $("proxyList");
  const scrollTop = list.scrollTop;
  const filtered = sorted.filter(p => [p.name, p.host, p.scheme, p.username, p.check?.ip, p.check?.city, p.check?.country].some(v => String(v || "").toLowerCase().includes(q)));
  const shown = filtered.slice(start, visibleLimit);
  const rows = document.createDocumentFragment();
  const more = list.querySelector(".load-more");
  more?.remove();
  $("emptyState").hidden = state.profiles.length !== 0;
  $("searchEmpty").hidden = state.profiles.length === 0 || filtered.length !== 0;

  for (const p of shown) {
    const isActive = Boolean(p.id === state.activeId && state.enabled);
    const row = child("div", `proxy-item${isActive ? " active" : ""}`);
    const verified = p.check?.status === "live";
    const code = countryCode(p.check);
    const avatar = child("div", "proxy-avatar", code ? flagEmoji(p.check) : (p.scheme.startsWith("socks") ? "SO" : "H"));
    if (code) loadFlag(p.check, flag => avatar.replaceChildren(flag));
    const info = child("div", "proxy-info");
    const name = child("div", "proxy-name", p.name);
    name.title = p.name;
    const meta = child("div", "proxy-meta");
    meta.append(child("strong", "", p.scheme === "https" ? "TLS" : p.scheme.toUpperCase()), child("span", "", `${p.host}:${p.port}`));
    const details = child("div", "proxy-details");
    if (verified) {
      details.append(
        child("span", "detail-location", `◉ ${place(p.check)}`),
        child("span", "detail-ping", `Ping ${p.check.latencyMs || 0} ms`),
        child("span", "detail-verified", `Last verified ${verifiedDate(p.check)}`),
      );
    } else {
      const status = p.check?.status;
      const label = !p.check ? "Not checked" : status === "failed" ? "Last check failed" : "Not verified";
      details.append(child("span", `detail-check ${status || ""}`, label));
    }
    info.append(name, meta, details);
    const controls = child("div", "item-controls");
    const use = button(isActive ? "ACTIVE" : "USE", `use-btn${isActive ? " active-use" : ""}`, `Connect to ${p.name}`);
    use.addEventListener("click", () => connect(p.id));
    const edit = button("", "item-action", `Edit ${p.name}`, svgEdit);
    edit.addEventListener("click", () => openEditor(p));
    const del = button("", "item-action delete", `Delete ${p.name}`, svgDelete);
    del.addEventListener("click", () => openDelete(p));
    const favorite = p.favorite === true;
    const star = button("", "item-action favorite-btn", `Favorite ${p.name}`, svgStar);
    star.title = favorite ? "Remove from favorites" : "Add to favorites";
    star.dataset.profileId = p.id;
    star.setAttribute("aria-pressed", String(favorite));
    star.addEventListener("click", async () => {
      const result = await perform(
        () => command("SET_FAVORITE", { id: p.id, favorite: !favorite }),
        favorite ? "Removed from favorites" : "Added to favorites",
      );
      if (!result) return;
      const updatedStar = Array.from(list.querySelectorAll(".favorite-btn"))
        .find(candidate => candidate.dataset.profileId === p.id);
      if (!favorite) list.scrollTop = 0;
      updatedStar?.focus({ preventScroll: true });
    });
    controls.append(use, star, edit, del);
    row.append(avatar, info, controls);
    rows.append(row);
  }
  if (filtered.length > visibleLimit) {
    const next = button(`Show more · ${visibleLimit} of ${filtered.length}`, "secondary-btn load-more");
    next.addEventListener("click", () => {
      const previouslyShown = visibleLimit;
      visibleLimit += LIST_BATCH;
      if (!current) return;
      renderList(current.state, previouslyShown);
      list.children[previouslyShown]?.querySelector(".use-btn")?.focus({ preventScroll: true });
    });
    rows.append(next);
  }
  if (start) list.append(rows);
  else list.replaceChildren(rows);
  list.scrollTop = scrollTop;
}
function dialogShow(id) { $(id).showModal(); }
function dialogHide(id) { $(id).close(); }
function updateSchemeFields() {
  const isSocks = $("profileScheme").value.startsWith("socks");
  $("credentialsFields").hidden = isSocks;
  $("socksHint").hidden = !isSocks;
}
function openEditor(p = null) {
  if (working) return;
  $("profileForm").reset();
  setMessage("formError", "");
  $("editorTitle").textContent = p ? "Edit proxy" : "Add a proxy";
  $("saveProfileBtn").querySelector(".button-label").textContent = "Verify & save";
  $("profileId").value = p?.id || "";
  $("profileName").value = p?.name || "";
  $("profileScheme").value = p?.scheme || "http";
  $("profileHost").value = p?.host || "";
  $("profilePort").value = p?.port || "";
  $("profileUsername").value = p?.username || "";
  $("profilePassword").value = p?.password || "";
  $("profileBypass").value = p?.bypass || "";
  $("profilePassword").type = "password";
  $("passwordReveal").textContent = "Show";
  updateSchemeFields();
  dialogShow("editorDialog");
}
function openDelete(p) {
  if (working) return;
  deleteTarget = p;
  $("deleteProxyName").textContent = p.name;
  dialogShow("deleteDialog");
}
$("confirmDeleteBtn").addEventListener("click", async () => {
  const target = deleteTarget;
  if (!target) return;
  dialogHide("deleteDialog");
  deleteTarget = null;
  await perform(() => command("DELETE_PROFILE", { id: target.id }), "Proxy deleted");
});
$("profileScheme").addEventListener("change", updateSchemeFields);
$("passwordReveal").addEventListener("click", () => {
  const input = $("profilePassword");
  input.type = input.type === "password" ? "text" : "password";
  $("passwordReveal").textContent = input.type === "password" ? "Show" : "Hide";
});
$("profileForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (working) return;
  setMessage("formError", "");
  try {
    const scheme = $("profileScheme").value;
    const profile = ProxyParser.validateProfile({
      id: $("profileId").value || undefined,
      name: $("profileName").value,
      scheme,
      host: $("profileHost").value,
      port: $("profilePort").value,
      username: scheme.startsWith("socks") ? "" : $("profileUsername").value,
      password: scheme.startsWith("socks") ? "" : $("profilePassword").value,
      bypass: $("profileBypass").value
    });
    working = true;
    $("saveProfileBtn").querySelector(".button-label").textContent = "Checking proxy…";
    $("saveProfileBtn").disabled = true;
    const reply = await command("SAVE_PROFILE", { profile });
    if (!reply.saved) {
      setMessage("formError", `${reply.check.status.toUpperCase()} · ${reply.check.message} Nothing was saved.`);
      return;
    }
    dialogHide("editorDialog");
    ++refreshSequence;
    current = reply.snapshot;
    render();
    showToast(`LIVE · Saved ${reply.check.ip}`);
  } catch (error) { setMessage("formError", error.message); }
  finally {
    working = false;
    $("saveProfileBtn").querySelector(".button-label").textContent = "Verify & save";
    $("saveProfileBtn").disabled = false;
    if (current) render(false);
  }
});
$("powerToggle").addEventListener("click", async () => {
  if (!current || working) return;
  const enabled = !current.state.enabled;
  setMessage("testResult", "");
  const result = await perform(() => command("SET_ENABLED", { enabled }), enabled ? "Proxy configured. Checking IP…" : "System proxy restored");
  if (result && enabled) await checkActive(true);
  else setMessage("testResult", "");
});
$("testBtn").addEventListener("click", () => checkActive(false));
$("searchInput").addEventListener("input", () => {
  cancelAnimationFrame(searchFrame);
  searchFrame = requestAnimationFrame(() => {
    visibleLimit = LIST_BATCH;
    $("proxyList").scrollTop = 0;
    if (current) renderList(current.state);
  });
});
$("addBtn").addEventListener("click", () => openEditor());
$("emptyAddBtn").addEventListener("click", () => openEditor());
$("exportBtn").addEventListener("click", () => { $("exportPasswords").checked = false; dialogShow("exportDialog"); });
$("helpBtn").addEventListener("click", () => dialogShow("helpDialog"));
for (const btn of document.querySelectorAll("[data-close]")) {
  btn.addEventListener("click", () => {
    if (btn.dataset.close === "importDialog" && importChecking) {
      importStopRequested = true;
      return showToast("Stopping after the current proxy check…");
    }
    dialogHide(btn.dataset.close);
  });
}
for (const d of document.querySelectorAll("dialog")) {
  d.addEventListener("click", ev => { if (ev.target === d && !importChecking) d.close(); });
}

function resetImport() {
  importRows = [];
  importStats = { live: 0, failed: 0, unverified: 0, done: 0, total: 0 };
  importStopRequested = false;
  $("importText").value = "";
  $("importFile").value = "";
  $("importProgress").hidden = true;
  $("importDialog").classList.remove("compact");
  $("importResults").replaceChildren();
  $("addLiveBtn").disabled = true;
  $("addLiveBtn").querySelector(".button-label").textContent = "Add LIVE (0)";
  $("runImportBtn").disabled = false;
  $("runImportBtn").textContent = "Check proxies";
  setMessage("importError", "");
}
$("importBtn").addEventListener("click", () => {
  if (working) return;
  resetImport();
  dialogShow("importDialog");
});
$("importText").addEventListener("input", () => {
  if (importChecking) return;
  $("importDialog").classList.remove("compact");
  importRows = [];
  $("importProgress").hidden = true;
  $("addLiveBtn").disabled = true;
  $("addLiveBtn").querySelector(".button-label").textContent = "Add LIVE (0)";
});
$("importFile").addEventListener("change", async ev => {
  const file = ev.target.files?.[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return setMessage("importError", "Choose a file under 2 MB, or split it into smaller files.");
  try {
    $("importText").value = await file.text();
    $("importText").dispatchEvent(new Event("input"));
    setMessage("importError", "");
  } catch (error) { setMessage("importError", `Could not read the file: ${error.message}`); }
});
function renderImportProgress() {
  $("importProgress").hidden = false;
  const s = importStats;
  $("importProgressCounter").textContent = `${s.done} / ${s.total}`;
  $("importProgressBar").style.width = `${s.total ? 100 * s.done / s.total : 0}%`;
  $("importStats").textContent = `✓ LIVE ${s.live}   ·   × FAILED ${s.failed}   ·   ? UNVERIFIED ${s.unverified}`;
  $("addLiveBtn").querySelector(".button-label").textContent = `Add LIVE (${s.live})`;
  $("addLiveBtn").disabled = importChecking || !s.live;
}
function appendImportResult(profile, result, index) {
  if (index >= 250) return; // Keep a long import responsive. Totals remain accurate.
  const row = child("div", `import-result ${result.status}`);
  const tag = child("span", "result-state", result.status === "failed" ? "FAILED" : result.status.toUpperCase());
  const info = child("div");
  info.append(child("div", "result-name", `${profile.host}:${profile.port}`),
    child("small", "", result.status === "live" ? `${result.ip} · ${place(result)}` : result.message || "Unable to verify"));
  row.append(tag, info);
  $("importResults").append(row);
}
$("stopImportBtn").addEventListener("click", () => {
  importStopRequested = true;
  $("stopImportBtn").disabled = true;
  $("stopImportBtn").textContent = "Stopping…";
});
$("runImportBtn").addEventListener("click", async () => {
  if (working) return;
  setMessage("importError", "");
  let parsed;
  try { parsed = ProxyParser.parseImport($("importText").value, $("importScheme").value); }
  catch (error) { return setMessage("importError", error.message); }
  if (!parsed.profiles.length) return setMessage("importError", `No valid proxies. ${parsed.errors.slice(0, 2).join(" ")}`);
  if (parsed.errors.length) setMessage("importError", `Skipped ${parsed.errors.length} invalid lines. ${parsed.errors[0]}`);
  working = true;
  importChecking = true;
  importStopRequested = false;
  importRows = [];
  importStats = { live: 0, failed: 0, unverified: 0, done: 0, total: parsed.profiles.length };
  $("importResults").replaceChildren();
  $("importProgressLabel").textContent = "Verifying proxy routes…";
  $("importDialog").classList.add("compact");
  $("runImportBtn").disabled = true;
  $("importText").disabled = true;
  $("importFile").disabled = true;
  $("importScheme").disabled = true;
  $("stopImportBtn").hidden = false;
  $("stopImportBtn").disabled = false;
  $("stopImportBtn").textContent = "Stop after current";
  renderImportProgress();
  try {
    for (const [index, profile] of parsed.profiles.entries()) {
      if (importStopRequested) break;
      let check;
      try { check = await command("CHECK_CANDIDATE", { profile }); }
      catch (error) {
        check = { status: "unverified", message: error.message };
        // No more results are trustworthy if proxy controls can't be applied/restored.
        if (/restored|prevents proxy testing|controls proxy/i.test(error.message)) importStopRequested = true;
      }
      importRows.push({ profile, check });
      importStats[check.status in importStats ? check.status : "unverified"]++;
      importStats.done++;
      appendImportResult(profile, check, index);
      renderImportProgress();
    }
    $("importProgressLabel").textContent = importStopRequested ? "Stopped · results retained" : "Check complete";
    if (parsed.duplicates) showToast(`${parsed.duplicates} duplicates skipped`);
  } finally {
    importChecking = false;
    working = false;
    $("runImportBtn").disabled = false;
    $("runImportBtn").textContent = "Check again";
    $("importText").disabled = false;
    $("importFile").disabled = false;
    $("importScheme").disabled = false;
    $("stopImportBtn").hidden = true;
    renderImportProgress();
    await refresh();
  }
});
$("addLiveBtn").addEventListener("click", async () => {
  if (working || importChecking) return;
  const live = importRows.filter(item => item.check.status === "live").map(item => item.profile);
  if (!live.length) return;
  working = true;
  $("addLiveBtn").disabled = true;
  try {
    const outcome = await command("IMPORT_PROFILES", { profiles: live });
    if (outcome.expired) setMessage("importError", `${outcome.expired} check(s) expired. Recheck them before importing.`);
    if (!outcome.expired) dialogHide("importDialog");
    ++refreshSequence;
    current = outcome.snapshot;
    render();
    showToast(`Added ${outcome.imported} verified LIVE · ${outcome.duplicates} duplicate(s)`);
  } catch (error) { setMessage("importError", error.message); }
  finally { working = false; renderImportProgress(); if (current) render(false); }
});
$("runExportBtn").addEventListener("click", () => {
  if (!current?.state?.profiles?.length) return showToast("No profiles to export");
  const includePasswords = $("exportPasswords").checked;
  const profiles = current.state.profiles.map(p => {
    const entry = { name: p.name, scheme: p.scheme, host: p.host, port: p.port, username: p.username, bypass: p.bypass };
    if (includePasswords) entry.password = p.password;
    return entry;
  });
  const data = { app: "Velvet Proxy", version: 1, exportedAt: new Date().toISOString(), passwordsIncluded: includePasswords, profiles };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `velvet-proxy-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  dialogHide("exportDialog");
  showToast(includePasswords ? "Private backup downloaded" : "Exported without passwords");
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.velvet_proxy_state_v1 && !working) refresh();
});
if (new URLSearchParams(location.search).get("view") === "import") {
  document.body.classList.add("import-tab");
  $("openImportTab").hidden = true;
  resetImport();
  dialogShow("importDialog");
}
refresh();
