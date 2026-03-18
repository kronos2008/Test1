/* ================================================================
   CineWave — app.js ФИНАЛ

   АРХИТЕКТУРА:
   ─ НЕТ iframe плеера — RuTube и VK блокируют embed для фильмов
   ─ Видео открывается в нативном браузере через openLink()
   ─ Мини-апп = ЧАТ + СИНХРОНИЗАЦИЯ + ПРИГЛАШЕНИЕ

   ФЛОУ:
   1. Вставляешь ссылку на фильм (RuTube/VK/mp4)
   2. Создаётся комната в GUN.js
   3. В комнате — кнопка "Смотреть фильм" → открывает нативный браузер
   4. Приглашаешь друга по ссылке
   5. Друг заходит → видит тот же фильм → нажимает "Смотреть"
   6. Чат работает в реалтайме через GUN
   ================================================================ */
'use strict';

/* ── НАСТРОЙ ── */
var APP_URL      = 'https://kronos2008.github.io/Test1/';
var BOT_USERNAME = 'Newbot_testrobot';

var GUN_PEERS = [
  'https://gun-manhattan.herokuapp.com/gun',
  'https://peer.wallie.io/gun',
  'https://gundb-relay-mlccl.ondigitalocean.app/gun',
];

var S = {
  tg: null, user: null,
  roomId: null, isHost: false, video: null, inviteLink: '',
  viewers: {}, chatMsgs: [],
  presTimer: null,
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
  ms = ms || 3000;
  var t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_tt);
  _tt = setTimeout(function() { t.classList.remove('show'); }, ms);
}
function toastClear() { clearTimeout(_tt); el('toast').classList.remove('show'); }

/* ── УТИЛИТЫ ── */
function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}
function initials(n) {
  if (!n) return '?';
  var p = String(n).trim().split(/\s+/);
  return (p[0][0] || '').toUpperCase() + (p[1] ? p[1][0].toUpperCase() : '');
}
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    try { S.tg.openLink(url); return; } catch(e) {}
  }
  window.open(url, '_blank');
}

