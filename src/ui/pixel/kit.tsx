/**
 * Small shared pieces for every screen drawn in pixel art: a buffer shown crisp on a
 * canvas, the pixel frame handed to the stylesheet, and portraits.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { Looks } from '../../city/types';
import { buttonImage, insetImage, panelImage, parchmentImage } from './frame';
import { renderPortrait } from './portrait';
import { Px } from './px';
import type { Style } from './styles';

export function toCanvas(px: Px): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = px.w;
  cv.height = px.h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(px.w, px.h);
  new Uint32Array(img.data.buffer).set(px.data);
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** A pixel buffer shown at an integer scale, crisp. */
export function PxView({ px, scale, label }: { px: Px; scale: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    cv.width = px.w;
    cv.height = px.h;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(px.w, px.h);
    new Uint32Array(img.data.buffer).set(px.data);
    ctx.putImageData(img, 0, 0);
  }, [px]);
  return <canvas ref={ref} className="px" role={label ? 'img' : undefined} aria-label={label} style={{ width: px.w * scale, height: px.h * scale }} />;
}

/** Draw the pixel frame images once and hand them to the stylesheet as border images. */
export function useFrame(st: Style) {
  useEffect(() => {
    const url = (p: Px) => toCanvas(p).toDataURL();
    const root = document.documentElement.style;
    root.setProperty('--pf-panel', `url(${url(panelImage(st))})`);
    root.setProperty('--pf-inset', `url(${url(insetImage(st))})`);
    root.setProperty('--pf-btn', `url(${url(buttonImage(st, false))})`);
    root.setProperty('--pf-btn-on', `url(${url(buttonImage(st, true))})`);
    root.setProperty('--pf-paper', `url(${url(parchmentImage(st))})`);
    document.documentElement.classList.add('framed');
    return () => document.documentElement.classList.remove('framed');
  }, [st]);
}

export interface FaceOf { id: number; looks: Looks; sex: 0 | 1; age: number; trade: number; cls: number; robe?: boolean }

/** A pixel portrait (40 by 40) at an integer scale. */
export function Face({ who, st, scale = 2, label }: { who: FaceOf; st: Style; scale?: number; label?: string }) {
  const px = useMemo(() => renderPortrait({ looks: who.looks, sex: who.sex, age: who.age, trade: who.trade, cls: who.cls, id: who.id, robe: who.robe }, st),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [who.id, who.looks, who.sex, Math.floor(who.age / 5), who.trade, who.cls, who.robe, st]);
  return <span className="portrait"><PxView px={px} scale={scale} label={label} /></span>;
}
