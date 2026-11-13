/**
 * Procedural portraits. Every person gets a face that is stable for life and changes
 * plausibly with age: features come from their own seed, colouring and styles from their
 * culture (whose skin tone follows the climate of its homeland), and dress from their
 * occupation, rank and the technological era of their home.
 */
import { memo, useId } from 'react';
import type { Look } from '../../engine/query';
import { clamp, css, hash, hsl, mix, ramp, rng, shade, type RGB } from './rng';

const SKIN: RGB[] = [[246, 220, 200], [234, 192, 158], [206, 152, 112], [160, 106, 70], [112, 70, 44], [74, 46, 30]];
const HAIR: RGB[] = [[24, 18, 16], [52, 34, 24], [96, 62, 38], [140, 76, 40], [196, 150, 84], [226, 196, 128]];
const EYES: RGB[] = [[46, 30, 20], [84, 54, 30], [90, 110, 60], [70, 110, 150]];

type Kind = 'crown' | 'priest' | 'laurel' | 'helm' | 'feather' | 'circlet' | 'prophet' | null;
function headgear(title: string, occ: number, era: number): Kind {
  const t = title.toLowerCase();
  if (t.includes('prophet')) return 'prophet';
  if (t.includes('priest')) return 'priest';
  if (t.includes('emper') || t.includes('king') || t.includes('queen')) return era >= 2 ? 'crown' : 'feather';
  if (t.includes('consul') || t.includes('speaker')) return 'laurel';
  if (t.includes('warlord')) return 'helm';
  if (t.includes('chief') || t.includes('head')) return era >= 3 ? 'circlet' : 'feather';
  if (t.includes('lord') || t.includes('lady')) return 'circlet';
  if (occ === 9) return 'helm';
  if (occ === 11) return 'priest';
  return null;
}

interface CultureStyle { hairF: number[]; hairM: number[]; beard: number; paint: number; hairTone: number; veil: number; nose: number; eyeShape: number; pattern: number }
function cultureStyle(style: number): CultureStyle {
  const r = rng(style * 977 + 13);
  const pick = (n: number, k: number) => { const a = [...Array(n).keys()]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); };
  return { hairF: pick(6, 3), hairM: pick(6, 3), beard: r(), paint: r(), hairTone: r(), veil: r(), nose: r(), eyeShape: r(), pattern: Math.floor(r() * 4) };
}

export interface PortraitProps { look: Look | null | undefined; size?: number; className?: string; title?: string; framed?: boolean }

