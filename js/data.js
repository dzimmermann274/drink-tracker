/* Drink Tracker — data layer: persistence, model, stats. */
'use strict';

/* ---------- Categories (fixed order = fixed chart color slots) ---------- */
const CATEGORIES = [
  { id: 'beer',     label: 'Beer',     emoji: '🍺', slot: 1 },
  { id: 'wine',     label: 'Wine',     emoji: '🍷', slot: 2 },
  { id: 'cocktail', label: 'Cocktail', emoji: '🍸', slot: 3 },
  { id: 'spirits',  label: 'Spirits',  emoji: '🥃', slot: 4 },
  { id: 'seltzer',  label: 'Seltzer',  emoji: '🫧', slot: 5 },
  { id: 'cider',    label: 'Cider',    emoji: '🍏', slot: 6 },
  { id: 'bomb',     label: 'Bomb',     emoji: '💣', slot: 8 },
  { id: 'other',    label: 'Other',    emoji: '🍹', slot: 7 }
];
function catById(id) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

const STARTER_PROFILES = [
  { name: 'Coors Light',       category: 'beer',     std: 0.8, oz: 12,  cal: 102, abv: 4.2,  desc: 'Facts per 12 oz — other pours scale' },
  { name: 'Miller Lite',       category: 'beer',     std: 0.8, oz: 12,  cal: 96,  abv: 4.2,  desc: 'Facts per 12 oz' },
  { name: 'Yuengling',         category: 'beer',     std: 0.9, oz: 12,  cal: 141, abv: 4.5,  desc: 'Traditional Lager — facts per 12 oz' },
  { name: 'Miller High Life',  category: 'beer',     std: 0.9, oz: 12,  cal: 141, abv: 4.6,  desc: 'Facts per 12 oz' },
  { name: 'Guinness',          category: 'beer',     std: 0.8, oz: 12,  cal: 125, abv: 4.2,  desc: 'Draught — facts per 12 oz' },
  { name: 'Red Wine',          category: 'wine',     std: 1.1, oz: 5,   cal: 125, abv: 13,   desc: '5 oz glass — other pours scale' },
  { name: 'White Wine',        category: 'wine',     std: 1,   oz: 5,   cal: 120, abv: 12,   desc: '5 oz glass — other pours scale' },
  { name: 'Vegas Bomb',        category: 'bomb',     std: 0.7, oz: 5,   cal: 160, abv: null, desc: 'Crown & peach schnapps dropped in Red Bull',
    ing: ['Crown Royal', 'Peach schnapps', 'Red Bull', 'Cranberry juice'] },
  { name: 'Vodka Lemonade',    category: 'cocktail', std: 1,   oz: 8,   cal: 190, abv: null, desc: 'Single — 1.5 oz vodka + lemonade',
    ing: ['Vodka', 'Lemonade'] },
  { name: 'Shot',              category: 'spirits',  std: 1,   oz: 1.5, cal: 100, abv: 40,   desc: '1.5 oz — pick the liquor when logging',
    variants: ['Vodka', 'Tequila', 'Whiskey', 'Rum', 'Gin'] },
  { name: 'Jägermeister Shot', category: 'spirits',  std: 0.9, oz: 1.5, cal: 155, abv: 35,   desc: '1.5 oz shot',
    ing: ['Jägermeister'] },
  { name: 'Surfside',          category: 'seltzer',  std: 0.9, oz: 12,  cal: 100, abv: 4.5,  desc: 'Iced Tea + Vodka, 12 oz can',
    ing: ['Vodka', 'Iced tea'] },
  { name: 'High Noon',         category: 'seltzer',  std: 0.9, oz: 12,  cal: 100, abv: 4.5,  desc: '12 oz can',
    ing: ['Vodka', 'Seltzer', 'Fruit juice'] }
];

/* v1 starter names — replaced by the list above via a one-time migration */
const OLD_STARTER_NAMES = ['Beer', 'Light Beer', 'IPA', 'Red Wine', 'White Wine', 'Cocktail', 'Shot', 'Hard Seltzer'];

/* Shots and bombs are fixed servings; everything else scales by ounces poured. */
function isFixedServing(p) {
  return p.category === 'spirits' || p.category === 'bomb';
}
function scaledForOz(profile, oz) {
  const base = profile.oz;
  if (!base || !oz) return { std: profile.std, cal: profile.cal };
  const f = oz / base;
  return {
    std: profile.std == null ? null : Math.round(profile.std * f * 10) / 10,
    cal: profile.cal == null ? null : Math.round(profile.cal * f)
  };
}

