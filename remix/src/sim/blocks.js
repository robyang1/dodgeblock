import {
  GRAVITY,
  GROUND,
  BLOCK_W,
  BLOCK_H,
  SPAWN_MIN_X,
  SPAWN_MAX_X,
  SPAWN_GRID,
  BLOCK_UPDATE_WINDOW,
  FAITHFUL_GROUND_BREAK,
  GILDED_CHANCE,
  DRIFT_AMP,
  DRIFT_PERIOD,
} from '../constants.js';
import { stackContact } from './util.js';
import { BLOCK_TYPES } from './blockTypes.js';

export class Block {
  constructor(x, y, w, h, shade = 0, type = 'wood') {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.yVel = 0;
    this.fixed = false;
    this.idx = 0; // position in BlockManager.blocks, kept fresh on splice
    this.shade = shade; // cosmetic variant
    this.type = type;
    this.spec = BLOCK_TYPES.get(type);
    this.fixedAtFrame = -1; // sim frame this block landed (fresh-footing)
    this.zone = 0; // zone index at spawn — render tint; the tower becomes
    // a geological record of the climb
    this.drift = false; // Aurora-zone sinusoid-ish wobble while falling
    this.driftPhase = 0;
    this.baseX = x;
    this.grazed = false; // graze pays once per block
    this.grazePerfect = false; // perfect-graze upgrade pays once too
    this.dashPhased = false; // dash-through pays once per block
    this.freshPaid = false; // fresh-footing Heat pays once per block
    this.ridden = 0; // frames the player has stood on it while falling
  }
}

export class BlockManager {
  constructor(sim) {
    this.sim = sim; // rng + events + frame counter
    this.blocks = [];
    this.falling = []; // non-fixed blocks only, so sim cost is O(falling)
    // layers[L] holds blocks whose span covers the 40px row with top at
    // y = GROUND.y - BLOCK_H * L. Standard blocks live in exactly one layer;
    // oversized blocks (h a multiple of BLOCK_H) register in every row they
    // span so stacking on top of them works unchanged.
    this.layers = [[]];
    // fixed blocks with an onStep hook (timers etc.) — iterated per step so
    // fixed-block behaviors never cost O(all blocks)
    this.active = [];
  }

  get length() {
    return this.blocks.length;
  }

  spawn(camY, blockRate, type = null) {
    // x snapped to the quarter-block grid (see SPAWN_GRID in constants.js);
    // spawn height creeps down as the rate rises — the original's
    // round(1000/fpb) offset, expressed in blocks/sec (1000/fpb = rate*50/3)
    const rng = this.sim.rng;
    if (type === null) {
      type = rng.chance(GILDED_CHANCE) ? 'gilded' : 'wood';
    }
    const cells = Math.floor((SPAWN_MAX_X - SPAWN_MIN_X) / SPAWN_GRID) + 1;
    const spec = BLOCK_TYPES.get(type);
    const b = new Block(
      SPAWN_MIN_X + SPAWN_GRID * rng.int(0, cells),
      -camY - 280 + (blockRate * 50) / 3,
      BLOCK_W,
      BLOCK_H,
      rng.int(0, spec.variants),
      type,
    );
    const zone = this.sim.director?.zone;
    b.zone = this.sim.director?.zoneIndex ?? 0;
    if (zone && zone.driftChance > 0 && rng.chance(zone.driftChance)) {
      b.drift = true;
      b.driftPhase = rng.int(0, DRIFT_PERIOD);
      b.baseX = b.x;
    }
    this.add(b);
    return b;
  }

  // director/event service: drop a block at an exact spot
  spawnAt(x, y, type = 'wood', opts = {}) {
    const spec = BLOCK_TYPES.get(type);
    const b = new Block(
      x,
      y,
      opts.w ?? BLOCK_W,
      opts.h ?? BLOCK_H,
      opts.shade ?? this.sim.rng.int(0, spec.variants),
      type,
    );
    if (opts.yVel !== undefined) b.yVel = opts.yVel;
    this.add(b);
    return b;
  }

  add(b) {
    b.idx = this.blocks.length;
    this.blocks.push(b);
    this.falling.push(b);
    this.sim.events.emit('blockSpawn', b);
  }

  layerFor(L) {
    while (this.layers.length <= L) this.layers.push([]);
    return this.layers[L];
  }

