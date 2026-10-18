import { useEffect } from "react";

const DEAD_ZONE = 12;
const FRAME_MS = 16;
const SPEED = 0.08;
/** Released within this time without moving: keep scrolling until the next click. */
const STICKY_CLICK_MS = 250;

const isScrollable = (element: HTMLElement) => {
  const style = getComputedStyle(element);
  const scrollsY =
    /(auto|scroll|overlay)/.test(style.overflowY) &&
    element.scrollHeight > element.clientHeight;
  const scrollsX =
    /(auto|scroll|overlay)/.test(style.overflowX) &&
    element.scrollWidth > element.clientWidth;
  return scrollsY || scrollsX;
};

const findScrollContainer = (start: Element | null): HTMLElement | null => {
  for (let element = start; element; element = element.parentElement) {
    if (element instanceof HTMLElement && isScrollable(element)) return element;
  }
  const root = document.scrollingElement;
  return root instanceof HTMLElement && isScrollable(root) ? root : null;
};

const isInteractive = (element: Element | null) =>
  !!element?.closest("a, button, input, textarea, select, [contenteditable]");

const createIndicator = (x: number, y: number) => {
  const indicator = document.createElement("div");
  Object.assign(indicator.style, {
    position: "fixed",
    left: `${x - 12}px`,
    top: `${y - 12}px`,
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    border: "2px solid rgba(255, 255, 255, 0.8)",
    background: "rgba(0, 0, 0, 0.5)",
    pointerEvents: "none",
    zIndex: "2147483647",
  });
  document.body.appendChild(indicator);
  return indicator;
};

const speedFor = (offset: number) =>
  Math.abs(offset) <= DEAD_ZONE
    ? 0
    : (offset - Math.sign(offset) * DEAD_ZONE) * SPEED;

/**
 * Middle-click autoscroll, which Chromium does not do on Linux: press the
 * middle button and move the mouse to scroll the area under it. A quick
 * click keeps scrolling until the next click; holding the button scrolls
 * until it is released.
 */
export function useMiddleClickAutoscroll() {
  useEffect(() => {
    let stop: (() => void) | null = null;

    const start = (event: MouseEvent) => {
      const container = findScrollContainer(event.target as Element);
      if (!container) return;

      event.preventDefault();
      const origin = { x: event.clientX, y: event.clientY };
      const pointer = { ...origin };
      const pressedAt = performance.now();
      const indicator = createIndicator(origin.x, origin.y);
      // Scroll positions are whole pixels, so slow speeds accumulate.
      const pending = { x: 0, y: 0 };
      const timer = setInterval(() => {
        pending.x += speedFor(pointer.x - origin.x);
        pending.y += speedFor(pointer.y - origin.y);
        const dx = Math.trunc(pending.x);
        const dy = Math.trunc(pending.y);
        if (dx || dy) {
          container.scrollBy(dx, dy);
          pending.x -= dx;
          pending.y -= dy;
        }
      }, FRAME_MS);

      const onMove = (moveEvent: MouseEvent) => {
        pointer.x = moveEvent.clientX;
        pointer.y = moveEvent.clientY;
      };
      const onUp = (upEvent: MouseEvent) => {
        if (upEvent.button !== 1) return;
        const moved =
          Math.hypot(pointer.x - origin.x, pointer.y - origin.y) > DEAD_ZONE;
        if (moved || performance.now() - pressedAt > STICKY_CLICK_MS) {
          stop?.();
        }
      };
      const onDown = (downEvent: MouseEvent) => {
        downEvent.preventDefault();
        downEvent.stopPropagation();
        stop?.();
      };
      const onKey = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape") stop?.();
      };

      stop = () => {
        clearInterval(timer);
        indicator.remove();
        window.removeEventListener("mousemove", onMove, true);
        window.removeEventListener("mouseup", onUp, true);
        window.removeEventListener("keydown", onKey, true);
        window.removeEventListener("wheel", stopOnWheel, true);
        window.removeEventListener("blur", stopOnWheel);
        // The click that ended sticky mode must not reach the page.
        setTimeout(
          () => window.removeEventListener("mousedown", onDown, true),
          0
        );
        stop = null;
      };
      const stopOnWheel = () => stop?.();

      window.addEventListener("mousemove", onMove, true);
      window.addEventListener("mouseup", onUp, true);
      window.addEventListener("keydown", onKey, true);
      window.addEventListener("wheel", stopOnWheel, true);
      window.addEventListener("blur", stopOnWheel);
      setTimeout(() => window.addEventListener("mousedown", onDown, true), 0);
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 1 || stop) return;
      if (isInteractive(event.target as Element)) return;
      start(event);
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      stop?.();
    };
  }, []);
}
