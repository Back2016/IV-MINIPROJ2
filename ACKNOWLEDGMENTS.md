# Sources and assistance

Data retrieved October 15, 2026:

- NOAA CPC, historical ONI (ERSSTv5): https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/oni/v5/
- NOAA NCEI, statewide nClimDiv: https://www.ncei.noaa.gov/monitoring-content/data/us/climdiv/monthly/current/
- NOAA file format and state codes: `data-raw/state-readme.txt`.
- U.S. Census Bureau, four-region grouping: https://www.census.gov/data/data-tools/survey-explorer/geo.html

Library documentation used in implementation:

- D3 scales, symbols, axes and brushing: https://d3js.org/ and https://d3js.org/d3-brush
- Electron packaging and security: https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging and https://www.electronjs.org/docs/latest/tutorial/security
- Electron Forge makers and platform requirements: https://www.electronforge.io/config/makers
- Playwright browser and Electron testing: https://playwright.dev/docs/api/class-electron
- Chromium DevTools Protocol vision deficiency simulation: https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setEmulatedVisionDeficiency

The implementation applies the course's Weeks 2–4 material on preparation pipelines, visual channels, CIELAB/diverging color, redundant encodings, Gestalt grouping and linked brushing. Course materials and the proposal bibliography are maintained with the separate class submission.

## AI assistance

OpenAI Codex assisted with the implementation plan, visualization and interaction design, proposal drafting, notebook and application code, data-source investigation, debugging, automated checks and documentation. This file describes assistance actually provided; it does not claim that the student independently authored every part or has completed code review or peer testing. Review and understand the implementation before submission, and adapt the disclosure to the course's requested format without omitting material assistance.

No peer observations, user quotations, successful macOS tests or signed releases are fabricated. Dependency licenses remain with their respective packages; Electron includes its bundled Chromium license notices.


Geographic state outlines: [U.S. Atlas 3.0.1](https://github.com/topojson/us-atlas), based on 2017 U.S. Census Bureau cartographic state boundaries. The included GeoJSON was generated from `states-10m.json` using `scripts/prepare_boundaries.py` and contains only the 48 states in the dashboard data.
