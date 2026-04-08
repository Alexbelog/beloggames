const SUPABASE_URL = 'PASTE_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'PASTE_SUPABASE_ANON_KEY';
const hasSupabaseConfig = !SUPABASE_URL.includes('PASTE_') && !SUPABASE_ANON_KEY.includes('PASTE_');
const supabase = hasSupabaseConfig ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const STATUS_META = {
  pending: { label: 'На рассмотрении', public: false },
  approved: { label: 'Одобрено', public: true },
  collecting: { label: 'Собирает приоритет', public: true },
  scheduled: { label: 'Назначено', public: true },
  live: { label: 'Идёт на стриме', public: true },
  done: { label: 'Завершено', public: true },
  dropped: { label: 'Дропнуто', public: true },
  rejected: { label: 'Отклонено', public: false }
};

const els = {
  queueGrid: document.getElementById('queue-grid'),
  scheduledList: document.getElementById('scheduled-list'),
  spotlightCard: document.getElementById('spotlight-card'),
  submitForm: document.getElementById('submit-form'),
  titleInput: document.getElementById('game-title-input'),
  estimatedHoursInput: document.getElementById('estimated-hours-input'),
  hltbIconLink: document.getElementById('hltb-icon-link'),
  submitMessage: document.getElementById('submit-message'),
  searchInput: document.getElementById('search-input'),
  statusFilter: document.getElementById('status-filter'),
  sortSelect: document.getElementById('sort-select'),
  statTotal: document.getElementById('stat-total'),
  statApproved: document.getElementById('stat-approved'),
  statScheduled: document.getElementById('stat-scheduled'),
  statDone: document.getElementById('stat-done'),
  gameModal: document.getElementById('game-modal'),
  gameModalContent: document.getElementById('game-modal-content'),
  closeGameModal: document.getElementById('close-game-modal'),
  openAdmin: document.getElementById('open-admin'),
  adminModal: document.getElementById('admin-modal'),
  closeAdmin: document.getElementById('close-admin'),
  adminAuthBox: document.getElementById('admin-auth-box'),
  adminPanel: document.getElementById('admin-panel'),
  adminEmail: document.getElementById('admin-email'),
  adminPassword: document.getElementById('admin-password'),
  adminSignin: document.getElementById('admin-signin'),
  adminMagic: document.getElementById('admin-magic'),
  adminSignout: document.getElementById('admin-signout'),
  adminUser: document.getElementById('admin-user'),
  adminList: document.getElementById('admin-list'),
  authMessage: document.getElementById('auth-message'),
  seedDemo: document.getElementById('seed-demo')
};

const state = {
  games: [],
  session: null,
  filters: {
    query: '',
    status: 'all',
    sort: 'priority'
  },
  hltb: {}
};

await init();

async function init() {
  populateStatusFilter();
  bindEvents();
  await restoreSession();
  await loadGames();
  renderAll();
  if (supabase) subscribeRealtime();
}

async function restoreSession() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    renderAdminAuth();
    renderAdminList();
  });
}

function subscribeRealtime() {
  supabase.channel('public:game_requests')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_requests' }, async () => {
      await loadGames();
      renderAll();
    })
    .subscribe();
}

async function loadGames() {
  if (!supabase) {
    loadLocalGames();
    return;
  }
  const { data, error } = await supabase
    .from('game_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    els.submitMessage.textContent = 'Не удалось загрузить данные из Supabase. Включён demo mode.';
    loadLocalGames();
    return;
  }
  state.games = data.map(normalizeGame);
}

function loadLocalGames() {
  const raw = localStorage.getItem('alexbelog-v3-games');
  if (raw) {
    state.games = JSON.parse(raw).map(normalizeGame);
    return;
  }
  seedLocalGames(false);
}

