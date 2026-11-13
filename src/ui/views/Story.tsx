import { useEffect, useRef } from 'react';
import type { Selection } from '../App';
import { sim } from '../client';
import { useQuery, useSim, fmtCount as fmtNum, fmtPct } from '../hooks';
import type { storyDigest } from '../../engine/query';
import { Portrait } from '../art/Portrait';
import { Spark } from '../components/LineChart';
import { eventLabel } from '../components/common';
import { glyph } from '../components/Alerts';
import { ERA_BLURB } from '../era';
import { hueCss, BIOME_COLORS } from '../colors';
import { usePrefs } from '../prefs';
import { ChapterList, useChapters, chapterNo } from '../components/Chapters';

type SD = ReturnType<typeof storyDigest>;
const yr = (t: number) => Math.floor(t / 12);

function narrative(d: SD, running: boolean) {
  const parts: string[] = [];
  parts.push(`${fmtNum(d.pop)} people live in ${d.settlements} ${d.settlements === 1 ? 'settlement' : 'settlements'}${d.polities ? `, under ${d.polities} ${d.polities === 1 ? 'realm' : 'realms'}` : ''}.`);
  if (d.era !== d.commonEra) parts.push(`The most advanced have reached the ${d.eraName}, though most people still live in the ${d.commonEraName}.`);
  else parts.push(`It is the ${d.eraName}.`);
  if (d.largest) parts.push(`${d.largest.name}, home to ${fmtNum(d.largest.pop)}, is the greatest place in the world.`);
  if (d.wars.length === 1) parts.push(`War rages: ${d.wars[0].name}.`);
  else if (d.wars.length > 1) parts.push(`${d.wars.length} wars rage, among them ${d.wars[0].name}.`);
  else if (d.polities > 1) parts.push('For now, the realms are at peace.');
  if (d.popTenYearsAgo > 0 && d.year > 10) {
    const g = d.pop / d.popTenYearsAgo - 1;
    if (g > 0.08) parts.push(`Numbers have grown by ${fmtPct(g)} in a decade.`);
    else if (g < -0.08) parts.push(`Numbers have fallen by ${fmtPct(-g)} in a decade.`);
  }
  if (d.hunger > 0.2) parts.push(`Hunger touches ${fmtPct(d.hunger)} of households.`);
  if (!running && d.year < 2) parts.push('Nothing that follows is scripted. Press Play to let history begin.');
  return parts.join(' ');
}