/* ── ПОЛУЧИТЬ ЧИТАЕМОЕ НАЗВАНИЕ ИСТОЧНИКА ── */
function getSourceLabel(video) {
  if (!video) return '';
  var src = video.source || '';
  var url = video.originalUrl || video.embedUrl || video.player || '';

  if (src === 'rutube' || url.indexOf('rutube') !== -1) return 'RuTube';
  if (src === 'vk'     || url.indexOf('vk.com') !== -1)  return 'VK Видео';
  if (src === 'direct') return 'Видео';
  return 'Видео';
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
      id:    String(u.id    || uid()),
      name:  u.first_name   || 'Гость',
      last:  u.last_name    || '',
      photo: u.photo_url    || '',
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

/* ═══════════════════════════════════════
   СОЗДАТЬ КОМНАТУ
   ═══════════════════════════════════════ */
function createRoom(video) {
  var rid = uid();
  S.roomId = rid;
  S.isHost = true;
  S.video  = video;

  var g = gun.get('cw4').get(rid);
  g.get('hid').put(String(S.user.id));
  g.get('title').put(video.title       || 'Видео');
  g.get('thumb').put(video.thumb       || '');
  g.get('src').put(video.source        || '');
  g.get('ourl').put(video.originalUrl  || '');  // оригинальная ссылка для openLink
  g.get('ts').put(Date.now());
  g.get('viewers').get(S.user.id).put(mkViewer());
  S.gunRoom = g;

  beginRoom(rid, video);
}

/* ═══════════════════════════════════════
   ВОЙТИ В КОМНАТУ ПО ССЫЛКЕ
   retry каждые 500мс до 9 секунд
   ═══════════════════════════════════════ */
function joinRoom(rid) {
  toast('Подключение к комнате...', 10000);
  var g    = gun.get('cw4').get(rid);
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
          toast('Комната не найдена. Попроси хозяина поделиться ссылкой ещё раз.');
          showScreen('home');
        }
        return;
      }
      done = true;
      g.once(function(data) {
        if (!data) {
          toast('Ошибка загрузки. Попробуй ещё раз.');
          showScreen('home');
          return;
        }
        S.roomId = rid;
        S.isHost = (hid === S.user.id);
        S.video  = {
          source:      data.src   || '',
          title:       data.title || 'Видео',
          thumb:       data.thumb || '',
          originalUrl: data.ourl  || '',
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
  return {
    id:    S.user.id,
    name:  S.user.name,
    photo: S.user.photo || '',
    ts:    Date.now(),
  };
}

/* ═══════════════════════════════════════
   ЗАПУСТИТЬ КОМНАТУ
   ═══════════════════════════════════════ */
function beginRoom(rid, video) {
  toastClear();
  showScreen('room');
  S.chatMsgs = [];
  el('cmsgs').innerHTML = '<div class="sys-msg">Комната создана. Пригласи друга!</div>';

  buildLink(rid);
  renderMovieBlock(video);
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

/* ═══════════════════════════════════════
   БЛОК С ФИЛЬМОМ
   ═══════════════════════════════════════ */
function renderMovieBlock(video) {
  // Источник
  el('movie-source-label').textContent = getSourceLabel(video);

  // Название
  var title = video.title || 'Фильм';
  el('movie-title').textContent = title;

  // Превью
  var thumbEl = el('movie-thumb');
  if (video.thumb) {
    thumbEl.innerHTML = '<img src="' + esc(video.thumb) + '" alt="" onerror="this.parentElement.innerHTML=\'<div class=movie-thumb-placeholder><svg width=32 height=32 viewBox=\\\'0 0 32 32\\\' fill=none opacity=.3><circle cx=16 cy=16 r=15 stroke=white stroke-width=1.5/><path d=\\\'M12 10l12 6-12 6V10z\\\' fill=white/></svg></div>\'"/>';
  }

  // Кнопка "Смотреть"
  var btn = el('watch-now-btn');
  btn.onclick = function() {
    var url = video.originalUrl;
    if (!url) { toast('Ссылка на фильм не найдена'); return; }
    openExternal(url);
  };
}

/* ═══════════════════════════════════════
   VIEWERS
   ═══════════════════════════════════════ */
function listenViewers(rid) {
  gun.get('cw4').get(rid).get('viewers').map().on(function(v, k) {
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
    gun.get('cw4').get(rid).get('viewers').get(S.user.id).get('ts').put(Date.now());
  }, 15000);
}

/* ═══════════════════════════════════════
   ЧАТ (GUN реалтайм)
   ═══════════════════════════════════════ */
function listenChat(rid) {
  S.gunChat = gun.get('cw4').get(rid).get('chat');
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
    var d   = document.createElement('div');
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

/* ═══════════════════════════════════════
   МОЯ КОМНАТА (главный экран)
   ═══════════════════════════════════════ */
function updateMyRoomCard(rid, video) {
  var sec  = el('my-room-section');
  var card = el('my-room-card');
  if (!sec || !card) return;
  sec.style.display = 'block';

  var d = document.createElement('div');
  d.className = 'rcard';
  d.innerHTML = ''
    + '<div class="rthumb">'
    + (video.thumb
        ? '<img src="' + esc(video.thumb) + '" alt=""/>'
        : '<div class="movie-thumb-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" opacity=".3"><circle cx="12" cy="12" r="11" stroke="white" stroke-width="1.5"/><path d="M9 7.5l9 4.5-9 4.5V7.5z" fill="white"/></svg></div>')
    + '</div>'
    + '<div class="rcinfo">'
    + '<div class="rct">' + esc(video.title || 'Комната') + '</div>'
    + '<div class="rcm">' + esc(getSourceLabel(video)) + ' · Сеанс идёт</div>'
    + '</div>'
    + '<div class="lbadge">LIVE</div>';

  d.addEventListener('click', function() { showScreen('room'); });
  card.innerHTML = '';
  card.appendChild(d);
}

/* ═══════════════════════════════════════
   ПОКИНУТЬ КОМНАТУ
   ═══════════════════════════════════════ */
function leaveRoom() {
  clearInterval(S.presTimer);
  S.presTimer = null;
  S.roomId = null;
  S.chatMsgs = [];
  S.viewers = {};
  S.gunRoom = null;
  S.gunChat = null;
  showScreen('home');
}

/* ═══════════════════════════════════════
   ПАРСЕР ССЫЛОК
   Возвращает объект video с оригинальной ссылкой
   ═══════════════════════════════════════ */
function parseURL(url) {
  url = (url || '').trim();
  if (!url) return null;

  // RuTube
  var rt = url.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rt) {
    return {
      source:      'rutube',
      title:       'RuTube видео',
      thumb:       '',
      originalUrl: url,  // открываем оригинал в браузере
    };
  }

  // VK video — разные форматы
  var vk1 = url.match(/vk\.com\/video(-?\d+)_(\d+)/);
  if (vk1) {
    return {
      source:      'vk',
      title:       'VK видео',
      thumb:       '',
      originalUrl: url,
    };
  }
  var vk2 = url.match(/vk\.com\/clip(-?\d+)_(\d+)/);
  if (vk2) {
    return {
      source:      'vk',
      title:       'VK клип',
      thumb:       '',
      originalUrl: url,
    };
  }
  // vk.com/video?z=video-12345_67890
  if (url.indexOf('vk.com') !== -1 && url.indexOf('video') !== -1) {
    return {
      source:      'vk',
      title:       'VK видео',
      thumb:       '',
      originalUrl: url,
    };
  }

  // YouTube
  var yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (yt) {
    return {
      source:      'youtube',
      title:       'YouTube видео',
      thumb:       'https://img.youtube.com/vi/' + yt[1] + '/mqdefault.jpg',
      originalUrl: url,
    };
  }

  // Прямой MP4/WebM
  if (/\.(mp4|webm|ogv|m3u8)(\?.*)?$/i.test(url)) {
    return {
      source:      'direct',
      title:       'Видео',
      thumb:       '',
      originalUrl: url,
    };
  }

  // Любой https
  if (/^https?:\/\//i.test(url)) {
    // Пытаемся угадать источник по домену
    var domain = url.replace(/^https?:\/\//, '').split('/')[0];
    return {
      source:      'web',
      title:       domain,
      thumb:       '',
      originalUrl: url,
    };
  }

  return null;
}

/* ═══════════════════════════════════════
   INVITE MODAL
   ═══════════════════════════════════════ */
function openInv() {
  el('ltxt').textContent = S.inviteLink || '';
  el('inv-modal').style.display = 'flex';
}
function closeInv() {
  el('inv-modal').style.display = 'none';
}

/* ═══════════════════════════════════════
   СОБЫТИЯ
   ═══════════════════════════════════════ */
function bindEvents() {

  /* Открыть RuTube */
  el('open-rutube').addEventListener('click', function() {
    openExternal('https://rutube.ru');
    toast('Найди фильм → нажми кнопку «Поделиться» → скопируй ссылку → вернись сюда и вставь', 5000);
  });

  /* Открыть VK Видео */
  el('open-vk').addEventListener('click', function() {
    openExternal('https://vk.com/video');
    toast('Найди фильм → скопируй ссылку из адресной строки → вернись и вставь', 5000);
  });

  /* Кнопка GO */
  el('url-go').addEventListener('click', handleGo);
  el('url-inp').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleGo();
  });

  /* Комната */
  el('btn-back').addEventListener('click', leaveRoom);
  el('btn-inv').addEventListener('click', openInv);

  /* Invite modal */
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
      'https://t.me/share/url?url=' + encodeURIComponent(S.inviteLink)
      + '&text=' + encodeURIComponent('Смотрим вместе в CineWave!\n' + S.inviteLink),
      '_blank'
    );
  });

  /* Чат */
  el('sbtn').addEventListener('click', doSend);
  el('cinp').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });
}

function handleGo() {
  var inp = el('url-inp');
  var url = (inp.value || '').trim();
  if (!url) {
    toast('Вставьте ссылку на фильм');
    inp.focus();
    return;
  }
  var video = parseURL(url);
  if (!video) {
    toast('Не удалось распознать ссылку');
    return;
  }
  inp.value = '';
  createRoom(video);
}

function doSend() {
  var inp = el('cinp');
  var v   = (inp.value || '').trim();
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
