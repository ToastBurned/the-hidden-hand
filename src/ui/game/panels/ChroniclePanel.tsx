/** The public chronicle as the Order hears it: events where it has eyes, marked where its hand was. */
import { useSim } from '../../hooks';
import { Icon } from '../Icons';
import { settlementClarity } from '../veil';
import type { PlayApi } from '../PlayScreen';

export function ChroniclePanel({ api }: { api: PlayApi }) {
  const st = useSim();
  const g = api.g;
  const ours = new Set([...g.members.map((m) => m.id), ...g.fallen.map((f) => f.id)]);
  const seen = st.chronicle.filter((e) => e.t >= g.order.founded - 12 * 30 && (e.settlements.length === 0 ? e.imp >= 4 : e.settlements.some((s) => settlementClarity(g, s) !== 'unknown'))).slice(-120).reverse();
  return (
    <div className="screen">
      <header className="screen-head">
        <h2>Chronicle</h2>
        <p className="dim italic">The world's own record, as far as news reaches the Order. Events the Order touched carry its private mark; the public text never names it.</p>
      </header>
      <div className="chron">
        {seen.map((e) => {
          const touched = e.persons.some((p) => ours.has(p));
          const rumour = e.settlements.length > 0 && e.settlements.every((s) => settlementClarity(g, s) === 'rumour');
          return (
            <div key={e.id} className={`chron-row imp${e.imp} ${rumour ? 'rumour' : ''}`} title={e.why}>
              <span className="yr">{Math.floor(e.t / 12)}</span>
              <span className="grow">{touched && <span className="gold" title="The Order's hand was in this"><Icon name="seal" size={13} /> </span>}{e.text}{rumour && <span className="faint italic">, they say</span>}</span>
            </div>
          );
        })}
        {!seen.length && <p className="dim italic">No news yet.</p>}
      </div>
    </div>
  );
}
