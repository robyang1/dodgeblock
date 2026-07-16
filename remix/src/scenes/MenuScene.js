import Phaser from 'phaser';
import { COLOR_BG_GAME } from '../constants.js';
import { setupCamera, textStyle } from '../utils.js';
import { drawSkyGradient, drawCloud } from '../render/fx.js';
import { drawBlock } from '../render/blockArt.js';
import { drawPlayer } from '../render/playerArt.js';
import { sfx } from '../audio.js';
import { isMobile } from '../input.js';
import { ZONES } from '../zones.js';
import { storage } from '../storage.js';
import { PALETTES, isUnlocked, paletteById } from '../palettes.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    setupCamera(this, COLOR_BG_GAME);
    this.daily = false;

    const g = this.add.graphics();
    drawSkyGradient(g, 0x2f3d55, 0x9fc4e8); // stormier than the classic menu
    drawCloud(g, 140, 60, 1.1, 0.5);
    drawCloud(g, 620, 100, 0.8, 0.5);
    drawCloud(g, 400, 40, 0.6, 0.35);

    // decorative falling blocks with rain streaks
    g.lineStyle(3, 0xffffff, 0.5);
    for (const x of [40, 720]) g.lineBetween(x, 50, x, 90);
    for (const x of [60, 740]) g.lineBetween(x, 40, x, 90);
    for (const x of [80, 760]) g.lineBetween(x, 50, x, 90);
    drawBlock(g, { x: 30, y: 100, w: 60, h: 40, shade: 0 });
    drawBlock(g, { x: 710, y: 100, w: 60, h: 40, shade: 2 });

    this.add
      .text(400, 128, 'BLOCKSTORM', textStyle(76, {
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#1c2733',
        strokeThickness: 10,
      }))
      .setOrigin(0.5)
      .setShadow(0, 5, 'rgba(0,0,0,0.35)', 6);
    this.add
      .text(400, 178, 'a DodgeBlock remix', textStyle(18, { color: '#dce8f2' }))
      .setOrigin(0.5)
      .setAlpha(0.85);

    const isTouch = isMobile(this);
    const start = this.add
      .text(400, 246, isTouch ? 'Tap to start' : 'Click to start', textStyle(32, {
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#1c2733',
        strokeThickness: 6,
      }))
      .setOrigin(0.5);
    this.tweens.add({
      targets: start,
      alpha: 0.35,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // --- zone ladder: how high have you been? ---
    const ladderX = 736;
    this.add
      .text(ladderX + 24, 178, 'THE CLIMB', textStyle(11, { color: '#dce8f2', fontStyle: 'bold' }))
      .setOrigin(0.5)
      .setAlpha(0.7);
    const best = storage.data.bestHeight;
    for (let i = 0; i < ZONES.length; i++) {
      const z = ZONES[i];
      const y = 370 - i * 38;
      const reached = best >= z.threshold || i === 0;
      const lg = this.add.graphics();
      lg.fillStyle(0x000000, 0.25);
      lg.fillRoundedRect(ladderX + 2, y + 2, 46, 30, 6);
      lg.fillStyle(reached ? z.skyTop : 0x1a222c, 1);
      lg.fillRoundedRect(ladderX, y, 46, 30, 6);
      lg.lineStyle(1.5, 0xffffff, reached ? 0.5 : 0.15);
      lg.strokeRoundedRect(ladderX, y, 46, 30, 6);
      this.add
        .text(ladderX + 23, y + 15, reached ? z.name[0] + z.name.slice(1).toLowerCase() : '?', textStyle(reached ? 8 : 14, {
          color: '#ffffff',
          fontStyle: 'bold',
        }))
        .setOrigin(0.5)
        .setAlpha(reached ? 0.9 : 0.4);
    }
    if (best > 0) {
      this.add
        .text(ladderX + 24, 396, `best ${best}`, textStyle(11, { color: '#ffe9a0' }))
        .setOrigin(0.5);
    }

    // --- palette picker ---
    this.paletteIdx = Math.max(
      0,
      PALETTES.findIndex((p) => p.id === storage.data.settings.palette),
    );
    this.previewGfx = this.add.graphics();
    this.paletteLabel = this.add
      .text(400, 366, '', textStyle(15, { color: '#ffffff', fontStyle: 'bold' }))
      .setOrigin(0.5);
    this.paletteHint = this.add
      .text(400, 388, '', textStyle(11, { color: '#b9c6d4' }))
      .setOrigin(0.5);
    this.drawPalette();
    this.input.keyboard.on('keydown-LEFT', () => this.cyclePalette(-1));
    this.input.keyboard.on('keydown-RIGHT', () => this.cyclePalette(1));

    // --- daily toggle ---
    const today = new Date().toISOString().slice(0, 10);
    const dailyBest = storage.data.dailyBest[today];
    this.dailyLabel = this.add
      .text(400, 300, '', textStyle(15, { color: '#ffe9a0', fontStyle: 'bold' }))
      .setOrigin(0.5);
    const setDailyText = () => {
      this.dailyLabel.setText(
        this.daily
          ? `DAILY CLIMB · ${today}${dailyBest ? ` · best ${dailyBest}` : ''}  (D to toggle)`
          : isTouch
            ? ''
            : 'D for the Daily Climb — same storm for everyone',
      );
      this.dailyLabel.setAlpha(this.daily ? 1 : 0.55);
    };
    setDailyText();
    this.input.keyboard.on('keydown-D', () => {
      this.daily = !this.daily;
      sfx.init();
      sfx.uiClick();
      setDailyText();
    });

    this.add
      .text(
        400,
        432,
        isTouch
          ? 'Hold the bottom corners to move, tap the top to jump.\nSwipe sideways to dash, swipe down to spike. Graze blocks to earn sparks.'
          : 'Arrows/WASD to move & jump  ·  Shift or X to DASH (costs a spark)\nDown+dash in the air to SPIKE DROP  ·  Graze falling blocks to earn sparks & Heat',
        textStyle(15, { color: '#dce8f2', align: 'center' }),
      )
      .setOrigin(0.5)
      .setAlpha(0.9);
    this.add
      .text(400, 476, 'Ride a falling block down… jump the instant it lands.  ·  M to mute', textStyle(12, { color: '#b9c6d4' }))
      .setOrigin(0.5)
      .setAlpha(0.7);

    this.input.once('pointerdown', () => {
      // first user gesture: the browser lets us create the AudioContext here
      sfx.init();
      sfx.uiClick();
      this.scene.start('Game', { daily: this.daily });
    });
  }

  cyclePalette(dir) {
    const n = PALETTES.length;
    this.paletteIdx = (this.paletteIdx + dir + n) % n;
    sfx.uiClick();
    const p = PALETTES[this.paletteIdx];
    if (isUnlocked(storage, p.id)) storage.setPalette(p.id);
    this.drawPalette();
  }

  drawPalette() {
    const p = PALETTES[this.paletteIdx];
    const unlocked = isUnlocked(storage, p.id);
    const gfx = this.previewGfx;
    gfx.clear();
    const fake = {
      x: 385,
      y: 318,
      w: 30,
      h: 30,
      xVel: 0,
      yVel: 0,
      offGround: 0,
      landSquash: 0,
      shieldTimer: 0,
      heat: 0,
      dashTimer: 0,
      spiking: false,
      spikeWindup: 0,
    };
    if (unlocked) {
      drawPlayer(gfx, fake, 0, { body: p.body, border: p.border, mouth: p.id === 'classic' ? undefined : p.border });
    } else {
      drawPlayer(gfx, fake, 0, { body: 0x39434e, border: 0x232a32, ghost: true, alpha: 0.8 });
      gfx.lineStyle(2, 0xffffff, 0.5);
      gfx.strokeCircle(400, 333, 6);
      gfx.fillStyle(0xffffff, 0.5);
      gfx.fillRect(397, 333, 6, 7);
    }
    const active = storage.data.settings.palette === p.id;
    this.paletteLabel.setText(`◀  ${p.name}${active ? '  ✓' : ''}  ▶`);
    this.paletteHint.setText(unlocked ? (active ? '' : '') : p.hint ?? '');
  }
}
