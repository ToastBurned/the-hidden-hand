import { useState } from 'react';
import { DEFAULT_CONFIG, PARAMS, type WorldConfig } from '../../engine/config';
import { sim } from '../client';
import { Modal } from '../components/Modal';

const WORDS = ['Amber', 'Ashen', 'Verdant', 'Hollow', 'Silver', 'Drowned', 'Golden', 'Iron', 'Quiet', 'Burning', 'Northern', 'Endless', 'Scattered', 'Twin'];
const NOUNS = ['Reach', 'Earth', 'Shore', 'Lands', 'Isles', 'Expanse', 'Vale', 'Steppe', 'Basin', 'Coast', 'Marches', 'Realm'];
const randomName = () => `The ${WORDS[Math.floor(Math.random() * WORDS.length)]} ${NOUNS[Math.floor(Math.random() * NOUNS.length)]}`;

/** Configure and generate a new world. Every engine parameter is exposed. */
export function NewWorldDialog({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<WorldConfig>({ ...DEFAULT_CONFIG, name: randomName(), seed: Math.floor(Math.random() * 1e6) });
  const groups = [...new Set(PARAMS.map((p) => p.group))];
  const set = (k: keyof WorldConfig, v: number | string) => setCfg((c) => ({ ...c, [k]: v }));
  const create = () => { sim.create(cfg); onClose(); };
  return (
    <Modal title="New world" onClose={onClose} wide footer={<>
      <button onClick={() => setCfg({ ...DEFAULT_CONFIG, name: cfg.name, seed: cfg.seed })}>Reset to defaults</button>
      <span className="grow" />
      <button onClick={onClose}>Cancel</button>
      <button className="primary" onClick={create}>Create world</button>
    </>}>
      <div className="form-row">
        <label>Name <input value={cfg.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label title="Same seed and parameters always produce the same world and the same history">Seed <input type="number" value={cfg.seed} onChange={(e) => set('seed', Math.floor(+e.target.value))} style={{ width: 110 }} /></label>
        <button onClick={() => set('seed', Math.floor(Math.random() * 1e6))}>Random seed</button>
      </div>
      <p className="small muted">The same seed and settings always produce the same world and, with no interventions, exactly the same history. Larger maps and more founding bands produce more people and run more slowly; the defaults reach a few thousand people over a few centuries.</p>
      <div className="param-groups">
        {groups.map((g) => (
          <fieldset key={g}>
            <legend>{g}</legend>
            {PARAMS.filter((p) => p.group === g).map((p) => (
              <div key={p.key} className="param" title={p.desc}>
                <div className="row"><span>{p.label}</span><span className="grow" /><b>{Number(cfg[p.key]).toFixed(p.integer ? 0 : p.step < 0.1 ? 2 : 1)}</b></div>
                <input type="range" min={p.min} max={p.max} step={p.step} value={Number(cfg[p.key])} onChange={(e) => set(p.key, p.integer ? Math.round(+e.target.value) : +e.target.value)} />
                <div className="small muted">{p.desc}</div>
              </div>
            ))}
          </fieldset>
        ))}
      </div>
    </Modal>
  );
}
