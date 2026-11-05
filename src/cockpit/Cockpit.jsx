import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  useConfig, useEditorPanelConfig, useElementColumns, useElementData, usePluginStyle, useVariable,
} from '@sigmacomputing/plugin';
import sharedSample from '../sampleData.json';
import cockpitSample from './cockpitSample.json';
import { forcedDemo, host } from '../detect.js';
import { FIELD_LABELS, buildDataset, fmtDate, lineageFor, rowsFromElement, wellKey } from '../model.js';
import {
  CHANNEL_METRIC, COCKPIT_SOURCES, FACT_LABELS, FACT_NUMBERS, KPIS, SEASON, applyFilters, channelKey, compute,
  distinct, fmtKpi, fmtMoney, fmtWeek, latestChecks, normaliseFacts, periodWeeks, periodsOf, statusOf, weeklyByChannel,
} from './metrics.js';

// ---------------------------------------------------------------- editor panel: elements and data wells
const LABELS = { ...FIELD_LABELS, ...FACT_LABELS };
const PANEL = [
  ...COCKPIT_SOURCES.flatMap((src) => [
    { name: src.key, type: 'element', label: `${src.label}${src.required ? '' : ' (optional)'}` },
    ...src.fields.map((f) => ({
      name: wellKey(src, f), type: 'column', source: src.key, allowMultiple: false,
      label: `${LABELS[f] || f}${src.requiredFields.includes(f) ? ' (required)' : ''}`,
      ...(FACT_NUMBERS.has(f) ? { allowedTypes: ['number', 'integer'] } : {}),
    })),
  ]),
  { name: 'selectedMetric', type: 'variable', label: 'Selected metric control (optional, opens it in Number check)' },
  { name: 'useSampleData', type: 'toggle', label: 'Use Harborline sample data', defaultValue: false },
];

const SAMPLE_FACTS = cockpitSample.rows.map((r) => Object.fromEntries(cockpitSample.fields.map((f, i) => [f, r[i]])));
const SAMPLE_RAW = {
  facts: SAMPLE_FACTS, catalogue: sharedSample.metric_catalogue, lineage: sharedSample.metric_lineage, checks: sharedSample.metric_checks,
};

function useSigmaSources(config) {
  const cols = [];
  const datas = [];
  for (const src of COCKPIT_SOURCES) {
    const id = config?.[src.key] ? src.key : '';
    /* eslint-disable react-hooks/rules-of-hooks */
    cols.push(useElementColumns(id));
    datas.push(useElementData(id));
    /* eslint-enable react-hooks/rules-of-hooks */
  }
  return useMemo(() => {
    const out = {};
    COCKPIT_SOURCES.forEach((src, i) => { out[src.key] = config?.[src.key] ? rowsFromElement(src, cols[i], datas[i], config) : null; });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, ...cols, ...datas]);
}

function useHostMode() {
  const [mode, setMode] = useState(forcedDemo ? 'demo' : host.inSigma ? 'sigma' : 'detecting');
  useEffect(() => {
    if (mode !== 'detecting') return undefined;
    if (host.inSigma) { setMode('sigma'); return undefined; }
    const on = () => setMode('sigma');
    host.listeners.add(on);
    const t = setTimeout(() => setMode((m) => (m === 'detecting' ? 'demo' : m)), 1500);
    return () => { host.listeners.delete(on); clearTimeout(t); };
  }, [mode]);
  return mode;
}

