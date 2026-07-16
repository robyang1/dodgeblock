# BLOCKSTORM — a DodgeBlock remix

A bold reimagining of DodgeBlock. Same soul — blocks rain from the sky, they
stack into a tower, you climb to outrun the rising camera — but the storm is
now the fuel: every falling block is a resource, a vehicle, and a jackpot.

## How it plays

- **Graze** falling blocks (near miss at lethal speed) to earn **Sparks**
  (dash ammo) and **Heat**.
- **Spark Dash** (Shift/X, or swipe sideways): 1 Spark. Phases through the
  falling storm, bonks on the solid tower.
- **Spike Drop** (down + dash in the air, or swipe down): 1 Spark. Meteor
  straight down, shatter falling blocks and one exposed tower block.
- **Storm Surf**: land on a fast-falling block and ride it. Jump the instant
  it lands — the **Crest Jump** launches ~5 layers high.
- **Heat** (the ember bar) is the flow meter: it multiplies your score up to
  x4, buffs your movement, and *is* the music. Play scared and the world goes
  quiet. Shield saves halve it.
- **Gilded blocks** pay only via the risk verbs — and only until they oxidize.

The climb passes through five zones (Meadow → Stormfront → Cloudtop → Aurora
→ The Void), each adding one rule, while a pacing director breathes
calm/build/surge/release and schedules telegraphed set pieces: Gold Rush,
Wind Gust, Block Storm, Tetra Cluster, Whiteout, the Monolith, and the Meteor.

Meta: ghost line at your best altitude, feat-gated player palettes, and a
date-seeded **Daily Climb** (press D on the menu).

## Dev

```
npm install
npm run dev           # ?seed=N for a fixed run, ?stress for spawn stress,
                      # ?test to expose window.__sim/__ff/__events hooks
node tests/determinism.mjs   # sim must be a pure function of (seed, inputs)
node tests/verbs.mjs         # dash / graze / spike / surf / crest behavior
node tests/zones.mjs         # zones, director phases, platforms, scoring
node tests/events.mjs        # all seven set-piece events
```

Architecture: `src/sim/` is the whole game simulation — plain JS, zero Phaser
imports, one seeded mulberry32 rng, fixed 60Hz steps — so it runs headless in
Node for the tests above. Rendering (`src/render/`), audio (`src/audio.js`,
`src/music.js`) and scenes subscribe to sim events and never mutate sim state.
Hitstop/slow-mo scale the accumulator, never the timestep.
