# Velvet Proxy

**A modern, lightweight proxy manager for Chromium-based browsers.**

Manage multiple proxy connections, verify their availability, identify public IP locations, and switch between profiles through a clean and intuitive browser extension.

Velvet Proxy brings proxy management into one organized workspace without requiring a separate desktop application, user account, or cloud dashboard.

**Version:** 1.3.3  
**Platform:** Google Chrome and compatible Chromium browsers  
**Extension architecture:** Manifest V3  
**Built with:** JavaScript, HTML, and CSS

---

## Overview

Velvet Proxy is a browser extension designed to make everyday proxy management simple and efficient.

Instead of repeatedly changing your browser's network settings or manually entering proxy credentials, you can save multiple proxy configurations and manage them directly from the extension popup.

Whether you use datacenter proxies, residential proxies, or private authenticated proxy endpoints, Velvet Proxy provides a convenient interface for organizing, testing, and switching between your connections.

The extension focuses on three core principles:

- **Simplicity:** Manage proxies without complicated configuration.
- **Reliability:** Verify proxy connections and distinguish successful checks from inconclusive results.
- **Privacy:** Keep saved profiles locally, without requiring an account or cloud synchronization.

## Key Features

### 1. Multi-Proxy Management

Save and organize multiple proxy profiles within a single extension.

Each proxy profile can include:

- Custom profile name
- Proxy hostname or IP address
- Port number
- Connection protocol
- Username and password, where supported
- Optional bypass domains
- Last verified public IP and approximate location

Quickly search, edit, select, or delete your saved connections.

### 2. Multiple Proxy Protocols

Velvet Proxy supports the following proxy configurations:

| Protocol | Supported | Username/Password |
|---|---|---|
| HTTP Proxy | Yes | Yes |
| HTTPS Proxy (TLS) | Yes | Yes |
| SOCKS4 | Yes | No |
| SOCKS5 | Yes | No |

**HTTP Proxy:** Connects to an HTTP proxy server and can access HTTPS websites through the CONNECT method.

**HTTPS Proxy (TLS):** Establishes an encrypted TLS connection between the browser and the proxy server when supported by the provider.

**SOCKS4 / SOCKS5:** Supports compatible SOCKS endpoints. Chrome does not provide username/password authentication for SOCKS proxies through its standard proxy configuration API.

For authenticated SOCKS connections, use an IP-allowlisted endpoint or ask your provider for HTTP/HTTPS proxy access.

### 3. One-Click Proxy Switching

Switch between saved proxy profiles without manually editing browser network settings.

Velvet Proxy provides:

- Quick proxy selection
- Connection ON/OFF control
- Active connection information
- Automatic application of the selected proxy configuration
- Restoration of browser proxy control when the extension is turned off

The extension also uses different toolbar icons for connected and disconnected states.

**Note:** Chrome proxy settings are browser-wide. Other proxy extensions, browser policies, VPN features, or system configurations may interfere with proxy control.

### 4. Live Proxy Verification

Velvet Proxy includes a built-in verification system to help determine whether a proxy is working.

When a proxy is checked, the extension attempts to route an IP verification request through the selected proxy and inspect the observed public IP.

The verification process generally involves:

1. Determining the direct-connection public IP when available.
2. Applying the candidate proxy configuration.
3. Sending a request to a public IP verification service.
4. Inspecting the returned public IP.
5. Comparing the result against the direct-connection IP.
6. Reporting the verification result.
7. Restoring the previous proxy configuration when appropriate.

A different observed public IP is evidence that the verification request used a different network exit. It does not independently prove that every destination will work through the proxy or that the connection is anonymous.

#### Verification Statuses

| Status | Meaning |
|---|---|
| LIVE | The proxy passed the configured public IP verification checks |
| FAILED | The verification attempt encountered a connection or other test failure |
| UNVERIFIED | The available response was insufficient to confirm the proxy |
| AUTH_FAILED | Proxy authentication failed or was rejected |
| TIMEOUT | The verification attempt exceeded its allowed time |

A failed verification does not always mean the proxy is permanently offline.

Temporary network problems, provider restrictions, authentication issues, blocked IP-checking services, and response delays can affect the results.

### 5. Bulk Proxy Checker

Check multiple proxies from one interface instead of testing them individually.

The bulk checker supports:

- Multiple proxy entries
- Text-based proxy lists
- Sequential proxy verification
- Verification retry handling
- LIVE, FAILED, and UNVERIFIED results
- Progress indicators
- Importing verified LIVE proxies

The checker attempts to reduce false-negative results caused by temporary response failures and proxy switching delays.

**Important:** Bulk verification temporarily changes the browser's proxy configuration while checking candidate endpoints. Avoid sensitive browsing during a bulk check.

Only proxies that satisfy the LIVE verification criteria are eligible for LIVE-only import.

### 6. Flexible Proxy Import

Velvet Proxy accepts common proxy formats.

Supported examples:

```text
192.0.2.10:8080
192.0.2.10:8080:username:password
username:password@192.0.2.10:8080
http://username:password@192.0.2.10:8080
https://username:password@192.0.2.10:8443
socks5://192.0.2.10:1080
```

The addresses above are documentation examples, not working proxy servers.

For entries without an explicit protocol, select the correct default protocol in the import interface.

The extension supports importing proxy data from pasted text and compatible local files.

### 7. Proxy Profile Export

Back up your saved proxy profiles using the built-in export feature.

Export options include JSON profile data and optional password inclusion.

Passwords should only be included when transferring profiles to a trusted environment.

**Warning:** Exported JSON files containing credentials are not encrypted. Keep backups private and never commit them to a public repository.

### 8. Public IP and Geolocation

Velvet Proxy can display information about an observed proxy exit IP.

Information may include:

- Public IP address
- Country name
- Country code
- City
- Region, when available
- Connection verification latency

Geolocation information is obtained through the `ipwho.is` service.

IP-based location results are approximate and may not reflect the actual physical location of the proxy server.

### 9. Dynamic SVG Country Flags

Country flags are retrieved using the geolocation API response rather than relying on a large collection of bundled flag images.

Example API response:

```json
{
  "flag": {
    "img": "https://cdn.ipwhois.io/flags/bd.svg",
    "emoji": "🇧🇩"
  }
}
```

The extension uses the flag image URL to display the corresponding country flag.

If the SVG image cannot be loaded, a country emoji may be used as a fallback.

**Benefits:**

- Lightweight asset management
- Consistent country identification
- SVG-based flag rendering
- Reduced dependency on bundled PNG flag collections

Loading SVG flags from the external CDN requires network access to the flag provider.

### 10. Modern User Interface

Velvet Proxy includes a compact interface designed for everyday use.

Interface elements include:

- Connection status indicators
- Active proxy details
- Searchable proxy library
- Custom profile editor
- Dedicated import/export dialogs
- Confirmation dialogs for destructive actions
- Animated SVG interface elements
- Connected and disconnected toolbar icons

The interface is built using standard browser technologies without requiring a separate desktop application.

---

## Installation

Velvet Proxy can be installed manually as an unpacked Chromium extension.

### Google Chrome

1. Download the latest ZIP package from the repository's **Releases** section.
2. Extract the downloaded ZIP file.
3. Open Google Chrome.
4. Navigate to `chrome://extensions`.
5. Enable **Developer mode**.
6. Click **Load unpacked**.
7. Select the extracted folder containing `manifest.json`.
8. Pin Velvet Proxy to your browser toolbar.

The extension is now ready to configure.

### Microsoft Edge

1. Open `edge://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked**.
4. Choose the extracted extension folder.

### Brave Browser

1. Open `brave://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked**.
4. Choose the extracted extension folder.

**Compatibility note:** Brave and Edge use Chromium extension APIs, but behavior can differ because of browser-specific settings. Test proxy authentication and switching on your browser.

### Mozilla Firefox

Firefox uses different proxy management APIs. The Chrome extension package is not intended to be installed directly in Firefox.

Use a separately maintained Firefox-compatible build when available.

---

## Getting Started

### Add Your First Proxy

1. Open Velvet Proxy from the browser toolbar.
2. Click **Add Proxy**.
3. Enter a profile name.
4. Select the proxy protocol.
5. Enter the proxy host and port.
6. Enter credentials if required and supported.
7. Click **Verify & Save**.

The extension will attempt to verify the connection before accepting the proxy.

### Connect to a Saved Proxy

1. Open the extension.
2. Find the desired proxy in your saved list.
3. Click **USE** to select it.
4. Confirm the active connection details.
5. Optionally run **Check IP** to verify the observed exit IP.

