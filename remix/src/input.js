// True on phones/tablets only: touch-capable AND the primary pointer is
// coarse. Touchscreen laptops fail the second check (their primary pointer
// is the mouse/trackpad), so they keep the normal desktop presentation —
// the touch layer still works there, it's just not advertised.
export function isMobile(scene) {
  return (
    scene.sys.game.device.input.touch &&
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

// Held-key state for arrows + WASD (mirroring the original's keys[] array)
// plus edge-detected presses. Presses accumulate between sim steps and are
// consumed exactly once per step via consumePressed() — a tap that lands
// between two steps is never lost, even under hitstop.
//
// Dash: Shift / X / K, or a quick horizontal swipe on touch.
// Spike (dash while airborne holding down): quick downward swipe on touch.
export function createInput(scene) {
  const k = scene.input.keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D');
  const pressed = { jump: false, dash: false, spike: false, dashDir: 0 };

  scene.input.keyboard.on('keydown', (e) => {
    if (e.repeat) return;
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        pressed.jump = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
      case 'KeyX':
      case 'KeyK':
        pressed.dash = true;
        break;
    }
  });
  scene.input.keyboard.addCapture('SPACE,SHIFT,X,K,UP,DOWN,LEFT,RIGHT,W,A,S,D');

  const touch = scene.sys.game.device.input.touch
    ? createTouch(scene, pressed)
    : null;

  return {
    touch, // null on non-touch devices; used by TouchHints
    get up() {
      return k.UP.isDown || k.W.isDown || !!(touch && touch.jump);
    },
    get down() {
      return k.DOWN.isDown || k.S.isDown;
    },
    get left() {
      return k.LEFT.isDown || k.A.isDown || !!(touch && touch.dir(-1));
    },
    get right() {
      return k.RIGHT.isDown || k.D.isDown || !!(touch && touch.dir(1));
    },
    // fresh presses since the last call; cleared on read
    consumePressed() {
      const out = {
        jumpPressed: pressed.jump,
        dashPressed: pressed.dash,
        spikePressed: pressed.spike,
        dashDir: pressed.dashDir,
      };
      pressed.jump = pressed.dash = pressed.spike = false;
      pressed.dashDir = 0;
      return out;
    },
  };
}

// Touch zones (fractions of the canvas, so RES scaling is irrelevant):
// top 40% = jump, bottom 60% split at the middle = left / right.
// A pointer's role is locked to the zone it STARTED in — a movement thumb
// that drifts upward never triggers an accidental jump; only a fresh tap in
// the jump zone does. Movement pointers re-read their current x each frame,
// so sliding a held thumb across the middle switches direction.
export const JUMP_ZONE_FRAC = 0.4;

// Swipe gesture: pointer travels SWIPE_FRAC of the canvas width within
// SWIPE_MS of touching down. Horizontal = dash, downward = spike.
const SWIPE_MS = 130;
const SWIPE_FRAC = 0.05;

function createTouch(scene, pressed) {
  const active = new Map(); // pointer.id -> { role, pointer, x0, y0, t0, swiped }
  const halfW = () => scene.scale.width / 2;

  const touch = {
    onZonePress: null, // TouchHints hook: (zone: 'jump'|'left'|'right') => void
    get jump() {
      for (const { role, pointer } of active.values()) {
        if (role === 'jump' && pointer.isDown) return true;
      }
      return false;
    },
    dir(sign) {
      for (const { role, pointer } of active.values()) {
        if (role !== 'move' || !pointer.isDown) continue;
        if (sign < 0 ? pointer.x < halfW() : pointer.x >= halfW()) return true;
      }
      return false;
    },
  };

  scene.input.on('pointerdown', (p) => {
    const zone =
      p.y < scene.scale.height * JUMP_ZONE_FRAC
        ? 'jump'
        : p.x < halfW()
          ? 'left'
          : 'right';
    active.set(p.id, {
      role: zone === 'jump' ? 'jump' : 'move',
      pointer: p,
      x0: p.x,
      y0: p.y,
      t0: performance.now(),
      swiped: false,
    });
    if (touch.onZonePress) touch.onZonePress(zone);
  });

  scene.input.on('pointermove', (p) => {
    const e = active.get(p.id);
    if (!e || e.swiped || !p.isDown) return;
    if (performance.now() - e.t0 > SWIPE_MS) return;
    const dx = p.x - e.x0;
    const dy = p.y - e.y0;
    const thresh = scene.scale.width * SWIPE_FRAC;
    if (Math.abs(dx) >= thresh && Math.abs(dx) > Math.abs(dy)) {
      e.swiped = true;
      pressed.dash = true;
      pressed.dashDir = dx > 0 ? 1 : -1;
    } else if (dy >= thresh && Math.abs(dy) > Math.abs(dx)) {
      e.swiped = true;
      pressed.spike = true;
    }
  });

  const drop = (p) => active.delete(p.id);
  scene.input.on('pointerup', drop);
  scene.input.on('pointerupoutside', drop);
  return touch;
}
