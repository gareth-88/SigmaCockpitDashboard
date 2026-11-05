// Column mapping, status rules and formatting for the Number check plugin.
// The plugin reads six workbook elements. Columns are matched by name, so
// "METRIC_ID", "Metric Id" and "metric id" all map to metric_id.

export const SOURCES = [
  {
    key: 'catalogue', label: 'Metric catalogue', required: true,
    fields: ['metric_id', 'metric_name', 'unit', 'definition', 'rule', 'owner_role', 'approver_role',
      'source_of_truth', 'version', 'approved_on', 'ai_allowed'],
    requiredFields: ['metric_id', 'metric_name', 'definition', 'owner_role', 'approver_role', 'version'],
  },
  {
    key: 'values', label: 'Metric values', required: true,
    fields: ['metric_id', 'period', 'value', 'unit'],
    requiredFields: ['metric_id', 'period', 'value'],
  },
  {
    key: 'checks', label: 'Check results', required: true,
    fields: ['metric_id', 'period', 'check_name', 'what_it_checks', 'expected', 'actual', 'unit',
      'variance_pct', 'tolerance_pct', 'result', 'note', 'run_at'],
    requiredFields: ['metric_id', 'period', 'check_name', 'result'],
  },
  {
    key: 'lineage', label: 'Lineage', required: false,
    fields: ['metric_id', 'period', 'step', 'layer', 'system', 'object_name', 'what_happens'],
    requiredFields: ['metric_id', 'step', 'system'],
  },
  {
    key: 'signoffs', label: 'Sign-off log', required: false,
    fields: ['metric_id', 'period', 'action', 'by_role', 'at', 'note'],
    requiredFields: ['metric_id', 'action', 'by_role'],
  },
  {
    key: 'answers', label: 'AI answer log', required: false,
    fields: ['metric_id', 'period', 'asked_at', 'asked_by_role', 'question', 'answer', 'query_summary', 'scope'],
    requiredFields: ['metric_id', 'question', 'answer'],
  },
];

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Labels for the data wells in Sigma's editor panel.
export const FIELD_LABELS = {
  metric_id: 'Metric ID', metric_name: 'Metric name', unit: 'Unit', definition: 'Definition', rule: 'Rule',
  owner_role: 'Owner', approver_role: 'Approver', source_of_truth: 'Source of truth', version: 'Definition version',
  approved_on: 'Approved on', ai_allowed: 'AI allowed', period: 'Period', value: 'Value', check_name: 'Check name',
  what_it_checks: 'What it checks', expected: 'Expected', actual: 'Actual', variance_pct: 'Variance %',
  tolerance_pct: 'Tolerance %', result: 'Result', note: 'Note', run_at: 'Run at', step: 'Step', layer: 'Layer',
  system: 'System', object_name: 'Object', what_happens: 'What happens', action: 'Action', by_role: 'By (role)',
  at: 'At', asked_at: 'Asked at', asked_by_role: 'Asked by (role)', question: 'Question', answer: 'Answer',
  query_summary: 'Worked from', scope: 'Scope',
};
export const NUMBER_FIELDS = new Set(['value', 'expected', 'actual', 'variance_pct', 'tolerance_pct', 'step']);
export const wellKey = (source, field) => `${source.key}_${field}`;

const firstId = (v) => (Array.isArray(v) ? v[0] : v) || '';

// Turn Sigma's column-oriented element data into row objects keyed by field name.
// Each field comes from its data well; if a well is empty, a column with a matching name is used when Sigma sent it.
export function rowsFromElement(source, columns, data, config = {}) {
  const byName = {};
  for (const col of Object.values(columns || {})) byName[norm(col.name)] = col.id;
  const mapped = {};
  const missing = [];
  for (const f of source.fields) {
    const well = firstId(config[wellKey(source, f)]);
    const id = well && Array.isArray(data?.[well]) ? well : byName[norm(f)];
    if (id && Array.isArray(data?.[id])) mapped[f] = data[id];
    else if (source.requiredFields.includes(f)) missing.push(FIELD_LABELS[f] || f);
  }
  const lengths = Object.values(mapped).map((a) => a.length);
  const n = lengths.length ? Math.max(...lengths) : 0;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const r = {};
    for (const f of source.fields) r[f] = mapped[f] ? mapped[f][i] ?? '' : '';
    rows.push(r);
  }
  return { rows, missing };
}

