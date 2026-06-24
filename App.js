// ── CONSTANTS ──
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── STATE ──
let curYear, curMonth;
let data = {};
let saveTimer = null;
let modalCb = null;
let _calWeeks = null, _calYear = null, _calMonth = null;

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
function init() {
  const now = new Date();
  curYear  = now.getFullYear();
  curMonth = now.getMonth();
  loadData();
  renderAll();
}

function changeMonth(d) {
  save();
  curMonth += d;
  if (curMonth > 11) { curMonth = 0; curYear++; }
  if (curMonth < 0)  { curMonth = 11; curYear--; }
  _calWeeks = null;
  loadData();
  renderAll();
}

// ─────────────────────────────────────────
// DATA — KEY / BLANK / LOAD / SAVE
// ─────────────────────────────────────────
function mkey(y, m) { return `et3_${y}_${m}`; }
function curKey()   { return mkey(curYear, curMonth); }

function blankData() {
  return {
    fixed: [
      { name: 'Apt Rent',   icon: '🏠', amt: 0 },
      { name: 'Mobile Bill',icon: '📱', amt: 0 },
      { name: 'Power Bill', icon: '⚡', amt: 0 },
    ],
    goal: 0,
    notes: '',
    subs: [],
    weeks: Array.from({ length: 4 }, () => ({
      pay: 0,
      days: Object.fromEntries(DAYS.map(d => [d, []]))
    }))
  };
}

function loadData() {
  const raw = localStorage.getItem(curKey());
  data = raw ? JSON.parse(raw) : blankData();

  // migrate old format (rent/mobile/power top-level fields)
  if (!data.fixed) {
    data.fixed = [
      { name: 'Apt Rent',   icon: '🏠', amt: data.rent   || 0 },
      { name: 'Mobile Bill',icon: '📱', amt: data.mobile || 0 },
      { name: 'Power Bill', icon: '⚡', amt: data.power  || 0 },
    ];
    delete data.rent; delete data.mobile; delete data.power;
  }

  if (!data.subs)  data.subs  = [];
  if (!data.weeks) data.weeks = blankData().weeks;
  data.weeks.forEach(w => {
    if (!w.days) w.days = Object.fromEntries(DAYS.map(d => [d, []]));
    DAYS.forEach(d => { if (!w.days[d]) w.days[d] = []; });
  });
}

function save() {
  localStorage.setItem(curKey(), JSON.stringify(data));
}

function schedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

// ─────────────────────────────────────────
// RENDER ALL
// ─────────────────────────────────────────
function renderAll() {
  document.getElementById('monthLabel').textContent = `${MONTHS[curMonth]} ${curYear}`;
  document.getElementById('goalInput').value  = data.goal  || '';
  document.getElementById('notesArea').value  = data.notes || '';
  renderFixed();
  renderSubs();
  renderWeeks();
  recalc();
}

// ─────────────────────────────────────────
// FIXED BILLS
// ─────────────────────────────────────────
function toggleFixed() {
  const block = document.getElementById('fixedBlock');
  const body  = document.getElementById('fixedBody');
  const isOpen = block.classList.toggle('open');
  body.classList.toggle('open', isOpen);
}

function renderFixed() {
  const container = document.getElementById('fixedItems');
  container.innerHTML = '';
  (data.fixed || []).forEach((f, i) => {
    const row = document.createElement('div');
    row.className = 'fixed-item';
    const isDefault = i < 3;
    row.innerHTML = `
      <span class="fi-icon">${f.icon || '📋'}</span>
      <input class="fi-name" type="text" placeholder="Bill name" value="${esc(f.name)}"
        oninput="data.fixed[${i}].name=this.value;schedSave()"/>
      <input class="fi-amt" type="number" placeholder="$0.00" value="${f.amt || ''}"
        oninput="data.fixed[${i}].amt=parseFloat(this.value)||0;recalc()"/>
      ${isDefault
        ? `<span class="fi-lock" title="Default bill">🔒</span>`
        : `<button class="del-btn" onclick="removeFixedBill(${i})">✕</button>`}
    `;
    container.appendChild(row);
  });
  const total = (data.fixed || []).reduce((s, f) => s + (f.amt || 0), 0);
  const ft = document.getElementById('fixedTotal');
  if (ft) ft.textContent = `$${total.toFixed(2)}`;
}

