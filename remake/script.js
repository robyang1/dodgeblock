'use strict';

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

// Exact copy of original AABB collision (touch-inclusive)
function rectrect(r1, r2) {
  return (
    ((r1.x <= r2.x && r2.x <= r1.x + r1.w) || (r2.x <= r1.x && r1.x <= r2.x + r2.w)) &&
    ((r1.y <= r2.y && r2.y <= r1.y + r1.h) || (r2.y <= r1.y && r1.y <= r2.y + r2.h))
  );
}

function constrain(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

// Pack rgb into a 24-bit integer for Phaser Graphics API
function rgb(r, g, b) {
  return (r << 16) | (g << 8) | b;
}

// ─────────────────────────────────────────────────────────────
//  MenuScene
// ─────────────────────────────────────────────────────────────

class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#d7ecfa'); // rgb(215,236,250)

    const gfx = this.add.graphics();

    // Burlywood blocks (same positions as original)
    gfx.fillStyle(rgb(222, 184, 135), 1);
    gfx.lineStyle(2, rgb(50, 50, 50), 1);
    gfx.fillRoundedRect(30, 100, 60, 40, 3);
    gfx.strokeRoundedRect(30, 100, 60, 40, 3);
    gfx.fillRoundedRect(710, 100, 60, 40, 3);
    gfx.strokeRoundedRect(710, 100, 60, 40, 3);

    // Vertical decorative lines
    gfx.lineStyle(3, rgb(50, 50, 50), 1);
    gfx.lineBetween(40, 50, 40, 90);
    gfx.lineBetween(60, 40, 60, 90);
    gfx.lineBetween(80, 50, 80, 90);
    gfx.lineBetween(720, 50, 720, 90);
    gfx.lineBetween(740, 40, 740, 90);
    gfx.lineBetween(760, 50, 760, 90);

    this.add.text(400, 200, 'Click to start', {
      fontFamily: 'Arial', fontSize: '80px', color: '#000000',
    }).setOrigin(0.5, 0.5);

    this.add.text(400, 400,
      'Arrow keys or WASD to move.\nAvoid falling blocks and don\'t get trapped.', {
        fontFamily: 'Arial', fontSize: '40px', color: '#000000', align: 'center',
      }).setOrigin(0.5, 0.5);

    this.input.once('pointerdown', () => this.scene.start('GameScene'));
    this.input.keyboard.once('keydown', () => this.scene.start('GameScene'));
  }
}

// ─────────────────────────────────────────────────────────────
//  GameScene
// ─────────────────────────────────────────────────────────────