const luminance = (hex) => {
  const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

// ---------------------------------------------------------------- metric card context
const CardCtx = createContext(null);
const useCard = () => useContext(CardCtx);

export default function Cockpit() {
  useEditorPanelConfig(PANEL);
  const mode = useHostMode();
  const config = useConfig() || {};
  const style = usePluginStyle();
  const sigmaRows = useSigmaSources(mode === 'sigma' ? config : null);
  const [, setMetricVar] = useVariable('selectedMetric');
  const useSample = mode === 'demo' || (mode === 'sigma' && config.useSampleData);

  const missing = useMemo(() => {
    if (mode !== 'sigma' || useSample) return [];
    return COCKPIT_SOURCES.filter((s) => s.required).flatMap((s) => {
      const r = sigmaRows[s.key];
      if (!r) return [{ source: s.label, problem: 'No element selected' }];
      if (r.missing.length) return [{ source: s.label, problem: `Fill the ${r.missing.join(', ')} ${r.missing.length > 1 ? 'wells' : 'well'}` }];
      return [];
    });
  }, [mode, useSample, sigmaRows]);

  const data = useMemo(() => {
    const raw = useSample ? SAMPLE_RAW : Object.fromEntries(COCKPIT_SOURCES.map((s) => [s.key, sigmaRows[s.key]?.rows || []]));
    const ref = buildDataset({ catalogue: raw.catalogue, checks: raw.checks, lineage: raw.lineage });
    return { facts: normaliseFacts(raw.facts), ref };
  }, [useSample, sigmaRows]);

  const periods = useMemo(() => periodsOf(data.facts), [data.facts]);
  const [period, setPeriod] = useState('');
  const [region, setRegion] = useState('');
  const [channel, setChannel] = useState('');
  const [focusCat, setFocusCat] = useState('');
  const [toast, setToast] = useState('');
  // Until someone picks a period: the latest quarter with at least eight weeks of data (Q3 2026 in the sample).
  const picked = useRef(false);
  const choosePeriod = (p) => { picked.current = true; setPeriod(p); };
  useEffect(() => {
    if (!data.facts.length) return;
    if (picked.current && periods.includes(period)) return;
    if (useSample && periods.includes('Q3 2026')) { setPeriod('Q3 2026'); return; }
    const weeks = {};
    for (const r of data.facts) (weeks[r.period] ||= new Set()).add(r.week);
    const full = periods.filter((p) => p !== SEASON && (weeks[p]?.size || 0) >= 8);
    setPeriod(full.length ? full[full.length - 1] : periods[0]);
  }, [periods, period, data.facts, useSample]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 4200); return () => clearTimeout(t); }, [toast]);

  const theme = mode === 'sigma' ? (luminance(style?.backgroundColor) < 0.45 ? 'dark' : 'light') : undefined;
  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
  }, [theme]);

  const regions = useMemo(() => distinct(data.facts, 'region'), [data.facts]);
  const channels = useMemo(() => distinct(data.facts, 'channel'), [data.facts]);
  const categories = useMemo(() => distinct(data.facts, 'category'), [data.facts]);
  const filtered = useMemo(() => applyFilters(data.facts, { region, channel }), [data.facts, region, channel]);
  const k = useMemo(() => compute(filtered, data.facts, period), [filtered, data.facts, period]);
  const byCat = useMemo(() => categories.map((c) => ({ category: c, ...compute(filtered.filter((r) => r.category === c), data.facts, period) })), [categories, filtered, data.facts, period]);
  const weekly = useMemo(() => weeklyByChannel(filtered, data.facts), [filtered, data.facts]);
  const inPeriod = useMemo(() => periodWeeks(data.facts, period), [data.facts, period]);
  const channelTotals = useMemo(() => {
    const t = { stores: 0, online: 0, wholesale: 0 };
    for (const r of filtered) if (period === SEASON || r.period === period) t[channelKey(r.channel)] += r.net_revenue;
    return t;
  }, [filtered, period]);
  const runAt = useMemo(() => {
    const all = KPIS.flatMap((x) => latestChecks(data.ref.checks, x.id)).map((c) => c.run_at).filter(Boolean);
    return all.length ? fmtDate(all.sort().pop()) : '';
  }, [data.ref.checks]);

  const scope = [region || 'all regions', channel ? `${channel.toLowerCase()} only` : 'all channels'].join(', ');
  const ctxValue = {
    ref: data.ref, period, scope, k, bound: mode === 'sigma' && !!config.selectedMetric,
    open: (id) => {
      if (mode === 'sigma' && config.selectedMetric) setMetricVar(id);
      else if (mode === 'demo' || useSample) setToast('In Sigma, clicking a figure opens it in Number check on the same page.');
    },
  };

  if (mode === 'detecting') return <div className="ck loading" aria-busy="true">Loading the cockpit</div>;
  if (missing.length) return <Setup missing={missing} />;

  return (
    <CardCtx.Provider value={ctxValue}>
      <div className="ck">
        <header className="top">
          <div className="brand">
            <Mark />
            <div>
              <h1>Spring cockpit</h1>
              <p className="sub">
                Harborline Outfitters
                {runAt && <span>Checks run {runAt}</span>}
                {useSample && <span className="sample">Sample data as of {cockpitSample.asOf}</span>}
              </p>
            </div>
          </div>
          <Seg label="Period" value={period} onChange={choosePeriod} options={periods.map((p) => [p, p])} onDark />
        </header>

        <div className="filters">
          <Seg label="Region" value={region} onChange={setRegion} options={[['', 'All regions'], ...regions.map((r) => [r, r])]} />
          <Seg label="Channel" value={channel} onChange={setChannel} options={[['', 'All channels'], ...channels.map((c) => [c, c])]} />
          <p className="hint"><InfoIcon /> Hover or tap any figure for its definition and lineage</p>
        </div>

        <section className="tiles" aria-label="Key figures">
          {KPIS.map((x) => {
            // With one channel selected, net revenue is that channel's own catalogue metric.
            const kpi = x.key === 'revenue' && channel ? { ...x, id: CHANNEL_METRIC[channelKey(channel)], fallback: `${channel} net revenue` } : x;
            return <Tile key={x.id} kpi={kpi} value={k[x.key]} />;
          })}
        </section>

        <div className="grid">
          <Panel className="span-2" titleId="M01" title="Net revenue by week and channel"
            note={period === SEASON ? 'Season to date' : `${period} highlighted against the season`}>
            <RevenueChart weekly={weekly} inPeriod={inPeriod} channel={channel} totals={channelTotals} />
          </Panel>
          <Panel titleId="M06" title="Sell-through by category" note={`Season to date, to the week of ${fmtWeek(k.lastWeek, true)}`}>
            <Bars rows={byCat} valueKey="sellThrough" unit="%" focus={focusCat} onFocus={setFocusCat} max={100} />
          </Panel>
          <Panel titleId="M07" title="Weeks of supply by category" note={`Week of ${fmtWeek(k.lastWeek, true)}. Band shows a 10 to 14 week target (sample)`}>
            <Bars rows={byCat} valueKey="wos" unit="weeks" focus={focusCat} onFocus={setFocusCat} band={[10, 14]} />
          </Panel>
          <Panel titleId="M05" title="Gross margin by category" note={period}>
            <Bars rows={byCat} valueKey="margin" unit="%" focus={focusCat} onFocus={setFocusCat} />
          </Panel>
          <Panel titleId="M10" title="Inventory at cost by category" note={`Week of ${fmtWeek(k.lastWeek, true)}`}>
            <Bars rows={byCat} valueKey="invCost" unit="$" focus={focusCat} onFocus={setFocusCat} />
          </Panel>
        </div>

        <section className="panel table-panel" aria-label="Category detail">
          <div className="panel-head"><h2>Category detail</h2><p className="muted">{period}, {scope}. Select a row to highlight it in the charts.</p></div>
          <CategoryTable rows={byCat} focus={focusCat} onFocus={setFocusCat} />
        </section>
        <div className="toast" role="status" aria-live="polite">{toast && <p>{toast}</p>}</div>
      </div>
      <MetricCardLayer />
    </CardCtx.Provider>
  );
}

