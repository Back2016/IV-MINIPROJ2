# ENSO Weather Explorer

MiniProj2 interactive dashboard, version **0.1.5**. D3.js visualizations packaged with Electron. Includes NOAA data for 48 states and 44 winters (1982–2025). The installed app runs offline.

## Open the hosted dashboard

The web build uses the same data and linked D3 views as the desktop app, without installation. The installed app remains available for offline use.

The prepared workflow builds and deploys the website whenever `main` changes, once Pages is enabled. Hosting is currently pending: GitHub rejected Pages for this private repository on the current account plan. Before enabling deployment, resolve the hosting restriction and select **Settings > Pages > Source > GitHub Actions**. The expected URL for this repository is `https://Back2016.github.io/IV-MINIPROJ2/`.

To preview the web build locally:

```sh
npm ci
npm run build
npx vite preview
```

Open the local URL printed by Vite. Relative asset paths support the `/IV-MINIPROJ2/` project URL as well as Electron. Deployment configuration is in `.github/workflows/pages.yml`; it publishes only `dist/`.

## Download the published Mac release (v0.1.5)

[Download ENSO Weather Explorer v0.1.5 for Apple Silicon](https://github.com/Back2016/IV-MINIPROJ2/releases/download/v0.1.5/ENSO.Weather.Explorer-0.1.5-arm64.dmg) · [Release notes and checksum](https://github.com/Back2016/IV-MINIPROJ2/releases/tag/v0.1.5)

Requires **macOS 13 or later** and an **Apple Silicon Mac (M-series, arm64)**. The installer includes the runtime and data; Node.js, npm and Python are not needed to use the installed app. Intel Mac users can build an x64 package using the instructions below.

1. Download and open the DMG.
2. Drag **ENSO Weather Explorer.app** into **Applications**. Quit any previous copy before replacing it.
3. Launch the app from Applications and check the header for **v0.1.5**.

The app is not Developer ID signed or notarized. If macOS blocks it, follow [Apple's instructions for opening an app from an unidentified developer](https://support.apple.com/en-us/102445) for software you trust. Do not disable system security.

Optional download verification (run from the folder containing the downloaded file):

```sh
shasum -a 256 ENSO.Weather.Explorer-0.1.5-arm64.dmg
```

Expected SHA-256: `2d30c8108fba2dec8b4d3700f81c1de2a0e8ec7c75e576097f5989f9abaf04c7`.

This DMG was built natively on Apple Silicon, launched directly from the mounted disk image and tested offline. All eight packaged app checks passed.

See [class feedback and changes](CLASS-FEEDBACK.md) for the updates since v0.1.3.

## Run from source on a Mac

Requires macOS 13 or later, Git, and Node.js **22.15 or later** with npm. Use a native Apple Silicon Node installation on an M-series Mac, or x64 Node on an Intel Mac. Install Node from https://nodejs.org/en/download if needed.

```sh
git clone https://github.com/Back2016/IV-MINIPROJ2.git
cd IV-MINIPROJ2
npm ci
npm start
```

`npm ci` downloads the pinned dependencies and Electron runtime. `npm start` builds and opens the app; quit the window before building an installer. Python is not required to run or package the app.

## Build and install a Mac app

In the same repository folder on your Mac:

```sh
npm run make -- --platform=darwin
open out/make
```

Forge chooses the architecture of your Node process automatically. It produces a **DMG and ZIP** under `out/make/`. Open the DMG and drag **ENSO Weather Explorer.app** into Applications, then launch it there. Quit and replace any previous copy. A build from this source shows **v0.1.5** in the app header.

Check architecture with `node -p process.arch`: `arm64` for Apple Silicon or `x64` for Intel. To specify explicitly, append `--arch=arm64` or `--arch=x64` to the make command. Prefer a native terminal/Node installation rather than Rosetta on Apple Silicon.

DMG creation requires macOS ([Electron Forge documentation](https://www.electronforge.io/config/makers/dmg)). No Developer ID signing or Apple notarization is configured. If an unidentified-developer prompt appears, follow [Apple's per-app opening instructions](https://support.apple.com/en-us/102445) for software you trust. Do not disable system security. The released Apple Silicon DMG has also passed the offline checks described above.

## Pull later changes

```sh
git pull --ff-only origin main
npm ci
npm start
# Rebuild the installed copy when ready:
npm run make -- --platform=darwin
```

If Git reports local changes, preserve them before pulling. Updating this source folder does not update the copy in Applications; install the newly built app again.

## Quick check

1. Initial view: 2,112 records / 44 winters, precipitation mode.
2. Click California: State filter becomes California, with 44 records.
3. Switch to temperature. Open **Set exact bounds**, enter ONI 0–3 and temperature 0–6, then select the range: 8 California records / 8 winters.
4. **Clear selection** returns to 44 California records and keeps temperature. **Show all states** removes the state scope. **Reset all** restores all records and precipitation.

The three views support linked selections and use larger axis labels. The desktop app opens maximized with charts sized to the window. Open **Map details**, **Plot guide**, or **Chart details** for explanations. **Data & methods** and **Set exact bounds** also open in pop-outs; press Escape or choose **Close** to return to the dashboard. Use **Find observations** below the map to search records, and switch between **Tile map** and **Geographic map** without changing filters. Both maps use the same anomaly scale.

## Development and checks

```sh
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

Optional installed-Mac check:

```sh
node scripts/test_packaged.cjs "/Applications/ENSO Weather Explorer.app/Contents/MacOS/enso-weather-explorer"
```

Windows installer: run `npm ci` and `npm run make` on Windows; output is under `out/make/squirrel.windows/`. The app uses the same source on both platforms.

`src/` contains the D3 views, model and processed data; `electron/` contains the desktop shell; `data-raw/` contains the original NOAA snapshots. Optional Python 3.10+ scripts rebuild/check the data: `python scripts/prepare_data.py` and `python scripts/test_data.py`. Source dependencies are pinned in `package-lock.json`.

For v0.1.5, six model tests, ten browser scenarios and eight offline checks from the mounted Apple Silicon DMG passed. Windows installed-app checks were run on v0.1.3. See [sources and assistance](ACKNOWLEDGMENTS.md). Submission covers and peer records are maintained separately from this app repository.
