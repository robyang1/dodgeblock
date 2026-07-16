// The whole game simulation, extracted from the remake's GameScene.
// Plain objects only — zero Phaser imports — so it runs headless in Node for
// determinism tests, and everything the outside world needs to know arrives
// via this.events (one-way: listeners must never mutate sim state).
//
// Step order faithfully mirrors classic/script.js:435-696; the collision
// passes are order-dependent, don't reorder them.

import {
  GRAVITY,
  DOWN_BOOST,
  HMOV,
  HMOV_BOOSTED,
  HMOV_T1,
  JUMP_VEL,
  JUMP_VEL_T2,
  GROUND,
  PLAYER_MIN_X,
  PLAYER_MAX_X,
  BLOCK_COLLIDE_WINDOW,
  SQUISH_VEL,
  SPAWN_MIN_X,
  SPAWN_MAX_X,
  POWERUP_LIFETIME,
  POWERUP_FLASH_AT,
  POWERUP_TIMER_ADD,
  VSPEED_TIMER_ADD,
  POWERUP_TIMER_CAP,
  POWERUP_CYCLE,
  BLOCK_RATE_BASE,
  RATE_GROWTH_REMIX,
  COIN_VALUE,
  CLOUD_PLAT_CRUMBLE,
  GAME_W,
  JUMP_BUFFER_FRAMES,
  DASH_BUFFER_FRAMES,
  DASH_FRAMES,
  DASH_SPEED,
  DASH_EXIT_XVEL,
  DASH_RECOVERY_IFRAMES,
  DASH_COOLDOWN,
  SPARK_CAP,
  SPARK_CAP_T2,
  GRAZE_LETHAL_VEL,
  SPIKE_WINDUP,
  SPIKE_VEL,
  SPIKE_BOUNCE_VEL,
  SURF_MIN_VEL,
  SURF_HEAT_EVERY,
  SURF_SPARK_EVERY,
  CREST_MIN_RIDE,
  CREST_WINDOW,
  CREST_JUMP_VEL,
  FRESH_FOOTING_FRAMES,
} from '../constants.js';
import { rectrect, constrain } from './util.js';
import { Rng } from './rng.js';
import { createEmitter } from './events.js';
import { Player } from './player.js';
import { BlockManager } from './blocks.js';
import { Powerup } from './powerups.js';
import {
  heatTier,
  heatMult,
  gainHeat,
  loseHeat,
  updateHeatDecay,
  gainSpark,
  updateGraze,
} from './combo.js';
import { Director } from './director.js';

// Neutral input snapshot, used by tests' fast-forward
export const NEUTRAL_INPUT = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
  jumpPressed: false,
  dashPressed: false,
  spikePressed: false,
  dashDir: 0,
});

export class Sim {
  constructor(seed, { stress = false } = {}) {
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.events = createEmitter();
    this.stress = stress;

    this.player = new Player();
    this.blocks = new BlockManager(this);
    this.powerups = [];
    this.camY = 0;
    this.frame = 0; // the original's frameCount - frameDiff
    this.jKeyLetGo = 455;
    this.jumpBuffer = 0; // frames a buffered jump press stays live
    this.dashBuffer = 0;
    this.pwrCounter = 0;
    this.scoreCoins = 0;
    this.score = 0;
    this.blockRate = BLOCK_RATE_BASE; // blocks per second
    this.spawnAcc = 0; // fractional blocks owed
    this.dead = false;
    this.deathCause = null;

    // --- remix state ---
    this.scoreBonus = 0; // spike shatters, event payoffs, zone bonuses
    this.scoreFloat = 0; // altitude income, accrued x heatMult
    this.prevCamY = 0;
    this.lastGrazeByCol = new Map(); // spawn column -> frame of last graze
    this.landedOn = null; // block the player stood on this step
    this.surfBlock = null; // falling block currently ridden
    this.surfFrames = 0;
    this.crestWindow = 0; // frames left to fire the crest jump
    this.platforms = []; // crumble clouds (Cloudtop zone)
    this.director = new Director(this);
  }

  get heatTier() {
    return heatTier(this.player.heat);
  }

  get heatMult() {
    return heatMult(this.player.heat);
  }

