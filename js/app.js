/* Drink Tracker — UI: views, sheets, events. */
'use strict';

/* ---------- DOM helpers ---------- */
const $ = (s) => document.querySelector(s);

const ICONS = {
  search: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  chevR: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  chevL: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  gear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>',
  pencil: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3.5l3.5 3.5L8 19.5 3.5 20.5 4.5 16z"/></svg>',
  plus: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};

/* ---------- Navigation ---------- */
const VIEWS = ['home', 'log', 'history', 'stats'];
let current = 'home';
let historyShow = 20;

function show(view) {
  current = view;
  for (const v of VIEWS) $('#view-' + v).classList.toggle('active', v === view);
  if (view === 'log') {
    $('#search').value = '';
    $('#search-boxwrap').classList.remove('has-q');
  }
  if (view === 'history') historyShow = 20;
  render(view);
  if (view === 'log') setTimeout(() => $('#search').focus(), 80);
}

function render(view) {
  if (view === 'home') renderHome();
  else if (view === 'log') renderLog();
  else if (view === 'history') renderHistory();
  else if (view === 'stats') renderStats();
}

/* ---------- Sheet ---------- */
let sheetOpen = false;
function openSheet(html) {
  const sh = $('#sheet'), bd = $('#backdrop');
  sh.innerHTML = `<div class="grab"></div><button class="sheet-x" data-close aria-label="Close">${ICONS.x}</button>` + html;
  sh.hidden = false;
  bd.hidden = false;
  sh.scrollTop = 0;
  requestAnimationFrame(() => { sh.classList.add('open'); bd.classList.add('open'); });
  sheetOpen = true;
}
function closeSheet() {
  const sh = $('#sheet'), bd = $('#backdrop');
  sh.classList.remove('open');
  bd.classList.remove('open');
  sheetOpen = false;
  setTimeout(() => {
    if (!sheetOpen) { sh.hidden = true; bd.hidden = true; sh.innerHTML = ''; }
  }, 280);
}

/* ---------- Toast ---------- */
let toastTimer = null, toastUndo = null;
function toast(msg, undo) {
  const t = $('#toast');
  t.querySelector('.tmsg').textContent = msg;
  toastUndo = undo || null;
  $('#toast-undo').style.display = undo ? '' : 'none';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 5000 : 2400);
}

/* ---------- Formatting helpers ---------- */
function profileMeta(p) {
  const parts = [`${fmtStd(p.std || 0)} std`];
  if (p.oz != null) parts.push(`${p.oz} oz`);
  if (p.cal != null) parts.push(`${fmtInt(p.cal)} cal`);
  if (p.abv != null) parts.push(`${p.abv}%`);
  return parts.join(' · ');
}

/* ---------- Home ---------- */
function renderHome() {
  const now = Date.now();
  const t0 = startOfDay(now), t1 = addDays(t0, 1);
  const today = state.entries.filter((e) => e.at >= t0 && e.at < t1);
  const w0 = startOfWeek(now);
  const week = state.entries.filter((e) => e.at >= w0 && e.at < t1);
  const tDrinks = today.reduce((s, e) => s + (e.qty || 1), 0);
  const tStd = today.reduce((s, e) => s + (e.std || 0) * (e.qty || 1), 0);
  const wStd = week.reduce((s, e) => s + (e.std || 0) * (e.qty || 1), 0);
  $('#home-summary').innerHTML = state.entries.length
    ? `<div class="summary-item"><div class="sv">${fmtInt(tDrinks)}</div><div class="sl">drinks today</div></div>
       <div class="summary-item"><div class="sv">${fmtStd(tStd)}</div><div class="sl">std today</div></div>
       <div class="summary-item"><div class="sv">${fmtStd(wStd)}</div><div class="sl">std this week</div></div>`
    : `<div class="summary-item"><div class="sl" style="font-size:14px">Nothing logged yet — tap <b>Log Drink</b> to get started.</div></div>`;
}

