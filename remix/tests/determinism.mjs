// Node-side determinism gate: the sim must be a pure function of
// (seed, input history). Runs the same scripted input twice and compares
// state hashes at checkpoints. No browser, no Phaser.
//
//   node tests/determinism.mjs

import { Sim } from '../src/sim/sim.js';

// scripted input: deterministic pseudo-play (jump bursts, direction sweeps)
function inputAt(f) {
  return {
    up: f % 97 < 9,
    down: f % 211 < 4,
    left: f % 140 < 45,
    right: f % 140 >= 70 && f % 140 < 115,
    jumpPressed: f % 97 === 0,
    dashPressed: f % 233 === 0,
  };
}

function run(seed, frames) {
  const sim = new Sim(seed);
  const checkpoints = [];
  const eventCounts = new Map();
  sim.events.tap = (name) =>
    eventCounts.set(name, (eventCounts.get(name) ?? 0) + 1);
  for (let f = 1; f <= frames && !sim.dead; f++) {
    sim.step(inputAt(f));
    if (f % 500 === 0) checkpoints.push(sim.hash());
  }
  checkpoints.push(sim.hash());
  return {
    checkpoints,
    events: [...eventCounts.entries()].sort().map(([k, v]) => `${k}:${v}`).join(','),
    dead: sim.dead,
    frame: sim.frame,
    score: sim.score,
  };
}

let failed = false;
for (const seed of [42, 7, 123456789]) {
  const a = run(seed, 10000);
  const b = run(seed, 10000);
  const same =
    JSON.stringify(a.checkpoints) === JSON.stringify(b.checkpoints) &&
    a.events === b.events;
  if (!same) {
    failed = true;
    console.error(`FAIL seed=${seed}: runs diverged`);
    for (let i = 0; i < a.checkpoints.length; i++) {
      if (a.checkpoints[i] !== b.checkpoints[i]) {
        console.error(`  first divergence at checkpoint ${i}:`);
        console.error(`    a: ${a.checkpoints[i]}`);
        console.error(`    b: ${b.checkpoints[i]}`);
        break;
      }
    }
  } else {
    console.log(
      `ok seed=${seed}: ${a.frame} frames, score ${a.score}, dead=${a.dead}, events {${a.events}}`,
    );
  }
}

// different seeds must actually differ (guards against a broken rng)
const x = run(1, 3000);
const y = run(2, 3000);
if (JSON.stringify(x.checkpoints) === JSON.stringify(y.checkpoints)) {
  failed = true;
  console.error('FAIL: seeds 1 and 2 produced identical runs — rng broken?');
} else {
  console.log('ok: different seeds diverge');
}

process.exit(failed ? 1 : 0);