  kill(cause) {
    if (this.dead) return;
    this.dead = true;
    this.deathCause = cause;
  }

  // One frame of game logic. `inp` is a per-step input snapshot:
  // { up, down, left, right, jumpPressed, dashPressed }
  step(inp) {
    if (this.dead) return;
    this.frame++;
    const p = this.player;
    const wasAirborne = p.offGround; // for the landing-dust effect

    // director first: its rate/event multipliers apply this same frame
    this.director.step();
    this.blockRate =
      (BLOCK_RATE_BASE + RATE_GROWTH_REMIX * this.frame) *
      this.director.rateMul *
      this.director.eventMul;
    if (this.stress) this.blockRate = Math.max(this.blockRate, 30);
    this.blockRate = Math.min(this.blockRate, 40); // storm-proof hard cap

    // Heat-tier buffs, recomputed every step so decay downgrades apply
    const tier = this.heatTier;
    p.hMov = p.hTimer > 0 ? HMOV_BOOSTED : tier >= 1 ? HMOV_T1 : HMOV;
    p.jumpVelBase = tier >= 2 ? JUMP_VEL_T2 : JUMP_VEL;
    p.sparkCap = tier >= 2 ? SPARK_CAP_T2 : SPARK_CAP;

    const busy = p.dashTimer > 0 || p.spiking;

    // input. jKeyLetGo === 1 marks a fresh jump-key press (double jumps need
    // one); a fresh press is also buffered for a few frames so a tap just
    // before landing still fires — the crest jump depends on this.
    this.jKeyLetGo++;
    if (inp.jumpPressed) this.jumpBuffer = JUMP_BUFFER_FRAMES;
    if (inp.dashPressed) this.dashBuffer = DASH_BUFFER_FRAMES;
    if (!busy) {
      const freshJump = this.jumpBuffer > 0;
      const preJumpTSJ = p.timeSinceJump;
      if (inp.up || freshJump) {
        p.jump(freshJump ? 1 : this.jKeyLetGo);
        if (p.timeSinceJump === 0 && preJumpTSJ !== 0) {
          this.jumpBuffer = 0;
          // crest jump: the ridden block just landed and this jump is inside
          // the window — launch at super height
          if (this.crestWindow > 0) {
            p.yVel = Math.max(p.yVel, CREST_JUMP_VEL);
            this.crestWindow = 0;
            gainHeat(this, 2, 'crest');
            this.events.emit('crestJump', { x: p.x + p.w / 2, y: p.y });
          }
          this.events.emit('jump', { x: p.x, y: p.y });
        }
      }
      if (inp.left) p.walk(-p.hMov);
      if (inp.right) p.walk(p.hMov);
      if (inp.down && p.vTimer > 0) p.yVel -= DOWN_BOOST;

      // Spark verbs. Spike drop = dash button while airborne holding down
      // (or a downward swipe); otherwise a horizontal dash.
      const airborne = p.offGround >= 3;
      const wantSpike =
        airborne && (inp.spikePressed || (this.dashBuffer > 0 && inp.down));
      if (wantSpike && p.sparks > 0) {
        this.startSpike();
      } else if (
        this.dashBuffer > 0 &&
        p.dashCooldown <= 0 &&
        p.sparks > 0 &&
        !inp.down
      ) {
        this.startDash(inp);
      }
    }
    if (!inp.up) this.jKeyLetGo = 0;
    if (this.jumpBuffer > 0) this.jumpBuffer--;
    if (this.dashBuffer > 0) this.dashBuffer--;

    // spawn blocks (and maybe powerups) by accumulating the smooth rate
    this.spawnAcc += this.blockRate / 60;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      // cap concurrent fallers so a storm can't spiral the step budget
      if (this.blocks.falling.length < 120) {
        this.blocks.spawn(this.camY, this.blockRate);
      }
      const spawnY = -this.camY - 40;
      const pwType = { 6: 'I', 13: 'H', 20: 'D', 27: 'V', 34: 'S' }[
        this.pwrCounter % POWERUP_CYCLE
      ];
      if (pwType) {
        this.powerups.push(
          new Powerup(pwType, this.rng.int(SPAWN_MIN_X, SPAWN_MAX_X), spawnY),
        );
      }
      this.pwrCounter++;
    }

