<p align="center"><img src="assets/openmultiview-icon.png" width="104" alt="OpenMultiview logo"></p>

# OpenMultiview

**An open-source multiview companion for vMix.** Build reusable 16:9 layouts,
monitor Preview/Program tally and audio, and recall your screens by URL.

[Public website](https://vincentberry.github.io/openmultiview/) ·
[Getting started](https://vincentberry.github.io/openmultiview/guide.html) ·
[Français](README.fr.md) · [MIT license](LICENSE)

![OpenMultiview — your vMix multiview, your layout](assets/social-card.jpg)

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

## Quick start on the vMix PC

You need **vMix 27+** for automatic layer commands, **Node.js 22+**, and an
accessible vMix HTTP API (usually `http://127.0.0.1:8088/api`). Your vMix edition's
input limits still apply. Chrome or Edge is recommended for configuration.

1. Install [Node.js](https://nodejs.org/en/download) if needed.
2. [Download the project ZIP](https://github.com/vincentberry/openmultiview/archive/refs/heads/main.zip)
   and extract it.
3. Run **`start-openmultiview.cmd`** on Windows and keep the window open.
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
companion, subject to the host's URL-length limits.

A recall URL contains source IDs, API address and settings. Anyone receiving it
can read those values, and public-host requests may appear in that host's logs.
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

| File | Purpose |
| --- | --- |
| `home.html`, `site.css`, `site.js` | Public introduction and illustrative preview |
| `config.html`, `studio.js`, `config.css` | Configuration interface |
| `index.html`, `script.js`, `style.css` | Transparent multiview overlay |
| `multiview-model.js` | Layout, IDs, serialization and compatibility |
| `multiview-builder.js` | vMix input/layer construction |
| `server.js` | PC-local synchronization and static serving |
| `player.html` | Standalone programme player overlay |
| `scripts/build-public.cjs` | Allowlisted static-site build |

## Hosting your own copy

```powershell
$env:PUBLIC_URL = 'https://multiview.example.com/'
npm run build
```

Publish **only `dist/`** to a static HTTPS host. The build sets canonical, social
and sitemap URLs, includes a query-aware entry point for old viewer links, and
does not publish the companion, `.env` files or PC data. `viewer.html` contains
the overlay in this bundle; legacy `index.html?Inputs=...` links still dispatch to
it. The repository's `index.html` remains the overlay for existing local setups.

For a custom public origin, launch the companion with:

```powershell
$env:MULTIVIEW_PUBLIC_ORIGINS = 'https://multiview.example.com'
node server.js
```

Declare an exact HTTPS origin, without a path; don't use a wildcard. `PUBLIC_URL`
must match the website you build. `MULTIVIEW_PORT` and `MULTIVIEW_DATA_DIR` can
override the companion port and storage folder. Public sites currently discover
the default port 8090.

The Docker image builds the same static bundle and serves it through nginx.
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
[branding](assets/BRANDING.md).

OpenMultiview is an independent community project. It is not affiliated with or
endorsed by vMix; vMix is a separate product with its own license.
