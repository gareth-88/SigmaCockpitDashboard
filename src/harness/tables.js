// The six sample tables as Sigma workbook elements. Rows are plain objects keyed by field;
// what the plugin receives is Sigma-shaped: columns keyed by id, data as column arrays.
import sample from '../sampleData.json';

export const ELEMENTS = [
  { key: 'catalogue', id: 'el-catalogue', name: 'Metric catalogue', table: 'METRIC_CATALOGUE', source: 'metric_catalogue' },
  { key: 'values', id: 'el-values', name: 'Metric values', table: 'METRIC_VALUES', source: 'metric_values' },
  { key: 'checks', id: 'el-checks', name: 'Check results', table: 'METRIC_CHECKS', source: 'metric_checks' },
  { key: 'lineage', id: 'el-lineage', name: 'Lineage', table: 'METRIC_LINEAGE', source: 'metric_lineage' },
  { key: 'signoffs', id: 'el-signoffs', name: 'Sign-off log', table: 'METRIC_SIGNOFFS', source: 'metric_signoffs' },
  { key: 'answers', id: 'el-answers', name: 'AI answer log', table: 'AI_ANSWER_LOG', source: 'ai_answer_log' },
];

export const NUMERIC = new Set(['value', 'expected', 'actual', 'variance_pct', 'tolerance_pct', 'step']);

export function initialTables() {
  const out = {};
  for (const el of ELEMENTS) {
    const rows = sample[el.source].map((r) => ({ ...r }));
    out[el.id] = { ...el, fields: Object.keys(rows[0]), rows };
  }
  return out;
}

const titleCase = (f) => f.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
export const colName = (field, naming) => (naming === 'warehouse' ? field.toUpperCase() : titleCase(field));
export const colId = (elId, field) => `${elId}/${field}`;

// Sigma sends every column's metadata, and data for the selected columns only.
export function columnsPayload(t, naming) {
  const cols = {};
  for (const f of t.fields) {
    const id = colId(t.id, f);
    cols[id] = { id, name: colName(f, naming), columnType: NUMERIC.has(f) ? 'number' : 'text' };
  }
  return cols;
}

export function dataPayload(t, selected) {
  const data = {};
  for (const f of t.fields) {
    const id = colId(t.id, f);
    if (selected && !selected.includes(id)) continue;
    data[id] = t.rows.map((r) => (r[f] === '' || r[f] === undefined ? null : r[f]));
  }
  return data;
}

export function parseCell(field, raw) {
  if (!NUMERIC.has(field)) return raw;
  const t = String(raw).trim();
  if (t === '') return '';
  const n = Number(t);
  return Number.isFinite(n) ? n : raw;
}