    this.blocks.update();
    this.updatePlatforms();

    this.landedOn = null;
    if (p.dashTimer > 0) {
      // dash replaces the movement/collision block entirely: horizontal
      // only, phases falling blocks, bonks on the solid tower
      p.shieldTimer--;
      p.hTimer--;
      p.vTimer--;
      p.dTimer--;
      this.updateDash();
    } else if (p.spiking) {
      p.shieldTimer--;
      p.hTimer--;
      p.vTimer--;
      p.dTimer--;
      this.updateSpike();
    } else {
      // three player-vs-block passes, faithfully order-dependent:
      // pass A resolves blocks that moved into the player (also resets jumps)
      this.landSquishPass(0);
      p.shieldTimer--;
      p.hTimer--;
      p.vTimer--;
      p.dTimer--;
      if (this.director.wind) p.xVel += this.director.wind;
      p.updateX();
      this.wallPass();
      p.updateY(inp.up);
      if (rectrect(p, GROUND)) {
        p.y = GROUND.y - p.h;
        p.yVel = 0;
        p.offGround = 0;
      }
      // pass C: same as A but lands with an extra -0.1 offset (the original's
      // second landing snap at classic/script.js:579)
      this.landSquishPass(-0.1);
      this.platformLandPass();
    }

    // landing feedback
    if (p.landSquash > 0) p.landSquash--;
    if (p.offGround === 0 && wasAirborne > 4) {
      p.landSquash = 8;
      this.events.emit('land', { x: p.x + p.w / 2, y: p.y + p.h });
    }

    this.updateSurf();
    updateGraze(this);
    updateHeatDecay(this);
    if (p.dashCooldown > 0) p.dashCooldown--;
    if (p.dashRecovery > 0 && p.dashTimer <= 0 && !p.spiking) p.dashRecovery--;
    if (this.crestWindow > 0) this.crestWindow--;

    this.updatePowerups();

    p.offGround++;
    p.timeSinceJump++;

    // camera: slow constant rise, plus snapping up when the player is high
    // (the original's 2/fpb per frame == blockRate/30)
    this.camY += this.blockRate / 30;
    if (p.y + this.camY < 150 && -p.y + 150 > this.camY) {
      this.camY = -p.y + 150;
    }

    // altitude income accrues at the Heat multiplier — the greed economy
    this.scoreFloat += (this.camY - this.prevCamY) * this.heatMult;
    this.prevCamY = this.camY;

