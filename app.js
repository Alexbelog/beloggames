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
  completedList: document.getElementById('completed-list'),
  completedScoreFilter: document.getElementById('completed-score-filter'),
  completedSortSelect: document.getElementById('completed-sort-select'),
  scheduledList: document.getElementById('scheduled-list'),
  spotlightCard: document.getElementById('spotlight-card'),
  submitForm: document.getElementById('submit-form'),
  titleInput: document.getElementById('game-title-input'),
  hltbIconLink: document.getElementById('hltb-icon-link'),
  submitMessage: document.getElementById('submit-message'),
  searchInput: document.getElementById('search-input'),
  statusFilter: document.getElementById('status-filter'),
  sortSelect: document.getElementById('sort-select'),
  statTotal: document.getElementById('stat-total'),
  statApproved: document.getElementById('stat-approved'),
  statScheduled: document.getElementById('stat-scheduled'),
  statCompleted: document.getElementById('stat-completed'),
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
  adminCompletedList: document.getElementById('admin-completed-list'),
  authMessage: document.getElementById('auth-message'),
  seedDemo: document.getElementById('seed-demo'),
  completedForm: document.getElementById('completed-form'),
  completedTitleInput: document.getElementById('completed-title-input'),
  completedPosterPreview: document.getElementById('completed-poster-preview'),
  completedPosterEmpty: document.getElementById('completed-poster-empty'),
  completedPosterUrl: document.getElementById('completed-poster-url'),
  completedFormMessage: document.getElementById('completed-form-message'),
  refreshCompletedPoster: document.getElementById('refresh-completed-poster'),
  completedHltbLink: document.getElementById('completed-hltb-link')
};

const state = {
  games: [],
  completedGames: [],
  session: null,
  filters: {
    query: '',
    status: 'all',
    sort: 'priority'
  },
  completedFilters: {
    score: 'all',
    sort: 'date_desc'
  },
  hltbClient: null,
  completedPosterTimer: null
};

await init();

async function init() {
  populateStatusFilter();
  bindEvents();
  await restoreSession();
  await setupHltbClient();
  await loadAll();
  renderAll();
  if (supabase) subscribeRealtime();
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
  els.completedScoreFilter.addEventListener('change', (e) => {
    state.completedFilters.score = e.target.value;
    renderCompleted();
  });
  els.completedSortSelect.addEventListener('change', (e) => {
    state.completedFilters.sort = e.target.value;
    renderCompleted();
  });

  els.submitForm.addEventListener('submit', submitRequest);
  els.titleInput.addEventListener('input', () => updateHltbLink(els.titleInput.value.trim()));
  updateHltbLink('');

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
  els.seedDemo.addEventListener('click', () => seedLocalData(true));

  els.completedForm.addEventListener('submit', submitCompletedGame);
  els.completedTitleInput.addEventListener('input', onCompletedTitleInput);
  els.refreshCompletedPoster.addEventListener('click', async () => {
    await fetchCompletedPoster(true);
  });

  els.gameModal.addEventListener('click', (e) => {
    const rect = els.gameModal.getBoundingClientRect();
    const inDialog = rect.top <= e.clientY && e.clientY <= rect.top + rect.height && rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
    if (!inDialog) els.gameModal.close();
  });
}

async function setupHltbClient() {
  const candidates = [
    'https://esm.sh/howlongtobeat-core',
    'https://esm.sh/howlongtobeat@1.8.0'
  ];

  for (const url of candidates) {
    try {
      const mod = await import(url);
      const Client = mod.HowLongToBeat || mod.default?.HowLongToBeat || mod.default;
      if (Client) {
        state.hltbClient = new Client();
        return;
      }
    } catch (error) {
      console.warn('HLTB import failed:', error);
    }
  }
}

async function restoreSession() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    renderAdminAuth();
    renderAdminLists();
  });
}

function subscribeRealtime() {
  supabase.channel('public:game_requests')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_requests' }, async () => {
      await loadGames();
      renderAll();
    })
    .subscribe();

  supabase.channel('public:completed_games')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'completed_games' }, async () => {
      await loadCompletedGames();
      renderAll();
    })
    .subscribe();
}

async function loadAll() {
  await Promise.all([loadGames(), loadCompletedGames()]);
}

async function loadGames() {
  if (!supabase) {
    loadLocalData();
    return;
  }
  const { data, error } = await supabase
    .from('game_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    els.submitMessage.textContent = 'Не удалось загрузить заявки из Supabase. Включён demo mode.';
    loadLocalData();
    return;
  }
  state.games = data.map(normalizeGame);
}

