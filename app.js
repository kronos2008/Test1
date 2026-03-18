/* ════════════════════════════════════════════
   SOUNDWAVE — app.js
   iTunes Search API (no key required)
   ════════════════════════════════════════════ */

'use strict';

/* ──────────────────────────────
   STATE
────────────────────────────── */
const state = {
  currentTrack:   null,
  queue:          [],
  queueIndex:     -1,
  isPlaying:      false,
  isShuffle:      false,
  isRepeat:       false,
  library:        [],   // liked tracks
  playlists:      [],   // [{id, name, tracks:[]}]
  charts:         [],
  searchResults:  [],
  activeTab:      'charts',
  audio:          new Audio(),
  searchTimer:    null,
  openPlaylistId: null, // for add-to-playlist context
};

/* ──────────────────────────────
   ELEMENTS
────────────────────────────── */
const $ = id => document.getElementById(id);
const tabs          = document.querySelectorAll('.tab');
const pages         = document.querySelectorAll('.page');
const tabIndicator  = $('tab-indicator');

const chartsList    = $('charts-list');
const genreChips    = $('genre-chips');
const libraryList   = $('library-list');
const playlistsGrid = $('playlists-grid');
const searchInput   = $('search-input');
const searchClear   = $('search-clear');
const searchResults = $('search-results');

const miniPlayer       = $('mini-player');
const miniPlayerInner  = document.querySelector('.mini-player-inner');
const miniArt          = $('mini-art');
const miniTitle        = $('mini-title');
const miniArtist       = $('mini-artist');
const miniProgressFill = $('mini-progress-fill');
const miniPlayIcon     = $('mini-play-icon');
const miniOpenPlayer   = $('mini-open-player');

const fullPlayer    = $('full-player');
const fpArt         = $('fp-art');
const fpTitle       = $('fp-title');
const fpArtist      = $('fp-artist');
const fpBgBlur      = $('fp-bg-blur');
const fpProgressFill= $('fp-progress-fill');
const fpProgressTrack=$('fp-progress-track');
const fpCurrent     = $('fp-current');
const fpDuration    = $('fp-duration');
const fpPlayIcon    = $('fp-play-icon');
const fpVolume      = $('fp-volume');

/* ──────────────────────────────
   INIT
────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  loadPersisted();
  initTabs();
  initMiniPlayer();
  initFullPlayer();
  initSearch();
  initGenreChips();
  initPlaylists();
  initButtons();
  initTheme();
  initAudio();
  loadCharts('pop');
  updateTabIndicator();
  renderLibrary();
  renderPlaylists();
});

/* ──────────────────────────────
   PERSIST
────────────────────────────── */
function loadPersisted() {
  try {
    const lib = localStorage.getItem('sw_library');
    if (lib) state.library = JSON.parse(lib);
    const pl = localStorage.getItem('sw_playlists');
    if (pl) state.playlists = JSON.parse(pl);
  } catch(e) { /* ignore */ }
}
function savePersisted() {
  localStorage.setItem('sw_library', JSON.stringify(state.library));
  localStorage.setItem('sw_playlists', JSON.stringify(state.playlists));
}

/* ──────────────────────────────
   TABS
────────────────────────────── */
function initTabs() {
  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

function switchTab(name) {
  if (state.activeTab === name) return;

  const prev = document.querySelector('.page.active');
  if (prev) {
    prev.classList.remove('active');
    prev.classList.add('exit-left');
    setTimeout(() => prev.classList.remove('exit-left'), 350);
  }

  state.activeTab = name;
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  const next = $('page-' + name);
  if (next) {
    next.style.transform = 'translateX(24px)';
    requestAnimationFrame(() => next.classList.add('active'));
  }
  updateTabIndicator();
}

function updateTabIndicator() {
  const activeTab = document.querySelector('.tab.active');
  if (!activeTab) return;
  const bar = document.getElementById('tab-bar');
  const tabRect = activeTab.getBoundingClientRect();
  const barRect = bar.getBoundingClientRect();
  tabIndicator.style.left  = (tabRect.left - barRect.left) + 'px';
  tabIndicator.style.width = tabRect.width + 'px';
}

/* ──────────────────────────────
   ITUNES API
────────────────────────────── */
async function searchITunes(term, limit = 20) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=${limit}&explicit=no`;
  const res = await fetch(url);
  const data = await res.json();
  return data.results || [];
}

async function topCharts(genre, limit = 20) {
  // iTunes top RSS feed (JSON)
  const genreMap = {
    'pop':        14,
    'hip-hop':    18,
    'rock':       21,
    'electronic': 7,
    'rnb':        15,
    'jazz':       11,
  };
  const gid = genreMap[genre] || 14;
  const url = `https://itunes.apple.com/us/rss/topsongs/limit=${limit}/genre=${gid}/json`;
  const res = await fetch(url);
  const data = await res.json();
  const entries = data?.feed?.entry || [];
  return entries.map(e => ({
    trackId:       e.id?.attributes?.['im:id'] || Math.random(),
    trackName:     e['im:name']?.label || 'Unknown',
    artistName:    e['im:artist']?.label || 'Unknown',
    artworkUrl100: e['im:image']?.[2]?.label || '',
    trackTimeMillis: 0,
    previewUrl:    null,  // RSS feed has no preview; we'll search iTunes for preview
    collectionName: e['im:collection']?.['im:name']?.label || '',
    itunesUrl:     e?.link?.attributes?.href || '',
  }));
}

