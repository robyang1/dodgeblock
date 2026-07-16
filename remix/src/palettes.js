// Player color palettes — feat-gated, no grind. `check(storage, feats)`
// decides availability; hint is shown on the game-over card as the next
// thing to chase.

export const PALETTES = [
  {
    id: 'classic',
    name: 'CLASSIC',
    body: 0xe8433f,
    border: 0xa32b28,
    hint: null, // always unlocked
  },
  {
    id: 'storm',
    name: 'STORM BLUE',
    body: 0x3f7fe8,
    border: 0x28519f,
    hint: 'Reach CLOUDTOP to unlock Storm Blue',
  },
  {
    id: 'cloud',
    name: 'CLOUD WHITE',
    body: 0xf2f6fa,
    border: 0x8fa6b8,
    hint: 'Reach AURORA to unlock Cloud White',
  },
  {
    id: 'aurora',
    name: 'AURORA',
    body: 0x9b5de5,
    border: 0x5e3299,
    hint: 'Reach THE VOID to unlock Aurora',
  },
  {
    id: 'obsidian',
    name: 'OBSIDIAN',
    body: 0x2b2b36,
    border: 0x0f0f16,
    hint: 'Stand atop the Monolith as it lands to unlock Obsidian',
  },
  {
    id: 'ember',
    name: 'EMBER',
    body: 0xff9f1c,
    border: 0xb26202,
    hint: 'Hold max Heat for 10 seconds to unlock Ember',
  },
  {
    id: 'gold',
    name: 'GOLD',
    body: 0xffd700,
    border: 0xb8860b,
    hint: 'Clear 3 Gold Rushes fully to unlock Gold',
  },
];

export function paletteById(id) {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

export function isUnlocked(storage, id) {
  return id === 'classic' || !!storage.data.unlocks[id];
}

// first still-locked palette's hint — the game-over "next chase" line
export function nextHint(storage) {
  for (const p of PALETTES) {
    if (p.hint && !storage.data.unlocks[p.id]) return p.hint;
  }
  return null;
}
