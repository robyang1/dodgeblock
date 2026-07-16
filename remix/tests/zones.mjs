// Zone/director tests: transitions fire at thresholds with bonuses, the
// director's phase cycle modulates the rate, platforms spawn in Cloudtop,
// drift blocks appear in Aurora, coins pay per heat multiplier.
import { Sim, NEUTRAL_INPUT } from '../src/sim/sim.js';
import { Powerup } from '../src/sim/powerups.js';

const N = NEUTRAL_INPUT;
let failed = false;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`ok ${name}`);
  else {
    failed = true;
    console.error(`FAIL ${name} ${detail}`);
  }
};

// keep the sim alive while we force altitude: pin the player just under the
// camera top and shield them from squishes
function pin(sim) {
  sim.player.y = -sim.camY + 200;
  sim.player.yVel = 0;
  sim.player.shieldTimer = 9999999;
}

{
  const sim = new Sim(42);
  const zones = [];
  sim.events.tap = (n, pl) => {
    if (n === 'zoneChange') zones.push(pl);
  };
  for (const camY of [260, 1300, 4100, 10100]) {
    sim.camY = camY;
    pin(sim);
    sim.step(N);
  }
  check('four zone transitions', zones.length === 4, `got ${zones.length}`);
  check(
    'zone order',
    zones.map((z) => z.zone.id).join(',') === 'stormfront,cloudtop,aurora,void',
    zones.map((z) => z.zone.id).join(','),
  );
  check('zone bonuses paid', sim.scoreBonus === 250 + 500 + 750 + 1000, `bonus=${sim.scoreBonus}`);
}

{
  // director phases: rate breathes once past the flat opening
  const sim = new Sim(9);
  const phases = new Set();
  for (let i = 0; i < 4200 && !sim.dead; i++) {
    pin(sim);
    sim.step(N);
    if (sim.frame > 1200) phases.add(sim.director.phase);
  }
  check(
    'director cycles phases',
    phases.has('calm') && phases.has('surge') && !sim.dead,
    [...phases].join(',') + ` dead=${sim.dead}`,
  );
}

{
  // cloudtop platforms spawn
  const sim = new Sim(10);
  sim.camY = 1300;
  let spawned = 0;
  for (let i = 0; i < 800 && !sim.dead; i++) {
    pin(sim);
    sim.step(N);
    spawned = Math.max(spawned, sim.platforms.length);
  }
  check('crumble clouds spawn in cloudtop', spawned > 0 && !sim.dead, `max=${spawned}`);
}

{
  // aurora drift blocks: ~25% of spawns wobble
  const sim = new Sim(11);
  sim.camY = 4100;
  let drift = 0;
  let total = 0;
  sim.events.tap = (n, b) => {
    if (n === 'blockSpawn') {
      total++;
      if (b.drift) drift++;
    }
  };
  for (let i = 0; i < 3000 && !sim.dead; i++) {
    pin(sim);
    sim.step(N);
  }
  check('drift blocks appear in aurora', drift > 5 && total > 20, `drift=${drift}/${total}`);
}

{
  // coin pays 25 x heat multiplier (heat 8 => tier 3 => x4)
  const sim = new Sim(12);
  sim.player.heat = 8;
  sim.powerups.push(new Powerup('S', sim.player.x, sim.player.y));
  sim.step(N);
  check('coin pays 25 x mult', sim.scoreCoins === 100, `coins=${sim.scoreCoins}`);
}

process.exit(failed ? 1 : 0);