function saveLocalGames() {
  localStorage.setItem('alexbelog-v3-games', JSON.stringify(state.games));
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
  els.searchInput.addEventListener('input', (e) => {
    state.filters.query = e.target.value.trim().toLowerCase();
    renderQueue();
  });
  els.statusFilter.addEventListener('change', (e) => {
    state.filters.status = e.target.value;
    renderQueue();
  });
  els.sortSelect.addEventListener('change', (e) => {
    state.filters.sort = e.target.value;
    renderQueue();
  });
  els.submitForm.addEventListener('submit', submitRequest);
  els.titleInput.addEventListener('input', onTitleInput);

  els.openAdmin.addEventListener('click', () => els.adminModal.showModal());
  els.closeAdmin.addEventListener('click', () => els.adminModal.close());
  els.closeGameModal.addEventListener('click', () => els.gameModal.close());
  els.adminSignin.addEventListener('click', signInAdmin);
  els.adminMagic.addEventListener('click', sendMagicLink);
  els.adminSignout.addEventListener('click', async () => {
    if (supabase) await supabase.auth.signOut();
    else state.session = null;
    renderAdminAuth();
  });
  els.seedDemo.addEventListener('click', () => seedLocalGames(true));

  updateHltbLink('');

  els.gameModal.addEventListener('click', (e) => {
    const rect = els.gameModal.getBoundingClientRect();
    const inDialog = rect.top <= e.clientY && e.clientY <= rect.top + rect.height && rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
    if (!inDialog) els.gameModal.close();
  });
}

function onTitleInput() {
  updateHltbLink(els.titleInput.value.trim());
}

function updateHltbLink(title) {
  const target = title.trim();
  els.hltbIconLink.href = target ? hltbSearchUrl(target) : 'https://howlongtobeat.com/';
  els.hltbIconLink.classList.toggle('hidden', target.length < 2);
}

function normalizeGame(game) {
  return {
    id: game.id || crypto.randomUUID(),
    title: game.title || 'Без названия',
    viewer_name: game.viewer_name || 'зритель',
    genre: game.genre || 'не указан',
    estimated_hours: game.estimated_hours || null,
    desired_format: game.desired_format || 'Первый взгляд',
    reference_url: game.reference_url || '',
    reason: game.reason || '',
    notes: game.notes || '',
    priority_points: Number(game.priority_points || 0),
    status: game.status || 'pending',
    scheduled_at: game.scheduled_at || null,
    created_at: game.created_at || new Date().toISOString()
  };
}

function filteredGames() {
  let items = [...state.games].filter(g => g.status !== 'rejected');
  const q = state.filters.query;
  if (q) {
    items = items.filter(g => [g.title, g.genre, g.viewer_name, g.reason].join(' ').toLowerCase().includes(q));
  }
  if (state.filters.status !== 'all') {
    items = items.filter(g => g.status === state.filters.status);
  }

  switch (state.filters.sort) {
    case 'title':
      items.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
      break;
    case 'newest':
      items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      break;
    case 'scheduled':
      items.sort((a, b) => {
        const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime || b.priority_points - a.priority_points;
      });
      break;
    default:
      items.sort((a, b) => b.priority_points - a.priority_points || new Date(b.created_at) - new Date(a.created_at));
  }
  return items;
}

function renderAll() {
  renderQueue();
  renderScheduled();
  renderSpotlight();
  renderStats();
  renderAdminAuth();
  renderAdminList();
}

