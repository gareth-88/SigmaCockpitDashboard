// Spring cockpit: data wells, normalisation and the metric maths.
// Every number is computed from the gold-layer components the catalogue names, never stored pre-aggregated,
// so the cockpit and Number check reach the same figure from the same definition.
import { dateKey } from '../model.js';

export const COCKPIT_SOURCES = [
  {
    key: 'facts', label: 'Cockpit facts', required: true,
    fields: ['week_start', 'period', 'region', 'channel', 'category', 'net_revenue', 'cogs', 'units_sold',
      'units_received', 'units_on_hand', 'planned_units_next_8w', 'inventory_cost'],
    requiredFields: ['week_start', 'region', 'channel', 'category', 'net_revenue', 'cogs', 'units_sold',
      'units_received', 'units_on_hand', 'planned_units_next_8w', 'inventory_cost'],
  },
  {
    key: 'catalogue', label: 'Metric catalogue', required: true,
    fields: ['metric_id', 'metric_name', 'unit', 'definition', 'rule', 'owner_role', 'approver_role', 'source_of_truth', 'version', 'approved_on'],
    requiredFields: ['metric_id', 'metric_name', 'definition', 'owner_role', 'approver_role', 'version'],
  },
  {
    key: 'lineage', label: 'Lineage', required: false,
    fields: ['metric_id', 'period', 'step', 'layer', 'system', 'object_name', 'what_happens'],
    requiredFields: ['metric_id', 'step', 'system'],
  },
  {
    key: 'checks', label: 'Check results', required: false,
    fields: ['metric_id', 'period', 'check_name', 'what_it_checks', 'result', 'note', 'run_at'],
    requiredFields: ['metric_id', 'check_name', 'result'],
  },
];

export const FACT_LABELS = {
  week_start: 'Week start', period: 'Period', region: 'Region', channel: 'Channel', category: 'Category',
  net_revenue: 'Net revenue', cogs: 'Cost of goods', units_sold: 'Units sold', units_received: 'Units received',
  units_on_hand: 'Units on hand', planned_units_next_8w: 'Planned units, next 8 weeks', inventory_cost: 'Inventory at cost',
};
export const FACT_NUMBERS = new Set(['net_revenue', 'cogs', 'units_sold', 'units_received', 'units_on_hand', 'planned_units_next_8w', 'inventory_cost']);

