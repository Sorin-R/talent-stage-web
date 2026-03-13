import { useRef, useCallback, useEffect } from 'react';

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchCancel: (e: React.TouchEvent) => void;
}

export function useSwipe(
  onSwipeUp: () => void,
  onSwipeDown: () => void,
  isAnimating: boolean,
  onDragMove?: (dy: number) => void,
  onGestureEnd?: (didSwipe: boolean) => void,
  containerRef?: React.RefObject<HTMLDivElement | null>,
): SwipeHandlers {
  const ty0 = useRef(0);
  const tx0 = useRef(0);
  const dragActive = useRef(false);
  const directionLockRef = useRef<'up' | 'down' | null>(null);
  const swipeThresholdRef = useRef(55);

  // ── Wheel support (desktop) ───────────────────────────────────────────
  const wheelAccum = useRef(0);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const WHEEL_THRESHOLD = 120;
  const WHEEL_TIMEOUT = 300;

  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isAnimating) return;

      wheelAccum.current += e.deltaY;

      const previewDy = -Math.sign(wheelAccum.current) * Math.min(Math.abs(wheelAccum.current), 80);
      onDragMove?.(previewDy);

      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        onGestureEnd?.(false);
        wheelAccum.current = 0;
      }, WHEEL_TIMEOUT);

      if (Math.abs(wheelAccum.current) >= WHEEL_THRESHOLD) {
        const direction = wheelAccum.current > 0 ? 'up' : 'down';
        wheelAccum.current = 0;
        if (wheelTimer.current) clearTimeout(wheelTimer.current);
        onGestureEnd?.(true);
        if (direction === 'up') onSwipeUp();
        else onSwipeDown();
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
    };
  }, [isAnimating, onSwipeUp, onSwipeDown, onDragMove, onGestureEnd, containerRef]);

  // ── Touch handlers (unchanged) ────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimating) return;
    ty0.current = e.touches[0].clientY;
    tx0.current = e.touches[0].clientX;
    directionLockRef.current = null;
    const h = (e.currentTarget as HTMLElement | null)?.clientHeight || window.innerHeight || 0;
    // Reduce accidental direction flips by requiring a more deliberate swipe distance.
    swipeThresholdRef.current = Math.max(28, Math.floor(h * 0.08));
    dragActive.current = true;
    e.preventDefault();
  }, [isAnimating]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragActive.current || isAnimating) return;
    const dy = e.touches[0].clientY - ty0.current;
    const dx = e.touches[0].clientX - tx0.current;

    if (!directionLockRef.current && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
      directionLockRef.current = dy < 0 ? 'up' : 'down';
    }

    let displayDy = dy;
    if (directionLockRef.current === 'up') displayDy = Math.min(0, dy);
    if (directionLockRef.current === 'down') displayDy = Math.max(0, dy);

    onDragMove?.(displayDy);
    e.preventDefault();
  }, [isAnimating, onDragMove]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    dragActive.current = false;
    if (isAnimating) {
      directionLockRef.current = null;
      onGestureEnd?.(false);
      return;
    }
    const rawDy = e.changedTouches[0].clientY - ty0.current;
    const dx = e.changedTouches[0].clientX - tx0.current;
    const dy = directionLockRef.current === 'up'
      ? Math.min(0, rawDy)
      : directionLockRef.current === 'down'
        ? Math.max(0, rawDy)
        : rawDy;
    directionLockRef.current = null;

    // Ignore short or mostly-horizontal gestures.
    if (Math.abs(dy) < swipeThresholdRef.current || Math.abs(dy) < Math.abs(dx)) {
      onGestureEnd?.(false);
      return;
    }

    onGestureEnd?.(true);
    if (dy < 0) onSwipeUp();
    else onSwipeDown();
  }, [isAnimating, onSwipeUp, onSwipeDown, onGestureEnd]);

  const onTouchCancel = useCallback((e: React.TouchEvent) => {
    void e;
    dragActive.current = false;
    directionLockRef.current = null;
    onGestureEnd?.(false);
  }, [onGestureEnd]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