class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#b0e8ff'); // rgb(176,232,255)

    // ── State ────────────────────────────────────────────────
    this.elapsed       = 0;
    this.camY          = 0;
    this.offGround     = 10;
    this.timeSinceJump = 0;
    this.jumps         = 0;
    this.airJumpUsed   = false;  // one air jump per flight when D powerup active
    this.spawnAccum    = 0;
    this.pwrCounter    = 0;
    this.scoreCoins    = 0;
    this.score         = 0;
    this.fpb           = 120;   // framesPerBlock (in virtual 60fps frames)
    this.isDead        = false;

    this.Ground = { x: -100, y: 300, w: 1000, h: 900 };

    this.player = {
      xVel: 0, hMov: 1.15,
      shieldTimer: 0,
      hTimer:      -999990,
      vTimer:      -99990,
      dTimer:      -99990,
    };

    this.blocks   = [];
    this.powerups = [];

    // Spatial index for block landing. classes[n] holds indices of blocks
    // that have landed at height level n (y = 300 - 40*n).
    // classes[0] is seeded with x-positions (original implementation detail,
    // not used in block-to-block collision logic).
    this.classes = [];
    for (let i = 0; i < 600; i++) {
      this.classes.push([]);
      this.classes[0].push(-100 + i * 20);
    }

    // ── World graphics (camera scrolls automatically) ────────
    this.worldGfx = this.add.graphics();

    // ── Player physics proxy (invisible, origin 0,0 = top-left) ──
    this.playerProxy = this.add.rectangle(385, 270, 30, 30).setOrigin(0, 0).setAlpha(0);
    this.physics.add.existing(this.playerProxy);
    this.playerProxy.body.setAllowGravity(true);
    this.playerProxy.body.setGravityY(1080);

    // ── Static ground proxy + collider ───────────────────────
    this.groundProxy = this.add.rectangle(-100, 300, 1000, 900).setOrigin(0, 0).setAlpha(0);
    this.physics.add.existing(this.groundProxy, true);
    this.physics.add.collider(this.playerProxy, this.groundProxy, () => {
      this.offGround = 0;
      this.jumps = 0;
      this.airJumpUsed = false;
    });

    // ── HUD (screen-space, not scrolled by camera) ───────────
    this.hudGfx = this.add.graphics().setScrollFactor(0);

    // Persistent text labels for HUD powerup indicators (H, D, V only).
    // Shield indicator is just a circle — no text needed.
    const iW  = 800 / 40;               // indicator width  = 20
    const iH  = 500 / 25;               // indicator height = 20
    const iCY = 500 / 40 + iH / 2;     // indicator center-y = 22.5
    const iX  = (n) => n * 800 / 30 + iW / 2; // center-x for slot n

    this.hudHTxt = this.add.text(iX(1.2), iCY, '<->', {
      fontFamily: 'Arial', fontSize: '10px', color: '#000000',
    }).setOrigin(0.5, 0.5).setVisible(false).setScrollFactor(0);

    this.hudDTxt = this.add.text(iX(2.2), iCY, '↑↑', {
      fontFamily: 'Arial', fontSize: '10px', color: '#000000',
    }).setOrigin(0.5, 0.5).setVisible(false).setScrollFactor(0);

    this.hudVTxt = this.add.text(iX(3.2), iCY, '↕', {
      fontFamily: 'Arial', fontSize: '20px', color: '#000000',
    }).setOrigin(0.5, 0.5).setVisible(false).setScrollFactor(0);

    // Score / FPB / FPS text (right-aligned, matching original)
    const txtStyle = { fontFamily: 'Arial', fontSize: '25px', color: '#000000' };
    this.scoreTxt = this.add.text(790, 13, '', txtStyle).setOrigin(1, 0.5).setScrollFactor(0);
    this.fpbTxt   = this.add.text(790, 40, '', txtStyle).setOrigin(1, 0.5).setScrollFactor(0);
    this.fpsTxt   = this.add.text(790, 67, '', txtStyle).setOrigin(1, 0.5).setScrollFactor(0);

    // ── Input ────────────────────────────────────────────────
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd    = this.input.keyboard.addKeys({
      up:   Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      down: Phaser.Input.Keyboard.KeyCodes.S,
    });
  }

  // ── Spawn helpers ─────────────────────────────────────────

  spawnBlock() {
    const x = Math.floor(Math.random() * 940 - 100);
    const y = -this.camY - 280 + Math.round(1000 / this.fpb);
    this.blocks.push({ x, y, w: 60, h: 40, yVel: 0, fixed: false });
  }

  spawnPowerup(type) {
    const x = Math.floor(Math.random() * 940 - 100);
    const y = -this.camY - 40;
    const p = {
      type, x, y, w: 20, h: 20,
      yVel: 0, fixed: false, timer: 0,
      labelText: null,
    };

    // Create a world-space text label for types that have one.
    // Added directly to scene (not a container) — camera scrolls it automatically.
    if (type === 'H') {
      p.labelText = this.add.text(x + 10, y + 10, '<->', {
        fontFamily: 'Arial', fontSize: '10px', color: '#000000',
      }).setOrigin(0.5, 0.5);
    } else if (type === 'D') {
      p.labelText = this.add.text(x + 10, y + 10, '↑↑', {
        fontFamily: 'Arial', fontSize: '10px', color: '#000000',
      }).setOrigin(0.5, 0.5);
    } else if (type === 'V') {
      p.labelText = this.add.text(x + 10, y + 10, '↕', {
        fontFamily: 'Arial', fontSize: '20px', color: '#000000',
      }).setOrigin(0.5, 0.5);
    } else if (type === 'S') {
      p.labelText = this.add.text(x + 10, y + 10, '+200', {
        fontFamily: 'Arial', fontSize: '6.7px', color: '#000000',
      }).setOrigin(0.5, 0.5);
    }

    this.powerups.push(p);
  }

  removePowerup(index) {
    const p = this.powerups[index];
    if (p.labelText) {
      p.labelText.destroy();
    }
    this.powerups.splice(index, 1);
  }

  // ── Draw helpers ─────────────────────────────────────────

  drawBlock(gfx, b) {
    if (b.y + this.camY < -b.h) {
      // Block is above viewport: draw a red 5px indicator bar at the top.
      // In world-space the bar is at y = -camY, which renders at screen y = 0
      // because camera.scrollY = -camY.
      gfx.fillStyle(0xff0000, 1);
      gfx.fillRect(Math.round(b.x), -this.camY, b.w, 5);
    } else {
      gfx.fillStyle(rgb(222, 184, 135), 1);
      gfx.lineStyle(Math.round(b.w / 30), rgb(50, 50, 50), 1);
      gfx.fillRoundedRect(Math.round(b.x), b.y, b.w, b.h, b.w / 10);
      gfx.strokeRoundedRect(Math.round(b.x), b.y, b.w, b.h, b.w / 10);
    }
  }

  drawPowerupShape(gfx, p) {
    if (p.type === 'I') {
      // Shield: green circle outline
      gfx.lineStyle(p.w / 10, rgb(27, 209, 130), 1);
      gfx.strokeCircle(p.x + p.w / 2, p.y + p.h / 2, p.w / 2);
    } else if (p.type === 'H' || p.type === 'D' || p.type === 'V') {
      // Speed/jump powerups: yellow-green rect
      gfx.fillStyle(rgb(163, 209, 27), 1);
      gfx.lineStyle(p.w / 10, rgb(0, 0, 0), 1);
      gfx.fillRect(p.x, p.y, p.w, p.h);
      gfx.strokeRect(p.x, p.y, p.w, p.h);
    } else if (p.type === 'S') {
      // Coin: gold circle
      gfx.fillStyle(rgb(255, 215, 0), 1);
      gfx.lineStyle(p.w / 10, rgb(186, 159, 0), 1);
      gfx.fillCircle(p.x + p.w / 2, p.y + p.h / 2, p.w / 2);
      gfx.strokeCircle(p.x + p.w / 2, p.y + p.h / 2, p.w / 2);
    }
  }

  drawPlayer(gfx, px, py, yVel, xVel) {
    const p = this.player;
    const w = 30, h = 30;

    // Red body with slightly rounded corners (radius = w/10 = 3)
    gfx.fillStyle(0xff0000, 1);
    gfx.fillRoundedRect(px, py, w, h, w / 10);

    // Face: 2 eyes + 1 mouth, positions shift based on velocity state
    gfx.fillStyle(0x000000, 1);

    if (yVel > 0.5) {
      // Jumping
      if (xVel > 0.8) {
        gfx.fillRect(px + w * 0.30, py + h * 0.22, w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.75, py + h * 0.22, w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.40, py + h * 0.54, w * 0.40, h * 0.25);
      } else if (xVel < -0.8) {
        gfx.fillRect(px + w * 0.10, py + h * 0.22, w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.55, py + h * 0.22, w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.20, py + h * 0.54, w * 0.40, h * 0.25);
      } else {
        gfx.fillRect(px + w * 0.20, py + h * 0.22, w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.65, py + h * 0.22, w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.30, py + h * 0.54, w * 0.40, h * 0.25);
      }
    } else if (yVel < -3.3) {
      // Falling
      if (xVel > 0.8) {
        gfx.fillRect(px + w * 0.30, py + h * 0.43, w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.75, py + h * 0.43, w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.40, py + h * 0.73, w * 0.40, h * 0.25);
      } else if (xVel < -0.8) {
        gfx.fillRect(px + w * 0.10, py + h * 0.43, w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.55, py + h * 0.43, w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.20, py + h * 0.73, w * 0.40, h * 0.25);
      } else {
        gfx.fillRect(px + w * 0.20, py + h * 0.43, w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.65, py + h * 0.43, w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.30, py + h * 0.73, w * 0.40, h * 0.25);
      }
    } else {
      // Ground / neutral
      if (xVel > 0.8) {
        gfx.fillRect(px + w * 0.30, py + h / 3,   w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.75, py + h / 3,   w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.40, py + h * 2/3, w * 0.40, h * 0.25);
      } else if (xVel < -0.8) {
        gfx.fillRect(px + w * 0.10, py + h / 3,   w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.55, py + h / 3,   w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.20, py + h * 2/3, w * 0.40, h * 0.25);
      } else {
        gfx.fillRect(px + w * 0.20, py + h / 3,   w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.65, py + h / 3,   w * 0.15, h * 0.15);
        gfx.fillRect(px + w * 0.30, py + h * 2/3, w * 0.40, h * 0.25);
      }
    }

    // Shield aura (green circle outline, radius = diagonal/2 of player)
    if (p.shieldTimer > 0) {
      gfx.lineStyle(w / 15, rgb(27, 209, 130), 1);
      gfx.strokeCircle(px + w / 2, py + h / 2, (w * 1.414) / 2);
    }
  }

  // ── Main update loop ──────────────────────────────────────

  update(time, delta) {
    if (this.isDead) return;

    // dt = 1.0 at 60fps, 0.5 at 120fps — all physics scaled by this
    const dt  = delta / (1000 / 60);
    const p   = this.player;
    const blk = this.blocks;
    const gfx = this.worldGfx;
    const GRAVITY = 0.3;

    // 1. framesPerBlock (complexity ramps up with time)
    this.fpb = Math.round(12000000 / (this.elapsed * 350 + 100000));

    // 2. Horizontal move speed (boosted by hSpeed powerup)
    p.hMov = p.hTimer > 0 ? 1.8 : 1.15;

    // 3. Jump detection
    const jumpDown     = this.cursors.up.isDown || this.wasd.up.isDown;
    const jumpJustDown = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
                         Phaser.Input.Keyboard.JustDown(this.wasd.up);

    const normalJump = this.offGround < 3 && this.timeSinceJump > 2;
    const inAir = this.offGround >= 3;
    const airJumpOk = p.dTimer > 0 && inAir && !this.airJumpUsed && jumpJustDown;
    if (jumpDown && (normalJump || airJumpOk)) {
      // Nudge up so we're no longer in contact with ground; otherwise Arcade Physics
      // (which runs before/after this update) can zero our velocity when resolving the collision.
      this.playerProxy.body.y -= 2;
      this.playerProxy.body.setVelocityY(p.vTimer > 0 ? -540 : -480);
      this.timeSinceJump = 0;
      this.jumps++;
      if (airJumpOk) this.airJumpUsed = true;
    }

    // 4. Horizontal input (xVel += ±hMov * dt each frame key is held)
    if (this.cursors.left.isDown  || this.wasd.left.isDown)  p.xVel += -p.hMov * dt;
    if (this.cursors.right.isDown || this.wasd.right.isDown) p.xVel +=  p.hMov * dt;

    // 5. Down key: fast-fall boost (only with vSpeed powerup)
    if ((this.cursors.down.isDown || this.wasd.down.isDown) && p.vTimer > 0) {
      this.playerProxy.body.setVelocityY(this.playerProxy.body.velocity.y + 36 * dt);
    }

    // 6. Clear world graphics for this frame
    gfx.clear();

    // 7. Draw ground (white fill, no stroke)
    gfx.fillStyle(0xffffff, 1);
    gfx.fillRect(this.Ground.x, this.Ground.y, this.Ground.w, this.Ground.h);

    // 8. Spawn block (and maybe a powerup) on schedule
    this.spawnAccum += dt;
    if (this.spawnAccum >= this.fpb) {
      this.spawnAccum -= this.fpb;
      this.spawnBlock();
      const pw = this.pwrCounter % 35;
      if      (pw === 6)  this.spawnPowerup('I');
      else if (pw === 13) this.spawnPowerup('H');
      else if (pw === 20) this.spawnPowerup('D');
      else if (pw === 27) this.spawnPowerup('V');
      else if (pw === 34) this.spawnPowerup('S');
      this.pwrCounter++;
    }

    // 9. Update + draw blocks (last 200).
    //    When a block lands on the ground (c === 0), break the loop exactly
    //    as the original does — only one ground-landing per frame.
    const drawStart = Math.max(0, blk.length - 200);
    for (let i = drawStart; i < blk.length; i++) {
      const b = blk[i];

      if (!b.fixed) {
        b.yVel += GRAVITY * dt;
        b.y    += b.yVel * dt;

        const c = Math.ceil((300 - b.y) / b.h) - 1;

        if (c === 0) {
          // Lands on the ground
          b.y     = 300 - b.h * (c + 1);
          b.fixed = true;
          b.yVel  = 0;
          this.classes[c + 1].push(i);
          // Mirrors the original `break` — stops the loop (no draw this frame for this block)
          break;
        } else if (c > 0 && c < 600) {
          // Stacks on a previously-landed block
          for (let j = 0; j < this.classes[c].length; j++) {
            const other = blk[this.classes[c][j]];
            if (other && rectrect(b, other)) {
              b.y     = 300 - b.h * (c + 1);
              b.fixed = true;
              b.yVel  = 0;
              this.classes[c + 1].push(i);
              break;
            }
          }
        }
      }

      // Draw this block if it is within the visible viewport
      if (b.y < -this.camY + 500 &&
          !(b.fixed && b.y < -this.camY - b.h) &&
          Math.abs(b.x + b.w / 2 - this.playerProxy.x - 15) < 800) {
        this.drawBlock(gfx, b);
      }
    }

    // 10. Pre-updateX block-player collision (last 300 blocks)
    // Use body position so we don't fight with game object sync timing (avoids jitter on blocks).
    const colStart = Math.max(0, blk.length - 300);
    const bodyX = () => this.playerProxy.body.x;
    const bodyY = () => this.playerProxy.body.y;
    for (let i = colStart; i < blk.length; i++) {
      const b  = blk[i];
      const pr = { x: bodyX(), y: bodyY(), w: 30, h: 30 };
      if (!rectrect(pr, b)) continue;

      if (bodyY() < b.y) {
        // Player landed on top of block
        this.playerProxy.body.reset(bodyX(), b.y - 30 - 0.1);
        this.playerProxy.body.setVelocityY(0);
        this.offGround = 0;
        this.jumps     = 0;
        this.airJumpUsed = false;
      } else if (b.yVel > 3) {
        // Fast-falling block: absorb with shield or die
        if (p.shieldTimer > 0) {
          blk.splice(i, 1);
          i--;
          continue;
        }
        this.triggerDeath();
        return;
      } else {
        // Ceiling / side push
        this.playerProxy.body.setVelocityY(0);
        let ny = bodyY();
        const px = bodyX();
        while (rectrect({ x: px, y: ny, w: 30, h: 30 }, b)) ny += 0.2;
        this.playerProxy.body.reset(px, ny);
      }
    }

    // 11. Decrement all powerup timers (dt-scaled)
    p.shieldTimer -= dt;
    p.hTimer      -= dt;
    p.vTimer      -= dt;
    p.dTimer      -= dt;

    // 12. updateX: exponential damping, move, clamp to world bounds
    const originalX = bodyX();
    p.xVel *= Math.pow(0.8, dt);
    const newX = constrain(bodyX() + p.xVel * dt, -100, 870);
    const savedVY = this.playerProxy.body.velocity.y;
    // Use body.y so a same-frame jump nudge (body.y -= 2) isn't overwritten by game object y
    this.playerProxy.body.reset(newX, this.playerProxy.body.y);
    this.playerProxy.body.setVelocityY(savedVY);

    // 13. Post-updateX block collision: wall check
    for (let i = colStart; i < blk.length; i++) {
      const pr = { x: bodyX(), y: bodyY(), w: 30, h: 30 };
      if (rectrect(pr, blk[i])) {
        p.xVel = 0;
        const vy2 = this.playerProxy.body.velocity.y;
        this.playerProxy.body.reset(originalX, bodyY());
        this.playerProxy.body.setVelocityY(vy2);
      }
    }

    // 14. Dynamic Y gravity: heavier when moving strongly upward without holding jump
    //     (short-hop mechanic — equivalent to original heavy gravity when yVel >= 4 && !jumpDown)
    //     velocity.y <= -240 px/s ≡ original yVel >= 4 px/frame at 60fps
    const heavyGrav = this.playerProxy.body.velocity.y <= -240 && !jumpDown;
    this.playerProxy.body.setGravityY(heavyGrav ? 2160 : 1080);

    // 15. Ground collision: handled by arcade physics + collider callback (no manual check)

    // 16. Post-updateY block-player collision (last 300 blocks)
    for (let i = colStart; i < blk.length; i++) {
      const b  = blk[i];
      const pr = { x: bodyX(), y: bodyY(), w: 30, h: 30 };
      if (!rectrect(pr, b)) continue;

      if (bodyY() < b.y) {
        this.playerProxy.body.reset(bodyX(), b.y - 30 - 0.1);
        this.playerProxy.body.setVelocityY(0);
        this.offGround = 0;
        this.jumps     = 0;
        this.airJumpUsed = false;
      } else if (b.yVel > 3) {
        if (p.shieldTimer > 0) {
          blk.splice(i, 1);
          i--;
          continue;
        }
        this.triggerDeath();
        return;
      } else {
        this.playerProxy.body.setVelocityY(0);
        let ny = bodyY();
        const px2 = bodyX();
        while (rectrect({ x: px2, y: ny, w: 30, h: 30 }, b)) ny += 0.2;
        this.playerProxy.body.reset(px2, ny);
      }
    }

    // 17. Draw player (read position from proxy; derive yVel in original units)
    const renderYVel = -this.playerProxy.body.velocity.y / 60;
    this.drawPlayer(gfx, this.playerProxy.x, this.playerProxy.y, renderYVel, p.xVel);

    // 18. Powerups: physics, flash, collection, expiry
    for (let i = 0; i < this.powerups.length; i++) {
      const pw = this.powerups[i];

      pw.yVel += GRAVITY * dt;
      pw.y    += pw.yVel * dt;

      // Ground landing
      if (rectrect(pw, this.Ground)) {
        pw.yVel = 0;
        pw.y    = this.Ground.y - pw.h;
      }
      // Block landing
      for (let j = 0; j < blk.length; j++) {
        if (rectrect(pw, blk[j])) {
          pw.yVel = 0;
          pw.y    = blk[j].y - pw.h;
        }
      }

      // Flash logic: always visible for first 240 virtual frames, then blinks
      const visible = pw.timer < 240 || this.elapsed % 16 < 8;
      if (visible) this.drawPowerupShape(gfx, pw);
      if (pw.labelText) {
        pw.labelText.setPosition(pw.x + pw.w / 2, pw.y + pw.h / 2);
        pw.labelText.setVisible(visible);
      }

      // Player collects powerup
      const playerRect = { x: this.playerProxy.x, y: this.playerProxy.y, w: 30, h: 30 };
      if (rectrect(pw, playerRect)) {
        switch (pw.type) {
          case 'I': p.shieldTimer = constrain(p.shieldTimer, 0, 99999) + 600;  break;
          case 'H': p.hTimer      = constrain(p.hTimer,      0, 99999) + 600;  break;
          case 'D': p.dTimer      = constrain(p.dTimer,      0, 99999) + 600;  break;
          case 'V': p.vTimer      = constrain(p.vTimer,      0, 99999) + 1000; break;
          case 'S': this.scoreCoins += 200; break;
        }
        this.removePowerup(i);
        i--;
        continue;
      }

      pw.timer += dt;
      if (pw.timer > 300) {  // 5-second lifetime at 60fps
        this.removePowerup(i);
        i--;
      }
    }

    // 19. Counters (dt-scaled for framerate independence)
    this.offGround     += dt;
    this.timeSinceJump += dt;
    this.elapsed       += dt;

    // 20. Camera scroll (automatic upward drift + player-lead)
    this.camY += (2 / this.fpb) * dt;
    if (this.playerProxy.y + this.camY < 150 && -this.playerProxy.y + 150 > this.camY) {
      this.camY = -this.playerProxy.y + 150;
    }

    // 21. Apply camera transform via Phaser camera scroll
    const tX = -constrain(this.playerProxy.x - 400, -100, 100);
    this.cameras.main.setScroll(-tX, -this.camY);

    // 22. Score
    this.score = Math.round(this.camY) + blk.length + this.scoreCoins;

    // 23. Death: fell off the bottom
    if (this.playerProxy.y > -this.camY + 500) {
      this.triggerDeath();
      return;
    }

    // 24. HUD
    this.updateHUD();
  }

  updateHUD() {
    const p   = this.player;
    const gfx = this.hudGfx;

    // Indicator dimensions (matching original: width/40 × height/25 at 800×500)
    const iW = 800 / 40;   // 20
    const iH = 500 / 25;   // 20
    const iY = 500 / 40;   // 12.5  (top edge y)
    const iX = (n) => n * 800 / 30;  // slot x (0.2→5.33, 1.2→32, 2.2→58.67, 3.2→85.33)

    gfx.clear();

    // Flash condition: always show when timer > 120; blink when 0 < timer ≤ 120
    const showS = p.shieldTimer > 120 || (p.shieldTimer > 0 && p.shieldTimer <= 120 && this.elapsed % 16 < 8);
    const showH = p.hTimer      > 120 || (p.hTimer      > 0 && p.hTimer      <= 120 && this.elapsed % 16 < 8);
    const showD = p.dTimer      > 120 || (p.dTimer      > 0 && p.dTimer      <= 120 && this.elapsed % 16 < 8);
    const showV = p.vTimer      > 120 || (p.vTimer      > 0 && p.vTimer      <= 120 && this.elapsed % 16 < 8);

    if (showS) {
      gfx.lineStyle(iW / 10, rgb(27, 209, 130), 1);
      gfx.strokeCircle(iX(0.2) + iW / 2, iY + iH / 2, iW / 2);
    }
    if (showH) {
      gfx.fillStyle(rgb(163, 209, 27), 1);
      gfx.lineStyle(iW / 10, rgb(0, 0, 0), 1);
      gfx.fillRect(iX(1.2), iY, iW, iH);
      gfx.strokeRect(iX(1.2), iY, iW, iH);
    }
    if (showD) {
      gfx.fillStyle(rgb(163, 209, 27), 1);
      gfx.lineStyle(iW / 10, rgb(0, 0, 0), 1);
      gfx.fillRect(iX(2.2), iY, iW, iH);
      gfx.strokeRect(iX(2.2), iY, iW, iH);
    }
    if (showV) {
      gfx.fillStyle(rgb(163, 209, 27), 1);
      gfx.lineStyle(iW / 10, rgb(0, 0, 0), 1);
      gfx.fillRect(iX(3.2), iY, iW, iH);
      gfx.strokeRect(iX(3.2), iY, iW, iH);
    }

    this.hudHTxt.setVisible(showH);
    this.hudDTxt.setVisible(showD);
    this.hudVTxt.setVisible(showV);

    this.scoreTxt.setText('Score: ' + this.score);
    this.fpbTxt.setText('Frames Per Block: ' + this.fpb);
    this.fpsTxt.setText('FPS: ' + Math.round(this.game.loop.actualFps));
  }

  triggerDeath() {
    if (this.isDead) return;
    this.isDead = true;

    // Clean up all world-space powerup labels before leaving scene
    for (const pw of this.powerups) {
      if (pw.labelText) {
        pw.labelText.destroy();
      }
    }

    this.scene.start('GameOverScene', {
      camY:           this.camY,
      blocksLen:      this.blocks.length,
      scoreCoins:     this.scoreCoins,
      framesPerBlock: this.fpb,
      score:          this.score,
    });
  }
}

