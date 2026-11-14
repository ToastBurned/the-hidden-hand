/** The Order's own crafts: learned by practice and teaching, lost if their holders die untaught. */
import { CRAFTS } from '../../../engine/game/crafts';
import type { PlayApi } from '../PlayScreen';
import { HelpMark } from '../codex/Codex';

export function CraftsPanel({ api }: { api: PlayApi }) {
  const g = api.g;
  const view = new Map(g.crafts.map((c) => [c.id, c]));
  const depth = (id: string): number => { const c = CRAFTS.find((x) => x.id === id); return c && c.needs.length ? 1 + Math.max(...c.needs.map(depth)) : 0; };
  const cols = [0, 1, 2].map((d) => CRAFTS.filter((c) => depth(c.id) === d));
  return (
    <div className="screen">
      <header className="screen-head">
        <h2>Crafts<HelpMark id="order:crafts" /></h2>
        <p className="dim italic">The world's technology is not yours to direct; the Order's own methods are. Members learn by doing and by teaching. A craft held by one old member dies with them unless someone is taught.</p>
      </header>
      <div className="craft-tree">
        {cols.map((col, i) => (
          <div key={i} className="craft-col">
            {col.map((c) => {
              const v = view.get(c.id);
              const m = v?.mastery ?? 0;
              return (
                <div key={c.id} className={`craft panel ${m >= 0.25 ? 'open' : ''}`}>
                  <div className="row"><b className="grow">{c.name}<HelpMark id={`craft:${c.id}`} label={c.name} /></b><span className="tiny gold">{Math.round(m * 100)}%</span></div>
                  <div className="bar"><div className={m >= 0.25 ? 'gold' : 'dimbar'} style={{ width: `${m * 100}%` }} /></div>
                  <div className="tiny dim">{c.blurb}</div>
                  {c.needs.length > 0 && <div className="tiny faint">Builds on {c.needs.join(' and ')}</div>}
                  {c.unlocks.length > 0 && <div className="tiny">Opens: {c.unlocks.join(', ').replace(/-/g, ' ')}</div>}
                  <div className="tiny faint">{v?.holders.length ? `${v.holders.length} ${v.holders.length === 1 ? 'member knows' : 'members know'} it` : 'No one knows it'}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="tiny faint">A craft at 25% or more opens what depends on it.</p>
    </div>
  );
}
