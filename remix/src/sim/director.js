// The Director: tension-release pacing, altitude zones, and set-piece event
// scheduling. Ticked first inside sim.step so its outputs (rateMul, eventMul,
// wind, spawn overrides) apply the same frame. Everything is keyed to
// sim.frame / sim.camY / sim.rng — no wall clock, fully deterministic.

import {
  DIRECTOR_FLAT_FRAMES,
  CALM_MUL,
  SURGE_MUL,
  CALM_FRAMES,
  BUILD_FRAMES,
  SURGE_FRAMES,
  RELEASE_FRAMES,
  CLOUD_PLAT_W,
  CLOUD_PLAT_H,
  CLOUD_PLAT_EVERY,
  CLOUD_PLAT_SPEED,
  GAME_W,
} from '../constants.js';
import { ZONES, zoneIndexFor } from '../zones.js';
import { EVENT_TYPES, DEBUT_ORDER } from './eventTypes.js';

export class Director {
  constructor(sim) {
    this.sim = sim;
    this.zoneIndex = 0;
    // phase machine
    this.phase = 'flat';
    this.phaseT = 0;
    this.phaseDur = DIRECTOR_FLAT_FRAMES;
    this.rateMul = 1;
    // event machine
    this.eventMul = 1;
    this.wind = 0; // x-accel applied to player + falling blocks
    this.fogged = false; // whiteout hides warning strips
    this.activeEvent = null; // { spec, t }
    this.pendingEvent = null; // { spec, telegraphLeft }
    this.eventData = {}; // per-event scratch, reset at each telegraph
    this.debutIndex = 0; // next entry of DEBUT_ORDER to script
    this.nextEventAt = 0; // frame of the next scheduling attempt
    this.lastEventId = null;
    this.calmUntil = 0; // forced calm after each event
  }

  get zone() {
    return ZONES[this.zoneIndex];
  }

  step() {
    const sim = this.sim;

    // --- zone transitions (camY is monotonic → fire once, in order) ---
    const z = zoneIndexFor(sim.camY);
    if (z !== this.zoneIndex) {
      this.zoneIndex = z;
      sim.scoreBonus += ZONES[z].bonus;
      sim.events.emit('zoneChange', { index: z, zone: ZONES[z] });
    }

    this.stepPhases();
    this.stepEvents();
    this.stepZoneRules();
  }

  // CALM -> BUILD -> SURGE -> RELEASE, durations rolled per cycle. The first
  // 20s run flat so the opening feels like classic DodgeBlock.
  stepPhases() {
    const rng = this.sim.rng;
    const isVoid = this.zone.id === 'void';
    const calmMul = isVoid ? 0.7 : CALM_MUL;
    this.phaseT++;
    if (this.phaseT >= this.phaseDur) {
      this.phaseT = 0;
      const shrink = isVoid ? 0.75 : 1; // late game breathes less
      switch (this.phase) {
        case 'flat':
        case 'release':
          this.phase = 'calm';
          this.phaseDur = Math.round(rng.int(CALM_FRAMES[0], CALM_FRAMES[1]) * shrink);
          break;
        case 'calm':
          this.phase = 'build';
          this.phaseDur = Math.round(rng.int(BUILD_FRAMES[0], BUILD_FRAMES[1]) * shrink);
          break;
        case 'build':
          this.phase = 'surge';
          this.phaseDur = Math.round(rng.int(SURGE_FRAMES[0], SURGE_FRAMES[1]) * shrink);
          break;
        case 'surge':
          this.phase = 'release';
          this.phaseDur = RELEASE_FRAMES;
          break;
      }
      this.sim.events.emit('phase', { phase: this.phase });
    }
    const t = this.phaseT / this.phaseDur;
    switch (this.phase) {
      case 'flat':
        this.rateMul = 1;
        break;
      case 'calm':
        this.rateMul = calmMul;
        break;
      case 'build':
        this.rateMul = calmMul + (SURGE_MUL - calmMul) * t;
        break;
      case 'surge':
        this.rateMul = SURGE_MUL;
        break;
      case 'release':
        this.rateMul = SURGE_MUL + (calmMul - SURGE_MUL) * t;
        break;
    }
    // events are always followed by a stretch of forced calm — set pieces
    // resolve into relief
    if (this.sim.frame < this.calmUntil && !this.activeEvent) {
      this.rateMul = Math.min(this.rateMul, calmMul);
    }
  }