// ─────────────────────────────────────────────────────────────
//  GameOverScene
// ─────────────────────────────────────────────────────────────

class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  init(stats) {
    // Store separately to avoid clobbering Phaser's built-in this.data
    this.stats = stats || {};
  }

  create() {
    this.cameras.main.setBackgroundColor('#dcdcdc'); // rgb(220,220,220)

    const s              = this.stats;
    const camY           = s.camY           || 0;
    const blocksLen      = s.blocksLen      || 0;
    const scoreCoins     = s.scoreCoins     || 0;
    const framesPerBlock = s.framesPerBlock || 0;
    const score          = s.score          || 0;

    const bold   = { fontFamily: 'Arial', fontSize: '60px', color: '#000000', fontStyle: 'bold' };
    const norm40 = { fontFamily: 'Arial', fontSize: '40px', color: '#000000' };
    const norm60 = { fontFamily: 'Arial', fontSize: '60px', color: '#000000' };
    const norm50 = { fontFamily: 'Arial', fontSize: '50px', color: '#000000', align: 'center' };

    // Title (centered)
    this.add.text(400, 50, 'Game Statistics:', bold).setOrigin(0.5, 0.5);

    // Left column — matches original textAlign(LEFT, BOTTOM) positions
    this.add.text(60,  160, 'Height reached: ' + Math.round(camY) + ' cm', norm40).setOrigin(0, 1);
    this.add.text(60,  210, 'Total blocks: ' + blocksLen,                   norm40).setOrigin(0, 1);
    this.add.text(30,  260, '+ Coins collected: ' + (scoreCoins / 200) + '  x200', norm40).setOrigin(0, 1);
    this.add.text(20,  280, '_____________________',                         norm40).setOrigin(0, 1);
    this.add.text(20,  360, 'Total Score: ' + score,                         norm60).setOrigin(0, 1);

    // Right column (Extras)
    this.add.text(600, 160, 'Extras:',                norm40).setOrigin(0, 1);
    this.add.text(550, 210, 'FPB: ' + framesPerBlock, norm40).setOrigin(0, 1);
    this.add.text(550, 300, 'Canvas Size:',            norm40).setOrigin(0, 1);
    this.add.text(550, 350, '800 x 500',               norm40).setOrigin(0, 1);

    // Restart prompt (centered at bottom)
    this.add.text(400, 450, 'Click or press r to play again.', norm50).setOrigin(0.5, 0.5);

    this.input.once('pointerdown',   () => this.scene.start('GameScene'));
    this.input.keyboard.on('keydown-R', () => this.scene.start('GameScene'));
  }
}

// ─────────────────────────────────────────────────────────────
//  Phaser config + launch
// ─────────────────────────────────────────────────────────────

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 800,
    height: 500,
  },
  scene: [MenuScene, GameScene, GameOverScene],
};

new Phaser.Game(config);
