// Runs the real apps-script/Code.gs in Node against an in-memory Google Sheet.
// Used by tests only (not deployed).
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');

function createBackend(opts) {
  opts = opts || {};
  const props = Object.assign({ PROXY_SECRET: 's', SESSION_KEY: 'k', CRM_PASSWORD: 'pw', REQUIRE_TOKEN: 'true', CRM_SHEET_ID: 'sheet' }, opts.props || {});
  const tabs = {};            // name -> { rows: [[...]], frozen, formats }
  let fixedNow = opts.now ? new Date(opts.now).getTime() : null;

  function Sheet(name) {
    const t = tabs[name];
    const maxC = () => Math.max(1, ...t.rows.map(r => r.length));
    const sheet = {
      getDataRange() { return { getValues: () => t.rows.map(r => { const o = r.slice(); while (o.length < maxC()) o.push(''); return o; }) }; },
      getLastColumn() { return t.rows.length ? maxC() : 0; },
      getMaxRows() { return Math.max(t.rows.length, 1000); },
      getRange(r, c, nr, nc) {
        nr = nr || 1; nc = nc || 1;
        return {
          getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (t.rows[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
          setValues(vals) { vals.forEach((vr, i) => { const rr = (t.rows[r - 1 + i] = t.rows[r - 1 + i] || []); vr.forEach((v, j) => { rr[c - 1 + j] = v; }); }); return this; },
          setValue(v) { const rr = (t.rows[r - 1] = t.rows[r - 1] || []); rr[c - 1] = v; return this; },
          setBackground() { return this; }, setFontColor() { return this; }, setFontWeight() { return this; },
          setNumberFormat() { t.formats = true; return this; }
        };
      },
      appendRow(vals) { t.rows.push(vals.slice()); },
      deleteRow(n) { t.rows.splice(n - 1, 1); },
      setFrozenRows() {},
    };
    return sheet;
  }
  const ss = {
    getSheetByName: n => (tabs[n] ? Sheet(n) : null),
    insertSheet: n => { tabs[n] = { rows: [] }; return Sheet(n); }
  };

  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0 && fixedNow !== null) super(fixedNow); else super(...a); }
    static now() { return fixedNow !== null ? fixedNow : RealDate.now(); }
  }

  const ctx = {
    Date: FakeDate, console, JSON, Math, Object, Array, Set, String, Number, Error, RegExp, parseInt, isNaN, Promise,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) },
    ContentService: { MimeType: { JSON: 1, TEXT: 2 }, createTextOutput: t => ({ t, setMimeType() { return this; } }) },
    Utilities: {
      computeHmacSha256Signature: (m, k) => [...crypto.createHmac('sha256', k).update(m).digest()],
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      formatDate: (d, tz, fmt) => {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
        return parts; // yyyy-MM-dd
      }
    },
    LockService: { getScriptLock: () => ({ waitLock() { ctx.__locks++; }, releaseLock() { ctx.__locks--; } }) },
    __locks: 0,
    Session: { getScriptTimeZone: () => 'America/Chicago' },
    SpreadsheetApp: { openById: () => ss },
    UrlFetchApp: {}, CacheService: {}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);

  function post(o) {
    const body = Object.assign({ secret: 's' }, o);
    const res = ctx.doPost({ postData: { contents: JSON.stringify(body) } });
    return JSON.parse(res.t);
  }
  function login() { return post({ type: 'crmAuth', password: 'pw' }).token; }
  return {
    ctx, props, tabs, post, login,
    setNow(iso) { fixedNow = new RealDate(iso).getTime(); },
    seedLegacy(clients, todos) {
      // Pre-upgrade sheet: 10-col Clients header, 6-col Todos header
      tabs.Clients = { rows: [['id','name','email','phone','address','bday','source','interests','general_notes','created']].concat(clients || []) };
      tabs.Todos = { rows: [['id','clientId','text','due','done','created']].concat(todos || []) };
      tabs.Notes = { rows: [['id','clientId','text','date']] };
    },
    rows(name) { return tabs[name].rows; }
  };
}
module.exports = { createBackend };
