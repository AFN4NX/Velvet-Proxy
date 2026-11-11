# Velvet Proxy v1.3.3 (Chrome)

A lightweight, local Chrome/Chromium proxy manager. Manifest V3. No accounts, remote code, ads, analytics, or cloud sync.

## IMPORTANT: Updating from v1.0 without losing your profiles

**Do not remove the old installed extension.** Chrome associates unpacked extension data with that installed extension's identity and directory.

1. Keep the original folder selected in `chrome://extensions` when you first loaded v1.0.
2. Download and extract the latest Velvet Proxy ZIP. Open the extracted `VelvetProxy` folder.
3. Copy all files and folders from the extracted `VelvetProxy` folder into **your original extension folder**, replacing the old versions. (Keep the original folder path unchanged.)
4. Open `chrome://extensions`, locate Velvet Proxy, and click **Reload**.
5. Reopen the extension. Your previously saved profiles should appear because the existing `velvet_proxy_state_v1` storage key is retained.

If you prefer a completely separate installation, you can use **Load unpacked** on the new extracted folder. This is a separate extension identity and may start without your old profiles. Before switching, export a v1.0 JSON backup **including passwords**, then import it in the new installation. Keep that backup private because it is not encrypted. Imported proxies are revalidated.

## Desktop and touch layouts

The popup uses a compact desktop layout and adapts to narrower screens. Touch
controls have larger targets, with profile actions below the details. The
saved list initially renders 32 profiles. Use **Show more** or search the
entire collection, including profiles that have not been rendered yet.

The mobile layout requires an extension-capable browser with Manifest V3 and
the Chrome proxy and authentication APIs. Chrome for Android's **Add to
Desktop** installs extensions on a computer, so it cannot run this ZIP on the phone.

## v1.3.3: service worker startup fix

* Fixes `Uncaught TypeError: chrome.storage.local.setAccessLevel is not a function` during startup on browsers that do not expose this optional method.
* Calls the storage access-level restriction only when the API exists. Any failure is nonfatal. There are no content scripts in the extension; this change does not alter proxy routing or stored proxy profiles.
* Storage key `velvet_proxy_state_v1` is unchanged. You must **replace the files in your previously installed unpacked extension folder and Reload**, not remove it, to retain saved profiles.
* Confirm the actual service worker is registered in `chrome://extensions`. If old errors linger, clear the error list after reloading and check whether any new ones appear.

## v1.3.1: proxy checking hang fix

* Adds strict per-service timeouts to direct-IP checks (4 seconds), proxied-IP checks (6 seconds) and optional geolocation (3.5 seconds), including response-body parsing. Unlike AbortController alone, the worker now continues even if an aborted proxy handshake fails to settle.
* Adds a 38-second popup-side watchdog for checking commands. Add Proxy can no longer remain stuck on "Checking proxy…" forever: a timeout becomes a visible error and the button is re-enabled.
* Maintains existing conservative LIVE/FAILED/UNVERIFIED rules, local-only credential storage, and automatic restoration of Chrome's previous proxy configuration after each probe.
* No changes to CSS, SVG visuals, parser, proxy profile schema or saved storage key. The verification timeout is shorter than before, so extremely slow proxies may fail verification; a timeout is not proof a proxy is permanently dead.

## v1.3.0: visual-only refresh

**In v1.3.0, proxy logic was unchanged** from v1.2.1. In v1.3.1, only request deadlines and the popup watchdog were corrected. Storage keys and permissions remain unchanged.

* Refined midnight-blue, deep-teal and soft mint palette with better contrast and calmer accents.
* More balanced connection card with an animated SVG connection radar and a softly animated logo.
* Radar animation activates only while Chrome confirms a proxy is connected. Off/system state is visually quiet.
* More compact, structured saved-proxy cards. Location, exit IP and last-verified details have clearer hierarchy.
* Improved buttons, search field, confirmation dialogs, editor and bulk-check progress layout.
* Animation automatically turns off when the operating system's **Reduce motion** preference is enabled.
* Existing toolbar icons, active/off toggle behavior, no-location-badge policy, import/export and connection checks are retained.

## v1.2.1 toggle fix

* Fixed the main ON/OFF switch staying disabled after turning a connected proxy OFF.
* The selected profile is preserved when off, so you can turn it ON again from the same main switch without pressing USE.
* Action controls are refreshed after asynchronous commands finish, even if the command fails.

## v1.2 interface refinements

* Current Connection is the only place showing the Check IP result. Success shows LIVE, approximate location, observed public IP and latency; failed/unverified results also appear in the same card. No separate result panel underneath.
* Removed the toolbar country/city badge setting. Toolbar displays distinct connected/off icons, with the status confirmed against Chrome proxy ownership.
* Removed the format example card from the bulk import dialog. Parsing support for all listed formats is unchanged.

## Features carried forward from v1.1