/* ---------- Persistence: IndexedDB primary, localStorage mirror ---------- */
const DB_NAME = 'drink-tracker';
const DB_STORE = 'kv';
const STATE_KEY = 'drink-tracker-state';

let state = null;

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function blankState() {
  return { v: 1, profiles: [], entries: [], settings: {} };
}

function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      () => { clearTimeout(t); resolve(undefined); }
    );
  });
}

async function loadState() {
  // iOS WebKit can hang indexedDB.open() on a cold PWA launch — never block boot on it.
  const idb = (await withTimeout(idbGet(STATE_KEY), 1500)) || null;
  let mirror = null;
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) mirror = JSON.parse(raw);
  } catch (e) { /* corrupted mirror */ }
  // The two copies can disagree when an IndexedDB write never committed before
  // iOS suspended the app — keep whichever was saved last.
  if (idb && mirror) {
    state = (mirror.savedAt || 0) > (idb.savedAt || 0) ? mirror : idb;
  } else {
    state = idb || mirror;
  }
  if (!state || !Array.isArray(state.profiles) || !Array.isArray(state.entries)) {
    state = blankState();
  }
  if (!state.settings) state.settings = {};
  migrateStartersV2();
  return state;
}

/* One-time: swap v1 starter profiles for the v2 list (history keeps its snapshots). */
function migrateStartersV2() {
  if (state.settings.starterV2) return;
  state.settings.starterV2 = true;
  const had = state.profiles.some((p) => OLD_STARTER_NAMES.includes(p.name));
  if (had) {
    state.profiles = state.profiles.filter((p) => !OLD_STARTER_NAMES.includes(p.name));
    seedStarters();
  }
  saveState();
}

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushState, 150);
}
async function flushState() {
  clearTimeout(saveTimer);
  saveTimer = null;
  state.savedAt = Date.now();
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
  try { await idbSet(STATE_KEY, state); } catch (e) { /* idb unavailable */ }
}
window.addEventListener('pagehide', () => { if (saveTimer) flushState(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && saveTimer) flushState();
});

function requestPersistence() {
  if (state.settings.persistAsked) return;
  state.settings.persistAsked = true;
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  } catch (e) { /* not supported */ }
}

/* ---------- Small helpers ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function num(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtStd(n) {
  const r = Math.round((n || 0) * 10) / 10;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}
function fmtInt(n) {
  return Math.round(n || 0).toLocaleString();
}

/* ---------- Profiles ---------- */
function getProfile(id) {
  return state.profiles.find((p) => p.id === id) || null;
}
function createProfile(data) {
  const now = Date.now();
  const p = {
    id: uid(),
    name: String(data.name || '').trim() || 'Drink',
    category: catById(data.category).id,
    desc: String(data.desc || '').trim(),
    std: data.std ?? 1,
    oz: data.oz ?? null,
    cal: data.cal ?? null,
    abv: data.abv ?? null,
    ing: Array.isArray(data.ing) ? data.ing.map((s) => String(s).trim()).filter(Boolean) : [],
    variants: Array.isArray(data.variants) && data.variants.length ? data.variants.map(String) : null,
    createdAt: now,
    updatedAt: now
  };
  state.profiles.push(p);
  saveState();
  return p;
}
function updateProfile(id, patch) {
  const p = getProfile(id);
  if (!p) return null;
  Object.assign(p, patch, { updatedAt: Date.now() });
  saveState();
  return p;
}
function deleteProfile(id) {
  state.profiles = state.profiles.filter((p) => p.id !== id);
  saveState();
}
function seedStarters() {
  const have = new Set(state.profiles.map((p) => p.name.toLowerCase()));
  let added = 0;
  for (const s of STARTER_PROFILES) {
    if (!have.has(s.name.toLowerCase())) { createProfile(s); added++; }
  }
  return added;
}

