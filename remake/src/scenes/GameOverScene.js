import Phaser from 'phaser';
import {
  COLOR_DEAD_SKY_TOP,
  COLOR_DEAD_SKY_BOTTOM,
  COLOR_PLAYER,
} from '../constants.js';
import { setupCamera, textStyle } from '../utils.js';
import { drawSkyGradient } from '../fx.js';
import { sfx } from '../audio.js';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    // NOT this.data — that's Phaser's built-in DataManager
    this.stats = data;
  }

  create() {
    setupCamera(this, COLOR_DEAD_SKY_TOP);
    const s = this.stats;
    const display = this.scale.displaySize;

    const g = this.add.graphics();
    drawSkyGradient(g, COLOR_DEAD_SKY_TOP, COLOR_DEAD_SKY_BOTTOM);
    // stats card with a soft shadow
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(106, 88, 600, 300, 16);
    g.fillStyle(0xffffff, 0.94);
    g.fillRoundedRect(100, 80, 600, 300, 16);

    this.add
      .text(400, 128, 'Game Over', textStyle(44, { color: '#223447', fontStyle: 'bold' }))
      .setOrigin(0.5);
    this.add
      .text(400, 185, 'Total Score: ' + s.score, textStyle(36, {
        color: Phaser.Display.Color.IntegerToColor(COLOR_PLAYER).rgba,
        fontStyle: 'bold',
      }))
      .setOrigin(0.5);
    g.lineStyle(2, 0x223447, 0.15);
    g.lineBetween(140, 215, 660, 215);

    const stat = (x, y, label, value, w = 235) => {
      this.add.text(x, y, label, textStyle(19, { color: '#5a6c80' })).setOrigin(0, 0.5);
      this.add
        .text(x + w, y, String(value), textStyle(19, { color: '#223447', fontStyle: 'bold' }))
        .setOrigin(1, 0.5);
    };
    stat(145, 250, 'Height reached', Math.round(s.camY) + ' cm', 260);
    stat(145, 285, 'Total blocks', s.blocksLen, 260);
    stat(145, 320, 'Coins collected', s.scoreCoins / 200 + ' × 200', 260);
    stat(440, 250, 'Frames per block', s.framesPerBlock, 245);
    stat(440, 285, 'Canvas size', Math.round(display.width) + '×' + Math.round(display.height), 245);

    const again = this.add
      .text(400, 445, 'Click or press R to play again', textStyle(26, {
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
      this.scene.start('Game');
    };
    this.input.once('pointerdown', restart);
    this.input.keyboard.once('keydown-R', restart);
  }
}