async function loadCompletedGames() {
  if (!supabase) {
    loadLocalData();
    return;
  }
  const { data, error } = await supabase
    .from('completed_games')
    .select('*')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    els.completedFormMessage.textContent = 'Не удалось загрузить список пройденных игр. Включён demo mode.';
    loadLocalData();
    return;
  }
  state.completedGames = data.map(normalizeCompletedGame);
}

function loadLocalData() {
  const rawGames = localStorage.getItem('alexbelog-v4-games');
  const rawCompleted = localStorage.getItem('alexbelog-v4-completed');
  if (rawGames) state.games = JSON.parse(rawGames).map(normalizeGame);
  if (rawCompleted) state.completedGames = JSON.parse(rawCompleted).map(normalizeCompletedGame);
  if (!rawGames && !rawCompleted) seedLocalData(false);
}

function saveLocalData() {
  localStorage.setItem('alexbelog-v4-games', JSON.stringify(state.games));
  localStorage.setItem('alexbelog-v4-completed', JSON.stringify(state.completedGames));
}

function populateStatusFilter() {
  Object.entries(STATUS_META).forEach(([value, meta]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = meta.label;
    els.statusFilter.appendChild(option);
  });
}

function normalizeGame(game) {
  return {
    id: game.id || crypto.randomUUID(),
    title: game.title || 'Без названия',
    viewer_name: game.viewer_name || 'зритель',
    genre: game.genre || 'не указан',
    estimated_hours: game.estimated_hours ? Number(game.estimated_hours) : null,
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

function normalizeCompletedGame(game) {
  return {
    id: game.id || crypto.randomUUID(),
    title: game.title || 'Без названия',
    genre: game.genre || 'не указан',
    score: clampScore(game.score),
    review: game.review || '',
    poster_url: game.poster_url || '',
    hltb_url: game.hltb_url || hltbSearchUrl(game.title || ''),
    completed_at: game.completed_at || null,
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
  renderCompleted();
  renderScheduled();
  renderSpotlight();
  renderStats();
  renderAdminAuth();
  renderAdminLists();
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
        <button class="button ghost small open-request" data-id="${game.id}">Подробнее</button>
        <a class="button small icon-button" href="${hltbSearchUrl(game.title)}" target="_blank" rel="noopener"><span class="hltb-mini">HLTB</span></a>
        ${game.reference_url ? `<a class="button small" href="${escapeHtml(game.reference_url)}" target="_blank" rel="noopener">Ссылка</a>` : ''}
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.open-request').forEach(btn => btn.addEventListener('click', () => openRequestModal(btn.dataset.id)));
}

function filteredCompletedGames() {
  let items = [...state.completedGames];

  switch (state.completedFilters.score) {
    case '9':
      items = items.filter(g => g.score >= 9);
      break;
    case '7':
      items = items.filter(g => g.score >= 7 && g.score <= 8);
      break;
    case '5':
      items = items.filter(g => g.score >= 5 && g.score <= 6);
      break;
    case '1':
      items = items.filter(g => g.score >= 1 && g.score <= 4);
      break;
    default:
      break;
  }

  switch (state.completedFilters.sort) {
    case 'date_asc':
      items.sort((a, b) => {
        const aTime = a.completed_at ? new Date(a.completed_at).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.completed_at ? new Date(b.completed_at).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime || a.title.localeCompare(b.title, 'ru');
      });
      break;
    case 'score_desc':
      items.sort((a, b) => b.score - a.score || new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at));
      break;
    case 'score_asc':
      items.sort((a, b) => a.score - b.score || new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at));
      break;
    case 'title':
      items.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
      break;
    default:
      items.sort((a, b) => {
        const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return bTime - aTime || b.score - a.score;
      });
  }

  return items;
}

function renderCompleted() {
  const items = filteredCompletedGames();

  if (!items.length) {
    els.completedList.innerHTML = '<div class="empty-state">По этому фильтру пока нет игр.</div>';
    return;
  }

  els.completedList.innerHTML = items.map(game => `
    <article class="completed-poster-card" data-id="${game.id}">
      <button class="poster-card-hitbox open-completed" data-id="${game.id}" aria-label="Открыть ${escapeAttribute(game.title)}"></button>
      <div class="completed-poster-frame ${game.poster_url ? '' : 'poster-fallback'}">
        ${game.poster_url ? `<img src="${escapeHtml(game.poster_url)}" alt="${escapeHtml(game.title)}" loading="lazy" onerror="this.closest('.completed-poster-frame').classList.add('poster-fallback'); this.remove();">` : `<span>${escapeHtml(initialsFromTitle(game.title))}</span>`}
        <div class="poster-overlay">
          <div class="poster-topline">
            <span class="pill">Пройдено</span>
            <span class="pill">${game.completed_at ? formatDateShort(game.completed_at) : 'без даты'}</span>
          </div>
          <div class="poster-bottom">
            <div class="stars-line compact-stars" aria-label="Оценка ${game.score} из 10">${renderStars(game.score)}</div>
            <div class="poster-score">${game.score}/10</div>
          </div>
        </div>
      </div>
      <div class="completed-card-copy">
        <h3>${escapeHtml(game.title)}</h3>
        <div class="pill-row">
          <span class="pill">${escapeHtml(game.genre)}</span>
        </div>
        <p>${escapeHtml(truncate(game.review || 'Комментарий пока не добавлен.', 120))}</p>
        <div class="detail-actions completed-actions">
          <button class="button ghost small open-completed" data-id="${game.id}">Подробнее</button>
          <a class="button small icon-button" href="${escapeHtml(game.hltb_url || hltbSearchUrl(game.title))}" target="_blank" rel="noopener"><span class="hltb-mini">HLTB</span></a>
        </div>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.open-completed').forEach(btn => btn.addEventListener('click', () => openCompletedModal(btn.dataset.id)));
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
        <button class="button ghost small open-request" data-id="${game.id}">Открыть</button>
        <a class="button small icon-button" href="${hltbSearchUrl(game.title)}" target="_blank" rel="noopener"><span class="hltb-mini">HLTB</span></a>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.scheduled-card .open-request').forEach(btn => btn.addEventListener('click', () => openRequestModal(btn.dataset.id)));
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
      <a class="button ghost small icon-button" href="${hltbSearchUrl(candidate.title)}" target="_blank" rel="noopener"><span class="hltb-mini">HLTB</span></a>
      ${candidate.reference_url ? `<a class="button ghost small" href="${escapeHtml(candidate.reference_url)}" target="_blank" rel="noopener">Ссылка</a>` : ''}
    </div>
  `;

  document.getElementById('open-spotlight').addEventListener('click', () => openRequestModal(candidate.id));
}

function renderStats() {
  els.statTotal.textContent = state.games.length;
  els.statApproved.textContent = state.games.filter(g => ['approved', 'collecting'].includes(g.status)).length;
  els.statScheduled.textContent = state.games.filter(g => ['scheduled', 'live'].includes(g.status)).length;
  els.statCompleted.textContent = state.completedGames.length;
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

function renderAdminLists() {
  renderAdminRequestList();
  renderAdminCompletedList();
}

function renderAdminRequestList() {
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
        <label><span>Формат</span><input class="input" data-field="desired_format" value="${escapeAttribute(game.desired_format)}" /></label>
        <label><span>Дата слота</span><input class="input" data-field="scheduled_at" type="datetime-local" value="${toDateTimeLocal(game.scheduled_at)}" /></label>
        <label><span>Ссылка</span><input class="input" data-field="reference_url" value="${escapeAttribute(game.reference_url)}" /></label>
        <label><span>Жанр</span><input class="input" data-field="genre" value="${escapeAttribute(game.genre)}" /></label>
      </div>
      <div class="detail-actions">
        <button class="button primary save-game">Сохранить</button>
        <button class="button ghost delete-game">Удалить</button>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.save-game').forEach(btn => btn.addEventListener('click', handleAdminSaveRequest));
  document.querySelectorAll('.delete-game').forEach(btn => btn.addEventListener('click', handleAdminDeleteRequest));
}

function renderAdminCompletedList() {
  const items = [...state.completedGames].sort((a, b) => {
    const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
    const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
    return bTime - aTime || new Date(b.created_at) - new Date(a.created_at);
  });

  if (!items.length) {
    els.adminCompletedList.innerHTML = '<div class="empty-state">Пока нет пройденных игр.</div>';
    return;
  }

  els.adminCompletedList.innerHTML = items.map(game => `
    <article class="admin-item admin-completed-item" data-id="${game.id}">
      <div class="card-top">
        <div>
          <strong>${escapeHtml(game.title)}</strong>
          <div class="muted">${escapeHtml(game.genre)} · ${game.completed_at ? formatDateShort(game.completed_at) : 'дата не указана'}</div>
        </div>
        <div class="score-badge">${game.score}/10</div>
      </div>
      <div class="admin-completed-item-grid">
        <div class="admin-thumb ${game.poster_url ? '' : 'poster-fallback'}">
          ${game.poster_url ? `<img src="${escapeHtml(game.poster_url)}" alt="${escapeHtml(game.title)}" loading="lazy">` : `<span>${escapeHtml(initialsFromTitle(game.title))}</span>`}
        </div>
        <div class="admin-grid">
          <label><span>Название</span><input class="input" data-field="title" value="${escapeAttribute(game.title)}" /></label>
          <label><span>Жанр</span><input class="input" data-field="genre" value="${escapeAttribute(game.genre)}" /></label>
          <label><span>Дата</span><input class="input" data-field="completed_at" type="date" value="${toDateOnly(game.completed_at)}" /></label>
          <label><span>Оценка</span><input class="input" data-field="score" type="number" min="1" max="10" value="${game.score}" /></label>
          <label class="full"><span>Постер</span><input class="input" data-field="poster_url" value="${escapeAttribute(game.poster_url)}" /></label>
          <label class="full"><span>HLTB URL</span><input class="input" data-field="hltb_url" value="${escapeAttribute(game.hltb_url)}" /></label>
          <label class="full"><span>Комментарий</span><textarea class="input textarea compact" data-field="review">${escapeHtml(game.review)}</textarea></label>
        </div>
      </div>
      <div class="detail-actions">
        <button class="button primary save-completed">Сохранить</button>
        <button class="button ghost delete-completed">Удалить</button>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.save-completed').forEach(btn => btn.addEventListener('click', handleAdminSaveCompleted));
  document.querySelectorAll('.delete-completed').forEach(btn => btn.addEventListener('click', handleAdminDeleteCompleted));
}

function openRequestModal(id) {
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

function openCompletedModal(id) {
  const game = state.completedGames.find(item => item.id === id);
  if (!game) return;

  els.gameModalContent.innerHTML = `
    <div class="detail-panel completed-detail-panel">
      <div class="detail-columns completed-detail-columns">
        <div class="completed-modal-poster ${game.poster_url ? '' : 'poster-fallback'}">
          ${game.poster_url ? `<img src="${escapeHtml(game.poster_url)}" alt="${escapeHtml(game.title)}" loading="lazy" onerror="this.closest('.completed-modal-poster').classList.add('poster-fallback'); this.remove();">` : `<span>${escapeHtml(initialsFromTitle(game.title))}</span>`}
        </div>
        <div>
          <div class="card-top">
            <span class="pill">Пройдено</span>
            <span class="pill">${game.completed_at ? formatDateShort(game.completed_at) : 'дата не указана'}</span>
          </div>
          <h2 class="detail-title">${escapeHtml(game.title)}</h2>
          <div class="stars-line large-stars" aria-label="Оценка ${game.score} из 10">${renderStars(game.score)}</div>
          <p class="hero-text">${escapeHtml(game.review || 'Комментарий пока не добавлен.')}</p>
          <div class="detail-grid">
            <span class="pill">Жанр: ${escapeHtml(game.genre)}</span>
            <span class="pill">Оценка: ${game.score}/10</span>
          </div>
          <div class="detail-actions" style="margin-top: 18px;">
            <a class="button icon-button" href="${escapeHtml(game.hltb_url || hltbSearchUrl(game.title))}" target="_blank" rel="noopener"><span class="hltb-mini">HLTB</span>Открыть в HLTB</a>
            <button class="button ghost" id="close-from-detail">Закрыть</button>
          </div>
        </div>
      </div>
    </div>
  `;
  els.gameModal.showModal();
  document.getElementById('close-from-detail')?.addEventListener('click', () => els.gameModal.close());
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
    saveLocalData();
  }

  els.submitForm.reset();
  updateHltbLink('');
  els.submitMessage.textContent = 'Заявка отправлена. После модерации она появится в очереди.';
  renderAll();
}

async function submitCompletedGame(event) {
  event.preventDefault();
  const formData = new FormData(els.completedForm);
  const payload = Object.fromEntries(formData.entries());
  payload.score = clampScore(payload.score);
  payload.completed_at = payload.completed_at ? new Date(`${payload.completed_at}T12:00:00`).toISOString() : null;
  payload.hltb_url = hltbSearchUrl(payload.title);

  if (!payload.poster_url) {
    await fetchCompletedPoster(false);
    payload.poster_url = els.completedPosterUrl.value || '';
  }

  if (supabase) {
    const { error } = await supabase.from('completed_games').insert([payload]);
    if (error) {
      console.error(error);
      els.completedFormMessage.textContent = 'Ошибка сохранения пройденной игры. Проверь completed_games и RLS policy.';
      return;
    }
    await loadCompletedGames();
  } else {
    state.completedGames.unshift(normalizeCompletedGame(payload));
    saveLocalData();
  }

  els.completedForm.reset();
  resetCompletedPosterPreview();
  els.completedFormMessage.textContent = 'Пройденная игра добавлена.';
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

async function handleAdminSaveRequest(event) {
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
    saveLocalData();
  }
  renderAll();
}

async function handleAdminDeleteRequest(event) {
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
    saveLocalData();
  }
  renderAll();
}

async function handleAdminSaveCompleted(event) {
  const article = event.target.closest('.admin-completed-item');
  const id = article.dataset.id;
  const payload = {};
  article.querySelectorAll('[data-field]').forEach(input => {
    let value = input.value;
    if (input.dataset.field === 'score') value = clampScore(value);
    if (input.dataset.field === 'completed_at' && value) value = new Date(`${value}T12:00:00`).toISOString();
    if (input.dataset.field === 'completed_at' && !value) value = null;
    payload[input.dataset.field] = value;
  });
  if (!payload.hltb_url) payload.hltb_url = hltbSearchUrl(payload.title || '');

  if (supabase) {
    const { error } = await supabase.from('completed_games').update(payload).eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadCompletedGames();
  } else {
    state.completedGames = state.completedGames.map(game => game.id === id ? normalizeCompletedGame({ ...game, ...payload }) : game);
    saveLocalData();
  }
  renderAll();
}

async function handleAdminDeleteCompleted(event) {
  const article = event.target.closest('.admin-completed-item');
  const id = article.dataset.id;
  if (!confirm('Удалить пройденную игру?')) return;

  if (supabase) {
    const { error } = await supabase.from('completed_games').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadCompletedGames();
  } else {
    state.completedGames = state.completedGames.filter(game => game.id !== id);
    saveLocalData();
  }
  renderAll();
}

function onCompletedTitleInput() {
  const title = els.completedTitleInput.value.trim();
  els.completedHltbLink.href = title ? hltbSearchUrl(title) : 'https://howlongtobeat.com/';
  clearTimeout(state.completedPosterTimer);
  if (title.length < 2) {
    resetCompletedPosterPreview();
    return;
  }
  state.completedPosterTimer = setTimeout(() => fetchCompletedPoster(false), 500);
}

async function fetchCompletedPoster(forceMessage = true) {
  const title = els.completedTitleInput.value.trim();
  if (title.length < 2) return;
  els.completedFormMessage.textContent = forceMessage ? 'Пробую найти постер через HLTB…' : '';
  const result = await findHltbImage(title);

  if (!result?.poster_url) {
    els.completedPosterUrl.value = '';
    els.completedPosterPreview.classList.add('hidden');
    els.completedPosterPreview.removeAttribute('src');
    els.completedPosterEmpty.classList.remove('hidden');
    els.completedPosterEmpty.textContent = 'Постер из HLTB не найден. Игру всё равно можно сохранить и позже подставить ссылку вручную.';
    if (forceMessage) els.completedFormMessage.textContent = 'Постер не найден автоматически.';
    return;
  }

  els.completedPosterUrl.value = result.poster_url;
  els.completedPosterPreview.src = result.poster_url;
  els.completedPosterPreview.alt = title;
  els.completedPosterPreview.classList.remove('hidden');
  els.completedPosterEmpty.classList.add('hidden');
  if (forceMessage) els.completedFormMessage.textContent = 'Постер обновлён из HLTB.';
}

async function findHltbImage(title) {
  if (!state.hltbClient) return null;
  try {
    const withTimeout = (promise, ms = 8000) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('HLTB timeout')), ms))
    ]);

    const results = await withTimeout(state.hltbClient.search(title), 8000);
    if (!Array.isArray(results) || !results.length) return null;

    const normalizedTitle = normalizeTitle(title);
    const scored = results.map(item => {
      const itemTitle = item.gameName || item.name || item.title || '';
      const imageField = extractImageField(item);
      const score = titleSimilarity(normalizedTitle, normalizeTitle(itemTitle)) + (imageField ? 12 : 0);
      return { item, score };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0]?.item;
    if (!best) return null;

    const posterField = extractImageField(best);
    if (!posterField) return null;

    return {
      poster_url: normalizeImageUrl(posterField),
      hltb_url: extractHltbUrl(best, title)
    };
  } catch (error) {
    console.warn('HLTB image lookup failed:', error);
    return null;
  }
}

function extractImageField(item) {
  return item.imageUrl || item.gameImageUrl || item.game_image || item.gameImage || item.image || item.cover || item.poster || '';
}

function normalizeImageUrl(value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (String(value).startsWith('//')) return `https:${value}`;
  return `https://howlongtobeat.com/${String(value).replace(/^\/+/, '')}`;
}

function extractHltbUrl(item, fallbackTitle) {
  const id = item.gameId || item.id || item.game_id || item.profile_steam;
  if (item.gameUrl && /^https?:\/\//i.test(item.gameUrl)) return item.gameUrl;
  if (id && /^\d+$/.test(String(id))) return `https://howlongtobeat.com/game/${id}`;
  return hltbSearchUrl(item.gameName || item.name || fallbackTitle || '');
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[:'"`.,!?\-_/\\()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  let score = 0;
  if (a.startsWith(b) || b.startsWith(a)) score += 35;
  if (a.includes(b) || b.includes(a)) score += 25;
  const aWords = new Set(a.split(' '));
  const bWords = new Set(b.split(' '));
  for (const word of aWords) if (bWords.has(word)) score += 8;
  score -= Math.abs(a.length - b.length);
  return score;
}

function updateHltbLink(title) {
  const target = title.trim();
  els.hltbIconLink.href = target ? hltbSearchUrl(target) : 'https://howlongtobeat.com/';
  els.hltbIconLink.classList.toggle('hidden', target.length < 2);
}

function resetCompletedPosterPreview() {
  els.completedPosterUrl.value = '';
  els.completedPosterPreview.removeAttribute('src');
  els.completedPosterPreview.classList.add('hidden');
  els.completedPosterEmpty.classList.remove('hidden');
  els.completedPosterEmpty.textContent = 'После ввода названия постер попробует подтянуться автоматически из HLTB.';
  els.completedHltbLink.href = 'https://howlongtobeat.com/';
}

function seedLocalData(showMessage = true) {
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
    }
  ].map(normalizeGame);

  state.completedGames = [
    {
      id: crypto.randomUUID(),
      title: 'Darkest Dungeon II',
      genre: 'roguelite',
      score: 8,
      review: 'Очень сильная атмосфера и стиль. Боевая система зашла, но не всё в рогалик-структуре понравилось одинаково.',
      poster_url: '',
      hltb_url: hltbSearchUrl('Darkest Dungeon II'),
      completed_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString()
    },
    {
      id: crypto.randomUUID(),
      title: 'Elden Ring',
      genre: 'soulslike / action RPG',
      score: 10,
      review: 'Один из лучших игровых опытов. Очень сильное чувство масштаба, билдов и боссов.',
      poster_url: '',
      hltb_url: hltbSearchUrl('Elden Ring'),
      completed_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString()
    }
  ].map(normalizeCompletedGame);

  saveLocalData();
  renderAll();
  if (showMessage) els.authMessage.textContent = 'Демо-данные добавлены.';
}

function renderStars(score) {
  const safe = clampScore(score);
  let html = '';
  for (let i = 1; i <= 10; i += 1) {
    html += `<span class="star ${i <= safe ? 'filled' : ''}">★</span>`;
  }
  return html;
}

function clampScore(value) {
  const n = Math.max(1, Math.min(10, Number(value || 1)));
  return Number.isFinite(n) ? Math.round(n) : 1;
}

function spotlightScore(game) {
  let score = game.priority_points;
  if (game.status === 'live') score += 1000;
  if (game.status === 'scheduled') score += 600;
  if (game.status === 'collecting') score += 200;
  if (game.scheduled_at) score += 100 - Math.min(99, Math.floor((new Date(game.scheduled_at).getTime() - Date.now()) / 86400000));
  return score;
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

function formatDateShort(value) {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: 'long', year: 'numeric'
  }).format(date);
}

function toDateTimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateOnly(value) {
  if (!value) return '';
  const d = new Date(value);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function initialsFromTitle(title) {
  return String(title || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncate(text, max) {
  const safe = String(text || '');
  return safe.length > max ? `${safe.slice(0, max - 1)}…` : safe;
}