function addFixedBill() {
  data.fixed.push({ name: '', icon: '📋', amt: 0 });
  renderFixed();
  setTimeout(() => {
    const inputs = document.querySelectorAll('.fi-name');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 50);
}

function removeFixedBill(i) {
  data.fixed.splice(i, 1);
  renderFixed();
  recalc();
}

// ─────────────────────────────────────────
// SUBSCRIPTIONS
// ─────────────────────────────────────────
function renderSubs() {
  const list = document.getElementById('subList');
  list.innerHTML = '';
  (data.subs || []).forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'sub-item';
    row.innerHTML = `
      <input class="sub-name" type="text" placeholder="Name (e.g. Netflix)" value="${esc(s.name)}"
        oninput="data.subs[${i}].name=this.value;schedSave();recalc()"/>
      <input class="sub-amt" type="number" placeholder="$0" value="${s.amt || ''}"
        oninput="data.subs[${i}].amt=parseFloat(this.value)||0;schedSave();recalc()"/>
      <button class="del-btn" onclick="removeSub(${i})">✕</button>
    `;
    list.appendChild(row);
  });
}

function addSub() {
  data.subs.push({ name: '', amt: 0 });
  renderSubs();
  recalc();
}

function removeSub(i) {
  data.subs.splice(i, 1);
  renderSubs();
  recalc();
}

// ─────────────────────────────────────────
// CALENDAR WEEK HELPERS
// ─────────────────────────────────────────
function buildCalendarWeeks(year, month) {
  const firstDay   = new Date(year, month, 1);
  const weekSunday = new Date(firstDay);
  weekSunday.setDate(firstDay.getDate() - firstDay.getDay());

  const weeks = [];
  let cur = new Date(weekSunday);

  while (true) {
    const week = [];
    let hasMonthDay = false;
    for (let d = 0; d < 7; d++) {
      const day = new Date(cur);
      day.setDate(cur.getDate() + d);
      if (day.getMonth() === month) {
        week.push(day);
        hasMonthDay = true;
      } else {
        week.push(null);
      }
    }
    if (!hasMonthDay) break;
    weeks.push(week);
    cur.setDate(cur.getDate() + 7);
    if (weeks.length >= 6) break;
  }
  return weeks;
}

function fmtDate(d) {
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
}

function getCalWeeks() {
  if (_calWeeks && _calYear === curYear && _calMonth === curMonth) return _calWeeks;
  _calWeeks  = buildCalendarWeeks(curYear, curMonth);
  _calYear   = curYear;
  _calMonth  = curMonth;
  return _calWeeks;
}

// ─────────────────────────────────────────
// WEEKS
// ─────────────────────────────────────────
function renderWeeks() {
  const calWeeks = getCalWeeks();
  while (data.weeks.length < calWeeks.length) {
    data.weeks.push({ pay: 0, days: Object.fromEntries(DAYS.map(d => [d, []])) });
  }

  const wrap = document.getElementById('weeksWrap');
  wrap.innerHTML = '';

  calWeeks.forEach((week, wi) => {
    const validDays = week.filter(Boolean);
    const dateRange = `${fmtDate(validDays[0])} – ${fmtDate(validDays[validDays.length - 1])}`;
    const wk       = data.weeks[wi];
    const wkIncome = wk.pay || 0;
    const wkSpent  = calcWeekSpent(wi);

    const div = document.createElement('div');
    div.className = 'week-block';
    div.id = `wblock_${wi}`;
    div.innerHTML = `
      <div class="week-hdr" onclick="toggleWeek(${wi})">
        <div class="week-hdr-left">
          <span class="wk-badge">Week ${wi + 1}</span>
          <span class="wk-daterange">📅 ${dateRange}</span>
          <span class="wk-stats">&nbsp;· Pay: <span class="pay-val" id="wpay_${wi}">$${wkIncome.toFixed(2)}</span> &nbsp;· Spent: <span class="spent-val" id="wspent_${wi}">$${wkSpent.toFixed(2)}</span></span>
        </div>
        <div class="wk-chevron" id="wtog_${wi}">▾</div>
      </div>
      <div class="week-body" id="wbody_${wi}">
        <div class="pay-row">
          <label>💵 Pay Received this week</label>
          <input type="number" value="${wk.pay || ''}" placeholder="$0.00"
            oninput="data.weeks[${wi}].pay=parseFloat(this.value)||0;updateWeekStats(${wi});recalc()"/>
        </div>
        <div class="days-grid" id="days_${wi}"></div>
      </div>
    `;
    wrap.appendChild(div);
    renderDays(wi, week);
  });
}

