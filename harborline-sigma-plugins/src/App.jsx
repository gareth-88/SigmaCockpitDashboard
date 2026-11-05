import React, { useEffect, useMemo, useState } from 'react';
import {
  useActionTrigger, useConfig, useEditorPanelConfig, useElementColumns, useElementData,
  usePluginStyle, useVariable,
} from '@sigmacomputing/plugin';
import sample from './sampleData.json';
import { forcedDemo, host } from './detect.js';
import {
  SOURCES, answersFor, buildDataset, checksFor, fmtCheckValues, fmtDate, fmtValue, fmtVariance,
  byWhom, FIELD_LABELS, NUMBER_FIELDS, lineageFor, rowsFromElement, signoffsFor, statusFor, valueFor, wellKey,
} from './model.js';

// ---------------------------------------------------------------- editor panel
// One element per source, then a data well for each field. Required wells are marked.
const PANEL = [
  ...SOURCES.flatMap((src) => [
    { name: src.key, type: 'element', label: `${src.label}${src.required ? '' : ' (optional)'}` },
    ...src.fields.map((f) => ({
      name: wellKey(src, f),
      type: 'column',
      source: src.key,
      allowMultiple: false,
      label: `${FIELD_LABELS[f] || f}${src.requiredFields.includes(f) ? ' (required)' : ''}`,
      ...(NUMBER_FIELDS.has(f) ? { allowedTypes: ['number', 'integer'] } : {}),
    })),
  ]),
  { name: 'selectedMetric', type: 'variable', label: 'Selected metric control (optional)' },
  { name: 'selectedPeriod', type: 'variable', label: 'Selected period control (optional)' },
  { name: 'raiseQuery', type: 'action-trigger', label: 'Raise a query' },
  { name: 'showQueryButton', type: 'toggle', label: 'Show the Raise a query button', defaultValue: false },
  { name: 'useSampleData', type: 'toggle', label: 'Use Harborline sample data', defaultValue: false },
];

const SAMPLE_RAW = {
  catalogue: sample.metric_catalogue, values: sample.metric_values, checks: sample.metric_checks,
  lineage: sample.metric_lineage, signoffs: sample.metric_signoffs, answers: sample.ai_answer_log,
};