  // L is the layer of the block's TOP row: y = GROUND.y - BLOCK_H * L.
  // A block h rows tall spans layers L-h+1 .. L.
  fixAt(b, L) {
    if (b.drift) {
      // re-snap the wobbled x to the spawn grid so stacking stays clean
      b.x = SPAWN_MIN_X + SPAWN_GRID * Math.round((b.x - SPAWN_MIN_X) / SPAWN_GRID);
      b.drift = false;
    }
    b.y = GROUND.y - BLOCK_H * L;
    b.fixed = true;
    b.yVel = 0;
    b.fixedAtFrame = this.sim.frame;
    const rows = Math.max(1, Math.round(b.h / BLOCK_H));
    for (let l = L - rows + 1; l <= L; l++) {
      if (l >= 1) this.layerFor(l).push(b);
    }
    if (b.spec.onStep) this.active.push(b);
    if (b.spec.onLand) b.spec.onLand(b, this.sim);
    this.sim.events.emit('blockFix', b);
  }

  // One sim step of falling-block physics + stack-fixing, mirroring
  // classic/script.js:494-516. Iteration is in spawn order so a block that
  // fixes this step can catch a later block in the same step.
  update() {
    const windowLo = Math.max(this.blocks.length - BLOCK_UPDATE_WINDOW, 0);
    for (let i = 0; i < this.falling.length; i++) {
      const b = this.falling[i];
      // faithful: blocks outside the last-200 window are frozen mid-air
      if (b.idx < windowLo) continue;
      b.yVel += GRAVITY * b.spec.gravity;
      b.y += b.yVel;
      if (b.drift) {
        // triangle-wave wobble (no Math.sin in sim paths — determinism)
        const ph = (this.sim.frame + b.driftPhase) % DRIFT_PERIOD;
        const half = DRIFT_PERIOD / 2;
        const t = ph < half ? ph / half : 2 - ph / half; // 0..1..0
        b.x = b.baseX + (t * 2 - 1) * DRIFT_AMP;
      }
      const rows = Math.max(1, Math.round(b.h / BLOCK_H));
      // layer of the row just below the block's bottom edge; the original
      // crashes on c < 0 (classes[-1]) when a block outruns the stack
      // late-game — we clamp that to the ground case instead
      const c = Math.ceil((GROUND.y - b.y) / BLOCK_H) - rows;
      let fixed = false;
      if (c <= 0) {
        this.fixAt(b, rows);
        fixed = true;
      } else {
        const layer = this.layerFor(c);
        for (let j = 0; j < layer.length; j++) {
          if (layer[j].spec.canSupport && stackContact(b, layer[j])) {
            this.fixAt(b, c + rows);
            fixed = true;
            break;
          }
        }
      }
      if (fixed) {
        this.falling.splice(i, 1);
        i--;
        // classic/script.js:504 `break` bug: a ground landing stalls every
        // other falling block for one step
        if (FAITHFUL_GROUND_BREAK && c <= 0) break;
      }
    }

    // fixed-block behaviors (crumble timers, gilded oxidation, ...)
    for (let i = 0; i < this.active.length; i++) {
      const b = this.active[i];
      if (!b.spec.onStep(b, this.sim)) {
        this.active.splice(i, 1);
        i--;
      }
    }
  }

  // Shield consuming a FALLING block (the original's blocks.splice)
  remove(b) {
    const i = b.idx;
    this.blocks.splice(i, 1);
    for (let j = i; j < this.blocks.length; j++) this.blocks[j].idx = j;
    const f = this.falling.indexOf(b);
    if (f !== -1) this.falling.splice(f, 1);
  }

  // Remove a FIXED block (spike drop shatter, meteor crater): also pulls it
  // out of every layer row it spans and the active list.
  removeFixed(b) {
    this.remove(b);
    const rows = Math.max(1, Math.round(b.h / BLOCK_H));
    const L = Math.round((GROUND.y - b.y) / BLOCK_H);
    for (let l = L - rows + 1; l <= L; l++) {
      if (l < 1 || l >= this.layers.length) continue;
      const layer = this.layers[l];
      const j = layer.indexOf(b);
      if (j !== -1) layer.splice(j, 1);
    }
    const a = this.active.indexOf(b);
    if (a !== -1) this.active.splice(a, 1);
  }

  // Is this fixed block an exposed top — i.e. no fixed block in the row
  // above overlaps it in x? (Spike drop may only shatter exposed tops, so
  // nothing is ever left floating.)
  isExposedTop(b) {
    const L = Math.round((GROUND.y - b.y) / BLOCK_H);
    const above = this.layers[L + 1];
    if (!above) return true;
    for (let j = 0; j < above.length; j++) {
      const o = above[j];
      if (o !== b && o.x + o.w > b.x && b.x + b.w > o.x) return false;
    }
    return true;
  }
}
