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

// Held-key state for arrows + WASD, mirroring the original's keys[] array,
// plus a touch layer on touch-capable devices (see createTouch below).
export function createInput(scene) {
  const k = scene.input.keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D');
  const touch = scene.sys.game.device.input.touch ? createTouch(scene) : null;
  return {
    touch, // null on non-touch devices; used by TouchHints
    get up() {
      return k.UP.isDown || k.W.isDown || !!(touch && touch.jump);
    },
    get down() {
      // fast-fall (vSpeed powerup) has no touch mapping — keyboard only
      return k.DOWN.isDown || k.S.isDown;
    },
    get left() {
      return k.LEFT.isDown || k.A.isDown || !!(touch && touch.dir(-1));
    },
    get right() {
      return k.RIGHT.isDown || k.D.isDown || !!(touch && touch.dir(1));
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

function createTouch(scene) {
  const active = new Map(); // pointer.id -> { role: 'jump'|'move', pointer }
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
    active.set(p.id, { role: zone === 'jump' ? 'jump' : 'move', pointer: p });
    if (touch.onZonePress) touch.onZonePress(zone);
  });
  const drop = (p) => active.delete(p.id);
  scene.input.on('pointerup', drop);
  scene.input.on('pointerupoutside', drop);
  return touch;
}
