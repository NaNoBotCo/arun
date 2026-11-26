// Compare: saved runs side by side, replay with a reproduction check, and scenario import/export.
import { h, button, announce, fmt } from '../core/ui.js';
import { savedRuns, removeRun, onRuns, persistRuns, restoreRuns, forgetStoredRuns, requestReplay, compareMetrics, saveRun } from '../core/tray.js';
import { validateRunRecord } from '../core/record.js';
import { scenario } from '../core/scenario.js';
import { exportPanel } from '../core/exportbox.js';

export function compare(main) {
  const list = h('div', { class: 'runlist' });
  const side = h('div', {});
  const scenOut = h('div', {});
  const importMsg = h('div', { role: 'status' });
  const picked = new Set();

  function paint() {
    const runs = savedRuns();
    list.replaceChildren();
    if (!runs.length) list.append(h('p', { class: 'muted' }, 'No saved runs yet. In any exhibit, open Export and press “Save to Compare”.'));
    for (const r of runs) {
      const rec = r.record;
      const box = h('input', { type: 'checkbox', 'aria-label': 'Pick ' + rec.runId, checked: picked.has(rec.runId) });
      box.addEventListener('change', () => {
        if (box.checked) picked.add(rec.runId);
        else picked.delete(rec.runId);
        paintSide();
      });
      list.append(h('div', { class: 'run-row' }, box,
        h('div', {}, h('b', {}, `${rec.experimentId} · seed ${rec.seed}`), ' ', h('span', { class: 'pill part' }, rec.dataStatus), h('br'), h('code', {}, rec.runId), h('br'), h('span', { class: 'small muted' }, `${rec.metrics.length} metrics · ${rec.createdAt}`)),
        h('div', { class: 'btnrow' },
          button('Replay', () => {
            requestReplay(rec);
            location.hash = '#' + rec.experimentId.toLowerCase();
          }, { kind: 'small primary', title: 'Open the exhibit with these inputs and seed; its Export tab then checks the numbers' }),
          button('Remove', () => {
            picked.delete(rec.runId);
            removeRun(rec.runId);
          }, { kind: 'small' }))));
    }
    paintSide();
  }

  function paintSide() {
    const runs = savedRuns().filter((r) => picked.has(r.record.runId)).map((r) => r.record);
    side.replaceChildren();
    if (runs.length !== 2) {
      side.append(h('p', { class: 'muted small' }, 'Tick two runs to see them side by side.'));
      return;
    }
    const [a, b] = runs;
    const rows = compareMetrics(a.metrics, b.metrics);
    const inputs = [...new Set([...Object.keys(a.inputs), ...Object.keys(b.inputs)])].filter((k) => JSON.stringify(a.inputs[k]) !== JSON.stringify(b.inputs[k]));
    side.append(
      h('h3', {}, `${a.experimentId} seed ${a.seed}  vs  ${b.experimentId} seed ${b.seed}`),
      h('p', { class: 'small' }, inputs.length ? 'Inputs that differ: ' + inputs.join(', ') : 'Same inputs.', a.seed !== b.seed ? ' Different seeds.' : ''),
      h('div', { class: 'table-wrap' }, h('table', { class: 'dtable' },
        h('thead', {}, h('tr', {}, ['Metric', 'A', 'B', 'B − A'].map((c) => h('th', {}, c)))),
        h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.name), h('td', {}, fmt(r.a, 5)), h('td', {}, fmt(r.b, 5)), h('td', {}, Number.isFinite(r.a) && Number.isFinite(r.b) ? fmt(r.b - r.a, 5) : '—')))))));
  }

  const fileIn = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Import a run record or scenario JSON file' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    if (f.size > 200000) {
      importMsg.replaceChildren(h('p', { class: 'note error' }, 'That file is larger than 200 KB. A run record or scenario is a few kilobytes.'));
      return;
    }
    const text = await f.text();
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      importMsg.replaceChildren(h('p', { class: 'note error' }, 'Not valid JSON: ' + e.message));
      return;
    }
    if (obj && obj.schema === 'arun-scenario/1') {
      const r = scenario.importJSON(text);
      importMsg.replaceChildren(h('p', { class: 'note ' + (r.ok ? '' : 'error') }, r.ok ? 'Scenario loaded. Open E02 to run it.' : 'Scenario refused: ' + r.errors.join(' ')));
      return;
    }
    const v = validateRunRecord(obj);
    if (!v.ok) {
      importMsg.replaceChildren(h('p', { class: 'note error' }, 'Not a valid run record: ' + v.errors.slice(0, 6).join('; ')));
      return;
    }
    saveRun(obj, 'imported');
    importMsg.replaceChildren(h('p', { class: 'note' }, `Imported ${obj.experimentId} run ${obj.runId}.`));
  });

  main.replaceChildren(h('div', { class: 'wrap page compare' },
    h('h1', {}, 'Compare and replay'),
    h('p', { class: 'lede' }, 'Saved runs from any exhibit. Replay opens the exhibit with the same inputs and seed, and its Export tab checks every number against the saved run.'),
    h('div', { class: 'btnrow' },
      button('Save these runs in this browser', () => announce(persistRuns() ? 'Saved in this browser.' : 'This browser refused to save.'), { kind: 'small' }),
      button('Load runs saved in this browser', () => announce(`Loaded ${restoreRuns()} runs.`), { kind: 'small' }),
      button('Forget runs saved in this browser', () => {
        forgetStoredRuns();
        announce('Forgotten.');
      }, { kind: 'small' })),
    list,
    h('h2', {}, 'Side by side'),
    side,
    h('h2', {}, 'Import'),
    h('p', { class: 'small' }, 'A run record (from any Export tab) or a scenario file. Files over 200 KB, other shapes and out-of-range values are refused with the reason.'),
    fileIn, importMsg,
    h('h2', {}, 'Shared scenario'),
    h('p', { class: 'small' }, 'The watershed inputs E02–E07 share: seed, storm, wetland, town. Export it to reproduce a meeting run elsewhere.'),
    h('div', { class: 'btnrow' },
      button('Export scenario JSON', () => exportPanel(scenOut, { filename: `arun-scenario-seed${scenario.get().seed}.json`, mime: 'application/json', text: scenario.exportJSON() }), { kind: 'small' }),
      button('Reset scenario for a meeting', () => {
        scenario.reset();
        announce('Scenario reset to the meeting defaults; stored results cleared.');
      }, { kind: 'small' })),
    scenOut));
  const off = onRuns(paint);
  paint();
  return { destroy: off };
}