// ---------------------------------------------------------------- pieces
function Seg({ label, value, onChange, options, onDark }) {
  return (
    <div className={`seg ${onDark ? 'on-dark' : ''}`} role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v || 'all'} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

function Tile({ kpi, value }) {
  const { ref } = useCard();
  const m = ref.catalogue.find((x) => x.metric_id === kpi.id);
  const st = statusOf(m, ref.checks);
  const trigger = useTrigger(kpi.id);
  return (
    <button type="button" className="tile" {...trigger}>
      <span className="tile-label">{m?.metric_name || kpi.fallback}<InfoIcon /></span>
      <span className="tile-value">{fmtKpi(value, kpi.unit)}</span>
      <span className={`tile-status ${st.key}`}><StatusIcon k={st.key} />{st.label}</span>
    </button>
  );
}

function Panel({ title, titleId, note, children, className = '' }) {
  const trigger = useTrigger(titleId);
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <h2><button type="button" className="metric-link" {...trigger}>{title}<InfoIcon /></button></h2>
        {note && <p className="muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function ChannelKey({ ck, label, total }) {
  const trigger = useTrigger(CHANNEL_METRIC[ck]);
  return (
    <button type="button" className="legend-item metric-link" {...trigger}>
      <i className={`swatch ${ck}`} />{label}<span className="legend-val">{fmtMoney(total)}</span>
    </button>
  );
}

function RevenueChart({ weekly, inPeriod, channel, totals }) {
  const [hover, setHover] = useState(null);
  const keys = ['stores', 'online', 'wholesale'].filter((c) => !channel || channelKey(channel) === c);
  const W = 720, H = 240, padL = 48, padB = 26, padT = 10;
  const max = Math.max(1, ...weekly.map((w) => keys.reduce((a, c) => a + w[c], 0)));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const bw = (W - padL) / weekly.length;
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const labels = { stores: 'Stores', online: 'Online', wholesale: 'Wholesale' };
  return (
    <div className="chart">
      <div className="legend">
        {keys.map((c) => <ChannelKey key={c} ck={c} label={labels[c]} total={totals[c]} />)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly net revenue by channel" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}>
            <line x1={padL} x2={W} y1={y(v)} y2={y(v)} className="gridline" />
            <text x={padL - 6} y={y(v) + 4} className="axis" textAnchor="end">{fmtMoney(v)}</text>
          </g>
        ))}
        {weekly.map((w, i) => {
          let acc = 0;
          const on = inPeriod.has(w.week);
          return (
            <g key={w.week} className={on ? 'on' : 'off'} onMouseEnter={() => setHover(i)}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padT - padB} className="hit" />
              {keys.map((c) => {
                const y0 = y(acc); acc += w[c]; const y1 = y(acc);
                return <rect key={c} x={padL + i * bw + 1.5} y={y1} width={Math.max(1, bw - 3)} height={Math.max(0, y0 - y1)} className={`bar ${c}`} />;
              })}
              {(i % 4 === 0) && <text x={padL + i * bw + bw / 2} y={H - 8} className="axis" textAnchor="middle">{fmtWeek(w.week)}</text>}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: `${((padL + hover * bw + bw / 2) / W) * 100}%` }}>
          <strong>Week of {fmtWeek(weekly[hover].week, true)}</strong>
          {keys.map((c) => <span key={c}><i className={`swatch ${c}`} />{labels[c]} {fmtMoney(weekly[hover][c])}</span>)}
        </div>
      )}
    </div>
  );
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function Bars({ rows, valueKey, unit, focus, onFocus, band, max }) {
  const vals = rows.map((r) => r[valueKey]).filter((v) => v != null);
  const top = max || Math.max(1, ...vals, band ? band[1] * 1.15 : 0) * 1.08;
  const pct = (v) => `${Math.max(0, Math.min(100, (v / top) * 100))}%`;
  if (!vals.length) return <p className="muted empty">Not defined for this selection{valueKey === 'sellThrough' ? ': sell-through excludes wholesale.' : '.'}</p>;
  return (
    <ul className={`bars ${band ? 'has-band' : ''}`} style={band ? { '--b0': pct(band[0]), '--b1': pct(band[1]) } : undefined}>
      {rows.map((r) => {
        const v = r[valueKey];
        const flag = band && v != null ? (v > band[1] * 1.4 ? 'over' : v < band[0] * 0.8 ? 'under' : '') : '';
        return (
          <li key={r.category}>
            <button type="button" className="bar-row" aria-pressed={focus === r.category} onClick={() => onFocus(focus === r.category ? '' : r.category)}>
              <span className="bar-name">{r.category}</span>
              <span className="bar-track"><span className={`bar-fill ${focus === r.category ? 'focus' : ''}`} style={{ width: v == null ? 0 : pct(v) }} /></span>
              <span className={`bar-val ${flag}`}>{fmtKpi(v, unit)}{flag && <span className="vh">{flag === 'over' ? ', well above target' : ', below target'}</span>}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CategoryTable({ rows, focus, onFocus }) {
  const cols = [
    ['revenue', 'M01', '$'], ['margin', 'M05', '%'], ['sellThrough', 'M06', '%'], ['wos', 'M07', 'weeks'], ['invCost', 'M10', '$'],
  ];
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Category</th>
            {cols.map(([key, id]) => <HeadCell key={key} id={id} />)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.category} aria-selected={focus === r.category} onClick={() => onFocus(focus === r.category ? '' : r.category)}>
              <th scope="row">{r.category}</th>
              {cols.map(([key, , unit]) => <td key={key}>{fmtKpi(r[key], unit)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeadCell({ id }) {
  const { ref } = useCard();
  const m = ref.catalogue.find((x) => x.metric_id === id);
  const short = { M01: 'Net revenue', M05: 'Gross margin', M06: 'Sell-through', M07: 'Weeks of supply', M10: 'Inventory at cost' }[id];
  const trigger = useTrigger(id);
  return <th scope="col"><button type="button" className="metric-link" {...trigger} aria-label={m?.metric_name || short}>{short}<InfoIcon /></button></th>;
}

// ---------------------------------------------------------------- the hover card: definition, calculation, lineage, checks
const CardState = { set: null };

function useTrigger(metricId) {
  const card = useCard();
  const show = (e) => CardState.set?.({ id: metricId, anchor: e.currentTarget, pinned: false });
  return {
    onMouseEnter: show,
    onFocus: show,
    onMouseLeave: () => CardState.set?.((s) => (s && !s.pinned ? { ...s, leaving: true } : s)),
    onBlur: () => CardState.set?.((s) => (s && !s.pinned ? null : s)),
    onClick: (e) => {
      CardState.set?.({ id: metricId, anchor: e.currentTarget, pinned: true });
      card.open(metricId);
    },
    'aria-describedby': 'metric-card',
  };
}

function MetricCardLayer() {
  const ctx = useCard();
  const [state, setState] = useState(null);
  const [pos, setPos] = useState(null);
  const cardRef = useRef(null);
  const hideTimer = useRef(null);
  CardState.set = setState;

  useEffect(() => {
    clearTimeout(hideTimer.current);
    if (state?.leaving) hideTimer.current = setTimeout(() => setState(null), 160);
  }, [state]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setState(null); };
    const onDown = (e) => {
      if (!state?.pinned) return;
      if (cardRef.current?.contains(e.target) || state.anchor?.contains(e.target)) return;
      setState(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [state]);
  const place = useCallback(() => {
    if (!state?.anchor || !cardRef.current) return;
    const a = state.anchor.getBoundingClientRect();
    const c = cardRef.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, gap = 8;
    let left = Math.min(Math.max(8, a.left), vw - c.width - 8);
    let top = a.bottom + gap;
    if (top + c.height > vh - 8) top = Math.max(8, a.top - c.height - gap);
    setPos({ left, top });
  }, [state]);
  useEffect(() => { place(); }, [place]);
  useEffect(() => {
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [place]);

  if (!state) return <div id="metric-card" hidden />;
  const m = ctx.ref.catalogue.find((x) => x.metric_id === state.id);
  const st = statusOf(m, ctx.ref.checks);
  const checks = latestChecks(ctx.ref.checks, state.id);
  const trace = m ? lineageFor(ctx.ref, state.id, '') : [];
  const sources = trace.filter((s) => s.layer === 'Source').map((s) => s.system);
  const steps = trace.filter((s) => s.layer !== 'Source');
  const passed = checks.filter((c) => c.result === 'Pass').length;
  return (
    <div id="metric-card" ref={cardRef} className={`card st-${st.key}`} role="dialog" aria-label={`${m?.metric_name || 'Metric'}: definition and lineage`}
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
      onMouseEnter={() => setState((s) => (s ? { ...s, leaving: false } : s))}
      onMouseLeave={() => setState((s) => (s && !s.pinned ? { ...s, leaving: true } : s))}>
      <div className="card-head">
        <p className="card-title">{m?.metric_name || 'Not in the catalogue'}</p>
        <span className={`stamp ${st.key}`}><StatusIcon k={st.key} />{st.label}</span>
      </div>
      {m ? (
        <>
          <p className="card-def">{m.definition}</p>
          {m.rule && <p className="card-rule"><strong>The rule that matters.</strong> {m.rule}</p>}
          <p className="card-calc"><strong>Calculated here.</strong> {calcText(state.id, ctx)}</p>
          <p className="card-meta">
            <span><b>Owner</b> {m.owner_role}</span>
            <span><b>Approver</b> {m.approver_role}</span>
            <span><b>Definition</b> {m.version}{m.approved_on ? `, approved ${fmtDate(m.approved_on)}` : ', not yet approved'}</span>
          </p>
          {trace.length > 0 && (
            <div className="card-trace">
              <p className="card-label">Where it came from</p>
              {sources.length > 0 && <p className="card-sources">{joinList(sources)}</p>}
              <ol>
                {steps.map((s, i) => (
                  <li key={i} className={/gold|certified/i.test(s.layer) ? 'gold' : ''}>
                    <span className="step-layer">{layerLabel(s.layer)}</span> <span className="step-obj">{s.object_name}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="card-checks">
            <p className="card-label">
              {checks.length ? `${passed} of ${checks.length} checks passed${checks[0].run_at ? `, run ${fmtDate(checks[0].run_at)}` : ''}` : 'No checks have run yet'}
            </p>
            <ul>
              {checks.map((c, i) => (
                <li key={i} className={`r-${c.result.toLowerCase()}`}><ResultIcon r={c.result} />{c.check_name}</li>
              ))}
            </ul>
          </div>
          <p className="card-reason">{st.reason}</p>
          {ctx.bound && <p className="card-foot">Click to open it in Number check.</p>}
        </>
      ) : (
        <p className="card-def">This figure has no catalogue entry. Add one with metric ID {state.id} to see its definition and lineage.</p>
      )}
    </div>
  );
}

function calcText(id, { period, scope, k }) {
  const p = period === SEASON ? 'the season to date' : period;
  const end = fmtWeek(k.lastWeek, true);
  const start = fmtWeek(k.seasonStart, true);
  return {
    M01: `Sum of net revenue for ${scope}, ${p}.`,
    M02: `Sum of net revenue for the stores channel, ${p}.`,
    M03: `Sum of net revenue for the online channel, ${p}.`,
    M04: `Sum of net revenue for the wholesale channel, ${p}.`,
    M05: `Net revenue less cost of goods, divided by net revenue, for ${scope}, ${p}.`,
    M06: `Units sold divided by units received from ${start} to the week of ${end}, stores and online only, ${scope}.`,
    M07: `Units on hand in the week of ${end}, divided by planned weekly units for the next eight weeks, ${scope}.`,
    M10: `Inventory at cost in the week of ${end}, ${scope}.`,
  }[id] || `Read from the gold layer for ${scope}, ${p}.`;
}

const layerLabel = (l) => ({ Bronze: 'Bronze', Silver: 'Silver', Gold: 'Gold', Certified: 'Gold', Snowflake: 'Silver', Sigma: 'Sigma' }[l] || l);
const joinList = (xs) => {
  const u = [...new Set(xs)];
  return u.length < 2 ? `From ${u[0] || ''}` : `From ${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`;
};

// ---------------------------------------------------------------- small shared marks
function Mark() {
  return (
    <svg className="mark" viewBox="0 0 64 64" width="36" height="36" aria-hidden="true" focusable="false">
      <g fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 44 L23 17 L32 30 L40 22 L57 44" stroke="var(--on-spruce)" />
        <path d="M7 53 H27 M37 53 H57" stroke="var(--aspen)" />
      </g>
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg className="info" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="8" cy="4.9" r="0.9" fill="currentColor" />
    </svg>
  );
}
function StatusIcon({ k }) {
  return <span className={`sicon ${k}`}><ResultIcon r={k === 'certified' ? 'Pass' : k === 'blocked' ? 'Fail' : 'Warn'} /></span>;
}
function ResultIcon({ r }) {
  const p = { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: 'false' };
  if (r === 'Pass') return <svg {...p}><path d="M3.2 8.4l3 3 6.6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (r === 'Fail') return <svg {...p}><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  return <svg {...p}><path d="M8 3.5v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="8" cy="12" r="1.1" fill="currentColor" /></svg>;
}
function Setup({ missing }) {
  return (
    <div className="ck setup">
      <h1>The cockpit needs its data</h1>
      <p>Select each element in the editor panel, then drag its columns into the matching data wells. Wells marked required must be filled.</p>
      <ul>{missing.map((m, i) => <li key={i}><strong>{m.source}.</strong> {m.problem}</li>)}</ul>
      <p>To see it working first, turn on Use Harborline sample data.</p>
    </div>
  );
}
