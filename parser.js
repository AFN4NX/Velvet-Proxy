/* Pure proxy profile parsing and validation. No network access. */
(function (root) {
  "use strict";
  const SCHEMES = new Set(["http", "https", "socks4", "socks5"]);
  const MAX_PROFILES = 1000;

  function normalizeScheme(value) {
    const v = String(value || "http").toLowerCase().trim();
    return v === "socks" ? "socks5" : v;
  }

  function validateProfile(input) {
    if (!input || typeof input !== "object") throw new Error("Invalid proxy profile.");
    const scheme = normalizeScheme(input.scheme);
    if (!SCHEMES.has(scheme)) throw new Error("Choose HTTP, HTTPS, SOCKS4, or SOCKS5.");
    const host = String(input.host || "").trim().toLowerCase();
    if (!host || host.length > 255 || /[\s/@?#\\]/.test(host)) {
      throw new Error("Enter a valid proxy hostname or IP address.");
    }
    if (host.includes(":") && !/^\[[0-9a-f:.]+\]$/i.test(host)) {
      throw new Error("Wrap IPv6 addresses in square brackets, such as [::1].");
    }
    const rawPort = String(input.port ?? "").trim();
    if (!/^\d{1,5}$/.test(rawPort)) throw new Error("Port must be a number from 1 to 65535.");
    const port = Number(rawPort);
    if (port < 1 || port > 65535) throw new Error("Port must be from 1 to 65535.");
    const username = String(input.username ?? "");
    const password = String(input.password ?? "");
    if (username.length > 512 || password.length > 512) throw new Error("Credentials are too long.");
    if (password && !username) throw new Error("Enter a username when you provide a password.");
    if (scheme.startsWith("socks") && (username || password)) {
      throw new Error("Chrome does not support username/password authentication for SOCKS4 or SOCKS5. Use an IP-allowlisted SOCKS proxy or an HTTP/HTTPS endpoint.");
    }
    const name = (String(input.name || "").trim() || `${host}:${port}`).slice(0, 72);
    const bypass = String(input.bypass || "").trim().slice(0, 2048);
    return {
      id: typeof input.id === "string" && /^[\w-]{1,100}$/.test(input.id) ? input.id : undefined,
      name,
      scheme,
      host,
      port,
      username,
      password,
      bypass,
      createdAt: Number.isFinite(input.createdAt) ? input.createdAt : Date.now()
    };
  }

  function parseLine(source, defaultScheme = "http") {
    const raw = String(source).trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("//")) return null;
    const scheme = normalizeScheme(defaultScheme);
    let data;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.includes("@")) {
      let url;
      try { url = new URL(raw.includes("://") ? raw : `${scheme}://${raw}`); }
      catch (_) { throw new Error("Invalid proxy URL."); }
      if ((url.pathname && url.pathname !== "/") || url.search || url.hash) throw new Error("A proxy address must not contain a path, query or fragment.");
      data = {
        scheme: normalizeScheme(url.protocol.replace(":", "")),
        host: url.hostname,
        port: url.port || ({ http: "80", https: "443" })[url.protocol.slice(0, -1)] || "",
        username: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password)
      };
    } else {
      const bracket = raw.match(/^(\[[^\]]+\]):(\d+)(?::([^:]*):(.*))?$/);
      if (bracket) {
        data = { scheme, host: bracket[1], port: bracket[2], username: bracket[3] || "", password: bracket[4] || "" };
      } else {
        const parts = raw.split(":");
        if (parts.length === 2 && /^\d+$/.test(parts[1])) {
          data = { scheme, host: parts[0], port: parts[1] };
        } else if (parts.length >= 4 && /^\d+$/.test(parts[1])) {
          data = { scheme, host: parts[0], port: parts[1], username: parts[2], password: parts.slice(3).join(":") };
        } else if (parts.length === 4 && /^\d+$/.test(parts[3])) {
          data = { scheme, host: parts[2], port: parts[3], username: parts[0], password: parts[1] };
        } else {
          throw new Error("Use host:port, host:port:user:pass, user:pass@host:port, or a proxy URL.");
        }
      }
    }
    return validateProfile(data);
  }

  function dedupeKey(profile) {
    return normalizedKey(validateProfile(profile));
  }
  function normalizedKey(profile) {
    return JSON.stringify([profile.scheme, profile.host, profile.port, profile.username, profile.password]);
  }

  function parseImport(text, defaultScheme = "http") {
    const source = String(text || "").trim();
    if (!source) throw new Error("Paste at least one proxy or select a file.");
    const profiles = [];
    const errors = [];
    const seen = new Set();
    let duplicates = 0;
    function add(profile) {
      if (!profile) return;
      const key = normalizedKey(profile);
      if (seen.has(key)) {
        duplicates++;
        return;
      }
      seen.add(key);
      profiles.push(profile);
    }
    if (source.startsWith("{") || /^\[\s*[\{\[\"]/m.test(source)) {
      try {
        const doc = JSON.parse(source);
        const values = Array.isArray(doc) ? doc : doc.profiles;
        if (!Array.isArray(values)) throw new Error("JSON must contain a profiles array.");
        for (let i = 0; i < values.length; i++) {
          try { add(validateProfile(values[i])); }
          catch (error) { errors.push(`Profile ${i + 1}: ${error.message}`); }
        }
      } catch (error) {
        if (error instanceof SyntaxError) throw new Error("Invalid JSON backup file.");
        throw error;
      }
    } else {
      const lines = source.split(/\r?\n/);
      if (lines.length > 10000) throw new Error("Too many lines. Import up to 10,000 lines at a time.");
      for (let i = 0; i < lines.length; i++) {
        try {
          add(parseLine(lines[i], defaultScheme));
        } catch (error) { errors.push(`Line ${i + 1}: ${error.message}`); }
      }
    }
    if (profiles.length > MAX_PROFILES) throw new Error(`Maximum ${MAX_PROFILES} proxies per import.`);
    return { profiles, errors, duplicates };
  }

  const api = { normalizeScheme, validateProfile, parseLine, parseImport, dedupeKey, MAX_PROFILES };
  root.ProxyParser = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
