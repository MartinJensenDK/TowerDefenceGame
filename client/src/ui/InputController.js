const DRAG_THRESHOLD_PX = 6;

/** Turns pointer events on the canvas into tile clicks (ignoring drags used for orbiting) and hovers. */
export class InputController {
  constructor(canvas, { pickTile, onTileClick, onTileHover, onCancel }) {
    this.canvas = canvas;
    this.pickTile = pickTile;
    this.onTileClick = onTileClick;
    this.onTileHover = onTileHover;
    this.onCancel = onCancel;
    this.down = null;

    this._onDown = (e) => {
      if (e.button !== 0) return;
      this.down = { x: e.clientX, y: e.clientY };
    };
    this._onUp = (e) => {
      if (e.button !== 0 || !this.down) return;
      const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
      this.down = null;
      if (moved > DRAG_THRESHOLD_PX || e.target !== this.canvas) return;
      this.onTileClick(this.pickTile(e.clientX, e.clientY));
    };
    this._onMove = (e) => {
      if (this.down) return;
      this.onTileHover(this.pickTile(e.clientX, e.clientY));
    };
    this._onKey = (e) => {
      if (e.key === 'Escape') this.onCancel();
    };
    canvas.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointerup', this._onUp);
    canvas.addEventListener('pointermove', this._onMove);
    window.addEventListener('keydown', this._onKey);
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointerup', this._onUp);
    this.canvas.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('keydown', this._onKey);
  }
}
