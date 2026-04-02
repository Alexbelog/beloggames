const STATUS_META = {
  pending: { label: 'На рассмотрении', className: 'warn' },
  approved: { label: 'Одобрено', className: 'accent' },
  collecting: { label: 'Собирает приоритет', className: '' },
  scheduled: { label: 'Назначено', className: 'accent' },
  live: { label: 'Идёт на стриме', className: 'accent' },
  done: { label: 'Пройдено', className: '' },
  dropped: { label: 'Дропнуто', className: 'danger' },
  rejected: { label: 'Отклонено', className: 'danger' }
};

const DEMO_GAMES = [
  {
    title: 'Lies of P: Overture', viewer_name: 'chat', genre: 'Soulslike', estimated_hours: 12,
    desired_format: 'Мини-серия', reason: 'Идеально ложится под вайб канала и обсуждения билдов.',
    notes: 'После релиза DLC.', priority_points: 84, status: 'approved', scheduled_at: null
  },
  {
    title: 'Buckshot Roulette', viewer_name: 'bear', genre: 'Horror / Roguelike', estimated_hours: 3,
    desired_format: 'Слот на 1 стрим', reason: 'Короткая, мемная и отлично зайдёт на один плотный вечер.',
    notes: '', priority_points: 61, status: 'scheduled', scheduled_at: '2026-04-18T19:00:00+03:00'
  },
  {
    title: 'Blasphemous 2', viewer_name: 'fox', genre: 'Metroidvania', estimated_hours: 14,
    desired_format: 'Первый взгляд', reason: 'Сильная атмосфера и нормальный темп для стрима.',
    notes: 'Нужно проверить локализацию.', priority_points: 49, status: 'collecting', scheduled_at: null
  }
];

const CONFIG = window.APP_CONFIG || {
  supabaseUrl: 'PASTE_SUPABASE_URL',
  supabaseAnonKey: 'PASTE_SUPABASE_ANON_KEY'
};

const els = {
  queueGrid: document.getElementById('queue-grid'),
  scheduledList: document.getElementById('scheduled-list'),
  searchInput: document.getElementById('search-input'),
  statusFilter: document.getElementById('status-filter'),
  sortSelect: document.getElementById('sort-select'),
  submitForm: document.getElementById('submit-form'),
  submitMessage: document.getElementById('submit-message'),
  statApproved: document.getElementById('stat-approved'),
  statScheduled: document.getElementById('stat-scheduled'),
  statDone: document.getElementById('stat-done'),
  adminModal: document.getElementById('admin-modal'),
  openAdmin: document.getElementById('open-admin'),
  closeAdmin: document.getElementById('close-admin'),
  adminAuthBox: document.getElementById('admin-auth-box'),
  adminPanel: document.getElementById('admin-panel'),
  adminEmail: document.getElementById('admin-email'),
  adminPassword: document.getElementById('admin-password'),
  adminSignin: document.getElementById('admin-signin'),
  adminMagic: document.getElementById('admin-magic'),
  adminSignout: document.getElementById('admin-signout'),
  authMessage: document.getElementById('auth-message'),
  adminList: document.getElementById('admin-list'),
  adminUser: document.getElementById('admin-user'),
  seedDemo: document.getElementById('seed-demo')
};

let supabase = null;
let state = { games: [], session: null, filters: { query: '', status: 'all', sort: 'priority' } };

function canUseSupabase() {
  return CONFIG.supabaseUrl && CONFIG.supabaseAnonKey &&
    !CONFIG.supabaseUrl.includes('PASTE_') && !CONFIG.supabaseAnonKey.includes('PASTE_');
}

function formatDate(value) {
  if (!value) return 'Дата не назначена';
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function escapeHtml(str = '') {
  return str.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function statusBadge(status) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  return `<span class="pill ${meta.className}">${meta.label}</span>`;
}

function normalizeGame(game) {
  return {
    id: game.id,
    title: game.title || 'Без названия',
    viewer_name: game.viewer_name || 'anon',
    genre: game.genre || 'Не указан',
    estimated_hours: game.estimated_hours || null,
    desired_format: game.desired_format || 'Первый взгляд',
    reason: game.reason || '',
    notes: game.notes || '',
    priority_points: Number(game.priority_points || 0),
    status: game.status || 'pending',
    reference_url: game.reference_url || '',
    scheduled_at: game.scheduled_at || null,
    created_at: game.created_at || new Date().toISOString()
  };
}

async function init() {
  populateStatusFilter();
  bindEvents();
  if (canUseSupabase()) {
    supabase = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
    await restoreSession();
    await loadGames();
  } else {
    loadLocalGames();
    els.submitMessage.textContent = 'Сайт запущен в demo mode. Для реальной базы подключи Supabase в app.js.';
  }
  renderAll();
}

function loadLocalGames() {
  const stored = localStorage.getItem('alexbelog_v2_games');
  const parsed = stored ? JSON.parse(stored) : DEMO_GAMES.map((g, i) => ({ ...g, id: crypto.randomUUID?.() || String(i + 1), created_at: new Date().toISOString() }));
  state.games = parsed.map(normalizeGame);
  localStorage.setItem('alexbelog_v2_games', JSON.stringify(state.games));
}

function saveLocalGames() {
  localStorage.setItem('alexbelog_v2_games', JSON.stringify(state.games));
}

async function restoreSession() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  renderAdminAuth();
  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    renderAdminAuth();
  });
}