/* ---------- Log / search ---------- */
function renderLog() {
  const q = $('#search').value.trim();
  $('#search-boxwrap').classList.toggle('has-q', !!q);
  const cont = $('#log-list');

  if (!state.profiles.length && !q) {
    cont.innerHTML =
      `<div class="empty"><div class="e-emoji">🍸</div>
        Search for a drink above — if it doesn't exist yet you can create it.<br>
        Or start from a few common drinks:
        <button class="btn ghost" data-act="seed">Add common drinks</button>
      </div>`;
    return;
  }

  const list = searchProfiles(q);
  const use = usageMap();
  let html = '';

  if (!q) {
    const chips = list.filter((p) => (use.get(p.id) || { n: 0 }).n > 0).slice(0, 4);
    if (chips.length) {
      html += '<div class="chips">' + chips.map((p) =>
        `<button class="chip" data-log="${esc(p.id)}">${catById(p.category).emoji} ${esc(p.name)}</button>`
      ).join('') + '</div>';
    }
  }

  if (list.length) {
    html += `<div class="sec">${q ? 'Matches' : 'Your drinks'}</div><div class="card">` +
      list.map((p) => `
        <div class="row pressable" data-log="${esc(p.id)}">
          <div class="row-emoji">${catById(p.category).emoji}</div>
          <div class="row-main">
            <div class="row-title">${esc(p.name)}</div>
            <div class="row-sub">${esc(profileMeta(p))}</div>
          </div>
          <button class="row-btn" data-editp="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">${ICONS.pencil}</button>
          <button class="row-btn add" data-quick="${esc(p.id)}" aria-label="Log ${esc(p.name)} now">${ICONS.plus}</button>
        </div>`).join('') + '</div>';
  } else if (q) {
    html += `<div class="empty" style="padding:28px 20px">No drink called “${esc(q)}” yet.</div>`;
  }

  if (q) {
    html += `<div class="card" style="margin-top:10px">
      <button class="create-row" data-create="1">${ICONS.plus}<span class="cr-q">New drink “${esc(q)}”</span></button>
    </div>`;
  }

  cont.innerHTML = html;
}

function quickLog(p) {
  const e = addEntry(p, {});
  toast(`Logged ${p.name}`, () => { deleteEntry(e.id); render(current); });
  render(current);
}

