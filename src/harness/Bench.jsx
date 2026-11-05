import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import pluginHtml from './pluginHtml.generated.js';
import { ELEMENTS, colId, colName, initialTables, parseCell } from './tables.js';
import { ACTIONS, CONTROLS, SigmaHost } from './sigmaHost.js';
import { buildDataset, fmtValue, statusFor, valueFor } from '../model.js';

const BACKGROUNDS = [['#ffffff', 'White'], ['#f4f5f7', 'Light grey'], ['#1d2026', 'Dark']];
const WIDTHS = [['full', 'Full'], [1000, '1000px'], [720, '720px'], [390, '390px']];
const COCKPIT = ['M01', 'M05', 'M06', 'M07', 'M09'];

function defaultConfig(tables) {
  const c = { selectedMetric: 'ctl-metric', selectedPeriod: 'ctl-period', raiseQuery: 'act-log-query', showQueryButton: true, useSampleData: false };
  for (const el of ELEMENTS) {
    c[el.key] = el.id;
    for (const f of tables[el.id].fields) c[`${el.key}_${f}`] = colId(el.id, f);
  }
  return c;
}

const clock = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function Bench() {
  const [tables, setTables] = useState(initialTables);
  const [config, setConfig] = useState(() => defaultConfig(initialTables()));
  const [controls, setControls] = useState({ 'ctl-metric': 'M01', 'ctl-period': 'Q3 2026' });
  const [background, setBackground] = useState('#ffffff');
  const [naming, setNaming] = useState('display');
  const [panel, setPanel] = useState([]);
  const [log, setLog] = useState([]);
  const [queries, setQueries] = useState([]);
  const [width, setWidth] = useState('full');
  const [height, setHeight] = useState(780);
  const [frameKey, setFrameKey] = useState(0);
  const [tab, setTab] = useState('panel');
  const [dataTab, setDataTab] = useState('el-checks');
  const [note, setNote] = useState('');

  const stateRef = useRef();
  stateRef.current = { tables, config, controls, background, naming };

  const addLog = useCallback((dir, type, detail) => {
    setLog((l) => [{ t: clock(), dir, type: type.replace(/^wb:plugin:/, ''), detail }, ...l].slice(0, 250));
  }, []);

  const hostRef = useRef(null);
  if (!hostRef.current) {
    hostRef.current = new SigmaHost({
      getState: () => stateRef.current,
      onInspector: (opts) => setPanel(opts),
      onLog: addLog,
      onVariableSet: (configId, values) => {
        const ctl = stateRef.current.config[configId];
        if (ctl) setControls((c) => ({ ...c, [ctl]: String(values[0] ?? '') }));
      },
      onAction: (configId) => {
        const s = stateRef.current;
        if (s.config[configId] !== 'act-log-query') return;
        setQueries((q) => [{ t: clock(), metric: s.controls['ctl-metric'], period: s.controls['ctl-period'] }, ...q]);
        flash('The plugin fired Raise a query. A row was added to the query log.');
      },
    });
  }
  const host = hostRef.current;
  useEffect(() => () => host.destroy(), [host]);

  const flash = (msg) => { setNote(msg); };
  useEffect(() => { if (!note) return undefined; const t = setTimeout(() => setNote(''), 4500); return () => clearTimeout(t); }, [note]);

  // Push changes the way Sigma would. Skip the first run: the plugin's init covers it.
  const first = useRef({ config: true, data: true, vars: true, style: true });
  useEffect(() => { if (first.current.config) { first.current.config = false; return; } host.pushConfig(); host.pushAllElements(); }, [config, host]);
  useEffect(() => { if (first.current.data) { first.current.data = false; return; } host.pushAllElements(); }, [tables, naming, host]);
  useEffect(() => { if (first.current.vars) { first.current.vars = false; return; } host.pushVariables(); }, [controls, config.selectedMetric, config.selectedPeriod, host]);
  useEffect(() => { if (first.current.style) { first.current.style = false; return; } host.pushStyle(); }, [background, host]);

  const frameRef = useCallback((node) => { if (node) host.attach(node.contentWindow); }, [host]);
  const reload = () => { setPanel([]); setFrameKey((k) => k + 1); addLog('Bench', 'reload', 'Plugin reloaded'); };
  const reset = () => {
    const t = initialTables();
    setTables(t); setConfig(defaultConfig(t)); setControls({ 'ctl-metric': 'M01', 'ctl-period': 'Q3 2026' });
    setBackground('#ffffff'); setNaming('display'); setWidth('full'); setQueries([]);
    flash('Everything reset to the starting data and settings.');
  };

  // The cockpit reads the same tables, as other workbook elements would.
  const ds = useMemo(() => buildDataset({
    catalogue: tables['el-catalogue'].rows, values: tables['el-values'].rows, checks: tables['el-checks'].rows,
  }), [tables]);
  const period = ds.periods.includes(controls['ctl-period']) ? controls['ctl-period'] : ds.periods[0];

  const editRow = (elId, match, patch) => setTables((ts) => {
    const t = ts[elId];
    return { ...ts, [elId]: { ...t, rows: t.rows.map((r) => (match(r) ? { ...r, ...patch } : r)) } };
  });

  const scenarios = [
    { title: 'Fail today\u2019s ledger check', desc: 'Q3 net revenue stops tying to NetSuite. It should turn Blocked in the plugin and on the cockpit.',
      run: () => { editRow('el-checks', (r) => r.metric_id === 'M01' && r.period === 'Q3 2026' && r.check_name === 'Ties to the general ledger',
        { expected: 45.41, actual: 44.6, variance_pct: -1.78, result: 'Fail', note: 'A credit memo posted in NetSuite after the model ran.' });
        setControls((c) => ({ ...c, 'ctl-metric': 'M01', 'ctl-period': 'Q3 2026' })); } },
    { title: 'Approve the active customer definition', desc: 'The CFO approves v1.0 and the customer match reaches 95.4%. Active customers should turn Certified.',
      run: () => { editRow('el-catalogue', (r) => r.metric_id === 'M09', { version: 'v1.0', approved_on: '2027-01-12', ai_allowed: 'Yes', rule: 'One customer per matched identity across Shopify, NetSuite and Salesforce.' });
        editRow('el-checks', (r) => r.metric_id === 'M09', { actual: 95.4, result: 'Pass', note: '' });
        setTables((ts) => ({ ...ts, 'el-signoffs': { ...ts['el-signoffs'], rows: [...ts['el-signoffs'].rows, { metric_id: 'M09', period: '', action: 'Definition v1.0 approved', by_role: 'CFO', at: '2027-01-12', note: '' }] } }));
        setControls((c) => ({ ...c, 'ctl-metric': 'M09' })); } },
    { title: 'Late store snapshots arrive', desc: 'All 60 stores report inventory. Weeks of supply should turn Certified.',
      run: () => { editRow('el-checks', (r) => r.metric_id === 'M07' && r.check_name === 'Every store reported inventory', { actual: 60, result: 'Pass', note: '' });
        setControls((c) => ({ ...c, 'ctl-metric': 'M07' })); } },
    { title: 'Use warehouse column names', desc: 'Columns arrive as METRIC_ID instead of Metric Id. Nothing in the plugin should change.',
      run: () => setNaming((n) => (n === 'warehouse' ? 'display' : 'warehouse')) },
    { title: 'Empty a required data well', desc: 'Clear the catalogue\u2019s Definition well. The plugin should name the well to fill.',
      run: () => setConfig((c) => ({ ...c, catalogue_definition: undefined })) },
    { title: 'Unbind the metric values element', desc: 'The plugin should show its setup screen.',
      run: () => setConfig((c) => ({ ...c, values: undefined })) },
    { title: 'Turn on sample data', desc: 'The plugin ignores the workbook and uses its built-in Harborline data.',
      run: () => setConfig((c) => ({ ...c, useSampleData: !c.useSampleData })) },
    { title: 'Dark workbook background', desc: 'The plugin should switch to its dark theme.',
      run: () => setBackground((b) => (b === '#1d2026' ? '#ffffff' : '#1d2026')) },
    { title: 'Narrow element, 390px', desc: 'The metric list becomes a dropdown and the sections stack.',
      run: () => setWidth((w) => (w === 390 ? 'full' : 390)) },
  ];

  const srcDoc = useMemo(() => pluginHtml, []);
  const frameW = width === 'full' ? '100%' : `${width}px`;

  return (
    <div className="tb">
      <header className="tb-top">
        <div>
          <h1>Number check test bench</h1>
          <p>A simulated Sigma workbook. The plugin in the frame is the real build, talking to a stand-in for Sigma over the plugin protocol.</p>
        </div>
        <div className="tb-top-actions">
          <button type="button" onClick={reload}>Reload plugin</button>
          <button type="button" onClick={reset}>Reset everything</button>
        </div>
      </header>

      <div className="tb-main">
        <section className="tb-canvas" aria-label="Workbook">
          <div className="tb-controls">
            <label>
              <span>Period control</span>
              <select value={controls['ctl-period']} onChange={(e) => setControls((c) => ({ ...c, 'ctl-period': e.target.value }))}>
                {ds.periods.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>
              <span>Selected metric control</span>
              <input value={controls['ctl-metric']} onChange={(e) => setControls((c) => ({ ...c, 'ctl-metric': e.target.value }))} placeholder="M01 or a metric name" />
            </label>
            <p className="tb-hint">Click a tile to set the metric control, as a Sigma action would.</p>
          </div>

          <div className="tb-tiles">
            {COCKPIT.map((id) => {
              const m = ds.catalogue.find((x) => x.metric_id === id);
              if (!m) return null;
              const v = valueFor(ds, id, period);
              const st = statusFor(ds, m, period);
              const active = String(controls['ctl-metric']).toLowerCase() === id.toLowerCase() || String(controls['ctl-metric']).toLowerCase() === String(m.metric_name).toLowerCase();
              return (
                <button type="button" key={id} className="tb-tile" aria-pressed={active}
                  onClick={() => setControls((c) => ({ ...c, 'ctl-metric': id }))}>
                  <span className="tb-tile-name">{m.metric_name}</span>
                  <span className="tb-tile-value">{v ? fmtValue(v.value, v.unit || m.unit) : 'None'}</span>
                  <span className={`tb-tile-status s-${st.key}`}>{st.label}</span>
                </button>
              );
            })}
          </div>

          <div className="tb-element">
            <div className="tb-element-bar">
              <span className="tb-element-title">Plugin element: Number check</span>
              <div className="tb-seg" role="group" aria-label="Element width">
                {WIDTHS.map(([w, l]) => <button type="button" key={w} aria-pressed={width === w} onClick={() => setWidth(w)}>{l}</button>)}
              </div>
              <label className="tb-inline">
                <span>Height</span>
                <select value={height} onChange={(e) => setHeight(Number(e.target.value))}>
                  {[560, 680, 780, 920].map((h) => <option key={h} value={h}>{h}px</option>)}
                </select>
              </label>
            </div>
            <div className="tb-frame-wrap" style={{ background: background }}>
              <iframe key={frameKey} ref={frameRef} title="Number check plugin" srcDoc={srcDoc}
                style={{ width: frameW, height: `${height}px`, background }} />
            </div>
          </div>

          <DataEditor tables={tables} setTables={setTables} dataTab={dataTab} setDataTab={setDataTab} naming={naming} />
        </section>

        <aside className="tb-side" aria-label="Sigma panels">
          <div className="tb-tabs" role="tablist">
            {[['panel', 'Editor panel'], ['scenarios', 'Scenarios'], ['log', `Log (${log.length})`]].map(([k, l]) => (
              <button type="button" role="tab" key={k} aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {tab === 'panel' && (
            <EditorPanel panel={panel} config={config} setConfig={setConfig} tables={tables} naming={naming} setNaming={setNaming}
              background={background} setBackground={setBackground} />
          )}
          {tab === 'scenarios' && (
            <div className="tb-scenarios">
              <p className="tb-muted">Each scenario changes the workbook, not the plugin. Watch what the plugin does, then reset.</p>
              {scenarios.map((sc) => (
                <button type="button" key={sc.title} className="tb-scenario" onClick={() => { sc.run(); flash(`${sc.title}: applied.`); }}>
                  <strong>{sc.title}</strong>
                  <span>{sc.desc}</span>
                </button>
              ))}
            </div>
          )}
          {tab === 'log' && (
            <div className="tb-log">
              <div className="tb-log-head">
                <p className="tb-muted">Every message between the plugin and the stand-in for Sigma, newest first.</p>
                <button type="button" onClick={() => setLog([])}>Clear</button>
              </div>
              {queries.length > 0 && (
                <div className="tb-queries">
                  <h3>Query log (simulated input table)</h3>
                  <ul>{queries.map((q, i) => <li key={i}>{q.t}: query on <strong>{q.metric || 'no metric'}</strong>, {q.period}</li>)}</ul>
                </div>
              )}
              <ol>
                {log.map((e, i) => (
                  <li key={i} className={`tb-ev d-${e.dir.startsWith('Plugin') ? 'out' : e.dir.startsWith('Sigma') ? 'in' : 'bench'}`}>
                    <span className="tb-ev-t">{e.t}</span>
                    <span className="tb-ev-dir">{e.dir}</span>
                    <span className="tb-ev-type">{e.type}</span>
                    {e.detail && <span className="tb-ev-detail">{e.detail}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>
      <div className="tb-note" role="status" aria-live="polite">{note && <p>{note}</p>}</div>
    </div>
  );
}

function EditorPanel({ panel, config, setConfig, tables, naming, setNaming, background, setBackground }) {
  const set = (k, v) => setConfig((c) => ({ ...c, [k]: v }));
  if (!panel.length) return <p className="tb-muted tb-pad">Waiting for the plugin to send its editor panel.</p>;
  const wellsFor = (elName) => panel.filter((o) => o.type === 'column' && o.source === elName);
  const fillByName = (elName, onlyEmpty) => setConfig((c) => {
    const t = c[elName] ? tables[c[elName]] : null;
    if (!t) return c;
    const next = { ...c };
    for (const o of wellsFor(elName)) {
      const field = o.name.slice(elName.length + 1);
      if (onlyEmpty && next[o.name]) continue;
      if (t.fields.includes(field)) next[o.name] = colId(t.id, field);
    }
    return next;
  });
  const fillAll = () => panel.filter((o) => o.type === 'element').forEach((o) => fillByName(o.name, false));
  return (
    <div className="tb-panel">
      <div className="tb-panel-head">
        <h3>Properties</h3>
        <button type="button" onClick={fillAll}>Fill every well by name</button>
      </div>
      {panel.map((o) => {
        const label = o.label || o.name;
        if (o.type === 'element') {
          const wells = wellsFor(o.name);
          const t = config[o.name] ? tables[config[o.name]] : null;
          const filled = wells.filter((w) => config[w.name]).length;
          const reqEmpty = wells.filter((w) => /\(required\)/.test(w.label || '') && !config[w.name]).length;
          return (
            <div key={o.name} className="tb-element-group">
              <label className="tb-field">
                <span>{label}</span>
                <select value={config[o.name] || ''} onChange={(e) => set(o.name, e.target.value || undefined)}>
                  <option value="">None</option>
                  {ELEMENTS.map((el) => <option key={el.id} value={el.id}>{el.name}</option>)}
                </select>
              </label>
              {t && wells.length > 0 && (
                <details className="tb-wells">
                  <summary>
                    Data wells: {filled} of {wells.length} filled
                    {reqEmpty > 0 && <span className="tb-req"> ({reqEmpty} required empty)</span>}
                  </summary>
                  <button type="button" className="tb-fill" onClick={() => fillByName(o.name, true)}>Fill empty wells by name</button>
                  {wells.map((w) => (
                    <label key={w.name} className="tb-well">
                      <span>{w.label}</span>
                      <select value={(Array.isArray(config[w.name]) ? config[w.name][0] : config[w.name]) || ''}
                        onChange={(e) => set(w.name, e.target.value || undefined)}>
                        <option value="">Drop a column here</option>
                        {t.fields.map((f) => <option key={f} value={colId(t.id, f)}>{colName(f, naming)}</option>)}
                      </select>
                    </label>
                  ))}
                </details>
              )}
            </div>
          );
        }
        if (o.type === 'column') return null;
        if (o.type === 'variable') {
          return (
            <label key={o.name} className="tb-field">
              <span>{label}</span>
              <select value={config[o.name] || ''} onChange={(e) => set(o.name, e.target.value || undefined)}>
                <option value="">None</option>
                {Object.entries(CONTROLS).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select>
            </label>
          );
        }
        if (o.type === 'action-trigger') {
          return (
            <label key={o.name} className="tb-field">
              <span>{label} (action on trigger)</span>
              <select value={config[o.name] || ''} onChange={(e) => set(o.name, e.target.value || undefined)}>
                <option value="">No action</option>
                {Object.entries(ACTIONS).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select>
            </label>
          );
        }
        if (o.type === 'toggle' || o.type === 'checkbox') {
          const on = config[o.name] ?? o.defaultValue ?? false;
          return (
            <label key={o.name} className="tb-toggle">
              <input type="checkbox" checked={!!on} onChange={(e) => set(o.name, e.target.checked)} />
              <span>{label}</span>
            </label>
          );
        }
        return <p key={o.name} className="tb-field tb-muted">{label}: {o.type} options are not simulated.</p>;
      })}
      <h3>Format</h3>
      <label className="tb-field">
        <span>Workbook background</span>
        <select value={background} onChange={(e) => setBackground(e.target.value)}>
          {BACKGROUNDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <h3>Workbook</h3>
      <label className="tb-field">
        <span>Column names arrive as</span>
        <select value={naming} onChange={(e) => setNaming(e.target.value)}>
          <option value="display">Sigma display names (Metric Id)</option>
          <option value="warehouse">Warehouse names (METRIC_ID)</option>
        </select>
      </label>
    </div>
  );
}

function DataEditor({ tables, setTables, dataTab, setDataTab, naming }) {
  const t = tables[dataTab];
  const commit = (ri, f, raw) => setTables((ts) => {
    const tt = ts[dataTab];
    const val = parseCell(f, raw);
    if (tt.rows[ri][f] === val) return ts;
    const rows = tt.rows.map((r, i) => (i === ri ? { ...r, [f]: val } : r));
    return { ...ts, [dataTab]: { ...tt, rows } };
  });
  const addRow = () => setTables((ts) => {
    const tt = ts[dataTab];
    const blank = Object.fromEntries(tt.fields.map((f) => [f, '']));
    return { ...ts, [dataTab]: { ...tt, rows: [...tt.rows, blank] } };
  });
  const delRow = (ri) => setTables((ts) => {
    const tt = ts[dataTab];
    return { ...ts, [dataTab]: { ...tt, rows: tt.rows.filter((_, i) => i !== ri) } };
  });
  return (
    <section className="tb-data" aria-label="Workbook data">
      <div className="tb-data-head">
        <h2>Workbook data</h2>
        <p className="tb-muted">Edit a cell and press Enter or click away. The plugin and the cockpit update straight away.</p>
      </div>
      <div className="tb-seg tb-data-tabs" role="tablist">
        {ELEMENTS.map((el) => (
          <button type="button" role="tab" key={el.id} aria-selected={dataTab === el.id} onClick={() => setDataTab(el.id)}>
            {el.name} <span className="tb-count">{tables[el.id].rows.length}</span>
          </button>
        ))}
      </div>
      <div className="tb-grid-wrap">
        <table className="tb-grid">
          <thead>
            <tr>
              <th aria-label="Row actions" />
              {t.fields.map((f) => <th key={f} scope="col">{colName(f, naming)}</th>)}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, ri) => (
              <tr key={ri}>
                <td><button type="button" className="tb-del" aria-label={`Delete row ${ri + 1}`} onClick={() => delRow(ri)}>{'\u00d7'}</button></td>
                {t.fields.map((f) => (
                  <td key={f}>
                    {f === 'result' ? (
                      <select value={r[f]} onChange={(e) => commit(ri, f, e.target.value)}>
                        {['Pass', 'Warn', 'Fail'].map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    ) : (
                      <input key={`${dataTab}-${ri}-${f}-${String(r[f])}`} defaultValue={r[f]} size={Math.min(48, Math.max(6, String(r[f]).length + 1))}
                        onBlur={(e) => commit(ri, f, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} aria-label={`${colName(f, naming)}, row ${ri + 1}`} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="tb-add" onClick={addRow}>Add row</button>
    </section>
  );
}
