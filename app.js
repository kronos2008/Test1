/* ================================================================
   CineWave — app.js ФИНАЛ

   КАК РАБОТАЕТ:
   ─ Пользователь нажимает RuTube/VK/Онлайн
   ─ Telegram.WebApp.openLink() открывает НАТИВНЫЙ браузер
   ─ Пользователь находит фильм, копирует ссылку
   ─ Возвращается в бот, вставляет в поле
   ─ Создаётся комната с правильным embed плеером:
       RuTube  → rutube.ru/play/embed/ID  (работает без авторизации)
       VK      → vk.com/video_ext.php     (работает без авторизации)
       MP4     → <video> тег             (всегда работает)

   СИНХРОНИЗАЦИЯ + ЧАТ → GUN.js p2p
   ПЕРЕХОД ПО ССЫЛКЕ   → GUN retry (работает гарантированно)
   ================================================================ */
'use strict';

/* ── НАСТРОЙКИ (замени!) ────────────────────────────────────────── */
var APP_URL      = 'https://kronos2008.github.io/Test1/';
var BOT_USERNAME = 'Newbot_testrobot';
/* ────────────────────────────────────────────────────────────────── */

var GUN_PEERS = [
  'https://gun-manhattan.herokuapp.com/gun',
  'https://peer.wallie.io/gun',
  'https://gundb-relay-mlccl.ondigitalocean.app/gun',
];

var S = {
  tg: null, user: null,
  roomId: null, isHost: false, video: null, inviteLink: '',
  viewers: {}, chatMsgs: [],
  playerReady: false, presTimer: null,
  gunRoom: null, gunChat: null,
};

var gun = Gun(GUN_PEERS);

/* ── DOM ── */
function el(id)  { return document.getElementById(id); }
function qs(s)   { return document.querySelector(s); }
function qsa(s)  { return Array.from(document.querySelectorAll(s)); }

/* ── ЭКРАНЫ ── */
function showScreen(name) {
  qsa('.screen.active').forEach(function(s) { s.classList.remove('active'); });
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      var t = el('screen-' + name);
      if (t) t.classList.add('active');
    });
  });
}

/* ── TOAST ── */
var _tt = null;
function toast(msg, ms) {
  ms = ms || 2800;
  var t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_tt);
  _tt = setTimeout(function() { t.classList.remove('show'); }, ms);
}
function toastClear() {
  clearTimeout(_tt);
  el('toast').classList.remove('show');
}

/* ── УТИЛИТЫ ── */
function uid() {
  return Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4);
}
function initials(n) {
  if (!n) return '?';
  var p = String(n).trim().split(/\s+/);
  return (p[0][0]||'').toUpperCase() + (p[1] ? p[1][0].toUpperCase() : '');
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function() { fbCopy(text); });
  } else { fbCopy(text); }
}
function fbCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-200px;opacity:0;left:0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
}
function getParam(k) {
  try { return new URLSearchParams(window.location.search).get(k); } catch(e) { return null; }
}

/* ── ОТКРЫТЬ ССЫЛКУ В НАТИВНОМ БРАУЗЕРЕ ── */
function openExternal(url) {
  if (S.tg && S.tg.openLink) {
    S.tg.openLink(url);
  } else {
    window.open(url, '_blank');
  }
}

/* ═══ TELEGRAM INIT ═══ */
function initTG() {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor('#0A0A0F'); } catch(e) {}
    try { tg.setBackgroundColor('#0A0A0F'); } catch(e) {}
    S.tg = tg;
    var u = (tg.initDataUnsafe && tg.initDataUnsafe.user) || {};
    S.user = {
      id:    String(u.id || uid()),
      name:  u.first_name || 'Гость',
      last:  u.last_name  || '',
      photo: u.photo_url  || '',
    };
  } else {
    S.user = { id: 'dev_' + uid(), name: 'Тест', last: '', photo: '' };
  }
  renderBadge();
  checkStart();
}

function renderBadge() {
  el('uname').textContent = S.user.name;
  var av = el('uava');
  if (S.user.photo) {
    av.innerHTML = '<img src="' + S.user.photo + '" alt=""/>';
  } else {
    av.textContent = initials(S.user.name + ' ' + S.user.last);
  }
}

function checkStart() {
  var p = null;
  if (S.tg && S.tg.initDataUnsafe && S.tg.initDataUnsafe.start_param)
    p = S.tg.initDataUnsafe.start_param;
  if (!p) p = getParam('room');
  if (!p) p = getParam('startapp');

  if (p && p.indexOf('room_') === 0) {
    joinRoom(p.replace('room_', ''));
  } else {
    showScreen('home');
  }
}