/* ---------- Log sheet ---------- */
function openLogSheet(p) {
  const fixed = isFixedServing(p) || p.oz == null;
  const variants = p.variants && p.variants.length ? p.variants : null;
  const whenField = `
      <div class="field"><label>When</label>
        <div class="seg" id="when-seg">
          <button type="button" class="on" data-when="now">Now</button>
          <button type="button" data-when="pick">Earlier</button>
        </div>
        <input type="datetime-local" id="f-at" value="${toLocalInput(Date.now())}" style="display:none;margin-top:8px">
      </div>`;
  const stepperField = `
      <div class="field" style="flex:0 0 auto"><label>How many</label>
        <div class="stepper"><button type="button" data-step="-1">−</button><span class="qv" id="f-qty">1</span><button type="button" data-step="1">+</button></div>
      </div>`;
  openSheet(`
    <div class="sheet-head">
      <div class="sh-emoji">${catById(p.category).emoji}</div>
      <div><h2>${esc(p.name)}</h2><div class="sub">${esc(profileMeta(p))}</div></div>
    </div>
    ${p.desc ? `<div class="sub" style="margin:0 0 4px">${esc(p.desc)}</div>` : ''}
    ${p.ing && p.ing.length ? `<div class="sub" style="margin:0 0 4px">Contains: ${esc(p.ing.join(' · '))}</div>` : ''}
    ${variants ? `<div class="field"><label>Liquor</label><div class="seg" id="variant-seg">
      ${variants.map((v, i) => `<button type="button" data-variant="${esc(v)}" class="${i === 0 ? 'on' : ''}">${esc(v)}</button>`).join('')}
    </div></div>` : ''}
    ${fixed
      ? `<div class="frow">${stepperField}${whenField}</div>`
      : `<div class="frow">
           <div class="field"><label>Ounces</label><input id="f-oz-main" type="number" step="0.5" min="0" inputmode="decimal" value="${p.oz}"></div>
           ${stepperField}
         </div>
         <div class="hint" id="scale-hint" style="margin:-4px 2px 4px"></div>
         ${whenField}`}
    <details class="adjust"><summary>Adjust this entry (optional)</summary>
      <div class="frow">
        <div class="field"><label>Std drinks</label><input id="f-std" type="number" step="0.1" min="0" inputmode="decimal" value="${p.std ?? ''}"></div>
        ${fixed ? `<div class="field"><label>Ounces</label><input id="f-oz" type="number" step="0.5" min="0" inputmode="decimal" value="${p.oz ?? ''}"></div>` : ''}
        <div class="field"><label>Calories</label><input id="f-cal" type="number" step="1" min="0" inputmode="numeric" value="${p.cal ?? ''}"></div>
      </div>
      <div class="field"><label>Note</label><input id="f-note" type="text" placeholder="Optional note for this entry"></div>
      <div class="hint">Only this log is affected — the saved “${esc(p.name)}” profile stays unchanged.</div>
    </details>
    <button class="btn" id="do-log">Log drink</button>
  `);
  // Ounce scaling: std/calories follow the pour size until manually overridden
  const ozMain = $('#f-oz-main');
  if (ozMain) {
    const sync = () => {
      const s = scaledForOz(p, num(ozMain.value));
      $('#scale-hint').textContent =
        `= ${s.std != null ? fmtStd(s.std) : '—'} std${s.cal != null ? ` · ${fmtInt(s.cal)} cal` : ''} each`;
      if (!$('#f-std').dataset.dirty) $('#f-std').value = s.std ?? '';
      if (!$('#f-cal').dataset.dirty) $('#f-cal').value = s.cal ?? '';
    };
    ozMain.addEventListener('input', sync);
    sync();
  }
  $('#f-std').addEventListener('input', (ev) => { ev.target.dataset.dirty = '1'; });
  $('#f-cal').addEventListener('input', (ev) => { ev.target.dataset.dirty = '1'; });
  $('#do-log').addEventListener('click', (ev) => {
    if (ev.currentTarget.disabled) return;
    ev.currentTarget.disabled = true;
    const qty = parseInt($('#f-qty').textContent, 10) || 1;
    const pick = $('#when-seg .on').dataset.when === 'pick';
    const at = pick ? fromLocalInput($('#f-at').value) : Date.now();
    const variant = $('#variant-seg .on') ? $('#variant-seg .on').dataset.variant : null;
    const e = addEntry(p, {
      qty, at,
      oz: ozMain ? num(ozMain.value) : num($('#f-oz').value),
      std: num($('#f-std').value),
      cal: num($('#f-cal').value),
      note: $('#f-note').value,
      name: variant ? `${variant} ${p.name}` : undefined,
      ing: variant ? [variant] : undefined
    });
    closeSheet();
    toast(`Logged ${qty > 1 ? qty + '× ' : ''}${e.name}`, () => { deleteEntry(e.id); render(current); });
    render(current);
  });
}