function useSigmaSources(config) {
  // Hooks run in a fixed order: one columns and one data subscription per source.
  const cols = [];
  const datas = [];
  for (const src of SOURCES) {
    const id = config?.[src.key] ? src.key : '';
    /* eslint-disable react-hooks/rules-of-hooks */
    cols.push(useElementColumns(id));
    datas.push(useElementData(id));
    /* eslint-enable react-hooks/rules-of-hooks */
  }
  return useMemo(() => {
    const out = {};
    SOURCES.forEach((src, i) => {
      out[src.key] = config?.[src.key] ? rowsFromElement(src, cols[i], datas[i], config) : null;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, ...cols, ...datas]);
}

const varValue = (v) => {
  const x = v?.defaultValue?.value;
  if (Array.isArray(x)) return x[0] == null ? '' : String(x[0]);
  return x == null ? '' : String(x);
};

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

function luminance(hex) {
  const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

// ---------------------------------------------------------------- app
export default function App() {
  useEditorPanelConfig(PANEL);
  const mode = useHostMode();
  const config = useConfig() || {};
  const style = usePluginStyle();
  const sigmaRows = useSigmaSources(mode === 'sigma' ? config : null);
  const [metricVar, setMetricVar] = useVariable('selectedMetric');
  const [periodVar] = useVariable('selectedPeriod');
  const triggerQuery = useActionTrigger('raiseQuery');

  const useSample = mode === 'demo' || (mode === 'sigma' && config.useSampleData);
  const missingSetup = useMemo(() => {
    if (mode !== 'sigma' || useSample) return [];
    return SOURCES.filter((s) => s.required).flatMap((s) => {
      const r = sigmaRows[s.key];
      if (!r) return [{ source: s.label, problem: 'No element selected' }];
      if (r.missing.length) return [{ source: s.label, problem: `Fill the ${r.missing.join(', ')} ${r.missing.length > 1 ? 'wells' : 'well'}` }];
      return [];
    });
  }, [mode, useSample, sigmaRows]);

  const [localLog, setLocalLog] = useState([]);
  const dataset = useMemo(() => {
    const raw = useSample ? SAMPLE_RAW : Object.fromEntries(SOURCES.map((s) => [s.key, sigmaRows[s.key]?.rows || []]));
    const ds = buildDataset(raw);
    ds.signoffs = [...ds.signoffs, ...localLog];
    return ds;
  }, [useSample, sigmaRows, localLog]);

  const [period, setPeriod] = useState('');
  const [metricId, setMetricId] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!dataset.periods.length) return;
    if (!dataset.periods.includes(period)) setPeriod(dataset.periods[0]);
  }, [dataset.periods, period]);
  useEffect(() => {
    const p = varValue(periodVar);
    if (p && dataset.periods.includes(p)) setPeriod(p);
  }, [periodVar, dataset.periods]);
  useEffect(() => {
    const v = varValue(metricVar);
    if (!v) return;
    const hit = dataset.catalogue.find((m) => m.metric_id === v || String(m.metric_name).toLowerCase() === v.toLowerCase());
    if (hit) setMetricId(hit.metric_id);
  }, [metricVar, dataset.catalogue]);

  const metrics = useMemo(
    () => dataset.catalogue.filter((m) => valueFor(dataset, m.metric_id, period)),
    [dataset, period],
  );
  useEffect(() => {
    if (metrics.length && !metrics.some((m) => m.metric_id === metricId)) setMetricId(metrics[0].metric_id);
  }, [metrics, metricId]);

  const theme = mode === 'sigma' ? (luminance(style?.backgroundColor) < 0.45 ? 'dark' : 'light') : undefined;
  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
  }, [theme]);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const choose = (id) => {
    setMetricId(id);
    if (mode === 'sigma' && config.selectedMetric) setMetricVar(id);
  };

  if (mode === 'detecting') return <div className="shell loading" aria-busy="true">Loading the number check</div>;
  if (missingSetup.length) return <Setup missing={missingSetup} />;

  const metric = metrics.find((m) => m.metric_id === metricId);
  const statuses = metrics.map((m) => statusFor(dataset, m, period).key);
  const count = (k) => statuses.filter((x) => x === k).length;
  const showQuery = mode === 'demo' || (useSample && mode === 'sigma') || config.showQueryButton;

  const raiseQuery = () => {
    if (!metric) return;
    if (mode === 'sigma' && config.showQueryButton) {
      if (config.selectedMetric) setMetricVar(metric.metric_id);
      triggerQuery();
      setToast(`Query on ${metric.metric_name} sent to the workbook's query form.`);
      return;
    }
    setLocalLog((l) => [...l, {
      metric_id: metric.metric_id, period, action: 'Query raised', by_role: 'You, in this preview',
      at: '2027-01-12 11:00', note: `Routed to the ${metric.owner_role}. The number stays as it is until they answer.`,
    }]);
    setToast(`Query logged and routed to the ${metric.owner_role}. It now shows in the sign-off log.`);
  };

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <Mark />
          <div>
            <h1>Number check</h1>
            <p className="sub">
              Harborline Outfitters
              {useSample && <span className="sample">Sample data as of {sample.asOf}</span>}
            </p>
          </div>
        </div>
        <div className="periods" role="group" aria-label="Period">
          {dataset.periods.map((p) => (
            <button key={p} type="button" aria-pressed={p === period} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
      </header>
      <p className="tally" aria-live="polite">
        <span><StatusIcon k="certified" />{count('certified')} certified</span>
        <span><StatusIcon k="provisional" />{count('provisional')} provisional</span>
        <span><StatusIcon k="blocked" />{count('blocked')} blocked</span>
      </p>

      <div className="body">
        <nav className="rail" aria-label="Metrics">
          <label className="rail-select">
            <span className="vh">Metric</span>
            <select value={metricId} onChange={(e) => choose(e.target.value)}>
              {metrics.map((m) => <option key={m.metric_id} value={m.metric_id}>{m.metric_name}</option>)}
            </select>
          </label>
          <ul>
            {metrics.map((m) => {
              const st = statusFor(dataset, m, period);
              const v = valueFor(dataset, m.metric_id, period);
              return (
                <li key={m.metric_id}>
                  <button type="button" className="rail-item" aria-current={m.metric_id === metricId ? 'true' : undefined}
                    onClick={() => choose(m.metric_id)}>
                    <span className="rail-name">{m.metric_name}</span>
                    <span className="rail-value">{fmtValue(v.value, v.unit || m.unit)}</span>
                    <span className={`rail-status ${st.key}`}><StatusIcon k={st.key} />{st.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {metric ? (
          <Passport ds={dataset} metric={metric} period={period} onQuery={showQuery ? raiseQuery : null} />
        ) : (
          <main className="passport empty"><p>No metrics have a value for {period || 'this period'}.</p></main>
        )}
      </div>
      <div className="toast" role="status" aria-live="polite">{toast && <p>{toast}</p>}</div>
    </div>
  );
}

// ---------------------------------------------------------------- passport
function Passport({ ds, metric, period, onQuery }) {
  const v = valueFor(ds, metric.metric_id, period);
  const st = statusFor(ds, metric, period);
  const checks = checksFor(ds, metric.metric_id, period);
  const trace = lineageFor(ds, metric.metric_id, period);
  const log = signoffsFor(ds, metric.metric_id, period);
  const answers = answersFor(ds, metric.metric_id, period);
  const signed = log.filter((x) => x.period === period && /signed/i.test(x.action)).pop();

  return (
    <main className={`passport st-${st.key}`} key={`${metric.metric_id}-${period}`}>
      <section className="hero" aria-labelledby="metric-name">
        <div className="hero-main">
          <p className="period">{period}</p>
          <h2 id="metric-name">{metric.metric_name}</h2>
          <p className="value">{fmtValue(v.value, v.unit || metric.unit)}</p>
        </div>
        <div className="verdict">
          <Stamp status={st} />
          <p className="reason">{st.reason}</p>
          {signed && (
            <p className="signed">
              {st.key === 'blocked'
                ? `Signed ${byWhom(signed.by_role)} on ${fmtDate(signed.at)}, before today's check failed`
                : `Quarter signed ${byWhom(signed.by_role)}, ${fmtDate(signed.at)}`}
            </p>
          )}
        </div>
        <dl className="meta">
          <div><dt>Owner</dt><dd>{metric.owner_role}</dd></div>
          <div><dt>Approver</dt><dd>{metric.approver_role}</dd></div>
          <div><dt>Definition</dt><dd>{metric.version}{metric.approved_on ? `, approved ${fmtDate(metric.approved_on)}` : ', not yet approved'}</dd></div>
          <div><dt>Source of truth</dt><dd>{metric.source_of_truth}</dd></div>
        </dl>
      </section>

      <section className="block">
        <h3>What it means</h3>
        <p className="definition">{metric.definition}</p>
        {metric.rule && <p className="rule"><strong>The rule that matters.</strong> {metric.rule}</p>}
      </section>

      <section className="block">
        <h3>Where it came from</h3>
        <Trace steps={trace} checks={checks} />
      </section>

      <section className="block">
        <h3>Checks run on this number</h3>
        {checks.length ? (
          <ul className="checks">
            {checks.map((c, i) => (
              <li key={i} className={`check r-${c.result.toLowerCase()}`}>
                <span className="result"><ResultIcon r={c.result} />{c.result === 'Warn' ? 'Needs attention' : c.result === 'Fail' ? 'Failed' : 'Passed'}</span>
                <div className="check-body">
                  <p className="check-name">{c.check_name}</p>
                  <p className="check-what">{c.what_it_checks}</p>
                  {c.note && <p className="check-note">{c.note}</p>}
                </div>
                <div className="check-figs">
                  <p>{fmtCheckValues(c)}</p>
                  {fmtVariance(c) && <p className="muted">{fmtVariance(c)}</p>}
                  {c.run_at && <p className="muted small">{/^replayed/i.test(c.run_at) ? fmtDate(c.run_at) : `Ran ${fmtDate(c.run_at)}`}</p>}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="muted">No checks have run on this number for {period}.</p>}
      </section>

      <section className="block">
        <h3>Who stands behind it</h3>
        {log.length ? (
          <ol className="log">
            {log.map((x, i) => (
              <li key={i}>
                <p><strong>{x.action}</strong> {byWhom(x.by_role)}{x.at ? `, ${fmtDate(x.at)}` : ''}</p>
                {x.note && <p className="muted">{x.note}</p>}
              </li>
            ))}
          </ol>
        ) : <p className="muted">Nobody has signed this number yet.</p>}
      </section>

      <section className="block">
        <h3>AI answers that used this number</h3>
        {answers.length ? (
          <ul className="answers">
            {answers.map((a, i) => (
              <li key={i} className="answer">
                <p className="q">{a.question}</p>
                <p className="a">{a.answer}</p>
                <p className="worked"><span>Worked from</span> {a.query_summary}</p>
                <p className="who">
                  <span className={`chip scope-${scopeKey(a.scope)}`}>{a.scope}</span>
                  Asked {byWhom(a.asked_by_role)}{a.asked_at ? `, ${fmtDate(a.asked_at)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : <p className="muted">No AI answers have used this number in {period}.</p>}
      </section>

      {onQuery && (
        <section className="actions">
          <button type="button" className="primary" onClick={onQuery}>Raise a query on this number</button>
          <p className="muted">Goes to the {metric.owner_role}, the metric's owner, and is logged against this period.</p>
        </section>
      )}
    </main>
  );
}

const scopeKey = (s) => (/outside/i.test(s) ? 'outside' : /prov/i.test(s) ? 'provisional' : 'certified');

const LAYER_LABEL = {
  Bronze: 'Bronze: raw, as landed', Silver: 'Silver: cleaned and matched', Gold: 'Gold: certified metric',
  Snowflake: 'Matched in Snowflake', Certified: 'Certified model', Sigma: 'Sigma',
  Spreadsheet: 'Combined by hand', AI: 'AI summary', Board: 'Sent on',
};
const CERTIFIED_LAYERS = new Set(['Gold', 'Certified']);
const RISKY = new Set(['Spreadsheet', 'AI', 'Board']);

function Trace({ steps, checks }) {
  if (!steps.length) return <p className="muted">No lineage is recorded for this number.</p>;
  const sources = steps.filter((s) => s.layer === 'Source');
  const rest = steps.filter((s) => s.layer !== 'Source');
  const failed = checks.filter((c) => c.result === 'Fail').length;
  const warned = checks.filter((c) => c.result === 'Warn').length;
  const checkLine = !checks.length ? '' : failed
    ? `${failed} of ${checks.length} checks failed`
    : warned ? `${warned} of ${checks.length} checks need attention` : `${checks.length} of ${checks.length} checks passed`;
  return (
    <div className="trace">
      {sources.length > 0 && (
        <ul className="sources" style={{ '--n': sources.length }}>
          {sources.map((s, i) => (
            <li key={i}>
              <p className="sys">{s.system}</p>
              <p className="obj">{s.object_name}</p>
              <p className="what">{s.what_happens}</p>
            </li>
          ))}
        </ul>
      )}
      <ol className="path">
        {rest.map((s, i) => (
          <li key={i} className={`${RISKY.has(s.layer) ? 'risky' : ''} ${CERTIFIED_LAYERS.has(s.layer) ? 'certified-node' : ''}`}>
            <p className="layer">{LAYER_LABEL[s.layer] || s.layer}</p>
            <p className="obj">{s.object_name}</p>
            <p className="what">{s.what_happens}</p>
            {CERTIFIED_LAYERS.has(s.layer) && checkLine && (
              <p className={`node-checks ${failed ? 'blocked' : warned ? 'provisional' : 'certified'}`}>{checkLine}</p>
            )}
            {s.layer === 'Spreadsheet' && <p className="node-checks blocked">No definition and no checks</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

// The Harborline mark: ridgeline over a line with a gap. Reversed for the spruce header.
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

function StatusIcon({ k }) {
  return <span className={`sicon ${k}`}><ResultIcon r={k === 'certified' ? 'Pass' : k === 'blocked' ? 'Fail' : 'Warn'} /></span>;
}

function Stamp({ status }) {
  return (
    <p className={`stamp ${status.key}`}>
      <ResultIcon r={status.key === 'certified' ? 'Pass' : status.key === 'blocked' ? 'Fail' : 'Warn'} />
      {status.label}
    </p>
  );
}

function ResultIcon({ r }) {
  const common = { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: 'false' };
  if (r === 'Pass') return <svg {...common}><path d="M3.2 8.4l3 3 6.6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (r === 'Fail') return <svg {...common}><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  return <svg {...common}><path d="M8 3.5v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="8" cy="12" r="1.1" fill="currentColor" /></svg>;
}

function Setup({ missing }) {
  return (
    <div className="shell setup">
      <h1>Number check needs its data</h1>
      <p>Select each element in the editor panel, then drag its columns into the matching data wells. Wells marked required must be filled. An empty well falls back to a column with the same name.</p>
      <ul>
        {missing.map((m, i) => <li key={i}><strong>{m.source}.</strong> {m.problem}</li>)}
      </ul>
      <p>To see how it works first, turn on Use Harborline sample data in the editor panel.</p>
    </div>
  );
}