// Which catalogue entry each cockpit figure reads. The catalogue supplies the names and definitions.
export const KPIS = [
  { id: 'M01', key: 'revenue', fallback: 'Net revenue', unit: '$' },
  { id: 'M05', key: 'margin', fallback: 'Gross margin', unit: '%' },
  { id: 'M06', key: 'sellThrough', fallback: 'Sell-through, season to date', unit: '%' },
  { id: 'M07', key: 'wos', fallback: 'Weeks of supply', unit: 'weeks' },
  { id: 'M10', key: 'invCost', fallback: 'Inventory on hand at cost', unit: '$' },
];
export const CHANNEL_METRIC = { stores: 'M02', online: 'M03', wholesale: 'M04' };
export const channelKey = (c) => (/whole/i.test(c) ? 'wholesale' : /online|dtc|web|e-?comm/i.test(c) ? 'online' : 'stores');
const isRetail = (r) => channelKey(r.channel) !== 'wholesale';

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));
export function toISODate(x) {
  if (typeof x === 'number' && Number.isFinite(x)) return new Date(x).toISOString().slice(0, 10);
  const t = String(x ?? '').trim();
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
const quarterOf = (iso) => `Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1} ${iso.slice(0, 4)}`;

export function normaliseFacts(rows) {
  return rows.map((r) => {
    const week = toISODate(r.week_start);
    return {
      week, period: r.period ? String(r.period) : (week ? quarterOf(week) : ''),
      region: String(r.region ?? ''), channel: String(r.channel ?? ''), category: String(r.category ?? ''),
      net_revenue: num(r.net_revenue), cogs: num(r.cogs), units_sold: num(r.units_sold), units_received: num(r.units_received),
      units_on_hand: num(r.units_on_hand), planned: num(r.planned_units_next_8w), inventory_cost: num(r.inventory_cost),
    };
  }).filter((r) => r.week);
}

export const SEASON = 'Season to date';

export function periodsOf(facts) {
  const first = {};
  for (const r of facts) if (!first[r.period] || r.week < first[r.period]) first[r.period] = r.week;
  return [...Object.keys(first).sort((a, b) => first[a].localeCompare(first[b])), SEASON];
}
export const distinct = (facts, k) => [...new Set(facts.map((r) => r[k]))].filter(Boolean).sort();

export function applyFilters(facts, { region, channel, category }) {
  return facts.filter((r) => (!region || r.region === region) && (!channel || r.channel === channel) && (!category || r.category === category));
}

// The maths, written once. `rows` are already filtered by region, channel and category.
export function compute(rows, allFacts, period) {
  const inPeriod = period === SEASON ? rows : rows.filter((r) => r.period === period);
  const periodWeeks = (period === SEASON ? allFacts : allFacts.filter((r) => r.period === period)).map((r) => r.week);
  const lastWeek = periodWeeks.length ? periodWeeks.reduce((a, b) => (a > b ? a : b)) : '';
  const seasonStart = allFacts.length ? allFacts.reduce((a, r) => (r.week < a ? r.week : a), allFacts[0].week) : '';
  const toEnd = rows.filter((r) => r.week <= lastWeek);
  const atEnd = rows.filter((r) => r.week === lastWeek);
  const sum = (xs, k) => xs.reduce((a, r) => a + r[k], 0);

  const revenue = sum(inPeriod, 'net_revenue');
  const cogs = sum(inPeriod, 'cogs');
  const retailToEnd = toEnd.filter(isRetail);
  const received = sum(retailToEnd, 'units_received');
  const retailAtEnd = atEnd.filter(isRetail);
  const planned = sum(retailAtEnd, 'planned');
  const onHand = sum(retailAtEnd, 'units_on_hand');
  return {
    revenue,
    margin: revenue ? ((revenue - cogs) / revenue) * 100 : null,
    sellThrough: received ? (sum(retailToEnd, 'units_sold') / received) * 100 : null,
    wos: planned ? onHand / (planned / 8) : null,
    invCost: retailAtEnd.length ? sum(retailAtEnd, 'inventory_cost') : null,
    lastWeek, seasonStart, rowCount: inPeriod.length,
  };
}

export function weeklyByChannel(rows, allFacts) {
  const weeks = [...new Set(allFacts.map((r) => r.week))].sort();
  const byWeek = Object.fromEntries(weeks.map((w) => [w, { week: w, stores: 0, online: 0, wholesale: 0 }]));
  for (const r of rows) if (byWeek[r.week]) byWeek[r.week][channelKey(r.channel)] += r.net_revenue;
  return weeks.map((w) => byWeek[w]);
}

export function periodWeeks(allFacts, period) {
  return new Set((period === SEASON ? allFacts : allFacts.filter((r) => r.period === period)).map((r) => r.week));
}

// Latest real check run per metric (replays are excluded), with status in the same three states as Number check.
export function latestChecks(checks, metricId) {
  const cs = checks.filter((c) => c.metric_id === metricId && !/^replayed/i.test(String(c.run_at)));
  if (!cs.length) return [];
  const latest = cs.map((c) => dateKey(c.run_at)).sort().pop();
  return cs.filter((c) => dateKey(c.run_at) === latest);
}

export function statusOf(metric, checks) {
  if (!metric) return { key: 'none', label: 'Not in the catalogue', reason: 'This figure has no catalogue entry, so it cannot be certified.' };
  const cs = latestChecks(checks, metric.metric_id);
  const failed = cs.filter((c) => c.result === 'Fail').length;
  const warned = cs.filter((c) => c.result === 'Warn').length;
  if (failed) return { key: 'blocked', label: 'Blocked', reason: `${failed} of ${cs.length} checks failed. This number cannot leave finance.` };
  if (!String(metric.approved_on ?? '').trim()) return { key: 'provisional', label: 'Provisional', reason: `Definition ${metric.version} is waiting for the ${metric.approver_role} to approve it.` };
  if (warned) return { key: 'provisional', label: 'Provisional', reason: `${warned} of ${cs.length} checks need attention.` };
  if (!cs.length) return { key: 'provisional', label: 'Provisional', reason: 'No checks have run on this metric yet.' };
  return { key: 'certified', label: 'Certified', reason: `All ${cs.length} checks passed. Definition ${metric.version} approved by the ${metric.approver_role}.` };
}

// ---------------------------------------------------------------- formatting
export function fmtMoney(v) {
  if (v == null) return 'None';
  const a = Math.abs(v);
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${Math.round(v / 1e3).toLocaleString('en-US')}K`;
  return `$${Math.round(v).toLocaleString('en-US')}`;
}
export function fmtKpi(v, unit) {
  if (v == null || Number.isNaN(v)) return 'Not defined';
  if (unit === '$') return fmtMoney(v);
  if (unit === '%') return `${v.toFixed(1)}%`;
  if (unit === 'weeks') return `${v.toFixed(1)} weeks`;
  return String(v);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtWeek = (iso, withYear) => (iso ? `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}${withYear ? ` ${iso.slice(0, 4)}` : ''}` : '');
