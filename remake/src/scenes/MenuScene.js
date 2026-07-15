import Phaser from 'phaser';
import {
  COLOR_BG_MENU,
  COLOR_BLOCK_FILL,
  COLOR_STROKE_GRAY,
} from '../constants.js';
import { setupCamera, textStyle } from '../utils.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    setupCamera(this, COLOR_BG_MENU);

    // two decorative blocks with rain lines above them
    const g = this.add.graphics();
    g.lineStyle(2, COLOR_STROKE_GRAY);
    g.fillStyle(COLOR_BLOCK_FILL);
    for (const x of [30, 710]) {
      g.fillRoundedRect(x, 100, 60, 40, 3);
      g.strokeRoundedRect(x, 100, 60, 40, 3);
    }
    g.lineStyle(3, COLOR_STROKE_GRAY);
    for (const x of [40, 720]) g.lineBetween(x, 50, x, 90);
    for (const x of [60, 740]) g.lineBetween(x, 40, x, 90);
    for (const x of [80, 760]) g.lineBetween(x, 50, x, 90);

    this.add.text(400, 200, 'Click to start', textStyle(80)).setOrigin(0.5);
    // 36px, not the original's 40 — Arial runs wider than p5's default font
    // and the second line clips at 800px otherwise
    this.add
      .text(
        400,
        400,
        "Arrow keys or WASD to move.\nAvoid falling blocks and don't get trapped.",
        textStyle(36, { align: 'center' }),
      )
      .setOrigin(0.5);

    this.input.once('pointerdown', () => this.scene.start('Game'));
  }
}
