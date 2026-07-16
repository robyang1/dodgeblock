// Set-piece event tests: each event is force-started on a staged sim and its
// effect + payoff verified, plus a natural-scheduling run for the debut order.
import { Sim, NEUTRAL_INPUT } from '../src/sim/sim.js';
import { EVENT_TYPES } from '../src/sim/eventTypes.js';

const N = NEUTRAL_INPUT;
let failed = false;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`ok ${name}`);
  else {
    failed = true;
    console.error(`FAIL ${name} ${detail}`);
  }
};

function pin(sim) {
  sim.player.y = -sim.camY + 200;
  sim.player.yVel = 0;
  sim.player.shieldTimer = 9999999;
}

// force-start an event on the director (skipping telegraph)
function start(sim, id) {
  const dir = sim.director;
  const spec = EVENT_TYPES.get(id);
  dir.eventData = {};
  spec.onTelegraph?.(sim, dir);
  dir.activeEvent = { spec, t: 0 };
  spec.onStart?.(sim, dir);
  return spec;
}

// --- storm: rate spikes, payoff on survive ---
{
  const sim = new Sim(21);
  sim.step(N);
  const baseRate = sim.blockRate;
  start(sim, 'storm');
  sim.step(N);
  check('storm multiplies the rate', sim.blockRate > baseRate * 2, `${baseRate} -> ${sim.blockRate}`);
  const log = [];
  sim.events.tap = (n, pl) => log.push({ n, pl });
  for (let i = 0; i < 260 && !sim.dead; i++) {
    pin(sim);
    sim.step(N);
  }
  const pay = log.find((e) => e.n === 'payoff');
  check('storm survived payoff', !!pay && pay.pl.text === 'STORM SURVIVED', JSON.stringify(pay?.pl));
  check('eventMul restored', sim.director.eventMul === 1);
  check('forced calm follows', sim.director.calmUntil > sim.frame);
}

// --- goldrush: coins rain ---
{
  const sim = new Sim(22);
  sim.step(N);
  start(sim, 'goldrush');
  for (let i = 0; i < 620 && !sim.dead; i++) {
    pin(sim);
    sim.step(N);
  }
  check('goldrush rains coins', sim.director.eventData.spawned >= 10, `spawned=${sim.director.eventData.spawned}`);
}

// --- gust: wind pushes the player ---
{
  const sim = new Sim(23);
  sim.step(N);
  start(sim, 'gust');
  const x0 = sim.player.x;
  for (let i = 0; i < 60 && !sim.dead; i++) sim.step(N);
  const moved = Math.abs(sim.player.x - x0);
  check('gust pushes the player', moved > 20, `moved=${moved.toFixed(1)}`);
}

// --- monolith: falls at fixed speed, kills on contact, lands as terrain ---
{
  const sim = new Sim(24);
  sim.step(N);
  start(sim, 'monolith');
  const b = sim.director.eventData.block;
  check('monolith is 180x120', b.w === 180 && b.h === 120);
  const v0 = b.yVel;
  for (let i = 0; i < 30; i++) sim.step(N);
  check('monolith speed is constant', b.yVel === v0, `yVel=${b.yVel}`);
  let guard = 0;
  while (!b.fixed && guard++ < 400) {
    pin(sim);
    sim.step(N);
  }
  check('monolith lands as terrain', b.fixed, `guard=${guard}`);
  const L = Math.round((300 - b.y) / 40);
  const spans = [L, L - 1, L - 2].every((l) => sim.blocks.layers[l]?.includes(b));
  check('monolith spans three layers', spans, `top layer ${L}`);

  // contact while falling kills even with shield
  const sim2 = new Sim(25);
  sim2.step(N);
  start(sim2, 'monolith');
  const b2 = sim2.director.eventData.block;
  const p2 = sim2.player;
  p2.shieldTimer = 99999;
  const standY = b2.y + b2.h + 200; // fixed spot in its path
  let died = false;
  for (let i = 0; i < 200 && !died; i++) {
    p2.x = b2.x + 60;
    p2.y = standY;
    p2.yVel = 0;
    sim2.step(N);
    died = sim2.dead;
  }
  check('monolith kills through shield', died && sim2.deathCause === 'monolith', sim2.deathCause);
}

// --- meteor: crater + coins + shockwave ---
{
  const sim = new Sim(26);
  sim.step(N);
  // pave some terrain to crater: a row of fixed blocks
  for (let x = 200; x <= 560; x += 60) sim.blocks.spawnAt(x, 250, 'wood', { yVel: 0 });
  for (let i = 0; i < 12; i++) sim.step(N);
  const fixedBefore = sim.blocks.blocks.filter((b) => b.fixed).length;
  const log = [];
  sim.events.tap = (n, pl) => log.push({ n, pl });
  start(sim, 'meteor');
  sim.player.x = -90; // hide in the far corner, airborne-safe on ground edge
  for (let i = 0; i < 300 && !sim.dead; i++) {
    sim.player.x = -90;
    sim.step(N);
    if (log.some((e) => e.n === 'meteorImpact')) break;
  }
  const impact = log.find((e) => e.n === 'meteorImpact');
  check('meteor impacts', !!impact);
  for (let i = 0; i < 40 && !sim.dead; i++) sim.step(N);
  const fixedAfter = sim.blocks.blocks.filter((b) => b.fixed).length;
  const craterCoins = sim.powerups.filter((pw) => pw.type === 'S').length;
  check('meteor blasts a crater or pays coins', fixedAfter < fixedBefore || craterCoins >= 3, `fixed ${fixedBefore}->${fixedAfter} coins=${craterCoins}`);
}

// --- tetra: four blocks land as a connected formation ---
{
  const sim = new Sim(27);
  sim.step(N);
  start(sim, 'tetra');
  const blocks = sim.director.eventData.blocks;
  check('tetra spawns four blocks', blocks.length === 4);
  let guard = 0;
  while (!blocks.every((b) => b.fixed) && guard++ < 600) {
    pin(sim);
    sim.step(N);
  }
  check('tetra formation lands', blocks.every((b) => b.fixed), `guard=${guard}`);
}

// --- whiteout: fog on, payoff after ---
{
  const sim = new Sim(28);
  sim.step(N);
  const log = [];
  sim.events.tap = (n, pl) => log.push({ n, pl });
  start(sim, 'whiteout');
  sim.step(N);
  check('whiteout fogs', sim.director.fogged === true);
  for (let i = 0; i < 310 && !sim.dead; i++) {
    pin(sim);
    sim.step(N);
  }
  check('whiteout clears + pays', sim.director.fogged === false && log.some((e) => e.n === 'payoff'));
}

// --- natural scheduling: debut order over a long pinned run ---
{
  const sim = new Sim(29);
  const starts = [];
  sim.events.tap = (n, pl) => {
    if (n === 'eventStart') starts.push(pl.id);
  };
  for (let i = 0; i < 14000 && !sim.dead && starts.length < 3; i++) {
    pin(sim);
    sim.step(N);
  }
  check('events schedule naturally', starts.length >= 2, `starts=${starts.join(',')}`);
  check('goldrush debuts first', starts[0] === 'goldrush', starts.join(','));
}

process.exit(failed ? 1 : 0);
