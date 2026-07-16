// Set-piece event registry. Each event is a small state machine the Director
// drives: telegraph (frames of warning), duration, and onTelegraph/onStart/
// onStep/onEnd hooks that read+write sim/director state. Payoff bonuses are
// multiplied by the player's current Heat — events are where greed pays.
//
// DEBUT_ORDER scripts each event's first appearance so a run keeps unveiling
// new content; afterwards events join the zone-gated random pool.
//
// Per-event scratch state lives in director.eventData (reset at telegraph) —
// the render side reads it too (monolith shadow x, meteor side, ...).

import {
  GROUND,
  BLOCK_W,
  BLOCK_H,
  SPAWN_MIN_X,
  SPAWN_MAX_X,
  SPAWN_GRID,
  GAME_W,
} from '../constants.js';
import { rectrect } from './util.js';
import { Powerup } from './powerups.js';

export const EVENT_TYPES = new Map();

export function defineEvent(id, spec) {
  EVENT_TYPES.set(id, { telegraph: 120, duration: 300, minZone: 0, ...spec, id });
}

// first appearances, in order (events wait for their minimum zone)
export const DEBUT_ORDER = [
  'goldrush',
  'gust',
  'storm',
  'monolith',
  'meteor',
  'tetra',
  'whiteout',
];

function payoff(sim, text, base) {
  const amount = base * sim.heatMult;
  sim.scoreBonus += amount;
  sim.events.emit('payoff', {
    text,
    amount,
    x: sim.player.x + sim.player.w / 2,
    y: sim.player.y - 20,
  });
}

function gridX(rng) {
  const cells = Math.floor((SPAWN_MAX_X - SPAWN_MIN_X) / SPAWN_GRID) + 1;
  return SPAWN_MIN_X + SPAWN_GRID * rng.int(0, cells);
}

// ---------------------------------------------------------------- GOLD RUSH
// Coins rain among slightly denser blocks; collect most of them for a bonus.
defineEvent('goldrush', {
  minZone: 0,
  telegraph: 120,
  duration: 600, // 5s of rain + 5s to finish collecting
  onStart(sim, dir) {
    dir.eventMul = 1.4;
    dir.eventData.spawned = 0;
    dir.eventData.collected = 0;
  },
  onStep(sim, dir, t) {
    if (t <= 300 && t % 22 === 0 && dir.eventData.spawned < 16) {
      sim.powerups.push(new Powerup('S', gridX(sim.rng), -sim.camY - 30));
      dir.eventData.spawned++;
    }
    if (t === 300) dir.eventMul = 1;
  },
  onEnd(sim, dir) {
    dir.eventMul = 1;
    const { spawned, collected } = dir.eventData;
    if (spawned > 0 && collected >= Math.ceil(spawned * 0.8)) {
      payoff(sim, 'FULL CLEAR!', 200);
    }
  },
});

// ---------------------------------------------------------------- WIND GUST
// Lateral push on the player; falling blocks drift the same way.
defineEvent('gust', {
  minZone: 1,
  telegraph: 90,
  duration: 240,
  onTelegraph(sim, dir) {
    dir.eventData.dir = sim.rng.chance(0.5) ? 1 : -1;
  },
  onStart(sim, dir) {
    dir.wind = 0.35 * dir.eventData.dir;
  },
  onStep(sim, dir) {
    const windowLo = Math.max(0, sim.blocks.blocks.length - 300);
    for (const b of sim.blocks.falling) {
      if (b.idx < windowLo || b.drift) continue;
      b.x += 0.5 * dir.eventData.dir;
    }
  },
  onEnd(sim, dir) {
    dir.wind = 0;
  },
});

// --------------------------------------------------------------- BLOCK STORM
// The sky opens: rate x2.5 for four seconds, then the director's forced calm
// makes the silence afterwards land. Survive it, get paid.
defineEvent('storm', {
  minZone: 1,
  telegraph: 180,
  duration: 240,
  onStart(sim, dir) {
    dir.eventMul = 2.5;
  },
  onEnd(sim, dir) {
    dir.eventMul = 1;
    payoff(sim, 'STORM SURVIVED', 150);
  },
});

// ---------------------------------------------------------------- MONOLITH
// One 180x120 slab at a fixed, implacable speed. Kills on contact while
// falling (shield pops harmlessly), lands as permanent terrain. Stand on top
// soon after it lands: KING OF THE HILL.
defineEvent('monolith', {
  minZone: 3,
  telegraph: 150,
  duration: 600,
  onTelegraph(sim, dir) {
    // aim somewhere on-screen-ish; x snapped to the grid
    const cells = Math.floor((GAME_W - 180) / SPAWN_GRID);
    dir.eventData.x = SPAWN_GRID * sim.rng.int(0, cells + 1);
  },
  onStart(sim, dir) {
    dir.eventData.block = sim.blocks.spawnAt(
      dir.eventData.x,
      -sim.camY - 340,
      'monolith',
      { w: 180, h: 120, yVel: 4.5 },
    );
    dir.eventData.crowned = false;
  },
  onStep(sim, dir) {
    const b = dir.eventData.block;
    if (
      !dir.eventData.crowned &&
      b.fixed &&
      sim.landedOn === b &&
      sim.frame - b.fixedAtFrame <= 180
    ) {
      dir.eventData.crowned = true;
      payoff(sim, 'KING OF THE HILL', 300);
    }
  },
});

