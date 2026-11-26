import '@fontsource/overlock/700.css';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useIntl } from 'react-intl';

import { playProceed } from '@/lib/ocarinaAudio';
import { cn } from '@/lib/utils';

/** A stretch of what's said, in the games' white, or red for a name worth remembering. */
export interface TalkPart {
  text: string;
  red?: boolean;
}

export interface TalkChoice {
  label: string;
  onChoose: () => void;
}

interface OcarinaTalkProps {
  line: TalkPart[];
  /** Tapping the box once it's all said goes on to this. */
  onNext?: () => void;
  /** Answers to pick from, in green, once it's all said. */
  choices?: TalkChoice[];
  className?: string;
}

/**
 * Words in the black box Ocarina of Time spoke in: smoked glass with its
 * edges gone soft, words a warm white set down a few letters at a time, and
 * the green square that says it's done, or the choices it's asking for.
 * Tap or press enter to hear the rest at once, and again to go on.
 *
 * Sizes follow the width it's given.
 */
export function OcarinaTalk({ line, onNext, choices, className }: OcarinaTalkProps) {
  const intl = useIntl();
  const text = line.map((part) => part.text).join('');
  const typed = useTyped(text);
  const box = useRef<HTMLDivElement>(null);
  const said = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLCanvasElement>(null);
  const [picked, setPicked] = useState(0);
  const options = typed.done ? choices ?? [] : [];
  const asking = options.length > 0;
  useNative(box, said, picture, `${typed.count}:${asking}`);

  useEffect(() => setPicked(0), [text]);
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, [text]);

  const choose = (index: number) => {
    const choice = options[index];
    if (!choice) return;
    playProceed();
    choice.onChoose();
  };
  const go = () => {
    if (!typed.done) typed.finish();
    else if (asking) choose(picked);
    else if (onNext) {
      playProceed();
      onNext();
    }
  };

  // Lay the words out a letter at a time, each part in its own ink.
  let left = typed.count;
  const shown = line.map((part, i) => {
    const take = Math.max(0, Math.min(part.text.length, left));
    left -= take;
    return (
      <span key={i} className={part.red ? '[caret-color:#ff4b3e]' : undefined}>
        {part.text.slice(0, take)}
      </span>
    );
  });

  return (
    <div className={cn('[container-type:inline-size]', className)}>
      <div
        ref={box}
        role="button"
        tabIndex={0}
        aria-label={!typed.done
          ? intl.formatMessage({ id: 'ocarina.talk.hearRest', defaultMessage: 'Hear the rest' })
          : intl.formatMessage({ id: 'ocarina.talk.goOn', defaultMessage: 'Go on' })}
        onClick={() => {
          if (!asking) go();
        }}
        onKeyDown={(e) => {
          if (asking && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            const by = e.key === 'ArrowDown' ? 1 : -1;
            setPicked((at) => (at + by + options.length) % options.length);
            return;
          }
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          if (!e.repeat) go();
        }}
        className="ocarina-talk-open relative isolate flex min-h-[max(6.5rem,24.4cqw)] w-full cursor-pointer select-none flex-col justify-center px-[10%] py-[max(0.9rem,3.2cqw)] outline-none focus-visible:ring-2 focus-visible:ring-[#23d36b]/70"
        style={{ fontFamily: "'Overlock', 'Quicksand Variable', sans-serif", fontWeight: 700, wordSpacing: '0.28em', borderRadius: '2.7cqw' }}
      >
        {/* The box: a little short of black, and soft at its edges the way the picture was soft all over */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-black/[0.62]" style={{ borderRadius: '2.7cqw', filter: 'blur(clamp(0.5px, 0.12cqw, 1px))' }} />
        <div ref={said} className="text-transparent [caret-color:#fff7e4]" style={{ fontSize: 'max(16px, 3.8cqw)', lineHeight: 1.28 }}>
          <p aria-live="polite">
            {shown}
            {/* What's still to come holds its place, so the words don't drift as they're said */}
            <span aria-hidden className="invisible">{text.slice(typed.count)}</span>
          </p>
          {asking && (
            <div role="listbox" aria-label={text} className="mt-[0.4em] flex flex-col items-start pl-[1.4em] [caret-color:#3fd06a]">
              {options.map((choice, i) => (
                <button
                  key={choice.label}
                  type="button"
                  role="option"
                  aria-selected={i === picked}
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPicked(i);
                    choose(i);
                  }}
                  onPointerEnter={() => setPicked(i)}
                  className="relative cursor-pointer text-transparent outline-none"
                >
                  {i === picked && (
                    <span
                      aria-hidden
                      className="ocarina-talk-cursor absolute -left-[1.1em] top-1/2 size-0 -translate-y-1/2 border-y-[0.32em] border-l-[0.5em] border-y-transparent border-l-[#5ad0ff]"
                    />
                  )}
                  {choice.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <canvas ref={picture} aria-hidden className="pointer-events-none absolute left-0 top-0" />
        {typed.done && !asking && (
          <span aria-hidden className="ocarina-talk-done absolute bottom-[1.2cqw] left-1/2 size-[max(10px,2.3cqw)] -translate-x-1/2 bg-[#23d36b]" />
        )}
        <style>{TALK_CSS}</style>
      </div>
    </div>
  );
}

const TALK_CSS = `
.ocarina-talk-done { animation: ocarina-talk-done 0.9s ease-in-out infinite alternate; }
.ocarina-talk-cursor { animation: ocarina-talk-cursor 0.5s ease-in-out infinite alternate; }
.ocarina-talk-open { animation: ocarina-talk-open 0.2s ease-out both; }
@keyframes ocarina-talk-open { from { scale: 1 0.1; opacity: 0; } }
@keyframes ocarina-talk-done { from { opacity: 1; } to { opacity: 0.35; } }
@keyframes ocarina-talk-cursor { to { translate: 0.2em 0; } }
@media (prefers-reduced-motion: reduce) { .ocarina-talk-done, .ocarina-talk-cursor, .ocarina-talk-open { animation: none; } }
`;

/** Words set down a few letters at a time, pausing after each sentence. */
function useTyped(text: string) {
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [typed, setTyped] = useState({ text, n: still ? text.length : 0 });
  if (typed.text !== text) setTyped({ text, n: still ? text.length : 0 });
  const n = typed.text === text ? typed.n : 0;
  useEffect(() => {
    if (n >= text.length) return;
    const last = text[n - 1] ?? '';
    const pause = /[.?!…。？！]/.test(last) ? 320 : /[,;:—、]/.test(last) ? 140 : 34;
    const timer = setTimeout(() => setTyped({ text, n: n + 1 }), pause);
    return () => clearTimeout(timer);
  }, [n, text]);
  return { count: n, done: n >= text.length, finish: () => setTyped({ text, n: text.length }) };
}

/** Ocarina of Time's words as they're seen captured at 640 by 480: twenty-five pixels to a line, each a little soft. */
const NATIVE_LINE = 25;

/**
 * Draws the words in `from` as the console did: at its own few pixels to a
 * letter, a one-pixel shadow under each, the whole stretched up smooth to the
 * size they take here. The words stay where they are, unseen, for reading
 * aloud and tapping; only their picture is drawn.
 */
function useNative(box: RefObject<HTMLDivElement | null>, from: RefObject<HTMLDivElement | null>, canvas: RefObject<HTMLCanvasElement | null>, shown: string) {
  const draw = useCallback(() => {
    const [b, c, root] = [box.current, canvas.current, from.current];
    const ctx = c?.getContext('2d');
    if (!b || !c || !root || !ctx) return;
    const at = b.getBoundingClientRect();
    const style = getComputedStyle(root);
    const size = parseFloat(style.fontSize);
    /** How big one of the console's pixels is here. */
    const px = (parseFloat(style.lineHeight) || size * 1.28) / NATIVE_LINE;
    const [w, h] = [Math.ceil(at.width / px), Math.ceil(at.height / px)];
    if (c.width !== w || c.height !== h) [c.width, c.height] = [w, h];
    c.style.width = `${w * px}px`;
    c.style.height = `${h * px}px`;
    ctx.clearRect(0, 0, w, h);
    ctx.font = `700 ${size / px}px Overlock, sans-serif`;
    ctx.textBaseline = 'middle';
    const range = document.createRange();
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      const host = node.parentElement;
      if (!host || host.closest('.invisible')) continue;
      const ink = getComputedStyle(host).caretColor;
      const text = node.textContent ?? '';
      for (let i = 0; i < text.length; i++) {
        if (text[i] === ' ') continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getClientRects()[0];
        if (!r) continue;
        const x = (r.left - at.left) / px;
        const y = ((r.top + r.bottom) / 2 - at.top) / px;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#000';
        ctx.fillText(text[i], x + 1, y + 1);
        ctx.globalAlpha = 1;
        ctx.fillStyle = ink;
        ctx.fillText(text[i], x, y);
      }
    }
  }, [box, from, canvas]);

  useLayoutEffect(draw, [draw, shown]);
  useEffect(() => {
    const observer = new ResizeObserver(draw);
    if (box.current) observer.observe(box.current);
    document.fonts.ready.then(draw);
    return () => observer.disconnect();
  }, [box, draw]);
}
