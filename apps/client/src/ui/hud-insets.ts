/**
 * The room the DOM HUD takes over the canvas, in CSS pixels, measured live (never assumed):
 * - `top`: the bottom edge of the resource header (`.hud`).
 * - `nav`: the bottom nav bar (`.hud-nav`, fixed), counted up from the viewport bottom so it includes the safe-area inset.
 * - `sheet`: the open bottom sheet (tile or building panel), counted up from the viewport bottom; 0 when none is open.
 * Callers use max(nav, sheet) for the bottom of the map.
 */
export interface Insets {
  readonly top: number;
  readonly nav: number;
  readonly sheet: number;
}

export interface HudInsets {
  /**
   * The insets as last measured by the observers (resize, DOM changes, window resize), batched into a frame.
   * Reads no layout, so it is cheap to call every frame.
   */
  get(): Insets;
  /** Called when a value moved by at least 1px. Returns the unsubscribe function. */
  subscribe(cb: () => void): () => void;
  dispose(): void;
}

const SHEET_TESTIDS = ["tile-panel", "building-panel"] as const;

/** An element that is shown (has a height); `hidden` and `display: none` both give 0. */
const shownRect = (el: Element | null): DOMRect | null => {
  if (el === null) return null;
  const rect = el.getBoundingClientRect();
  return rect.height > 0 ? rect : null;
};

const measure = (): Insets => {
  const header = shownRect(document.querySelector(".hud"));
  const nav = shownRect(document.querySelector(".hud-nav"));
  let sheet = 0;
  for (const id of SHEET_TESTIDS) {
    const rect = shownRect(document.querySelector(`[data-testid="${id}"]`));
    if (rect !== null) sheet = Math.max(sheet, window.innerHeight - rect.top);
  }
  return {
    top: header?.bottom ?? 0,
    nav: nav === null ? 0 : window.innerHeight - nav.top,
    sheet,
  };
};

const moved = (a: Insets, b: Insets): boolean =>
  Math.abs(a.top - b.top) >= 1 || Math.abs(a.nav - b.nav) >= 1 || Math.abs(a.sheet - b.sheet) >= 1;

/**
 * Watches the HUD and tells subscribers when the room it takes changes. Changes are batched into one
 * animation frame, so a burst of DOM updates costs one measurement.
 */
export const createHudInsets = (): HudInsets => {
  const listeners = new Set<() => void>();
  let notified = measure();
  let frame = 0;

  const flush = (): void => {
    frame = 0;
    // Watch whatever is on screen now: the header, nav and sheets are rebuilt by the UI at times.
    for (const el of watched()) resizes.observe(el);
    const now = measure();
    if (!moved(notified, now)) return;
    notified = now;
    for (const cb of [...listeners]) cb();
  };
  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(flush);
  };

  const watched = (): Element[] => {
    const found: Element[] = [];
    for (const sel of [".hud", ".hud-nav", ...SHEET_TESTIDS.map((id) => `[data-testid="${id}"]`)]) {
      const el = document.querySelector(sel);
      if (el !== null) found.push(el);
    }
    return found;
  };

  const resizes = new ResizeObserver(schedule);
  const ui = document.getElementById("ui") ?? document.body;
  // Panels appear and disappear as children of #ui; their `hidden` flag flips when they open and close.
  const children = new MutationObserver(schedule);
  children.observe(ui, { childList: true });
  const hidden = new MutationObserver(schedule);
  hidden.observe(ui, { attributes: true, attributeFilter: ["hidden"], subtree: true });
  window.addEventListener("resize", schedule);
  schedule();

  return {
    get: () => notified,
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    dispose() {
      resizes.disconnect();
      children.disconnect();
      hidden.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      listeners.clear();
    },
  };
};
