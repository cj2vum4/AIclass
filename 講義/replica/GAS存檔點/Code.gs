/**
 * 年度計畫自動化（MISA 課程存檔點範本）
 * 需要的分頁：「任務清單」（第一天產出），「通訊錄」會自動建立。
 * 指令碼屬性（專案設定 → 指令碼屬性）：LINE_TOKEN、MY_USER_ID —— 金鑰只放這裡，不寫進程式碼。
 */

const TASK_SHEET = '任務清單';
const CONTACT_SHEET = '通訊錄';
const DONE = '已完成';

// ---------- 共用：用欄位名稱讀寫，不怕欄位順序不同 ----------
function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('找不到分頁「' + name + '」');
  return sh;
}

function header_(sh, extraCols) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  (extraCols || []).forEach(function (c) {
    if (head.indexOf(c) === -1) {
      head.push(c);
      sh.getRange(1, head.length).setValue(c).setFontWeight('bold');
    }
  });
  const idx = {};
  head.forEach(function (h, i) { if (h) idx[h.trim()] = i; });
  return idx;
}

function readTasks_() {
  const sh = sheet_(TASK_SHEET);
  const idx = header_(sh, ['日曆事件ID', '最後提醒']);
  const n = sh.getLastRow() - 1;
  if (n < 1) return { sh: sh, idx: idx, rows: [] };
  const values = sh.getRange(2, 1, n, sh.getLastColumn()).getValues();
  const rows = values.map(function (v, i) {
    return {
      row: i + 2,
      id: v[idx['任務編號']], dept: v[idx['部門']], name: v[idx['任務名稱']],
      owner: String(v[idx['負責人']] || '').trim(),
      start: v[idx['開始日']], end: v[idx['截止日']],
      status: v[idx['狀態']], pct: v[idx['完成度']], eventId: v[idx['日曆事件ID']]
    };
  }).filter(function (t) { return t.name; });
  return { sh: sh, idx: idx, rows: rows };
}

function asDate_(v) {
  if (v instanceof Date) return v;
  if (!v) return null;
  const d = new Date(String(v).replace(/-/g, '/'));
  return isNaN(d) ? null : d;
}

// ---------- 任務六：同步到 Google 日曆 ----------
function calendar_() {
  const name = SpreadsheetApp.getActive().getName();
  const found = CalendarApp.getCalendarsByName(name);
  return found.length ? found[0] : CalendarApp.createCalendar(name, { color: CalendarApp.Color.TEAL });
}

function syncToCalendar() {
  const t = readTasks_();
  const cal = calendar_();
  let created = 0, updated = 0;
  t.rows.forEach(function (task) {
    if (syncOne_(cal, t, task)) created++; else updated++;
  });
  Logger.log('日曆「' + cal.getName() + '」：新增 ' + created + ' 筆、更新 ' + updated + ' 筆');
}

function syncOne_(cal, t, task) {
  const start = asDate_(task.start), end = asDate_(task.end) || start;
  if (!start) return false;
  const endExclusive = new Date(end.getTime() + 24 * 3600 * 1000);
  const title = (task.status === DONE ? '✅ ' : '') + '[' + task.dept + '] ' + task.name + '（' + task.owner + '）';
  let ev = task.eventId ? cal.getEventById(task.eventId) : null;
  if (ev) {
    ev.setTitle(title);
    ev.setAllDayDates(start, endExclusive);
    return false;
  }
  ev = cal.createAllDayEvent(title, start, endExclusive, { description: '任務編號：' + task.id });
  t.sh.getRange(task.row, t.idx['日曆事件ID'] + 1).setValue(ev.getId());
  return true;
}

// ---------- 任務八：觸發條件 ----------
function setupTriggers() {
  const keep = ['syncToCalendar', 'onTaskEdit', 'dailyReminder'];
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (keep.indexOf(tr.getHandlerFunction()) > -1) ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('syncToCalendar').timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger('onTaskEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  ScriptApp.newTrigger('dailyReminder').timeBased().everyDays(1).atHour(8).create();
  Logger.log('已建立 3 個觸發：每天 7 點同步日曆、編輯即更新、每天 8 點 LINE 提醒');
}

function onTaskEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== TASK_SHEET || e.range.getRow() < 2) return;
  const t = readTasks_();
  if (e.range.getColumn() !== t.idx['狀態'] + 1) return;
  const task = t.rows.filter(function (r) { return r.row === e.range.getRow(); })[0];
  if (!task) return;
  if (task.status === DONE) sh.getRange(task.row, t.idx['完成度'] + 1).setValue(1);
  syncOne_(calendar_(), t, task);
}

