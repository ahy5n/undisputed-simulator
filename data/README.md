# Data notes

**Real-fighter data reflects roughly November 2026**, compiled from memory (knowledge cutoff June 2026) and
Wikipedia champion lists fetched on 2026-11-13.

## Known gaps — read before a long save
- **226 real fighters, not the 500 target.** The source lists in `data/source/*.txt` hold only fighters I could
  name with some confidence. Expanding them is open work; `node scripts/check-data.mjs` shows per-division counts.
  Generated fighters fill each division to ~120 pros at new-save time, so no division is empty.
- **Records, ages and ratings are estimates.** Fighters flagged `recordEstimated` (`?` in the source) have invented
  records. Several records are likely stale.
- **Belt holders** come from partly truncated Wikipedia extractions. Unsure: WBC flyweight, WBA featherweight,
  IBF lightweight, WBO middleweight (all left vacant), plus every holder in the lower divisions. Verify
  `belts.json` before a long save.
- **Absorbed divisions:** cruiser/bridger → heavyweight, super middle → light heavyweight, super welter → middleweight,
  super light → lightweight, super feather → featherweight, super bantam → bantamweight, super fly/light fly/minimum → flyweight.
  Belts in absorbed divisions are dropped (e.g. Benavidez, Opetaia, Inoue, Canelo, Ennis hold no world belt here).
- Fictional small-hall promoters in `promoters.json` are invented.

## Build
`node scripts/build-data.mjs` regenerates `fighters.json` (titles come from `belts.json`); `node scripts/check-data.mjs` reports.
