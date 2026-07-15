import Phaser from 'phaser';
import {
  STEP_MS,
  MAX_STEPS_PER_FRAME,
  GRAVITY,
  DOWN_BOOST,
  HMOV,
  HMOV_BOOSTED,
  GROUND,
  BLOCK_H,
  BLOCK_UPDATE_WINDOW,
  BLOCK_COLLIDE_WINDOW,
  SQUISH_VEL,
  SPAWN_MIN_X,
  SPAWN_MAX_X,
  POWERUP_LIFETIME,
  POWERUP_FLASH_AT,
  HUD_FLASH_AT,
  POWERUP_TIMER_ADD,
  VSPEED_TIMER_ADD,
  POWERUP_TIMER_CAP,
  POWERUP_CYCLE,
  COLOR_BG_GAME,
  COLOR_SKY_TOP,
  COLOR_SKY_BOTTOM,
  COLOR_GRASS,
  COLOR_GRASS_DARK,
  COLOR_SOIL_TOP,
  COLOR_SOIL_BOTTOM,
  POWERUP_COLORS,
} from '../constants.js';
import { rectrect, constrain, randomInt, setupCamera, textStyle } from '../utils.js';
import { createInput } from '../input.js';
import { Player } from '../player.js';
import { BlockManager, drawBlock, drawWarningStrip } from '../blocks.js';
import {
  Powerup,
  drawPowerup,
  POWERUP_LABEL,
  POWERUP_PICKUP_TEXT,
} from '../powerups.js';
import { ParticleFx, drawSkyGradient, makeClouds, drawClouds } from '../fx.js';
import { sfx } from '../audio.js';