async function loadGames() {
  const { data, error } = await supabase
    .from('game_requests')
    .select('*')
    .order('priority_points', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    els.submitMessage.textContent = 'Не удалось загрузить данные из Supabase. Проверь настройки и таблицу.';
    loadLocalGames();
    return;
  }
  state.games = data.map(normalizeGame);
}

function populateStatusFilter() {
  Object.entries(STATUS_META).forEach(([value, meta]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = meta.label;
    els.statusFilter.appendChild(option);
  });
}

function bindEvents() {
  els.searchInput.addEventListener('input', e => { state.filters.query = e.target.value.trim().toLowerCase(); renderQueue(); });
  els.statusFilter.addEventListener('change', e => { state.filters.status = e.target.value; renderQueue(); });
  els.sortSelect.addEventListener('change', e => { state.filters.sort = e.target.value; renderQueue(); });
  els.submitForm.addEventListener('submit', submitRequest);
  els.openAdmin.addEventListener('click', () => els.adminModal.showModal());
  els.closeAdmin.addEventListener('click', () => els.adminModal.close());
  els.adminSignin.addEventListener('click', signInAdmin);
  els.adminMagic.addEventListener('click', sendMagicLink);
  els.adminSignout.addEventListener('click', async () => { if (supabase) await supabase.auth.signOut(); else state.session = null; renderAdminAuth(); });
  els.seedDemo.addEventListener('click', seedDemoData);
}

function filteredGames() {
  let items = [...state.games];
  const q = state.filters.query;
  if (q) {
    items = items.filter(g => [g.title, g.genre, g.viewer_name].join(' ').toLowerCase().includes(q));
  }
  if (state.filters.status !== 'all') {
    items = items.filter(g => g.status === state.filters.status);
  }
  if (state.filters.sort === 'newest') items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (state.filters.sort === 'title') items.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  if (state.filters.sort === 'priority') items.sort((a, b) => b.priority_points - a.priority_points || new Date(b.created_at) - new Date(a.created_at));
  return items;
}

function renderAll() {
  renderQueue();
  renderScheduled();
  renderStats();
  renderAdminAuth();
  renderAdminList();
}

function renderQueue() {
  const items = filteredGames().filter(g => g.status !== 'rejected');
  if (!items.length) {
    els.queueGrid.innerHTML = '<div class="empty-state">Пока ничего не найдено.</div>';
    return;
  }
  els.queueGrid.innerHTML = items.map(game => `
    <article class="queue-card">
      <div class="card-top">
        ${statusBadge(game.status)}
        <span class="pill">${game.priority_points} очков</span>
      </div>
      <div>
        <h3>${escapeHtml(game.title)}</h3>
        <p>${escapeHtml(game.reason)}</p>
      </div>
      <div class="pill-row">
        <span class="pill">${escapeHtml(game.genre)}</span>
        <span class="pill">${escapeHtml(game.desired_format)}</span>
      </div>
      <div class="meta-row">
        <span>От ${escapeHtml(game.viewer_name)}</span>
        <span>${game.estimated_hours ? `${game.estimated_hours} ч` : 'время не указано'}</span>
      </div>
      ${game.scheduled_at ? `<div class="meta-row"><span>Слот</span><span>${formatDate(game.scheduled_at)}</span></div>` : ''}
      ${game.reference_url ? `<a class="button ghost small" href="${escapeHtml(game.reference_url)}" target="_blank" rel="noopener">Открыть ссылку</a>` : ''}
    </article>
  `).join('');
}

function renderScheduled() {
  const items = [...state.games]
    .filter(g => g.status === 'scheduled' || g.status === 'live')
    .sort((a, b) => new Date(a.scheduled_at || 0) - new Date(b.scheduled_at || 0))
    .slice(0, 4);
  if (!items.length) {
    els.scheduledList.innerHTML = '<div class="empty-state">Пока нет назначенных слотов.</div>';
    return;
  }
  els.scheduledList.innerHTML = items.map(game => `
    <article class="scheduled-item">
      <div class="card-top">
        <strong>${escapeHtml(game.title)}</strong>
        ${statusBadge(game.status)}
      </div>
      <p class="muted">${escapeHtml(game.desired_format)} · ${escapeHtml(game.genre)}</p>
      <p>${formatDate(game.scheduled_at)}</p>
    </article>
  `).join('');
}

function renderStats() {
  els.statApproved.textContent = state.games.filter(g => ['approved', 'collecting'].includes(g.status)).length;
  els.statScheduled.textContent = state.games.filter(g => ['scheduled', 'live'].includes(g.status)).length;
  els.statDone.textContent = state.games.filter(g => g.status === 'done').length;
}

