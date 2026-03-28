/**
 * SendAnimation
 *
 * Full-screen overlay: letter slides into envelope, flap closes, wax seal
 * stamps with the Ditto logo, floats away, then shows "Sent a letter to <name>!"
 *
 * Envelope colors are derived from the letter's stationery (theme colors).
 * The wax seal uses the stationery's primary color and the Ditto logo.
 */

import { useId, useRef, useEffect, useLayoutEffect, useCallback, useState, useMemo } from 'react';
import { hexToRgb, rgbToHex, darkenHex, blendHex } from '@/lib/colorUtils';

// ---------------------------------------------------------------------------
// Easing + animation driver
// ---------------------------------------------------------------------------

const ease = {
  inOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outQuart:   (t: number) => 1 - Math.pow(1 - t, 4),
  outQuint:   (t: number) => 1 - Math.pow(1 - t, 5),
  inQuad:     (t: number) => t * t,
};

function animateVal(
  ms: number, fn: (t: number) => void, done: () => void, e: (t: number) => number,
): () => void {
  let id = 0;
  const s = performance.now();
  const tick = (now: number) => {
    const raw = Math.min(1, (now - s) / ms);
    fn(e(raw));
    if (raw < 1) id = requestAnimationFrame(tick); else done();
  };
  id = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(id);
}

// ---------------------------------------------------------------------------
// Envelope dimensions — responsive, using vw-based sizing
// ---------------------------------------------------------------------------