// Dev stress test: ?stress forces a block every 2 sim steps
const STRESS =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('stress');

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

  create() {
    setupCamera(this, COLOR_BG_GAME);
    this.inp = createInput(this);

    // --- sim state (mirrors the original's globals) ---
    this.player = new Player();
    this.blocksMgr = new BlockManager();
    this.powerups = [];
    this.camY = 0;
    this.elapsedFrames = 0; // the original's frameCount - frameDiff
    this.jKeyLetGo = 455;
    this.pwrCounter = 0;
    this.scoreCoins = 0;
    this.score = 0;
    this.framesPerBlock = 120;
    this.accumulator = 0;
    this.dead = false;

    // --- render-only state ---
    this.fx = new ParticleFx();
    this.clouds = makeClouds(5);
    this.blocksMgr.onFix = (b) => {
      this.fx.dust(b.x + b.w / 2, b.y + b.h, 7, 0xcbb391);
      // only audible when the landing is on screen
      const p = this.player;
      if (
        b.y > -this.camY - b.h &&
        b.y < -this.camY + 500 &&
        Math.abs(b.x + b.w / 2 - (p.x + p.w / 2)) < 800
      ) {
        sfx.blockLand();
      }
    };

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
    const sky = this.add.graphics();
    drawSkyGradient(sky, COLOR_SKY_TOP, COLOR_SKY_BOTTOM);
    this.cloudGfx = this.add.graphics();

    // --- world rendering: container translated by (tX, camY) each frame,
    // exactly like the original's translate() ---
    this.worldContainer = this.add.container(0, 0);
    this.staticGfx = this.add.graphics(); // ground + fixed blocks
    this.dynamicGfx = this.add.graphics(); // falling blocks, player, powerups
    this.worldContainer.add([this.staticGfx, this.dynamicGfx]);
    this.worldTextPool = [];

    // --- HUD (screen space) ---
    this.hudGfx = this.add.graphics();
    const hudStyle = textStyle(25, {
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#2b5876',
      strokeThickness: 5,
    });
    this.scoreText = this.add.text(790, 16, '', hudStyle).setOrigin(1, 0.5);
    this.fpbText = this.add.text(790, 44, '', hudStyle).setOrigin(1, 0.5);
    this.fpsText = this.add.text(790, 71, '', hudStyle).setOrigin(1, 0.5);
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
  }

  update(time, delta) {
    // Fixed 60Hz timestep: game speed no longer depends on render rate.
    // Clamp huge deltas (tab switch) so we don't fast-forward on return.
    this.accumulator += Math.min(delta, 250);
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME && !this.dead) {
      this.simStep();
      this.accumulator -= STEP_MS;
      steps++;
    }
    // spiral-of-death bail: if we can't keep up, drop the backlog
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;

    if (this.dead) {
      sfx.death();
      this.scene.start('GameOver', {
        score: this.score,
        camY: this.camY,
        blocksLen: this.blocksMgr.length,
        scoreCoins: this.scoreCoins,
        framesPerBlock: this.framesPerBlock,
      });
      return;
    }

    this.renderWorld();
    this.renderHud();
  }

  // One frame of original game logic — order matches classic/script.js:435-696
  simStep() {
    this.elapsedFrames++;
    const p = this.player;
    const wasAirborne = p.offGround; // for the landing-dust effect

    this.framesPerBlock = Math.round(12000000 / (this.elapsedFrames * 350 + 100000));
    if (STRESS) this.framesPerBlock = Math.min(this.framesPerBlock, 2);
    p.hMov = p.hTimer > 0 ? HMOV_BOOSTED : HMOV;

    // input (jKeyLetGo === 1 marks a fresh jump-key press, for double jumps)
    this.jKeyLetGo++;
    const preJumpTSJ = p.timeSinceJump;
    if (this.inp.up) {
      p.jump(this.jKeyLetGo);
      if (p.timeSinceJump === 0 && preJumpTSJ !== 0) sfx.jump();
    } else {
      this.jKeyLetGo = 0;
    }
    if (this.inp.left) p.walk(-p.hMov);
    if (this.inp.right) p.walk(p.hMov);
    if (this.inp.down && p.vTimer > 0) p.yVel -= DOWN_BOOST;

    // spawn a block (and maybe a powerup) on the cadence
    if (this.elapsedFrames % this.framesPerBlock === 0) {
      this.blocksMgr.spawn(this.camY, this.framesPerBlock);
      const spawnX = () => randomInt(SPAWN_MIN_X, SPAWN_MAX_X);
      const spawnY = -this.camY - 40;
      switch (this.pwrCounter % POWERUP_CYCLE) {
        case 6:
          this.powerups.push(new Powerup('I', spawnX(), spawnY));
          break;
        case 13:
          this.powerups.push(new Powerup('H', spawnX(), spawnY));
          break;
        case 20:
          this.powerups.push(new Powerup('D', spawnX(), spawnY));
          break;
        case 27:
          this.powerups.push(new Powerup('V', spawnX(), spawnY));
          break;
        case 34:
          this.powerups.push(new Powerup('S', spawnX(), spawnY));
          break;
      }
      this.pwrCounter++;
    }

    this.blocksMgr.update();

    // three player-vs-block passes, faithfully order-dependent:
    // pass A resolves blocks that moved into the player (also resets jumps)
    this.landSquishPass(0);
    p.shieldTimer--;
    p.hTimer--;
    p.vTimer--;
    p.dTimer--;
    p.updateX();
    this.wallPass();
    p.updateY(this.inp.up);
    if (rectrect(p, GROUND)) {
      p.y = GROUND.y - p.h;
      p.yVel = 0;
      p.offGround = 0;
    }
    // pass C: same as A but lands with an extra -0.1 offset (the original's
    // second landing snap at classic/script.js:579)
    this.landSquishPass(-0.1);

    // landing feedback (render-only)
    if (p.landSquash > 0) p.landSquash--;
    if (p.offGround === 0 && wasAirborne > 4) {
      p.landSquash = 8;
      this.fx.dust(p.x + p.w / 2, p.y + p.h, 6);
      sfx.land();
    }

    this.updatePowerups();
    this.fx.update();

    p.offGround++;
    p.timeSinceJump++;

    // camera: slow constant rise, plus snapping up when the player is high
    this.camY += 2 / this.framesPerBlock;
    if (p.y + this.camY < 150 && -p.y + 150 > this.camY) {
      this.camY = -p.y + 150;
    }

    this.score = Math.round(this.camY) + this.blocksMgr.length + this.scoreCoins;
    if (p.y > -this.camY + 500) this.dead = true;
  }

  // land on top / get squished / pushed out from under a ceiling
  landSquishPass(landOffset) {
    const p = this.player;
    const blocks = this.blocksMgr.blocks;
    for (let i = Math.max(0, blocks.length - BLOCK_COLLIDE_WINDOW); i < blocks.length; i++) {
      const b = blocks[i];
      if (rectrect(p, b)) {
        if (p.y < b.y) {
          p.y = b.y - p.h + landOffset;
          p.yVel = 0;
          p.offGround = 0;
          p.jumps = 0;
        } else if (b.yVel > SQUISH_VEL) {
          if (p.shieldTimer > 0) {
            this.fx.burst(b.x + b.w / 2, b.y + b.h / 2, POWERUP_COLORS.I, 12);
            sfx.shieldPop();
            this.blocksMgr.remove(b);
            i--;
            continue;
          }
          this.dead = true;
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
    const blocks = this.blocksMgr.blocks;
    for (let i = Math.max(0, blocks.length - BLOCK_COLLIDE_WINDOW); i < blocks.length; i++) {
      if (rectrect(p, blocks[i])) {
        p.xVel = 0;
        p.x = p.originalPos;
      }
    }
  }

  updatePowerups() {
    const p = this.player;
    const blocks = this.blocksMgr.blocks;
    for (let i = 0; i < this.powerups.length; i++) {
      const pw = this.powerups[i];
      pw.yVel += GRAVITY;
      pw.y += pw.yVel;
      if (rectrect(pw, GROUND)) {
        pw.yVel = 0;
        pw.y = GROUND.y - pw.h;
      }
      // faithful: checks every block, in array order
      for (let j = 0; j < blocks.length; j++) {
        if (rectrect(pw, blocks[j])) {
          pw.yVel = 0;
          pw.y = blocks[j].y - pw.h;
        }
      }
      // flash when about to despawn
      pw.visible = pw.timer < POWERUP_FLASH_AT || this.elapsedFrames % 16 < 8;
      if (rectrect(pw, p)) {
        switch (pw.type) {
          case 'I':
            p.shieldTimer = constrain(p.shieldTimer, 0, POWERUP_TIMER_CAP) + POWERUP_TIMER_ADD;
            break;
          case 'H':
            p.hTimer = constrain(p.hTimer, 0, POWERUP_TIMER_CAP) + POWERUP_TIMER_ADD;
            break;
          case 'D':
            p.dTimer = constrain(p.dTimer, 0, POWERUP_TIMER_CAP) + POWERUP_TIMER_ADD;
            break;
          case 'V':
            p.vTimer = constrain(p.vTimer, 0, POWERUP_TIMER_CAP) + VSPEED_TIMER_ADD;
            break;
          case 'S':
            this.scoreCoins += 200;
            break;
        }
        // pickup feedback (render-only)
        this.fx.burst(pw.x + pw.w / 2, pw.y + pw.h / 2, POWERUP_COLORS[pw.type]);
        this.floatText(POWERUP_PICKUP_TEXT[pw.type], p.x + p.w / 2, p.y - 8);
        if (pw.type === 'S') sfx.coin();
        else sfx.pickup();
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
    const p = this.player;
    const camY = this.camY;
    const tX = -constrain(p.x - 400, -100, 100);
    this.worldContainer.setPosition(tX, camY);

    drawClouds(this.cloudGfx, this.clouds, this.elapsedFrames, camY);

    const playerCx = p.x + p.w / 2;
    const blocks = this.blocksMgr.blocks;
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
    const layers = this.blocksMgr.layers;
    // layer L sits at y = 300 - 40L; visible when -camY-40 <= y < -camY+500
    const lMin = Math.max(1, Math.floor((camY - 200) / BLOCK_H) + 1);
    const lMax = Math.min(layers.length - 1, Math.floor((camY + 340) / BLOCK_H));
    for (let L = lMin; L <= lMax; L++) {
      const layer = layers[L];
      for (let j = 0; j < layer.length; j++) {
        const b = layer[j];
        // faithful culls: last-200 draw window + horizontal distance
        if (b.idx < windowLo) continue;
        if (Math.abs(b.x + b.w / 2 - playerCx) >= 800) continue;
        drawBlock(sg, b);
      }
    }

    // --- dynamic layer: falling blocks, warning strips, player, powerups ---
    const dg = this.dynamicGfx;
    dg.clear();
    const pulse = (Math.sin(this.elapsedFrames * 0.25) + 1) / 2;
    for (const b of this.blocksMgr.falling) {
      if (b.idx < windowLo) continue;
      if (b.y >= -camY + 500) continue;
      if (Math.abs(b.x + b.w / 2 - playerCx) >= 800) continue;
      if (b.y + camY < -b.h) {
        drawWarningStrip(dg, b, camY, pulse);
      } else {
        drawBlock(dg, b);
      }
    }
    p.draw(dg, this.elapsedFrames);

    let textIdx = 0;
    for (const pw of this.powerups) {
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
    const p = this.player;
    const blink = this.elapsedFrames % 16 < 8;
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

    this.setTextIfChanged(this.scoreText, 'Score: ' + this.score);
    this.setTextIfChanged(this.fpbText, 'Frames Per Block: ' + this.framesPerBlock);
    this.setTextIfChanged(this.fpsText, 'FPS: ' + Math.round(this.game.loop.actualFps));
  }

  setTextIfChanged(obj, str) {
    if (obj.text !== str) obj.setText(str);
  }
}
