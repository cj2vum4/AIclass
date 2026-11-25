/**
 * 存檔點A｜任務六、七｜日曆同步
 * 什麼時候用：任務六或任務七落後時，由助教判斷後使用；該組標記「未獨立完成」。
 * 包含：完成任務七後的程式：syncToCalendar
 * 不含：觸發、操作入口、LINE
 * 需要的分頁：「任務清單」（欄位名稱與講義一致）；執行時會自動補上「日曆事件ID」「最後提醒」欄。
 * 換上前：先到「觸發條件」刪除舊觸發，換上後再執行 setupTriggers（若本段有）；已部署的網頁要用「管理部署作業 → 建立新版本」更新。
 * 金鑰只放「專案設定 → 指令碼屬性」，不寫進程式碼。
 * 來源：由 GAS存檔點/Code.gs（2026-09-30 舊專案實際運作的完整版）裁切；分段後未逐段實機執行，使用後請照講義驗收。
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

