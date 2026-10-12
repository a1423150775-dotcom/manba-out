// UI timing only; neither timer changes authoritative battle state.
export const BATTLE_INPUT = { doubleTapMs: 260, selectionTimeoutMs: 5000 } as const;

export class MapClickIntent {
  private pending?: { cell: string; single: () => void; timer: ReturnType<typeof setTimeout> };
  tap(cell: string, single: () => void, double: () => void) {
    if (this.pending?.cell === cell) {
      this.cancel();
      double();
      return;
    }
    // A new destination supersedes an unsubmitted click on another cell.
    this.cancel();
    const timer = setTimeout(() => { this.pending = undefined; single(); }, BATTLE_INPUT.doubleTapMs);
    this.pending = { cell, single, timer };
  }
  cancel() { if (this.pending) clearTimeout(this.pending.timer); this.pending = undefined; }
}

export class SelectionExpiry {
  private timer?: ReturnType<typeof setTimeout>;
  touch(expire: () => void) {
    this.cancel();
    this.timer = setTimeout(() => { this.timer = undefined; expire(); }, BATTLE_INPUT.selectionTimeoutMs);
  }
  cancel() { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; }
}
