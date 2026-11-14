/** Lodges: the hidden houses the Order builds and improves, room by room. */
import { ROOMS } from '../../../engine/game/order';
import type { RoomKind } from '../../../game/view';
import { Icon } from '../Icons';
import { dateOf, type PlayApi } from '../PlayScreen';
import { townName } from './OrderPanel';

export function LodgesPanel({ api }: { api: PlayApi }) {
  const g = api.g;
  const crafts = new Map(g.crafts.map((c) => [c.id, c.mastery]));
  return (
    <div className="screen">
      <header className="screen-head">
        <h2>Lodges</h2>
        <p className="dim italic">Each cell can keep a lodge, a hidden house in its town. Rooms cost coin and time, need the Order's crafts, and can be found. Coin pays real builders in that town. The Order has {Math.round(g.resources.wealth)} in coin.</p>
      </header>
      {!g.lodges.length && <p className="dim">The Order has no lodge yet. Give a member the <b>Found a lodge</b> assignment in their own town.</p>}
      {g.lodges.map((l) => (
        <section key={l.id} className="lodge panel">
          <div className="row"><Icon name="door" size={22} /><div className="grow"><h3>{l.name}</h3><div className="tiny dim">{townName(l.settlement)}{l.front ? `, behind ${l.front}` : ''} · exposure {Math.round(l.exposure * 100)}%</div></div></div>
          <div className="rooms">
            {(Object.keys(ROOMS) as RoomKind[]).map((k) => {
              const spec = ROOMS[k];
              const have = l.rooms.find((r) => r.kind === k);
              const level = have?.level ?? 0;
              const ok = !spec.needs || (crafts.get(spec.needs) ?? 0) >= 0.25;
              const cost = spec.cost * (level + 1);
              return (
                <div key={k} className={`room ${level ? 'built' : ''}`}>
                  <div className="row"><b className="grow">{spec.name}</b>{level > 0 && <span className="tiny gold">{'●'.repeat(level)}{'○'.repeat(3 - level)}</span>}</div>
                  <div className="tiny dim">{spec.blurb}</div>
                  {have?.building ? <div className="tiny gold">Being built, ready {dateOf(have.done ?? 0)}</div> : level < 3 && (
                    <button className="chip" disabled={!ok || g.resources.wealth < cost} onClick={() => api.act({ type: 'build', lodge: l.id, room: k })} title={!ok ? `Needs the craft of ${spec.needs}` : undefined}>
                      {level ? 'Improve' : 'Build'} · {cost} coin · {spec.months} months{!ok ? ` · needs ${spec.needs}` : ''}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
