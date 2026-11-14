import { useState } from 'react';
import { INTERVENTION_KINDS, type Intervention, type InterventionKind } from '../../engine/config';
import { TECHS } from '../../engine/techs';
import { TechPicker } from '../components/TechPicker';
import { VALUE_NAMES } from '../../engine/constants';
import { sim } from '../client';
import { Modal } from '../components/Modal';
import { useSim } from '../hooks';

/** Apply an intervention to the running world right now. */
export function InterveneDialog({ onClose, onToast }: { onClose: () => void; onToast: (s: string) => void }) {
  const st = useSim();
  const [kind, setKind] = useState<InterventionKind>('drought');
  const [magnitude, setMagnitude] = useState(0.6);
  const [duration, setDuration] = useState(5);
  const [target, setTarget] = useState<string>('all');
  const [tech, setTech] = useState(TECHS[0].key);
  const [axis, setAxis] = useState(0);
  const meta = INTERVENTION_KINDS.find((k) => k.kind === kind)!;
  const settlements = [...(st.frame?.settlements ?? [])].sort((a, b) => b.pop - a.pop);
  const apply = () => {
    const iv: Intervention = {
      year: 0, kind, magnitude, duration, tech, axis, label: meta.label,
      target: target === 'all' || target === 'largest' || target === 'smallest' ? target : +target,
    };
    sim.intervene(iv);
    onToast(`${meta.label} applied. It is recorded in the chronicle.`);
    onClose();
  };
  return (
    <Modal title="Intervene" onClose={onClose} footer={<><span className="grow" /><button onClick={onClose}>Cancel</button><button className="primary" onClick={apply}>Apply now</button></>}>
      <p className="small muted">Interventions change the world from outside, then the simulation works out the consequences. Save first if you want to compare with the world you would otherwise have had, or use a branching experiment to measure the effect properly across many possible futures.</p>
      <div className="form-col">
        <label>Intervention
          <select value={kind} onChange={(e) => setKind(e.target.value as InterventionKind)}>
            {INTERVENTION_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
        </label>
        <div className="small muted">{meta.desc}</div>
        <label>Magnitude: {magnitude.toFixed(2)} <input type="range" min={kind === 'climate_shift' ? -1 : 0} max={1.5} step={0.05} value={magnitude} onChange={(e) => setMagnitude(+e.target.value)} /></label>
        {['drought', 'volcanic_winter', 'bounty'].includes(kind) && <label>Duration (years): {duration} <input type="range" min={1} max={30} step={1} value={duration} onChange={(e) => setDuration(+e.target.value)} /></label>}
        {['drought', 'plague', 'grant_tech', 'migration_wave', 'cultural_shock', 'bounty'].includes(kind) && (
          <label>Target
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="all">Everywhere</option><option value="largest">Largest settlement</option><option value="smallest">Smallest settlement</option>
              {settlements.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.pop})</option>)}
            </select>
          </label>
        )}
        {kind === 'grant_tech' && <div className="block">Technology <TechPicker value={tech} onChange={setTech} /></div>}
        {kind === 'cultural_shock' && <label>Value <select value={axis} onChange={(e) => setAxis(+e.target.value)}>{VALUE_NAMES.map((v, i) => <option key={v} value={i}>{v}</option>)}</select></label>}
      </div>
    </Modal>
  );
}
