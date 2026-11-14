# Undisputed Manager

A browser boxing-management sim: you are manager and promoter. Sign fighters, make fights, put on shows, strike broadcast deals and build undisputed champions before the money runs out. Personal project: real boxers and promoters are used by name, so keep it out of public view.

Phone-first (designed at 390px), no backend, saves in the browser (IndexedDB) with JSON export and import.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 68 unit tests, about 15 seconds
npm run balance    # slow: 20 simulated seasons plus four bot-managed careers
npm run build
```

Deploys to Vercel as a plain Next.js app.

## Layout

- `lib/sim/` pure, seeded TypeScript simulation, no UI: world, rankings, fight engine, contracts, matchmaking, shows, camps, broadcasters, board, drama, legacy.
- `components/` the UI. `app/` is one page; tabs are in-app.
- `data/` real-fighter source and generated JSON. Read `data/README.md` for what is estimated.
- `tests/` unit tests; `tests/long/` balancing runs and the manager bot.

## Status

All 13 build phases are in. Known gaps:

- 226 real fighters, not 500 (see `data/README.md`); generated fighters fill each division to about 120 pros.
- Shouts in a live fight are chosen before the bell, not mid-round.
- No division moves yet (weight penalties for moving up or down are not modelled).
- Fighters demanding title shots, calling out rivals and missing weight are in; refusing a fight is not.
- Starting budget £3m and the 75/25 purse-bid split are tuned in the balancing pass; the split is a setting.

## Balance (from `npm run balance`)

Twenty seasons, no player: about 34 ms per simulated week (worst under 100 ms), a 3.5 MB save, every ranked fighter always has at least three realistic opponents, no long-vacant belts, around 20% of fights end in a stoppage. Four bot careers on the default £3m all survive eight years and reach world champions and stadium shows.