const s = (v) => (v === null || v === undefined ? '' : String(v));
const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

// Normalise raw rows (from Sigma or the sample file) into one dataset.
export function buildDataset(raw) {
  const catalogue = (raw.catalogue || []).map((r) => ({ ...r, metric_id: s(r.metric_id) }))
    .filter((r) => r.metric_id);
  const values = (raw.values || []).map((r) => ({ ...r, metric_id: s(r.metric_id), period: s(r.period), value: num(r.value) }));
  const checks = (raw.checks || []).map((r) => ({
    ...r, metric_id: s(r.metric_id), period: s(r.period), expected: num(r.expected), actual: num(r.actual),
    variance_pct: num(r.variance_pct), tolerance_pct: num(r.tolerance_pct), result: normResult(r.result),
  }));
  const lineage = (raw.lineage || []).map((r) => ({ ...r, metric_id: s(r.metric_id), period: s(r.period), step: num(r.step) ?? 0 }));
  const signoffs = (raw.signoffs || []).map((r) => ({ ...r, metric_id: s(r.metric_id), period: s(r.period) }));
  const answers = (raw.answers || []).map((r) => ({ ...r, metric_id: s(r.metric_id), period: s(r.period) }));

  const periods = [];
  for (const v of values) if (v.period && !periods.includes(v.period)) periods.push(v.period);
  return { catalogue, values, checks, lineage, signoffs, answers, periods };
}

function normResult(r) {
  const x = norm(r);
  if (x.startsWith('pass')) return 'Pass';
  if (x.startsWith('warn') || x.startsWith('review')) return 'Warn';
  if (x.startsWith('fail') || x.startsWith('block')) return 'Fail';
  return r ? String(r) : 'Warn';
}

export function valueFor(ds, metricId, period) {
  return ds.values.find((v) => v.metric_id === metricId && v.period === period) || null;
}

export function checksFor(ds, metricId, period) {
  return ds.checks.filter((c) => c.metric_id === metricId && c.period === period);
}

export function lineageFor(ds, metricId, period) {
  const specific = ds.lineage.filter((l) => l.metric_id === metricId && l.period === period);
  const rows = specific.length ? specific : ds.lineage.filter((l) => l.metric_id === metricId && !l.period);
  return [...rows].sort((a, b) => a.step - b.step);
}

export function signoffsFor(ds, metricId, period) {
  return ds.signoffs
    .filter((x) => x.metric_id === metricId && (!x.period || x.period === period))
    .sort((a, b) => dateKey(a.at).localeCompare(dateKey(b.at)));
}

export function answersFor(ds, metricId, period) {
  return ds.answers
    .filter((a) => a.metric_id === metricId && (!a.period || a.period === period))
    .sort((a, b) => dateKey(b.asked_at).localeCompare(dateKey(a.asked_at)));
}

