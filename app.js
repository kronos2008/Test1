/* ================================================================
   CineWave — app.js
   БЕЗ API КЛЮЧЕЙ. Работает сразу после деплоя на GitHub Pages.

   Синхронизация:  jsonbin.io (бесплатно, без ключа для чтения)
   Поиск:          Invidious API (публичный YouTube прокси, без ключа)
   Видео:          YouTube embed / VK embed / прямые ссылки
   Чат:            jsonbin.io
   ================================================================ */

'use strict';

/* ── CONFIG ───────────────────────────────────────────────────── */
var CONFIG = {
  // Ваш GitHub Pages URL (замените на свой)
  APP_URL: 'https://kronos2008.github.io/Test1/',

  // Telegram Bot Username без @ (создайте через @BotFather — бесплатно)
  BOT_USERNAME: 'Newbot_testrobot',

  // JSONBin.io — БЕСПЛАТНО, без ключа для чтения
  // Зарегистрируйтесь на jsonbin.io, создайте один Bin, скопируйте ID
  // Пример ID: 64f1a2b3c4d5e6f7a8b9c0d1
  JSONBIN_BIN_ID: '69ba8a7956e12a1d7241995a',          // вставьте ваш Bin ID
  JSONBIN_KEY:    '$2a$10$K2JrAEYdKLNKGmlYs.CiUOHnWMPGrC.Qml8VW7jSBKo3K8Xe8wrZG',          // вставьте X-Access-Key (из jsonbin.io)

  // Публичные Invidious инстансы (YouTube без ключа)
  // Если один не работает — автоматически пробует следующий
  INVIDIOUS_INSTANCES: [
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
    'https://invidious.privacyredirect.com',
    'https://yt.cdaut.de',
  ],
};

/* ── СОСТОЯНИЕ ────────────────────────────────────────────────── */
var S = {
  tg:           null,
  user:         null,
  roomId:       null,
  isHost:       false,
  video:        null,
  inviteLink:   '',
  viewers:      {},

  ytPlayer:     null,
  ytReady:      false,
  playerReady:  false,

  syncTimer:    null,
  chatTimer:    null,
  presTimer:    null,
  chatCount:    0,
  invIdx:       0,    // текущий Invidious инстанс

  searchDebounce: null,
  vkDebounce:     null,
};

/* ── DOM HELPERS ──────────────────────────────────────────────── */
function el(id)   { return document.getElementById(id); }
function qs(sel)  { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

/* ── ЭКРАНЫ ───────────────────────────────────────────────────── */
function showScreen(name) {
  qsa('.screen.active').forEach(function(s) { s.classList.remove('active'); });
  var t = el('screen-' + name);
  if (!t) return;
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { t.classList.add('active'); });
  });
}

/* ── TOAST ────────────────────────────────────────────────────── */
var _toastT = null;
function toast(msg, ms) {
  ms = ms || 2600;
  var t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastT);
  _toastT = setTimeout(function() { t.classList.remove('show'); }, ms);
}

/* ── УТИЛИТЫ ──────────────────────────────────────────────────── */
function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}
function initials(name) {
  if (!name) return '?';
  var p = String(name).trim().split(/\s+/);
  return (p[0][0] || '').toUpperCase() + (p[1] ? p[1][0].toUpperCase() : '');
}
function escHtml(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function() { _fallbackCopy(text); });
  } else { _fallbackCopy(text); }
}
function _fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-200px;opacity:0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
}
function getUrlParam(k) {
  try { return new URLSearchParams(window.location.search).get(k); } catch(e) { return null; }
}
function now() { return Date.now(); }

/* ================================================================
   ХРАНИЛИЩЕ КОМНАТ
   Используем localStorage как основное хранилище +
   JSONBin.io как облачный бекенд для синхронизации между устройствами.

   Без JSONBin: работает только на одном устройстве (для теста).
   С JSONBin (бесплатно): полная синхронизация между друзьями.
   ================================================================ */

