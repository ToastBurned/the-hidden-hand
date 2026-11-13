import { Modal } from '../components/Modal';

export function HelpDialog({ onClose, onTour }: { onClose: () => void; onTour?: () => void }) {
  return (
    <Modal title="How to use the Noosphere" onClose={onClose} wide>
      <div className="help">
        <section>
          <h3>What you are watching</h3>
          <p>A few hundred foragers in small bands are placed on a generated world. From then on nothing is scripted. Every person is born, eats, works, marries, falls ill, fights, remembers and dies individually. Farming, towns, markets, states, faiths, wars and inventions appear only when material conditions and the choices of individuals make them happen, and they can disappear again.</p>
        </section>
        <section>
          <h3>Controls</h3>
          <table className="grid-table small"><tbody>
            <tr><td><kbd>Space</kbd></td><td>Play or pause</td></tr>
            <tr><td><kbd>.</kbd> / <kbd>&gt;</kbd></td><td>Advance one month / one year while paused</td></tr>
            <tr><td><kbd>+</kbd> / <kbd>-</kbd></td><td>Faster / slower</td></tr>
            <tr><td><kbd>1</kbd>–<kbd>7</kbd></td><td>Switch between Story, World, Chronicle, Statistics, Societies, People, Experiments</td></tr>
            <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Save to the library</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Back in the inspector / close a dialog</td></tr>
            <tr><td>Mouse</td><td>Drag to pan the map, scroll to zoom, click a settlement or a patch of land to inspect it. Zoom in close and settlements become towns; double-click one to open its streets.</td></tr>
            <tr><td>Timeline</td><td>Drag along the strip under the map to see the world as recorded in a past year (<kbd>←</kbd>/<kbd>→</kbd> step a year when it has focus). Playing returns to the present.</td></tr>
          </tbody></table>
        </section>
        <section>
          <h3>Story, alerts and following</h3>
          <p>The Story page is the front page of the world: headlines, the figures of the age with their portraits, and the realms. Major events pop up as alerts and, if you like, pause the world (the bell in the top bar sets this). On anyone's page you can follow them or their dynasty, or open their family tree; you will then be alerted when they make history.</p>
          <p>Portraits and town views are drawn from the simulation: age, sex, culture (skin tone follows the climate of a culture's homeland), occupation, rank and the technology of their home decide the face and dress; population, buildings, era, sieges and war damage decide the town. Exact features and street layouts are decoration generated from a fixed seed, so they stay the same as long as the person or town exists.</p>
          {onTour && <button onClick={onTour}>Replay the guided tour</button>}
        </section>
        <section>
          <h3>Following causes</h3>
          <p>Every inspector links onward: a settlement to its polity, its people and its history; a person to their family, memories and deeds; an event to the earlier events that caused it and the later ones it led to. The “Why” line on each event is written from the state of the world at that moment, for example the food stocks during a famine or the grievances behind a war.</p>
        </section>
        <section>
          <h3>Experiments</h3>
          <p>The Experiments tab runs many worlds in parallel in the background while you keep exploring. Compare conditions (different parameters or interventions) across the same seeds, or branch many futures from the world you are watching. The analysis reports means with 95% confidence intervals, Welch's t-test and Mann–Whitney U with a false-discovery-rate correction, effect sizes, and which features of a world predict how it turns out. A difference is only called systematic when it survives that correction and is large.</p>
        </section>
        <section>
          <h3>Saving</h3>
          <p>Saves go to this browser's storage on your computer (Library). Export a world to a file to back it up or share it. Loading a save resumes exactly the same future.</p>
        </section>
      </div>
    </Modal>
  );
}