function toggleWeek(wi) {
  const block  = document.getElementById(`wblock_${wi}`);
  const body   = document.getElementById(`wbody_${wi}`);
  const isOpen = block.classList.toggle('open');
  body.classList.toggle('open', isOpen);
}

// ─────────────────────────────────────────
// DAYS
// ─────────────────────────────────────────
function renderDays(wi, weekDays) {
  const grid = document.getElementById(`days_${wi}`);
  grid.innerHTML = '';
  DAYS.forEach((day, di) => {
    const actualDate = weekDays[di];
    if (!actualDate) return;
    const entries  = data.weeks[wi].days[day] || [];
    const dayTotal = entries.reduce((s, e) => s + (e.amt || 0), 0);
    const card = document.createElement('div');
    card.className  = 'day-card';
    card.dataset.day = day;
    card.innerHTML = `
      <div class="day-hdr">
        <div>
          <span class="day-name">${day.toUpperCase()}</span>
          <span class="day-date">${fmtDate(actualDate)}</span>
        </div>
        <span class="day-total" id="dtot_${wi}_${day}">$${dayTotal.toFixed(2)}</span>
      </div>
      <div class="day-entries" id="dent_${wi}_${day}"></div>
      <button class="day-add-btn" onclick="addEntry(${wi},'${day}')">＋ Add expense</button>
    `;
    grid.appendChild(card);
    renderEntries(wi, day);
  });
}

function renderEntries(wi, day) {
  const container = document.getElementById(`dent_${wi}_${day}`);
  const entries   = data.weeks[wi].days[day] || [];
  container.innerHTML = '';
  entries.forEach((e, ei) => {
    const row = document.createElement('div');
    row.className = 'entry-row';
    row.innerHTML = `
      <input class="ename" type="text" placeholder="Name" value="${esc(e.name)}"
        oninput="data.weeks[${wi}].days['${day}'][${ei}].name=this.value;schedSave()"/>
      <input class="eamt" type="number" placeholder="$0" value="${e.amt || ''}"
        oninput="data.weeks[${wi}].days['${day}'][${ei}].amt=parseFloat(this.value)||0;updateDay(${wi},'${day}');recalc()"/>
      <button class="edel" onclick="removeEntry(${wi},'${day}',${ei})">✕</button>
    `;
    container.appendChild(row);
  });
}

function addEntry(wi, day) {
  if (!data.weeks[wi].days[day]) data.weeks[wi].days[day] = [];
  data.weeks[wi].days[day].push({ name: '', amt: 0 });
  renderEntries(wi, day);
  updateDay(wi, day);
  setTimeout(() => {
    const ents = document.querySelectorAll(`#dent_${wi}_${day} .ename`);
    if (ents.length) ents[ents.length - 1].focus();
  }, 50);
}

function removeEntry(wi, day, ei) {
  data.weeks[wi].days[day].splice(ei, 1);
  renderEntries(wi, day);
  updateDay(wi, day);
  recalc();
}

function updateDay(wi, day) {
  const entries = data.weeks[wi].days[day] || [];
  const total   = entries.reduce((s, e) => s + (e.amt || 0), 0);
  const el = document.getElementById(`dtot_${wi}_${day}`);
  if (el) el.textContent = `$${total.toFixed(2)}`;
  updateWeekStats(wi);
  schedSave();
}

function updateWeekStats(wi) {
  const spent = calcWeekSpent(wi);
  const pay   = data.weeks[wi].pay || 0;
  const ps = document.getElementById(`wpay_${wi}`);
  const ss = document.getElementById(`wspent_${wi}`);
  if (ps) ps.textContent = `$${pay.toFixed(2)}`;
  if (ss) ss.textContent = `$${spent.toFixed(2)}`;
}

function calcWeekSpent(wi) {
  let t = 0;
  DAYS.forEach(d => { (data.weeks[wi].days[d] || []).forEach(e => t += e.amt || 0); });
  return t;
}