var STORE = {

  /* ── localStorage (всегда доступен) ── */
  lsKey: function(roomId) { return 'cw_room_' + roomId; },
  lsChatKey: function(roomId) { return 'cw_chat_' + roomId; },

  lsGet: function(key) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch(e) { return null; }
  },
  lsSet: function(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
  },

  /* ── JSONBin.io (облако, без ключа для чтения) ── */
  jbUrl: function() {
    if (!CONFIG.JSONBIN_BIN_ID) return null;
    return 'https://api.jsonbin.io/v3/b/' + CONFIG.JSONBIN_BIN_ID;
  },
  jbHeaders: function() {
    var h = { 'Content-Type': 'application/json' };
    if (CONFIG.JSONBIN_KEY) h['X-Access-Key'] = CONFIG.JSONBIN_KEY;
    return h;
  },

  jbRead: function() {
    var url = STORE.jbUrl();
    if (!url) return Promise.resolve(null);
    return fetch(url + '/latest', { headers: STORE.jbHeaders() })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) { return d && d.record ? d.record : null; })
      .catch(function() { return null; });
  },

  jbWrite: function(data) {
    var url = STORE.jbUrl();
    if (!url) return Promise.resolve(null);
    return fetch(url, {
      method: 'PUT',
      headers: STORE.jbHeaders(),
      body: JSON.stringify(data),
    }).catch(function() {});
  },

  /* ── Запись комнаты ── */
  saveRoom: function(roomId, data) {
    // всегда в localStorage
    STORE.lsSet(STORE.lsKey(roomId), data);
    // и в облако если настроено
    STORE.jbRead().then(function(cloud) {
      var all = cloud || {};
      all['room_' + roomId] = data;
      return STORE.jbWrite(all);
    }).catch(function() {});
  },

  /* ── Чтение комнаты ── */
  getRoom: function(roomId) {
    // сначала пробуем облако
    return STORE.jbRead().then(function(cloud) {
      if (cloud && cloud['room_' + roomId]) return cloud['room_' + roomId];
      // фолбэк: localStorage
      return STORE.lsGet(STORE.lsKey(roomId));
    }).catch(function() {
      return STORE.lsGet(STORE.lsKey(roomId));
    });
  },

  /* ── Patch состояния (sync) ── */
  patchState: function(roomId, state) {
    // localStorage немедленно
    var room = STORE.lsGet(STORE.lsKey(roomId)) || {};
    room.state = state;
    STORE.lsSet(STORE.lsKey(roomId), room);
    // облако асинхронно
    STORE.jbRead().then(function(cloud) {
      var all = cloud || {};
      if (!all['room_' + roomId]) all['room_' + roomId] = {};
      all['room_' + roomId].state = state;
      return STORE.jbWrite(all);
    }).catch(function() {});
  },

  /* ── Добавить сообщение ── */
  pushChat: function(roomId, msg) {
    var key  = STORE.lsChatKey(roomId);
    var msgs = STORE.lsGet(key) || [];
    msgs.push(msg);
    if (msgs.length > 200) msgs = msgs.slice(-200);
    STORE.lsSet(key, msgs);

    // в облако
    STORE.jbRead().then(function(cloud) {
      var all = cloud || {};
      var chatKey = 'chat_' + roomId;
      var arr = all[chatKey] || [];
      arr.push(msg);
      if (arr.length > 200) arr = arr.slice(-200);
      all[chatKey] = arr;
      return STORE.jbWrite(all);
    }).catch(function() {});
  },

  /* ── Получить чат ── */
  getChat: function(roomId) {
    return STORE.jbRead().then(function(cloud) {
      if (cloud && cloud['chat_' + roomId]) return cloud['chat_' + roomId];
      return STORE.lsGet(STORE.lsChatKey(roomId)) || [];
    }).catch(function() {
      return STORE.lsGet(STORE.lsChatKey(roomId)) || [];
    });
  },

  /* ── Добавить зрителя ── */
  addViewer: function(roomId, viewer) {
    STORE.jbRead().then(function(cloud) {
      var all = cloud || {};
      if (!all['room_' + roomId]) all['room_' + roomId] = {};
      if (!all['room_' + roomId].viewers) all['room_' + roomId].viewers = {};
      all['room_' + roomId].viewers[String(viewer.id)] = viewer;
      // тоже в localStorage
      var room = STORE.lsGet(STORE.lsKey(roomId)) || {};
      if (!room.viewers) room.viewers = {};
      room.viewers[String(viewer.id)] = viewer;
      STORE.lsSet(STORE.lsKey(roomId), room);
      return STORE.jbWrite(all);
    }).catch(function() {
      var room = STORE.lsGet(STORE.lsKey(roomId)) || {};
      if (!room.viewers) room.viewers = {};
      room.viewers[String(viewer.id)] = viewer;
      STORE.lsSet(STORE.lsKey(roomId), room);
    });
  },
};