/* ---------- Entry sheet (history — edits affect only this entry) ---------- */
function openEntrySheet(en) {
  openSheet(`
    <div class="sheet-head">
      <div class="sh-emoji">${catById(en.category).emoji}</div>
      <div><h2>Edit entry</h2><div class="sub">${esc(fmtDayLabel(dayKey(en.at)))} · ${esc(fmtTime(en.at))}</div></div>
    </div>
    <div class="field"><label>Name</label><input id="f-name" type="text" value="${esc(en.name)}"></div>
    <div class="field"><label>Type</label>
      <div class="select-wrap"><select id="f-cat">
        ${CATEGORIES.map((c) => `<option value="${c.id}"${en.category === c.id ? ' selected' : ''}>${c.emoji} ${c.label}</option>`).join('')}
      </select></div>
    </div>
    <div class="frow">
      <div class="field" style="flex:0 0 auto"><label>How many</label>
        <div class="stepper"><button type="button" data-step="-1">−</button><span class="qv" id="f-qty">${en.qty || 1}</span><button type="button" data-step="1">+</button></div>
      </div>
      <div class="field"><label>When</label><input type="datetime-local" id="f-at" value="${toLocalInput(en.at)}"></div>
    </div>
    <div class="frow">
      <div class="field"><label>Std drinks</label><input id="f-std" type="number" step="0.1" min="0" inputmode="decimal" value="${en.std ?? ''}"></div>
      <div class="field"><label>Ounces</label><input id="f-oz" type="number" step="0.5" min="0" inputmode="decimal" value="${en.oz ?? ''}"></div>
      <div class="field"><label>Calories</label><input id="f-cal" type="number" step="1" min="0" inputmode="numeric" value="${en.cal ?? ''}"></div>
    </div>
    <div class="field"><label>Note</label><input id="f-note" type="text" value="${esc(en.note || '')}" placeholder="Optional note"></div>
    <div class="note-cap">Edits apply only to this entry — the saved drink profile is unchanged.</div>
    <button class="btn" id="e-save">Save changes</button>
    <div class="sheet-actions">
      <button class="btn ghost" id="e-again">Log again now</button>
      <button class="btn danger" id="e-del">Delete</button>
    </div>
  `);
  $('#e-save').addEventListener('click', () => {
    updateEntry(en.id, {
      name: $('#f-name').value.trim() || en.name,
      category: catById($('#f-cat').value).id,
      qty: parseInt($('#f-qty').textContent, 10) || 1,
      at: $('#f-at').value ? fromLocalInput($('#f-at').value) : en.at,
      std: num($('#f-std').value),
      oz: num($('#f-oz').value),
      cal: num($('#f-cal').value),
      note: $('#f-note').value.trim()
    });
    closeSheet();
    toast('Entry updated');
    render(current);
  });
  $('#e-again').addEventListener('click', (ev) => {
    if (ev.currentTarget.disabled) return;
    ev.currentTarget.disabled = true;
    duplicateEntryNow(en);
    closeSheet();
    toast(`Logged ${en.name}`);
    render(current);
  });
  $('#e-del').addEventListener('click', () => {
    if (confirm(`Delete this ${en.name} entry?`)) {
      deleteEntry(en.id);
      closeSheet();
      toast('Entry deleted');
      render(current);
    }
  });
}

/* ---------- Profile sheet (create / edit the saved drink) ---------- */
function openProfileSheet(p, prefillName) {
  const isNew = !p;
  openSheet(`
    <h2 style="margin-bottom:2px">${isNew ? 'New drink' : 'Edit drink'}</h2>
    <div class="sub" style="margin-bottom:8px">${isNew
      ? 'Saved to your drinks so you can log it again anytime.'
      : 'Changes apply to future logs — past entries keep their values.'}</div>
    <div class="field"><label>Name</label><input id="p-name" type="text" value="${esc(isNew ? (prefillName || '') : p.name)}" placeholder="e.g. House Margarita"></div>
    <div class="field"><label>Type</label>
      <div class="select-wrap"><select id="p-cat">
        ${CATEGORIES.map((c) => `<option value="${c.id}"${(isNew ? 'other' : p.category) === c.id ? ' selected' : ''}>${c.emoji} ${c.label}</option>`).join('')}
      </select></div>
    </div>
    <div class="field"><label>Description</label><input id="p-desc" type="text" value="${esc(isNew ? '' : (p.desc || ''))}" placeholder="Optional — brand, size, recipe…"></div>
    <div class="field"><label>Ingredients</label><input id="p-ing" type="text" value="${esc(isNew ? '' : (p.ing || []).join(', '))}" placeholder="For mixed drinks — e.g. Vodka, Lemonade"></div>
    <div class="frow">
      <div class="field"><label>Std drinks</label><input id="p-std" type="number" step="0.1" min="0" inputmode="decimal" value="${isNew ? '1' : (p.std ?? '')}"></div>
      <div class="field"><label>Ounces</label><input id="p-oz" type="number" step="0.5" min="0" inputmode="decimal" value="${isNew ? '' : (p.oz ?? '')}"></div>
    </div>
    <div class="frow">
      <div class="field"><label>Calories</label><input id="p-cal" type="number" step="1" min="0" inputmode="numeric" value="${isNew ? '' : (p.cal ?? '')}"></div>
      <div class="field"><label>ABV %</label><input id="p-abv" type="number" step="0.1" min="0" inputmode="decimal" value="${isNew ? '' : (p.abv ?? '')}"></div>
    </div>
    <button class="link-btn" id="p-calc" type="button">Calculate std drinks from oz × ABV</button>
    <div class="hint">Std drinks & calories describe one serving of the ounces above — logging a different pour scales them automatically (except shots & bombs).</div>
    <button class="btn" id="p-save">${isNew ? 'Save drink' : 'Save changes'}</button>
    ${isNew ? '' : '<button class="btn danger" id="p-del">Delete drink</button>'}
  `);
  $('#p-calc').addEventListener('click', () => {
    const oz = num($('#p-oz').value), abv = num($('#p-abv').value);
    if (oz && abv) {
      $('#p-std').value = String(Math.round((oz * abv / 100 / 0.6) * 10) / 10);
    } else {
      toast('Enter ounces and ABV first');
    }
  });
  $('#p-save').addEventListener('click', () => {
    const data = {
      name: $('#p-name').value.trim(),
      category: $('#p-cat').value,
      desc: $('#p-desc').value,
      ing: $('#p-ing').value.split(',').map((s) => s.trim()).filter(Boolean),
      std: num($('#p-std').value),
      oz: num($('#p-oz').value),
      cal: num($('#p-cal').value),
      abv: num($('#p-abv').value)
    };
    if (!data.name) { toast('Give the drink a name'); return; }
    if (isNew) {
      const newP = createProfile(data);
      render(current);
      openLogSheet(newP); // straight into logging it
    } else {
      updateProfile(p.id, data);
      closeSheet();
      toast('Drink updated');
      render(current);
    }
  });
  if (!isNew) {
    $('#p-del').addEventListener('click', () => {
      if (confirm(`Delete “${p.name}”? Entries already in your history are kept.`)) {
        deleteProfile(p.id);
        closeSheet();
        toast('Drink deleted');
        render(current);
      }
    });
  }
}

