// Held-key state for arrows + WASD, mirroring the original's keys[] array.
export function createInput(scene) {
  const k = scene.input.keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D');
  return {
    get up() {
      return k.UP.isDown || k.W.isDown;
    },
    get down() {
      return k.DOWN.isDown || k.S.isDown;
    },
    get left() {
      return k.LEFT.isDown || k.A.isDown;
    },
    get right() {
      return k.RIGHT.isDown || k.D.isDown;
    },
  };
}