/** The front page: what is happening, who matters, and how we got here. */
export function Story({ onOpen, onShowMap }: { onOpen: (s: Selection) => void; onShowMap: (x?: number, y?: number) => void }) {
  const st = useSim();
  const { data: d } = useQuery<SD>('story', null, 6);
  const prefs = usePrefs();
  const chapters = useChapters();
  const chapter = chapters[chapters.length - 1];
  if (!d) return <div className="loading"><div className="spinner" />Reading the chronicle…</div>;
  const [lead, ...rest] = d.headlines;
  const followed = st.chronicle.filter((e) => e.persons.some((p) => prefs.follow.persons.some((x) => x.id === p)) || prefs.follow.families.some((f) => e.text.includes(` ${f}`))).slice(-6).reverse();
  return (
    <div className="story">
      <header className="story-hero">
        <MiniWorld />
        <div className="hero-inner">
          <div className="hero-kicker">{st.frame?.date ?? `Year ${d.year}`}</div>
          <h1 className="hero-title">{st.frame?.name ?? 'The world'}</h1>
          <div className="hero-era">{chapter ? `Chapter ${chapterNo(chapter.n)} · ${chapter.name}` : d.eraName}</div>
          <p className="hero-text">{narrative(d, st.running)}</p>
          <p className="hero-blurb muted">{ERA_BLURB[d.era]}</p>
          <div className="hero-actions">
            <button className="primary big" onClick={() => (st.running ? sim.pause() : sim.play())} data-tour="story-play">{st.running ? '❚❚ Pause' : '▶ Let history unfold'}</button>
            <button className="big" onClick={() => onShowMap()}>Open the map</button>
          </div>
        </div>
      </header>

      <div className="story-grid">
        <section className="story-col main-col">
          <h2 className="story-h">Headlines</h2>
          {!lead && <div className="muted">Nothing of note has happened yet. Give it a few years.</div>}
          {lead && (
            <article className="headline lead" onClick={() => onOpen({ kind: 'event', id: lead.id })}>
              <div className="hl-kicker"><span className="hl-glyph">{glyph(lead.type)}</span>{eventLabel(lead.type)} · year {yr(lead.t)}</div>
              <h3 className="hl-title">{lead.text}</h3>
              {lead.why && <p className="hl-why">{lead.why}</p>}
              <div className="hl-actions">
                <button className="link" onClick={(e) => { e.stopPropagation(); onOpen({ kind: 'event', id: lead.id }); }}>Causes and consequences →</button>
                {lead.x >= 0 && <button className="link" onClick={(e) => { e.stopPropagation(); onShowMap(lead.x, lead.y); }}>Where →</button>}
              </div>
            </article>
          )}
          <div className="headline-grid">
            {rest.map((e) => (
              <article key={e.id} className={`headline imp${e.imp}`} onClick={() => onOpen({ kind: 'event', id: e.id })}>
                <div className="hl-kicker"><span className="hl-glyph">{glyph(e.type)}</span>{eventLabel(e.type)} · {yr(e.t)}</div>
                <div className="hl-text">{e.text}</div>
              </article>
            ))}
          </div>

          {chapters.length > 0 && <>
            <h2 className="story-h">The story so far</h2>
            <ChapterList chapters={chapters} onOpen={onOpen} />
          </>}
        </section>

        <aside className="story-col side-col">
          {d.realms.length > 0 && <>
            <h2 className="story-h">Realms</h2>
            <div className="realm-grid">
              {d.realms.map((r) => (
                <article key={r.id} className="realm" style={{ ['--realm' as string]: hueCss(r.hue) }} onClick={() => onOpen({ kind: 'polity', id: r.id })}>
                  <div className="realm-band" />
                  <div className="realm-body">
                    {r.ruler && <Portrait look={r.ruler.look} size={46} />}
                    <div className="realm-text">
                      <div className="realm-name">{r.name}{r.atWar && <span className="pill bad">at war</span>}</div>
                      <div className="small muted">{r.label} · since {yr(r.founded)}</div>
                      {r.ruler && <div className="small">{r.ruler.title} {r.ruler.name}{r.ruler.alive ? `, ${r.ruler.age}` : ''}</div>}
                    </div>
                  </div>
                  <div className="realm-foot">
                    <span><b>{fmtNum(r.pop)}</b> people · <b>{r.settlements}</b> {r.settlements === 1 ? 'place' : 'places'}</span>
                    {r.spark.length > 3 && <Spark values={r.spark} w={90} h={22} color={hueCss(r.hue, 60)} />}
                  </div>
                </article>
              ))}
            </div>
          </>}
          <h2 className="story-h">Figures of the age</h2>
          {d.figures.length === 0 && <div className="muted small">No one has yet risen above the rest.</div>}
          <div className="figures">
            {d.figures.map((f) => (
              <button key={f.ref.id} className="figure" onClick={() => onOpen({ kind: 'person', id: f.ref.id })}>
                <Portrait look={f.ref.look} size={58} />
                <span className="fig-text">
                  <span className="fig-name">{f.ref.title ? `${f.ref.title} ` : ''}{f.ref.name}</span>
                  <span className="fig-role small muted">{f.role}</span>
                  <span className="fig-age small">{f.ref.alive ? `age ${f.ref.age}` : 'deceased'}{f.ref.look && f.ref.look.n > 1 ? ` · stands for ${fmtNum(f.ref.look.n)} people` : ''}</span>
                </span>
              </button>
            ))}
          </div>

          {(prefs.follow.persons.length > 0 || prefs.follow.families.length > 0) && <>
            <h2 className="story-h">Those you follow</h2>
            <div className="chips" style={{ marginBottom: 8 }}>
              {prefs.follow.families.map((f) => <span key={f} className="chip">House {f}</span>)}
              {prefs.follow.persons.map((p) => <button key={p.id} className="chip" onClick={() => onOpen({ kind: 'person', id: p.id })}>{p.name}</button>)}
            </div>
            {followed.length ? followed.map((e) => <button key={e.id} className="follow-ev" onClick={() => onOpen({ kind: 'event', id: e.id })}><span className="muted">{yr(e.t)}</span> {e.text}</button>)
              : <div className="small muted">Nothing new from them lately.</div>}
          </>}

          <h2 className="story-h">The world in numbers</h2>
          <div className="numbers">
            <div><span className="muted small">Population</span><b>{fmtNum(d.pop)}</b>{d.series.length > 3 && <Spark values={d.series.map((s) => s.pop)} w={120} h={26} />}</div>
            <div><span className="muted small">Life expectancy</span><b>{d.lifeExp ? `${d.lifeExp.toFixed(0)} yrs` : '—'}</b></div>
            <div><span className="muted small">Can read</span><b>{fmtPct(d.literacy)}</b></div>
            <div><span className="muted small">Live in towns</span><b>{fmtPct(d.urban)}</b></div>
            <div><span className="muted small">Cultures · faiths</span><b>{d.cultures} · {d.religions}</b></div>
            <div><span className="muted small">Births · deaths (10 yrs)</span><b>{fmtNum(d.births)} · {fmtNum(d.deaths)}</b></div>
          </div>

          {d.firsts.length > 0 && <>
            <h2 className="story-h">Milestones</h2>
            <ol className="milestones">
              {d.firsts.slice().reverse().slice(0, 10).map((f) => (
                <li key={f.id}><button className="link" onClick={() => onOpen({ kind: 'event', id: f.id })}><span className="ms-year">{yr(f.t)}</span> {f.tech}</button></li>
              ))}
            </ol>
          </>}
        </aside>
      </div>
    </div>
  );
}

/** A faded little map behind the hero text. */
function MiniWorld() {
  const st = useSim();
  const ref = useRef<HTMLCanvasElement>(null);
  const { map, frame } = st;
  useEffect(() => {
    const c = ref.current;
    if (!c || !map) return;
    c.width = map.w; c.height = map.h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(map.w, map.h);
    for (let i = 0; i < map.w * map.h; i++) {
      const [r, gg, b] = BIOME_COLORS[map.biome[i]];
      const e = Math.max(0, map.elev[i]);
      img.data[i * 4] = r * (0.9 + e * 0.3); img.data[i * 4 + 1] = gg * (0.9 + e * 0.3); img.data[i * 4 + 2] = b * (0.9 + e * 0.3); img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (frame) for (const s of frame.settlements) {
      g.fillStyle = s.capital ? '#ffd860' : '#fff6e0';
      g.fillRect(s.x, s.y, s.pop > 400 ? 2 : 1, s.pop > 400 ? 2 : 1);
    }
  }, [map, frame?.settlements.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="mini-world" aria-hidden />;
}
