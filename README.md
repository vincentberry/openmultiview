<p align="center"><img src="public/assets/openmultiview-icon.png" width="104" alt="OpenMultiview logo"></p>

# OpenMultiview

**An open-source multiview companion for vMix.** Build reusable 16:9 layouts,
monitor Preview/Program tally and audio, and recall your screens by URL.

[Public website](https://vincentberry.github.io/openmultiview/) ·
[Getting started](https://vincentberry.github.io/openmultiview/guide.html) ·
[Français](README.fr.md) · [Español](README.es.md) · [MIT license](LICENSE)

![OpenMultiview — your vMix multiview, your layout](public/assets/social-card.jpg)

OpenMultiview grew out of a production workflow and is now available for the
vMix community to use, adapt and improve. vMix provides the video layers;
OpenMultiview arranges them and adds a transparent HTML overlay. The website's
preview is an illustration, not a live video feed.

## What it does

- Presets, custom saved layouts, 16:9 tiles and adjustable spacing.
- Per-screen Classic or OpenMultiview styling, with mint/coral tally and
  full-width navy labels. Themes are included in saved models and recall URLs.
- 1–32 screens with one browser page per screen.
- Automatic creation and reuse of vMix inputs, including nested groups for
  multiviews larger than ten video layers.
- A dedicated full-screen HTML source on layer 10 of each screen's root input.
- Stable input IDs and direct layer-source assignment in the configuration page.
- Preview/Program tally on frames or transparent titles; labels above, below
  or inside a tile.
- Input, Master and BUS A–G stereo meters, inside or beside a tile.
- Media countdown, loop indicator and VideoList title/elapsed-time information.
- Separate configuration and display pages, connected-page status and URL recall.
- Backwards-compatible `Inputs`, `Settings` and `MaskSettings` links.
- French, English and Spanish UI, with a saved language preference. Source
  names and vMix IDs stay unchanged; recall URLs can include `Lang=en` or `Lang=es`.

## Quick start on the vMix PC

On Windows, the [offline application](docs/companion-windows.md) includes its own
server and needs neither Node.js nor the source launcher. The steps below are
the optional way to run directly from the sources.

You need **vMix 27+** for automatic layer commands, **Node.js 22+**, and an
accessible vMix HTTP API (usually `http://127.0.0.1:8088/api`). Your vMix edition's
input limits still apply. Chrome or Edge is recommended for configuration.

1. Install [Node.js](https://nodejs.org/en/download) if needed.
2. [Download the project ZIP](https://github.com/vincentberry/openmultiview/archive/refs/heads/main.zip)
   and extract it.
3. Run **`scripts/start-openmultiview.cmd`** on Windows and keep the window open.
4. Open [the local configuration](http://127.0.0.1:8090/config.html), or use the
   public site's configuration with local-network access allowed in your browser.
5. Set your PC identifier, vMix address and screen count, then apply a preset.
6. Save the vMix preset and keep the recall URLs.

From a terminal, the equivalent is:

```powershell
git clone https://github.com/vincentberry/openmultiview.git
cd openmultiview
node server.js
```

There are **no npm dependencies to install**. The local companion listens only on
`127.0.0.1:8090`. Configurations are stored in `%LOCALAPPDATA%/multiview-vmix` on
Windows, outside the checkout. Keep this folder when updating the project.
Restart the companion and refresh the HTML sources in vMix after an update.

## Public website and local companion

The public website is static: it has no central configuration database and no
account system. Each visitor works with their own vMix API and their own PC's
companion. The companion accepts local pages and the official HTTPS origin:

- `https://vincentberry.github.io`

Chrome and vMix use different browser profiles, so live synchronization between
them needs the companion. Browsers may require permission for local-network
access; the local configuration is the fallback if an embedded browser cannot
connect from HTTPS. A complete URL can still recall a display without the
companion. Large configurations put their settings after `#`, keeping the HTTP
request short to avoid “URI Too Long”. Keep the entire URL to recall both screens
and all settings after a restart.

A recall URL contains source IDs, API address and settings. Anyone receiving it
can read those values. Parameters before `#` may appear in the host's logs;
the fragment after `#` is not sent in the HTTP request.
Use local pages if those requests should stay on the PC. See
[Confidentiality](https://vincentberry.github.io/openmultiview/privacy.html).

## Development

```powershell
npm test
npm start
```

Tests exercise layout geometry, input creation/reuse, HTML layer placement,
source IDs, legacy URLs, audio routing, timers, presence, PC isolation and public
origin restrictions. GitHub Actions runs them on Windows and Linux. A manual
vMix simulator is available with `node tests/vmix-fixture.cjs` on port 8767.

| Path | Purpose |
| --- | --- |
| `public/*.html` | Site pages, configuration, multiview and player |
| `public/js/site.js`, `public/css/site.css` | Public introduction and illustrative preview |
| `public/js/config.js`, `public/css/config.css` | Configuration interface |
| `public/js/viewer.js`, `public/css/viewer*.css` | Transparent multiview overlay and its settings |
| `public/js/player.js`, `public/css/player.css` | Standalone programme player overlay |
| `public/js/multiview-model.js` | Shared layout, IDs, serialization and compatibility |
| `public/js/multiview-builder.js` | vMix input/layer construction |
| `public/js/locales*.js`, `public/js/i18n.js` | Translations and language selection |
| `public/assets/`, `public/vendor/` | Images and third-party browser code |
| `server.js` | PC-local synchronization and static serving |
| `desktop/` | Offline Windows application and network policy |
| `scripts/` | Build, audit and desktop verification tools; shared web-file allowlist |
| `deploy/docker/` | Optional Dockerfile, Compose configuration and nginx configuration |
| `tests/`, `docs/` | Automated checks, simulator and documentation |

The server exposes `public/` at the site root, so page URLs such as
`/config.html` and `/index.html` stay unchanged. `dist/` and `release/` contain
generated output and are ignored by Git; edit the sources in `public/`.
The local server runs without npm packages. `npm ci` installs the development
dependencies needed to run or build the Electron application.

## Hosting your own copy

```powershell
$env:PUBLIC_URL = 'https://multiview.example.com/'
npm run build
```

Publish **only `dist/`** to a static HTTPS host. The build sets canonical, social
and sitemap URLs, includes a query-aware entry point for old viewer links, and
does not publish the companion, `.env` files or PC data. `viewer.html` contains
the overlay in this bundle; legacy `index.html?Inputs=...` links still dispatch to
it. The source `public/index.html` remains the overlay for existing local setups.

For a custom public origin, launch the companion with:

```powershell
$env:MULTIVIEW_PUBLIC_ORIGINS = 'https://multiview.example.com'
node server.js
```

Declare an exact HTTPS origin, without a path; don't use a wildcard. `PUBLIC_URL`
must match the website you build. `MULTIVIEW_PORT` and `MULTIVIEW_DATA_DIR` can
override the companion port and storage folder. Public sites currently discover
the default port 8090.

The optional Docker configuration is in `deploy/docker/`. From the repository
root, run `docker compose -f deploy/docker/docker-compose.yml up --build -d`.
It uses an existing external network named `web` for your reverse proxy and
serves the static bundle through nginx. See [hosting details](docs/publication.md).
GitHub Pages deployment is automated by `.github/workflows/pages.yml`.

See [public hosting and SEO](docs/publication.md),
[full multiview documentation](docs/multiview-configuration.md).

## Contributing

Issues, presets, documentation improvements and pull requests are welcome.
Please read [CONTRIBUTING.md](CONTRIBUTING.md) and use the issue templates. Do not
publish production credentials or private recall URLs in an issue.
For vulnerabilities, use [private security reporting](SECURITY.md).

## License and credits

[MIT](LICENSE) — Copyright © 2026 OpenMultiview contributors.
Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
The logo and original website assets are included with the project; see
[branding](docs/branding.md).

OpenMultiview is an independent community project. It is not affiliated with or
endorsed by vMix; vMix is a separate product with its own license.
