/** The end of a campaign: the Order's own chronicle, written from its record. */
import { useEffect } from 'react';
import type { GameView } from '../../../game/view';
import { Mark } from '../Icons';
import { setSettings } from '../settings';
import { useSim } from '../../hooks';

export function EndingScreen({ g, onTitle }: { g: GameView; onTitle: () => void }) {
  const st = useSim();
  const e = g.ending!;
  useEffect(() => {
    setSettings((s) => s.chronicles.some((c) => c.name === g.order.name && c.founded === g.order.founded)
      ? s
      : { ...s, chronicles: [{ name: g.order.name, world: st.frame?.name ?? '', founded: g.order.founded, ended: e.tick, ending: e.title }, ...s.chronicles].slice(0, 40) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="hh-modal-back ending-back">
      <div className={`ending vellum ${e.kind}`} role="dialog" aria-label={e.title}>
        <div className="ending-mark"><Mark size={56} /></div>
        <span className="label" style={{ color: '#6b5536' }}>{e.kind === 'won' ? 'Victory' : 'The end of the Order'}</span>
        <h1>{e.title}</h1>
        <div className="ending-text">{e.chronicle.map((p, i) => <p key={i}>{p}</p>)}</div>
        <div className="row"><span className="grow" /><button className="seal" onClick={onTitle}>Return to the start screen</button></div>
      </div>
    </div>
  );
}