### Disconnect a Proxy

Use the connection toggle to disable the extension's proxy configuration.

Chrome will return to its remaining proxy settings, which may be controlled by the operating system, another extension, or an administrative policy.

### Import Multiple Proxies

1. Click the Import button.
2. Choose the appropriate default protocol.
3. Paste your proxy list or choose a supported file.
4. Click **Check Proxies**.
5. Review the verification results.
6. Select **Add LIVE** to import verified entries.

### Export Saved Proxies

1. Click the Export button.
2. Choose whether passwords should be included.
3. Download the JSON backup.
4. Store the file in a private, trusted location.

---

## How Proxy Verification Works

Velvet Proxy uses a public IP verification workflow.

A basic connection check follows this sequence:

```text
User selects a proxy
        |
        v
Extension applies proxy settings
        |
        v
IP verification request
        |
        v
Public IP response received?
        |
     Yes / No
        |
        v
Compare against direct connection
        |
        v
LIVE / FAILED / UNVERIFIED
        |
        v
Display result and restore settings
when appropriate
```

The verification service helps identify the public IP observed for a test request.

Geolocation is handled separately using `ipwho.is`.

### Verification Limitations

A proxy may pass an IP test but still encounter restrictions on other websites.

Likewise, a working proxy may fail an individual verification because the testing endpoint is blocked or temporarily unreachable.

For this reason, verification results should be treated as diagnostic information rather than a permanent guarantee of availability.

---

## Privacy and Data Handling

Velvet Proxy is designed to work without account registration or cloud synchronization.

### Local Storage

Saved proxy profiles, preferences, and credentials are stored using browser extension storage.

The extension does not provide an additional encryption layer for stored proxy credentials.

Anyone with sufficient access to the browser profile or local system may be able to access this information.

### External Services

The extension may communicate with external services when performing verification or geolocation operations.

| Service | Purpose |
|---|---|
| `api.ipify.org` | Public IP verification |
| `ipwho.is` | IP geolocation |
| `cdn.ipwhois.io` | Country flag SVG images |

Additional IP verification endpoints may be used by the bundled verification implementation.

External services may observe the IP addresses and request metadata associated with requests they receive.

### No Cloud Account

Velvet Proxy does not require users to register an account to store or manage profiles.

The extension does not include a built-in cloud synchronization system.

### Security Recommendations

- Use proxy services from trusted providers.
- Avoid sharing files containing proxy credentials.
- Do not commit real proxy credentials to GitHub.
- Protect your local browser profile.
- Update the extension from trusted release sources.
- Use HTTPS websites where possible.
- Do not treat proxy routing as a complete anonymity or privacy solution.

---

## Browser Permissions

Velvet Proxy uses browser permissions to operate its proxy management features.

| Permission | Purpose |
|---|---|
| `proxy` | Configure browser proxy routing |
| `storage` | Store local proxy profiles and settings |
| `webRequest` | Observe relevant network requests |
| `webRequestAuthProvider` | Respond to supported proxy authentication challenges |
| Host access | Access required verification and geolocation endpoints |

Some permissions may provide broad technical access. Review the extension's `manifest.json` for the exact permission declarations in your installed version.

---

## Troubleshooting

### Proxy shows FAILED but works elsewhere

Possible causes include:

- Temporary provider instability
- Incorrect selected protocol
- Authentication errors
- Blocked verification endpoints
- Network timeouts
- Proxy switching delays

Try checking the proxy individually and confirm whether the provider requires HTTP or HTTPS (TLS).

### Proxy shows UNVERIFIED

UNVERIFIED means the extension could not obtain sufficient evidence to confirm the proxy.

It does not automatically mean the proxy is permanently dead.

Check the network connection and retry verification.

### Proxy authentication fails

Confirm the username, password, hostname, and port.

If using SOCKS4 or SOCKS5 with username/password credentials, switch to a supported HTTP/HTTPS endpoint or use provider-supported IP authentication.

### Proxy does not connect after switching

Check whether another extension, VPN, browser policy, or system proxy configuration is interfering.

Disable conflicting proxy controllers and retry.

### Public IP does not change

Verify that the proxy is selected and active.

A proxy may also share the same public IP as another network path, and some network traffic may not follow the browser proxy configuration.