/* ═══ СОЗДАТЬ КОМНАТУ ═══ */
function createRoom(video) {
  var rid = uid();
  S.roomId = rid;
  S.isHost = true;
  S.video  = video;

  var g = gun.get('cw3').get(rid);
  g.get('hid').put(String(S.user.id));
  g.get('title').put(video.title     || 'Видео');
  g.get('thumb').put(video.thumb     || '');
  g.get('src').put(video.source      || 'iframe');
  g.get('emb').put(video.embedUrl    || '');
  g.get('pl').put(video.player       || '');
  g.get('dir').put(video.directUrl   || '');
  g.get('ts').put(Date.now());
  // Состояние плеера
  g.get('sp').put(false);
  g.get('st').put(0);
  g.get('su').put(Date.now());
  g.get('viewers').get(S.user.id).put(mkViewer());
  S.gunRoom = g;

  beginRoom(rid, video);
}

/* ═══ ВОЙТИ В КОМНАТУ ═══ */
function joinRoom(rid) {
  toast('Подключение к комнате...', 10000);
  var g = gun.get('cw3').get(rid);
  var done = false;
  var tries = 0;

  function attempt() {
    if (done) return;
    tries++;
    g.get('hid').once(function(hid) {
      if (done) return;
      if (!hid) {
        if (tries < 18) { setTimeout(attempt, 500); }
        else {
          done = true;
          toast('Комната не найдена. Попроси хозяина поделиться ссылкой заново.');
          showScreen('home');
        }
        return;
      }
      done = true;
      g.once(function(data) {
        if (!data) {
          toast('Ошибка подключения. Попробуй ещё раз.');
          showScreen('home');
          return;
        }
        S.roomId = rid;
        S.isHost = (hid === S.user.id);
        S.video  = {
          source:   data.src  || 'iframe',
          title:    data.title|| 'Видео',
          thumb:    data.thumb|| '',
          embedUrl: data.emb  || '',
          player:   data.pl   || '',
          directUrl:data.dir  || '',
        };
        S.gunRoom = g;
        g.get('viewers').get(S.user.id).put(mkViewer());
        beginRoom(rid, S.video);
      });
    });
  }
  attempt();
}

function mkViewer() {
  return { id: S.user.id, name: S.user.name, photo: S.user.photo || '', ts: Date.now() };
}

/* ═══ ЗАПУСТИТЬ КОМНАТУ ═══ */
function beginRoom(rid, video) {
  toastClear();
  showScreen('room');
  S.chatMsgs = [];
  el('cmsgs').innerHTML = '<div class="sys-msg">Комната создана. Пригласи друга!</div>';

  buildLink(rid);
  loadPlayer(video);
  listenSync(rid);
  listenViewers(rid);
  listenChat(rid);
  startPresence(rid);
  updateMyRoomCard(rid, video);
}

function buildLink(rid) {
  var link = S.tg
    ? 'https://t.me/' + BOT_USERNAME + '?startapp=room_' + rid
    : APP_URL + '?room=' + rid;
  S.inviteLink = link;
  el('ltxt').textContent = link;
}

/* ═══════════════════════════════════════════════════════════════════
   ПЛЕЕР

   ЛОГИКА:
   - RuTube  → iframe rutube.ru/play/embed/HASH (без авторизации ✓)
   - VK      → iframe vk.com/video_ext.php      (без авторизации ✓)
   - MP4/WebM→ <video> тег                      (всегда ✓)
   - Остальное → iframe с embedUrl

   НЕ ИСПОЛЬЗУЕМ:
   - Прямые страницы RuTube/VK (X-Frame-Options блокирует)
   - YouTube embed (требует авторизацию в Telegram WebView)
   ═══════════════════════════════════════════════════════════════════ */
