import Phaser from 'phaser';
import { COLOR_PLAYER } from '../constants.js';
import { setupCamera, textStyle } from '../utils.js';
import { drawSkyGradient } from '../render/fx.js';
import { sfx } from '../audio.js';
import { isMobile } from '../input.js';
import { ZONES } from '../zones.js';
import { storage } from '../storage.js';
import { nextHint } from '../palettes.js';

// deaths become stories
const FLAVOR = {
  squished: 'Flattened by a falling block.',
  fell: 'Lost to the depths below.',
  monolith: 'Crushed beneath the Monolith.',
  meteor: 'Obliterated by a meteor.',
  shockwave: 'Caught flat-footed by the shockwave.',
};

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    // NOT this.data — that's Phaser's built-in DataManager
    this.stats = data;
  }

  create() {
    const s = this.stats;
    const zone = ZONES[s.zoneIndex ?? 0];
    // the sky is the zone you died in — instant "how far did I get"
    setupCamera(this, zone.skyTop);

    const g = this.add.graphics();
    drawSkyGradient(g, zone.skyTop, zone.skyBottom);
    // stats card with a soft shadow
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(106, 68, 600, 340, 16);
    g.fillStyle(0xffffff, 0.94);
    g.fillRoundedRect(100, 60, 600, 340, 16);

    this.add
      .text(400, 100, s.daily ? 'Daily Climb Over' : 'Game Over', textStyle(38, { color: '#223447', fontStyle: 'bold' }))
      .setOrigin(0.5);
    this.add
      .text(400, 152, 'Score: ' + s.score, textStyle(34, {
        color: Phaser.Display.Color.IntegerToColor(COLOR_PLAYER).rgba,
        fontStyle: 'bold',
      }))
      .setOrigin(0.5);

    const badges = [];
    if (s.bests?.newBestScore) badges.push('NEW BEST SCORE!');
    if (s.bests?.newDailyBest) badges.push('DAILY BEST!');
    else if (s.bests?.newBestHeight) badges.push('NEW HEIGHTS!');
    if (badges.length) {
      const b = this.add
        .text(400, 184, badges.join('   '), textStyle(17, { color: '#b8860b', fontStyle: 'bold' }))
        .setOrigin(0.5);
      this.tweens.add({ targets: b, alpha: 0.4, duration: 500, yoyo: true, repeat: -1 });
    }

    g.lineStyle(2, 0x223447, 0.15);
    g.lineBetween(140, 200, 660, 200);

    const stat = (x, y, label, value, w = 250) => {
      this.add.text(x, y, label, textStyle(18, { color: '#5a6c80' })).setOrigin(0, 0.5);
      this.add
        .text(x + w, y, String(value), textStyle(18, { color: '#223447', fontStyle: 'bold' }))
        .setOrigin(1, 0.5);
    };
    stat(145, 226, 'Altitude income', s.altitudePts ?? 0);
    stat(145, 258, 'Coins', s.scoreCoins);
    stat(145, 290, 'Bonuses & feats', s.scoreBonus ?? 0);
    stat(145, 322, 'Blocks survived', s.blocksLen);
    stat(430, 226, 'Zone reached', zone.name, 225);
    stat(430, 258, 'Peak Heat', `${s.peakHeat ?? 0} / 8`, 225);
    stat(430, 290, 'Best score', storage.data.bestScore, 225);
    stat(430, 322, 'Best height', storage.data.bestHeight, 225);

    this.add
      .text(400, 356, FLAVOR[s.deathCause] ?? 'The storm won this time.', textStyle(16, {
        color: '#5a6c80',
        fontStyle: 'italic',
      }))
      .setOrigin(0.5);

    const hint = nextHint(storage);
    if (hint) {
      this.add
        .text(400, 384, hint, textStyle(14, { color: '#8a6d1a' }))
        .setOrigin(0.5);
    }

    this.add
      .text(695, 392, `seed ${s.seed}`, textStyle(10, { color: '#9fb2c2' }))
      .setOrigin(1, 0.5);

    const isTouch = isMobile(this);
    const again = this.add
      .text(400, 445, isTouch ? 'Tap to play again' : 'Click or press R to play again  ·  Esc for menu', textStyle(24, {
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#22303f',
        strokeThickness: 5,
      }))
      .setOrigin(0.5);
    this.tweens.add({
      targets: again,
      alpha: 0.4,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // restart skips the menu, same as the original
    const restart = () => {
      sfx.init();
      sfx.uiClick();
      this.scene.start('Game', { daily: this.stats.daily });
    };
    // small delay before arming restart, so frantic tapping at the moment of
    // death doesn't skip the stats card instantly
    this.time.delayedCall(400, () => {
      this.input.once('pointerdown', restart);
      this.input.keyboard.once('keydown-R', restart);
      this.input.keyboard.once('keydown-ESC', () => {
        sfx.uiClick();
        this.scene.start('Menu');
      });
    });
  }
}
