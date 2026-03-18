/* ═══════════════════════════════════════════════════
   SOUNDWAVE  app.js  v4

   ЧАРТЫ : iTunes RSS (топ по жанрам) + Jamendo
   ПОИСК : iTunes Search + Jamendo (работают без ключей)

   Почему только эти два:
   - Deezer/SoundCloud/YouTube API блокируют браузерные
     запросы (CORS) без серверного прокси
   - iTunes: 30-сек preview (ограничение Apple)
   - Jamendo: ПОЛНЫЕ треки (легально, бесплатно)

   Длительность: реальная из trackTimeMillis / duration
═══════════════════════════════════════════════════ */
'use strict';

const ITUNES  = 'https://itunes.apple.com';
const JAMENDO = 'https://api.jamendo.com/v3.0';
const JM_CID  = '5d07db0e';  // публичный Jamendo client_id

/* ── State ── */
const state = {
  searchSource:  'itunes',   // 'itunes' | 'jamendo' | 'all'
  chartsSource:  'itunes',   // 'itunes' | 'jamendo'
  currentTrack:  null,
  queue:         [],
  queueIndex:    -1,
  isPlaying:     false,
  isShuffle:     false,
  isRepeat:      false,
  library:       [],
  playlists:     [],
  charts:        [],
  searchResults: [],
  activeTab:     'charts',
  activeGenre:   'pop',
  audio:         new Audio(),
  searchTimer:   null,
};

/* ── Helpers ── */
const $   = id => document.getElementById(id);
const esc = s  => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtMs  = ms  => { if(!ms||ms<=0)return''; const s=Math.floor(ms/1000); return`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };
const fmtSec = sec => { if(!sec||isNaN(sec))return'0:00'; return`${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,'0')}`; };

/* ── Persist ── */
function loadPersisted() {
  try {
    const lib=localStorage.getItem('sw4_lib'); if(lib)state.library=JSON.parse(lib);
    const pl=localStorage.getItem('sw4_pl');   if(pl) state.playlists=JSON.parse(pl);
  }catch(e){}
}
function save() {
  localStorage.setItem('sw4_lib',JSON.stringify(state.library));
  localStorage.setItem('sw4_pl', JSON.stringify(state.playlists));
}

/* ═══════════════════════════════════════════════════
   iTunes API
   - Чарты: RSS feed → enrich с preview + длительность
   - Поиск: /search endpoint (работает без ключа)
   - Preview: 30 сек (ограничение Apple API)
═══════════════════════════════════════════════════ */
const IT_GENRE = {pop:10,'hip-hop':18,rock:21,electronic:7,rnb:15,jazz:11,metal:1203,indie:1004};

async function iTunesSearch(term, limit=25) {
  const url = `${ITUNES}/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=${limit}&explicit=no`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes search HTTP ${res.status}`);
  const data = await res.json();
  return (data.results || []).map(normalizeIT);
}

async function iTunesCharts(genre, limit=25) {
  const gid = IT_GENRE[genre] || 14;
  const res  = await fetch(`${ITUNES}/us/rss/topsongs/limit=${limit}/genre=${gid}/json`);
  if (!res.ok) throw new Error(`iTunes charts HTTP ${res.status}`);
  const data = await res.json();
  const entries = data?.feed?.entry || [];

  const basic = entries.map(e => ({
    trackId:    'it_rss_' + (e.id?.attributes?.['im:id'] || Math.random()),
    trackName:  e['im:name']?.label   || 'Unknown',
    artistName: e['im:artist']?.label || 'Unknown',
    artworkUrl: (e['im:image']?.[2]?.label || '').replace('170x170bb','600x600bb'),
    durationMs: 0,
    previewUrl: null,
    source:     'itunes',
  }));

  // Enrich in parallel batches of 5 — get real preview URL + duration
  const enriched = [];
  for (let i = 0; i < basic.length; i += 5) {
    const batch = await Promise.all(basic.slice(i, i+5).map(enrichIT));
    enriched.push(...batch);
  }
  return enriched;
}