function renderQueue() {
  const items = filteredGames().filter(g => STATUS_META[g.status]?.public);
  if (!items.length) {
    els.queueGrid.innerHTML = '<div class="empty-state">Пока здесь пусто. Отправь первую заявку или добавь демо-данные в админке.</div>';
    return;
  }

  els.queueGrid.innerHTML = items.map(game => `
    <article class="queue-card" data-id="${game.id}">
      <div class="card-top">
        ${statusBadge(game.status)}
        <span class="pill">${game.priority_points} очков</span>
      </div>
      <div>
        <h3>${escapeHtml(game.title)}</h3>
        <p>${escapeHtml(truncate(game.reason, 140))}</p>
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
      <div class="detail-actions">
        <button class="button ghost small open-game" data-id="${game.id}">Подробнее</button>
        <a class="button small icon-button" href="${hltbSearchUrl(game.title)}" target="_blank" rel="noopener"><span class="hltb-mini">HLTB</span> </a>
        ${game.reference_url ? `<a class="button small" href="${escapeHtml(game.reference_url)}" target="_blank" rel="noopener">Ссылка</a>` : ''}
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.open-game').forEach(btn => btn.addEventListener('click', () => openGameModal(btn.dataset.id)));
}

function renderScheduled() {
  const items = [...state.games]
    .filter(g => ['scheduled', 'live', 'collecting'].includes(g.status))
    .sort((a, b) => {
      const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime || b.priority_points - a.priority_points;
    })
    .slice(0, 6);

  if (!items.length) {
    els.scheduledList.innerHTML = '<div class="empty-state">Пока нет назначенных слотов.</div>';
    return;
  }

  els.scheduledList.innerHTML = items.map(game => `
    <article class="scheduled-card">
      <div class="card-top">
        ${statusBadge(game.status)}
        <span class="pill">${game.priority_points} очков</span>
      </div>
      <h3>${escapeHtml(game.title)}</h3>
      <p>${escapeHtml(game.desired_format)} · ${escapeHtml(game.genre)}</p>
      <p>${game.scheduled_at ? formatDate(game.scheduled_at) : 'Дата ещё не назначена'}</p>
      <div class="detail-actions">
        <button class="button ghost small open-game" data-id="${game.id}">Открыть</button>
        <a class="button small icon-button" href="${hltbSearchUrl(game.title)}" target="_blank" rel="noopener"><span class="hltb-mini">HLTB</span> </a>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.scheduled-card .open-game').forEach(btn => btn.addEventListener('click', () => openGameModal(btn.dataset.id)));
}

function renderSpotlight() {
  const candidate = [...state.games]
    .filter(g => ['live', 'scheduled', 'collecting', 'approved'].includes(g.status))
    .sort((a, b) => spotlightScore(b) - spotlightScore(a))[0];

  if (!candidate) {
    els.spotlightCard.innerHTML = '<div class="spotlight-empty">Пока нет кандидатов для главного слота.</div>';
    return;
  }

  els.spotlightCard.innerHTML = `
    <div class="card-top">
      ${statusBadge(candidate.status)}
      <span class="pill">${candidate.priority_points} очков</span>
    </div>
    <div>
      <h2 class="spotlight-title">${escapeHtml(candidate.title)}</h2>
      <p class="hero-text">${escapeHtml(truncate(candidate.reason, 200))}</p>
    </div>
    <div class="pill-row">
      <span class="pill">${escapeHtml(candidate.genre)}</span>
      <span class="pill">${escapeHtml(candidate.desired_format)}</span>
      <span class="pill">${candidate.estimated_hours ? `${candidate.estimated_hours} ч` : 'время не указано'}</span>
    </div>
    ${candidate.scheduled_at ? `<p><strong>Слот:</strong> ${formatDate(candidate.scheduled_at)}</p>` : '<p><strong>Слот:</strong> ещё не назначен</p>'}
    <div class="detail-actions">
      <button class="button primary small" id="open-spotlight">Подробнее</button>
      <a class="button ghost small icon-button" href="${hltbSearchUrl(candidate.title)}" target="_blank" rel="noopener"><span class="hltb-mini">HLTB</span> </a>
      ${candidate.reference_url ? `<a class="button ghost small" href="${escapeHtml(candidate.reference_url)}" target="_blank" rel="noopener">Ссылка</a>` : ''}
    </div>
  `;

  document.getElementById('open-spotlight').addEventListener('click', () => openGameModal(candidate.id));
}

function spotlightScore(game) {
  let score = game.priority_points;
  if (game.status === 'live') score += 1000;
  if (game.status === 'scheduled') score += 600;
  if (game.status === 'collecting') score += 200;
  if (game.scheduled_at) score += 100 - Math.min(99, Math.floor((new Date(game.scheduled_at).getTime() - Date.now()) / 86400000));
  return score;
}

function renderStats() {
  els.statTotal.textContent = state.games.length;
  els.statApproved.textContent = state.games.filter(g => ['approved', 'collecting'].includes(g.status)).length;
  els.statScheduled.textContent = state.games.filter(g => ['scheduled', 'live'].includes(g.status)).length;
  els.statDone.textContent = state.games.filter(g => g.status === 'done').length;
}

function openGameModal(id) {
  const game = state.games.find(item => item.id === id);
  if (!game) return;
  els.gameModalContent.innerHTML = `
    <div class="detail-panel">
      <div class="card-top">
        ${statusBadge(game.status)}
        <span class="pill">${game.priority_points} очков</span>
      </div>
      <div class="detail-columns">
        <div>
          <h2 class="detail-title">${escapeHtml(game.title)}</h2>
          <p class="hero-text">${escapeHtml(game.reason || 'Описание пока не заполнено.')}</p>
          <div class="detail-grid">
            <span class="pill">Жанр: ${escapeHtml(game.genre)}</span>
            <span class="pill">Формат: ${escapeHtml(game.desired_format)}</span>
            <span class="pill">Заявка от: ${escapeHtml(game.viewer_name)}</span>
            <span class="pill">Длительность: ${game.estimated_hours ? `${game.estimated_hours} ч` : 'не указана'}</span>
          </div>
        </div>
        <aside class="panel">
          <strong>Детали</strong>
          <div class="stack gap" style="margin-top:12px;">
            <div><span class="muted">Создано</span><br>${formatDate(game.created_at)}</div>
            <div><span class="muted">Слот</span><br>${game.scheduled_at ? formatDate(game.scheduled_at) : 'ещё не назначен'}</div>
            <div><span class="muted">Нюансы</span><br>${escapeHtml(game.notes || 'не указаны')}</div>
          </div>
        </aside>
      </div>
      <div class="detail-actions">
        <a class="button icon-button" href="${hltbSearchUrl(game.title)}" target="_blank" rel="noopener"><span class="hltb-mini">HLTB</span>Открыть в HLTB</a>
        ${game.reference_url ? `<a class="button primary" href="${escapeHtml(game.reference_url)}" target="_blank" rel="noopener">Открыть ссылку</a>` : ''}
        <button class="button ghost" id="close-from-detail">Закрыть</button>
      </div>
    </div>
  `;
  els.gameModal.showModal();
  document.getElementById('close-from-detail')?.addEventListener('click', () => els.gameModal.close());
}

function renderAdminAuth() {
  const logged = Boolean(state.session) || !supabase;
  els.adminAuthBox.classList.toggle('hidden', logged);
  els.adminPanel.classList.toggle('hidden', !logged);
  els.adminUser.textContent = state.session?.user?.email || (supabase ? '' : 'demo admin (local mode)');
  if (!supabase) {
    els.authMessage.textContent = 'Supabase не настроен, поэтому админка работает в demo mode через localStorage.';
  }
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
          <div class="muted">${escapeHtml(game.viewer_name)} · ${escapeHtml(game.genre)} · ${formatDate(game.created_at)}</div>
        </div>
        ${statusBadge(game.status)}
      </div>
      <p class="muted">${escapeHtml(game.reason)}</p>
      <div class="admin-grid">
        <label><span>Приоритет</span><input class="input" data-field="priority_points" type="number" value="${game.priority_points}" /></label>
        <label><span>Статус</span><select class="input select" data-field="status">${Object.entries(STATUS_META).map(([key, meta]) => `<option value="${key}" ${game.status === key ? 'selected' : ''}>${meta.label}</option>`).join('')}</select></label>
        <label><span>Формат</span><input class="input" data-field="desired_format" value="${escapeHtml(game.desired_format)}" /></label>
        <label><span>Дата слота</span><input class="input" data-field="scheduled_at" type="datetime-local" value="${toDateTimeLocal(game.scheduled_at)}" /></label>
        <label><span>Ссылка</span><input class="input" data-field="reference_url" value="${escapeHtml(game.reference_url)}" /></label>
        <label><span>Жанр</span><input class="input" data-field="genre" value="${escapeHtml(game.genre)}" /></label>
      </div>
      <div class="detail-actions">
        <button class="button primary save-game">Сохранить</button>
        <button class="button ghost delete-game">Удалить</button>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.save-game').forEach(btn => btn.addEventListener('click', handleAdminSave));
  document.querySelectorAll('.delete-game').forEach(btn => btn.addEventListener('click', handleAdminDelete));
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
      els.submitMessage.textContent = 'Ошибка сохранения. Проверь таблицу и RLS policy в Supabase.';
      return;
    }
    await loadGames();
  } else {
    state.games.unshift(normalizeGame(payload));
    saveLocalGames();
  }

  els.submitForm.reset();
  updateHltbLink('');
  els.submitMessage.textContent = 'Заявка отправлена. После модерации она появится в очереди.';
  renderAll();
}