/* ── TELEGRAM INIT ────────────────────────────────────────────── */
function initTelegram() {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready(); tg.expand();
    try { tg.setHeaderColor('#0A0A0F'); } catch(e) {}
    try { tg.setBackgroundColor('#0A0A0F'); } catch(e) {}
    S.tg = tg;
    var u = (tg.initDataUnsafe && tg.initDataUnsafe.user) || {};
    S.user = {
      id:         u.id          || ('guest_' + uid()),
      first_name: u.first_name  || 'Гость',
      last_name:  u.last_name   || '',
      username:   u.username    || 'guest',
      photo_url:  u.photo_url   || null,
    };
  } else {
    S.user = { id: 'dev_' + uid(), first_name: 'Я', last_name: '', username: 'me', photo_url: null };
  }
  renderUserBadge();
  handleStartParam();
}

function renderUserBadge() {
  var u = S.user;
  el('user-name-sm').textContent = u.first_name;
  var av = el('user-avatar-sm');
  if (u.photo_url) {
    av.innerHTML = '<img src="' + u.photo_url + '" alt=""/>';
  } else {
    av.textContent = initials(u.first_name + ' ' + u.last_name);
  }
}

function handleStartParam() {
  var param = null;
  if (S.tg && S.tg.initDataUnsafe && S.tg.initDataUnsafe.start_param)
    param = S.tg.initDataUnsafe.start_param;
  if (!param) param = getUrlParam('room');
  if (!param) param = getUrlParam('startapp');

  if (param && param.indexOf('room_') === 0) {
    joinRoom(param.replace('room_', ''));
  } else {
    showScreen('home');
    loadDemoVideos('#vk-results');
  }
}

/* ── ROOM CREATE ──────────────────────────────────────────────── */
function createRoom(video) {
  var roomId = uid();
  S.roomId  = roomId;
  S.isHost  = true;
  S.video   = video;

  var roomData = {
    id:        roomId,
    hostId:    String(S.user.id),
    video:     video,
    state:     { playing: false, time: 0, updatedAt: now() },
    viewers:   {},
    createdAt: now(),
  };
  roomData.viewers[String(S.user.id)] = makeViewerData();

  STORE.saveRoom(roomId, roomData);
  startRoom(roomId, video);
}

/* ── ROOM JOIN ────────────────────────────────────────────────── */
function joinRoom(roomId) {
  toast('Подключение к комнате...');
  STORE.getRoom(roomId).then(function(room) {
    if (!room) {
      toast('Комната не найдена или истекла');
      showScreen('home');
      loadDemoVideos('#vk-results');
      return;
    }
    S.roomId = roomId;
    S.isHost = (room.hostId === String(S.user.id));
    S.video  = room.video;
    STORE.addViewer(roomId, makeViewerData());
    startRoom(roomId, room.video);
  }).catch(function() {
    toast('Ошибка подключения');
    showScreen('home');
    loadDemoVideos('#vk-results');
  });
}

function makeViewerData() {
  return {
    id:       String(S.user.id),
    name:     S.user.first_name,
    username: S.user.username || '',
    photo:    S.user.photo_url || '',
    joinedAt: now(),
    online:   true,
  };
}

/* ── ROOM START ───────────────────────────────────────────────── */
function startRoom(roomId, video) {
  showScreen('room');
  el('chat-messages').innerHTML = '<div class="chat-system">Комната создана. Пригласи друзей!</div>';
  S.chatCount = 0;
  updateInviteLink(roomId);
  loadPlayer(video);
  startSyncLoop(roomId);
  startChatLoop(roomId);
  startPresenceLoop(roomId);
  showMyRooms();
}

function updateInviteLink(roomId) {
  var link = S.tg
    ? 'https://t.me/' + CONFIG.BOT_USERNAME + '?startapp=room_' + roomId
    : CONFIG.APP_URL + '?room=' + roomId;
  S.inviteLink = link;
  el('room-link-text').textContent = link;
}

