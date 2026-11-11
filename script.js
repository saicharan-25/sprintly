/* Sprintly – vanilla JS. Sections: helpers, theme/menu, timer, tasks, chart, form */
(() => {
  'use strict';

  // ---------- Helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    }
  };
  const dayKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // ---------- Menu and theme ----------
  const nav = $('#nav'), menuBtn = $('#menuBtn'), themeBtn = $('#themeBtn');
  menuBtn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', open);
  });
  $$('.nav a').forEach(a => a.addEventListener('click', () => {
    nav.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
  }));

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeBtn.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    themeBtn.setAttribute('aria-pressed', theme === 'dark');
  }
  const preferred = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(store.get('sprintly-theme', preferred));
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    store.set('sprintly-theme', next);
  });

  // ---------- Timer ----------
  const CIRC = 2 * Math.PI * 90;
  const timeEl = $('#time'), ring = $('#ringFg'), label = $('#timerLabel');
  const startBtn = $('#startBtn'), resetBtn = $('#resetBtn');
  const modeBtns = $$('.modes button');
  const timer = { total: 25 * 60, left: 25 * 60, mode: 'Focus', running: false, end: 0, id: null };

  function fmt(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  function paint() {
    timeEl.textContent = fmt(timer.left);
    ring.style.strokeDashoffset = CIRC * (1 - timer.left / timer.total);
    document.title = timer.running ? `${fmt(timer.left)} · ${timer.mode} – Sprintly` : 'Sprintly – Study in focused sprints';
  }
  function stop() {
    clearInterval(timer.id);
    timer.running = false;
    startBtn.textContent = 'Start';
  }
  function tick() {
    timer.left = Math.max(0, Math.round((timer.end - Date.now()) / 1000));
    if (timer.left === 0) {
      stop();
      label.textContent = `${timer.mode} finished. Nice work.`;
      if (timer.mode === 'Focus') addSprint();
      beep();
    }
    paint();
  }
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.frequency.value = 660;
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + .3);
    } catch { /* audio not available */ }
  }
  function setMode(btn) {
    stop();
    modeBtns.forEach(b => b.setAttribute('aria-selected', b === btn));
    timer.mode = btn.dataset.mode;
    timer.total = timer.left = Number(btn.dataset.min) * 60;
    label.textContent = `${timer.mode} · ready when you are`;
    paint();
  }
  startBtn.addEventListener('click', () => {
    if (timer.running) {
      stop();
      label.textContent = `${timer.mode} · paused`;
    } else {
      if (timer.left === 0) timer.left = timer.total;
      timer.running = true;
      timer.end = Date.now() + timer.left * 1000;
      timer.id = setInterval(tick, 250);
      startBtn.textContent = 'Pause';
      label.textContent = `${timer.mode} · in progress`;
    }
    paint();
  });
  resetBtn.addEventListener('click', () => {
    stop();
    timer.left = timer.total;
    label.textContent = `${timer.mode} · ready when you are`;
    paint();
  });
  modeBtns.forEach(b => b.addEventListener('click', () => setMode(b)));
  paint();

  // ---------- Tasks ----------
  const form = $('#taskForm'), input = $('#taskInput'), list = $('#taskList'), countEl = $('#taskCount');
  let tasks = store.get('sprintly-tasks', []);
  let filter = 'all';

  function renderTasks() {
    const shown = tasks.filter(t => filter === 'all' || (filter === 'done') === t.done);
    list.innerHTML = '';
    if (!shown.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = tasks.length ? 'No tasks in this filter.' : 'No tasks yet. Add your first one above.';
      list.append(li);
    }
    shown.forEach(t => {
      const li = document.createElement('li');
      li.className = 'task' + (t.done ? ' done' : '');
      li.innerHTML = '<input type="checkbox"><span></span><button class="del" type="button">Delete</button>';
      const box = $('input', li);
      box.checked = t.done;
      box.setAttribute('aria-label', `Mark done: ${t.text}`);
      $('span', li).textContent = t.text; // textContent prevents HTML injection
      box.addEventListener('change', () => { t.done = box.checked; save(); });
      $('.del', li).addEventListener('click', () => { tasks = tasks.filter(x => x.id !== t.id); save(); });
      list.append(li);
    });
    const open = tasks.filter(t => !t.done).length;
    countEl.textContent = `${open} to do · ${tasks.length - open} done`;
  }
  function save() { store.set('sprintly-tasks', tasks); renderTasks(); }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    tasks.unshift({ id: Date.now(), text, done: false });
    input.value = '';
    save();
  });
  $$('.chip').forEach(chip => chip.addEventListener('click', () => {
    filter = chip.dataset.filter;
    $$('.chip').forEach(c => c.classList.toggle('active', c === chip));
    renderTasks();
  }));
  renderTasks();

  // ---------- Weekly chart ----------
  const chart = $('#chart'), note = $('#chartNote');
  let log = store.get('sprintly-log', {});
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function addSprint() {
    const k = dayKey();
    log[k] = (log[k] || 0) + 1;
    store.set('sprintly-log', log);
    renderChart();
  }
  function renderChart() {
    const days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return { name: DAYS[d.getDay()], key: dayKey(d), n: log[dayKey(d)] || 0, today: i === 6 };
    });
    const max = Math.max(4, ...days.map(d => d.n));
    chart.innerHTML = '';
    days.forEach(d => {
      const b = document.createElement('button');
      b.className = 'bar' + (d.today ? ' today' : '');
      b.type = 'button';
      b.innerHTML = `<b>${d.n}</b><i style="height:${(d.n / max) * 75}%"></i><small>${d.name}</small>`;
      b.setAttribute('aria-label', `${d.name}: ${d.n} sprints`);
      b.addEventListener('click', () => {
        note.textContent = `${d.today ? 'Today' : d.name}: ${d.n} sprint${d.n === 1 ? '' : 's'} (${d.n * 25} minutes)`;
      });
      chart.append(b);
    });
    const total = days.reduce((s, d) => s + d.n, 0);
    note.textContent = `Total this week: ${total} sprint${total === 1 ? '' : 's'}`;
  }
  $('#logBtn').addEventListener('click', addSprint);
  $('#clearBtn').addEventListener('click', () => {
    if (confirm('Clear all logged sprints?')) {
      log = {};
      store.set('sprintly-log', log);
      renderChart();
    }
  });
  renderChart();

  // ---------- Feedback form ----------
  const cf = $('#contactForm');
  const rules = {
    name: v => v.trim().length >= 2 || 'Enter your name (at least 2 characters).',
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Enter a valid email, like name@example.com.',
    msg: v => v.trim().length >= 10 || 'Write at least 10 characters so we can act on it.'
  };
  function check(field) {
    const el = cf.elements[field];
    const result = rules[field](el.value);
    const ok = result === true;
    el.classList.toggle('invalid', !ok);
    el.setAttribute('aria-invalid', !ok);
    $(`#${field}Err`).textContent = ok ? '' : result;
    return ok;
  }
  Object.keys(rules).forEach(f => cf.elements[f].addEventListener('blur', () => check(f)));
  cf.addEventListener('submit', e => {
    e.preventDefault();
    const allOk = Object.keys(rules).map(check).every(Boolean);
    $('#formOk').textContent = allOk ? 'Feedback sent. Thank you!' : '';
    if (allOk) cf.reset();
  });
})();