// ------------------------------------------------------------------- METEOR
// A diagonal fireball that blasts a crater in the stack (terrain refresh!)
// and sends out a ground-hugging shockwave — jump it.
defineEvent('meteor', {
  minZone: 3,
  telegraph: 120,
  duration: 420,
  onTelegraph(sim, dir) {
    dir.eventData.side = sim.rng.chance(0.5) ? 1 : -1; // 1 = from the left
  },
  onStart(sim, dir) {
    const side = dir.eventData.side;
    dir.eventData.meteor = {
      x: side > 0 ? -60 : GAME_W + 20,
      y: -sim.camY + 40 + sim.rng.int(0, 80),
      w: 40,
      h: 40,
      vx: 7 * side,
      vy: 3.2,
    };
    dir.eventData.wave = null;
    dir.eventData.hotfoot = false;
  },
  onStep(sim, dir) {
    const d = dir.eventData;
    const m = d.meteor;
    const p = sim.player;
    if (m) {
      m.x += m.vx;
      m.y += m.vy;
      // player hit directly
      if (
        rectrect(m, p) &&
        p.dashTimer <= 0 &&
        p.dashRecovery <= 0 &&
        !p.spiking
      ) {
        sim.kill('meteor');
      }
      // impact with fixed terrain or the ground
      let hit = m.y + m.h >= GROUND.y;
      const blocks = sim.blocks.blocks;
      if (!hit) {
        for (let i = Math.max(0, blocks.length - 300); i < blocks.length; i++) {
          const b = blocks[i];
          if (b.fixed && rectrect(m, b)) {
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        const ix = m.x + m.w / 2;
        const iy = Math.min(m.y + m.h / 2, GROUND.y - 10);
        // crater: clear a ~3x2 block area
        const area = { x: ix - 90, y: iy - 60, w: 180, h: 120 };
        for (let i = Math.max(0, blocks.length - 300); i < blocks.length; i++) {
          const b = blocks[i];
          if (!b.fixed || b.spec.unbreakable) continue;
          if (rectrect(area, b)) {
            sim.events.emit('blockBreak', {
              x: b.x + b.w / 2,
              y: b.y + b.h / 2,
              block: b,
              cause: 'meteor',
            });
            sim.blocks.removeFixed(b);
            i--;
          }
        }
        for (let c = 0; c < 3; c++) {
          sim.powerups.push(new Powerup('S', ix - 40 + c * 40, iy - 80));
        }
        d.wave = { x: ix, y: iy, t: 0 };
        d.meteor = null;
        sim.events.emit('meteorImpact', { x: ix, y: iy });
      } else if (m.x < -220 || m.x > GAME_W + 220) {
        d.meteor = null; // flew off without hitting anything
      }
    }
    if (d.wave) {
      d.wave.t++;
      const r = (d.wave.t / 30) * 110;
      const px = p.x + p.w / 2;
      const near =
        Math.abs(px - d.wave.x) < r && Math.abs(p.y + p.h - d.wave.y) < 70;
      if (near) {
        if (p.offGround < 3 && p.dashRecovery <= 0 && p.dashTimer <= 0) {
          sim.kill('shockwave');
        } else if (!d.hotfoot && p.offGround >= 3) {
          d.hotfoot = true;
          payoff(sim, 'HOTFOOT', 50);
        }
      }
      if (d.wave.t >= 30) d.wave = null;
    }
  },
});

// ------------------------------------------------------------- TETRA CLUSTER
// Four blocks fall in lockstep as a tetromino-shaped terrain feature.
// Land on the fresh formation for a payoff.
const TETRA_SHAPES = [
  [[0, 0], [60, 0], [0, -40], [60, -40]], // O
  [[0, 0], [0, -40], [0, -80], [60, 0]], // L
  [[0, 0], [60, 0], [120, 0], [60, -40]], // T
  [[60, 0], [120, 0], [0, -40], [60, -40]], // S
];
defineEvent('tetra', {
  minZone: 2,
  telegraph: 100,
  duration: 600,
  onTelegraph(sim, dir) {
    const cells = Math.floor((GAME_W - 180) / SPAWN_GRID);
    dir.eventData.x = SPAWN_GRID * sim.rng.int(0, cells + 1);
    dir.eventData.shape = sim.rng.int(0, TETRA_SHAPES.length);
  },
  onStart(sim, dir) {
    const d = dir.eventData;
    d.blocks = TETRA_SHAPES[d.shape].map(([dx, dy]) =>
      sim.blocks.spawnAt(d.x + dx, -sim.camY - 320 + dy, 'wood', { yVel: 2 }),
    );
    d.surfed = false;
  },
  onStep(sim, dir) {
    const d = dir.eventData;
    if (
      !d.surfed &&
      sim.landedOn &&
      d.blocks.includes(sim.landedOn) &&
      sim.landedOn.fixed &&
      sim.frame - sim.landedOn.fixedAtFrame <= 120
    ) {
      d.surfed = true;
      payoff(sim, 'SURFED IT', 75);
    }
  },
});

// ----------------------------------------------------------------- WHITEOUT
// Fog hides the warning strips — dodge by the spawn-tick audio and by
// watching blocks emerge from the fog.
defineEvent('whiteout', {
  minZone: 2,
  telegraph: 120,
  duration: 300,
  onStart(sim, dir) {
    dir.fogged = true;
  },
  onEnd(sim, dir) {
    dir.fogged = false;
    payoff(sim, 'WHITEOUT CLEARED', 100);
  },
});