export function useEnvelopeDimensions() {
  const [dims, setDims] = useState(() => calcDims(window.innerWidth));
  useEffect(() => {
    const onResize = () => setDims(calcDims(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return dims;
}

function calcDims(vw: number) {
  const envW = Math.min(Math.round(vw * 0.85), 420);
  const envH = Math.round(envW / 1.588);
  const r    = Math.round(envW * 0.041);
  const s    = envW / 54;

  const flapY    = Math.round(envH * 0.147);
  const vY       = Math.round(envH * 0.647);
  const flapTriH = Math.round(vY * 1.08);

  const letterW = Math.round(envW * 0.82);
  const letterH = letterW / (5 / 4);

  const strokeV      = Math.round(s * 1.6 * 10) / 10;
  const strokeCorner = Math.round(s * 1.4 * 10) / 10;

  return { envW, envH, r, flapY, vY, flapTriH, letterW, letterH, strokeV, strokeCorner };
}

// ---------------------------------------------------------------------------
// Derive envelope palette from stationery background + primary colors
// ---------------------------------------------------------------------------

function mixHex(hex: string, lightAmount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * lightAmount));
  return rgbToHex(mix(r), mix(g), mix(b));
}

function envelopeColors(bgHex: string, primaryHex: string) {
  // Tint the envelope body slightly toward the primary color so it
  // contrasts with the raw background even on matching themes.
  const body  = blendHex(bgHex, primaryHex, 0.08);
  const inner = blendHex(bgHex, primaryHex, 0.18);
  return {
    body,
    inner,
    stroke: darkenHex(body, 0.20),
    corner: darkenHex(body, 0.12),
    // Seal: use primary color
    sealBase:   primaryHex,
    sealDark:   darkenHex(primaryHex, 0.12),
    sealDarker: darkenHex(primaryHex, 0.22),
    sealEdge:   darkenHex(primaryHex, 0.18),
  };
}

// ---------------------------------------------------------------------------
// Confetti particles for the confirmation screen
// ---------------------------------------------------------------------------

interface ConfettiParticle {
  delay: number;
  duration: number;
  size: number;
  startRotate: number;
  color: string;
}

function generateParticles(count: number, primaryHex: string): ConfettiParticle[] {
  const [r, g, b] = hexToRgb(primaryHex);
  const colors = [
    primaryHex,
    mixHex(primaryHex, 0.25),
    mixHex(primaryHex, 0.45),
    darkenHex(primaryHex, 0.15),
    rgbToHex(r, g, Math.min(255, b + 40)),
  ];
  return Array.from({ length: count }, () => ({
    delay:       Math.random() * 1.8,
    duration:    2.5 + Math.random() * 2,
    size:        18 + Math.random() * 16,
    startRotate: Math.random() * 360,
    color:       colors[Math.floor(Math.random() * colors.length)],
  }));
}

function haptic(pattern: number | number[] = 30) {
  try { navigator?.vibrate?.(pattern); } catch { /* unsupported */ }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SendAnimationProps {
  /** Pre-rendered letter element to animate */
  letterElement: React.ReactNode;
  /** Width of the letter element in px */
  letterWidth: number;
  recipientName: string;
  recipientPicture?: string;
  /** Background hex color of the stationery (used for envelope) */
  bgColor: string;
  /** Primary hex color of the stationery (used for wax seal) */
  primaryColor: string;
  /** Text/foreground color of the stationery (used for V-fold crease lines) */
  textColor: string;
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SendAnimation({
  letterElement, letterWidth,
  recipientName, recipientPicture,
  bgColor, primaryColor, textColor,
  onComplete,
}: SendAnimationProps) {
  const d = useEnvelopeDimensions();
  const splatId = useId();

  const [t, setT] = useState(0);
  const cancelRef = useRef<() => void>();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const C = useMemo(() => envelopeColors(bgColor, primaryColor), [bgColor, primaryColor]);
  const particles = useMemo(() => generateParticles(12, primaryColor), [primaryColor]);

  const sealHapticFired = useRef(false);
  const cleanup = useCallback(() => { cancelRef.current?.(); cancelRef.current = undefined; }, []);
  useEffect(() => () => cleanup(), [cleanup]);

  useLayoutEffect(() => {
    cancelRef.current = animateVal(9000, setT, () => {
      onCompleteRef.current();
    }, ease.inOutCubic);
    return cleanup;
  }, [cleanup]);

  const sub = (lo: number, hi: number) => Math.max(0, Math.min(1, (t - lo) / (hi - lo)));

  const envAppear = ease.outQuint(sub(0.0,  0.06));
  const slideIn   = ease.outQuart(sub(0.04, 0.16));
  const flapClose = ease.outQuart(sub(0.15, 0.21));
  const sealP     = ease.inOutCubic(sub(0.18, 0.38));
  const flyP      = ease.inQuad(sub(0.48,  0.58));
  const confirmP  = ease.outQuart(sub(0.58, 0.65));
  const fadeOutP  = ease.inQuad(sub(0.92,  1.00));

  const letterTop = -d.letterH + slideIn * (d.letterH + d.flapY);
  const flapDeg   = flapClose * 180;

  // Seal
  const sealVisible  = sealP > 0;
  const sealDropY    = (1 - sealP) * -120;
  const impactT      = Math.max(0, (sealP - 0.75) / 0.25);
  const sealScaleX   = impactT === 0 ? 1 : impactT < 0.4 ? 1 + impactT / 0.4 * 0.08 : 1.08 - (impactT - 0.4) / 0.6 * 0.08;
  const sealScaleY   = impactT === 0 ? 1 : impactT < 0.4 ? 1 - impactT / 0.4 * 0.06 : 0.94 + (impactT - 0.4) / 0.6 * 0.06;
  const splatScale   = impactT < 0.3 ? impactT / 0.3 : 1;
  const sealShadowBlur = (1 - sealP) * 24 + 4;
  const sealShadowY    = (1 - sealP) * 30 + 2;

  if (impactT > 0 && !sealHapticFired.current) {
    sealHapticFired.current = true;
    haptic([15, 30, 50]);
  }

  // Fly
  const flyY       = flyP * -250;
  const flyOpacity = 1 - flyP;
  const flyRotate  = Math.sin(flyP * Math.PI) * 2;

  const sealSize = Math.round(d.envW * 0.19);
  const sealHalf = sealSize / 2;
  const splatSize = Math.round(sealSize * 1.3);

  const stageH = d.letterH + d.flapTriH + d.envH + 60;

  return (
    <div
      className="absolute inset-0 z-50 bg-background flex items-center justify-center overflow-hidden"
      style={{ opacity: 1 - fadeOutP }}
    >
      {/* Envelope animation */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ opacity: 1 - confirmP }}
      >
        <div className="relative" style={{ width: d.envW + 40, height: stageH, marginTop: -60 }}>
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: flyP > 0 ? `translateY(${flyY}px) rotate(${flyRotate}deg)` : undefined,
              opacity:   flyP > 0 ? flyOpacity : 1,
            }}
          >
            <div
              className="relative"
              style={{
                width: d.envW, height: d.envH,
                marginTop: d.flapTriH,
                opacity: envAppear,
                transform: `scale(${0.94 + envAppear * 0.06})`,
              }}
            >
              {/* Flap */}
              <div
                style={{
                  position: 'absolute', bottom: '100%', left: 0,
                  width: d.envW, height: d.flapTriH,
                  transformOrigin: 'bottom center',
                  transform: `rotateX(${flapDeg}deg)`,
                  transformStyle: 'preserve-3d',
                  zIndex: flapDeg > 90 ? 4 : -1,
                }}
              >
                {/* Front face: inner lining color */}
                <svg
                  width={d.envW} height={d.flapTriH}
                  viewBox={`0 0 ${d.envW} ${d.flapTriH}`}
                  className="absolute inset-0"
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <path
                    d={`M${d.r * 0.65},${d.flapTriH} L${d.envW / 2 - d.r},${d.r} Q${d.envW / 2},0 ${d.envW / 2 + d.r},${d.r} L${d.envW - d.r * 0.65},${d.flapTriH} Z`}
                    fill={C.inner}
                  />
                </svg>
                {/* Back face: body color */}
                <svg
                  width={d.envW} height={d.flapTriH}
                  viewBox={`0 0 ${d.envW} ${d.flapTriH}`}
                  className="absolute inset-0"
                  style={{ backfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}
                >
                  <path
                    d={`M${d.r},0 Q0,0 0,${d.r} L0,${d.flapY} L${d.envW / 2 - d.r},${d.flapTriH - d.r} Q${d.envW / 2},${d.flapTriH} ${d.envW / 2 + d.r},${d.flapTriH - d.r} L${d.envW},${d.flapY} L${d.envW},${d.r} Q${d.envW},0 ${d.envW - d.r},0 Z`}
                    fill={C.body}
                  />
                  <path
                    d={`M0,${d.flapY} L${d.envW / 2 - d.r},${d.flapTriH - d.r} Q${d.envW / 2},${d.flapTriH} ${d.envW / 2 + d.r},${d.flapTriH - d.r} L${d.envW},${d.flapY}`}
                    stroke={textColor} strokeWidth={d.strokeV} strokeLinecap="round" strokeLinejoin="round" fill="none"
                  />
                </svg>
              </div>

              {/* Back wall */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: C.body,
                  borderRadius: d.r,
                  boxShadow: '0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)',
                }}
              />

              {/* Inner lining */}
              <div
                className="absolute overflow-hidden"
                style={{
                  top: 0, left: 0, right: 0, height: d.vY,
                  borderRadius: `${d.r}px ${d.r}px 0 0`,
                  backgroundColor: C.inner,
                  zIndex: 0,
                }}
              />

              {/* Corner fold lines */}
              <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: d.r, zIndex: 1 }}>
                <svg className="absolute inset-0" width={d.envW} height={d.envH} viewBox={`0 0 ${d.envW} ${d.envH}`}>
                  <path d={`M2,${d.envH - 2} L${d.envW * 0.35},${d.envH * 0.5}`} stroke={C.corner} strokeWidth={d.strokeCorner} strokeLinecap="round" fill="none" opacity="0.5" />
                  <path d={`M${d.envW - 2},${d.envH - 2} L${d.envW * 0.65},${d.envH * 0.5}`} stroke={C.corner} strokeWidth={d.strokeCorner} strokeLinecap="round" fill="none" opacity="0.5" />
                </svg>
              </div>

              {/* Letter clip */}
              <div
                className="absolute overflow-hidden"
                style={{
                  top: -(d.letterH + d.flapTriH), left: 0, right: 0, bottom: 0,
                  borderRadius: `0 0 ${d.r}px ${d.r}px`,
                  zIndex: 1,
                }}
              >
                <div
                  className="absolute"
                  style={{
                    left: (d.envW - letterWidth) / 2,
                    width: letterWidth,
                    top: d.letterH + d.flapTriH + letterTop,
                  }}
                >
                  {letterElement}
                </div>
              </div>

              {/* Front V-fold pocket */}
              <svg
                className="absolute inset-0 pointer-events-none"
                width={d.envW} height={d.envH}
                viewBox={`0 0 ${d.envW} ${d.envH}`}
                style={{ zIndex: 2 }}
              >
                <path
                  d={`M0,${d.flapY} L${d.envW / 2 - d.r},${d.vY - d.r} Q${d.envW / 2},${d.vY} ${d.envW / 2 + d.r},${d.vY - d.r} L${d.envW},${d.flapY} L${d.envW},${d.envH - d.r} Q${d.envW},${d.envH} ${d.envW - d.r},${d.envH} L${d.r},${d.envH} Q0,${d.envH} 0,${d.envH - d.r} Z`}
                  fill={C.body}
                />
                {/* V crease lines in stationery text color */}
                <path
                  d={`M0,${d.flapY} L${d.envW / 2 - d.r},${d.vY - d.r} Q${d.envW / 2},${d.vY} ${d.envW / 2 + d.r},${d.vY - d.r} L${d.envW},${d.flapY}`}
                  fill="none"
                  stroke={textColor}
                  strokeWidth={d.strokeV}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Wax seal */}
              {sealVisible && (
                <div
                  className="absolute"
                  style={{
                    left: d.envW / 2 - sealHalf,
                    top:  d.vY - sealHalf,
                    width: sealSize, height: sealSize,
                    zIndex: 5,
                    transform: `translateY(${sealDropY}px) scaleX(${sealScaleX}) scaleY(${sealScaleY})`,
                    transformOrigin: 'center center',
                  }}
                >
                  {/* Splat blob on impact */}
                  {impactT > 0 && (
                    <svg
                      className="absolute"
                      width={splatSize} height={splatSize}
                      viewBox="0 0 84 84"
                      style={{
                        left: -(splatSize - sealSize) / 2,
                        top:  -(splatSize - sealSize) / 2,
                        transform: `scale(${0.88 + splatScale * 0.12})`,
                      }}
                    >
                      <defs>
                        <radialGradient id={splatId}>
                          <stop offset="0%"   stopColor={C.sealBase} />
                          <stop offset="50%"  stopColor={C.sealDark} />
                          <stop offset="85%"  stopColor={C.sealDarker} />
                          <stop offset="100%" stopColor={C.sealDarker} stopOpacity="0.6" />
                        </radialGradient>
                      </defs>
                      <path
                        d="M42 3 C50 2, 58 7, 64 13 C69 18, 76 24, 78 33 C80 41, 82 48, 77 56 C73 62, 66 70, 56 73 C48 76, 40 78, 32 74 C24 71, 14 66, 9 58 C5 50, 2 42, 4 34 C6 26, 12 18, 19 12 C26 6, 34 4, 42 3 Z"
                        fill={`url(#${splatId})`}
                      />
                      <path
                        d="M42 3 C50 2, 58 7, 64 13 C69 18, 76 24, 78 33 C80 41, 82 48, 77 56 C73 62, 66 70, 56 73 C48 76, 40 78, 32 74 C24 71, 14 66, 9 58 C5 50, 2 42, 4 34 C6 26, 12 18, 19 12 C26 6, 34 4, 42 3 Z"
                        fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1"
                      />
                    </svg>
                  )}

                  {/* Seal disc */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      inset: 2,
                      background: `
                        radial-gradient(ellipse at 35% 30%, rgba(255,255,255,0.22) 0%, transparent 50%),
                        radial-gradient(ellipse at 65% 70%, rgba(0,0,0,0.14) 0%, transparent 50%),
                        radial-gradient(circle at 50% 50%, ${C.sealBase} 0%, ${C.sealDark} 55%, ${C.sealDarker} 100%)
                      `,
                      boxShadow: `
                        0 ${sealShadowY}px ${sealShadowBlur}px rgba(0,0,0,0.28),
                        0 1px 3px rgba(0,0,0,0.14),
                        inset 0 1.5px 2px rgba(255,255,255,0.18),
                        inset 0 -1.5px 2px rgba(0,0,0,0.18)
                      `,
                      border: `2px solid ${C.sealEdge}`,
                    }}
                  />

                  {/* Ditto logo */}
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ zIndex: 1 }}
                  >
                    <img
                      src="/logo.svg"
                      alt=""
                      style={{
                        width: sealSize * 0.58,
                        height: sealSize * 0.58,
                        filter: 'brightness(0) invert(1) opacity(0.85)',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Contact shadow */}
              <div
                className="absolute left-4 right-4"
                style={{
                  bottom: -4, height: 8,
                  background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.06) 0%, transparent 70%)',
                  zIndex: -1, borderRadius: '50%',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation */}
      {confirmP > 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center overflow-hidden"
          style={{ opacity: confirmP }}
        >
          <div className="relative text-center space-y-5 px-6" style={{ transform: `translateY(${(1 - confirmP) * 12}px)` }}>
            <div className="relative mx-auto" style={{ width: 96, height: 96 }}>
              {/* Confetti burst */}
              {particles.map((p, i) => {
                const angle = (i / particles.length) * 360 + p.startRotate * 0.3;
                const rad   = (angle * Math.PI) / 180;
                const dist  = 60 + p.size * 3;
                const tx    = Math.cos(rad) * dist;
                const ty    = Math.sin(rad) * dist;
                return (
                  <svg
                    key={i}
                    className="absolute pointer-events-none"
                    width={p.size} height={p.size}
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{
                      left: '50%', top: '50%',
                      marginLeft: -p.size / 2, marginTop: -p.size / 2,
                      opacity: 0,
                      animation: `letter-send-burst ${p.duration}s ease-out ${p.delay * 0.4}s both`,
                      '--burst-tx': `${tx}px`,
                      '--burst-ty': `${ty}px`,
                      '--burst-rot': `${p.startRotate}deg`,
                    } as React.CSSProperties}
                  >
                    <circle cx="12" cy="12" r="5" fill={p.color} opacity={0.8} />
                  </svg>
                );
              })}
              {/* Avatar */}
              <div
                className="w-24 h-24 rounded-full border-4 flex items-center justify-center overflow-hidden"
                style={{
                  backgroundColor: bgColor,
                  borderColor: C.stroke,
                  animation: 'letter-send-avatar-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both',
                }}
              >
                {recipientPicture ? (
                  <img src={recipientPicture} alt="" className="w-full h-full object-cover" />
                ) : (
                  <img src="/logo.svg" alt="" style={{ width: 44, height: 44, opacity: 0.5 }} />
                )}
              </div>
            </div>
            <p
              className="text-2xl font-bold text-foreground"
              style={{ opacity: 0, animation: 'letter-send-fade-up 0.5s ease-out 0.3s forwards' }}
            >
              Sent a letter to {recipientName}!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
