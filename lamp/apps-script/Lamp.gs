/**
 * 大安寺植福點燈系統 — Google Apps Script 外殼
 * ------------------------------------------------------------
 * 這個專案要放「兩個檔案」：
 *   1. Core.gs  ← 貼上 lamp/core.js 全部內容（核心邏輯，前台展示模式也用同一份）
 *   2. Lamp.gs  ← 貼上本檔
 * 步驟詳見 lamp/README.md
 */

const INITIAL_PASSWORD = 'daan1234';      // 後台初始密碼，setup 後請到後台「設定」修改
const TZ = 'Asia/Taipei';
const SH = { ORDER: '點燈單', ITEM: '點燈明細', SET: '系統設定' };
const PROOF_FOLDER = '大安寺點燈轉帳截圖';

/* ============ 初始化（第一次執行一次） ============ */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  makeSheet_(ss, SH.ORDER, LampCore.ORDER_COLS);
  makeSheet_(ss, SH.ITEM, LampCore.ITEM_COLS);
  let set = ss.getSheetByName(SH.SET);
  if (!set) {
    set = ss.insertSheet(SH.SET);
    const kv = LampCore.settingsToKv(LampCore.DEFAULT_SETTINGS);
    const rows = [['設定項目', '內容']].concat(Object.keys(kv).map(k => [k, kv[k]]));
    set.getRange(1, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
    set.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#efe3f3');
    set.setColumnWidth(2, 600);
  }
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('ADMIN_PASSWORD')) p.setProperty('ADMIN_PASSWORD', INITIAL_PASSWORD);
  folder_();
  ['工作表1', 'Sheet1'].forEach(n => { const s = ss.getSheetByName(n); if (s && ss.getSheets().length > 1 && s.getLastRow() === 0) ss.deleteSheet(s); });
  Logger.log('完成！後台初始密碼：' + p.getProperty('ADMIN_PASSWORD'));
}

function makeSheet_(ss, name, cols) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols.map(c => c[1])]).setFontWeight('bold').setBackground('#efe3f3');
    sh.setFrozenRows(1);
  }
}

/* ============ 入口 ============ */
function doGet() { return ContentService.createTextOutput('大安寺點燈系統 API 運作中'); }

function doPost(e) {
  let res;
  const lock = LockService.getScriptLock();
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    const readOnly = ['init', 'query', 'lookupPrev', 'adminData', 'getFile', 'login'].indexOf(req.action) >= 0;
    if (!readOnly) lock.waitLock(25000);
    const db = load_();
    res = LampCore.handle(req, db, ENV);
    if (!readOnly) save_(db);
  } catch (err) {
    res = { ok: false, msg: '系統忙碌中，請稍後再試（' + err.message + '）' };
  } finally {
    try { lock.releaseLock(); } catch (e) { }
  }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

/* ============ 讀寫試算表 ============ */
function sheet_(n) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }

function readTable_(name, cols) {
  const sh = sheet_(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getDisplayValues()
    .filter(r => r[0] !== '')
    .map(r => { const o = {}; cols.forEach((c, i) => o[c[0]] = String(r[i] == null ? '' : r[i])); return o; });
}

function writeTable_(name, cols, rows) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, cols.length).clearContent();
  if (!rows.length) return;
  const vals = rows.map(o => cols.map(c => safe_(o[c[0]])));
  sh.getRange(2, 1, vals.length, cols.length).setNumberFormat('@').setValues(vals);
}

function safe_(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+@]/.test(s)) s = "'" + s;
  return s.slice(0, 5000);
}

function load_() {
  const kv = {};
  const set = sheet_(SH.SET);
  if (set && set.getLastRow() > 1) set.getRange(2, 1, set.getLastRow() - 1, 2).getDisplayValues().forEach(r => { if (r[0]) kv[r[0]] = r[1]; });
  return {
    settings: LampCore.parseSettings(kv),
    orders: readTable_(SH.ORDER, LampCore.ORDER_COLS),
    items: readTable_(SH.ITEM, LampCore.ITEM_COLS),
    dirty: {}
  };
}

function save_(db) {
  if (db.dirty.orders) writeTable_(SH.ORDER, LampCore.ORDER_COLS, db.orders);
  if (db.dirty.items) writeTable_(SH.ITEM, LampCore.ITEM_COLS, db.items);
  if (db.dirty.settings) {
    const kv = LampCore.settingsToKv(db.settings);
    const rows = Object.keys(kv).map(k => [k, kv[k]]);
    const sh = sheet_(SH.SET);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
    sh.getRange(2, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
  }
}

/* ============ 環境介面（給 Core 用） ============ */
const ENV = {
  now: () => Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd HH:mm'),
  today: () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'),
  checkToken: t => !!t && CacheService.getScriptCache().get('tk_' + t) === '1',
  login: pw => {
    const c = CacheService.getScriptCache();
    const fails = Number(c.get('login_fail') || 0);
    if (fails >= 10) { ENV._msg = '密碼錯誤次數過多，請 10 分鐘後再試'; return null; }
    if (String(pw) !== PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD')) {
      c.put('login_fail', String(fails + 1), 600); return null;
    }
    const t = Utilities.getUuid(); c.put('tk_' + t, '1', 8 * 3600); return t;
  },
  loginMsg: () => ENV._msg || '',
  logout: t => CacheService.getScriptCache().remove('tk_' + t),
  changePassword: (oldPw, newPw) => {
    const p = PropertiesService.getScriptProperties();
    if (String(oldPw) !== p.getProperty('ADMIN_PASSWORD')) return { ok: false, msg: '舊密碼不正確' };
    if (!newPw || String(newPw).length < 6) return { ok: false, msg: '新密碼至少 6 個字' };
    p.setProperty('ADMIN_PASSWORD', String(newPw)); return { ok: true };
  },
  saveFile: (dataUrl, name) => {
    const m = String(dataUrl).match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return '';
    return folder_().createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name + '.jpg')).getId();
  },
  getFile: id => {
    if (!id) return { ok: false };
    const b = DriveApp.getFileById(id).getBlob();
    return { ok: true, dataUrl: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) };
  }
};

function folder_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('PROOF_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
  const f = DriveApp.createFolder(PROOF_FOLDER);
  p.setProperty('PROOF_FOLDER_ID', f.getId());
  return f;
}
