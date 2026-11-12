# Class feedback and changes through v0.1.5

This changelog covers the class feedback shared during the demo follow-up and the resulting changes since v0.1.3. It distinguishes requests that changed the app from questions about how to read it.

## Dashboard changes

| Feedback shared from class | What changed |
| --- | --- |
| The panels show too much information at once. Put the supporting information in pop-outs. | **Map details**, **Plot guide**, **Chart details**, and **Data & methods** keep explanations and legends available on demand. **Set exact bounds** opens a separate form; dragging on the scatterplot is still available. |
| The chart axis fonts are too small. | Axis titles are 16 px and tick labels are 14 px. In shorter windows, the scatterplot’s vertical title moves above the plot. The comparison chart omits phase and strength combinations that never occur in the dataset to make the remaining rows easier to read. |
| Make the app fill the screen without having to scroll through panels. | The Mac app opens maximized. The four panels fit within the desktop window; the observation results scroll inside their own panel. The desktop layout was checked at 1,000 × 660 px. |
| The area below the left map is empty. Move record search there from its pop-out. | **Find observations** now sits directly below the map. Search, sorting, paging, individual record selection, and applying checked records to the charts remain available. |
| Add a way to switch from the pseudo map to a geographic heat map. | The map selector switches between **Tile map** and **Geographic map**. Both show the same state averages and use the same anomaly color scale. Switching styles keeps the current filters and selection. The geographic view bundles [U.S. Census state boundaries via U.S. Atlas](https://github.com/topojson/us-atlas) for offline use. |
| Remove “NOAA observations” and “offline” from the top-right badge. | The badge displays only **v0.1.5**. Data source information remains in **Data & methods**. |

## Questions raised while reviewing the demo

- **Is this C3 or D3?** The visualizations use D3.js; Electron packages the desktop app.
- **What does DJF ONI mean?** DJF is December–February. ONI is the Oceanic Niño Index, a tropical Pacific sea-surface temperature anomaly in °C. **Plot guide** explains the x-axis.
- **Is +0.6 °C the boundary between Neutral and El Niño?** In the historical ONI data used here, the warm threshold is +0.5 °C. A warm episode requires at least five consecutive overlapping three-month seasons at or above that threshold. A single +0.6 °C winter can still be labeled Neutral. **Data & methods** describes the rule.
- **What happens to the map after a scatterplot range is selected?** Each state shows its average precipitation or temperature anomaly for the matching records. An existing state filter remains in effect. **Map details** shows the selected winters, phases, and reference baseline.
- **Does the bottom-right chart average all records?** Its headline is the mean across the current selection. Each row shows a separate mean (dot) and middle 50% (line) for an ENSO phase and strength group. **Chart details** explains the difference.
- **Why are the gray comparison marks missing in the default view?** They show the group before the current chart selection, within the active filters. When the two groups match, the colored and gray marks overlap. The dark gray Neutral marks represent an ENSO phase.
- **How does ENSO change ocean circulation, and does El Niño mean more rain in the southern U.S.?** [NOAA’s diagrams](https://pmel.noaa.gov/elnino/schematic-diagrams/) illustrate how warm Pacific surface water shifts as trade winds change. El Niño tends to favor wetter winters across the southern U.S., but individual winters vary. The dashboard shows historical observations and is not a forecast. [NOAA explanation](https://www.noaa.gov/understanding-el-nino)

## Verification

Six model tests and ten browser tests passed. The v0.1.5 Apple Silicon DMG was mounted and its app passed eight offline checks, including the geographic map, inline record search, window fit, and linked chart selections.