/* ── PLAYER ───────────────────────────────────────────────────── */
function loadPlayer(video) {
  if (!video) return;
  el('player-placeholder').style.display = 'flex';
  el('iframe-player').style.display = 'none';
  el('iframe-player').src = '';
  el('video-player').style.display = 'none';
  el('video-player').src = '';
  el('yt-player-div').innerHTML = '';
  S.playerReady = false;
  S.ytPlayer = null;

  if (video.source === 'youtube') {
    loadYouTube(video.id);
  } else if (video.source === 'vk') {
    loadIframe(buildVkEmbed(video));
  } else if (video.source === 'rutube') {
    loadIframe('https://rutube.ru/play/embed/' + video.id);
  } else if (video.source === 'direct') {
    loadDirect(video.url);
  } else if (video.embedUrl) {
    loadIframe(video.embedUrl);
  }
}

function buildVkEmbed(v) {
  if (v.player) return v.player;
  return 'https://vk.com/video_ext.php?oid=' + (v.owner_id||'') + '&id=' + (v.vid||v.id||'') + '&hash=' + (v.access_key||'') + '&hd=1&autoplay=1';
}

function loadYouTube(videoId) {
  if (!videoId) return;
  if (window.YT && window.YT.Player) {
    _createYTPlayer(videoId);
  } else {
    window._ytPendingId = videoId;
    if (!window._ytScriptAdded) {
      window._ytScriptAdded = true;
      var tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  }
}

window.onYouTubeIframeAPIReady = function() {
  S.ytReady = true;
  if (window._ytPendingId) {
    _createYTPlayer(window._ytPendingId);
    window._ytPendingId = null;
  }
};

function _createYTPlayer(videoId) {
  var container = el('yt-player-div');
  if (!container) return;
  container.innerHTML = '';
  el('player-placeholder').style.display = 'none';
  try {
    S.ytPlayer = new YT.Player('yt-player-div', {
      videoId: videoId,
      playerVars: { autoplay:1, controls:1, rel:0, modestbranding:1, playsinline:1 },
      events: {
        onReady: function(e) {
          S.playerReady = true;
          e.target.playVideo();
          if (!S.isHost) syncApplyOnce();
        },
        onStateChange: function(e) {
          if (!S.isHost) return;
          if (e.data === YT.PlayerState.PLAYING) pushSync(true,  e.target.getCurrentTime());
          if (e.data === YT.PlayerState.PAUSED)  pushSync(false, e.target.getCurrentTime());
        },
        onError: function() {
          toast('Не удалось загрузить видео');
          el('player-placeholder').style.display = 'flex';
        },
      },
    });
  } catch(e) {
    el('player-placeholder').style.display = 'flex';
  }
}

function loadIframe(src) {
  if (!src) return;
  var iframe = el('iframe-player');
  iframe.src = src;
  iframe.style.display = 'block';
  el('player-placeholder').style.display = 'none';
  S.playerReady = true;
}

function loadDirect(url) {
  var vp = el('video-player');
  vp.src = url;
  vp.style.display = 'block';
  el('player-placeholder').style.display = 'none';
  S.playerReady = true;
  vp.play().catch(function() {});
  vp.onplay   = function() { if (S.isHost) pushSync(true,  vp.currentTime); };
  vp.onpause  = function() { if (S.isHost) pushSync(false, vp.currentTime); };
  vp.onseeked = function() { if (S.isHost) pushSync(!vp.paused, vp.currentTime); };
}

/* ── SYNC ─────────────────────────────────────────────────────── */
function startSyncLoop(roomId) {
  clearInterval(S.syncTimer);
  S.syncTimer = setInterval(function() {
    STORE.getRoom(roomId).then(function(room) {
      if (!room) return;
      if (room.viewers) { S.viewers = room.viewers; renderViewers(room.viewers); }
      if (!S.isHost && room.state) applySync(room.state);
    }).catch(function() {});
  }, 2500);
}

function pushSync(playing, time) {
  if (!S.roomId) return;
  var state = { playing: playing, time: time || 0, updatedAt: now() };
  STORE.patchState(S.roomId, state);
}

function applySync(state) {
  if (!S.playerReady) return;
  var age    = (now() - (state.updatedAt || now())) / 1000;
  var target = state.playing ? (state.time || 0) + age : (state.time || 0);

  if (S.ytPlayer && typeof S.ytPlayer.getCurrentTime === 'function') {
    try {
      var diff = Math.abs(S.ytPlayer.getCurrentTime() - target);
      if (diff > 3.5) { S.ytPlayer.seekTo(target, true); flashDesync(); }
      var yst = S.ytPlayer.getPlayerState();
      if (state.playing  && yst !== YT.PlayerState.PLAYING) S.ytPlayer.playVideo();
      if (!state.playing && yst === YT.PlayerState.PLAYING)  S.ytPlayer.pauseVideo();
    } catch(e) {}
    return;
  }

  var vp = el('video-player');
  if (vp && vp.src && vp.style.display !== 'none') {
    if (Math.abs(vp.currentTime - target) > 3.5) { vp.currentTime = target; flashDesync(); }
    if (state.playing  && vp.paused)  vp.play().catch(function() {});
    if (!state.playing && !vp.paused) vp.pause();
  }
}

function syncApplyOnce() {
  STORE.getRoom(S.roomId).then(function(room) {
    if (room && room.state) applySync(room.state);
  }).catch(function() {});
}

function flashDesync() {
  var ss = el('sync-status'), sl = el('sync-label');
  if (!ss || !sl) return;
  ss.classList.add('desynced');
  sl.textContent = 'Синхронизация...';
  setTimeout(function() { ss.classList.remove('desynced'); sl.textContent = 'Синхронизировано'; }, 2200);
}

/* ── PRESENCE ─────────────────────────────────────────────────── */
function startPresenceLoop(roomId) {
  clearInterval(S.presTimer);
  S.presTimer = setInterval(function() {
    STORE.addViewer(roomId, Object.assign(makeViewerData(), { online: true, lastSeen: now() }));
  }, 15000);
}

/* ── VIEWERS UI ───────────────────────────────────────────────── */
function renderViewers(viewers) {
  var keys = Object.keys(viewers);
  el('watch-count').textContent = keys.length;
  var row = el('viewers-row');
  row.innerHTML = '';
  keys.forEach(function(k) {
    var v = viewers[k];
    var d = document.createElement('div');
    d.className = 'viewer-avatar viewer-online';
    d.title = v.name || '';
    d.innerHTML = v.photo
      ? '<img src="' + escHtml(v.photo) + '" alt=""/>'
      : initials(v.name || 'G');
    row.appendChild(d);
  });
}

/* ── CHAT ─────────────────────────────────────────────────────── */
function startChatLoop(roomId) {
  clearInterval(S.chatTimer);
  S.chatTimer = setInterval(function() {
    STORE.getChat(roomId).then(function(msgs) {
      if (!msgs) return;
      if (msgs.length !== S.chatCount) {
        S.chatCount = msgs.length;
        renderChat(msgs.slice(-80));
      }
    }).catch(function() {});
  }, 2000);
}

function renderChat(msgs) {
  var c = el('chat-messages');
  var atBottom = (c.scrollHeight - c.scrollTop - c.clientHeight) < 90;
  c.innerHTML = '';
  if (!msgs || !msgs.length) {
    c.innerHTML = '<div class="chat-system">Комната создана. Пригласи друзей!</div>';
    return;
  }
  msgs.forEach(function(msg) {
    var isOwn = (String(msg.userId) === String(S.user.id));
    var outer = document.createElement('div');
    outer.className = 'chat-msg' + (isOwn ? ' own' : '');

    var av = document.createElement('div');
    av.className = 'msg-avatar';
    av.innerHTML = msg.photo ? '<img src="' + escHtml(msg.photo) + '" alt=""/>' : initials(msg.name || 'G');

    var body = document.createElement('div');
    body.className = 'msg-body';
    if (!isOwn) {
      var nm = document.createElement('div');
      nm.className = 'msg-name';
      nm.textContent = msg.name || 'Гость';
      body.appendChild(nm);
    }
    var tx = document.createElement('div');
    tx.className = 'msg-text';
    tx.textContent = msg.text || '';
    body.appendChild(tx);

    outer.appendChild(av);
    outer.appendChild(body);
    c.appendChild(outer);
  });
  if (atBottom) c.scrollTop = c.scrollHeight;
}

function sendMessage(text) {
  text = (text || '').trim();
  if (!text || !S.roomId) return;
  STORE.pushChat(S.roomId, {
    userId: String(S.user.id),
    name:   S.user.first_name,
    photo:  S.user.photo_url || '',
    text:   text,
    ts:     now(),
  });
  // Показать немедленно в своём чате
  STORE.getChat(S.roomId).then(function(msgs) {
    S.chatCount = (msgs || []).length;
    renderChat((msgs || []).slice(-80));
  });
}

/* ================================================================
   ПОИСК ФИЛЬМОВ — Invidious (публичный YouTube прокси, без ключа)
   ================================================================ */
function searchYouTube(query, containerId) {
  containerId = containerId || '#search-results';
  var c = qs(containerId);
  if (!c) return;
  c.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Поиск...</p></div>';
  _invidiousSearch(query, 0, containerId);
}

function _invidiousSearch(query, idx, containerId) {
  var instances = CONFIG.INVIDIOUS_INSTANCES;
  if (idx >= instances.length) {
    // все инстансы не ответили — показываем демо
    loadDemoVideos(containerId);
    return;
  }
  var base = instances[idx];
  var url  = base + '/api/v1/search?q=' + encodeURIComponent(query + ' фильм полностью') + '&type=video&fields=videoId,title,author,lengthSeconds,videoThumbnails';

  fetch(url, { signal: _makeAbortSignal(7000) })
    .then(function(r) { return r.ok ? r.json() : Promise.reject('bad'); })
    .then(function(data) {
      if (!Array.isArray(data) || !data.length) throw new Error('empty');
      var videos = data.slice(0, 12).map(function(item) {
        var thumb = '';
        if (item.videoThumbnails && item.videoThumbnails.length) {
          var mq = item.videoThumbnails.find(function(t) { return t.quality === 'medium'; });
          thumb = (mq || item.videoThumbnails[0]).url || '';
        }
        return {
          source:   'youtube',
          id:       item.videoId,
          title:    item.title || '',
          views:    item.author || '',
          thumb:    thumb,
          embedUrl: 'https://www.youtube.com/embed/' + item.videoId + '?autoplay=1&rel=0',
        };
      });
      renderVideoGrid(videos, containerId);
    })
    .catch(function() {
      // пробуем следующий инстанс
      _invidiousSearch(query, idx + 1, containerId);
    });
}

function _makeAbortSignal(ms) {
  try {
    var ctrl = new AbortController();
    setTimeout(function() { ctrl.abort(); }, ms);
    return ctrl.signal;
  } catch(e) { return undefined; }
}

/* ── VK ПОИСК (embed через публичный URL, без токена) ────────── */
function searchVK(query) {
  // VK API требует токен даже для чтения.
  // Без токена — ищем через Invidious с тем же запросом
  searchYouTube(query, '#vk-results');
}

/* ── RENDER GRID ──────────────────────────────────────────────── */
function renderVideoGrid(videos, containerId) {
  var c = qs(containerId);
  if (!c) return;
  c.innerHTML = '';
  if (!videos || !videos.length) {
    c.innerHTML = '<div class="no-results">Ничего не найдено. Попробуйте другой запрос.</div>';
    return;
  }
  videos.forEach(function(v) { c.appendChild(buildVideoCard(v)); });
}

function buildVideoCard(video) {
  var card = document.createElement('div');
  card.className = 'video-card';
  var thumb = video.thumb || '';
  if (!thumb && video.source === 'youtube' && video.id) {
    thumb = 'https://img.youtube.com/vi/' + video.id + '/mqdefault.jpg';
  }
  card.innerHTML = '<div class="video-thumb">'
    + (thumb ? '<img src="' + escHtml(thumb) + '" alt="" loading="lazy" onerror="this.style.opacity=0"/>' : '')
    + '<div class="thumb-play">'
    + '<svg width="32" height="32" viewBox="0 0 32 32" fill="none">'
    + '<circle cx="16" cy="16" r="16" fill="rgba(0,0,0,.45)"/>'
    + '<path d="M12 10l12 6-12 6V10z" fill="white"/>'
    + '</svg></div></div>'
    + '<div class="video-meta">'
    + '<div class="video-title">' + escHtml(video.title || 'Видео') + '</div>'
    + '<div class="video-views">' + escHtml(video.views || '') + '</div>'
    + '</div>';
  card.addEventListener('click', function() { onVideoSelected(video); });
  return card;
}

function onVideoSelected(video) {
  S.video = video;
  createRoom(video);
}

/* ── ДЕМО ВИДЕО ───────────────────────────────────────────────── */
var DEMO = [
  { id:'LXb3EKWsInQ', title:'Inception — Full Movie',       views:'12M views' },
  { id:'GnSFL_0lh8s', title:'Interstellar — Trailer',       views:'45M views' },
  { id:'hA6hldpSTF8', title:'The Dark Knight Rises',        views:'20M views' },
  { id:'2AHeRx4KR6Q', title:'Dune (2021) — Full Movie',     views:'8M views'  },
  { id:'EXeTwQWrcwY', title:'Blade Runner 2049',            views:'15M views' },
  { id:'v9SHJFXHkzQ', title:'Avengers: Endgame',           views:'98M views' },
];
function loadDemoVideos(containerId) {
  renderVideoGrid(DEMO.map(function(v) {
    return {
      source:   'youtube',
      id:       v.id,
      title:    v.title,
      views:    v.views,
      thumb:    'https://img.youtube.com/vi/' + v.id + '/mqdefault.jpg',
      embedUrl: 'https://www.youtube.com/embed/' + v.id + '?autoplay=1&rel=0',
    };
  }), containerId);
}

/* ── ПАРСЕР URL ───────────────────────────────────────────────── */
function parseVideoUrl(url) {
  url = (url || '').trim();
  if (!url) return null;
  var yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return { source:'youtube', id:yt[1], title:'YouTube видео', thumb:'https://img.youtube.com/vi/'+yt[1]+'/mqdefault.jpg', embedUrl:'https://www.youtube.com/embed/'+yt[1]+'?autoplay=1' };

  var vk = url.match(/vk\.com\/video(-?\d+)_(\d+)/);
  if (vk) return { source:'vk', owner_id:vk[1], vid:vk[2], title:'VK видео', thumb:'', player:'https://vk.com/video_ext.php?oid='+vk[1]+'&id='+vk[2]+'&hd=1&autoplay=1' };

  var rt = url.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rt) return { source:'rutube', id:rt[1], title:'RuTube видео', thumb:'', embedUrl:'https://rutube.ru/play/embed/'+rt[1] };

  if (/\.(mp4|webm|ogv|m3u8)(\?.*)?$/i.test(url)) return { source:'direct', url:url, title:'Видео' };
  if (/^https?:\/\//i.test(url)) return { source:'iframe', embedUrl:url, title:'Видео' };
  return null;
}

/* ── INVITE MODAL ─────────────────────────────────────────────── */
function openInviteModal() {
  el('room-link-text').textContent = S.inviteLink || 'Генерация...';
  el('invite-modal').style.display = 'flex';
}
function closeInviteModal() {
  el('invite-modal').style.display = 'none';
}

/* ── МОИ КОМНАТЫ ──────────────────────────────────────────────── */
function showMyRooms() {
  if (!S.roomId || !S.video) return;
  var section = el('rooms-section');
  var list    = el('rooms-list');
  if (!section || !list) return;
  section.style.display = 'block';
  var card = document.createElement('div');
  card.className = 'room-card';
  card.innerHTML = '<div class="room-thumb">'
    + (S.video.thumb ? '<img src="' + escHtml(S.video.thumb) + '" alt=""/>' : '')
    + '</div>'
    + '<div class="room-card-info">'
    + '<div class="room-card-title">' + escHtml(S.video.title || 'Комната') + '</div>'
    + '<div class="room-card-meta">ID: ' + S.roomId + '</div>'
    + '</div>'
    + '<div class="room-live-badge">LIVE</div>';
  card.addEventListener('click', function() { showScreen('room'); });
  list.innerHTML = '';
  list.appendChild(card);
}

/* ── LEAVE ROOM ───────────────────────────────────────────────── */
function leaveRoom() {
  clearInterval(S.syncTimer);
  clearInterval(S.chatTimer);
  clearInterval(S.presTimer);
  S.syncTimer = S.chatTimer = S.presTimer = null;

  var iframe = el('iframe-player');
  iframe.src = ''; iframe.style.display = 'none';

  var vp = el('video-player');
  vp.pause(); vp.src = ''; vp.style.display = 'none';

  if (S.ytPlayer && typeof S.ytPlayer.destroy === 'function') {
    try { S.ytPlayer.destroy(); } catch(e) {}
  }
  S.ytPlayer = null; S.playerReady = false;
  el('yt-player-div').innerHTML = '';
  el('player-placeholder').style.display = 'flex';
  S.roomId = null;
  showScreen('home');
}

/* ── ПРИВЯЗКА СОБЫТИЙ ─────────────────────────────────────────── */
function bindEvents() {

  // Главный экран
  el('btn-vk').addEventListener('click', function() {
    showScreen('vk');
    if (!el('vk-results').querySelector('.video-card')) {
      searchVK('фильмы 2024');
    }
  });
  el('btn-search').addEventListener('click', function() { showScreen('search'); });
  el('btn-url').addEventListener('click', function() { showScreen('url'); });

  // VK экран
  el('close-vk').addEventListener('click', function() { showScreen('home'); });
  el('vk-search-input').addEventListener('input', function(e) {
    clearTimeout(S.vkDebounce);
    var v = e.target.value.trim();
    if (v.length < 2) return;
    S.vkDebounce = setTimeout(function() { searchVK(v); }, 500);
  });
  qsa('.cat-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      qsa('.cat-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      searchVK(btn.dataset.q);
    });
  });

  // Поиск
  el('close-search').addEventListener('click', function() { showScreen('home'); });
  el('search-input').addEventListener('input', function(e) {
    clearTimeout(S.searchDebounce);
    var v = e.target.value.trim();
    if (v.length < 2) return;
    S.searchDebounce = setTimeout(function() { searchYouTube(v, '#search-results'); }, 500);
  });
  qsa('.src-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      qsa('.src-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var q = el('search-input').value.trim();
      if (q.length > 1) searchYouTube(q, '#search-results');
    });
  });

  // URL
  el('close-url').addEventListener('click', function() { showScreen('home'); });
  el('url-go').addEventListener('click', handleUrlSubmit);
  el('url-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleUrlSubmit();
  });
  qsa('.chip').forEach(function(c) {
    c.addEventListener('click', function() { el('url-input').value = c.dataset.url; });
  });

  // Комната
  el('btn-back-room').addEventListener('click', leaveRoom);
  el('btn-invite').addEventListener('click', openInviteModal);
  el('btn-invite-overlay').addEventListener('click', openInviteModal);

  // Инвайт модал
  el('close-invite-modal').addEventListener('click', closeInviteModal);
  el('invite-modal').addEventListener('click', function(e) {
    if (e.target === el('invite-modal')) closeInviteModal();
  });
  el('copy-link-btn').addEventListener('click', function() {
    copyText(S.inviteLink);
    toast('Ссылка скопирована!');
  });
  el('share-tg-btn').addEventListener('click', function() {
    if (S.tg) {
      try { S.tg.switchInlineQuery('room_' + S.roomId, ['users','groups']); return; } catch(e) {}
    }
    window.open(
      'https://t.me/share/url?url=' + encodeURIComponent(S.inviteLink)
      + '&text=' + encodeURIComponent('Смотрим вместе в CineWave!\n' + S.inviteLink),
      '_blank'
    );
  });

  // Чат
  el('chat-send').addEventListener('click', function() {
    var inp = el('chat-input');
    if (inp.value.trim()) { sendMessage(inp.value); inp.value = ''; }
  });
  el('chat-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (e.target.value.trim()) { sendMessage(e.target.value); e.target.value = ''; }
    }
  });
}

function handleUrlSubmit() {
  var url = (el('url-input').value || '').trim();
  if (!url) { toast('Введите ссылку'); return; }
  var video = parseVideoUrl(url);
  if (!video) { toast('Не удалось распознать ссылку'); return; }
  onVideoSelected(video);
}

/* ── СТАРТ ────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  bindEvents();
  initTelegram();
});
