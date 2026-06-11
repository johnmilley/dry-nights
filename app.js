/* Dry Nights — nightly tracker with streaks and encouragement.
   All data lives in localStorage; no server. */

(function () {
  'use strict';

  // ---------- Storage ----------

  const STORE_KEY = 'bedwet.v1';
  const THEME_KEY = 'bedwet.theme';

  /** @type {{user: {name: string, createdAt: string} | null, entries: Object.<string, {status: 'wet'|'dry', alarmTime: string|null}>}} */
  let state = { user: null, entries: {} };

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          state.user = parsed.user || null;
          state.entries = parsed.entries || {};
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

  function encouragementFor(stats) {
    const n = stats.current;
    if (n === 0) {
      return stats.totalDry > 0
        ? 'Every night is a fresh start. You\'ve got this! 💪'
        : 'Log tonight to start your first streak! ⭐';
    }
    if (n === 1) return 'One dry night — a streak begins! 🌱';
    if (n < 3) return n + ' nights in a row. Keep it going! 🙌';
    if (n < 5) return 'Three or more dry nights — amazing work! 🎉';
    if (n < 7) return n + ' nights strong. You\'re on fire! 🔥';
    if (n < 14) return 'A whole week (and more!) of dry nights! 🏆';
    if (n < 30) return n + ' nights! That\'s incredible dedication! 🌟';
    return n + ' nights dry. Absolutely legendary! 👑';
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
      state.user ? 'Hi, ' + state.user.name + '!' : 'Hi!';
  }

  // ---------- Day list ----------

  const dayList = document.getElementById('day-list');
  const PAGE_SIZE = 30;
  let daysLoaded = 0;

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

    const alarm = entry && entry.alarmTime ? formatTime12(entry.alarmTime) : null;

    btn.innerHTML =
      '<div class="day-date">' +
        '<div class="day-name">' + name + '</div>' +
        '<div class="day-sub">' + sub + '</div>' +
      '</div>' +
      (alarm ? '<div class="day-alarm">⏰ ' + alarm + '</div>' : '') +
      (entry
        ? '<span class="badge ' + entry.status + '">' + (entry.status === 'dry' ? '☀️ Dry' : '💧 Wet') + '</span>'
        : '<span class="badge none">＋ Log</span>');

    btn.addEventListener('click', () => openEditor(key));
    return btn;
  }

  function appendDays() {
    const frag = document.createDocumentFragment();
    const end = daysLoaded + PAGE_SIZE;
    for (let i = daysLoaded; i < end; i++) {
      const d = daysAgo(i);
      // Month header at today and at every month boundary while scrolling back.
      if (i === 0 || d.getMonth() !== daysAgo(i - 1).getMonth()) {
        const h = document.createElement('div');
        h.className = 'month-header';
        h.textContent = MONTHS[d.getMonth()] + ' ' + d.getFullYear();
        frag.appendChild(h);
      }
      frag.appendChild(dayRow(i));
    }
    daysLoaded = end;
    dayList.appendChild(frag);
  }

  function refreshList() {
    const count = daysLoaded;
    daysLoaded = 0;
    dayList.innerHTML = '';
    while (daysLoaded < count) appendDays();
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
  const alarmInput = document.getElementById('alarm-time');
  let editingKey = null;
  let editingStatus = null;

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
    alarmInput.value = entry && entry.alarmTime ? entry.alarmTime : '';
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

  document.getElementById('btn-save').addEventListener('click', () => {
    if (!editingKey) return;
    if (!editingStatus) {
      showToast('Pick Dry or Wet first 🙂');
      return;
    }
    state.entries[editingKey] = {
      status: editingStatus,
      alarmTime: alarmInput.value || null,
    };
    save();
    closeEditor();
    refreshList();
    renderStats();
    if (editingStatus === 'dry') {
      const stats = computeStats();
      showToast(stats.current > 1
        ? '🎉 ' + stats.current + ' dry nights in a row!'
        : '🎉 Dry night logged — great job!');
    } else {
      showToast('Logged. Tomorrow is a new chance 💙');
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
    showToast('Welcome, ' + state.user.name + '! 🌙');
  }

  document.getElementById('onboard-start').addEventListener('click', finishOnboard);
  document.getElementById('onboard-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finishOnboard();
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