// ─────────────────────────────────────────
// RECALC — summary + warning + goal bar
// ─────────────────────────────────────────
function recalc() {
  data.goal  = parseFloat(document.getElementById('goalInput').value) || 0;
  data.notes = document.getElementById('notesArea').value;

  const fixed  = (data.fixed || []).reduce((s, f) => s + (f.amt || 0), 0);
  const subTot = (data.subs  || []).reduce((s, sub) => s + (sub.amt || 0), 0);
  let income = 0, wkExp = 0;
  data.weeks.forEach((wk, wi) => {
    income += wk.pay || 0;
    wkExp  += calcWeekSpent(wi);
  });

  // update fixed header total
  const ft = document.getElementById('fixedTotal');
  if (ft) ft.textContent = `$${fixed.toFixed(2)}`;

  const totalSpent = fixed + subTot + wkExp;
  const remaining  = income - totalSpent;
  const projSaved  = Math.max(remaining, 0);
  const goal       = data.goal;

  document.getElementById('sIncome').textContent = `$${income.toFixed(2)}`;
  document.getElementById('sSpent').textContent  = `$${totalSpent.toFixed(2)}`;
  document.getElementById('sGoal').textContent   = `$${goal.toFixed(2)}`;
  document.getElementById('sLeft').textContent   = `$${remaining.toFixed(2)}`;
  document.getElementById('sLeftCard').className = 's-card left' + (remaining < 0 ? ' neg' : '');

  // goal bar
  const pct = goal > 0 ? Math.min((projSaved / goal) * 100, 100) : 0;
  const bar = document.getElementById('goalBar');
  bar.style.width = pct + '%';
  bar.className   = 'bar-fill' + (pct < 50 ? ' danger' : pct < 85 ? ' warn' : '');
  document.getElementById('goalPctLbl').textContent =
    goal > 0 ? `$${projSaved.toFixed(2)} / $${goal.toFixed(2)} (${pct.toFixed(0)}%)` : '—';

  // warning banner
  const budget = income - goal;
  const wb = document.getElementById('warnBar');
  if (income > 0 && goal > 0 && budget > 0) {
    const ratio = totalSpent / budget;
    if (ratio >= 1) {
      document.getElementById('warnMsg').textContent =
        `You've exceeded your spending budget! Spent $${totalSpent.toFixed(2)}, should stay under $${budget.toFixed(2)} to hit your savings goal.`;
      wb.classList.add('show');
    } else if (ratio >= 0.85) {
      document.getElementById('warnMsg').textContent =
        `${(ratio * 100).toFixed(0)}% of spending budget used. Only $${(budget - totalSpent).toFixed(2)} left before your savings goal is at risk.`;
      wb.classList.add('show');
    } else {
      wb.classList.remove('show');
    }
  } else {
    wb.classList.remove('show');
  }

  schedSave();
}

// ─────────────────────────────────────────
// HISTORY
// ─────────────────────────────────────────
function getAllMonths() {
  return Object.keys(localStorage)
    .filter(k => k.startsWith('et3_'))
    .map(k => {
      const parts = k.split('_');
      const y = parseInt(parts[1]), m = parseInt(parts[2]);
      const d = JSON.parse(localStorage.getItem(k)) || {};
      const fixed  = (d.fixed || []).reduce((s, f) => s + (f.amt || 0), 0)
                   || (d.rent || 0) + (d.mobile || 0) + (d.power || 0);
      const subTot = (d.subs || []).reduce((s, sub) => s + (sub.amt || 0), 0);
      let income = 0, wkExp = 0;
      (d.weeks || []).forEach(wk => {
        income += wk.pay || 0;
        DAYS.forEach(day => { (wk.days?.[day] || []).forEach(e => wkExp += e.amt || 0); });
      });
      const spent = fixed + subTot + wkExp;
      const saved = Math.max(income - spent, 0);
      return { y, m, income, fixed, subTot, wkExp, spent, saved, goal: d.goal || 0 };
    })
    .sort((a, b) => b.y - a.y || b.m - a.m);
}