async function enrichIT(t) {
  try {
    const term = encodeURIComponent(`${t.artistName} ${t.trackName}`);
    const res  = await fetch(`${ITUNES}/search?term=${term}&media=music&entity=song&limit=1&explicit=no`);
    const data = await res.json();
    const m    = data.results?.[0];
    if (m) {
      t.previewUrl = m.previewUrl || null;
      t.durationMs = m.trackTimeMillis || 0;
      t.artworkUrl = (m.artworkUrl100 || t.artworkUrl)
        .replace('100x100bb','600x600bb')
        .replace('100x100','600x600');
      t.trackId    = 'it_' + m.trackId;
    }
  } catch(e) {}
  return t;
}

function normalizeIT(r) {
  return {
    trackId:    'it_' + r.trackId,
    trackName:  r.trackName  || 'Unknown',
    artistName: r.artistName || 'Unknown',
    artworkUrl: (r.artworkUrl100||'').replace('100x100bb','600x600bb').replace('100x100','600x600'),
    durationMs: r.trackTimeMillis || 0,
    previewUrl: r.previewUrl || null,
    source:     'itunes',
  };
}

/* ═══════════════════════════════════════════════════
   Jamendo API
   - Полные треки (не preview!) — бесплатно и легально
   - Огромная база независимых артистов
   - client_id = публичный, не требует регистрации
═══════════════════════════════════════════════════ */
const JM_TAGS = {pop:'pop','hip-hop':'hip-hop',rock:'rock',electronic:'electronic',rnb:'rnb',jazz:'jazz',metal:'metal',indie:'indie'};

async function jamendoSearch(term, limit=25) {
  const url = `${JAMENDO}/tracks/?client_id=${JM_CID}&format=json&limit=${limit}`
    + `&search=${encodeURIComponent(term)}&audioformat=mp32&include=musicinfo&order=relevance`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`Jamendo search HTTP ${res.status}`);
  const data = await res.json();
  return (data.results || []).map(normalizeJM);
}

async function jamendoCharts(genre, limit=25) {
  const tag = JM_TAGS[genre] || genre;
  const url = `${JAMENDO}/tracks/?client_id=${JM_CID}&format=json&limit=${limit}`
    + `&tags=${encodeURIComponent(tag)}&audioformat=mp32&order=popularity_total&include=musicinfo`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`Jamendo charts HTTP ${res.status}`);
  const data = await res.json();
  // If no tag results — search by keyword
  if (!data.results?.length) return jamendoSearch(tag + ' music', limit);
  return data.results.map(normalizeJM);
}

function normalizeJM(t) {
  const art = (t.album_image || t.image || '')
    .replace('1.200.jpg','1.500.jpg');
  return {
    trackId:    'jm_' + t.id,
    trackName:  t.name        || 'Unknown',
    artistName: t.artist_name || 'Unknown',
    artworkUrl: art,
    durationMs: (t.duration || 0) * 1000,  // Jamendo → секунды, нам нужны мс
    previewUrl: t.audio || t.audiodownload || null,  // ПОЛНЫЙ трек
    source:     'jamendo',
  };
}

/* ═══════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  loadPersisted();
  initTabs();
  initSearchSources();
  initSearch();
  initGenreChips();
  initMiniPlayer();
  initFullPlayer();
  initPlaylists();
  initButtons();
  initTheme();
  initAudio();
  loadCharts('pop');
  updateTabIndicator();
  renderLibrary();
  renderPlaylists();
});

/* ── Tabs ── */
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab =>
    tab.addEventListener('click', () => switchTab(tab.dataset.tab))
  );
}
function switchTab(name) {
  if (state.activeTab === name) return;
  const prev = document.querySelector('.page.active');
  if (prev) {
    prev.classList.remove('active');
    prev.classList.add('exit-left');
    setTimeout(() => prev.classList.remove('exit-left'), 340);
  }
  state.activeTab = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  const next = $('page-' + name);
  if (next) {
    next.style.transform = 'translateX(22px)';
    requestAnimationFrame(() => next.classList.add('active'));
  }
  updateTabIndicator();
}
function updateTabIndicator() {
  const at = document.querySelector('.tab.active');
  const bar = $('tab-bar');
  if (!at || !bar) return;
  const tr = at.getBoundingClientRect();
  const br = bar.getBoundingClientRect();
  const ind = $('tab-indicator');
  ind.style.left  = (tr.left - br.left) + 'px';
  ind.style.width = tr.width + 'px';
}
window.addEventListener('resize', updateTabIndicator);