function renderAdminAuth() {
  const logged = Boolean(state.session);
  els.adminAuthBox.classList.toggle('hidden', logged);
  els.adminPanel.classList.toggle('hidden', !logged);
  els.adminUser.textContent = logged ? (state.session.user.email || 'admin') : '';
}

function renderAdminList() {
  const items = [...state.games].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (!items.length) {
    els.adminList.innerHTML = '<div class="empty-state">Нет заявок.</div>';
    return;
  }
  els.adminList.innerHTML = items.map(game => `
    <article class="admin-item" data-id="${game.id}">
      <div class="card-top">
        <div>
          <strong>${escapeHtml(game.title)}</strong>
          <div class="muted">${escapeHtml(game.viewer_name)} · ${escapeHtml(game.genre)}</div>
        </div>
        ${statusBadge(game.status)}
      </div>
      <div class="admin-grid">
        <label><span>Приоритет</span><input class="input" data-field="priority_points" type="number" value="${game.priority_points}" /></label>
        <label><span>Статус</span>
          <select class="input select" data-field="status">${Object.entries(STATUS_META).map(([key, meta]) => `<option value="${key}" ${key === game.status ? 'selected' : ''}>${meta.label}</option>`).join('')}</select>
        </label>
        <label><span>Формат</span><input class="input" data-field="desired_format" value="${escapeHtml(game.desired_format)}" /></label>
        <label><span>Дата слота</span><input class="input" data-field="scheduled_at" type="datetime-local" value="${toDateTimeLocal(game.scheduled_at)}" /></label>
        <button class="button primary save-game">Сохранить</button>
      </div>
      <p class="muted">${escapeHtml(game.reason)}</p>
      <div class="actions-row">
        <button class="button ghost delete-game">Удалить</button>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.save-game').forEach(btn => btn.addEventListener('click', handleAdminSave));
  document.querySelectorAll('.delete-game').forEach(btn => btn.addEventListener('click', handleAdminDelete));
}

function toDateTimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function submitRequest(event) {
  event.preventDefault();
  const formData = new FormData(els.submitForm);
  const payload = Object.fromEntries(formData.entries());
  payload.estimated_hours = payload.estimated_hours ? Number(payload.estimated_hours) : null;
  payload.priority_points = 0;
  payload.status = 'pending';

  if (supabase) {
    const { error } = await supabase.from('game_requests').insert([payload]);
    if (error) {
      console.error(error);
      els.submitMessage.textContent = 'Ошибка сохранения. Проверь таблицу и RLS policy.';
      return;
    }
    await loadGames();
  } else {
    state.games.unshift(normalizeGame({ ...payload, id: crypto.randomUUID?.() || String(Date.now()), created_at: new Date().toISOString() }));
    saveLocalGames();
  }

  els.submitForm.reset();
  els.submitMessage.textContent = 'Заявка отправлена.';
  renderAll();
}

async function signInAdmin() {
  if (!supabase) {
    els.authMessage.textContent = 'Подключи Supabase, чтобы использовать реальную авторизацию.';
    return;
  }
  const email = els.adminEmail.value.trim();
  const password = els.adminPassword.value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  els.authMessage.textContent = error ? error.message : 'Вход выполнен.';
}

async function sendMagicLink() {
  if (!supabase) {
    els.authMessage.textContent = 'Подключи Supabase, чтобы использовать magic link.';
    return;
  }
  const email = els.adminEmail.value.trim();
  const redirectTo = window.location.href;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  els.authMessage.textContent = error ? error.message : 'Ссылка для входа отправлена.';
}

async function handleAdminSave(event) {
  const article = event.target.closest('.admin-item');
  const id = article.dataset.id;
  const payload = {};
  article.querySelectorAll('[data-field]').forEach(el => {
    payload[el.dataset.field] = el.value || null;
  });
  payload.priority_points = Number(payload.priority_points || 0);
  payload.scheduled_at = payload.scheduled_at ? new Date(payload.scheduled_at).toISOString() : null;

  if (supabase) {
    const { error } = await supabase.from('game_requests').update(payload).eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadGames();
  } else {
    state.games = state.games.map(g => g.id === id ? normalizeGame({ ...g, ...payload }) : g);
    saveLocalGames();
  }
  renderAll();
}

async function handleAdminDelete(event) {
  const article = event.target.closest('.admin-item');
  const id = article.dataset.id;
  if (!confirm('Удалить заявку?')) return;

  if (supabase) {
    const { error } = await supabase.from('game_requests').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadGames();
  } else {
    state.games = state.games.filter(g => g.id !== id);
    saveLocalGames();
  }
  renderAll();
}

async function seedDemoData() {
  if (supabase) {
    const { error } = await supabase.from('game_requests').insert(DEMO_GAMES);
    if (error) {
      els.authMessage.textContent = error.message;
      return;
    }
    await loadGames();
  } else {
    state.games = [...DEMO_GAMES.map((g, i) => normalizeGame({ ...g, id: crypto.randomUUID?.() || `demo-${i}`, created_at: new Date().toISOString() })), ...state.games];
    saveLocalGames();
  }
  renderAll();
}

init();