/* ---------- Settings sheet ---------- */
function openSettingsSheet() {
  openSheet(`
    <h2 style="margin-bottom:10px">Settings</h2>
    <button class="set-row" id="s-export"><span class="sr-i">📤</span> Export data backup</button>
    <button class="set-row" id="s-import"><span class="sr-i">📥</span> Import backup</button>
    <button class="set-row" id="s-seed"><span class="sr-i">🍺</span> Add common drinks</button>
    <button class="set-row danger" id="s-erase"><span class="sr-i">🗑️</span> Erase all data</button>
    <div class="about">
      All data lives on this device only — nothing is uploaded anywhere.
      Export a backup before deleting the app or switching phones.<br><br>
      1 standard drink = 14 g of alcohol: a 12 oz beer at 5%, a 5 oz glass of wine, or a 1.5 oz shot of 80-proof spirits.
    </div>
  `);
  $('#s-export').addEventListener('click', doExport);
  $('#s-import').addEventListener('click', () => $('#file-import').click());
  $('#s-seed').addEventListener('click', () => {
    const n = seedStarters();
    toast(n ? `Added ${n} common drinks` : 'Common drinks already added');
    render(current);
  });
  $('#s-erase').addEventListener('click', async () => {
    if (confirm('Erase ALL drinks and history from this device?') &&
        confirm('Really erase everything? This cannot be undone.')) {
      await eraseAll();
      closeSheet();
      render(current);
      toast('All data erased');
    }
  });
}

