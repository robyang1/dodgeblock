import { GILDED_GLOW_FRAMES } from '../constants.js';

// Block type registry. A Block resolves its spec once at construction and
// hot loops read spec fields directly — no map lookups or if-else chains in
// the fall/collision code. Render-side art for each type lives in
// render/blockArt.js keyed by the same id.

const DEFAULTS = {
  variants: 3, // cosmetic frame count (the wood shades)
  gravity: 1, // multiplier on GRAVITY while falling
  canSupport: true, // other blocks can stack on it
  lethal: true, // squishes the player when falling fast
  // (block, sim) — called right after the block fixes into the stack
  onLand: null,
  // (block, sim) => keepActive — per-step hook, ONLY for blocks on the
  // activeBlocks list (fixed blocks with timers, e.g. gilded oxidation)
  onStep: null,
  // (block, player, sim, kind) => handled — kind: 'land'|'squish'|'wall'.
  // Return true to skip the default resolution for that contact.
  onPlayerContact: null,
  // (block) => variant index, render-only (e.g. crack stages); default shade
  frameFor: null,
};

export const BLOCK_TYPES = new Map();

export function defineBlockType(id, spec = {}) {
  const full = { ...DEFAULTS, ...spec, id };
  BLOCK_TYPES.set(id, full);
  return full;
}

// The baseline block — exactly the remake's behavior
defineBlockType('wood');

// Gilded: gold jackpot block. Pays via risk verbs only (see combo.js and the
// dash/spike handlers). After landing it glows for GILDED_GLOW_FRAMES (last
// chance to spike it), then oxidizes into ordinary wood and pays nothing.
defineBlockType('gilded', {
  variants: 1,
  onStep(b, sim) {
    if (sim.frame - b.fixedAtFrame < GILDED_GLOW_FRAMES) return true;
    b.type = 'wood';
    b.spec = BLOCK_TYPES.get('wood');
    b.shade = b.idx % 3; // deterministic without touching the rng stream
    sim.events.emit('gildedFade', { x: b.x + b.w / 2, y: b.y + b.h / 2 });
    return false;
  },
});

// The Monolith: a 180x120 slab falling at a fixed, implacable 4.5px/f
// (gravity 0 keeps its spawn velocity). Kills on contact while falling —
// the shield pops but does not save you; dash i-frames do. Once landed it
// is permanent, unbreakable terrain you can stand on (and be crowned on).
defineBlockType('monolith', {
  variants: 1,
  gravity: 0,
  unbreakable: true,
  onPlayerContact(b, p, sim, kind) {
    if (kind === 'land') return false; // standing on top is the whole point
    if (b.fixed) return false; // settled slab is ordinary terrain
    if (p.dashTimer > 0 || p.dashRecovery > 0 || p.spiking) return true;
    if (p.shieldTimer > 0) {
      p.shieldTimer = 0;
      sim.events.emit('shieldPop', { x: p.x + p.w / 2, y: p.y });
    }
    sim.kill('monolith');
    return true;
  },
});
