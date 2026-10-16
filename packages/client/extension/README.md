# Traqora Flight Price Tracker (browser extension)

Manifest V3 extension that watches flight search pages on third-party travel
sites, records what fares they show, and alerts the user when a tracked route
drops in price. Prices are stored server-side by the Traqora backend, so the
history follows the user across browsers.

## How it works

```
content-script.ts   detects the itinerary from the page URL, scrapes visible
                    fares, forwards only the cheapest changed price
        │  chrome.runtime message
        ▼
background.ts       matches the itinerary to one of the user's trackers,
(service worker)    POSTs the sighting, notifies on a qualifying drop, and
                    queues sightings that fail to upload
        │  HTTPS
        ▼
backend             POST /api/v1/tracking/trackers/:id/observations
                    → appends to price history, applies drop rules + cooldown
```

`popup.ts` reads the current tab's detection to offer one-click tracking and
lists existing trackers; `options.ts` stores the API URL, token, and alert
threshold.

## Build

The extension has no bundler — TypeScript compiles straight to ES modules,
which MV3 loads natively.

```bash
cd packages/client/extension
npx tsc            # emits dist/*.js from src/*.ts
```

Then load it: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select this directory.

> Icons are not committed. Add `icons/icon-16.png`, `icons/icon-48.png`, and
> `icons/icon-128.png` before publishing; Chrome loads the extension without
> them but shows a placeholder and logs a warning.

## Configure

Open the extension's **Settings** page and set:

| Setting | Meaning |
| --- | --- |
| API base URL | Traqora backend origin, e.g. `https://api.traqora.io` |
| API token | Bearer token for your Traqora account, kept in `chrome.storage.sync` |
| Minimum drop to notify | Client-side floor for desktop notifications |
| Notifications | Master switch for desktop alerts |
| Auto-detect | Recognise flight searches while browsing |

The backend applies its own drop rules (5% below the previous sighting, or the
user's target price) and a 6-hour notification cooldown. The extension's
threshold only filters desktop notifications further — it never loosens them.

## Supported sites

Detection is URL-driven, one matcher per site, in `src/flight-detection.ts`:

| Site | URL shape |
| --- | --- |
| Kayak | `/flights/JFK-LAX/2026-08-01/2026-08-10` |
| Skyscanner | `/transport/flights/jfk/lax/260801/260810/` |
| Expedia | `/Flights-Search?leg1=from:JFK,to:LAX,departure:2026-08-01…` |
| Generic | `?origin=JFK&destination=LAX&departureDate=2026-08-01` |

To add a site, write a `SiteMatcher` that returns origin, destination, and an
ISO departure date, register it in `MATCHERS`, and add the host to
`manifest.json` under both `host_permissions` and `content_scripts.matches`.

Price scraping (`src/price-extraction.ts`) is selector-based and deliberately
broad; implausible figures are filtered by amount rather than by markup, so a
site redesign degrades to "no price found" instead of reporting garbage.

## Tests

Pure logic — price parsing, itinerary detection, settings normalization, and
the local notification rule — is covered by the client test suite:

```bash
cd packages/client
npm test -- tests/extension
```

## Cross-browser notes

The extension targets Chrome/Edge (MV3, `chrome.*` namespace). Firefox ships
MV3 with the `browser.*` namespace and event-page background scripts; running
there needs a namespace shim and a `background.scripts` manifest key. That
port is **not** included here.