export const Portrait = memo(function Portrait({ look, size = 64, className, title, framed = true }: PortraitProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (!look) return <span className={`portrait empty-portrait ${className ?? ''}`} style={{ width: size, height: size * 1.2 }} />;
  const cs = cultureStyle(look.style);
  const r = rng(look.seed * 7919 + 1);
  const age = look.age;
  const child = age < 14;
  const teen = age >= 14 && age < 18;
  const male = look.sex === 1;
  const old = clamp((age - 40) / 35);
  const gk = headgear(look.title, look.occ, look.era);
  const ruler = !!look.title && !['priest', 'prophet'].includes(gk ?? '') ;

  // colouring
  let skin = ramp(SKIN, look.skin);
  if (look.alive && look.health < 0.45) skin = mix(skin, [170, 176, 150], (0.45 - look.health) * 0.9);
  const skinD = shade(skin, -0.18);
  const skinL = shade(skin, 0.12);
  const lightHair = look.skin < 0.4 ? cs.hairTone * (1 - look.skin * 1.6) + (r() - 0.5) * 0.25 : 0;
  let hair = ramp(HAIR, clamp(lightHair * 1.2 + (look.skin < 0.5 ? r() * 0.12 : 0)));
  const grey = clamp((age - 42 + (r() - 0.5) * 16) / 28);
  hair = mix(hair, [196, 192, 186], grey * 0.9);
  const eye = look.skin > 0.45 ? EYES[r() < 0.8 ? 0 : 1] : EYES[Math.floor(clamp(cs.hairTone * 0.7 + r() * 0.6) * 3.99)];
  const lip = mix(skinD, [150, 70, 70], 0.25 + (male ? 0 : 0.2));

  // proportions
  const fw = 15.5 + r() * 3 + (male ? 0.8 : 0) - (child ? 2 : 0);
  const fh = 19.5 + r() * 2.5 - (child ? 2.5 : 0);
  const cx = 50, cy = child ? 62 : 56;
  const jaw = male ? 0.82 + r() * 0.14 : 0.72 + r() * 0.12;
  const eyeY = cy + (child ? 1 : -1) + r() * 1.5;
  const eyeDx = 6.2 + r() * 1.4;
  const eyeR = (child ? 2.6 : 2.0) + r() * 0.5;
  const narrow = cs.eyeShape > 0.6 ? 0.6 + r() * 0.15 : 0.85 + r() * 0.15;
  const noseL = 7 + r() * 3 + (child ? -2 : 0);
  const noseW = 2.6 + r() * 1.6 + cs.nose * 1.2;
  const mouthY = cy + fh * 0.55;
  const mouthW = 4.5 + r() * 2.5;
  const browTh = male ? 1.6 + r() * 0.8 : 1 + r() * 0.5;
  const browTilt = (r() - 0.5) * 2;
  const smile = (look.alive ? 0.4 : 0) + (r() - 0.5) * 1.4;

  // dress
  const status = look.status;
  const hue = look.culHue + (r() - 0.5) * 30;
  const era = look.era;
  let cloth: RGB;
  if (look.occ === 11 || gk === 'priest' || gk === 'prophet') cloth = cs.pattern % 2 ? [226, 220, 204] : [52, 44, 60];
  else if (era === 0) cloth = mix([122, 88, 58], [160, 126, 86], r());
  else if (era === 1) cloth = mix([176, 160, 128], [138, 124, 100], r());
  else cloth = hsl(hue, 0.25 + status * 0.45, 0.28 + r() * 0.18);
  if (look.occ === 10) cloth = mix(cloth, [40, 40, 56], 0.5);
  const trim: RGB = status > 0.6 || ruler ? [214, 172, 72] : shade(cloth, 0.25);
  const metal: RGB = era <= 1 ? [140, 104, 72] : era === 2 ? [184, 132, 64] : [160, 166, 172];
  const gold: RGB = [226, 182, 74];

  // hairstyle: index into a small set; culture picks which ones it uses
  const styleSet = male ? cs.hairM : cs.hairF;
  const hs = styleSet[Math.floor(r() * styleSet.length)];
  const bald = male && age > 35 && r() < old * 0.9;
  const beard = male && !child && !teen && r() < 0.25 + cs.beard * 0.7 ? (r() < 0.5 ? 'full' : r() < 0.6 ? 'short' : 'moustache') : null;
  const veiled = !male && !child && cs.veil > 0.72 && era >= 2 && gk === null;
  const paint = era <= 1 && cs.paint > 0.55 && !child && r() < 0.8;
  const earring = !child && (cs.pattern === 1 || status > 0.7) && r() < 0.6;

  const bg1 = hsl(look.culHue, 0.35, 0.36);
  const bg2 = hsl(look.culHue + 20, 0.35, 0.16);
  const top = cy - fh;

  const hairBack = (() => {
    if (bald || veiled) return null;
    if (!male && (hs % 3 !== 2)) {
      const len = hs === 0 ? 40 : hs === 1 ? 28 : 18;
      return <path d={`M${cx - fw - 3},${cy - 4} Q${cx - fw - 7},${cy + len * 0.6} ${cx - fw + 1},${cy + len} L${cx + fw - 1},${cy + len} Q${cx + fw + 7},${cy + len * 0.6} ${cx + fw + 3},${cy - 4} Z`} fill={css(hair)} />;
    }
    if (male && hs === 4) return <path d={`M${cx - fw - 2},${cy} Q${cx - fw - 5},${cy + 22} ${cx - fw + 3},${cy + 26} L${cx + fw - 3},${cy + 26} Q${cx + fw + 5},${cy + 22} ${cx + fw + 2},${cy} Z`} fill={css(hair)} />;
    return null;
  })();

  const hairFront = (() => {
    if (veiled) return null;
    if (bald) return <path d={`M${cx - fw},${cy - 2} Q${cx - fw - 1},${cy - 10} ${cx - fw + 4},${cy - 12} M${cx + fw},${cy - 2} Q${cx + fw + 1},${cy - 10} ${cx + fw - 4},${cy - 12}`} stroke={css(hair)} strokeWidth={3} fill="none" strokeLinecap="round" />;
    const cap = `M${cx - fw - 1.5},${cy - 2} C${cx - fw - 3},${top - 6} ${cx + fw + 3},${top - 6} ${cx + fw + 1.5},${cy - 2}`;
    const variant = hs % 6;
    if (variant === 0) return <path d={`${cap} Q${cx + fw - 2},${top + 4} ${cx + 2},${top + 5} Q${cx - fw + 2},${top + 6} ${cx - fw - 1.5},${cy - 2} Z`} fill={css(hair)} />;
    if (variant === 1) return <path d={`${cap} Q${cx + 4},${top + 9} ${cx - 3},${top + 3} Q${cx - 8},${top + 10} ${cx - fw - 1.5},${cy - 2} Z`} fill={css(hair)} />;
    if (variant === 2) return <g fill={css(hair)}><path d={`${cap} Q${cx},${top + 3} ${cx - fw - 1.5},${cy - 2} Z`} /><circle cx={cx} cy={top - 4} r={6.5} /></g>;
    if (variant === 3) return <path d={`${cap} L${cx + fw - 3},${top + 7} L${cx + 5},${top + 4} L${cx},${top + 8} L${cx - 6},${top + 4} L${cx - fw + 3},${top + 7} Z`} fill={css(hair)} />;
    if (variant === 4) return <path d={`${cap} Q${cx},${top + 2} ${cx - fw - 1.5},${cy - 2} Z`} fill={css(hair)} />;
    return <g fill={css(hair)}><path d={`${cap} Q${cx},${top + 6} ${cx - fw - 1.5},${cy - 2} Z`} />
      {!male && <><path d={`M${cx - fw - 1},${cy - 2} q-3,14 1,30 q3,-14 3,-28 Z`} /><path d={`M${cx + fw + 1},${cy - 2} q3,14 -1,30 q-3,-14 -3,-28 Z`} /></>}</g>;
  })();

  const lineC = css(shade(skin, -0.38), 0.55);
  const wr = old;
  const filter = look.alive ? undefined : `url(#sep${uid})`;
  return (
    <svg className={`portrait ${framed ? 'framed' : ''} ${ruler ? 'ruler' : ''} ${look.alive ? '' : 'dead'} ${className ?? ''}`} width={size} height={size * 1.2} viewBox="0 0 100 120" role="img" aria-label={title ?? 'Portrait'}>
      {title && <title>{title}</title>}
      <defs>
        <radialGradient id={`bg${uid}`} cx="50%" cy="38%" r="75%"><stop offset="0" stopColor={css(bg1)} /><stop offset="1" stopColor={css(bg2)} /></radialGradient>
        <radialGradient id={`sk${uid}`} cx="42%" cy="40%" r="70%"><stop offset="0" stopColor={css(skinL)} /><stop offset="0.7" stopColor={css(skin)} /><stop offset="1" stopColor={css(skinD)} /></radialGradient>
        <linearGradient id={`cl${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={css(shade(cloth, 0.1))} /><stop offset="1" stopColor={css(shade(cloth, -0.35))} /></linearGradient>
        <filter id={`sep${uid}`}><feColorMatrix type="matrix" values="0.39 0.62 0.19 0 0  0.35 0.55 0.17 0 0  0.27 0.43 0.13 0 0  0 0 0 1 0" /></filter>
        <clipPath id={`cp${uid}`}><rect x="0" y="0" width="100" height="120" rx="8" /></clipPath>
      </defs>
      <g clipPath={`url(#cp${uid})`} filter={filter}>
        <rect width="100" height="120" fill={`url(#bg${uid})`} />
        <circle cx="50" cy="48" r="40" fill="#fff" opacity="0.06" />
        {hairBack}
        {/* shoulders and dress */}
        <path d={`M${child ? 18 : 8},120 C${child ? 20 : 10},${child ? 98 : 94} ${cx - 16},${child ? 92 : 86} ${cx - 8},${child ? 86 : 82} L${cx + 8},${child ? 86 : 82} C${cx + 16},${child ? 92 : 86} ${child ? 80 : 90},${child ? 98 : 94} ${child ? 82 : 92},120 Z`} fill={`url(#cl${uid})`} />
        {era === 0 && look.occ !== 11 && <path d={`M14,108 l4,4 l4,-4 l4,4 l4,-4 l4,4 l4,-4 l4,4 l4,-4 l4,4 l4,-4 l4,4 l4,-4 l4,4 l4,-4 l4,4 l4,-4`} stroke={css(shade(cloth, -0.3))} strokeWidth="1.4" fill="none" />}
        {look.occ === 9 && <path d={`M${cx - 26},104 Q${cx},92 ${cx + 26},104 L${cx + 30},120 L${cx - 30},120 Z`} fill={css(metal)} stroke={css(shade(metal, -0.4))} strokeWidth="1" />}
        {era >= 4 && look.occ !== 9 && <><path d={`M${cx - 30},120 L${cx - 18},90 L${cx - 4},120 Z`} fill={css(shade(cloth, -0.2))} opacity="0.8" /><circle cx={cx - 14} cy={96} r="2.6" fill={css(gold)} /></>}
        {(ruler || gk === 'crown') && era >= 4 && <path d={`M${cx - 34},120 C${cx - 30},100 ${cx - 20},94 ${cx - 10},92 M${cx + 34},120 C${cx + 30},100 ${cx + 20},94 ${cx + 10},92`} stroke="#f4f0e6" strokeWidth="5" fill="none" />}
        {/* neckline */}
        <path d={`M${cx - 9},${child ? 86 : 82} Q${cx},${child ? 96 : 94} ${cx + 9},${child ? 86 : 82}`} fill={css(skinD)} stroke={css(trim)} strokeWidth={status > 0.6 ? 2.2 : 1.2} />
        {look.occ === 8 && <path d={`M${cx - 10},86 Q${cx},100 ${cx + 10},86`} stroke={css(gold)} strokeWidth="1.3" fill="none" strokeDasharray="1.5 1.2" />}
        {(look.occ === 11 || gk === 'priest') && <circle cx={cx} cy={98} r="3" fill="none" stroke={css(gold)} strokeWidth="1.4" />}
        {/* neck */}
        <path d={`M${cx - 6},${cy + fh * 0.6} L${cx - 7},${child ? 88 : 86} Q${cx},${child ? 91 : 89} ${cx + 7},${child ? 88 : 86} L${cx + 6},${cy + fh * 0.6} Z`} fill={css(skinD)} />
        {/* ears */}
        <ellipse cx={cx - fw + 0.5} cy={eyeY + 3} rx="2.6" ry="4.2" fill={css(skinD)} />
        <ellipse cx={cx + fw - 0.5} cy={eyeY + 3} rx="2.6" ry="4.2" fill={css(skinD)} />
        {earring && <><circle cx={cx - fw} cy={eyeY + 8} r="1.3" fill={css(gold)} /><circle cx={cx + fw} cy={eyeY + 8} r="1.3" fill={css(gold)} /></>}
        {/* head */}
        <path d={`M${cx - fw},${cy - 2} C${cx - fw},${top - 2} ${cx + fw},${top - 2} ${cx + fw},${cy - 2} C${cx + fw},${cy + fh * 0.45} ${cx + fw * jaw},${cy + fh * 0.85} ${cx},${cy + fh} C${cx - fw * jaw},${cy + fh * 0.85} ${cx - fw},${cy + fh * 0.45} ${cx - fw},${cy - 2} Z`} fill={`url(#sk${uid})`} />
        {/* cheeks */}
        <ellipse cx={cx - eyeDx - 1} cy={eyeY + 8} rx="3.4" ry="2" fill="#d0605a" opacity={child ? 0.22 : 0.1} />
        <ellipse cx={cx + eyeDx + 1} cy={eyeY + 8} rx="3.4" ry="2" fill="#d0605a" opacity={child ? 0.22 : 0.1} />
        {paint && (cs.pattern % 2 === 0
          ? <path d={`M${cx - fw + 3},${eyeY + 6} l8,-1 M${cx - fw + 3},${eyeY + 9} l8,-1 M${cx + fw - 3},${eyeY + 6} l-8,-1 M${cx + fw - 3},${eyeY + 9} l-8,-1`} stroke={css(hsl(cs.pattern * 90 + 10, 0.6, 0.4))} strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
          : <path d={`M${cx - 2},${top + 6} l2,6 l2,-6 M${cx},${cy + fh - 5} l0,3`} stroke={css(hsl(200, 0.4, 0.3))} strokeWidth="1.3" fill="none" opacity="0.75" />)}
        {/* eyes */}
        {[-1, 1].map((s) => (
          <g key={s}>
            <ellipse cx={cx + s * eyeDx} cy={eyeY} rx={eyeR * 1.55} ry={eyeR * narrow} fill="#f6f2ea" />
            <circle cx={cx + s * eyeDx + (r() - 0.5) * 0.6} cy={eyeY} r={eyeR * 0.78 * Math.min(1, narrow + 0.2)} fill={css(eye)} />
            <circle cx={cx + s * eyeDx} cy={eyeY} r={eyeR * 0.36} fill="#120c0a" />
            <circle cx={cx + s * eyeDx + 0.7} cy={eyeY - 0.7} r={0.55} fill="#fff" opacity="0.9" />
            <path d={`M${cx + s * eyeDx - eyeR * 1.6},${eyeY - eyeR * narrow * 0.3} Q${cx + s * eyeDx},${eyeY - eyeR * narrow * 1.5} ${cx + s * eyeDx + eyeR * 1.6},${eyeY - eyeR * narrow * 0.3}`} stroke={css(shade(skin, -0.5))} strokeWidth="0.9" fill={css(skinD, 0.5)} />
            {wr > 0.2 && <path d={`M${cx + s * (eyeDx - 2.5)},${eyeY + eyeR + 1} q${s * 2.5},1.5 ${s * 5},0`} stroke={lineC} strokeWidth="0.6" fill="none" />}
            {wr > 0.45 && <path d={`M${cx + s * (eyeDx + eyeR * 1.7)},${eyeY - 0.5} l${s * 2.5},-1.2 M${cx + s * (eyeDx + eyeR * 1.7)},${eyeY + 1} l${s * 2.5},0.6`} stroke={lineC} strokeWidth="0.55" />}
            <path d={`M${cx + s * (eyeDx - 4)},${eyeY - 4.5 - s * browTilt * 0.3} Q${cx + s * eyeDx},${eyeY - 6.4} ${cx + s * (eyeDx + 4.3)},${eyeY - 4.2 + browTilt * 0.4}`} stroke={css(mix(hair, [40, 30, 20], 0.3))} strokeWidth={browTh} strokeLinecap="round" fill="none" />
          </g>
        ))}
        {/* nose */}
        <path d={`M${cx - 0.6},${eyeY + 1.5} Q${cx - 1.2},${eyeY + noseL * 0.7} ${cx - noseW},${eyeY + noseL} Q${cx},${eyeY + noseL + 2} ${cx + noseW},${eyeY + noseL}`} stroke={css(shade(skin, -0.32))} strokeWidth="1" fill="none" strokeLinecap="round" />
        {/* mouth */}
        <path d={`M${cx - mouthW},${mouthY} Q${cx},${mouthY + smile * 1.6} ${cx + mouthW},${mouthY}`} stroke={css(shade(lip, -0.25))} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        {!male && !child && <path d={`M${cx - mouthW + 1},${mouthY + 0.4} Q${cx},${mouthY + 3.4 + smile} ${cx + mouthW - 1},${mouthY + 0.4}`} fill={css(lip)} opacity="0.75" />}
        {wr > 0.3 && <path d={`M${cx - noseW - 2},${eyeY + noseL + 1} q-2,4 -1,7 M${cx + noseW + 2},${eyeY + noseL + 1} q2,4 1,7`} stroke={lineC} strokeWidth="0.7" fill="none" />}
        {wr > 0.5 && <path d={`M${cx - 7},${top + 8} q7,-2 14,0 M${cx - 6},${top + 11} q6,-1.5 12,0`} stroke={lineC} strokeWidth="0.6" fill="none" />}
        {/* beard */}
        {beard === 'full' && <path d={`M${cx - fw + 1},${cy + 3} C${cx - fw + 1},${cy + fh + 6} ${cx + fw - 1},${cy + fh + 6} ${cx + fw - 1},${cy + 3} C${cx + fw - 4},${mouthY - 3} ${cx + 5},${mouthY - 4} ${cx},${mouthY - 3.5} C${cx - 5},${mouthY - 4} ${cx - fw + 4},${mouthY - 3} ${cx - fw + 1},${cy + 3} Z M${cx - mouthW},${mouthY + 0.5} Q${cx},${mouthY + 3} ${cx + mouthW},${mouthY + 0.5} Q${cx},${mouthY + 1.5} ${cx - mouthW},${mouthY + 0.5} Z`} fill={css(hair)} fillRule="evenodd" />}
        {beard === 'short' && <path d={`M${cx - fw + 2},${cy + 6} C${cx - fw + 3},${cy + fh + 1} ${cx + fw - 3},${cy + fh + 1} ${cx + fw - 2},${cy + 6} C${cx + 8},${mouthY + 4} ${cx - 8},${mouthY + 4} ${cx - fw + 2},${cy + 6} Z`} fill={css(hair)} opacity="0.85" />}
        {(beard === 'moustache' || beard === 'full' || beard === 'short') && <path d={`M${cx - mouthW - 1.5},${mouthY + 0.5} Q${cx - 3},${mouthY - 3.6} ${cx},${mouthY - 2} Q${cx + 3},${mouthY - 3.6} ${cx + mouthW + 1.5},${mouthY + 0.5} Q${cx},${mouthY - 1} ${cx - mouthW - 1.5},${mouthY + 0.5} Z`} fill={css(hair)} />}
        {hairFront}
        {veiled && <path d={`M${cx - fw - 5},${cy + 30} C${cx - fw - 6},${top - 8} ${cx + fw + 6},${top - 8} ${cx + fw + 5},${cy + 30} L${cx + fw},${cy + 10} C${cx + fw},${top + 2} ${cx - fw},${top + 2} ${cx - fw},${cy + 10} Z`} fill={css(hsl(look.culHue + 180, 0.25, 0.55))} />}
        <Headgear kind={gk} cx={cx} top={top} fw={fw} era={era} metal={metal} gold={gold} cloth={cloth} hue={look.culHue} />
      </g>
      {framed && <rect x="1" y="1" width="98" height="118" rx="8" fill="none" stroke={ruler ? css(gold) : 'rgba(255,255,255,0.18)'} strokeWidth={ruler ? 2.5 : 1.5} />}
    </svg>
  );
});

function Headgear({ kind, cx, top, fw, era, metal, gold, cloth, hue }: { kind: Kind; cx: number; top: number; fw: number; era: number; metal: RGB; gold: RGB; cloth: RGB; hue: number }) {
  if (!kind) return null;
  if (kind === 'crown') {
    const b = top + 3;
    return <g><path d={`M${cx - fw - 1},${b} L${cx - fw + 1},${b - 12} L${cx - fw / 2},${b - 6} L${cx},${b - 15} L${cx + fw / 2},${b - 6} L${cx + fw - 1},${b - 12} L${cx + fw + 1},${b} Z`} fill={css(gold)} stroke={css(shade(gold, -0.4))} strokeWidth="0.8" />
      <circle cx={cx} cy={b - 4} r="1.8" fill={css(hsl(hue + 180, 0.7, 0.45))} /><circle cx={cx - fw / 2} cy={b - 2.5} r="1.2" fill="#c33" /><circle cx={cx + fw / 2} cy={b - 2.5} r="1.2" fill="#c33" /></g>;
  }
  if (kind === 'circlet') return <path d={`M${cx - fw - 0.5},${top + 7} Q${cx},${top + 2} ${cx + fw + 0.5},${top + 7}`} stroke={css(era >= 2 ? gold : metal)} strokeWidth="2.4" fill="none" />;
  if (kind === 'feather') {
    return <g><path d={`M${cx - fw - 1},${top + 6} Q${cx},${top + 1} ${cx + fw + 1},${top + 6}`} stroke={css(hsl(hue, 0.6, 0.4))} strokeWidth="3" fill="none" />
      {[-8, -3, 2, 7].map((dx, i) => <path key={i} d={`M${cx + dx},${top + 3} q${dx * 0.3 - 1},-10 ${dx * 0.5},-17 q${2 - dx * 0.1},8 ${1.5},17 Z`} fill={css(i % 2 ? [236, 230, 214] : hsl(hue + 30, 0.6, 0.45))} />)}</g>;
  }
  if (kind === 'laurel') return <g>{[-1, 1].map((s) => [0, 1, 2, 3, 4].map((i) => <ellipse key={`${s}${i}`} cx={cx + s * (fw - 2 - i * 3.2)} cy={top + 6 - i * 0.9} rx="2.4" ry="1.1" transform={`rotate(${s * (25 + i * 6)} ${cx + s * (fw - 2 - i * 3.2)} ${top + 6 - i * 0.9})`} fill="#7a9a40" />))}</g>;
  if (kind === 'helm') {
    return <g><path d={`M${cx - fw - 2},${top + 10} C${cx - fw - 2},${top - 8} ${cx + fw + 2},${top - 8} ${cx + fw + 2},${top + 10} Z`} fill={css(metal)} stroke={css(shade(metal, -0.45))} strokeWidth="0.8" />
      <rect x={cx - 1.2} y={top + 6} width="2.4" height="9" fill={css(shade(metal, -0.2))} />
      {era >= 3 && <path d={`M${cx},${top - 4} q-6,-10 -2,-14 q6,4 2,14`} fill={css(hsl(hue, 0.6, 0.4))} />}</g>;
  }
  if (kind === 'priest') return <path d={`M${cx - fw - 4},${top + 30} C${cx - fw - 6},${top - 10} ${cx + fw + 6},${top - 10} ${cx + fw + 4},${top + 30} L${cx + fw},${top + 18} C${cx + fw},${top + 4} ${cx - fw},${top + 4} ${cx - fw},${top + 18} Z`} fill={css(shade(cloth, -0.1))} />;
  if (kind === 'prophet') return <g><circle cx={cx} cy={top + 14} r={fw + 10} fill="none" stroke={css(gold)} strokeWidth="1.2" opacity="0.6" />
    <path d={`M${cx - fw - 4},${top + 30} C${cx - fw - 6},${top - 8} ${cx + fw + 6},${top - 8} ${cx + fw + 4},${top + 30} L${cx + fw},${top + 18} C${cx + fw},${top + 4} ${cx - fw},${top + 4} ${cx - fw},${top + 18} Z`} fill="#e9e3d2" /></g>;
  return null;
}

/** A stable short description of a seed's appearance; handy for tests. */
export const lookKey = (l: Look) => `${l.seed}:${l.style}:${l.era}:${Math.floor(hash(l.seed) * 1000)}`;
