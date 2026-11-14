import { useLayoutEffect, useRef } from 'react';
import { formatNumber } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';

interface AnimatedCountProps {
  value: number;
  /** Formats the value for display. Defaults to {@link formatNumber}. */
  format?: (value: number) => string;
  /** Show nothing for 0 (the action bar's counts). Default true. */
  hideZero?: boolean;
  className?: string;
}

const ROLL_IN_MS = 350;
const ROLL_OUT_MS = 250;

/**
 * A count that rolls to its new value: the old number slides out and the new
 * one slides in, upward when it grows and downward when it shrinks.
 *
 * The number on screen is always the real value: the roll is an effect laid
 * over it, never a state it can get stuck in. It only runs on a count that's
 * on screen, and is cancelled if it hasn't finished in time. Counts arriving
 * (a first load from 0 to many) just appear; a single step, like your own
 * like, rolls.
 */
export function AnimatedCount({ value, format = formatNumber, hideZero = true, className }: AnimatedCountProps) {
  const label = (n: number) => (hideZero && n === 0 ? '' : format(n));
  const text = label(value);

  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const prevRef = useRef({ value, text });

  useLayoutEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { value, text };
    if (prev.text === text) return;

    const box = boxRef.current;
    const current = textRef.current;
    if (!box || !current) return;
    // Loading in from nothing isn't a change to show.
    if (!prev.text && Math.abs(value - prev.value) !== 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Offscreen (or in a skipped feed row) the animation wouldn't run.
    if (box.checkVisibility && !box.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true })) return;

    const up = value > prev.value;
    const shift = (dir: number) => `translateY(${dir * 90}%)`;

    const animations: Animation[] = [];
    animations.push(current.animate(
      [{ transform: shift(up ? 1 : -1), opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: ROLL_IN_MS, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.15)' },
    ));

    let old: HTMLSpanElement | undefined;
    if (prev.text) {
      old = document.createElement('span');
      old.textContent = prev.text;
      old.setAttribute('aria-hidden', 'true');
      old.className = 'absolute inset-0 pointer-events-none';
      box.appendChild(old);
      const out = old.animate(
        [{ transform: 'none', opacity: 1 }, { transform: shift(up ? -1 : 1), opacity: 0 }],
        { duration: ROLL_OUT_MS, easing: 'ease-in', fill: 'forwards' },
      );
      animations.push(out);
    }

    const finish = () => {
      for (const a of animations) a.cancel();
      old?.remove();
    };
    animations[0].onfinish = finish;
    // If the page stops drawing it (backgrounded, scrolled into a skipped
    // row) the animation stalls; never leave the number mid-roll.
    const timer = setTimeout(finish, ROLL_IN_MS + 150);
    return () => {
      clearTimeout(timer);
      finish();
    };
  }, [value, text]);

  if (!text) return null;

  return (
    <span ref={boxRef} className={cn('relative inline-block overflow-hidden tabular-nums', className)}>
      <span ref={textRef} className="inline-block">{text}</span>
    </span>
  );
}
