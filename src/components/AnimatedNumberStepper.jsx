import React, { useEffect, useMemo, useRef, useState } from 'react';

const ANIMATION_MS = 180;
const START_DELAY_MS = 16;

export default function AnimatedNumberStepper({
  value,
  min = 1,
  max = 1,
  onChange,
  formatValue = (nextValue) => String(nextValue),
  valueWidthClass = 'w-24',
}) {
  const clampedValue = useMemo(() => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.min(max, Math.max(min, Math.round(numeric)));
  }, [value, min, max]);

  const [displayValue, setDisplayValue] = useState(clampedValue);
  const [animationState, setAnimationState] = useState(null);
  const startTimeoutRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    setDisplayValue(clampedValue);
  }, []);

  useEffect(() => {
    if (clampedValue === displayValue) return;

    const direction = clampedValue > displayValue ? 'increase' : 'decrease';

    if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setAnimationState({
      previous: displayValue,
      next: clampedValue,
      direction,
      started: false,
    });

    // Delay by one tick so both layers paint in start positions, then move together.
    startTimeoutRef.current = setTimeout(() => {
      setAnimationState((state) => (state ? { ...state, started: true } : state));
      startTimeoutRef.current = null;
    }, START_DELAY_MS);

    timeoutRef.current = setTimeout(() => {
      setDisplayValue(clampedValue);
      setAnimationState(null);
      timeoutRef.current = null;
    }, ANIMATION_MS + START_DELAY_MS);

    return () => {
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [clampedValue, displayValue]);

  const atMin = clampedValue <= min;
  const atMax = clampedValue >= max;

  const handleStep = (delta) => {
    const nextValue = Math.min(max, Math.max(min, clampedValue + delta));
    if (nextValue === clampedValue) return;
    onChange?.(nextValue);
  };

  const numberBaseClass = 'absolute inset-0 flex items-center justify-center text-2xl font-bold text-white';

  const prevTransform = !animationState
    ? 'translateX(0%)'
    : animationState.direction === 'increase'
      ? (animationState.started ? 'translateX(-100%)' : 'translateX(0%)')
      : (animationState.started ? 'translateX(100%)' : 'translateX(0%)');

  const nextStartTransform = animationState?.direction === 'increase' ? 'translateX(100%)' : 'translateX(-100%)';
  const nextTransform = animationState
    ? (animationState.started ? 'translateX(0%)' : nextStartTransform)
    : 'translateX(0%)';

  return (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={() => handleStep(-1)}
        disabled={atMin}
        className={`w-[18px] h-[18px] rounded-full bg-slate-700 border border-slate-600 text-white text-[11px] leading-none flex items-center justify-center transition-colors ${
          atMin ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-600'
        }`}
      >
        -
      </button>

      <div className={`relative ${valueWidthClass} h-12 overflow-hidden rounded-lg`}>
        <div
          className={numberBaseClass}
          style={{
            transform: prevTransform,
            transition: animationState ? `transform ${ANIMATION_MS}ms ease-in-out` : 'none',
            zIndex: 1,
          }}
        >
          {formatValue(animationState ? animationState.previous : displayValue)}
        </div>

        {animationState && (
          <div
            className={numberBaseClass}
            style={{
              transform: nextTransform,
              transition: `transform ${ANIMATION_MS}ms ease-in-out`,
              zIndex: 2,
            }}
          >
            {formatValue(animationState.next)}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => handleStep(1)}
        disabled={atMax}
        className={`w-[18px] h-[18px] rounded-full bg-slate-700 border border-slate-600 text-white text-[11px] leading-none flex items-center justify-center transition-colors ${
          atMax ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-600'
        }`}
      >
        +
      </button>
    </div>
  );
}