/* Usage ranking: how often each profile was logged in the last 90 days. */
function usageMap() {
  const cutoff = Date.now() - 90 * 864e5;
  const m = new Map();
  for (const e of state.entries) {
    const u = m.get(e.profileId) || { n: 0, last: 0 };
    if (e.at >= cutoff) u.n += e.qty || 1;
    if (e.at > u.last) u.last = e.at;
    m.set(e.profileId, u);
  }
  return m;
}
function searchProfiles(q) {
  const s = String(q || '').trim().toLowerCase();
  let list = state.profiles.slice();
  if (s) {
    list = list.filter((p) =>
      p.name.toLowerCase().includes(s) || (p.desc || '').toLowerCase().includes(s)
    );
  }
  const use = usageMap();
  list.sort((a, b) => {
    const ua = use.get(a.id) || { n: 0, last: 0 };
    const ub = use.get(b.id) || { n: 0, last: 0 };
    return (ub.n - ua.n) || (ub.last - ua.last) || a.name.localeCompare(b.name);
  });
  return list;
}

/* ---------- Entries (each carries a full snapshot of drink properties) ---------- */
function getEntry(id) {
  return state.entries.find((e) => e.id === id) || null;
}
function addEntry(profile, opts = {}) {
  const now = Date.now();
  const e = {
    id: uid(),
    profileId: profile.id,
    at: opts.at ?? now,
    qty: Math.max(1, Math.round(opts.qty ?? 1)),
    name: (opts.name ?? profile.name) || 'Drink',
    category: profile.category,
    std: opts.std !== undefined ? opts.std : profile.std,
    oz: opts.oz !== undefined ? opts.oz : profile.oz,
    cal: opts.cal !== undefined ? opts.cal : profile.cal,
    ing: Array.isArray(opts.ing) ? opts.ing : (Array.isArray(profile.ing) ? profile.ing.slice() : []),
    note: String(opts.note ?? '').trim(),
    createdAt: now,
    updatedAt: now
  };
  state.entries.push(e);
  saveState();
  requestPersistence();
  return e;
}
function duplicateEntryNow(entry) {
  const now = Date.now();
  const e = Object.assign({}, entry, { id: uid(), at: now, createdAt: now, updatedAt: now });
  state.entries.push(e);
  saveState();
  return e;
}
function updateEntry(id, patch) {
  const e = getEntry(id);
  if (!e) return null;
  Object.assign(e, patch, { updatedAt: Date.now() });
  saveState();
  return e;
}
function deleteEntry(id) {
  state.entries = state.entries.filter((e) => e.id !== id);
  saveState();
}