/* ── Genre chips (charts) ── */
function initGenreChips() {
  $('genre-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.activeGenre = chip.dataset.genre;
    loadCharts(chip.dataset.genre);
  });
}

/* ── Load charts ── */
async function loadCharts(genre) {
  const el = $('charts-list');
  el.innerHTML = '<div class="loading-state"><div class="loader"></div><p>Загружаем чарты…</p></div>';
  try {
    const tracks = state.chartsSource === 'jamendo'
      ? await jamendoCharts(genre, 25)
      : await iTunesCharts(genre, 25);
    state.charts = tracks;
    renderTrackList(el, tracks, 'charts');
  } catch(err) {
    console.error('Charts error:', err);
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <p class="empty-title">Ошибка загрузки</p>
      <p class="empty-sub">Проверьте интернет-соединение</p>
    </div>`;
  }
}

/* ── Search source pills ── */
function initSearchSources() {
  document.querySelectorAll('.src-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.src-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.searchSource = btn.dataset.src;
      // Re-run search if there's a query
      const val = $('search-input').value.trim();
      if (val) doSearch(val);
    });
  });
}

/* ── Search ── */
function initSearch() {
  const inp = $('search-input');
  const clr = $('search-clear');

  inp.addEventListener('input', () => {
    const val = inp.value.trim();
    if (val.length > 0) {
      clr.classList.remove('hidden');
    } else {
      clr.classList.add('hidden');
    }
    clearTimeout(state.searchTimer);
    if (!val) { showSearchHint(); return; }
    const res = $('search-results');
    res.innerHTML = '<div class="loading-state"><div class="loader"></div><p>Поиск…</p></div>';
    state.searchTimer = setTimeout(() => doSearch(val), 500);
  });

  // Also search on Enter key
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const val = inp.value.trim();
      if (val) { clearTimeout(state.searchTimer); doSearch(val); }
    }
  });

  clr.addEventListener('click', () => {
    inp.value = '';
    clr.classList.add('hidden');
    showSearchHint();
    inp.focus();
  });
}

async function doSearch(term) {
  const res = $('search-results');
  res.innerHTML = '<div class="loading-state"><div class="loader"></div><p>Ищем…</p></div>';
  try {
    let tracks = [];
    const src = state.searchSource;

    if (src === 'all') {
      // Run both in parallel
      const [itRes, jmRes] = await Promise.allSettled([
        iTunesSearch(term, 15),
        jamendoSearch(term, 15),
      ]);
      const it = itRes.status === 'fulfilled' ? itRes.value : [];
      const jm = jmRes.status === 'fulfilled' ? jmRes.value : [];
      // Interleave: 1 iTunes, 1 Jamendo, 1 iTunes, ...
      const maxLen = Math.max(it.length, jm.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < it.length) tracks.push(it[i]);
        if (i < jm.length) tracks.push(jm[i]);
      }
      // Show stats
      if (it.length || jm.length) {
        const stats = [];
        if (it.length) stats.push(`iTunes: ${it.length}`);
        if (jm.length) stats.push(`Jamendo: ${jm.length}`);
        res.innerHTML = `<p class="search-stats">${stats.join(' · ')}</p>`;
      } else {
        res.innerHTML = '';
      }
    } else if (src === 'jamendo') {
      tracks = await jamendoSearch(term, 25);
      res.innerHTML = '';
    } else {
      // iTunes (default)
      tracks = await iTunesSearch(term, 25);
      res.innerHTML = '';
    }

    state.searchResults = tracks;

    if (!tracks.length) {
      res.innerHTML = `<div class="empty-state">
        <div class="empty-icon">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
        <p class="empty-title">Ничего не найдено</p>
        <p class="empty-sub">Попробуйте другой запрос или другой источник</p>
      </div>`;
      return;
    }

    tracks.forEach((t, i) => res.appendChild(buildCard(t, i, 'search')));

  } catch(err) {
    console.error('Search error:', err);
    res.innerHTML = `<div class="empty-state">
      <p class="empty-title">Ошибка поиска</p>
      <p class="empty-sub">Проверьте интернет-соединение</p>
    </div>`;
  }
}

function showSearchHint() {
  $('search-results').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>
      <p class="empty-title">Начните поиск</p>
      <p class="empty-sub">
        <strong>iTunes</strong> — превью 30 сек, огромная база<br>
        <strong>Jamendo</strong> — полные треки бесплатно<br>
        <strong>Все сразу</strong> — результаты из обоих
      </p>
    </div>`;
}

/* ═══════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════ */
function renderTrackList(container, tracks, context) {
  if (!tracks?.length) {
    container.innerHTML = '<div class="empty-state"><p class="empty-title">Ничего не найдено</p></div>';
    return;
  }
  container.innerHTML = '';
  tracks.forEach((t, i) => container.appendChild(buildCard(t, i, context)));
}

const FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50'%3E%3Crect width='50' height='50' rx='12' fill='%231a1c2e'/%3E%3Cpath d='M25 18v9M21 31a4 4 0 1 0 8 0 4 4 0 0 0-8 0' stroke='%23475569' stroke-width='1.5' stroke-linecap='round' fill='none'/%3E%3C/svg%3E";

function buildCard(track, index, context) {
  const isPlaying = state.currentTrack?.trackId === track.trackId && state.isPlaying;
  const isLiked   = state.library.some(t => t.trackId === track.trackId);
  const dur       = fmtMs(track.durationMs);
  const srcCls    = track.source === 'jamendo' ? 'jm' : 'itl';
  const srcLabel  = track.source === 'jamendo' ? 'Jamendo' : 'iTunes';

  const div = document.createElement('div');
  div.className = 'track-card' + (isPlaying ? ' is-playing' : '');
  div.dataset.trackId = track.trackId;
  div.style.animationDelay = Math.min(index * 0.035, 0.7) + 's';

  div.innerHTML = `
    <span class="track-rank">${index + 1}</span>
    <div class="track-art-wrap">
      <img class="track-art"
           src="${esc(track.artworkUrl) || FALLBACK}"
           alt="" loading="lazy"
           onerror="this.src='${FALLBACK}'"/>
      <div class="art-ring"></div>
      <div class="playing-bars">
        <div class="bar"></div><div class="bar"></div>
        <div class="bar"></div><div class="bar"></div>
      </div>
    </div>
    <div class="track-info">
      <p class="track-name">${esc(track.trackName)}</p>
      <p class="track-artist">
        <span>${esc(track.artistName)}</span>
        <span class="src-tag ${srcCls}">${srcLabel}</span>
      </p>
    </div>
    ${dur ? `<span class="track-duration">${dur}</span>` : ''}
    <div class="track-actions">
      <button class="track-btn like-btn${isLiked ? ' liked' : ''}" title="В библиотеку">
        <svg width="16" height="16" viewBox="0 0 24 24"
             fill="${isLiked ? 'currentColor' : 'none'}"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
      <button class="track-btn add-pl-btn" title="В плейлист">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>`;

  div.addEventListener('click', e => {
    if (e.target.closest('.track-actions')) return;
    playFromList(listByCtx(context), index);
  });
  div.querySelector('.like-btn').addEventListener('click', e => {
    e.stopPropagation(); toggleLike(track); rerenderCards();
  });
  div.querySelector('.add-pl-btn').addEventListener('click', e => {
    e.stopPropagation(); openAddToPlaylist(track);
  });
  return div;
}

function listByCtx(ctx) {
  if (ctx === 'charts')  return state.charts;
  if (ctx === 'library') return state.library;
  if (ctx === 'search')  return state.searchResults;
  if (ctx?.startsWith('playlist:')) {
    return state.playlists.find(p => p.id === ctx.split(':')[1])?.tracks || [];
  }
  return [];
}

function rerenderCards() {
  document.querySelectorAll('.track-card').forEach(card => {
    const tid   = card.dataset.trackId;
    const liked = state.library.some(t => t.trackId === tid);
    const play  = state.currentTrack?.trackId === tid && state.isPlaying;
    card.classList.toggle('is-playing', !!play);
    const btn = card.querySelector('.like-btn');
    if (btn) {
      btn.classList.toggle('liked', liked);
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', liked ? 'currentColor' : 'none');
    }
  });
  updateMiniLike();
  updateFpLike();
}

/* ═══════════════════════════════════════════════════
   PLAYBACK
═══════════════════════════════════════════════════ */
function playFromList(list, index) {
  if (!list?.length) return;
  state.queue      = [...list];
  state.queueIndex = index;
  playTrack(state.queue[index]);
}

function playTrack(track) {
  if (!track) return;
  state.currentTrack = track;
  state.audio.pause();

  if (track.previewUrl) {
    state.audio.src    = track.previewUrl;
    state.audio.volume = ($('fp-volume')?.value || 80) / 100;
    const p = state.audio.play();
    if (p) p.catch(() => showToast('Не удалось воспроизвести'));
    state.isPlaying = true;
  } else {
    state.audio.src = '';
    state.isPlaying = false;
    showToast('Аудио недоступно для этого трека');
  }

  updateMiniPlayer();
  updateFullPlayer();
  updatePlayIcons();
  rerenderCards();

  const mp = $('mini-player');
  mp.classList.remove('hidden');
  requestAnimationFrame(() => mp.classList.add('visible'));
}

function togglePlay() {
  if (!state.currentTrack) return;
  if (state.audio.paused) {
    state.audio.play().catch(() => {});
    state.isPlaying = true;
  } else {
    state.audio.pause();
    state.isPlaying = false;
  }
  updatePlayIcons();
  rerenderCards();
}

function playNext() {
  if (!state.queue.length) return;
  const n = state.isShuffle
    ? Math.floor(Math.random() * state.queue.length)
    : (state.queueIndex + 1) % state.queue.length;
  state.queueIndex = n;
  playTrack(state.queue[n]);
}

function playPrev() {
  if (!state.queue.length) return;
  if (state.audio.currentTime > 3) { state.audio.currentTime = 0; return; }
  const p = (state.queueIndex - 1 + state.queue.length) % state.queue.length;
  state.queueIndex = p;
  playTrack(state.queue[p]);
}

/* ── Audio events ── */
function initAudio() {
  const a = state.audio;

  a.addEventListener('timeupdate', () => {
    if (!a.duration) return;
    const pct = (a.currentTime / a.duration) * 100;
    const mpf = $('mini-progress-fill');
    const fpf = $('fp-progress-fill');
    const fpc = $('fp-current');
    const fpd = $('fp-duration');
    if (mpf) mpf.style.width = pct + '%';
    if (fpf) fpf.style.width = pct + '%';
    if (fpc) fpc.textContent = fmtSec(a.currentTime);
    if (fpd) fpd.textContent = fmtSec(a.duration);
  });

  a.addEventListener('loadedmetadata', () => {
    const fpd = $('fp-duration');
    if (fpd && a.duration) fpd.textContent = fmtSec(a.duration);
    // Update track duration from actual audio metadata
    if (state.currentTrack && !state.currentTrack.durationMs && a.duration) {
      state.currentTrack.durationMs = a.duration * 1000;
    }
  });

  a.addEventListener('ended', () => {
    if (state.isRepeat) { a.currentTime = 0; a.play().catch(()=>{}); }
    else playNext();
  });

  a.addEventListener('play', () => {
    state.isPlaying = true;
    $('mini-player')?.classList.add('is-playing');
    updatePlayIcons(); rerenderCards();
  });

  a.addEventListener('pause', () => {
    state.isPlaying = false;
    $('mini-player')?.classList.remove('is-playing');
    updatePlayIcons(); rerenderCards();
  });

  a.addEventListener('error', (e) => {
    console.error('Audio error:', e);
    showToast('Ошибка воспроизведения — трек недоступен');
    state.isPlaying = false;
    updatePlayIcons();
  });
}

const PLAY_SVG  = '<polygon points="5 3 19 12 5 21 5 3"/>';
const PAUSE_SVG = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';

function updatePlayIcons() {
  const html = state.isPlaying ? PAUSE_SVG : PLAY_SVG;
  const mi   = $('mini-play-icon');
  const fpi  = $('fp-play-icon');
  if (mi)  mi.innerHTML  = html;
  if (fpi) fpi.innerHTML = html;
}

/* ── Mini player ── */
function initMiniPlayer() {
  $('mini-play').addEventListener('click', togglePlay);
  $('mini-next').addEventListener('click', playNext);
  $('mini-prev').addEventListener('click', playPrev);
  $('mini-open-player').addEventListener('click', openFullPlayer);
  $('mini-like').addEventListener('click', () => {
    if (state.currentTrack) { toggleLike(state.currentTrack); rerenderCards(); }
  });
}

function updateMiniPlayer() {
  const t = state.currentTrack;
  if (!t) return;
  const ma  = $('mini-art');
  const mt  = $('mini-title');
  const mar = $('mini-artist');
  if (ma)  ma.src             = t.artworkUrl || '';
  if (mt)  mt.textContent     = t.trackName  || '—';
  if (mar) mar.textContent    = t.artistName || '—';
  updateMiniLike();
}

function updateMiniLike() {
  const btn = $('mini-like');
  if (!btn || !state.currentTrack) return;
  const liked = state.library.some(t => t.trackId === state.currentTrack.trackId);
  btn.classList.toggle('liked', liked);
  const svg = btn.querySelector('svg');
  if (svg) svg.setAttribute('fill', liked ? 'currentColor' : 'none');
}

/* ── Full player ── */
function initFullPlayer() {
  $('fp-close').addEventListener('click', closeFullPlayer);
  $('fp-play').addEventListener('click',  togglePlay);
  $('fp-next').addEventListener('click',  playNext);
  $('fp-prev').addEventListener('click',  playPrev);
  $('fp-like').addEventListener('click',  () => {
    if (state.currentTrack) { toggleLike(state.currentTrack); rerenderCards(); }
  });
  $('fp-shuffle').addEventListener('click', () => {
    state.isShuffle = !state.isShuffle;
    $('fp-shuffle').classList.toggle('active', state.isShuffle);
    showToast(state.isShuffle ? 'Перемешивание включено' : 'Перемешивание выключено');
  });
  $('fp-repeat').addEventListener('click', () => {
    state.isRepeat = !state.isRepeat;
    $('fp-repeat').classList.toggle('active', state.isRepeat);
    showToast(state.isRepeat ? 'Повтор включён' : 'Повтор выключен');
  });
  $('fp-progress-track').addEventListener('click', e => {
    if (!state.audio.duration) return;
    const r   = $('fp-progress-track').getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    state.audio.currentTime = pct * state.audio.duration;
  });
  $('fp-volume').addEventListener('input', () => {
    state.audio.volume = $('fp-volume').value / 100;
  });
  $('fp-bg-blur').addEventListener('click', closeFullPlayer);
}

function openFullPlayer() {
  const fp = $('full-player');
  fp.classList.remove('hidden');
  requestAnimationFrame(() => {
    fp.classList.add('entering');
    requestAnimationFrame(() => {
      fp.classList.remove('entering');
      fp.classList.add('entered');
    });
  });
  updateFullPlayer();
}

function closeFullPlayer() {
  const fp = $('full-player');
  fp.classList.remove('entered');
  fp.classList.add('entering');
  setTimeout(() => { fp.classList.remove('entering'); fp.classList.add('hidden'); }, 400);
}

function updateFullPlayer() {
  const t = state.currentTrack;
  if (!t) return;
  $('fp-art').src            = t.artworkUrl || '';
  $('fp-title').textContent  = t.trackName  || '—';
  $('fp-artist').textContent = t.artistName || '—';

  const badge = $('fp-source-badge');
  if (badge) {
    if (t.source === 'jamendo') {
      badge.textContent = 'Jamendo — полный трек';
      badge.className   = 'fp-source-badge jm';
    } else {
      badge.textContent = 'iTunes — 30-сек превью';
      badge.className   = 'fp-source-badge itl';
    }
  }
  const glow = $('fp-art-glow');
  if (glow) glow.style.background = t.source === 'jamendo' ? '#10b981' : 'var(--acc)';

  const fpd = $('fp-duration');
  if (fpd && t.durationMs) fpd.textContent = fmtMs(t.durationMs);

  updateFpLike();
}

function updateFpLike() {
  const btn = $('fp-like');
  if (!btn || !state.currentTrack) return;
  const liked = state.library.some(t => t.trackId === state.currentTrack.trackId);
  btn.classList.toggle('liked', liked);
  const svg = btn.querySelector('svg');
  if (svg) svg.setAttribute('fill', liked ? 'currentColor' : 'none');
}

/* ── Library ── */
function toggleLike(track) {
  const idx = state.library.findIndex(t => t.trackId === track.trackId);
  if (idx > -1) { state.library.splice(idx, 1); showToast('Удалено из библиотеки'); }
  else          { state.library.unshift({...track}); showToast('Добавлено в библиотеку'); }
  save(); renderLibrary();
}

function renderLibrary() {
  const el = $('library-list');
  if (!el) return;
  if (!state.library.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
      </div>
      <p class="empty-title">Библиотека пуста</p>
      <p class="empty-sub">Найдите треки и добавьте через иконку сердца</p>
    </div>`;
    return;
  }
  renderTrackList(el, state.library, 'library');
}

/* ── Playlists ── */
function initPlaylists() {
  $('btn-new-playlist').addEventListener('click',     openPlaylistModal);
  $('playlist-cancel').addEventListener('click',      closePlaylistModal);
  $('playlist-modal-overlay').addEventListener('click', closePlaylistModal);
  $('playlist-create').addEventListener('click',      createPlaylist);
  $('playlist-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') createPlaylist(); });
  $('add-playlist-cancel').addEventListener('click',  closeAddModal);
  $('add-playlist-overlay').addEventListener('click', closeAddModal);
}

function openPlaylistModal() {
  $('playlist-modal').classList.remove('hidden');
  setTimeout(() => $('playlist-name-input').focus(), 50);
}
function closePlaylistModal() {
  $('playlist-modal').classList.add('hidden');
  $('playlist-name-input').value = '';
}
function createPlaylist() {
  const name = $('playlist-name-input').value.trim();
  if (!name) return;
  state.playlists.unshift({ id: 'pl_' + Date.now(), name, tracks: [] });
  save(); renderPlaylists(); closePlaylistModal(); showToast('Плейлист создан');
}

function renderPlaylists() {
  const grid = $('playlists-grid');
  if (!grid) return;
  if (!state.playlists.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
      </div>
      <p class="empty-title">Нет плейлистов</p>
      <p class="empty-sub">Нажмите + чтобы создать плейлист</p>
    </div>`;
    return;
  }
  grid.innerHTML = '';
  state.playlists.forEach((pl, i) => grid.appendChild(buildPlCard(pl, i)));
}

function buildPlCard(pl, i) {
  const div = document.createElement('div');
  div.className = 'playlist-card';
  div.style.animationDelay = (i * 0.06) + 's';
  let cover = '';
  if (pl.tracks.length >= 4) {
    cover = `<div class="playlist-cover-grid">${pl.tracks.slice(0,4).map(t=>`<img src="${esc(t.artworkUrl||'')}" alt="" onerror="this.style.background='var(--s3)'">`).join('')}</div>`;
  } else if (pl.tracks.length) {
    cover = `<img class="playlist-cover" src="${esc(pl.tracks[0].artworkUrl||'')}" alt="" onerror="this.style.background='var(--s3)'"/>`;
  } else {
    cover = `<div class="playlist-cover-empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
      </svg></div>`;
  }
  div.innerHTML = `${cover}<div class="playlist-info"><p class="playlist-name">${esc(pl.name)}</p><p class="playlist-count">${pl.tracks.length} треков</p></div>`;
  div.addEventListener('click', () => openPlaylistDetail(pl));
  return div;
}

function openPlaylistDetail(pl) {
  const page = $('page-playlists');
  page.innerHTML = `
    <div class="page-title-row" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
        <button class="icon-btn" id="pl-back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1 class="page-title" style="margin:0;font-size:28px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(pl.name)}</h1>
      </div>
    </div>
    <div class="action-row">
      <button class="btn-primary" id="pl-play">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Воспроизвести
      </button>
      <button class="btn-secondary" id="pl-shuffle">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
          <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
        </svg>
        Перемешать
      </button>
    </div>
    <div id="pl-track-list"></div>`;

  renderTrackList($('pl-track-list'), pl.tracks, 'playlist:' + pl.id);

  $('pl-back').addEventListener('click', () => {
    page.innerHTML = `
      <div class="page-title-row">
        <h1 class="page-title">ПЛЕЙ<span class="accent">ЛИСТЫ</span></h1>
        <button class="icon-btn" id="btn-new-playlist">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
      <div id="playlists-grid"></div>`;
    $('btn-new-playlist').addEventListener('click', openPlaylistModal);
    renderPlaylists();
  });
  $('pl-play').addEventListener('click',    () => playFromList(pl.tracks, 0));
  $('pl-shuffle').addEventListener('click', () => {
    if (!pl.tracks.length) return;
    playFromList(pl.tracks, Math.floor(Math.random() * pl.tracks.length));
  });
}

function openAddToPlaylist(track) {
  const list = $('add-playlist-list');
  if (!state.playlists.length) { showToast('Сначала создайте плейлист'); return; }
  list.innerHTML = '';
  state.playlists.forEach(pl => {
    const item = document.createElement('div');
    item.className = 'add-pl-item';
    const art = pl.tracks[0]?.artworkUrl || '';
    item.innerHTML = `
      <img class="add-pl-item-cover" src="${esc(art)}" alt="" onerror="this.style.background='var(--s3)'"/>
      <span class="add-pl-item-name">${esc(pl.name)}</span>
      <span class="add-pl-item-count">${pl.tracks.length} тр.</span>`;
    item.addEventListener('click', () => {
      if (pl.tracks.some(t => t.trackId === track.trackId)) {
        showToast('Уже в этом плейлисте');
      } else {
        pl.tracks.push({...track}); save();
        showToast(`Добавлено в "${pl.name}"`); renderPlaylists();
      }
      closeAddModal();
    });
    list.appendChild(item);
  });
  $('add-playlist-modal').classList.remove('hidden');
}
function closeAddModal() { $('add-playlist-modal').classList.add('hidden'); }

/* ── Buttons / theme / toast ── */
function initButtons() {
  $('charts-play-all').addEventListener('click',  () => { if (state.charts.length) playFromList(state.charts, 0); });
  $('charts-shuffle').addEventListener('click',   () => { if (!state.charts.length) return; state.isShuffle=true; playFromList(state.charts, Math.floor(Math.random()*state.charts.length)); });
  $('library-play-all').addEventListener('click', () => { if (state.library.length) playFromList(state.library, 0); });
  $('library-shuffle').addEventListener('click',  () => { if (!state.library.length) return; playFromList(state.library, Math.floor(Math.random()*state.library.length)); });
}

function initTheme() {
  $('btn-theme').addEventListener('click', () => {
    document.body.classList.toggle('light');
    showToast(document.body.classList.contains('light') ? 'Светлая тема' : 'Тёмная тема');
  });
}

let _tt = null;
function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  clearTimeout(_tt);
  _tt = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 320);
  }, 2400);
}
