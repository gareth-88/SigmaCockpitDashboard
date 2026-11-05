// A stand-in for Sigma: it speaks the same postMessage protocol as @sigmacomputing/plugin 1.3.2,
// so the plugin in the frame runs its real Sigma code path.
import { ELEMENTS, columnsPayload, dataPayload } from './tables.js';

export const CONTROLS = { 'ctl-metric': 'Selected metric control', 'ctl-period': 'Period control' };
export const ACTIONS = { 'act-log-query': 'Insert a row into the query log' };

export class SigmaHost {
  constructor({ getState, onInspector, onVariableSet, onAction, onLog }) {
    Object.assign(this, { getState, onInspector, onVariableSet, onAction, onLog });
    this.win = null;
    this.subs = { columns: new Set(), data: new Set() };
    this.listener = (e) => this.receive(e);
    window.addEventListener('message', this.listener);
  }

  destroy() { window.removeEventListener('message', this.listener); }

  attach(win) { this.win = win; this.subs.columns.clear(); this.subs.data.clear(); }

  send(type, result, quiet) {
    if (!this.win) return;
    this.win.postMessage({ type, result }, '*');
    if (!quiet) this.onLog('Sigma to plugin', type, summarise(type, result));
  }

  receive(e) {
    if (!this.win || e.source !== this.win) return;
    const { type, args = [] } = e.data || {};
    if (typeof type !== 'string' || !type.startsWith('wb:')) return;
    const s = this.getState();
    if (type !== 'wb:plugin:focus') this.onLog('Plugin to Sigma', type, summariseArgs(type, args));
    switch (type) {
      case 'wb:plugin:init':
        this.send(type, { config: s.config, id: 'plugin-element-1' });
        this.pushVariables();
        break;
      case 'wb:plugin:config:inspector':
        this.onInspector(args[0] || []);
        this.send(type, undefined, true);
        break;
      case 'wb:plugin:config:update':
        this.send(type, undefined, true);
        break;
      case 'wb:plugin:style:get':
        this.send(type, { backgroundColor: s.background });
        break;
      case 'wb:plugin:element:subscribe:columns':
        this.subs.columns.add(args[0]); this.pushElement(args[0], 'columns');
        break;
      case 'wb:plugin:element:subscribe:data':
        this.subs.data.add(args[0]); this.pushElement(args[0], 'data');
        break;
      case 'wb:plugin:element:unsubscribe:columns':
        this.subs.columns.delete(args[0]);
        break;
      case 'wb:plugin:element:unsubscribe:data':
        this.subs.data.delete(args[0]);
        break;
      case 'wb:plugin:variable:set':
        this.onVariableSet(args[0], args.slice(1));
        break;
      case 'wb:plugin:action-trigger:invoke':
        this.onAction(args[0]);
        break;
      default:
        break;
    }
  }

  // The element bound to a config id, or null.
  elementFor(configId) {
    const s = this.getState();
    const elId = s.config[configId];
    return elId ? s.tables[elId] || null : null;
  }

  pushElement(configId, kind) {
    const s = this.getState();
    const t = this.elementFor(configId);
    if (!t) return;
    if (kind === 'columns') this.send(`wb:plugin:element:${configId}:columns`, columnsPayload(t, s.naming));
    else {
      // Sigma sends data for the columns placed in this element's data wells.
      const selected = Object.entries(s.config)
        .filter(([k]) => k.startsWith(`${configId}_`))
        .flatMap(([, v]) => (Array.isArray(v) ? v : v ? [v] : []));
      this.send(`wb:plugin:element:${configId}:data`, dataPayload(t, selected));
    }
  }

  pushAllElements() {
    this.subs.columns.forEach((id) => this.pushElement(id, 'columns'));
    this.subs.data.forEach((id) => this.pushElement(id, 'data'));
  }

  pushConfig() { this.send('wb:plugin:config:update', { config: this.getState().config }); }

  pushVariables() {
    const s = this.getState();
    const vars = {};
    for (const [configId, ctl] of Object.entries({ selectedMetric: s.config.selectedMetric, selectedPeriod: s.config.selectedPeriod })) {
      if (!ctl) continue;
      vars[configId] = { name: CONTROLS[ctl], defaultValue: { type: 'text', value: s.controls[ctl] ?? '' } };
    }
    this.send('wb:plugin:variable:update', vars);
  }

  pushStyle() { this.send('wb:plugin:style:update', { backgroundColor: this.getState().background }); }
}

function summarise(type, result) {
  if (result == null) return '';
  if (type.endsWith(':columns')) return `${Object.keys(result).length} columns`;
  if (type.endsWith(':data')) {
    const cols = Object.values(result);
    return `${cols.length} columns, ${cols[0] ? cols[0].length : 0} rows`;
  }
  if (type === 'wb:plugin:variable:update') {
    const e = Object.entries(result);
    return e.length ? e.map(([k, v]) => `${k} = "${v.defaultValue.value}"`).join(', ') : 'no controls bound';
  }
  if (type === 'wb:plugin:style:get' || type === 'wb:plugin:style:update') return result.backgroundColor;
  if (type === 'wb:plugin:init' || type === 'wb:plugin:config:update') {
    const c = result.config || {};
    const bound = ELEMENTS.filter((el) => c[el.key]).length;
    return `${bound} of 6 elements bound${c.useSampleData ? ', sample data on' : ''}`;
  }
  return '';
}

function summariseArgs(type, args) {
  if (type === 'wb:plugin:config:inspector') return `${(args[0] || []).length} editor panel options`;
  if (type === 'wb:plugin:variable:set') return `${args[0]} = "${args.slice(1).join(', ')}"`;
  if (type === 'wb:plugin:init') return `SDK ${args[0] || ''}`.trim();
  return args.filter((a) => typeof a === 'string').join(', ');
}
