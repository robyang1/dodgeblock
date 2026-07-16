// Behavioral tests for the remix verbs: dash, i-frames, graze, spike drop,
// storm surfing + crest jump. Pure Node — stages scenarios directly on the sim.
//
//   node tests/verbs.mjs

import { Sim, NEUTRAL_INPUT } from '../src/sim/sim.js';

const N = NEUTRAL_INPUT;
let failed = false;
function check(name, cond, detail = '') {
  if (cond) console.log(`ok ${name}`);
  else {
    failed = true;
    console.error(`FAIL ${name} ${detail}`);
  }
}
function events(sim) {
  const log = [];
  sim.events.tap = (name, payload) => log.push({ name, payload });
  return log;
}

// --- dash: 11 frames at 9px/f beats walking, ends with carry ---
{
  const sim = new Sim(1);
  const x0 = sim.player.x;
  sim.step({ ...N, dashPressed: true });
  for (let i = 0; i < 12; i++) sim.step(N);
  const dashDist = sim.player.x - x0;

  const sim2 = new Sim(1);
  for (let i = 0; i < 13; i++) sim2.step({ ...N, right: true });
  const walkDist = sim2.player.x - sim2.constructor ? sim2.player.x - 385 : 0;
  check(
    'dash displacement > walk',
    dashDist > 90 && dashDist > walkDist * 1.5,
    `dash=${dashDist.toFixed(1)} walk=${walkDist.toFixed(1)}`,
  );
  check('dash consumed the spark', sim.player.sparks === 0);
  const sim3 = new Sim(1);
  sim3.player.sparks = 0;
  sim3.step({ ...N, dashPressed: true });
  check('no spark, no dash', sim3.player.dashTimer === 0);
}

// --- i-frames: a lethal block during dash phases through; without, death ---
{
  const sim = new Sim(2);
  const p = sim.player;
  const log = events(sim);
  sim.step({ ...N, dashPressed: true });
  // lethal block dropped straight onto the player mid-dash
  sim.blocks.spawnAt(p.x - 15, p.y - 20, 'wood', { yVel: 7 });
  for (let i = 0; i < 6; i++) sim.step(N);
  check(
    'dash phases a lethal block',
    !sim.dead && log.some((e) => e.name === 'dashPhase'),
    `dead=${sim.dead}`,
  );

  const simD = new Sim(2);
  simD.blocks.spawnAt(simD.player.x - 15, simD.player.y - 20, 'wood', { yVel: 7 });
  for (let i = 0; i < 6 && !simD.dead; i++) simD.step(N);
  check('same block kills without dash', simD.dead);
}

// --- graze: near miss pays a spark + heat ---
{
  const sim = new Sim(3);
  const p = sim.player;
  const log = events(sim);
  p.sparks = 0;
  // lethal block falling just beside the player (10px gap in x)
  sim.blocks.spawnAt(p.x + p.w + 10, p.y - 30, 'wood', { yVel: 7 });
  for (let i = 0; i < 8; i++) sim.step(N);
  const graze = log.find((e) => e.name === 'graze');
  check('graze fires', !!graze && !sim.dead);
  check('graze pays spark + heat', p.sparks >= 1 && p.heat >= 1, `sparks=${p.sparks} heat=${p.heat}`);
}

// --- spike drop: windup, plunge, ground bounce ---
{
  const sim = new Sim(4);
  const p = sim.player;
  const log = events(sim);
  p.y = 120;
  p.offGround = 10;
  sim.step({ ...N, spikePressed: true });
  check('spike starts', p.spiking);
  let guard = 0;
  while (p.spiking && guard++ < 60) sim.step(N);
  check(
    'spike thuds and bounces',
    log.some((e) => e.name === 'spikeThud') && p.yVel > 5 && !sim.dead,
    `yVel=${p.yVel}`,
  );
}

// --- spike shatter: exposed top block breaks, buried does not ---
{
  const sim = new Sim(5);
  const p = sim.player;
  const log = events(sim);
  // fix a block on the ground under the player
  const b = sim.blocks.spawnAt(p.x - 15, 250, 'wood', { yVel: 0 });
  for (let i = 0; i < 10 && !b.fixed; i++) sim.step(N);
  check('staging: block fixed', b.fixed, `y=${b.y}`);
  const before = sim.blocks.length;
  p.y = 100;
  p.offGround = 10;
  sim.step({ ...N, spikePressed: true });
  let guard = 0;
  while (p.spiking && guard++ < 60) sim.step(N);
  check(
    'spike shatters the exposed top',
    log.some((e) => e.name === 'spikeShatter') && sim.blocks.length === before - 1,
    `len ${before}->${sim.blocks.length}`,
  );
  check('shatter pays score', sim.scoreBonus >= 15);
}

// --- storm surfing -> crest jump ---
{
  const sim = new Sim(6);
  const p = sim.player;
  const log = events(sim);
  // player falls onto a slow block high above the ground and rides it down
  p.y = 100;
  p.offGround = 10;
  p.yVel = -5; // falling fast (positive = up)
  sim.blocks.spawnAt(p.x - 15, 133, 'wood', { yVel: 0 });
  let guard = 0;
  while (!log.some((e) => e.name === 'crestOpen') && guard++ < 300) sim.step(N);
  check('crest window opens after riding', guard < 300, `frames=${guard}`);
  check('surf paid heat', p.heat >= 1, `heat=${p.heat}`);
  // jump inside the window
  sim.step({ ...N, up: true, jumpPressed: true });
  const cj = log.some((e) => e.name === 'crestJump');
  // one step of gravity has already applied to the 11 launch velocity
  check('crest jump fires at super height', cj && p.yVel >= 10.5, `yVel=${p.yVel}`);
}

// --- gilded: oxidizes after the glow window; spike shatter pays big ---
{
  const sim = new Sim(7);
  const p = sim.player;
  const b = sim.blocks.spawnAt(p.x - 15, 250, 'gilded', { yVel: 0 });
  for (let i = 0; i < 10 && !b.fixed; i++) sim.step(N);
  check('gilded fixes and glows', b.fixed && b.type === 'gilded');
  for (let i = 0; i < 95; i++) sim.step(N);
  check('gilded oxidizes to wood after 90f', b.type === 'wood', `type=${b.type}`);

  const sim2 = new Sim(8);
  const p2 = sim2.player;
  const b2 = sim2.blocks.spawnAt(p2.x - 15, 250, 'gilded', { yVel: 0 });
  for (let i = 0; i < 10 && !b2.fixed; i++) sim2.step(N);
  p2.y = 100;
  p2.offGround = 10;
  p2.sparks = 1;
  sim2.step({ ...N, spikePressed: true });
  let guard = 0;
  while (p2.spiking && guard++ < 60) sim2.step(N);
  check('gilded spike shatter pays 165', sim2.scoreBonus === 165, `bonus=${sim2.scoreBonus}`);
}

process.exit(failed ? 1 : 0);