// The three states a number can be in, and the reason shown beside it.
export function statusFor(ds, metric, period) {
  const v = valueFor(ds, metric.metric_id, period);
  if (!v) return { key: 'none', label: 'No value', reason: 'There is no value for this period.' };
  const cs = checksFor(ds, metric.metric_id, period);
  const failed = cs.filter((c) => c.result === 'Fail');
  const warned = cs.filter((c) => c.result === 'Warn');
  const approved = !!s(metric.approved_on);
  if (failed.length) {
    return {
      key: 'blocked', label: 'Blocked',
      reason: `${failed.length} of ${cs.length} checks failed. This number cannot leave finance.`,
    };
  }
  if (!approved) {
    return {
      key: 'provisional', label: 'Provisional',
      reason: `Definition ${s(metric.version)} is waiting for the ${s(metric.approver_role)} to approve it. Not for distribution.`,
    };
  }
  if (warned.length) {
    return {
      key: 'provisional', label: 'Provisional',
      reason: `${warned.length} of ${cs.length} checks need attention. Use with the note below.`,
    };
  }
  if (!cs.length) {
    return { key: 'provisional', label: 'Provisional', reason: 'No checks have run for this period yet.' };
  }
  return {
    key: 'certified', label: 'Certified',
    reason: `All ${cs.length} checks passed. Definition ${s(metric.version)} approved by the ${s(metric.approver_role)}.`,
  };
}

// ---------------------------------------------------------------- formatting
export function fmtValue(v, unit, { precise = false } = {}) {
  if (v === null || v === undefined) return 'None';
  const u = s(unit);
  if (u === '$M') return `$${v.toFixed(precise ? 2 : 1)}M`;
  if (u === '%') return `${v.toFixed(1)}%`;
  if (u === 'weeks') return `${v.toFixed(1)} weeks`;
  if (u === 'customers') return Math.round(v).toLocaleString('en-US');
  if (u === 'units' || u === 'orders') return `${Math.round(v).toLocaleString('en-US')} ${u}`;
  if (u === 'stores') return `${v} stores`;
  return `${v.toLocaleString('en-US')}${u ? ' ' + u : ''}`;
}

export function fmtCheckValues(c) {
  if (c.unit === 'match') return c.actual === c.expected ? 'Matches' : 'Does not match';
  if (c.unit === 'stores') return `${c.actual} of ${c.expected} stores`;
  if (c.expected === 0) return c.actual === 0 ? 'None found' : `${fmtValue(c.actual, c.unit, { precise: true })} found`;
  return `${fmtValue(c.actual, c.unit, { precise: true })} against ${fmtValue(c.expected, c.unit, { precise: true })}`;
}

export function fmtVariance(c) {
  if (c.variance_pct === null) return '';
  const v = c.variance_pct;
  const sign = v > 0 ? '+' : v < 0 ? '\u2212' : '';
  const mag = Math.abs(v) >= 1 ? Math.abs(v).toFixed(1) : Math.abs(v).toFixed(2);
  const tol = c.tolerance_pct === null ? '' : c.tolerance_pct === 0 ? ', none allowed' : `, ${c.tolerance_pct}% allowed`;
  return `${sign}${mag}% difference${tol}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(x) {
  if (typeof x === 'number' && Number.isFinite(x)) {
    const d = new Date(x);
    const hasTime = d.getUTCHours() || d.getUTCMinutes();
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}${hasTime ? `, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : ''}`;
  }
  const t = s(x).trim();
  if (!t) return '';
  if (/^replayed/i.test(t)) return t.replace(/(\d{4})-(\d{2})-(\d{2})/, (_, y, m, d) => `${+d} ${MONTHS[+m - 1]} ${y}`);
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}${m[4] && (m[4] !== '00' || m[5] !== '00') ? `, ${m[4]}:${m[5]}` : ''}`;
  m = t.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${MONTHS[+m[2] - 1]} ${m[1]}`;
  return t;
}

// Sort key for dates that may arrive as text or as epoch milliseconds.
export const dateKey = (x) => (typeof x === 'number' ? new Date(x).toISOString() : s(x));

// "by the Controller", but "by you" and "by Jane Smith" read naturally too.
export function byWhom(role) {
  const r = s(role).trim();
  if (!r) return '';
  if (/^you\b/i.test(r)) return `by ${r.charAt(0).toLowerCase()}${r.slice(1)}`;
  if (/^(the|a|an)\s/i.test(r)) return `by ${r}`;
  return `by the ${r}`;
}
