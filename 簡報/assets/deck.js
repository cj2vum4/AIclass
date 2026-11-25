/* MISA 課程簡報引擎 v2（2026-11-25）
 * →／空白／PageDown：下一頁　←／PageUp：上一頁　Home／End：第一／最後頁　數字＋Enter：跳頁
 * F：全螢幕　O：總覽　B：黑畫面　N：備忘稿　P：講者視窗
 * Z：放大紅框（截圖頁，也可雙擊截圖）　S：聚光開關　L：雷射筆　R：重播本頁動畫　H 或 ?：快捷鍵說明
 * 休息頁：點倒數環開始／暫停。活的概念頁會自動播放；翻牌卡點一下揭曉。
 */
(function () {
  const stage = document.getElementById('stage');
  const slides = [...stage.querySelectorAll('.slide')];
  let cur = 0, typed = '', timers = [];
  const meta = (() => { try { return JSON.parse(document.getElementById('deckmeta').textContent); } catch (e) { return {}; } })();

  /* ---------- 版面縮放 ---------- */
  function fit() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transformOrigin = '50% 50%';
    stage.style.transform = `translate(-50%,-50%) scale(${s})`;
  }

  /* ---------- 一次性準備 ---------- */
  const CN = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  function cnum(s) {
    if (/^\d+$/.test(s)) return +s;
    if (s.length === 1) return CN[s] ?? null;
    if (s[0] === '十') return 10 + (CN[s[1]] || 0);
    if (s[1] === '十') return CN[s[0]] * 10 + (CN[s[2]] || 0);
    return null;
  }
  const STAGGER = ['.grid>*', 'ul>li', 'ol>li', 'table.cmp tr', '.timeline>.tl', '.flow>*', '.disc>*', '.rule', '.phones>*', '.bingo>*', '.ex>*', '.chk>span', '.slide>p:not(.sub):not(.src):not(.dmin)', '.excerpt'];
  function prepare() {
    slides.forEach((s) => {
      // 交錯進場序號（活的概念頁自己編排，略過）
      STAGGER.forEach((sel) => {
        const groups = new Map();
        s.querySelectorAll(sel).forEach((el) => {
          if (el.closest('.live,.notes,.pic,.frame')) return;
          const p = el.parentElement; const k = groups.get(p) || 0; groups.set(p, k + 1);
          if (!el.style.getPropertyValue('--i')) el.style.setProperty('--i', Math.min(k + (sel.startsWith('.slide>p') ? 3 : 0), 14));
        });
      });
      // 任務卡大數字
      if (s.classList.contains('taskintro')) {
        const m = (s.querySelector('.no') || {}).textContent?.match(/任務(.+)/);
        const n = m && cnum(m[1].trim());
        if (n !== null && n !== undefined) s.dataset.n = String(n).padStart(2, '0');
      }
      // 有序清單的起始編號
      s.querySelectorAll('ol[start]').forEach((ol) => { ol.style.counterReset = `p ${(+ol.getAttribute('start') || 1) - 1}`; });
      // 逐步頁的進度條
      const no = s.querySelector('.stepno');
      if (no) {
        const m = no.textContent.match(/步驟\s*(\d+)\s*[／/]\s*(\d+)/);
        if (m) {
          const k = +m[1], N = Math.min(+m[2], 30), bar = document.createElement('div');
          bar.className = 'stepbar';
          for (let i = 1; i <= N; i++) { const b = document.createElement('i'); if (i < k) b.className = 'done'; if (i === k) b.className = 'cur'; bar.appendChild(b); }
          no.after(bar);
        }
      }
      // 封面與章節：光暈與節點網
      if ((s.classList.contains('cover') || s.classList.contains('section')) && !s.querySelector('.fx')) {
        const fx = document.createElement('div'); fx.className = 'fx';
        fx.innerHTML = orbs() + net(s.classList.contains('cover') ? 7 : 5);
        s.prepend(fx);
      }
      // 步驟清單太長時自動縮小字級（最多到 82%），避免超出投影片
      if (s.classList.contains('procslide')) {
        const prev = s.style.cssText; s.style.cssText += ';display:flex;visibility:hidden';
        let f = 1;
        const over = () => [...s.querySelectorAll('li')].some((li) => li.getBoundingClientRect().bottom - s.getBoundingClientRect().top > 1040);
        while (over() && f > 0.82) { f -= 0.03; s.style.setProperty('--fit', f.toFixed(2)); }
        s.style.cssText = prev + (f < 1 ? `;--fit:${f.toFixed(2)}` : '');
      }
      // 休息頁：環形倒數
      s.querySelectorAll('.break .clock').forEach(ringify);
    });
  }
  function grow(s) {
    // 內容太少的一般頁：主要區塊放大到接近舞台（最多 1.4 倍），不讓內容縮在中間
      if (!s.matches('.live-slide,.shot,.stepslide,.procslide,.troubleslide,.cover,.section,.break,.taskintro,.ice,.split')) {
        const blk = s.querySelector(':scope>.grid,:scope>ul,:scope>table.cmp,:scope>.timeline,:scope>.ex,:scope>.disc,:scope>.flow,:scope>.phones');
        if (blk && !s.querySelector(':scope>.src,:scope>.dmin')) {
          const prev = s.style.cssText; s.style.cssText += ';display:flex;visibility:hidden';
          const top = s.getBoundingClientRect().top;
          const ok = () => { const r = blk.getBoundingClientRect(); const last = s.lastElementChild.classList.contains('notes') ? s.lastElementChild.previousElementSibling : s.lastElementChild;
            return (last.getBoundingClientRect().bottom - top) < 935 && r.right - s.getBoundingClientRect().left < 1800 && blk.scrollWidth <= blk.clientWidth + 2; };
          let z = 1;
          if (!ok()) {  // 太滿：縮小到放得下（最低 0.75 倍）
            while (z > 0.75 && !ok()) { z -= 0.03; blk.style.zoom = z.toFixed(2); }
          } else {
            while (z < 1.4) { blk.style.zoom = (z + 0.05).toFixed(2); if (!ok()) { blk.style.zoom = z.toFixed(2); break; } z += 0.05; }
            if (z <= 1) blk.style.zoom = '';
          }
          s.style.cssText = prev;
        }
      }
  }
  function growAll() {
    slides.forEach((s) => { const b = s.querySelector('[style*="zoom"]'); if (b && !s.matches('.live-slide')) b.style.zoom = ''; grow(s); });
  }
  function orbs() {
    return '<i style="width:520px;height:520px;right:-120px;top:-160px;background:radial-gradient(circle,color-mix(in srgb,var(--hue) 55%,transparent),transparent 70%)"></i>' +
      '<i style="width:420px;height:420px;left:38%;bottom:-220px;background:radial-gradient(circle,rgba(124,92,255,.45),transparent 70%);animation-delay:-5s"></i>';
  }
  function net(n) {
    // 便利貼 → 試算表 → 日曆 → 手機 → LINE：右側的節點鏈
    const icons = ['doc', 'sheet', 'calendar', 'phone', 'chat', 'gear', 'alarm'].slice(0, n);
    let d = '', dots = '', y = 120;
    icons.forEach((ic, i) => {
      const x = 260 + (i % 2 ? 150 : 0), yy = 120 + i * 135;
      if (i) d += ` L${x} ${yy}`; else d = `M${x} ${yy}`;
      dots += `<g transform="translate(${x} ${yy})"><circle r="44" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.22)" stroke-width="2"/><use href="#i-${ic}" x="-20" y="-20" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color:var(--hue)"/></g>`;
    });
    return `<svg viewBox="0 0 520 1080" width="520"><path d="${d}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="3" stroke-dasharray="6 12"><animate attributeName="stroke-dashoffset" from="0" to="-180" dur="6s" repeatCount="indefinite"/></path>${dots}</svg>`;
  }

  /* ---------- 單元與時間軌 ---------- */
  const units = meta.units || [];
  const unitOf = [];
  (function mapUnits() {
    let last = -1;
    slides.forEach((s, i) => {
      const n = s.querySelector('.notes');
      const head = n ? n.textContent.split('\n')[0] : '';
      const m = head.match(/^(?:單元：)?(.+?)｜/);
      let k = -1;
      if (m) k = units.findIndex((u) => u[0] === m[1].trim());
      if (k < 0) k = last;
      unitOf[i] = k; if (k >= 0) last = k;
    });
  })();
  function buildRail() {
    const rail = document.createElement('div'); rail.id = 'rail';
    units.forEach((u) => { const i = document.createElement('i'); i.style.flex = u[1]; i.appendChild(document.createElement('b')); rail.appendChild(i); });
    const where = document.createElement('div'); where.id = 'where';
    stage.append(rail, where);
  }
  function paintRail() {
    const rail = document.getElementById('rail'), where = document.getElementById('where');
    const k = unitOf[cur];
    if (rail) [...rail.children].forEach((seg, j) => {
      seg.className = j < k ? 'past' : j === k ? 'cur' : '';
      if (j === k) {
        const idx = unitOf.reduce((a, u, i) => (u === k ? a.concat(i) : a), []);
        const pos = idx.indexOf(cur);
        seg.firstChild.style.width = ((pos + 1) / idx.length * 100) + '%';
      }
    });
    let a = 0; units.slice(0, Math.max(k, 0)).forEach((u) => { a += u[1]; });
    const u = units[k];
    where.innerHTML = (u ? `<span class="u">${String(k + 1).padStart(2, '0')}　${u[0]}</span><span>${a}–${a + u[1]} 分</span>` : '') + `<span class="pg">${cur + 1} / ${slides.length}</span>`;
    const s = slides[cur];
    stage.classList.toggle('dark-top', s.matches('.cover,.section,.night,.break,.shot'));
    stage.classList.toggle('no-where', s.matches('.cover,.icego'));
  }

  /* ---------- 換頁 ---------- */
  function show(i) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    timers.forEach(clearTimeout); timers = [];
    slides.forEach((s, k) => { s.classList.toggle('active', k === cur); s.classList.remove('play'); });
    const s = slides[cur];
    s.querySelectorAll('.wrap.zoomed').forEach(unzoom);
    void s.offsetWidth; s.classList.add('play');
    runScenes(s);
    document.getElementById('hud').textContent = `${cur + 1} / ${slides.length}`;
    try { history.replaceState(null, '', '#' + (cur + 1)); } catch (e) {}
    paintRail(); paintNotes();
  }

  /* ---------- 活的概念頁：data-timeline 場景 ---------- */
  function runScenes(s) {
    s.querySelectorAll('[data-timeline]').forEach((sc) => {
      const els = [...sc.querySelectorAll('[data-t]')];
      const dur = +sc.dataset.timeline || 10000, loop = sc.dataset.loop !== '0';
      const run = () => {
        els.forEach((e) => e.classList.remove('on')); sc.classList.remove('done');
        void sc.getBoundingClientRect();
        els.forEach((e) => {
          timers.push(setTimeout(() => e.classList.add('on'), +e.dataset.t));
          if (e.dataset.off) timers.push(setTimeout(() => e.classList.remove('on'), +e.dataset.off));
        });
        timers.push(setTimeout(() => { sc.classList.add('done'); if (loop) run(); }, dur));
      };
      run();
    });
  }
  function finalState(root) { root.querySelectorAll('[data-t]').forEach((e) => { if (!e.dataset.off) e.classList.add('on'); }); }
  addEventListener('beforeprint', () => slides.forEach(finalState));

  /* ---------- 紅框：聚光與放大 ---------- */
  function drawBoxes() {
    document.querySelectorAll('[data-boxes]').forEach((wrap) => {
      const W = +wrap.dataset.w || 1920, H = +wrap.dataset.h || 1128;
      wrap.style.setProperty('--ar', `${W}/${H}`);
      if (W / H > 16 / 9) wrap.classList.add('wide');
      const boxes = JSON.parse(wrap.dataset.boxes);
      boxes.forEach((b, bi) => {
        const [x, y, w, h, n, lbl, opt] = b;
        const d = document.createElement('div');
        d.className = 'box'; d.style.setProperty('--bi', bi);
        d.style.left = (x / W * 100) + '%'; d.style.top = (y / H * 100) + '%';
        d.style.width = (w / W * 100) + '%'; d.style.height = (h / H * 100) + '%';
        if (n) { const s = document.createElement('span'); s.className = 'n' + (opt && opt.includes('nr') ? ' r' : ''); s.textContent = n; d.appendChild(s); }
        if (lbl) { const s = document.createElement('span'); s.className = 'lbl' + (opt && opt.includes('ll') ? ' l' : ''); s.textContent = lbl; d.appendChild(s); }
        wrap.appendChild(d);
      });
      if (boxes.length) {
        const p = 14, holes = boxes.map(([x, y, w, h]) => `<rect x="${x - p}" y="${y - p}" width="${w + 2 * p}" height="${h + 2 * p}" rx="14" fill="#000"/>`).join('');
        const id = 'm' + Math.random().toString(36).slice(2, 8);
        wrap.insertAdjacentHTML('beforeend', `<svg class="spot" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><mask id="${id}"><rect width="${W}" height="${H}" fill="#fff"/>${holes}</mask></defs><rect width="${W}" height="${H}" fill="rgba(6,9,16,.5)" mask="url(#${id})"/></svg>`);
        wrap.addEventListener('dblclick', (e) => { e.stopPropagation(); toggleZoom(wrap); });
      }
    });
  }
  function toggleZoom(wrap) {
    if (wrap.classList.contains('zoomed')) return unzoom(wrap);
    const W = +wrap.dataset.w || 1920, H = +wrap.dataset.h || 1128, boxes = JSON.parse(wrap.dataset.boxes);
    if (!boxes.length) return;
    const ww = wrap.offsetWidth, wh = wrap.offsetHeight, kx = ww / W, ky = wh / H;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    boxes.forEach(([x, y, w, h]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); });
    const ux = x0 * kx, uy = y0 * ky, uw = (x1 - x0) * kx, uh = (y1 - y0) * ky;
    const box = wrap.parentElement, cw = box.clientWidth, ch = box.clientHeight;
    const s = Math.max(1, Math.min(cw / (uw + 260), ch / (uh + 200), 3.2));
    const tx = cw / 2 - wrap.offsetLeft - s * (ux + uw / 2), ty = ch / 2 - wrap.offsetTop - s * (uy + uh / 2);
    wrap.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
    wrap.classList.add('zoomed');
  }
  function unzoom(wrap) { wrap.style.transform = ''; wrap.classList.remove('zoomed'); }

  /* ---------- 休息倒數：環形 ---------- */
  function ringify(c) {
    const total = (+c.dataset.min || 10) * 60; let left = total, timer = null;
    const R = 290, L = 2 * Math.PI * R;
    const ring = document.createElement('div'); ring.className = 'ring';
    ring.innerHTML = `<svg viewBox="0 0 620 620"><circle class="bg" cx="310" cy="310" r="${R}"/><circle class="fg" cx="310" cy="310" r="${R}" stroke-dasharray="${L}" stroke-dashoffset="0"/></svg><div class="state">點一下開始</div>`;
    c.replaceWith(ring); ring.appendChild(c);
    const fg = ring.querySelector('.fg'), st = ring.querySelector('.state');
    const paint = () => { c.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0'); fg.style.strokeDashoffset = L * (1 - left / total); };
    paint();
    ring.onclick = (e) => {
      e.stopPropagation();
      if (timer) { clearInterval(timer); timer = null; st.textContent = '暫停中'; return; }
      st.textContent = '倒數中';
      timer = setInterval(() => { left = Math.max(0, left - 1); paint(); if (!left) { clearInterval(timer); timer = null; ring.classList.add('done'); st.textContent = '時間到'; } }, 1000);
    };
  }
  function initClocks() {  // 非休息頁的倒數（例如破冰）維持原本的點擊數字
    document.querySelectorAll('.clock').forEach((c) => {
      if (c.closest('.ring')) return;
      let left = (+c.dataset.min || 10) * 60, timer = null;
      const paint = () => { c.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0'); };
      paint();
      c.onclick = (e) => {
        e.stopPropagation();
        if (timer) { clearInterval(timer); timer = null; return; }
        timer = setInterval(() => { left = Math.max(0, left - 1); paint(); if (!left) { clearInterval(timer); c.style.color = '#e3162b'; } }, 1000);
      };
    });
  }

  /* ---------- 翻牌卡 ---------- */
  function initFlips() {
    document.querySelectorAll('.flip').forEach((f) => { f.addEventListener('click', (e) => { e.stopPropagation(); f.classList.toggle('flipped'); }); });
    document.querySelectorAll('[data-flipall]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); const fl = b.closest('.slide').querySelectorAll('.flip'); const all = [...fl].every((f) => f.classList.contains('flipped'));
      fl.forEach((f) => f.classList.toggle('flipped', !all));
    }));
  }

  /* ---------- 講者備忘稿 ---------- */
  let notesOn = false, presenter = null;
  const noteOf = (i) => { const n = slides[i] && slides[i].querySelector('.notes'); return n ? n.textContent : ''; };
  const titleOf = (i) => { const h = slides[i] && slides[i].querySelector('h1,h2,.caption'); return h ? h.textContent.trim() : ''; };
  function paintNotes() {
    const panel = document.getElementById('notespanel');
    if (panel) { panel.classList.toggle('on', notesOn); panel.textContent = `${cur + 1} / ${slides.length}\n` + (noteOf(cur) || '（本頁沒有備忘稿）'); }
    if (presenter && !presenter.closed) {
      const d = presenter.document;
      d.getElementById('pos').textContent = `${cur + 1} / ${slides.length}`;
      d.getElementById('now').textContent = titleOf(cur);
      d.getElementById('notes').textContent = noteOf(cur) || '（本頁沒有備忘稿）';
      d.getElementById('next').textContent = cur + 1 < slides.length ? '下一頁：' + titleOf(cur + 1) : '最後一頁';
    }
  }
  function openPresenter() {
    presenter = window.open('', 'misa-presenter', 'width=760,height=640');
    if (!presenter) return;
    presenter.document.open();
    presenter.document.write('<!doctype html><meta charset="utf-8"><title>講者備忘稿</title><style>body{margin:0;padding:20px 24px;background:#0b1020;color:#f2f4f7;font:22px/1.6 "Microsoft JhengHei UI","Microsoft JhengHei",sans-serif}#pos{color:#8fb4ff;font-weight:700}#now{font-size:26px;font-weight:700;margin:4px 0 12px}#notes{white-space:pre-wrap}#next{margin-top:18px;color:#c9d2e3;font-size:18px}</style><div id="pos"></div><div id="now"></div><div id="notes"></div><div id="next"></div>');
    presenter.document.close();
    presenter.addEventListener('keydown', (e) => window.dispatchEvent(new KeyboardEvent('keydown', { key: e.key })));
    paintNotes();
  }

  /* ---------- 總覽 ---------- */
  function overview(on) {
    const ov = document.getElementById('overview');
    if (!on) { ov.classList.remove('on'); ov.innerHTML = ''; return; }
    ov.innerHTML = '';
    slides.forEach((s, i) => {
      const th = document.createElement('div');
      th.className = 'th' + (i === cur ? ' cur' : '');
      const mini = s.cloneNode(true);
      mini.classList.add('active', 'mini'); mini.classList.remove('play');
      mini.style.display = 'flex';
      finalState(mini);
      th.innerHTML = `<span>${i + 1}</span>`;
      th.appendChild(mini);
      th.onclick = () => { overview(false); show(i); };
      ov.appendChild(th);
      requestAnimationFrame(() => { mini.style.transform = `scale(${th.clientWidth / 1920})`; });
    });
    ov.classList.add('on');
    const c = ov.querySelector('.cur'); if (c) c.scrollIntoView({ block: 'center' });
  }

  /* ---------- 小工具 ---------- */
  function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 1400); }
  function chrome() {
    const add = (id, html) => { if (!document.getElementById(id)) { const d = document.createElement('div'); d.id = id; if (html) d.innerHTML = html; document.body.appendChild(d); } };
    add('notespanel'); add('laser'); add('toast');
    add('keyhelp', '<b>← →</b>上一頁／下一頁<br><b>數字 Enter</b>跳到該頁<br><b>O</b>總覽　<b>F</b>全螢幕　<b>B</b>黑畫面<br><b>Z</b>放大紅框（或雙擊截圖）<br><b>S</b>截圖聚光開關<br><b>L</b>雷射筆<br><b>R</b>重播本頁動畫<br><b>N</b>備忘稿　<b>P</b>講者視窗');
    addEventListener('mousemove', (e) => { const l = document.getElementById('laser'); l.style.left = e.clientX + 'px'; l.style.top = e.clientY + 'px'; });
    if (localStorage.getItem('misa-spot') !== 'off') document.body.classList.add('spot-on');
    if (meta.code) document.body.dataset.deck = meta.code;
  }

  addEventListener('keydown', (e) => {
    const ov = document.getElementById('overview').classList.contains('on');
    if (e.key === 'Escape') { if (ov) return overview(false); document.getElementById('keyhelp').classList.remove('on'); slides[cur].querySelectorAll('.wrap.zoomed').forEach(unzoom); return; }
    if (/^[0-9]$/.test(e.key)) { typed += e.key; return; }
    if (e.key === 'Enter' && typed) { show(+typed - 1); typed = ''; return; }
    typed = '';
    const k = e.key.toLowerCase();
    if (['ArrowRight', ' ', 'PageDown', 'ArrowDown'].includes(e.key)) { e.preventDefault(); show(cur + 1); }
    else if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) { e.preventDefault(); show(cur - 1); }
    else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(slides.length - 1);
    else if (k === 'f') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
    else if (k === 'o') overview(!ov);
    else if (k === 'n') { notesOn = !notesOn; paintNotes(); }
    else if (k === 'p') openPresenter();
    else if (k === 'b') { stage.style.visibility = stage.style.visibility === 'hidden' ? '' : 'hidden'; }
    else if (k === 'z') { const w = slides[cur].querySelector('.wrap[data-boxes]'); if (w) toggleZoom(w); }
    else if (k === 's') { const on = document.body.classList.toggle('spot-on'); localStorage.setItem('misa-spot', on ? 'on' : 'off'); toast(on ? '截圖聚光：開' : '截圖聚光：關'); }
    else if (k === 'l') { const on = document.body.classList.toggle('laser'); toast(on ? '雷射筆：開' : '雷射筆：關'); }
    else if (k === 'r') show(cur);
    else if (k === 'h' || e.key === '?') document.getElementById('keyhelp').classList.toggle('on');
  });
  addEventListener('click', (e) => {
    if (e.target.closest('.clock,.ring,a,button,#overview,.flip,[data-flipall],.live [data-click],.wrap')) return;
    if (e.clientX > innerWidth * 0.75) show(cur + 1);
    else if (e.clientX < innerWidth * 0.25) show(cur - 1);
  });
  addEventListener('resize', fit);

  chrome(); prepare(); growAll(); addEventListener('load', growAll); drawBoxes(); initClocks(); initFlips(); buildRail(); fit();
  const start = parseInt(location.hash.slice(1), 10);
  show(isNaN(start) ? 0 : start - 1);
})();