// ---------- 任務九：操作入口（網頁應用程式） ----------
function doGet() {
  const me = Session.getEffectiveUser().getEmail();
  if (Session.getActiveUser().getEmail() !== me) {
    return HtmlService.createHtmlOutput('<h2 style="font-family:sans-serif">此頁面僅限擁有者使用</h2>');
  }
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle(SpreadsheetApp.getActive().getName())
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getOwners() {
  const set = {};
  readTasks_().rows.forEach(function (r) { if (r.owner) set[r.owner] = 1; });
  return Object.keys(set);
}

function getTasksFor(owner) {
  return readTasks_().rows.filter(function (r) { return r.owner === owner; }).map(function (r) {
    const end = asDate_(r.end);
    return {
      row: r.row, id: r.id, dept: r.dept, name: r.name, status: r.status,
      pct: typeof r.pct === 'number' ? Math.round(r.pct * 100) : parseInt(r.pct, 10) || 0,
      end: end ? Utilities.formatDate(end, Session.getScriptTimeZone(), 'yyyy/MM/dd') : ''
    };
  });
}

function saveTask(row, status, pct) {
  const t = readTasks_();
  if (status === DONE) pct = 100;
  t.sh.getRange(row, t.idx['狀態'] + 1).setValue(status);
  t.sh.getRange(row, t.idx['完成度'] + 1).setValue(pct / 100);
  const fresh = readTasks_();
  const task = fresh.rows.filter(function (r) { return r.row === row; })[0];
  syncOne_(calendar_(), fresh, task);
  return true;
}

// ---------- 任務十二～十四：LINE ----------
function prop_(k) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw new Error('請先在「專案設定 → 指令碼屬性」新增 ' + k);
  return v;
}

function line_(path, payload) {
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/' + path, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + prop_('LINE_TOKEN') },
    payload: JSON.stringify(payload)
  });
  if (res.getResponseCode() !== 200) throw new Error('LINE 回應 ' + res.getResponseCode() + '：' + res.getContentText());
}

function push_(to, text) { line_('push', { to: to, messages: [{ type: 'text', text: text }] }); }

function sendTestMessage() {
  push_(prop_('MY_USER_ID'), '測試成功：年度計畫提醒系統已連線 ✅');
}

function contacts_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(CONTACT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONTACT_SHEET);
    sh.getRange(1, 1, 1, 3).setValues([['負責人', 'LINE userId', '綁定時間']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  (body.events || []).forEach(function (ev) {
    if (ev.type !== 'message' || ev.message.type !== 'text') return;
    const m = ev.message.text.trim().match(/^綁定\s*(.+)$/);
    let reply;
    if (m) {
      const name = m[1].trim();
      const sh = contacts_();
      const data = sh.getDataRange().getValues();
      let row = 0;
      for (let i = 1; i < data.length; i++) if (data[i][0] === name) row = i + 1;
      if (!row) row = sh.getLastRow() + 1;
      sh.getRange(row, 1, 1, 3).setValues([[name, ev.source.userId, new Date()]]);
      reply = '✅ 已綁定：' + name + '\n之後的任務提醒會傳到這裡。';
    } else {
      reply = '請輸入：綁定 你的名字\n例如：綁定 陳經理';
    }
    line_('reply', { replyToken: ev.replyToken, messages: [{ type: 'text', text: reply }] });
  });
  return ContentService.createTextOutput('ok');
}

function dailyReminder() {
  const t = readTasks_();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const soon = {};
  t.rows.forEach(function (r) {
    const end = asDate_(r.end);
    if (!end || r.status === DONE) return;
    const days = Math.round((end - today) / 86400000);
    if (days > 7) return;
    (soon[r.owner] = soon[r.owner] || []).push({ r: r, days: days, end: end });
  });
  const book = {};
  contacts_().getDataRange().getValues().slice(1).forEach(function (c) { if (c[1]) book[c[0]] = c[1]; });
  const missing = [];
  const now = new Date();
  Object.keys(soon).forEach(function (owner) {
    const list = soon[owner].sort(function (a, b) { return a.days - b.days; });
    if (!book[owner]) { missing.push(owner); return; }
    const lines = list.map(function (x, i) {
      const when = x.days < 0 ? '已逾期 ' + (-x.days) + ' 天' : x.days === 0 ? '今天截止' : '剩 ' + x.days + ' 天';
      return (i + 1) + '. ' + x.r.name + '（' + Utilities.formatDate(x.end, Session.getScriptTimeZone(), 'M/d') + '，' + when + '）';
    });
    push_(book[owner], '📌 ' + owner + '您好，您有 ' + list.length + ' 項任務即將到期：\n' + lines.join('\n') + '\n\n完成後請到操作入口打勾。');
    list.forEach(function (x) { t.sh.getRange(x.r.row, t.idx['最後提醒'] + 1).setValue(now); });
  });
  if (missing.length) {
    push_(prop_('MY_USER_ID'), '⚠️ 以下負責人還沒綁定 LINE，未收到提醒：' + missing.join('、'));
  }
}