### Country flag is missing

Flag images require access to the SVG flag CDN.

If the CDN is unavailable or the flag URL is missing, the interface may display a country emoji instead.

Recheck the proxy to refresh available geolocation information.

### Bulk results differ from single checks

Temporary network conditions and proxy response times can affect verification.

Confirm that the bulk import protocol matches the single profile protocol.

Retry inconclusive results individually when necessary.

### Extension fails to load

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Locate Velvet Proxy.
4. Inspect the extension error details.
5. Confirm that all required files were extracted.
6. Reload the extension.

If necessary, review the background service worker console for startup errors.

---

## Project Structure

The extension is organized around the following core components:

```text
VelvetProxy/
├── manifest.json
├── background.js
├── popup.html
├── popup.js
├── parser.js
├── styles.css
├── icons/
├── README.md
└── Additional UI assets
```

### Main Components

| File | Responsibility |
|---|---|
| `manifest.json` | Browser extension metadata and permissions |
| `background.js` | Proxy configuration, authentication, and verification workflows |
| `popup.html` | Extension popup structure |
| `popup.js` | User interface interactions and profile management |
| `parser.js` | Parsing and validating proxy input formats |
| `styles.css` | Interface styling, layout, and animations |
| `icons/` | Browser toolbar and extension icons |

Additional assets may vary between releases.

---

## What's New in v1.3.3

This release focuses on improved proxy management reliability and dynamic country flag support.

### Highlights

**Dynamic country flags**

- Uses `ipwho.is` country flag image URLs.
- Supports CDN-hosted SVG country flags.
- Provides emoji fallback when SVG loading is unavailable.
- Removes the need for a large local flag image collection.

**Proxy verification reliability**

- Retains the improved bulk verification workflow from the updated source.
- Supports verification retries for temporary failures.
- Distinguishes inconclusive results from verified LIVE connections.
- Preserves the existing LIVE-only import behavior.

**Existing functionality retained**

- HTTP/HTTPS proxy authentication
- SOCKS proxy support
- Single and bulk proxy checking
- Profile editing and deletion
- Import/export
- Connection toggling
- IP and location details
- Premium popup interface

Refer to GitHub Releases for downloadable packages and release-specific changes.

---

## Development

Velvet Proxy is built with standard browser extension technologies:

- JavaScript
- HTML
- CSS
- Chrome Extension APIs
- Manifest V3

No separate desktop application is required.

To inspect or modify the extension locally:

1. Clone or download the source repository.
2. Open the project folder in a code editor.
3. Make the required changes.
4. Reload the unpacked extension using `chrome://extensions`.
5. Verify proxy behavior using authorized proxy endpoints.

Changes to proxy routing, authentication, or bulk verification should be tested carefully because these systems affect browser-wide network configuration.

---

## Contributing

Bug reports, reproducible test cases, documentation improvements, and enhancement suggestions are welcome.

Before reporting an issue:

1. Confirm that you are using the latest published version.
2. Check whether the problem occurs with a single proxy or during bulk verification.
3. Record the browser name and version.
4. Include relevant error messages.
5. Remove proxy passwords, authentication tokens, and other sensitive information from screenshots and logs.

Open a GitHub Issue with the relevant information.

For code contributions, use a separate branch and submit a pull request describing the proposed changes and testing performed.

---

## Known Limitations

- Proxy settings are browser-wide and may conflict with other network tools.
- SOCKS username/password authentication is not supported through Chrome's standard proxy API.
- IP geolocation is approximate.
- Public IP verification does not guarantee complete proxy availability.
- Verification depends on external network services.
- Remote SVG flags require access to the flag CDN.
- Stored proxy credentials are not additionally encrypted by the extension.
- Proxy routing does not guarantee that WebRTC or all browser-related traffic uses the proxy.
- Firefox requires a separate compatible implementation.

---

## License

A software license has not yet been specified for this repository.

Public availability of source code does not automatically grant permission to redistribute, modify, or commercially reuse the software.

Refer to the repository's license file if one is added in the future.

---

## Final Notes

Velvet Proxy is intended to provide a simple, organized, and convenient experience for managing compatible proxy connections.

It is not a VPN service and does not provide proxy servers of its own.

Users must supply their own authorized proxy endpoints.

**Velvet Proxy | Simple proxy management, built for everyday use.**