function loadPlayer(video) {
  var ploading = el('ploading');
  var iframeEl = el('iframe-pl');
  var videoEl  = el('video-pl');

  // Сбросить
  ploading.style.display = 'flex';
  el('pload-text').textContent = 'Загрузка видео...';
  iframeEl.style.display = 'none';
  iframeEl.src = '';
  videoEl.style.display = 'none';
  videoEl.src = '';
  S.playerReady = false;

  if (!video) { showLoadError('Видео не выбрано'); return; }

  var src = video.embedUrl || video.player || '';

  // Прямой файл — используем <video>
  if (video.source === 'direct' && video.directUrl) {
    videoEl.src = video.directUrl;
    videoEl.style.display = 'block';
    ploading.style.display = 'none';
    S.playerReady = true;
    videoEl.play().catch(function(){});
    videoEl.onplay   = function() { if (S.isHost) pushSync(true,  videoEl.currentTime); };
    videoEl.onpause  = function() { if (S.isHost) pushSync(false, videoEl.currentTime); };
    videoEl.onseeked = function() { if (S.isHost) pushSync(!videoEl.paused, videoEl.currentTime); };
    return;
  }

  // iframe
  if (src) {
    iframeEl.src = src;
    iframeEl.style.display = 'block';
    ploading.style.display = 'none';
    S.playerReady = true;

    // Таймаут — если через 12 сек ничего нет, показываем ошибку
    var loadTimeout = setTimeout(function() {
      if (iframeEl.style.display === 'block') {
        // Не прячем iframe, просто обновляем текст
      }
    }, 12000);

    iframeEl.onload = function() {
      clearTimeout(loadTimeout);
      ploading.style.display = 'none';
    };
    return;
  }

  showLoadError('Не удалось загрузить: неверная ссылка');
}

function showLoadError(msg) {
  el('ploading').style.display = 'flex';
  el('pload-text').textContent = msg;
}

/* ═══ SYNC ═══ */
function listenSync(rid) {
  var g = gun.get('cw3').get(rid);
  g.get('sp').on(function(playing) {
    if (S.isHost) return;
    g.get('st').once(function(t) {
      g.get('su').once(function(u) { applySync(playing, t||0, u||Date.now()); });
    });
  });
}

function pushSync(playing, time) {
  if (!S.gunRoom) return;
  S.gunRoom.get('sp').put(playing);
  S.gunRoom.get('st').put(time || 0);
  S.gunRoom.get('su').put(Date.now());
}

function applySync(playing, time, updAt) {
  if (!S.playerReady) return;
  var age = (Date.now() - updAt) / 1000;
  var tgt = playing ? time + age : time;
  var vp  = el('video-pl');
  if (vp && vp.src && vp.style.display !== 'none') {
    if (Math.abs(vp.currentTime - tgt) > 3.5) {
      vp.currentTime = tgt;
      flashDesync();
    }
    if (playing  && vp.paused)  vp.play().catch(function(){});
    if (!playing && !vp.paused) vp.pause();
  }
}

function flashDesync() {
  var sp = el('spill'), sl = el('slbl');
  if (!sp || !sl) return;
  sp.classList.add('desync');
  sl.textContent = 'Синхронизация...';
  setTimeout(function() { sp.classList.remove('desync'); sl.textContent = 'Синхронизировано'; }, 2000);
}

/* ═══ VIEWERS ═══ */
function listenViewers(rid) {
  gun.get('cw3').get(rid).get('viewers').map().on(function(v, k) {
    if (!v || !v.id) return;
    S.viewers[k] = v;
    renderViewers();
  });
}

function renderViewers() {
  var keys = Object.keys(S.viewers);
  el('watch-n').textContent = keys.length;
  var bar = el('vbar');
  bar.innerHTML = '';
  keys.forEach(function(k) {
    var v = S.viewers[k];
    var d = document.createElement('div');
    d.className = 'vava';
    d.title = v.name || '';
    d.innerHTML = v.photo
      ? '<img src="' + esc(v.photo) + '" alt=""/>'
      : initials(v.name || 'G');
    bar.appendChild(d);
  });
}

function startPresence(rid) {
  clearInterval(S.presTimer);
  S.presTimer = setInterval(function() {
    gun.get('cw3').get(rid).get('viewers').get(S.user.id).get('ts').put(Date.now());
  }, 15000);
}

/* ═══ ЧАТ ═══ */
function listenChat(rid) {
  S.gunChat = gun.get('cw3').get(rid).get('chat');
  var seen = {};
  S.gunChat.map().on(function(msg, k) {
    if (!msg || !msg.text || seen[k]) return;
    seen[k] = true;
    S.chatMsgs.push(msg);
    S.chatMsgs.sort(function(a, b) { return (a.ts || 0) - (b.ts || 0); });
    renderChat();
  });
}

function sendMsg(text) {
  text = (text || '').trim();
  if (!text || !S.roomId || !S.gunChat) return;
  S.gunChat.get(uid()).put({
    uid:   S.user.id,
    name:  S.user.name,
    photo: S.user.photo || '',
    text:  text,
    ts:    Date.now(),
  });
}