async function signInAdmin() {
  if (!supabase) {
    state.session = { user: { email: 'demo@local' } };
    renderAdminAuth();
    return;
  }
  const email = els.adminEmail.value.trim();
  const password = els.adminPassword.value.trim();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  els.authMessage.textContent = error ? error.message : 'Вход выполнен.';
}

async function sendMagicLink() {
  if (!supabase) {
    els.authMessage.textContent = 'Magic link доступен только после настройки Supabase.';
    return;
  }
  const email = els.adminEmail.value.trim();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href }
  });
  els.authMessage.textContent = error ? error.message : 'Magic link отправлен на почту.';
}

async function handleAdminSave(event) {
  const article = event.target.closest('.admin-item');
  const id = article.dataset.id;
  const payload = {};
  article.querySelectorAll('[data-field]').forEach(input => {
    let value = input.value;
    if (input.dataset.field === 'priority_points') value = Number(value || 0);
    if (input.dataset.field === 'scheduled_at' && value) value = new Date(value).toISOString();
    if (input.dataset.field === 'scheduled_at' && !value) value = null;
    payload[input.dataset.field] = value;
  });

  if (supabase) {
    const { error } = await supabase.from('game_requests').update(payload).eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadGames();
  } else {
    state.games = state.games.map(game => game.id === id ? normalizeGame({ ...game, ...payload }) : game);
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
    state.games = state.games.filter(game => game.id !== id);
    saveLocalGames();
  }
  renderAll();
}