    this.updateScore();
    if (p.y > -this.camY + 500) this.kill('fell');
    if (this.dead) this.events.emit('death', { cause: this.deathCause });
  }

  updateScore() {
    // altitude x mult + coins x mult + bonuses (blocks.length is a stat now,
    // not score — it double-counted time)
    this.score = Math.round(this.scoreFloat) + this.scoreCoins + this.scoreBonus;
  }

  // crumble clouds: drift in from the sides, crumble shortly after first
  // being stood on. Semisolid — no block/powerup interaction, no squish.
  updatePlatforms() {
    for (let i = 0; i < this.platforms.length; i++) {
      const pl = this.platforms[i];
      pl.x += pl.vx;
      const gone =
        (pl.crumbleAt > 0 && this.frame >= pl.crumbleAt) ||
        pl.x > GAME_W + 140 ||
        pl.x < -240 ||
        pl.y > -this.camY + 600;
      if (gone) {
        if (pl.crumbleAt > 0) {
          this.events.emit('cloudGone', { x: pl.x + pl.w / 2, y: pl.y });
        }
        this.platforms.splice(i, 1);
        i--;
      }
    }
  }

  platformLandPass() {
    const p = this.player;
    for (const pl of this.platforms) {
      // only catch a falling player from above — jump up through freely
      if (p.yVel <= 0 && p.y < pl.y && rectrect(p, pl)) {
        p.y = pl.y - p.h;
        p.yVel = 0;
        p.offGround = 0;
        p.jumps = 0;
        if (pl.crumbleAt < 0) {
          pl.crumbleAt = this.frame + CLOUD_PLAT_CRUMBLE;
          this.events.emit('cloudLand', { x: pl.x + pl.w / 2, y: pl.y });
        }
      }
    }
  }

  // ---------------------------------------------------------------- verbs

  startDash(inp) {
    const p = this.player;
    p.sparks--;
    this.dashBuffer = 0;
    p.dashTimer = DASH_FRAMES;
    p.dashDir = inp.dashDir || (inp.left ? -1 : inp.right ? 1 : p.facing);
    p.facing = p.dashDir;
    p.dashPhaseCount = 0;
    this.events.emit('dash', { dir: p.dashDir, x: p.x, y: p.y, sparks: p.sparks });
  }

  updateDash() {
    const p = this.player;
    p.x = constrain(p.x + DASH_SPEED * p.dashDir, PLAYER_MIN_X, PLAYER_MAX_X - p.w);
    p.yVel = 0;
    let bonked = false;
    const blocks = this.blocks.blocks;
    for (
      let i = Math.max(0, blocks.length - BLOCK_COLLIDE_WINDOW);
      i < blocks.length;
      i++
    ) {
      const b = blocks[i];
      if (!rectrect(p, b)) continue;
      if (b.fixed) {
        // the tower is always solid: bonk, stop, small pushback
        p.x = p.dashDir > 0 ? b.x - p.w - 3 : b.x + b.w + 3;
        bonked = true;
        break;
      }
      if (!b.dashPhased && b.yVel > GRAZE_LETHAL_VEL) {
        b.dashPhased = true;
        if (p.dashPhaseCount < 2) {
          p.dashPhaseCount++;
          gainHeat(this, 1, 'phase');
          if (b.type === 'gilded') {
            this.scoreBonus += 100;
            gainSpark(this, 1, 'gilded-phase');
          }
        }
        this.events.emit('dashPhase', {
          x: b.x + b.w / 2,
          y: b.y + b.h / 2,
          block: b,
        });
      }
    }
    // dashing along the ground keeps you grounded
    if (rectrect(p, GROUND)) {
      p.y = GROUND.y - p.h;
      p.offGround = 0;
    }
    p.dashTimer--;
    if (bonked) p.dashTimer = 0;
    if (p.dashTimer <= 0) {
      p.dashRecovery = DASH_RECOVERY_IFRAMES;
      p.dashCooldown = DASH_COOLDOWN;
      p.xVel = bonked ? -p.dashDir * 2 : DASH_EXIT_XVEL * p.dashDir;
      this.events.emit(bonked ? 'dashBonk' : 'dashEnd', { x: p.x, y: p.y });
    }
  }

  startSpike() {
    const p = this.player;
    p.sparks--;
    this.dashBuffer = 0;
    p.spiking = true;
    p.spikeWindup = SPIKE_WINDUP;
    p.spikeShattered = false;
    p.xVel = 0;
    this.events.emit('spikeStart', { x: p.x, y: p.y, sparks: p.sparks });
  }

  updateSpike() {
    const p = this.player;
    if (p.spikeWindup > 0) {
      p.spikeWindup--;
      p.yVel = 0;
      if (p.spikeWindup === 0) this.events.emit('spikeDrop', { x: p.x, y: p.y });
      return;
    }
    p.y += SPIKE_VEL;
    p.yVel = -SPIKE_VEL; // render pose reads this (positive = up)
    const blocks = this.blocks.blocks;
    for (
      let i = Math.max(0, blocks.length - BLOCK_COLLIDE_WINDOW);
      i < blocks.length;
      i++
    ) {
      const b = blocks[i];
      if (!rectrect(p, b)) continue;
      if (!b.fixed && !b.spec.unbreakable) {
        // falling blocks shatter on the way down — you are the meteor
        gainHeat(this, 1, 'spike-air');
        if (b.type === 'gilded') this.scoreBonus += 150;
        this.events.emit('blockBreak', {
          x: b.x + b.w / 2,
          y: b.y + b.h / 2,
          block: b,
          cause: 'spike-air',
        });
        this.blocks.remove(b);
        i--;
        continue;
      }
      // fixed: shatter one exposed top ("exposed only" means nothing is ever
      // left floating), else a dull thud; bounce off either way
      if (!p.spikeShattered && b.fixed && !b.spec.unbreakable && this.blocks.isExposedTop(b)) {
        p.spikeShattered = true;
        this.scoreBonus += 15;
        gainHeat(this, 1, 'spike');
        if (b.type === 'gilded') this.scoreBonus += 150;
        this.events.emit('spikeShatter', {
          x: b.x + b.w / 2,
          y: b.y + b.h / 2,
          block: b,
        });
        this.blocks.removeFixed(b);
      } else {
        this.events.emit('spikeThud', { x: p.x + p.w / 2, y: b.y });
      }
      p.y = b.y - p.h;
      this.endSpike();
      return;
    }
    if (rectrect(p, GROUND)) {
      p.y = GROUND.y - p.h;
      this.events.emit('spikeThud', { x: p.x + p.w / 2, y: GROUND.y, ground: true });
      this.endSpike();
    }
  }

  endSpike() {
    const p = this.player;
    p.spiking = false;
    p.yVel = SPIKE_BOUNCE_VEL;
    p.dashRecovery = DASH_RECOVERY_IFRAMES;
    p.dashCooldown = DASH_COOLDOWN;
    p.jumps = 0;
  }

  // Storm surfing: standing on a fast-falling block pays Heat/Sparks over
  // time; when a block you rode >= CREST_MIN_RIDE frames fixes under you, a
  // short crest window opens for the super jump. Fresh footing (standing on
  // any block soon after it landed) pays a little Heat once per block.
  updateSurf() {
    const p = this.player;
    const b = this.landedOn;
    if (b && !b.fixed && b.yVel > SURF_MIN_VEL) {
      if (this.surfBlock === b) {
        this.surfFrames++;
      } else {
        this.surfBlock = b;
        this.surfFrames = 1;
        this.events.emit('surfStart', { block: b });
      }
      b.ridden = this.surfFrames;
      if (this.surfFrames % SURF_HEAT_EVERY === 0) gainHeat(this, 1, 'surf');
      if (this.surfFrames % SURF_SPARK_EVERY === 0) gainSpark(this, 1, 'surf');
    } else if (this.surfBlock) {
      // the block snaps to its layer on the fix frame, briefly breaking
      // contact — the crest window opens on the fix, not on exact contact
      if (this.surfBlock.fixed && this.surfFrames >= CREST_MIN_RIDE) {
        this.crestWindow = CREST_WINDOW;
        this.events.emit('crestOpen', {
          x: this.surfBlock.x + this.surfBlock.w / 2,
          y: this.surfBlock.y,
          block: this.surfBlock,
        });
      }
      this.surfBlock = null;
      this.surfFrames = 0;
    }
    if (b && b.fixed && !b.freshPaid && this.frame - b.fixedAtFrame <= FRESH_FOOTING_FRAMES) {
      b.freshPaid = true;
      gainHeat(this, 1, 'fresh');
    }
  }

  // land on top / get squished / pushed out from under a ceiling
  landSquishPass(landOffset) {
    const p = this.player;
    const blocks = this.blocks.blocks;
    for (
      let i = Math.max(0, blocks.length - BLOCK_COLLIDE_WINDOW);
      i < blocks.length;
      i++
    ) {
      const b = blocks[i];
      if (rectrect(p, b)) {
        if (b.spec.onPlayerContact) {
          const kind = p.y < b.y ? 'land' : b.yVel > SQUISH_VEL ? 'squish' : 'push';
          if (b.spec.onPlayerContact(b, p, this, kind)) continue;
        }
        if (p.y < b.y) {
          // riding: falling blocks snap flush (the -0.1 offset would leave a
          // permanent hairline gap once velocities match) and the player
          // inherits the block's velocity instead of resetting — gravity
          // applies equally to both afterwards, so the player stays glued all
          // the way down. This is what makes storm surfing possible (the
          // original's yVel=0 skids you off anything falling faster than
          // your own re-acceleration).
          p.y = b.y - p.h + (b.fixed ? landOffset : 0);
          p.yVel = b.fixed ? 0 : -b.yVel;
          p.offGround = 0;
          p.jumps = 0;
          this.landedOn = b;
        } else if (b.yVel > SQUISH_VEL && b.spec.lethal) {
          if (p.dashRecovery > 0) continue; // post-dash/spike i-frames
          if (p.shieldTimer > 0) {
            this.events.emit('shieldPop', {
              x: b.x + b.w / 2,
              y: b.y + b.h / 2,
            });
            // the shield saves your life but taxes your greed
            loseHeat(this, Math.ceil(p.heat / 2), 'shield');
            this.blocks.remove(b);
            i--;
            continue;
          }
          this.kill('squished');
        } else {
          p.yVel = 0;
          while (rectrect(p, b)) p.y += 0.2;
        }
      }
    }
  }

  // undo horizontal movement into a block
  wallPass() {
    const p = this.player;
    const blocks = this.blocks.blocks;
    for (
      let i = Math.max(0, blocks.length - BLOCK_COLLIDE_WINDOW);
      i < blocks.length;
      i++
    ) {
      if (rectrect(p, blocks[i])) {
        p.xVel = 0;
        p.x = p.originalPos;
      }
    }
  }

  updatePowerups() {
    const p = this.player;
    const blocks = this.blocks.blocks;
    for (let i = 0; i < this.powerups.length; i++) {
      const pw = this.powerups[i];
      pw.yVel += GRAVITY;
      pw.y += pw.yVel;
      if (rectrect(pw, GROUND)) {
        pw.yVel = 0;
        pw.y = GROUND.y - pw.h;
      }
      // the remake faithfully scanned EVERY block here; at remix spawn rates
      // that's O(total x powerups) and melts the step budget late-game —
      // powerups only ever rest on recent (top-of-stack) blocks anyway
      for (
        let j = Math.max(0, blocks.length - BLOCK_COLLIDE_WINDOW);
        j < blocks.length;
        j++
      ) {
        if (rectrect(pw, blocks[j])) {
          pw.yVel = 0;
          pw.y = blocks[j].y - pw.h;
        }
      }
      // flash when about to despawn
      pw.visible = pw.timer < POWERUP_FLASH_AT || this.frame % 16 < 8;
      if (rectrect(pw, p)) {
        switch (pw.type) {
          case 'I':
            p.shieldTimer =
              constrain(p.shieldTimer, 0, POWERUP_TIMER_CAP) + POWERUP_TIMER_ADD;
            break;
          case 'H':
            p.hTimer =
              constrain(p.hTimer, 0, POWERUP_TIMER_CAP) + POWERUP_TIMER_ADD;
            break;
          case 'D':
            p.dTimer =
              constrain(p.dTimer, 0, POWERUP_TIMER_CAP) + POWERUP_TIMER_ADD;
            break;
          case 'V':
            p.vTimer =
              constrain(p.vTimer, 0, POWERUP_TIMER_CAP) + VSPEED_TIMER_ADD;
            break;
          case 'S':
            this.scoreCoins += COIN_VALUE * this.heatMult;
            if (this.director.activeEvent?.spec.id === 'goldrush') {
              this.director.eventData.collected++;
            }
            break;
        }
        this.events.emit('pickup', {
          type: pw.type,
          x: pw.x + pw.w / 2,
          y: pw.y + pw.h / 2,
          px: p.x + p.w / 2,
          py: p.y,
          amount: pw.type === 'S' ? COIN_VALUE * this.heatMult : 0,
        });
        this.powerups.splice(i, 1);
        i--;
        continue;
      }
      pw.timer++;
      if (pw.timer > POWERUP_LIFETIME) {
        this.powerups.splice(i, 1);
        i--;
      }
    }
  }

  // compact state fingerprint for determinism tests
  hash() {
    const p = this.player;
    return [
      this.frame,
      p.x.toFixed(4),
      p.y.toFixed(4),
      p.xVel.toFixed(4),
      p.yVel.toFixed(4),
      this.camY.toFixed(4),
      this.blocks.length,
      this.blocks.falling.length,
      this.powerups.length,
      this.score,
      p.sparks,
      p.heat,
      this.rng.s,
    ].join('|');
  }
}
