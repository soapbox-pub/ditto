import { useState, useEffect } from 'react';

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

export function useEnvelopeDimensions() {
  const [dims, setDims] = useState(() => calcDims(window.innerWidth));
  useEffect(() => {
    const onResize = () => setDims(calcDims(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return dims;
}
