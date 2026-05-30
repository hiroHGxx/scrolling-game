// Keyboard + touch/pointer input. Exposes a small action-based API so the
// game logic never touches raw key codes.

export type Action = "up" | "down" | "left" | "right" | "fire" | "charge" | "start" | "pause" | "mute";

const KEY_MAP: Record<string, Action> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Space: "fire",
  KeyZ: "fire",
  KeyJ: "fire",
  KeyX: "charge",
  KeyK: "charge",
  ShiftLeft: "charge",
  Enter: "start",
  KeyP: "pause",
  KeyM: "mute",
};

export class Input {
  private down = new Set<Action>();
  private justPressed = new Set<Action>();

  /** Pointer state for touch / mouse control. Position is in CSS pixels relative to the canvas. */
  pointerActive = false;
  pointerX = 0;
  pointerY = 0;
  pointerJustDown = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    // Prevent page scroll / space activation while playing.
    e.preventDefault();
    if (!this.down.has(action)) this.justPressed.add(action);
    this.down.add(action);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    this.down.delete(action);
  };

  private onBlur = () => {
    this.down.clear();
  };

  private updatePointer(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerX = e.clientX - rect.left;
    this.pointerY = e.clientY - rect.top;
  }

  private onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    this.pointerActive = true;
    this.pointerJustDown = true;
    this.updatePointer(e);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.pointerActive) return;
    this.updatePointer(e);
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointerActive = false;
    this.updatePointer(e);
  };

  isDown(action: Action): boolean {
    return this.down.has(action);
  }

  /** True only on the first frame the action was pressed. */
  pressed(action: Action): boolean {
    return this.justPressed.has(action);
  }

  /** Map a CSS-pixel pointer position onto logical game coordinates. */
  pointerLogical(logicalW: number, logicalH: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = logicalW / rect.width;
    const scaleY = logicalH / rect.height;
    return { x: this.pointerX * scaleX, y: this.pointerY * scaleY };
  }

  /** Consume the current pointer press so it isn't read as a menu tap
   *  (used when a tap lands on an on-screen UI control like the mute button). */
  consumePointer() {
    this.pointerJustDown = false;
    this.pointerActive = false;
  }

  /** Call at the very end of each frame to reset edge-triggered flags. */
  endFrame() {
    this.justPressed.clear();
    this.pointerJustDown = false;
  }
}
