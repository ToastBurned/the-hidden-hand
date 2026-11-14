/** A town seen through the Veil: what the Order knows, what it has heard, and what it can do there. */
import { useQuery } from '../../hooks';
import type { settlementDetail } from '../../../engine/query';
import { Icon } from '../Icons';
import { ClarityBadge, levelWord, Veiled, VeiledText, settlementClarity } from '../veil';
import { MemberCard } from './OrderPanel';
import type { PlayApi } from '../PlayScreen';

type SD = NonNullable<ReturnType<typeof settlementDetail>>;

export function TownPanel({ api, id, onClose }: { api: PlayApi; id: number; onClose: () => void }) {
  const g = api.g;
  const { data } = useQuery<SD | null>('settlement', id, 6);
  const c = settlementClarity(g, id);
  const here = g.members.filter((m) => m.settlement === id && !m.travel);
  const cell = g.cells.find((x) => x.settlement === id);
  const lodge = g.lodges.find((l) => l.settlement === id);
  const sus = g.suspicion.find((s) => s.settlement === id);
  const inv = g.investigators.filter((i) => i.settlement === id);
  const anyFree = g.members.some((m) => !m.travel && !m.flags.includes('imprisoned'));
  return (
    <div className="side-body">
      <div className="row"><span className="label grow">Town</span><button className="ghost" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button></div>
      <h3 style={{ fontSize: '1.4em' }}>{data?.name ?? '…'}</h3>
      <div className="row" style={{ gap: 8, margin: '4px 0 10px' }}><ClarityBadge c={c} />{id === g.order.home && <span className="clarity known">Home of the Order</span>}</div>
      {data && (
        <dl className="facts">
          <dt>Realm</dt><dd><VeiledText c={c === 'unknown' ? 'rumour' : c}>{data.polity?.name ?? 'none'}{data.polity?.capital ? ' (capital)' : ''}</VeiledText></dd>
          <dt>People</dt><dd><Veiled c={c} value={data.pop} /></dd>
          <dt>Faith</dt><dd><VeiledText c={c}>{data.religion}</VeiledText></dd>
          <dt>Unrest</dt><dd><Veiled c={c} value={data.unrest} word={levelWord} /></dd>
          <dt>Food</dt><dd><Veiled c={c} value={data.foodRatio} word={(v) => (v < 0.85 ? 'short' : v < 1.05 ? 'enough' : 'plenty')} /></dd>
          <dt>Suspicion of us</dt><dd>{sus ? levelWord(sus.level) : 'none'}</dd>
        </dl>
      )}
      {inv.length > 0 && <p className="small wax"><Icon name="eye" size={14} /> {inv.map((i) => i.name).join(', ')} {inv.length > 1 ? 'are' : 'is'} asking questions here.</p>}
      {here.length > 0 && <>
        <span className="label">{cell?.name ?? 'Members here'}</span>
        <div className="col" style={{ gap: 6, margin: '6px 0 12px' }}>{here.map((m) => <MemberCard key={m.id} api={api} m={m} />)}</div>
      </>}
      {lodge && <p className="small"><Icon name="door" size={14} /> {lodge.name}{lodge.front ? `, behind ${lodge.front}` : ''}. <button className="link" onClick={() => api.tab('lodges')}>Rooms</button></p>}
      <div className="col" style={{ gap: 8 }}>
        <button disabled={!anyFree} onClick={() => api.assign({ kind: 'operation', target: { kind: 'settlement', id } })}><Icon name="dagger" size={16} /> An operation here</button>
        <button disabled={!anyFree} onClick={() => api.assign({ kind: 'move', to: id })}><Icon name="map" size={16} /> Send a member here</button>
        {c !== 'known' && <span className="tiny faint italic">To see this town clearly, place a member here or send someone to scout it.</span>}
      </div>
    </div>
  );
}