function renderHistory(filter = '') {
  const rows     = getAllMonths();
  const lc       = filter.toLowerCase();
  const filtered = rows.filter(r => `${MONTHS[r.m]} ${r.y}`.toLowerCase().includes(lc));
  const tbody    = document.getElementById('historyBody');
  const empty    = document.getElementById('histEmpty');

  let ai = 0, as = 0, av = 0;
  rows.forEach(r => { ai += r.income; as += r.spent; av += r.saved; });
  document.getElementById('hTotalIncome').textContent = `$${ai.toFixed(0)}`;
  document.getElementById('hTotalSpent').textContent  = `$${as.toFixed(0)}`;
  document.getElementById('hTotalSaved').textContent  = `$${av.toFixed(0)}`;
  document.getElementById('hMonths').textContent      = rows.length;

  if (!filtered.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = filtered.map(r => {
    const pct    = r.goal > 0 ? (r.saved / r.goal) * 100 : 100;
    const status = pct >= 100 ? '<span class="badge ok">✓ On track</span>'
                 : pct >= 70  ? '<span class="badge close">~ Close</span>'
                 :               '<span class="badge over">✗ Short</span>';
    return `<tr onclick="jumpTo(${r.y},${r.m})" title="Click to open ${MONTHS[r.m]} ${r.y}">
      <td><strong>${MONTHS[r.m]} ${r.y}</strong></td>
      <td style="color:var(--green)">$${r.income.toFixed(0)}</td>
      <td>$${r.fixed.toFixed(0)}</td>
      <td>$${r.subTot.toFixed(0)}</td>
      <td>$${r.wkExp.toFixed(0)}</td>
      <td style="color:var(--warn)">$${r.spent.toFixed(0)}</td>
      <td style="color:var(--green)">$${r.saved.toFixed(0)}</td>
      <td>$${r.goal.toFixed(0)}</td>
      <td>${status}</td>
    </tr>`;
  }).join('');
}

function jumpTo(y, m) {
  save();
  curYear = y; curMonth = m;
  showPage('tracker');
  loadData();
  renderAll();
}

// ─────────────────────────────────────────
// PAGE SWITCH
// ─────────────────────────────────────────
function showPage(page) {
  document.getElementById('trackerPage').style.display  = page === 'tracker' ? 'block' : 'none';
  document.getElementById('historyPage').style.display  = page === 'history' ? 'block' : 'none';
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', (i === 0 && page === 'tracker') || (i === 1 && page === 'history'));
  });
  if (page === 'history') renderHistory();
}

// ─────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────
function closeModal() { document.getElementById('modalOverlay').classList.remove('show'); }
function confirmModal() {
  const n = document.getElementById('modalName').value.trim();
  const a = parseFloat(document.getElementById('modalAmt').value) || 0;
  if (modalCb) modalCb(n, a);
  closeModal();
}

// ─────────────────────────────────────────
// EXPORT CSV
// ─────────────────────────────────────────
function exportCSV() {
  const rows = [
    [`${MONTHS[curMonth]} ${curYear} — Expense Report`],
    [],
    ['Fixed Monthly Bills'],
    ['Name', 'Amount'],
    ...(data.fixed || []).map(f => [f.name, f.amt]),
    [],
    ['Subscriptions'],
    ['Name', 'Amount'],
    ...(data.subs || []).map(s => [s.name, s.amt]),
    [],
  ];
  data.weeks.forEach((wk, wi) => {
    rows.push([`Week ${wi + 1}`, `Pay: $${wk.pay || 0}`]);
    DAYS.forEach(day => {
      const ents = wk.days[day] || [];
      if (ents.length) {
        rows.push([day]);
        ents.forEach(e => rows.push(['', e.name, e.amt]));
      }
    });
    rows.push([]);
  });
  rows.push(['Savings Goal', data.goal]);
  rows.push(['Notes', (data.notes || '').replace(/,/g, ' ')]);

  const csv = rows.map(r => r.join(',')).join('\n');
  const a   = document.createElement('a');
  a.href    = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `budget_${MONTHS[curMonth]}_${curYear}.csv`;
  a.click();
  showToast('CSV downloaded!');
}

// ─────────────────────────────────────────
// CLEAR MONTH
// ─────────────────────────────────────────
function clearMonth() {
  if (!confirm(`Clear all data for ${MONTHS[curMonth]} ${curYear}?`)) return;
  localStorage.removeItem(curKey());
  loadData();
  renderAll();
}

// ─────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ─────────────────────────────────────────
// UTIL
// ─────────────────────────────────────────
function esc(s) { return (s || '').replace(/"/g, '&quot;'); }

// ─────────────────────────────────────────
// START
// ─────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}