  stepEvents() {
    const sim = this.sim;
    const rng = sim.rng;

    if (this.pendingEvent) {
      if (--this.pendingEvent.telegraphLeft <= 0) {
        this.activeEvent = { spec: this.pendingEvent.spec, t: 0 };
        this.pendingEvent = null;
        this.activeEvent.spec.onStart?.(sim, this);
        sim.events.emit('eventStart', { id: this.activeEvent.spec.id });
      }
      return;
    }

    if (this.activeEvent) {
      const ev = this.activeEvent;
      ev.t++;
      ev.spec.onStep?.(sim, this, ev.t);
      if (ev.t >= ev.spec.duration) {
        ev.spec.onEnd?.(sim, this);
        sim.events.emit('eventEnd', { id: ev.spec.id });
        this.lastEventId = ev.spec.id;
        this.activeEvent = null;
        this.calmUntil = sim.frame + 360; // 6s exhale
        this.scheduleNext();
      }
      return;
    }

    if (sim.frame < DIRECTOR_FLAT_FRAMES / 2) return; // no events in the opening
    if (this.nextEventAt === 0) this.scheduleNext();
    if (sim.frame < this.nextEventAt || sim.frame < this.calmUntil) return;

    // debut order first — every run keeps unveiling something new — then the
    // zone's random pool
    let spec = null;
    while (this.debutIndex < DEBUT_ORDER.length) {
      const cand = EVENT_TYPES.get(DEBUT_ORDER[this.debutIndex]);
      if (!cand) {
        this.debutIndex++; // not registered (yet) — skip
        continue;
      }
      if (cand.minZone > this.zoneIndex) break; // debut waits for its zone
      this.debutIndex++;
      spec = cand;
      break;
    }
    if (!spec) {
      const pool = [...EVENT_TYPES.values()].filter(
        (e) =>
          e.minZone <= this.zoneIndex &&
          DEBUT_ORDER.indexOf(e.id) < this.debutIndex &&
          e.id !== this.lastEventId,
      );
      if (!pool.length) {
        this.scheduleNext();
        return;
      }
      spec = rng.pick(pool);
    }
    this.pendingEvent = { spec, telegraphLeft: spec.telegraph };
    this.eventData = {};
    spec.onTelegraph?.(sim, this);
    sim.events.emit('eventTelegraph', {
      id: spec.id,
      telegraph: spec.telegraph,
    });
  }

  scheduleNext() {
    const isVoid = this.zone.id === 'void';
    const [lo, hi] = isVoid ? [900, 1500] : [1200, 2100]; // 15-25s / 20-35s
    this.nextEventAt = this.sim.frame + this.sim.rng.int(lo, hi);
  }

  // per-zone standing rules: crumble-cloud platforms (Cloudtop)
  stepZoneRules() {
    const sim = this.sim;
    if (this.zone.cloudPlatforms && sim.frame % CLOUD_PLAT_EVERY === 0) {
      const fromLeft = sim.rng.chance(0.5);
      sim.platforms.push({
        x: fromLeft ? -CLOUD_PLAT_W - 20 : GAME_W + 20,
        y: -sim.camY + sim.rng.int(60, 260),
        w: CLOUD_PLAT_W,
        h: CLOUD_PLAT_H,
        vx: fromLeft ? CLOUD_PLAT_SPEED : -CLOUD_PLAT_SPEED,
        crumbleAt: -1, // set on first touch
      });
    }
  }
}