async function enrichWithPreview(tracks) {
  // For top-chart tracks, fetch preview URLs by searching iTunes
  const enriched = await Promise.all(tracks.map(async t => {
    if (t.previewUrl) return t;
    try {
      const term = `${t.artistName} ${t.trackName}`;
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=1&explicit=no`;
      const res = await fetch(url);
      const data = await res.json();
      const match = data.results?.[0];
      if (match) {
        t.previewUrl     = match.previewUrl     || null;
        t.trackTimeMillis= match.trackTimeMillis|| 0;
        t.artworkUrl100  = match.artworkUrl100  || t.artworkUrl100;
        t.trackId        = match.trackId        || t.trackId;
      }
    } catch(e) { /* ignore */ }
    return t;
  }));
  return enriched;
}

/* ──────────────────────────────
   LOAD CHARTS
────────────────────────────── */
async function loadCharts(genre) {
  chartsList.innerHTML = '<div class="loading-state"><div class="loader"></div><p>Загружаем чарты…</p></div>';
  try {
    let tracks = await topCharts(genre, 20);
    // Enrich first 20 with previews (parallel, limited)
    tracks = await enrichWithPreview(tracks);
    state.charts = tracks;
    renderTrackList(chartsList, tracks, 'charts');
  } catch(e) {
    chartsList.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p class="empty-title">Ошибка загрузки</p><p class="empty-sub">Проверьте подключение к интернету</p></div>';
  }
}

/* ──────────────────────────────
   GENRE CHIPS
────────────────────────────── */
function initGenreChips() {
  genreChips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    loadCharts(chip.dataset.genre);
  });
}

/* ──────────────────────────────
   RENDER TRACK LIST
────────────────────────────── */
function renderTrackList(container, tracks, context) {
  if (!tracks.length) {
    container.innerHTML = '<div class="empty-state"><p class="empty-title">Ничего не найдено</p></div>';
    return;
  }
  container.innerHTML = '';
  tracks.forEach((track, i) => {
    const card = buildTrackCard(track, i, context);
    container.appendChild(card);
  });
}

function buildTrackCard(track, index, context) {
  const isPlaying = state.currentTrack?.trackId === track.trackId && state.isPlaying;
  const isLiked   = state.library.some(t => t.trackId === track.trackId);

  const div = document.createElement('div');
  div.className = 'track-card' + (isPlaying ? ' is-playing' : '');
  div.dataset.trackId = track.trackId;
  div.style.animationDelay = Math.min(index * 0.04, 0.6) + 's';

  const artSrc = track.artworkUrl100 || '';
  const dur = formatDuration(track.trackTimeMillis);

  div.innerHTML = `
    <span class="track-rank">${index + 1}</span>
    <div class="track-art-wrap">
      <img class="track-art" src="${artSrc}" alt="" loading="lazy" onerror="this.src=''" />
      <div class="art-ring"></div>
      <div class="playing-bars">
        <div class="bar"></div><div class="bar"></div>
        <div class="bar"></div><div class="bar"></div>
      </div>
    </div>
    <div class="track-info">
      <p class="track-name">${escHtml(track.trackName)}</p>
      <p class="track-artist">${escHtml(track.artistName)}</p>
    </div>
    ${dur ? `<span class="track-duration">${dur}</span>` : ''}
    <div class="track-actions">
      <button class="track-btn like-btn ${isLiked ? 'liked' : ''}" title="${isLiked ? 'Убрать из библиотеки' : 'В библиотеку'}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
      <button class="track-btn add-pl-btn" title="В плейлист">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
  `;

  // Play on card click (not action buttons)
  div.addEventListener('click', e => {
    if (e.target.closest('.track-actions')) return;
    const list = getListByContext(context);
    playTrackFromList(list, index);
  });

  // Like
  div.querySelector('.like-btn').addEventListener('click', e => {
    e.stopPropagation();
    toggleLike(track);
    rerenderAllCards();
  });

  // Add to playlist
  div.querySelector('.add-pl-btn').addEventListener('click', e => {
    e.stopPropagation();
    openAddToPlaylist(track);
  });

  return div;
}

function getListByContext(context) {
  if (context === 'charts')   return state.charts;
  if (context === 'library')  return state.library;
  if (context === 'search')   return state.searchResults;
  if (context && context.startsWith('playlist:')) {
    const id = context.split(':')[1];
    const pl = state.playlists.find(p => p.id === id);
    return pl ? pl.tracks : [];
  }
  return [];
}

function rerenderAllCards() {
  // Re-render like buttons on visible cards
  document.querySelectorAll('.track-card').forEach(card => {
    const tid = card.dataset.trackId;
    const liked = state.library.some(t => String(t.trackId) === String(tid));
    const btn = card.querySelector('.like-btn');
    if (!btn) return;
    btn.classList.toggle('liked', liked);
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', liked ? 'currentColor' : 'none');
  });
  // Highlight playing card
  document.querySelectorAll('.track-card').forEach(card => {
    const tid = card.dataset.trackId;
    const playing = state.currentTrack && String(state.currentTrack.trackId) === String(tid);
    card.classList.toggle('is-playing', playing && state.isPlaying);
  });
  updateMiniLike();
  updateFpLike();
}

/* ──────────────────────────────
   PLAYBACK
────────────────────────────── */
function playTrackFromList(list, index) {
  if (!list || !list.length) return;
  state.queue = [...list];
  state.queueIndex = index;
  playTrack(state.queue[index]);
}

function playTrack(track) {
  if (!track) return;
  state.currentTrack = track;
  state.audio.pause();

  if (track.previewUrl) {
    state.audio.src = track.previewUrl;
    state.audio.volume = fpVolume ? fpVolume.value / 100 : 0.8;
    state.audio.play().catch(() => {});
    state.isPlaying = true;
  } else {
    // No preview available — still show in player
    state.audio.src = '';
    state.isPlaying = false;
    showToast('Превью недоступно для этого трека');
  }

  updateMiniPlayer();
  updateFullPlayer();
  updatePlayIcons();
  rerenderAllCards();
  miniPlayer.classList.remove('hidden');
  miniPlayer.classList.add('visible');
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
  rerenderAllCards();
}

function playNext() {
  if (!state.queue.length) return;
  let next;
  if (state.isShuffle) {
    next = Math.floor(Math.random() * state.queue.length);
  } else {
    next = state.queueIndex + 1;
    if (next >= state.queue.length) next = 0;
  }
  state.queueIndex = next;
  playTrack(state.queue[next]);
}

function playPrev() {
  if (!state.queue.length) return;
  if (state.audio.currentTime > 3) {
    state.audio.currentTime = 0;
    return;
  }
  let prev = state.queueIndex - 1;
  if (prev < 0) prev = state.queue.length - 1;
  state.queueIndex = prev;
  playTrack(state.queue[prev]);
}

/* ──────────────────────────────
   AUDIO EVENTS
────────────────────────────── */
function initAudio() {
  const audio = state.audio;

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    if (miniProgressFill) miniProgressFill.style.width = pct + '%';
    if (fpProgressFill)   fpProgressFill.style.width   = pct + '%';
    if (fpCurrent)        fpCurrent.textContent = formatTime(audio.currentTime);
    if (fpDuration)       fpDuration.textContent = formatTime(audio.duration);
  });

  audio.addEventListener('ended', () => {
    if (state.isRepeat) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      playNext();
    }
  });

  audio.addEventListener('play', () => {
    state.isPlaying = true;
    miniPlayer.classList.add('is-playing');
    updatePlayIcons();
    rerenderAllCards();
  });

  audio.addEventListener('pause', () => {
    state.isPlaying = false;
    miniPlayer.classList.remove('is-playing');
    updatePlayIcons();
    rerenderAllCards();
  });
}

/* ──────────────────────────────
   MINI PLAYER
────────────────────────────── */
function initMiniPlayer() {
  // HTML is already in index.html — just bind events
  $('mini-play').addEventListener('click', togglePlay);
  $('mini-next').addEventListener('click', playNext);
  $('mini-prev').addEventListener('click', playPrev);
  $('mini-open-player').addEventListener('click', openFullPlayer);
  $('mini-like').addEventListener('click', () => {
    if (state.currentTrack) {
      toggleLike(state.currentTrack);
      rerenderAllCards();
    }
  });
}

function updateMiniPlayer() {
  const t = state.currentTrack;
  if (!t) return;
  const miniArtEl    = $('mini-art');
  const miniTitleEl  = $('mini-title');
  const miniArtistEl = $('mini-artist');
  if (miniArtEl)    miniArtEl.src        = t.artworkUrl100 || '';
  if (miniTitleEl)  miniTitleEl.textContent  = t.trackName   || '—';
  if (miniArtistEl) miniArtistEl.textContent = t.artistName  || '—';
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

/* ──────────────────────────────
   FULL PLAYER
────────────────────────────── */
function initFullPlayer() {
  $('fp-close').addEventListener('click', closeFullPlayer);
  $('fp-play').addEventListener('click', togglePlay);
  $('fp-next').addEventListener('click', playNext);
  $('fp-prev').addEventListener('click', playPrev);
  $('fp-like').addEventListener('click', () => {
    if (state.currentTrack) {
      toggleLike(state.currentTrack);
      rerenderAllCards();
    }
  });
  $('fp-shuffle').addEventListener('click', () => {
    state.isShuffle = !state.isShuffle;
    $('fp-shuffle').classList.toggle('active', state.isShuffle);
    showToast(state.isShuffle ? 'Перемешивание вкл.' : 'Перемешивание выкл.');
  });
  $('fp-repeat').addEventListener('click', () => {
    state.isRepeat = !state.isRepeat;
    $('fp-repeat').classList.toggle('active', state.isRepeat);
    showToast(state.isRepeat ? 'Повтор вкл.' : 'Повтор выкл.');
  });

  // Seek
  fpProgressTrack.addEventListener('click', e => {
    if (!state.audio.duration) return;
    const rect = fpProgressTrack.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    state.audio.currentTime = pct * state.audio.duration;
  });

  // Volume
  fpVolume.addEventListener('input', () => {
    state.audio.volume = fpVolume.value / 100;
  });

  // Overlay close
  fpBgBlur.addEventListener('click', closeFullPlayer);
}

function openFullPlayer() {
  fullPlayer.classList.remove('hidden');
  requestAnimationFrame(() => {
    fullPlayer.classList.add('entering');
    requestAnimationFrame(() => {
      fullPlayer.classList.remove('entering');
      fullPlayer.classList.add('entered');
    });
  });
  updateFullPlayer();
}

function closeFullPlayer() {
  fullPlayer.classList.remove('entered');
  fullPlayer.classList.add('entering');
  setTimeout(() => {
    fullPlayer.classList.remove('entering');
    fullPlayer.classList.add('hidden');
  }, 400);
}

function updateFullPlayer() {
  const t = state.currentTrack;
  if (!t) return;
  // Use high-res art (replace 100x100 → 600x600)
  const artHi = (t.artworkUrl100 || '').replace('100x100', '600x600');
  fpArt.src = artHi || t.artworkUrl100 || '';
  fpTitle.textContent  = t.trackName  || '—';
  fpArtist.textContent = t.artistName || '—';
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

/* ──────────────────────────────
   PLAY ICONS
────────────────────────────── */
const ICON_PLAY  = '<polygon points="5 3 19 12 5 21 5 3"/>';
const ICON_PAUSE = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';

function updatePlayIcons() {
  const icon = state.isPlaying ? ICON_PAUSE : ICON_PLAY;
  const mini = $('mini-play-icon');
  const fp   = $('fp-play-icon');
  if (mini) mini.innerHTML = icon;
  if (fp)   fp.innerHTML   = icon;
}

/* ──────────────────────────────
   SEARCH
────────────────────────────── */
function initSearch() {
  searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim();
    searchClear.classList.toggle('visible', val.length > 0);
    clearTimeout(state.searchTimer);
    if (!val) {
      showSearchHint();
      return;
    }
    searchResults.innerHTML = '<div class="loading-state"><div class="loader"></div><p>Поиск…</p></div>';
    state.searchTimer = setTimeout(() => doSearch(val), 500);
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.remove('visible');
    showSearchHint();
    searchInput.focus();
  });
}

async function doSearch(term) {
  try {
    const tracks = await searchITunes(term, 25);
    state.searchResults = tracks;
    renderTrackList(searchResults, tracks, 'search');
  } catch(e) {
    searchResults.innerHTML = '<div class="empty-state"><p class="empty-title">Ошибка поиска</p><p class="empty-sub">Проверьте подключение к интернету</p></div>';
  }
}

function showSearchHint() {
  searchResults.innerHTML = `
    <div class="empty-state search-hint">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>
      <p class="empty-title">Начните поиск</p>
      <p class="empty-sub">Введите название трека или исполнителя</p>
    </div>`;
}

/* ──────────────────────────────
   LIBRARY
────────────────────────────── */
function toggleLike(track) {
  const idx = state.library.findIndex(t => t.trackId === track.trackId);
  if (idx > -1) {
    state.library.splice(idx, 1);
    showToast('Удалено из библиотеки');
  } else {
    state.library.unshift({ ...track });
    showToast('Добавлено в библиотеку ❤️');
  }
  savePersisted();
  renderLibrary();
}

function renderLibrary() {
  if (!state.library.length) {
    libraryList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
        <p class="empty-title">Библиотека пуста</p>
        <p class="empty-sub">Найдите треки в поиске и добавьте через ❤️</p>
      </div>`;
    return;
  }
  renderTrackList(libraryList, state.library, 'library');
}

/* ──────────────────────────────
   PLAYLISTS
────────────────────────────── */
function initPlaylists() {
  $('btn-new-playlist').addEventListener('click', openPlaylistModal);
  $('playlist-cancel').addEventListener('click', closePlaylistModal);
  $('playlist-modal-overlay').addEventListener('click', closePlaylistModal);
  $('playlist-create').addEventListener('click', createPlaylist);
  $('playlist-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') createPlaylist();
  });

  $('add-playlist-cancel').addEventListener('click', closeAddToPlaylistModal);
  $('add-playlist-overlay').addEventListener('click', closeAddToPlaylistModal);
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
  const pl = { id: 'pl_' + Date.now(), name, tracks: [] };
  state.playlists.unshift(pl);
  savePersisted();
  renderPlaylists();
  closePlaylistModal();
  showToast('Плейлист создан 🎵');
}

function renderPlaylists() {
  if (!state.playlists.length) {
    playlistsGrid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
        </div>
        <p class="empty-title">Нет плейлистов</p>
        <p class="empty-sub">Нажмите + чтобы создать первый плейлист</p>
      </div>`;
    return;
  }
  playlistsGrid.innerHTML = '';
  state.playlists.forEach((pl, i) => {
    const card = buildPlaylistCard(pl, i);
    playlistsGrid.appendChild(card);
  });
}

function buildPlaylistCard(pl, index) {
  const div = document.createElement('div');
  div.className = 'playlist-card';
  div.style.animationDelay = (index * 0.06) + 's';

  let coverHtml = '';
  if (pl.tracks.length >= 4) {
    coverHtml = `<div class="playlist-cover-grid">
      ${pl.tracks.slice(0,4).map(t => `<img src="${t.artworkUrl100 || ''}" alt="" onerror="this.style.background='var(--s3)'">`).join('')}
    </div>`;
  } else if (pl.tracks.length > 0) {
    coverHtml = `<img class="playlist-cover" src="${pl.tracks[0].artworkUrl100 || ''}" alt="" onerror="this.style.background='var(--s3)'" />`;
  } else {
    coverHtml = `<div class="playlist-cover-empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
    </div>`;
  }

  div.innerHTML = `
    ${coverHtml}
    <div class="playlist-info">
      <p class="playlist-name">${escHtml(pl.name)}</p>
      <p class="playlist-count">${pl.tracks.length} треков</p>
    </div>`;

  div.addEventListener('click', () => openPlaylistDetail(pl));
  return div;
}

function openPlaylistDetail(pl) {
  // Switch to a temporary view inside playlists page
  const page = $('page-playlists');
  page.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
      <button class="icon-btn" id="pl-back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <h1 class="page-title" style="margin-bottom:0;font-size:30px">${escHtml(pl.name)}</h1>
    </div>
    <div class="action-row">
      <button class="btn-primary" id="pl-play">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Воспроизвести
      </button>
      <button class="btn-secondary" id="pl-shuffle">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
        Перемешать
      </button>
    </div>
    <div class="track-list" id="pl-track-list"></div>`;

  renderTrackList($('pl-track-list'), pl.tracks, 'playlist:' + pl.id);

  $('pl-back').addEventListener('click', () => {
    page.innerHTML = '';
    // Rebuild playlists page header
    page.innerHTML = `
      <div class="page-title-row">
        <h1 class="page-title">ПЛЕЙ<span class="accent">ЛИСТЫ</span></h1>
        <button class="icon-btn" id="btn-new-playlist" title="Создать плейлист">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      <div id="playlists-grid"></div>`;
    $('btn-new-playlist').addEventListener('click', openPlaylistModal);
    renderPlaylists();
  });

  $('pl-play').addEventListener('click', () => playTrackFromList(pl.tracks, 0));
  $('pl-shuffle').addEventListener('click', () => {
    if (!pl.tracks.length) return;
    const idx = Math.floor(Math.random() * pl.tracks.length);
    playTrackFromList(pl.tracks, idx);
  });
}

/* Add to playlist modal */
function openAddToPlaylist(track) {
  state.openPlaylistId = null;
  const list = $('add-playlist-list');
  if (!state.playlists.length) {
    showToast('Сначала создайте плейлист');
    return;
  }
  list.innerHTML = '';
  state.playlists.forEach(pl => {
    const item = document.createElement('div');
    item.className = 'add-pl-item';
    const art = pl.tracks[0]?.artworkUrl100 || '';
    item.innerHTML = `
      <img class="add-pl-item-cover" src="${art}" alt="" onerror="this.style.background='var(--s3)'" />
      <span class="add-pl-item-name">${escHtml(pl.name)}</span>
      <span class="add-pl-item-count">${pl.tracks.length} тр.</span>`;
    item.addEventListener('click', () => {
      const already = pl.tracks.some(t => t.trackId === track.trackId);
      if (already) {
        showToast('Уже в плейлисте');
      } else {
        pl.tracks.push({ ...track });
        savePersisted();
        showToast(`Добавлено в "${pl.name}"`);
        renderPlaylists();
      }
      closeAddToPlaylistModal();
    });
    list.appendChild(item);
  });
  $('add-playlist-modal').classList.remove('hidden');
}

function closeAddToPlaylistModal() {
  $('add-playlist-modal').classList.add('hidden');
}

/* ──────────────────────────────
   BUTTONS
────────────────────────────── */
function initButtons() {
  $('charts-play-all').addEventListener('click', () => {
    if (state.charts.length) playTrackFromList(state.charts, 0);
  });
  $('charts-shuffle').addEventListener('click', () => {
    if (!state.charts.length) return;
    state.isShuffle = true;
    const idx = Math.floor(Math.random() * state.charts.length);
    playTrackFromList(state.charts, idx);
  });
  $('library-play-all').addEventListener('click', () => {
    if (state.library.length) playTrackFromList(state.library, 0);
  });
  $('library-shuffle').addEventListener('click', () => {
    if (!state.library.length) return;
    const idx = Math.floor(Math.random() * state.library.length);
    playTrackFromList(state.library, idx);
  });
  $('btn-equalizer').addEventListener('click', () => {
    showToast('Эквалайзер скоро будет доступен 🎚️');
  });
}

/* ──────────────────────────────
   THEME
────────────────────────────── */
function initTheme() {
  $('btn-theme').addEventListener('click', () => {
    document.body.classList.toggle('light');
    showToast(document.body.classList.contains('light') ? 'Светлая тема' : 'Тёмная тема');
  });
}

/* ──────────────────────────────
   TOAST
────────────────────────────── */
let toastTimer = null;
function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 320);
  }, 2200);
}

/* ──────────────────────────────
   HELPERS
────────────────────────────── */
function formatDuration(ms) {
  if (!ms) return '';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ──────────────────────────────
   RESIZE — update indicator
────────────────────────────── */
window.addEventListener('resize', updateTabIndicator);
