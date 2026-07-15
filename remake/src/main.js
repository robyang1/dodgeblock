import Phaser from 'phaser';
import { GAME_W, GAME_H, RES } from './constants.js';
import { sfx } from './audio.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // real canvas is RES times the logical 800x500; scenes zoom their cameras
  // to match so all game code stays in 800x500 coordinates
  width: GAME_W * RES,
  height: GAME_H * RES,
  backgroundColor: '#000000',
  // FIT keeps the internal 800x500 (16:10) space and letterboxes the rest,
  // matching the original's canvas-sizing logic
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MenuScene, GameScene, GameOverScene],
});

// handles for devtools poking and automated tests
window.game = game;
window.sfx = sfx;