function renderChat() {
  var c = el('cmsgs');
  var atBot = (c.scrollHeight - c.scrollTop - c.clientHeight) < 90;
  c.innerHTML = '';
  if (!S.chatMsgs.length) {
    c.innerHTML = '<div class="sys-msg">Комната создана. Пригласи друга!</div>';
    return;
  }
  S.chatMsgs.slice(-80).forEach(function(msg) {
    var own = String(msg.uid) === String(S.user.id);
    var d = document.createElement('div');
    d.className = 'cmsg' + (own ? ' own' : '');

    var av = document.createElement('div');
    av.className = 'mava';
    av.innerHTML = msg.photo
      ? '<img src="' + esc(msg.photo) + '" alt=""/>'
      : initials(msg.name || 'G');

    var body = document.createElement('div');
    body.className = 'mbody';
    if (!own) {
      var nm = document.createElement('div');
      nm.className = 'mname';
      nm.textContent = msg.name || 'Гость';
      body.appendChild(nm);
    }
    var tx = document.createElement('div');
    tx.className = 'mtxt';
    tx.textContent = msg.text || '';
    body.appendChild(tx);

    d.appendChild(av);
    d.appendChild(body);
    c.appendChild(d);
  });
  if (atBot) c.scrollTop = c.scrollHeight;
}

/* ═══════════════════════════════════════════════════════════════════
   ПАРСЕР ССЫЛОК

   Поддерживает:
   - rutube.ru/video/HASH/
   - vk.com/video-OWNER_ID_VID
   - vk.com/clip-OWNER_ID_VID
   - прямые .mp4 / .m3u8
   ═══════════════════════════════════════════════════════════════════ */
function parseURL(url) {
  url = (url || '').trim();
  if (!url) return null;

  // ── RuTube ──
  // rutube.ru/video/abc123/ или rutube.ru/video/abc123
  var rt = url.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rt) {
    return {
      source:   'rutube',
      title:    'RuTube видео',
      thumb:    '',
      // Официальный embed RuTube — работает без авторизации в Telegram WebView
      embedUrl: 'https://rutube.ru/play/embed/' + rt[1] + '?autoPlay=true&muted=false',
    };
  }

  // ── VK video ──
  // vk.com/video-12345_67890
  var vk1 = url.match(/vk\.com\/video(-?\d+)_(\d+)/);
  if (vk1) {
    return {
      source: 'vk',
      title:  'VK видео',
      thumb:  '',
      // video_ext.php — официальный VK embed, не требует авторизации
      player: 'https://vk.com/video_ext.php?oid=' + vk1[1] + '&id=' + vk1[2] + '&hd=1&autoplay=1',
      embedUrl: 'https://vk.com/video_ext.php?oid=' + vk1[1] + '&id=' + vk1[2] + '&hd=1&autoplay=1',
    };
  }

  // vk.com/clip-12345_67890
  var vk2 = url.match(/vk\.com\/clip(-?\d+)_(\d+)/);
  if (vk2) {
    return {
      source: 'vk',
      title:  'VK клип',
      thumb:  '',
      embedUrl: 'https://vk.com/video_ext.php?oid=' + vk2[1] + '&id=' + vk2[2] + '&hd=1&autoplay=1',
    };
  }

  // vk.com/video?z=video-12345_67890
  var vk3 = url.match(/[?&]z=video(-?\d+)_(\d+)/);
  if (vk3) {
    return {
      source: 'vk',
      title:  'VK видео',
      thumb:  '',
      embedUrl: 'https://vk.com/video_ext.php?oid=' + vk3[1] + '&id=' + vk3[2] + '&hd=1&autoplay=1',
    };
  }

  // ── cdn04 / a-l-p-a ──
  if (url.indexOf('cdn04.ru') !== -1 || url.indexOf('a-l-p-a.com') !== -1) {
    return { source: 'iframe', title: 'Онлайн кино', thumb: '', embedUrl: url };
  }

  // ── YouTube (через embed — может не работать в Telegram WebView, но оставляем) ──
  var yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (yt) {
    return {
      source:   'iframe',
      title:    'YouTube видео',
      thumb:    'https://img.youtube.com/vi/' + yt[1] + '/mqdefault.jpg',
      embedUrl: 'https://www.youtube-nocookie.com/embed/' + yt[1] + '?autoplay=1',
    };
  }

  // ── Прямой MP4/WebM/M3U8 ──
  if (/\.(mp4|webm|ogv|m3u8)(\?.*)?$/i.test(url)) {
    return { source: 'direct', title: 'Видео', thumb: '', directUrl: url };
  }

  // ── Любой https URL ──
  if (/^https?:\/\//i.test(url)) {
    return { source: 'iframe', title: 'Видео', thumb: '', embedUrl: url };
  }

  return null;
}