function doExport() {
  const json = exportJSON();
  const name = `drink-tracker-backup-${dayKey(Date.now())}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'Drink Tracker backup' }).catch(() => {});
  } else {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

/* ---------- History ---------- */
function renderHistory() {
  const cont = $('#history-list');
  if (!state.entries.length) {
    cont.innerHTML =
      `<div class="empty"><div class="e-emoji">📖</div>No drinks logged yet.
        <button class="btn" data-nav="log">Log your first drink</button></div>`;
    return;
  }
  const sorted = state.entries.slice().sort((a, b) => b.at - a.at);
  const groups = [];
  for (const e of sorted) {
    const key = dayKey(e.at);
    if (!groups.length || groups[groups.length - 1].key !== key) {
      groups.push({ key, entries: [] });
    }
    groups[groups.length - 1].entries.push(e);
  }
  let html = '';
  for (const g of groups.slice(0, historyShow)) {
    const dStd = g.entries.reduce((s, e) => s + (e.std || 0) * (e.qty || 1), 0);
    const dN = g.entries.reduce((s, e) => s + (e.qty || 1), 0);
    html += `<div class="day-head"><div class="dh-t">${esc(fmtDayLabel(g.key))}</div>
      <div class="dh-s">${dN} ${dN === 1 ? 'drink' : 'drinks'} · ${fmtStd(dStd)} std</div></div>`;
    html += '<div class="card">' + g.entries.map((e) => `
      <div class="row pressable" data-entry="${esc(e.id)}">
        <div class="h-time">${esc(fmtTime(e.at))}</div>
        <div class="row-emoji" style="font-size:20px;width:26px">${catById(e.category).emoji}</div>
        <div class="row-main">
          <div class="row-title">${esc(e.name)}${(e.qty || 1) > 1 ? ` ×${e.qty}` : ''}</div>
          ${e.note ? `<div class="row-sub">${esc(e.note)}</div>` : ''}
        </div>
        <div class="h-std">${fmtStd((e.std || 0) * (e.qty || 1))} std</div>
      </div>`).join('') + '</div>';
  }
  if (groups.length > historyShow) {
    html += `<button class="show-more" data-more="1">Show earlier days</button>`;
  }
  cont.innerHTML = html;
}

/* ---------- Statistics ---------- */
let statType = 'week';
const statOffsets = { week: 0, month: 0, year: 0, all: 0 };
let selMain = -1, selWd = -1;

function renderStats() {
  const cont = $('#stats-body');
  const offset = statOffsets[statType];
  const s = periodStats(statType, offset);

  let html = `
    <div class="seg" style="margin-top:4px">
      ${[['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['all', 'All']].map(([k, l]) =>
        `<button data-pt="${k}" class="${statType === k ? 'on' : ''}">${l}</button>`).join('')}
    </div>`;
  if (statType !== 'all') {
    html += `<div class="period-nav">
      <button data-pnav="-1" aria-label="Previous period">‹</button>
      <div class="pn-label">${esc(s.label)}</div>
      <button data-pnav="1" aria-label="Next period" ${offset >= 0 ? 'disabled' : ''}>›</button>
    </div>`;
  } else {
    html += `<div class="period-nav"><div class="pn-label">${esc(s.label)}</div></div>`;
  }

  if (!state.entries.length) {
    html += `<div class="empty"><div class="e-emoji">📊</div>Log a few drinks and your statistics will appear here.</div>`;
    cont.innerHTML = html;
    return;
  }

  html += `
    <div class="tiles">
      <div class="tile"><div class="tl">Drinks</div><div class="tv">${fmtInt(s.drinks)}</div></div>
      <div class="tile"><div class="tl">Standard drinks</div><div class="tv">${fmtStd(s.std)}</div></div>
      <div class="tile"><div class="tl">Calories</div><div class="tv">${fmtInt(s.cal)}</div></div>
      <div class="tile"><div class="tl">Avg std per day</div><div class="tv">${fmtStd(s.avgPerDay)}</div></div>
    </div>
    <div class="zero-line">${s.zeroDays} drink-free ${s.zeroDays === 1 ? 'day' : 'days'} of ${s.days}</div>`;

  // Main magnitude chart — single hue per the "compare magnitude" rule
  const selB = selMain >= 0 && selMain < s.buckets.length ? s.buckets[selMain] : null;
  html += `
    <div class="chart-card">
      <h3>Standard drinks</h3><div class="ch-sub">per ${s.bucketUnit}</div>
      <div id="chart-main">${barChartSVG(s.buckets, { selected: selMain, ariaLabel: 'Standard drinks per ' + s.bucketUnit })}</div>
      <div class="chart-cap">${selB
        ? `${esc(selB.detail)} · ${fmtStd(selB.std)} std · ${selB.count} ${selB.count === 1 ? 'drink' : 'drinks'}`
        : 'Tap a bar for details'}</div>
    </div>`;

  // Category breakdown — fixed color per category
  if (s.byCat.length) {
    const useStd = s.std > 0;
    const total = useStd ? s.std : s.drinks;
    const slices = s.byCat
      .map((c) => ({ value: useStd ? c.std : c.count, colorVar: catColorVar(c.cat.id), c }))
      .filter((x) => x.value > 0);
    html += `
      <div class="chart-card">
        <h3>By drink type</h3><div class="ch-sub">share of ${useStd ? 'standard drinks' : 'drinks'}</div>
        <div class="donut-wrap">${donutSVG(slices, useStd ? fmtStd(s.std) : fmtInt(s.drinks), useStd ? 'std drinks' : 'drinks')}</div>
        <div class="legend">${s.byCat.map((c) => {
          const v = useStd ? c.std : c.count;
          const pct = total > 0 ? Math.round((v / total) * 100) : 0;
          return `<div class="leg-row">
            <span class="leg-dot" style="background:${catColorVar(c.cat.id)}"></span>
            <span class="leg-name">${c.cat.emoji} ${esc(c.cat.label)}</span>
            <span class="leg-val">${c.count} ${c.count === 1 ? 'drink' : 'drinks'} · ${fmtStd(c.std)} std · ${pct}%</span>
          </div>`;
        }).join('')}</div>
      </div>`;
  }

  // Top drinks
  if (s.byDrink.length) {
    const maxN = s.byDrink[0].count;
    html += `
      <div class="chart-card">
        <h3>Top drinks</h3><div class="ch-sub">most logged this period</div>
        ${s.byDrink.map((d, i) => `
          <div class="top-row">
            <div class="top-rank">${i + 1}</div>
            <div class="top-main">
              <div class="top-name">${catById(d.category).emoji} ${esc(d.name)}</div>
              <div class="top-meter"><i style="width:${Math.max(4, Math.round((d.count / maxN) * 100))}%"></i></div>
            </div>
            <div class="top-val">×${d.count} · ${fmtStd(d.std)} std</div>
          </div>`).join('')}
      </div>`;
  }

  // Ingredient tally across mixed drinks
  if (s.byIng.length) {
    const maxI = s.byIng[0].count;
    html += `
      <div class="chart-card">
        <h3>Ingredients</h3><div class="ch-sub">what's inside your mixed drinks</div>
        ${s.byIng.map((g) => `
          <div class="top-row">
            <div class="top-main">
              <div class="top-name">${esc(g.name)}</div>
              <div class="top-meter"><i style="width:${Math.max(4, Math.round((g.count / maxI) * 100))}%"></i></div>
            </div>
            <div class="top-val">in ×${g.count}</div>
          </div>`).join('')}
      </div>`;
  }

  // Weekly pattern (only meaningful beyond a single week)
  if (statType !== 'week' && s.days >= 14) {
    const selW = selWd >= 0 && selWd < 7 ? s.weekday[selWd] : null;
    html += `
      <div class="chart-card">
        <h3>Weekly pattern</h3><div class="ch-sub">average standard drinks by day of week</div>
        <div id="chart-wd">${barChartSVG(s.weekday, { selected: selWd, height: 150, ariaLabel: 'Average standard drinks by weekday' })}</div>
        <div class="chart-cap">${selW ? `${esc(selW.detail)} · ${fmtStd(selW.std)} std` : 'Tap a bar for details'}</div>
      </div>`;
  }

  cont.innerHTML = html;
}

/* ---------- Static event wiring ---------- */
function wire() {
  // Navigation (works for any [data-nav] anywhere)
  document.addEventListener('click', (ev) => {
    const nav = ev.target.closest('[data-nav]');
    if (nav) { show(nav.dataset.nav); return; }
  });

  $('#btn-settings').addEventListener('click', openSettingsSheet);
  $('#backdrop').addEventListener('click', closeSheet);
  $('#toast-undo').addEventListener('click', () => {
    if (toastUndo) toastUndo();
    toastUndo = null;
    $('#toast').classList.remove('show');
  });

  // Search
  $('#search').addEventListener('input', renderLog);
  $('#search').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const q = $('#search').value.trim();
    const list = searchProfiles(q);
    if (list.length) openLogSheet(list[0]);
    else if (q) openProfileSheet(null, q);
    else $('#search').blur();
  });
  $('#search-clear').addEventListener('click', () => {
    $('#search').value = '';
    renderLog();
    $('#search').focus();
  });

  // Log list actions
  $('#log-list').addEventListener('click', (ev) => {
    const quick = ev.target.closest('[data-quick]');
    if (quick) { const p = getProfile(quick.dataset.quick); if (p) quickLog(p); return; }
    const editp = ev.target.closest('[data-editp]');
    if (editp) { const p = getProfile(editp.dataset.editp); if (p) openProfileSheet(p); return; }
    const log = ev.target.closest('[data-log]');
    if (log) { const p = getProfile(log.dataset.log); if (p) openLogSheet(p); return; }
    if (ev.target.closest('[data-create]')) { openProfileSheet(null, $('#search').value.trim()); return; }
    if (ev.target.closest('[data-act="seed"]')) {
      const n = seedStarters();
      toast(`Added ${n} common drinks`);
      renderLog();
    }
  });

  // History actions
  $('#history-list').addEventListener('click', (ev) => {
    const row = ev.target.closest('[data-entry]');
    if (row) { const e = getEntry(row.dataset.entry); if (e) openEntrySheet(e); return; }
    if (ev.target.closest('[data-more]')) { historyShow += 30; renderHistory(); }
  });

  // Stats actions
  $('#stats-body').addEventListener('click', (ev) => {
    const pt = ev.target.closest('[data-pt]');
    if (pt) {
      statType = pt.dataset.pt;
      selMain = -1; selWd = -1;
      renderStats();
      return;
    }
    const pn = ev.target.closest('[data-pnav]');
    if (pn && !pn.disabled) {
      statOffsets[statType] = Math.min(0, statOffsets[statType] + parseInt(pn.dataset.pnav, 10));
      selMain = -1; selWd = -1;
      renderStats();
      return;
    }
    const barMain = ev.target.closest('#chart-main [data-i]');
    if (barMain) {
      const i = parseInt(barMain.dataset.i, 10);
      selMain = selMain === i ? -1 : i;
      renderStats();
      return;
    }
    const barWd = ev.target.closest('#chart-wd [data-i]');
    if (barWd) {
      const i = parseInt(barWd.dataset.i, 10);
      selWd = selWd === i ? -1 : i;
      renderStats();
    }
  });

  // Sheet-level delegation: steppers + when-segment (content is dynamic)
  $('#sheet').addEventListener('click', (ev) => {
    if (ev.target.closest('[data-close]')) { closeSheet(); return; }
    const varBtn = ev.target.closest('[data-variant]');
    if (varBtn) {
      varBtn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === varBtn));
      return;
    }
    const step = ev.target.closest('[data-step]');
    if (step) {
      const qv = $('#f-qty');
      if (qv) {
        const v = Math.min(20, Math.max(1, (parseInt(qv.textContent, 10) || 1) + parseInt(step.dataset.step, 10)));
        qv.textContent = String(v);
      }
      return;
    }
    const when = ev.target.closest('[data-when]');
    if (when) {
      const seg = $('#when-seg');
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === when));
      const at = $('#f-at');
      at.style.display = when.dataset.when === 'pick' ? '' : 'none';
    }
  });

  // Import file input
  $('#file-import').addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const text = await f.text();
      const data = JSON.parse(text); // validate before scary confirm
      const nE = Array.isArray(data.entries) ? data.entries.length : 0;
      if (confirm(`Replace ALL current data with this backup (${nE} entries)?`)) {
        const r = await importJSON(text);
        closeSheet();
        render(current);
        toast(`Imported ${r.entries} entries, ${r.profiles} drinks`);
      }
    } catch (err) {
      alert('Import failed: ' + (err && err.message ? err.message : 'unreadable file'));
    }
  });
}

/* ---------- Init ---------- */
(async function init() {
  await loadState();
  wire();
  show('home');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
