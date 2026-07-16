import Phaser from 'phaser';
import {
  STEP_MS,
  MAX_STEPS_PER_FRAME,
  GROUND,
  BLOCK_H,
  BLOCK_W,
  BLOCK_UPDATE_WINDOW,
  HUD_FLASH_AT,
  POWERUP_TIMER_ADD,
  CREST_WINDOW,
  HEAT_MAX,
  HEAT_T1,
  HEAT_T2,
  COLOR_BG_GAME,
  COLOR_GRASS,
  COLOR_GRASS_DARK,
  COLOR_SOIL_TOP,
  COLOR_SOIL_BOTTOM,
  POWERUP_COLORS,
  COLOR_GILDED,
  RES,
} from '../constants.js';
import { constrain } from '../sim/util.js';
import { setupCamera, textStyle, bakeDigitFont, DIGIT_FONT } from '../utils.js';
import { createInput, isMobile } from '../input.js';
import { Sim } from '../sim/sim.js';
import {
  drawWarningStrip,
  bakeBlockTextures,
  frameNameFor,
  BLOCK_TEX,
} from '../render/blockArt.js';
import { drawPlayer } from '../render/playerArt.js';
import {
  drawPowerup,
  POWERUP_LABEL,
  POWERUP_PICKUP_TEXT,
} from '../render/powerupArt.js';
import { ParticleFx } from '../render/fx.js';
import { Juice } from '../render/juice.js';
import { Background } from '../render/background.js';
import { ZONES } from '../zones.js';
import { TouchHints } from '../touchui.js';
import { sfx } from '../audio.js';
import { music } from '../music.js';
import { installTestHooks } from '../testhooks.js';
import { storage } from '../storage.js';
import { paletteById } from '../palettes.js';
import { seedFromString } from '../sim/rng.js';

// Dev stress test: ?stress forces a block every 2 sim steps
const params =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new Map();
const STRESS = params.has('stress');