1. **Verify before save:** Add or edit performs a real public-IP request through the candidate proxy before writing it to saved profiles. Only a confirmed LIVE result is accepted. Failed and unverified proxies are NOT saved.
2. **Premium delete confirmation:** In-extension modal replaces the Chrome `confirm()` popup.
3. **IP and location:** Verified profiles display the observed public IP, estimated city and country (when available), measured request time, and last checked date. Connecting a profile automatically rechecks its IP.
4. **Toolbar connection icon:** Clean mint icon for an active Chrome proxy, muted slate icon for proxy off/overridden. No country/city badges or mode setting.
5. **Bulk proxy checker:** Paste TXT lines or import a JSON file, press **Check proxies**, view per-proxy LIVE / FAILED / UNVERIFIED results and counters, then press **Add LIVE** to import only the verified entries. Duplicates are skipped. Stop after the current check is available.

## How checking works

The checker temporarily updates the *browser-wide* proxy settings, performs HTTPS requests to check the public IP, compares it to the non-extension network's public IP, and restores the saved active proxy (or underlying Chrome settings) after every candidate. During checking, other tabs can briefly use the candidate proxy or the non-extension network, and their requests could be interrupted. Prefer to check while not doing sensitive browsing or downloads. **Keep the popup open until checking is complete.**

* **LIVE:** A public-IP check succeeded via the candidate configuration and returned an IP different from the baseline.
* **FAILED:** The IP verification services could not be accessed. Often means an unusable proxy, incorrect protocol, authentication failure, or timeout, but some otherwise working proxies block these test services.
* **UNVERIFIED:** A reachable IP service returned the same exit IP as the baseline, or a reliable baseline was unavailable. This does **not** necessarily mean the proxy is dead. The conservative policy does not import it.
* Public-IP checks are not a guarantee of security, anonymity, DNS safety, or access to every website.
* Requests are made only when you add/edit, manually check, switch/enable, or run bulk validation. No background periodic scanning.

For reliability, the IP echo checks use `https://api.ipify.org?format=json` with a fallback to `https://api.myip.com`; `https://ipwho.is/<observed-ip>` provides approximate geolocation. Your apparent IP address is shared with these services for verification and lookup. **Credentials are not included in the API URLs**; Chrome submits them to the configured HTTP/HTTPS proxy only when the proxy issues an authentication challenge. Provider geolocation can be approximate or empty, and the optional service can have limits or outages. Do not interpret city as GPS location.

## Supported formats

One proxy per line, with protocol chooser for lines without scheme:

```text
proxy.example.com:8080
proxy.example.com:8080:user:password
user:password@proxy.example.com:8080
http://user:password@proxy.example.com:8080
https://proxy.example.com:443
socks5://proxy.example.com:1080
```

Also accepts v1 JSON backups. Max 1,000 profiles in the library or check list, and 2 MB per uploaded TXT/JSON file. Bulk checks run **sequentially**, because Chrome has a single effective proxy setting. Checking hundreds of unresponsive proxies can take a long time, especially with fallback echo services. Stopping stops after the current candidate. Progress is kept in the open popup, not in a background job.

## Security and limitations

* **HTTP proxy** usually supports browsing HTTPS websites using CONNECT. **HTTPS proxy (TLS)** means TLS between Chrome and the proxy itself; select it only if the provider explicitly offers that endpoint.
* Chrome's built-in proxy engine does not accept SOCKS4/SOCKS5 username/password authentication. IP-allowlisted SOCKS can work.
* A proxy setting can be blocked by enterprise policy or another extension. The manager detects conflicts where Chrome reports them.
* Proxy credentials are saved only in Chrome's local extension storage, without additional encryption by this extension. Restrict local device access. Exporting backups with passwords writes the credentials in cleartext.
* Other applications, Chrome WebRTC behavior, browser-specific DNS features, and privacy settings may bypass ordinary browser proxy settings.
* No live connection to a user-supplied proxy was available during development. JavaScript parser tests, mocked Chrome API state/auth/verification tests, and rendered popup interaction tests were completed; a real proxy is required to confirm production behavior in your Chrome setup.

## Troubleshooting

* **Previously saved proxies missing?** You probably loaded the new folder as a second extension. Restore to the old folder and click Reload; do not uninstall the original extension.
* **A working proxy reports UNVERIFIED?** Its exit IP may match the baseline, a VPN or other proxy may be active, or the direct baseline request failed. This is conservative by design.
* **FAILED to fetch?** Check protocol (HTTP vs HTTP with TLS), address, port, username, password, browser proxy ownership and whether the proxy provider blocks ipify and myip. The result is not proof of permanent outage.
* **Location unknown?** The geolocation lookup failed or has no data for that IP. Verified IP/routing can still work.
* **Bulk check stops early?** Keep the popup open until complete. Browser proxy settings are global; the checker must verify sequentially. Reload after a transient connection failure or broken proxy ownership.

### Flag display update (v1.3.3)

- Flag SVGs are loaded from `ipwho.is` response `flag.img`, restricted to HTTPS URLs under `cdn.ipwhois.io/flags/xx.svg`. No packaged PNG flags are used.
- Country flag emoji is shown for previously saved profiles without a `flag.img` value, and if the SVG download fails. Re-run **Check IP** to obtain a fresh API flag URL.
- The API response flag URL and emoji are stored locally with the verified IP. No proxy verification or switching behavior was modified.
- External flag assets require a browser network connection and may pass through your configured proxy.