function seedLocalGames(showMessage = true) {
  state.games = [
    {
      id: crypto.randomUUID(),
      title: 'Blasphemous 2',
      viewer_name: 'soul_digger',
      genre: 'metroidvania / soulslike',
      estimated_hours: 14,
      desired_format: 'Мини-серия',
      reference_url: 'https://store.steampowered.com/',
      reason: 'Подходит по атмосфере и хорошо смотрится как серия на несколько стримов.',
      notes: 'Есть жестокость, но без критичных рисков для эфира.',
      priority_points: 320,
      status: 'scheduled',
      scheduled_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(),
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8).toISOString()
    },
    {
      id: crypto.randomUUID(),
      title: 'Fear & Hunger',
      viewer_name: 'grimviewer',
      genre: 'dark RPG',
      estimated_hours: 8,
      desired_format: 'Первый взгляд',
      reference_url: '',
      reason: 'Нишевая и запоминающаяся игра, но требует аккуратной проверки контента.',
      notes: 'Проверить допустимость для стрима заранее.',
      priority_points: 250,
      status: 'collecting',
      scheduled_at: null,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString()
    },
    {
      id: crypto.randomUUID(),
      title: 'Lies of P: DLC',
      viewer_name: 'viewer_sub',
      genre: 'soulslike',
      estimated_hours: 10,
      desired_format: 'Полное прохождение',
      reference_url: '',
      reason: 'Сильное попадание в основной профиль канала и понятный запрос от аудитории.',
      notes: 'Подходит под крупный слот.',
      priority_points: 470,
      status: 'approved',
      scheduled_at: null,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString()
    },
    {
      id: crypto.randomUUID(),
      title: 'Elden Ring Randomizer',
      viewer_name: 'cliphunter',
      genre: 'challenge / soulslike',
      estimated_hours: 20,
      desired_format: 'Слот на 1 стрим',
      reference_url: '',
      reason: 'Хороший челлендж-формат с высоким шансом на клипы и активный чат.',
      notes: 'Проверить стабильность модов.',
      priority_points: 610,
      status: 'live',
      scheduled_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString()
    },
    {
      id: crypto.randomUUID(),
      title: 'Darkest Dungeon II',
      viewer_name: 'rottenhero',
      genre: 'roguelite',
      estimated_hours: 18,
      desired_format: 'Мини-серия',
      reference_url: '',
      reason: 'Подходит для напряжённых сессий на несколько вечеров.',
      notes: '',
      priority_points: 185,
      status: 'done',
      scheduled_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 18).toISOString()
    }
  ].map(normalizeGame);
  saveLocalGames();
  renderAll();
  if (showMessage) els.authMessage.textContent = 'Демо-данные добавлены.';
}

function hltbSearchUrl(title) {
  return `https://howlongtobeat.com/?q=${encodeURIComponent(title || '')}`;
}

function statusBadge(status) {
  const meta = STATUS_META[status] || { label: status };
  return `<span class="badge ${status}">${meta.label}</span>`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

function toDateTimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function truncate(text, max) {
  const safe = String(text || '');
  return safe.length > max ? `${safe.slice(0, max - 1)}…` : safe;
}