// HUD powerup indicator geometry — the original computed these from the raw
// window size (a bug); these are the 800x500-window equivalents.
const HUD_ICONS = [
  { type: 'I', x: (0.2 * 800) / 30 },
  { type: 'H', x: (1.2 * 800) / 30 },
  { type: 'D', x: (2.2 * 800) / 30 },
  { type: 'V', x: (3.2 * 800) / 30 },
];
const HUD_ICON_Y = 500 / 40;
const HUD_ICON_SIZE = 20;

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init(data) {
    this.daily = !!data?.daily;
    this.dateStr = new Date().toISOString().slice(0, 10);
  }

  create() {
    setupCamera(this, COLOR_BG_GAME);
    this.inp = createInput(this);

    // --- simulation (Phaser-free; all game state lives in here) ---
    // Daily Climb: everyone gets the same spawns + event schedule today
    const seed = this.daily
      ? seedFromString(this.dateStr)
      : params.has('seed')
        ? Number(params.get('seed')) >>> 0
        : Date.now() >>> 0;
    this.sim = new Sim(seed, { stress: STRESS });
    this.accumulator = 0;
    this.palette = paletteById(storage.data.settings.palette);
    this.peakHeat = 0;
    this.t3Ms = 0; // max-Heat hold time, for the Ember unlock
    this.newHeights = false;
    this.bestHeightAtStart = storage.data.bestHeight;

    // --- render-only state ---
    this.fx = new ParticleFx();
    this.juice = new Juice();
    this.deathAt = 0; // wall-clock time to leave for the game-over scene
    this.afterimages = []; // dash/crest trail ghosts
    this.blockFlashes = []; // phased blocks flash to a white silhouette
    this.streakUntil = 0; // sim frame the crest-jump gold trail ends
    this.lastCrestSlowmo = -Infinity;
    this.wireEvents();

    this.input.keyboard.on('keydown-M', () => {
      const muted = sfx.toggleMute();
      if (this.muteToast) this.muteToast.destroy();
      this.muteToast = this.add
        .text(400, 60, muted ? 'Sound off' : 'Sound on', textStyle(18, {
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#2b5876',
          strokeThickness: 4,
        }))
        .setOrigin(0.5);
      this.tweens.add({
        targets: this.muteToast,
        alpha: 0,
        delay: 600,
        duration: 400,
        onComplete: () => this.muteToast && this.muteToast.destroy(),
      });
    });

    // --- backdrop (screen space, behind the world) ---
    this.bg = new Background(this);

    // --- world rendering: container translated by (tX, camY) each frame,
    // exactly like the original's translate() ---
    bakeBlockTextures(this);
    this.worldContainer = this.add.container(0, 0);
    this.staticGfx = this.add.graphics(); // ground
    this.blockLayer = this.add.container(0, 0); // pooled block sprites
    this.dynamicGfx = this.add.graphics(); // strips, player, powerups, particles
    this.worldContainer.add([this.staticGfx, this.blockLayer, this.dynamicGfx]);
    this.blockSprites = [];
    this.worldTextPool = [];

    // full-screen flash layer: above the world, below the HUD
    this.flashGfx = this.add.graphics();

    // zone banner (rare setText — re-rasterizing is fine here)
    this.zoneBanner = this.add
      .text(400, 190, '', textStyle(42, {
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#1c2733',
        strokeThickness: 8,
      }))
      .setOrigin(0.5)
      .setAlpha(0);

    // --- HUD (screen space) ---
    // Rows split into a static label (Text, rasterized once) and a
    // digits-only BitmapText value from the baked digit font — so the
    // per-frame number changes never re-rasterize anything.
    this.hudGfx = this.add.graphics();
    const { letterSpacing } = bakeDigitFont(this);
    const hudStyle = textStyle(25, {
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#2b5876',
      strokeThickness: 5,
    });
    const hudRow = (y, labelStr) => {
      const label = this.add.text(0, y, labelStr, hudStyle).setOrigin(1, 0.5);
      const value = this.add
        .bitmapText(790, y, DIGIT_FONT, '')
        .setOrigin(1, 0.5)
        .setLetterSpacing(letterSpacing)
        .setScale(1 / RES); // glyphs are baked at RES density
      return { label, value };
    };
    this.scoreRow = hudRow(16, 'Score:');
    this.rateRow = hudRow(44, 'Blocks/sec:');
    this.fpsRow = hudRow(71, 'FPS:');
    this.hudIconTexts = {};
    for (const icon of HUD_ICONS) {
      const label = POWERUP_LABEL[icon.type];
      if (!label) continue;
      this.hudIconTexts[icon.type] = this.add
        .text(
          icon.x + HUD_ICON_SIZE / 2,
          HUD_ICON_Y + HUD_ICON_SIZE / 2,
          label.text,
          textStyle(label.size, { color: '#ffffff', fontStyle: 'bold' }),
        )
        .setOrigin(0.5)
        .setVisible(false);
    }

    // touch-control hints, created last so the zone flash sits above the HUD;
    // mobile only — touchscreen laptops keep the clean desktop look
    if (this.inp.touch && isMobile(this)) new TouchHints(this, this.inp.touch);

    // music rides the sfx AudioContext (created by the menu's start gesture)
    music.attach(sfx);

    installTestHooks(this);
  }

  // The single place sim events are translated into feedback (fx/sfx).
  // Listeners read sim state freely but never mutate it.
  wireEvents() {
    const ev = this.sim.events;
    const sim = this.sim;

    ev.on('blockFix', (b) => {
      this.fx.dust(b.x + b.w / 2, b.y + b.h, 7, 0xcbb391);
      // only audible when the landing is on screen
      const p = sim.player;
      if (
        b.y > -sim.camY - b.h &&
        b.y < -sim.camY + 500 &&
        Math.abs(b.x + b.w / 2 - (p.x + p.w / 2)) < 800
      ) {
        sfx.blockLand();
      }
    });

    ev.on('jump', () => sfx.jump());

    ev.on('land', ({ x, y }) => {
      this.fx.dust(x, y, 6);
      sfx.land();
    });

    ev.on('pickup', ({ type, x, y, px, py, amount }) => {
      this.fx.burst(x, y, POWERUP_COLORS[type]);
      this.floatText(amount ? `+${amount}` : POWERUP_PICKUP_TEXT[type], px, py - 8);
      if (type === 'S') sfx.coin();
      else sfx.pickup();
    });

    ev.on('shieldPop', ({ x, y }) => {
      this.fx.burst(x, y, POWERUP_COLORS.I, 12);
      sfx.shieldPop();
    });

    ev.on('death', () => {
      sfx.death();
      music.duck();
      this.juice.shake(10, 400, 99);
      this.juice.flash(0xffffff, 0.3, 150);
    });

    // --- remix: verbs + economy feedback ---

    ev.on('graze', ({ x, y, px, py, perfect, paid }) => {
      if (!paid) return;
      sfx.graze(perfect);
      // sparks rip off the block edge toward the player
      const mx = (x + px) / 2;
      const my = (y + py) / 2;
      this.fx.burst(mx, my, 0xfff3b0, perfect ? 12 : 5);
      this.floatText(perfect ? 'PERFECT!' : 'CLOSE!', px, py - 26);
      if (perfect) {
        this.juice.hitstop(3);
        this.juice.shake(2, 100);
      }
    });

    ev.on('heat', ({ heat }) => sfx.ladder(heat));
    ev.on('heatTier', ({ tier, up }) => {
      if (!up) sfx.heatDown();
      else this.juice.flash(0xff9f1c, 0.08, 180);
    });

    ev.on('dash', ({ dir }) => {
      sfx.dash();
      this.juice.leanX = 6 * dir;
    });
    ev.on('dashEnd', () => (this.juice.leanX = 0));
    ev.on('dashBonk', ({ x, y }) => {
      sfx.dashBonk();
      this.juice.leanX = 0;
      this.juice.shake(2, 80);
      this.fx.dust(x + 15, y + 15, 4);
    });
    ev.on('dashPhase', ({ x, y, block }) => {
      sfx.dashPhase();
      const gilded = block.type === 'gilded';
      if (gilded) {
        sfx.coin();
        this.floatText('+100!', x, y - 16);
      }
      this.blockFlashes.push({ block, life: 5 });
      this.fx.burst(x, y, gilded ? COLOR_GILDED : 0xffffff, 6);
    });

    ev.on('spikeStart', () => sfx.spikeWindup());
    ev.on('spikeShatter', ({ x, y, block }) => {
      const gilded = block.type === 'gilded';
      sfx.spikeShatter();
      music.duck();
      if (gilded) sfx.coin();
      this.juice.hitstop(3);
      this.juice.shake(8, 300, 3);
      this.fx.shards(x, y, gilded ? COLOR_GILDED : 0xd9a066, 14);
      this.fx.dust(x, y + 10, 10, 0xcbb391);
      this.floatText(gilded ? '+165!' : '+15', x, y - 20);
    });
    ev.on('spikeThud', ({ x, y }) => {
      sfx.spikeThud();
      this.juice.shake(3, 120);
      this.fx.dust(x, y, 8);
    });
    ev.on('blockBreak', ({ x, y, block }) => {
      const gilded = block.type === 'gilded';
      sfx.blockBreak();
      if (gilded) {
        sfx.coin();
        this.floatText('+150!', x, y - 16);
      }
      this.fx.shards(x, y, gilded ? COLOR_GILDED : 0xd9a066, 8);
    });

    ev.on('gildedFade', ({ x, y }) => this.fx.burst(x, y, 0x9a8452, 6));

    ev.on('crestOpen', ({ x, y }) => {
      sfx.crestThump();
      music.duck();
      this.juice.shake(6, 250, 2, 'y');
      this.fx.burst(x, y, 0xffffff, 14);
      this.fx.dust(x - 30, y + 40, 8, 0xcbb391);
      this.fx.dust(x + 30, y + 40, 8, 0xcbb391);
      // the one systemic slow-mo in the game — scarcity keeps it an event
      if (this.juice.now - this.lastCrestSlowmo > 3000) {
        this.lastCrestSlowmo = this.juice.now;
        this.juice.slowmo(0.6, 10);
      }
    });
    ev.on('crestJump', ({ x, y }) => {
      sfx.crestJump();
      this.streakUntil = sim.frame + 20;
      this.fx.burst(x, y, 0xffd700, 10);
      this.floatText('CREST!', x, y - 30);
    });

    // --- zones & platforms ---

    ev.on('zoneChange', ({ index, zone }) => {
      this.bg.setZone(zone);
      sfx.zoneUp();
      // altitude feats unlock palettes
      const feat = { 2: 'storm', 3: 'cloud', 4: 'aurora' }[index];
      if (feat && storage.unlock(feat)) this.unlockToast(feat);
      this.zoneBanner.setText(`—  ${zone.name}  —`);
      this.tweens.killTweensOf(this.zoneBanner);
      this.zoneBanner.setAlpha(0);
      this.tweens.add({
        targets: this.zoneBanner,
        alpha: 1,
        duration: 400,
        yoyo: true,
        hold: 1400,
      });
      if (zone.bonus) {
        const p = sim.player;
        this.floatText(`+${zone.bonus}`, p.x + p.w / 2, p.y - 24);
      }
    });

    ev.on('cloudLand', ({ x, y }) => {
      this.fx.dust(x, y, 5, 0xffffff);
      sfx.land();
    });
    ev.on('cloudGone', ({ x, y }) => this.fx.dust(x, y, 10, 0xffffff));

    // --- set-piece events ---

    ev.on('eventTelegraph', ({ id }) => {
      switch (id) {
        case 'storm':
          sfx.siren();
          this.showEventBanner('STORM INCOMING');
          break;
        case 'monolith':
          sfx.rumble();
          this.juice.shake(2, 900, 1);
          break;
        case 'meteor':
          sfx.whistle();
          break;
        case 'gust':
          sfx.gustWhoosh();
          break;
        case 'goldrush':
          sfx.shimmer();
          break;
        case 'whiteout':
          sfx.gustWhoosh();
          break;
        case 'tetra':
          sfx.uiClick();
          break;
      }
    });

    ev.on('blockSpawn', () => {
      if (sim.director.fogged) sfx.spawnTick();
    });

    ev.on('payoff', ({ text, amount, x, y }) => {
      sfx.payoffChime();
      this.floatText(`${text}  +${amount}`, x, y);
      this.juice.flash(0xffd700, 0.1, 200);
      if (text === 'KING OF THE HILL' && storage.unlock('obsidian')) {
        this.unlockToast('obsidian');
      }
      if (text === 'FULL CLEAR!' && storage.addGoldrushClear() >= 3) {
        if (storage.unlock('gold')) this.unlockToast('gold');
      }
    });

    ev.on('meteorImpact', ({ x, y }) => {
      sfx.meteorBoom();
      music.duck();
      this.juice.hitstop(3);
      this.juice.shake(9, 350, 4);
      this.fx.shards(x, y, 0xff7043, 16);
      this.fx.dust(x, y, 12, 0xcbb391);
    });
  }

  unlockToast(id) {
    sfx.payoffChime();
    const name = paletteById(id).name;
    const t = this.add
      .text(400, 90, `UNLOCKED: ${name}`, textStyle(20, {
        color: '#ffd700',
        fontStyle: 'bold',
        stroke: '#3a2c00',
        strokeThickness: 5,
      }))
      .setOrigin(0.5);
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 2200,
      duration: 500,
      onComplete: () => t.destroy(),
    });
  }

  // short mid-screen warning label (rare setText is fine)
  showEventBanner(text) {
    this.zoneBanner.setText(text);
    this.tweens.killTweensOf(this.zoneBanner);
    this.zoneBanner.setAlpha(0);
    this.tweens.add({
      targets: this.zoneBanner,
      alpha: 0.9,
      duration: 250,
      yoyo: true,
      hold: 1000,
    });
  }

  update(time, delta) {
    // Fixed 60Hz timestep: game speed no longer depends on render rate.
    // Clamp huge deltas (tab switch) so we don't fast-forward on return.
    // Hitstop/slow-mo scale the accumulator input — the only sim-facing
    // surface of the juice system.
    const sim = this.sim;
    this.juice.update(delta);
    this.accumulator += Math.min(delta, 250) * this.juice.timeScale;
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME && !sim.dead) {
      sim.step(this.inputSnapshot());
      this.fx.update(); // particles advance in sim time, freezing with it
      this.accumulator -= STEP_MS;
      steps++;
    }
    // spiral-of-death bail: if we can't keep up, drop the backlog
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;

    // music intensity = zone floor + Heat tier; silence when cold in the meadow
    music.setIntensity(
      sim.dead ? 0 : sim.director.zone.musicIntensity + sim.heatTier,
    );

    // feat tracking: peak heat, the Ember hold, crossing your best height
    this.peakHeat = Math.max(this.peakHeat, sim.player.heat);
    if (sim.heatTier === 3 && !sim.dead) {
      this.t3Ms += delta;
      if (this.t3Ms >= 10000 && storage.unlock('ember')) this.unlockToast('ember');
    } else {
      this.t3Ms = 0;
    }
    if (!this.newHeights && this.bestHeightAtStart > 200 && sim.camY > this.bestHeightAtStart) {
      this.newHeights = true;
      sfx.zoneUp();
      const p = sim.player;
      this.floatText('NEW HEIGHTS!', p.x + p.w / 2, p.y - 40);
    }

    if (sim.dead) {
      // linger on the frozen world (shake + flash) before the stats card
      if (!this.deathAt) this.deathAt = time + 700;
      if (time >= this.deathAt) {
        const bests = storage.recordRun({
          score: sim.score,
          height: Math.round(sim.camY),
          zone: sim.director.zoneIndex,
          seed: sim.seed,
          daily: this.daily,
          date: this.dateStr,
        });
        this.scene.start('GameOver', {
          score: sim.score,
          camY: sim.camY,
          blocksLen: sim.blocks.length,
          scoreCoins: sim.scoreCoins,
          scoreBonus: sim.scoreBonus,
          altitudePts: Math.round(sim.scoreFloat),
          blockRate: sim.blockRate,
          seed: sim.seed,
          deathCause: sim.deathCause,
          zoneIndex: sim.director.zoneIndex,
          peakHeat: this.peakHeat,
          daily: this.daily,
          bests,
        });
        return;
      }
    }

    this.renderWorld();
    this.renderHud();
  }

  inputSnapshot() {
    const inp = this.inp;
    return {
      up: inp.up,
      down: inp.down,
      left: inp.left,
      right: inp.right,
      ...inp.consumePressed(),
    };
  }

  // small rising label in world space; rare, so a throwaway Text is fine
  floatText(str, x, y) {
    const t = this.add
      .text(x, y, str, textStyle(13, {
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#2b5876',
        strokeThickness: 4,
      }))
      .setOrigin(0.5);
    this.worldContainer.add(t);
    this.tweens.add({
      targets: t,
      y: y - 34,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  renderWorld() {
    const sim = this.sim;
    const p = sim.player;
    const camY = sim.camY;
    const tX = -constrain(p.x - 400, -100, 100);
    const { ox, oy } = this.juice.offset();
    this.worldContainer.setPosition(tX + ox, camY + oy);
    this.juice.drawFlashes(this.flashGfx, 800, 500);

    this.bg.update(sim.frame, camY, sim.director.rateMul);

    const playerCx = p.x + p.w / 2;
    const blocks = sim.blocks.blocks;
    const windowLo = Math.max(0, blocks.length - BLOCK_UPDATE_WINDOW);

    // --- static layer: ground + fixed blocks, culled to the camera band ---
    // (the visible band is ~13 rows x ~13 columns, so this stays O(visible)
    // no matter how many total blocks exist)
    const sg = this.staticGfx;
    sg.clear();
    // grass-topped soil instead of the original's accidental black slab
    sg.fillGradientStyle(COLOR_SOIL_TOP, COLOR_SOIL_TOP, COLOR_SOIL_BOTTOM, COLOR_SOIL_BOTTOM, 1);
    sg.fillRect(GROUND.x, GROUND.y, GROUND.w, GROUND.h);
    sg.fillStyle(COLOR_GRASS);
    sg.fillRect(GROUND.x, GROUND.y, GROUND.w, 12);
    sg.fillStyle(COLOR_GRASS_DARK);
    sg.fillRect(GROUND.x, GROUND.y + 12, GROUND.w, 4);
    const layers = sim.blocks.layers;
    // layer L sits at y = 300 - 40L; visible when -camY-40 <= y < -camY+500
    // Blocks render as pooled sprites from the baked atlas — one batched
    // draw call for the whole stack, no per-frame vector tessellation.
    let spriteIdx = 0;
    const stamped = new Set(); // oversized blocks appear in several layers
    const stamp = (b) => {
      const img = this.getBlockSprite(spriteIdx++);
      img.setPosition(Math.round(b.x), b.y);
      img.setDisplaySize(b.w, b.h);
      const frame = frameNameFor(b);
      // don't let setFrame reset the display size (it's texture-res sized)
      if (img.frame.name !== frame) img.setFrame(frame, false, false);
      img.setTint(ZONES[b.zone].blockTint); // vertex color — effectively free
      img.setVisible(true);
    };
    const lMin = Math.max(1, Math.floor((camY - 200) / BLOCK_H) + 1);
    const lMax = Math.min(layers.length - 1, Math.floor((camY + 340) / BLOCK_H));
    for (let L = lMin; L <= lMax; L++) {
      const layer = layers[L];
      for (let j = 0; j < layer.length; j++) {
        const b = layer[j];
        // faithful culls: last-200 draw window + horizontal distance
        if (b.idx < windowLo) continue;
        if (Math.abs(b.x + b.w / 2 - playerCx) >= 800) continue;
        if (b.h > BLOCK_H) {
          if (stamped.has(b)) continue;
          stamped.add(b);
        }
        stamp(b);
      }
    }

    // --- dynamic layer: falling blocks, warning strips, player, powerups ---
    const dg = this.dynamicGfx;
    dg.clear();
    const pulse = (Math.sin(sim.frame * 0.25) + 1) / 2;
    for (const b of sim.blocks.falling) {
      if (b.idx < windowLo) continue;
      if (b.y >= -camY + 500) continue;
      if (Math.abs(b.x + b.w / 2 - playerCx) >= 800) continue;
      const gilded = b.type === 'gilded';
      if (b.y + camY < -b.h) {
        // whiteout hides the warnings — you dodge by ear
        if (!sim.director.fogged) {
          drawWarningStrip(dg, b, camY, pulse, gilded ? COLOR_GILDED : undefined);
        }
      } else {
        stamp(b);
        // sparkle trail so the jackpot reads from across the screen
        if (gilded && Math.random() < 0.25) {
          this.fx.burst(
            b.x + Math.random() * b.w,
            b.y + Math.random() * b.h,
            0xfff3b0,
            1,
          );
        }
      }
    }

    // crumble clouds: soft platforms; flicker as they give way
    for (const pl of sim.platforms) {
      let a = 0.85;
      if (pl.crumbleAt > 0) {
        const left = pl.crumbleAt - sim.frame;
        a = left < 30 && sim.frame % 8 < 4 ? 0.35 : 0.75;
      }
      dg.fillStyle(0xffffff, a);
      dg.fillRoundedRect(pl.x, pl.y, pl.w, pl.h, 10);
      dg.fillStyle(0xdcecf7, a * 0.7);
      dg.fillRoundedRect(pl.x + 6, pl.y + pl.h - 7, pl.w - 12, 5, 3);
    }

    // landed gilded blocks glow while they can still be spiked
    for (const b of sim.blocks.active) {
      if (b.type !== 'gilded' || !b.fixed) continue;
      const left = 1 - (sim.frame - b.fixedAtFrame) / 90;
      dg.lineStyle(3, COLOR_GILDED, 0.25 + 0.55 * pulse * left);
      dg.strokeRect(Math.round(b.x) - 2, b.y - 2, b.w + 4, b.h + 4);
    }
    for (let i = spriteIdx; i < this.blockSprites.length; i++) {
      this.blockSprites[i].setVisible(false);
    }

    // phased blocks flash to a white silhouette for a few frames
    for (let i = 0; i < this.blockFlashes.length; i++) {
      const f = this.blockFlashes[i];
      dg.fillStyle(0xffffff, 0.25 * f.life);
      dg.fillRect(Math.round(f.block.x), f.block.y, f.block.w, f.block.h);
      if (--f.life <= 0) this.blockFlashes.splice(i--, 1);
    }

    // surf telegraph: faint outline where the ridden block will come to rest
    if (sim.surfBlock) {
      const sb = sim.surfBlock;
      const layers2 = sim.blocks.layers;
      let restL = 1;
      for (let L = layers2.length - 1; L >= 1; L--) {
        const rowY = GROUND.y - BLOCK_H * L;
        if (rowY <= sb.y) continue; // only rows below the block
        let hit = false;
        for (const o of layers2[L]) {
          if (o.x + o.w > sb.x && sb.x + sb.w > o.x) {
            hit = true;
            break;
          }
        }
        if (hit) {
          restL = L + 1;
          break;
        }
      }
      const ry = GROUND.y - BLOCK_H * restL;
      if (ry > sb.y) {
        dg.lineStyle(2, 0xffffff, 0.35);
        dg.strokeRect(Math.round(sb.x) + 1, ry + 1, sb.w - 2, sb.h - 2);
      }
    }

    // dash afterimages / crest-jump gold streak
    const dashing = p.dashTimer > 0;
    const streaking = sim.frame < this.streakUntil;
    if (dashing || streaking) {
      this.afterimages.push({
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        life: 12,
        maxLife: 12,
        color: streaking ? 0xffd700 : p.heat >= HEAT_T2 ? 0xffb347 : 0xffffff,
      });
      if (this.afterimages.length > 24) this.afterimages.shift();
    }
    for (let i = 0; i < this.afterimages.length; i++) {
      const g = this.afterimages[i];
      dg.fillStyle(g.color, 0.3 * (g.life / g.maxLife));
      dg.fillRoundedRect(g.x, g.y, g.w, g.h, g.w / 6);
      if (--g.life <= 0) this.afterimages.splice(i--, 1);
    }

    // ghost line: your best altitude, shimmering in the world ahead
    const best = this.bestHeightAtStart;
    if (best > 200) {
      const gy = -best + 270; // world y the camera top reaches at camY=best+
      if (gy + camY > -20 && gy + camY < 520) {
        const shimmer = 0.35 + 0.3 * Math.sin(sim.frame * 0.1);
        dg.lineStyle(2, 0xffe9a0, shimmer);
        for (let x = -100; x < 900; x += 34) {
          dg.lineBetween(x, gy, x + 18, gy);
        }
        if (!this.ghostLabel) {
          this.ghostLabel = this.add
            .text(0, 0, `YOUR BEST · ${best}`, textStyle(12, {
              color: '#ffe9a0',
              fontStyle: 'bold',
            }))
            .setOrigin(0, 1)
            .setAlpha(0.8);
          this.worldContainer.add(this.ghostLabel);
        }
        this.ghostLabel.setPosition(12 - tX, gy - 4).setVisible(true);
      } else if (this.ghostLabel) {
        this.ghostLabel.setVisible(false);
      }
    }

    drawPlayer(dg, p, sim.frame, {
      body: this.palette.body,
      border: this.palette.border,
      mouth: this.palette.id === 'classic' ? undefined : this.palette.border,
    });

    // crest window: a contracting golden ring — a literal timing dial
    if (sim.crestWindow > 0) {
      const k = sim.crestWindow / CREST_WINDOW;
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      dg.lineStyle(3, 0xffd700, 0.4 + 0.5 * k);
      dg.strokeEllipse(cx, cy, 30 + 60 * k, 30 + 60 * k);
    }

    // Spark motes orbit the player — the ammo lives on the character
    for (let i = 0; i < p.sparks; i++) {
      const a = sim.frame * 0.12 + (i * Math.PI * 2) / Math.max(1, p.sparks);
      const mx = p.x + p.w / 2 + Math.cos(a) * 26;
      const my = p.y + p.h / 2 + Math.sin(a) * 18;
      dg.fillStyle(0xfff3b0, 0.35);
      dg.fillCircle(mx, my, 5);
      dg.fillStyle(0xffd700, 0.95);
      dg.fillCircle(mx, my, 2.5);
    }

    let textIdx = 0;
    for (const pw of sim.powerups) {
      if (pw.visible) drawPowerup(dg, pw);
      const label = POWERUP_LABEL[pw.type];
      if (label) {
        // invisible (blinking) powerups keep their pool slot so labels don't
        // shuffle between Text objects — setText re-rasterizes the texture
        const t = this.getWorldText(textIdx++);
        if (t.text !== label.text) {
          t.setFontSize(label.size);
          t.setText(label.text);
        }
        t.setPosition(pw.x + pw.w / 2, pw.y + pw.h / 2);
        t.setVisible(pw.visible);
      }
    }
    for (let i = textIdx; i < this.worldTextPool.length; i++) {
      this.worldTextPool[i].setVisible(false);
    }

    this.fx.draw(dg);
    this.drawEventFx(dg, camY);
  }

  // world- and screen-space visuals for director events: telegraphs
  // (shadow, chevron, vignette, shimmer, fog) and live props (meteor,
  // shockwave). Screen-space bits append to flashGfx AFTER juice cleared it.
  drawEventFx(dg, camY) {
    const sim = this.sim;
    const dir = sim.director;
    const fg = this.flashGfx;
    const pending = dir.pendingEvent?.spec.id;
    const active = dir.activeEvent?.spec.id;
    const pulse = (Math.sin(sim.frame * 0.3) + 1) / 2;

    if (pending === 'monolith') {
      // looming shadow over the drop zone
      fg.fillStyle(0x000000, 0.12 + 0.12 * pulse);
      fg.fillRect(dir.eventData.x, 0, 180, 500);
    }
    if (pending === 'meteor') {
      const side = dir.eventData.side; // 1 = from the left
      const x = side > 0 ? 16 : 784;
      fg.fillStyle(0xff5533, 0.35 + 0.55 * pulse);
      fg.fillTriangle(x, 60, x, 100, x + 24 * side, 80);
      fg.fillTriangle(x + 20 * side, 60, x + 20 * side, 100, x + 44 * side, 80);
    }
    if (pending === 'storm') {
      // red vignette pulse
      fg.fillStyle(0xff2222, 0.1 + 0.1 * pulse);
      fg.fillRect(0, 0, 800, 10);
      fg.fillRect(0, 490, 800, 10);
      fg.fillRect(0, 0, 10, 500);
      fg.fillRect(790, 0, 10, 500);
    }
    if (pending === 'goldrush' && Math.random() < 0.4) {
      this.fx.burst(Math.random() * 800 - this.worldContainer.x, -camY + Math.random() * 120, COLOR_GILDED, 1);
    }

    // whiteout fog: ramps in during the telegraph, solid while active
    let fog = 0;
    if (pending === 'whiteout') {
      fog = 0.75 * (1 - dir.pendingEvent.telegraphLeft / dir.pendingEvent.spec.telegraph);
    } else if (active === 'whiteout') {
      fog = 0.85;
    }
    if (fog > 0) {
      fg.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, fog, fog, 0, 0);
      fg.fillRect(0, 0, 800, 240);
    }

    if (active === 'gust' && dir.wind) {
      // horizontal wind streaks
      fg.lineStyle(1.5, 0xffffff, 0.25);
      for (let i = 0; i < 8; i++) {
        const y = ((sim.frame * 3 + i * 67) % 500);
        const x = ((sim.frame * 11 * Math.sign(dir.wind) + i * 131) % 900 + 900) % 900 - 50;
        fg.lineBetween(x, y, x - 40 * Math.sign(dir.wind), y);
      }
    }

    // live meteor + shockwave (world space)
    const meteor = dir.eventData.meteor;
    if (active === 'meteor' && meteor) {
      const cx = meteor.x + meteor.w / 2;
      const cy = meteor.y + meteor.h / 2;
      dg.fillStyle(0xff7043, 0.4);
      dg.fillCircle(cx - meteor.vx * 2, cy - meteor.vy * 2, 16);
      dg.fillStyle(0xff5533, 1);
      dg.fillCircle(cx, cy, 20);
      dg.fillStyle(0xffd180, 1);
      dg.fillCircle(cx, cy, 12);
      if (Math.random() < 0.6) this.fx.dust(cx - meteor.vx * 2, cy, 2, 0xff8a65);
    }
    const wave = dir.eventData.wave;
    if (active === 'meteor' && wave) {
      const r = (wave.t / 30) * 110;
      dg.lineStyle(4, 0xffab40, 0.8 * (1 - wave.t / 30));
      dg.strokeEllipse(wave.x, wave.y, r * 2, r * 0.9);
    }
  }

  getBlockSprite(i) {
    while (this.blockSprites.length <= i) {
      const img = this.make.image({ key: BLOCK_TEX, frame: 'wood/0', add: false });
      img.setOrigin(0, 0).setDisplaySize(BLOCK_W, BLOCK_H).setVisible(false);
      this.blockLayer.add(img);
      this.blockSprites.push(img);
    }
    return this.blockSprites[i];
  }

  getWorldText(i) {
    while (this.worldTextPool.length <= i) {
      const t = this.add
        .text(0, 0, '', textStyle(10, { color: '#ffffff', fontStyle: 'bold' }))
        .setOrigin(0.5)
        .setVisible(false);
      this.worldContainer.add(t);
      this.worldTextPool.push(t);
    }
    return this.worldTextPool[i];
  }

  renderHud() {
    const sim = this.sim;
    const p = sim.player;
    const blink = sim.frame % 16 < 8;
    const timers = { I: p.shieldTimer, H: p.hTimer, D: p.dTimer, V: p.vTimer };

    const hg = this.hudGfx;
    hg.clear();
    for (const icon of HUD_ICONS) {
      const t = timers[icon.type];
      const show = t > HUD_FLASH_AT || (t > 0 && t < HUD_FLASH_AT && blink);
      if (show) {
        drawPowerup(hg, {
          type: icon.type,
          x: icon.x,
          y: HUD_ICON_Y,
          w: HUD_ICON_SIZE,
          h: HUD_ICON_SIZE,
        });
        // time-remaining bar under the icon
        const frac = Math.min(1, t / POWERUP_TIMER_ADD);
        hg.fillStyle(0x000000, 0.25);
        hg.fillRect(icon.x, HUD_ICON_Y + HUD_ICON_SIZE + 3, HUD_ICON_SIZE, 3);
        hg.fillStyle(0xffffff, 0.9);
        hg.fillRect(icon.x, HUD_ICON_Y + HUD_ICON_SIZE + 3, HUD_ICON_SIZE * frac, 3);
      }
      const label = this.hudIconTexts[icon.type];
      if (label) label.setVisible(show);
    }

    // Heat: 8 ember pips top-center; color climbs white -> orange -> gold
    {
      const pipW = 14;
      const gap = 4;
      const total = HEAT_MAX * pipW + (HEAT_MAX - 1) * gap;
      const x0 = 400 - total / 2;
      const y0 = 12;
      const heat = p.heat;
      const color =
        heat >= HEAT_MAX ? 0xffd700 : heat >= HEAT_T2 ? 0xff9f1c : heat >= HEAT_T1 ? 0xffc16b : 0xffffff;
      for (let i = 0; i < HEAT_MAX; i++) {
        const x = x0 + i * (pipW + gap);
        hg.fillStyle(0x000000, 0.18);
        hg.fillRect(x, y0, pipW, 7);
        if (i < heat) {
          hg.fillStyle(color, 0.95);
          hg.fillRect(x, y0, pipW, 7);
        }
      }
      // multiplier tag under the bar when hot
      if (sim.heatMult > 1) {
        hg.fillStyle(color, 0.9);
        hg.fillRect(400 - 14, y0 + 11, 28, 3);
      }
    }

    this.setHudRow(this.scoreRow, String(sim.score));
    this.setHudRow(this.rateRow, sim.blockRate.toFixed(1));
    // sample the FPS readout a few times per second — updating it every
    // frame is noise, and doing so exactly when FPS is unstable is worst
    if (sim.frame % 15 === 0 || this.fpsRow.value.text === '') {
      this.setHudRow(this.fpsRow, String(Math.round(this.game.loop.actualFps)));
    }
  }

  // digit quads update + static label slides to stay left of the number;
  // both are transform-only — no rasterization
  setHudRow(row, str) {
    if (row.value.text !== str) {
      row.value.setText(str);
      row.label.x = 790 - row.value.displayWidth - 8;
    }
  }
}
