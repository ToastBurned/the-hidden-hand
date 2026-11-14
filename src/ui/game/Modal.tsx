import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icons';

/** A dialog in the game's style. Escape and a click outside close it. */
export function GameModal(props: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; label?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.codex-back')) { e.stopPropagation(); props.onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  });
  return (
    <div className="hh-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className={`hh-modal panel ${props.wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={props.label ?? (typeof props.title === 'string' ? props.title : undefined)}>
        <div className="hh-modal-head"><h2>{props.title}</h2><span className="grow" /><button className="ghost" onClick={props.onClose} aria-label="Close" title="Close (Esc)"><Icon name="close" /></button></div>
        <div className="hh-modal-body">{props.children}</div>
        {props.footer && <div className="hh-modal-foot">{props.footer}</div>}
      </div>
    </div>
  );
}
