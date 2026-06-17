/* Dry Nights — nightly tracker with streaks and encouragement.
   All data lives in localStorage; no server. */

(function () {
  'use strict';

  // ---------- Storage ----------

  const STORE_KEY = 'bedwet.v1';
  const THEME_KEY = 'bedwet.theme';

  /** A wake-up: when it happened and how the sleeper responded.
   *  wake: 'self' (woke independently) | 'helped' (woke with help) | 'none' (did not wake) | null (not answered)
   * @typedef {{time: string|null, wake: 'self'|'helped'|'none'|null}} WakeUp */
  /** @type {{user: {name: string, createdAt: string} | null, entries: Object.<string, {status: 'wet'|'dry', wakeUps: WakeUp[]}>}} */
  let state = { user: null, entries: {} };

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          state.user = parsed.user || null;
          state.entries = parsed.entries || {};
          // Migrate v1 entries: single alarmTime -> wakeUps array.
          for (const k in state.entries) {
            const e = state.entries[k];
            if (e && !Array.isArray(e.wakeUps)) {
              e.wakeUps = e.alarmTime ? [{ time: e.alarmTime, wake: null }] : [];
              delete e.alarmTime;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Could not load saved data', e);
    }
  }

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  // ---------- Date helpers (local time) ----------

  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function daysAgo(n) {
    const d = new Date();
    d.setHours(12, 0, 0, 0); // noon avoids DST edge cases
    d.setDate(d.getDate() - n);
    return d;
  }

  function keyToDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  }

  function formatTime12(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + String(m).padStart(2, '0') + ' ' + ampm;
  }

  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // ---------- Stats ----------

  function computeStats() {
    const entries = state.entries;
    const todayKey = dateKey(daysAgo(0));

    // Current streak: walk back from today; an unlogged *today* doesn't break
    // the streak (the night isn't over), but any other gap or a wet night does.
    let current = 0;
    let i = 0;
    if (!entries[todayKey]) i = 1;
    for (; ; i++) {
      const e = entries[dateKey(daysAgo(i))];
      if (e && e.status === 'dry') current++;
      else break;
    }

    // Best streak + totals: scan from the earliest entry to today.
    let best = 0, run = 0, totalDry = 0, dry30 = 0;
    const keys = Object.keys(entries);
    if (keys.length) {
      keys.sort();
      const start = keyToDate(keys[0]);
      const end = daysAgo(0);
      const last30Cutoff = dateKey(daysAgo(29));
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const k = dateKey(d);
        const e = entries[k];
        if (e && e.status === 'dry') {
          run++;
          totalDry++;
          if (k >= last30Cutoff) dry30++;
        } else {
          run = 0;
        }
        if (run > best) best = run;
      }
    }

    return { current, best, totalDry, dry30 };
  }

  // Message pools so the feedback doesn't go stale. The pick is seeded by the
  // date + streak, so it rotates day to day but stays put within a day.
  const ENCOURAGEMENT_POOLS = {
    fresh: [
      'Log tonight to start a streak. 🌙',
      'No streak yet — tonight counts.',
    ],
    restart: [
      'A fresh start tonight. 💙',
      'Wet nights happen. Keep going.',
    ],
    one: [
      'One dry night. 🌱',
      'One dry night logged.',
    ],
    two: [
      '{n} nights in a row.',
      '{n} dry nights so far.',
    ],
    few: [
      '{n} dry nights in a row.',
      '{n} nights and counting.',
    ],
    several: [
      '{n} nights in a row.',
      '{n} dry nights so far.',
    ],
    week: [
      '{n} dry nights — over a week. 🌙',
      '{n} nights in a row.',
    ],
    fortnight: [
      '{n} dry nights — over two weeks.',
      '{n} nights in a row.',
    ],
    legend: [
      '{n} dry nights — over a month. 🌙',
      '{n} nights in a row.',
    ],
  };

  function pickSeeded(pool, seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return pool[h % pool.length];
  }

  function encouragementFor(stats) {
    const n = stats.current;
    let pool;
    if (n === 0) pool = stats.totalDry > 0 ? ENCOURAGEMENT_POOLS.restart : ENCOURAGEMENT_POOLS.fresh;
    else if (n === 1) pool = ENCOURAGEMENT_POOLS.one;
    else if (n < 3) pool = ENCOURAGEMENT_POOLS.two;
    else if (n < 5) pool = ENCOURAGEMENT_POOLS.few;
    else if (n < 7) pool = ENCOURAGEMENT_POOLS.several;
    else if (n < 14) pool = ENCOURAGEMENT_POOLS.week;
    else if (n < 30) pool = ENCOURAGEMENT_POOLS.fortnight;
    else pool = ENCOURAGEMENT_POOLS.legend;
    const msg = pickSeeded(pool, dateKey(daysAgo(0)) + ':' + n);
    return msg.replace('{n}', n);
  }

  function renderStats() {
    const stats = computeStats();
    document.getElementById('current-streak').textContent = stats.current;
    document.getElementById('best-streak').textContent = stats.best;
    document.getElementById('dry-30').textContent = stats.dry30;
    document.getElementById('total-dry').textContent = stats.totalDry;
    document.getElementById('encouragement').textContent = encouragementFor(stats);
    document.getElementById('streak-flame').classList.toggle('dim', stats.current === 0);
    document.getElementById('greeting').textContent =
      state.user ? 'Hi, ' + state.user.name : 'Hi';
  }

  // ---------- Day list ----------

  const dayList = document.getElementById('day-list');
  const PAGE_SIZE = 30;
  let daysLoaded = 0;
  let allLoaded = false;

  // The list starts at the user's day one (signup date, or earliest entry if
  // somehow older) — no endless scroll into dates before they started.
  function dayOneKey() {
    let k = state.user ? dateKey(new Date(state.user.createdAt)) : dateKey(daysAgo(0));
    for (const ek in state.entries) if (ek < k) k = ek;
    return k;
  }

  function dayRow(offset) {
    const d = daysAgo(offset);
    const key = dateKey(d);
    const entry = state.entries[key];

    const btn = document.createElement('button');
    btn.className = 'day-row' + (offset === 0 ? ' today' : '');
    btn.dataset.key = key;

    const name = offset === 0 ? 'Today'
      : offset === 1 ? 'Yesterday'
      : WEEKDAYS[d.getDay()];
    const sub = MONTHS[d.getMonth()] + ' ' + d.getDate();

    // Each wake-up renders as "time icon" (either part optional): ⏰ 2:30 AM 🙋 · 4:15 AM 😴
    const times = (entry && entry.wakeUps ? entry.wakeUps : [])
      .map((w) => [formatTime12(w.time), WAKE_ICONS[w.wake]].filter(Boolean).join(' '))
      .filter(Boolean);

    btn.innerHTML =
      '<div class="day-date">' +
        '<div class="day-name">' + name + '</div>' +
        '<div class="day-sub">' + sub + '</div>' +
      '</div>' +
      (times.length ? '<div class="day-alarm">⏰ ' + times.join(' · ') + '</div>' : '') +
      (entry
        ? '<span class="badge ' + entry.status + '">' + (entry.status === 'dry' ? '☀️ Dry' : '💧 Wet') + '</span>'
        : '<span class="badge none">＋ Log</span>');

    btn.addEventListener('click', () => openEditor(key));
    return btn;
  }

  function appendDays() {
    if (allLoaded) return false;
    const startKey = dayOneKey();
    const frag = document.createDocumentFragment();
    const end = daysLoaded + PAGE_SIZE;
    let i = daysLoaded;
    for (; i < end; i++) {
      const d = daysAgo(i);
      if (dateKey(d) < startKey) { allLoaded = true; break; }
      // Month header at today and at every month boundary while scrolling back.
      if (i === 0 || d.getMonth() !== daysAgo(i - 1).getMonth()) {
        const h = document.createElement('div');
        h.className = 'month-header';
        h.textContent = MONTHS[d.getMonth()] + ' ' + d.getFullYear();
        frag.appendChild(h);
      }
      frag.appendChild(dayRow(i));
    }
    if (allLoaded) {
      const cap = document.createElement('div');
      cap.className = 'day-one-cap';
      cap.textContent = '🌱 Day one';
      frag.appendChild(cap);
    }
    daysLoaded = i;
    dayList.appendChild(frag);
    return true;
  }

  function refreshList() {
    const count = daysLoaded;
    daysLoaded = 0;
    allLoaded = false;
    dayList.innerHTML = '';
    while (daysLoaded < count && appendDays()) { /* re-render loaded pages */ }
  }

  // Infinite scroll
  const sentinel = document.getElementById('load-sentinel');
  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) appendDays();
  }, { rootMargin: '600px' }).observe(sentinel);

  // ---------- Editor sheet ----------

  const editorBackdrop = document.getElementById('editor-backdrop');
  const btnDry = document.getElementById('btn-dry');
  const btnWet = document.getElementById('btn-wet');
  const wakeupList = document.getElementById('wakeup-list');
  let editingKey = null;
  let editingStatus = null;
  /** @type {WakeUp[]} */
  let editingWakeUps = [];

  const WAKE_ICONS = { self: '🙋', helped: '🤝', none: '😴' };

  const WAKE_OPTIONS = [
    ['self', '🙋 Woke independently'],
    ['helped', '🤝 Woke with help'],
    ['none', '😴 Did not wake'],
  ];

  function renderWakeUps() {
    wakeupList.innerHTML = '';
    if (!editingWakeUps.length) {
      const hint = document.createElement('p');
      hint.className = 'wakeup-empty';
      hint.textContent = 'No wake-ups logged. Tap ＋ Add to record one.';
      wakeupList.appendChild(hint);
      return;
    }
    editingWakeUps.forEach((w, i) => {
      const row = document.createElement('div');
      row.className = 'wakeup-row';

      const top = document.createElement('div');
      top.className = 'wakeup-top';
      const clock = document.createElement('span');
      clock.className = 'wakeup-clock';
      clock.textContent = '⏰';
      const time = document.createElement('input');
      time.type = 'time';
      // Show 11 PM as a visual hint, but don't record it until the user
      // actually picks a time (placeholder, not saved data).
      time.value = w.time || '23:00';
      time.classList.toggle('is-placeholder', !w.time);
      time.addEventListener('input', () => {
        w.time = time.value || null;
        time.classList.toggle('is-placeholder', !w.time);
      });
      const remove = document.createElement('button');
      remove.className = 'wakeup-remove';
      remove.setAttribute('aria-label', 'Remove this wake-up');
      remove.textContent = '✕';
      remove.addEventListener('click', () => {
        editingWakeUps.splice(i, 1);
        renderWakeUps();
      });
      top.append(clock, time, remove);

      const radios = document.createElement('div');
      radios.className = 'wakeup-radios';
      WAKE_OPTIONS.forEach(([value, label]) => {
        const lab = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'wake-' + i;
        input.value = value;
        input.checked = w.wake === value;
        input.addEventListener('change', () => { w.wake = value; });
        lab.append(input, document.createTextNode(' ' + label));
        radios.appendChild(lab);
      });

      row.append(top, radios);
      wakeupList.appendChild(row);
    });
  }

  document.getElementById('btn-add-wakeup').addEventListener('click', () => {
    editingWakeUps.push({ time: null, wake: null });
    renderWakeUps();
  });

  function openEditor(key) {
    editingKey = key;
    const d = keyToDate(key);
    const todayKey = dateKey(daysAgo(0));
    const label = key === todayKey ? 'Today'
      : key === dateKey(daysAgo(1)) ? 'Yesterday'
      : WEEKDAYS[d.getDay()];
    document.getElementById('editor-date').textContent =
      label + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();

    const entry = state.entries[key];
    editingStatus = entry ? entry.status : null;
    editingWakeUps = (entry && entry.wakeUps ? entry.wakeUps : [])
      .map((w) => ({ time: w.time || null, wake: w.wake || null }));
    renderWakeUps();
    syncStatusButtons();
    editorBackdrop.classList.remove('hidden');
  }

  function closeEditor() {
    editorBackdrop.classList.add('hidden');
    editingKey = null;
  }

  function syncStatusButtons() {
    btnDry.classList.toggle('selected', editingStatus === 'dry');
    btnWet.classList.toggle('selected', editingStatus === 'wet');
  }

  btnDry.addEventListener('click', () => { editingStatus = 'dry'; syncStatusButtons(); });
  btnWet.addEventListener('click', () => { editingStatus = 'wet'; syncStatusButtons(); });

  const DRY_TOASTS = [
    'Dry night logged. ☀️',
    'Saved.',
  ];
  const DRY_STREAK_TOASTS = [
    '{n} dry nights in a row.',
    'Saved — streak at {n}.',
  ];
  const WET_TOASTS = [
    'Logged. 💙',
    'Saved.',
  ];

  function randomFrom(pool) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  document.getElementById('btn-save').addEventListener('click', () => {
    if (!editingKey) return;
    if (!editingStatus) {
      showToast('Pick Dry or Wet first 🙂');
      return;
    }
    state.entries[editingKey] = {
      status: editingStatus,
      wakeUps: editingWakeUps
        .filter((w) => w.time || w.wake)
        .map((w) => ({ time: w.time || null, wake: w.wake || null })),
    };
    save();
    closeEditor();
    refreshList();
    renderStats();
    if (editingStatus === 'dry') {
      const stats = computeStats();
      showToast(stats.current > 1
        ? randomFrom(DRY_STREAK_TOASTS).replace('{n}', stats.current)
        : randomFrom(DRY_TOASTS));
    } else {
      showToast(randomFrom(WET_TOASTS));
    }
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (editingKey && state.entries[editingKey]) {
      delete state.entries[editingKey];
      save();
    }
    closeEditor();
    refreshList();
    renderStats();
  });

  editorBackdrop.addEventListener('click', (e) => {
    if (e.target === editorBackdrop) closeEditor();
  });

  // ---------- Onboarding ----------

  const onboardBackdrop = document.getElementById('onboard-backdrop');

  function maybeOnboard() {
    if (state.user) return;
    onboardBackdrop.classList.remove('hidden');
    document.getElementById('onboard-name').focus();
  }

  function finishOnboard() {
    const name = document.getElementById('onboard-name').value.trim();
    state.user = {
      name: name || 'Champ',
      createdAt: new Date().toISOString(),
    };
    save();
    onboardBackdrop.classList.add('hidden');
    renderStats();
    refreshList(); // day one is now set, so the list can cap itself
    showToast('Welcome, ' + state.user.name + '! 🌙');
  }

  document.getElementById('onboard-start').addEventListener('click', finishOnboard);
  document.getElementById('onboard-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finishOnboard();
  });

  // ---------- Reset ----------

  const resetBackdrop = document.getElementById('reset-backdrop');
  const resetInput = document.getElementById('reset-confirm');
  const resetBtn = document.getElementById('btn-reset');

  function closeReset() {
    resetBackdrop.classList.add('hidden');
    resetInput.value = '';
    resetBtn.disabled = true;
  }

  document.getElementById('reset-open').addEventListener('click', () => {
    resetBackdrop.classList.remove('hidden');
    resetInput.focus();
  });

  resetInput.addEventListener('input', () => {
    // Typing the word is the safety latch against accidental resets.
    resetBtn.disabled = resetInput.value.trim().toUpperCase() !== 'RESET';
  });

  resetBtn.addEventListener('click', () => {
    if (resetBtn.disabled) return;
    localStorage.removeItem(STORE_KEY);
    location.reload(); // boots fresh into onboarding
  });

  document.getElementById('reset-cancel').addEventListener('click', closeReset);
  resetBackdrop.addEventListener('click', (e) => {
    if (e.target === resetBackdrop) closeReset();
  });

  // ---------- Theme ----------

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
  });

  // ---------- Toast ----------

  const toast = document.getElementById('toast');
  let toastTimer = null;

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 2600);
  }

  // ---------- Service worker ----------

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
    });
  }

  // ---------- Init ----------

  load();
  renderStats();
  appendDays();
  maybeOnboard();
})();