/* ---------- Dates ---------- */
const DAY = 864e5;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addDays(ms, n) { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); }
function startOfWeek(ms) {
  const d = new Date(startOfDay(ms));
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}
function dayKey(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function fmtShortDate(ms) {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
function fmtDayLabel(key) {
  const today = dayKey(Date.now());
  const yesterday = dayKey(addDays(Date.now(), -1));
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = WEEKDAYS[(dt.getDay() + 6) % 7];
  const label = `${wd}, ${MONTHS[m - 1]} ${d}`;
  return y === new Date().getFullYear() ? label : `${label}, ${y}`;
}
function toLocalInput(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(s) {
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

/* ---------- Periods & statistics ---------- */
function firstEntryAt() {
  let min = Infinity;
  for (const e of state.entries) if (e.at < min) min = e.at;
  return min === Infinity ? Date.now() : min;
}

function periodRange(type, offset) {
  const now = Date.now();
  if (type === 'week') {
    const start = addDays(startOfWeek(now), offset * 7);
    return { start, end: addDays(start, 7) };
  }
  if (type === 'month') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    const start = d.getTime();
    const e = new Date(start);
    e.setMonth(e.getMonth() + 1);
    return { start, end: e.getTime() };
  }
  if (type === 'year') {
    const y = new Date(now).getFullYear() + offset;
    return { start: new Date(y, 0, 1).getTime(), end: new Date(y + 1, 0, 1).getTime() };
  }
  // all time — extend past "now" if any entry is future-dated, so History and stats agree
  let last = now;
  for (const e of state.entries) if (e.at > last) last = e.at;
  return { start: startOfDay(firstEntryAt()), end: addDays(startOfDay(last), 1) };
}

function periodLabel(type, offset, range) {
  if (type === 'week') {
    if (offset === 0) return 'This week';
    if (offset === -1) return 'Last week';
    return `${fmtShortDate(range.start)} – ${fmtShortDate(addDays(range.end, -1))}`;
  }
  if (type === 'month') {
    const d = new Date(range.start);
    const label = `${['January','February','March','April','May','June','July','August','September','October','November','December'][d.getMonth()]} ${d.getFullYear()}`;
    return offset === 0 ? 'This month' : label;
  }
  if (type === 'year') {
    const y = new Date(range.start).getFullYear();
    return offset === 0 ? 'This year' : String(y);
  }
  return 'All time';
}

function entriesIn(range) {
  return state.entries.filter((e) => e.at >= range.start && e.at < range.end);
}

function periodStats(type, offset) {
  const range = periodRange(type, offset);
  const label = periodLabel(type, offset, range);
  const list = entriesIn(range);
  const now = Date.now();

  const drinks = list.reduce((s, e) => s + (e.qty || 1), 0);
  const std = list.reduce((s, e) => s + (e.std || 0) * (e.qty || 1), 0);
  const cal = list.reduce((s, e) => s + (e.cal || 0) * (e.qty || 1), 0);

  // Days elapsed within the period (don't count the future part of a current period)
  const effEnd = Math.min(range.end, addDays(startOfDay(now), 1));
  const days = Math.max(1, Math.round((effEnd - range.start) / DAY));
  const drinkDays = new Set(list.map((e) => dayKey(e.at))).size;
  const zeroDays = Math.max(0, days - drinkDays);

  // Buckets for the bar chart
  let buckets = [];
  let bucketUnit = 'day';
  if (type === 'week' || type === 'month') {
    let i = 0;
    for (let t = range.start; t < range.end; t = addDays(t, 1)) {
      const d = new Date(t);
      const label7 = WEEKDAYS[(d.getDay() + 6) % 7];
      buckets.push({
        t0: t, t1: addDays(t, 1),
        label: type === 'week' ? label7 : String(d.getDate()),
        tick: type === 'week' ? true : (d.getDate() === 1 || d.getDate() % 7 === 0),
        detail: `${fmtDayLabel(dayKey(t))}`
      });
      i++;
    }
  } else if (type === 'year') {
    bucketUnit = 'month';
    const y = new Date(range.start).getFullYear();
    for (let m = 0; m < 12; m++) {
      buckets.push({
        t0: new Date(y, m, 1).getTime(), t1: new Date(y, m + 1, 1).getTime(),
        label: MONTHS[m][0], tick: true,
        detail: `${MONTHS[m]} ${y}`
      });
    }
  } else {
    // all time: month buckets, collapse to years if too many
    bucketUnit = 'month';
    const first = new Date(range.start);
    let cursor = new Date(first.getFullYear(), first.getMonth(), 1).getTime();
    while (cursor < range.end) {
      const d = new Date(cursor);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      buckets.push({
        t0: cursor, t1: next,
        label: MONTHS[d.getMonth()],
        tick: d.getMonth() === 0 || buckets.length === 0,
        detail: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
      });
      cursor = next;
    }
    if (buckets.length > 24) {
      bucketUnit = 'year';
      buckets = [];
      const y0 = new Date(range.start).getFullYear();
      const y1 = new Date(range.end - 1).getFullYear();
      for (let y = y0; y <= y1; y++) {
        buckets.push({
          t0: new Date(y, 0, 1).getTime(), t1: new Date(y + 1, 0, 1).getTime(),
          label: String(y), tick: true, detail: String(y)
        });
      }
    }
    if (buckets.length > 0 && buckets.length <= 12) buckets.forEach((b) => { b.tick = true; });
  }
  for (const b of buckets) {
    b.std = 0; b.count = 0;
    for (const e of list) {
      if (e.at >= b.t0 && e.at < b.t1) {
        b.std += (e.std || 0) * (e.qty || 1);
        b.count += e.qty || 1;
      }
    }
  }

  // Breakdown by category (fixed order = fixed colors)
  const byCat = [];
  for (const c of CATEGORIES) {
    let cStd = 0, cCount = 0;
    for (const e of list) {
      if ((e.category || 'other') === c.id) {
        cStd += (e.std || 0) * (e.qty || 1);
        cCount += e.qty || 1;
      }
    }
    if (cCount > 0) byCat.push({ cat: c, std: cStd, count: cCount });
  }
  byCat.sort((a, b) => (b.std - a.std) || (b.count - a.count));

  // Top drinks
  const byDrinkMap = new Map();
  for (const e of list) {
    const key = e.profileId || e.name;
    const d = byDrinkMap.get(key) || { name: e.name, category: e.category, count: 0, std: 0 };
    d.count += e.qty || 1;
    d.std += (e.std || 0) * (e.qty || 1);
    byDrinkMap.set(key, d);
  }
  // Label a group by its profile's current name; a rename of one entry stays per-entry
  for (const [key, d] of byDrinkMap) {
    const p = getProfile(key);
    if (p) d.name = p.name;
  }
  const byDrink = [...byDrinkMap.values()].sort((a, b) => (b.count - a.count) || (b.std - a.std)).slice(0, 5);

  // Ingredient tally across mixed drinks (an ingredient counts once per drink containing it)
  const byIngMap = new Map();
  for (const e of list) {
    for (const raw of (e.ing || [])) {
      const name = String(raw).trim();
      if (!name) continue;
      const k = name.toLowerCase();
      const d = byIngMap.get(k) || { name, count: 0, std: 0 };
      d.count += e.qty || 1;
      d.std += (e.std || 0) * (e.qty || 1);
      byIngMap.set(k, d);
    }
  }
  const byIng = [...byIngMap.values()].sort((a, b) => (b.count - a.count) || (b.std - a.std)).slice(0, 8);

  // Weekday pattern (avg std per weekday over elapsed days)
  const wdTotals = new Array(7).fill(0);
  const wdDays = new Array(7).fill(0);
  for (let t = range.start; t < effEnd; t = addDays(t, 1)) {
    wdDays[(new Date(t).getDay() + 6) % 7]++;
  }
  for (const e of list) {
    if (e.at < effEnd) wdTotals[(new Date(e.at).getDay() + 6) % 7] += (e.std || 0) * (e.qty || 1);
  }
  const weekday = WEEKDAYS.map((w, i) => ({
    label: w[0], tick: true,
    detail: `${w} average`,
    std: wdDays[i] ? wdTotals[i] / wdDays[i] : 0,
    count: wdDays[i]
  }));

  return {
    range, label, list, drinks, std, cal, days, zeroDays, drinkDays,
    avgPerDay: std / days, buckets, bucketUnit, byCat, byDrink, byIng, weekday
  };
}

/* ---------- Export / import ---------- */
function exportJSON() {
  return JSON.stringify({
    app: 'drink-tracker',
    v: 1,
    exportedAt: new Date().toISOString(),
    profiles: state.profiles,
    entries: state.entries,
    settings: state.settings
  }, null, 2);
}
async function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.profiles) || !Array.isArray(data.entries)) {
    throw new Error('Not a Drink Tracker backup file');
  }
  const cleanProfile = (p) => ({
    id: String(p.id || uid()),
    name: String(p.name || 'Drink'),
    category: catById(p.category).id,
    desc: String(p.desc || ''),
    std: num(p.std),
    oz: num(p.oz),
    cal: num(p.cal),
    abv: num(p.abv),
    ing: Array.isArray(p.ing) ? p.ing.map((s) => String(s).trim()).filter(Boolean) : [],
    variants: Array.isArray(p.variants) && p.variants.length ? p.variants.map(String) : null,
    createdAt: Number(p.createdAt) || Date.now(),
    updatedAt: Number(p.updatedAt) || Date.now()
  });
  const cleanEntry = (e) => ({
    id: String(e.id || uid()),
    profileId: e.profileId ? String(e.profileId) : null,
    at: Number(e.at) || Date.now(),
    qty: Math.max(1, Math.round(Number(e.qty) || 1)),
    name: String(e.name || 'Drink'),
    category: catById(e.category).id,
    std: num(e.std),
    oz: num(e.oz),
    cal: num(e.cal),
    ing: Array.isArray(e.ing) ? e.ing.map((s) => String(s).trim()).filter(Boolean) : [],
    note: String(e.note || ''),
    createdAt: Number(e.createdAt) || Date.now(),
    updatedAt: Number(e.updatedAt) || Date.now()
  });
  state = {
    v: 1,
    profiles: data.profiles.map(cleanProfile),
    entries: data.entries.map(cleanEntry),
    settings: (data.settings && typeof data.settings === 'object') ? data.settings : {}
  };
  await flushState();
  return { profiles: state.profiles.length, entries: state.entries.length };
}
async function eraseAll() {
  state = blankState();
  await flushState();
}