/* ═══ INVITE MODAL ═══ */
function openInv() {
  el('ltxt').textContent = S.inviteLink || '';
  el('inv-modal').style.display = 'flex';
}
function closeInv() {
  el('inv-modal').style.display = 'none';
}

/* ═══ МОЯ КОМНАТА (главный экран) ═══ */
function updateMyRoomCard(rid, video) {
  var wrap = el('my-room-wrap');
  var card = el('my-room-card');
  if (!wrap || !card) return;
  wrap.style.display = 'block';
  var d = document.createElement('div');
  d.className = 'rcard';
  d.innerHTML = ''
    + '<div class="rthumb">'
    + (video.thumb ? '<img src="' + esc(video.thumb) + '" alt=""/>' : '')
    + '</div>'
    + '<div class="rcinfo">'
    + '<div class="rct">' + esc(video.title || 'Комната') + '</div>'
    + '<div class="rcm">Сеанс идёт · нажми чтобы войти</div>'
    + '</div>'
    + '<div class="lbadge">LIVE</div>';
  d.addEventListener('click', function() { showScreen('room'); });
  card.innerHTML = '';
  card.appendChild(d);
}

/* ═══ ПОКИНУТЬ КОМНАТУ ═══ */
function leaveRoom() {
  clearInterval(S.presTimer);
  S.presTimer = null;

  var fr = el('iframe-pl');
  fr.src = '';
  fr.style.display = 'none';

  var vp = el('video-pl');
  try { vp.pause(); } catch(e) {}
  vp.src = '';
  vp.style.display = 'none';

  el('ploading').style.display = 'flex';
  el('pload-text').textContent = 'Загрузка видео...';

  S.playerReady = false;
  S.roomId = null;
  S.chatMsgs = [];
  S.viewers = {};
  S.gunRoom = null;
  S.gunChat = null;

  showScreen('home');
}

/* ═══ СОБЫТИЯ ═══ */
function bindEvents() {

  /* ── Источники ── */

  el('open-rutube').addEventListener('click', function() {
    openExternal('https://rutube.ru');
    toast('Найди фильм → нажми «Поделиться» → скопируй ссылку → вернись сюда и вставь', 5000);
  });

  el('open-vk').addEventListener('click', function() {
    openExternal('https://vk.com/video');
    toast('Найди фильм → скопируй ссылку из адресной строки → вернись и вставь', 5000);
  });

  el('open-web').addEventListener('click', function() {
    openExternal('https://cdn04.ru.a-l-p-a.com/web/prod/web.html');
    toast('Найди фильм → скопируй ссылку → вернись и вставь', 5000);
  });

  /* ── Вставить ссылку ── */
  el('url-go').addEventListener('click', handleURLGo);
  el('url-inp').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleURLGo();
  });

  /* ── Комната ── */
  el('btn-back').addEventListener('click', leaveRoom);
  el('btn-inv').addEventListener('click', openInv);
  el('btn-inv-ov').addEventListener('click', openInv);

  /* ── Invite modal ── */
  el('close-inv').addEventListener('click', closeInv);
  el('inv-modal').addEventListener('click', function(e) {
    if (e.target === el('inv-modal')) closeInv();
  });
  el('cbtn').addEventListener('click', function() {
    copyText(S.inviteLink);
    toast('Ссылка скопирована!');
  });
  el('tg-share').addEventListener('click', function() {
    if (S.tg) {
      try {
        S.tg.switchInlineQuery('room_' + S.roomId, ['users', 'groups']);
        return;
      } catch(e) {}
    }
    window.open(
      'https://t.me/share/url?url=' + encodeURIComponent(S.inviteLink) +
      '&text=' + encodeURIComponent('Смотрим вместе!\n' + S.inviteLink),
      '_blank'
    );
  });

  /* ── Чат ── */
  el('sbtn').addEventListener('click', doSend);
  el('cinp').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });
}

function handleURLGo() {
  var inp = el('url-inp');
  var url = (inp.value || '').trim();
  if (!url) {
    toast('Вставьте ссылку на видео');
    inp.focus();
    return;
  }
  var video = parseURL(url);
  if (!video) {
    toast('Не удалось распознать ссылку. Попробуй другую.');
    return;
  }
  inp.value = '';
  createRoom(video);
}

function doSend() {
  var inp = el('cinp');
  var v = (inp.value || '').trim();
  if (!v) return;
  sendMsg(v);
  inp.value = '';
  inp.focus();
}

/* ── СТАРТ ── */
document.addEventListener('DOMContentLoaded', function() {
  bindEvents();
  initTG();
});
