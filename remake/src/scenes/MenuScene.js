import Phaser from 'phaser';
import {
  COLOR_SKY_TOP,
  COLOR_SKY_BOTTOM,
  COLOR_BG_GAME,
} from '../constants.js';
import { setupCamera, textStyle } from '../utils.js';
import { drawSkyGradient, drawCloud } from '../fx.js';
import { drawBlock } from '../blocks.js';
import { sfx } from '../audio.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    setupCamera(this, COLOR_BG_GAME);

    const g = this.add.graphics();
    drawSkyGradient(g, COLOR_SKY_TOP, COLOR_SKY_BOTTOM);
    drawCloud(g, 140, 60, 1.1);
    drawCloud(g, 620, 100, 0.8);
    drawCloud(g, 400, 40, 0.6, 0.55);

    // decorative falling blocks with rain streaks, like the original menu
    g.lineStyle(3, 0xffffff, 0.6);
    for (const x of [40, 720]) g.lineBetween(x, 50, x, 90);
    for (const x of [60, 740]) g.lineBetween(x, 40, x, 90);
    for (const x of [80, 760]) g.lineBetween(x, 50, x, 90);
    drawBlock(g, { x: 30, y: 100, w: 60, h: 40, shade: 0 });
    drawBlock(g, { x: 710, y: 100, w: 60, h: 40, shade: 2 });

    this.add
      .text(400, 150, 'DodgeBlock', textStyle(84, {
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#2b6ca3',
        strokeThickness: 10,
      }))
      .setOrigin(0.5)
      .setShadow(0, 5, 'rgba(0,0,0,0.25)', 6);

    const start = this.add
      .text(400, 270, 'Click to start', textStyle(34, {
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#2b5876',
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

    this.add
      .text(
        400,
        420,
        "Arrow keys or WASD to move.\nAvoid falling blocks and don't get trapped.",
        textStyle(24, { color: '#20455e', align: 'center' }),
      )
      .setOrigin(0.5);
    this.add
      .text(400, 472, 'M to mute', textStyle(16, { color: '#20455e' }))
      .setOrigin(0.5)
      .setAlpha(0.7);

    this.input.once('pointerdown', () => {
      // first user gesture: the browser lets us create the AudioContext here
      sfx.init();
      sfx.uiClick();
      this.scene.start('Game');
    });
  }
}
