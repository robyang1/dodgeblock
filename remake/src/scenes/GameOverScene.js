import Phaser from 'phaser';
import { COLOR_BG_DEAD } from '../constants.js';
import { setupCamera, textStyle } from '../utils.js';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    // NOT this.data — that's Phaser's built-in DataManager
    this.stats = data;
  }

  create() {
    setupCamera(this, COLOR_BG_DEAD);
    const s = this.stats;
    const display = this.scale.displaySize;

    const add = (x, y, str, size, { origin = [0, 1], bold = false } = {}) =>
      this.add
        .text(x, y, str, textStyle(size, { fontStyle: bold ? 'bold' : 'normal' }))
        .setOrigin(...origin);

    add(400, 50, 'Game Statistics:', 60, { origin: [0.5, 0.5], bold: true });
    add(600, 160, 'Extras:', 40, { bold: true });
    add(550, 210, 'FPB: ' + s.framesPerBlock, 40);
    add(550, 300, 'Canvas Size:', 40);
    add(550, 350, Math.round(display.width) + ' x ' + Math.round(display.height), 40);
    add(60, 160, 'Height reached: ' + Math.round(s.camY) + ' cm', 40);
    add(60, 210, 'Total blocks: ' + s.blocksLen, 40);
    add(30, 260, '+ Coins collected: ' + s.scoreCoins / 200 + '  x200', 40);
    add(20, 280, '_____________________', 40);
    add(20, 360, 'Total Score: ' + s.score, 60);
    add(400, 450, 'Click or press r to play again.', 50, { origin: [0.5, 0.5] });

    // restart skips the menu, same as the original
    this.input.once('pointerdown', () => this.scene.start('Game'));
    this.input.keyboard.once('keydown-R', () => this.scene.start('Game'));
  }
}
