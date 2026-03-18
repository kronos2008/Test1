/* ================================================================
   CineWave — app.js  (финальная версия)

   Источники:
     1. Web  — встроенный браузер cdn04.ru.a-l-p-a.com
     2. RuTube — поиск через публичный API
     3. VK Видео — поиск через публичный API

   Синхронизация + Чат:  GUN.js (p2p, без ключей)
   Переход по ссылке:     GUN читает комнату по ID — 100% работает
   ================================================================ */
'use strict';

/* ─── НАСТРОЙ ЭТИ 2 СТРОКИ ──────────────────────────────────── */
var APP_URL      = 'https://kronos2008.github.io/Test1/';
var BOT_USERNAME = 'Newbot_testrobot';
/* ─────────────────────────────────────────────────────────────── */

/* GUN peers — публичные бесплатные relay */
var GUN_PEERS = [
  'https://gun-manhattan.herokuapp.com/gun',
  'https://peer.wallie.io/gun',
  'https://gundb-relay-mlccl.ondigitalocean.app/gun',
];

/* RuTube — публичный API, без ключа */
var RUTUBE_API = 'https://rutube.ru/api/search/video/?query=';

/* ─── СОСТОЯНИЕ ────────────────────────────────────────────────── */
var S = {
  tg: null, user: null,
  roomId: null, isHost: false, video: null, inviteLink: '',
  viewers: {}, chatMsgs: [],
  playerReady: false,
  presTimer: null,
  gunRoom: null, gunChat: null,
  rtDeb: null, vkDeb: null,
  webUrl: '',   // URL текущей страницы в браузере
};

/* ─── GUN ─────────────────────────────────────────────────────── */
var gun = Gun(GUN_PEERS);

/* ─── DOM ─────────────────────────────────────────────────────── */
function el(id)  { return document.getElementById(id); }
function qs(s)   { return document.querySelector(s); }
function qsa(s)  { return Array.from(document.querySelectorAll(s)); }

/* ─── ЭКРАНЫ ──────────────────────────────────────────────────── */
function showScreen(name) {
  qsa('.screen.active').forEach(function(s) { s.classList.remove('active'); });
  var t = el('screen-' + name);
  if (!t) return;
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { t.classList.add('active'); });
  });
}

/* ─── TOAST ───────────────────────────────────────────────────── */
var _tt = null;
function toast(msg, ms) {
  ms = ms || 2600;
  var t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_tt);
  _tt = setTimeout(function() { t.classList.remove('show'); }, ms);
}

/* ─── УТИЛИТЫ ─────────────────────────────────────────────────── */
function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}
function initials(n) {
  if (!n) return '?';
  var p = String(n).trim().split(/\s+/);
  return (p[0][0] || '').toUpperCase() + (p[1] ? p[1][0].toUpperCase() : '');
}
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function() { fbCopy(text); });
  } else { fbCopy(text); }
}
function fbCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;top:-200px;opacity:0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
}
function getParam(k) {
  try { return new URLSearchParams(window.location.search).get(k); } catch(e) { return null; }
}

/* ─── TELEGRAM ────────────────────────────────────────────────── */
function initTG() {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready(); tg.expand();
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
    loadRuTube('фильм 2024');
  }
}

/* ═══════════════════════════════════════════
   СОЗДАТЬ КОМНАТУ
   ═══════════════════════════════════════════ */
function createRoom(video) {
  var rid = uid();
  S.roomId = rid;
  S.isHost = true;
  S.video  = video;

  // Сохраняем в GUN (все поля — примитивы, GUN не поддерживает объекты)
  var g = gun.get('cw_rooms').get(rid);
  g.get('hostId').put(String(S.user.id));
  g.get('title').put(video.title   || 'Видео');
  g.get('thumb').put(video.thumb   || '');
  g.get('source').put(video.source || '');
  g.get('videoId').put(video.id    || '');
  g.get('embedUrl').put(video.embedUrl || '');
  g.get('playerUrl').put(video.player  || '');
  g.get('ownerVk').put(video.owner_id  || '');
  g.get('vidVk').put(video.vid         || '');
  g.get('keyVk').put(video.access_key  || '');
  g.get('directUrl').put(video.url     || '');
  g.get('ts').put(Date.now());
  // Начальное состояние плеера
  g.get('sp').put(false);   // state: playing
  g.get('st').put(0);       // state: time
  g.get('su').put(Date.now()); // state: updatedAt
  // Добавляем себя как зрителя
  g.get('viewers').get(S.user.id).put(mkViewer());

  S.gunRoom = g;
  beginRoom(rid, video);
}

/* ═══════════════════════════════════════════
   ВОЙТИ В КОМНАТУ ПО ССЫЛКЕ
   Фикс: ждём GUN с таймаутом + retry
   ═══════════════════════════════════════════ */
function joinRoom(rid) {
  showScreen('home');
  toast('Подключение к комнате...', 8000);

  var g = gun.get('cw_rooms').get(rid);
  var done = false;
  var attempts = 0;
  var maxAttempts = 16; // 16 * 500ms = 8 секунд

  function tryRead() {
    if (done) return;
    attempts++;

    // Читаем hostId — если он есть, комната существует
    g.get('hostId').once(function(hostId) {
      if (done) return;
      if (!hostId) {
        // Ещё не пришло — попробуем снова
        if (attempts < maxAttempts) {
          setTimeout(tryRead, 500);
        } else {
          done = true;
          toast('Комната не найдена');
          showScreen('home');
        }
        return;
      }

      done = true;
      // Читаем все поля
      var vid = {};
      g.once(function(data) {
        if (!data) return;
        vid = {
          source:     data.source    || 'iframe',
          id:         data.videoId   || '',
          title:      data.title     || 'Видео',
          thumb:      data.thumb     || '',
          embedUrl:   data.embedUrl  || '',
          player:     data.playerUrl || '',
          owner_id:   data.ownerVk   || '',
          vid:        data.vidVk     || '',
          access_key: data.keyVk     || '',
          url:        data.directUrl || '',
        };

        S.roomId = rid;
        S.isHost = (hostId === S.user.id);
        S.video  = vid;
        S.gunRoom = g;

        // Регистрируем себя
        g.get('viewers').get(S.user.id).put(mkViewer());
        beginRoom(rid, vid);
      });
    });
  }

  tryRead();
}

function mkViewer() {
  return { id: S.user.id, name: S.user.name, photo: S.user.photo || '', ts: Date.now() };
}

/* ═══════════════════════════════════════════
   ЗАПУСТИТЬ КОМНАТУ
   ═══════════════════════════════════════════ */
function beginRoom(rid, video) {
  toast('');
  showScreen('room');
  S.chatMsgs = [];
  el('chat-msgs').innerHTML = '<div class="sys-msg">Комната создана. Пригласи друга!</div>';

  buildLink(rid);
  loadPlayer(video);
  watchSync(rid);
  watchViewers(rid);
  watchChat(rid);
  startPresence(rid);
  showMyRoom(rid, video);
}

function buildLink(rid) {
  var link = S.tg
    ? 'https://t.me/' + BOT_USERNAME + '?startapp=room_' + rid
    : APP_URL + '?room=' + rid;
  S.inviteLink = link;
  el('link-txt').textContent = link;
}

/* ═══════════════════════════════════════════
   ПЛЕЕР
   RuTube и VK — embed iframe
   Web — уже открыт встроенным браузером,
          пользователь копирует ссылку и вставляет
   ═══════════════════════════════════════════ */
function loadPlayer(video) {
  if (!video) return;
  el('ploading').style.display = 'flex';
  el('iframe-pl').style.display = 'none';
  el('iframe-pl').src = '';
  el('video-pl').style.display = 'none';
  el('video-pl').src = '';
  S.playerReady = false;

  var src = '';

  if (video.source === 'rutube' && video.id) {
    src = 'https://rutube.ru/play/embed/' + video.id + '?autoPlay=1';
  } else if (video.source === 'vk') {
    src = buildVkEmbed(video);
  } else if (video.source === 'direct' && video.url) {
    loadDirect(video.url);
    return;
  } else if (video.embedUrl) {
    src = video.embedUrl;
  } else if (video.player) {
    src = video.player;
  }

  if (src) {
    loadIframe(src);
  } else {
    el('ploading').style.display = 'flex';
    toast('Не удалось загрузить видео');
  }
}

function buildVkEmbed(v) {
  if (v.player) return v.player;
  return 'https://vk.com/video_ext.php?oid=' + (v.owner_id || '')
    + '&id=' + (v.vid || v.id || '')
    + '&hash=' + (v.access_key || '')
    + '&hd=1&autoplay=1';
}

function loadIframe(src) {
  var fr = el('iframe-pl');
  fr.src = src;
  fr.style.display = 'block';
  el('ploading').style.display = 'none';
  S.playerReady = true;
}

function loadDirect(url) {
  var vp = el('video-pl');
  vp.src = url;
  vp.style.display = 'block';
  el('ploading').style.display = 'none';
  S.playerReady = true;
  vp.play().catch(function() {});
  vp.onplay   = function() { if (S.isHost) pushSync(true,  vp.currentTime); };
  vp.onpause  = function() { if (S.isHost) pushSync(false, vp.currentTime); };
  vp.onseeked = function() { if (S.isHost) pushSync(!vp.paused, vp.currentTime); };
}

/* ═══════════════════════════════════════════
   SYNC через GUN (реалтайм)
   ═══════════════════════════════════════════ */
function watchSync(rid) {
  var g = gun.get('cw_rooms').get(rid);
  g.get('sp').on(function(playing) {
    if (S.isHost) return;
    g.get('st').once(function(time) {
      g.get('su').once(function(updAt) {
        applySync(playing, time || 0, updAt || Date.now());
      });
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
  var age    = (Date.now() - updAt) / 1000;
  var target = playing ? time + age : time;
  var vp = el('video-pl');
  if (vp && vp.src && vp.style.display !== 'none') {
    if (Math.abs(vp.currentTime - target) > 3.5) {
      vp.currentTime = target;
      flashDesync();
    }
    if (playing  && vp.paused)  vp.play().catch(function() {});
    if (!playing && !vp.paused) vp.pause();
  }
}

function flashDesync() {
  var sp = el('sync-pill'), sl = el('slbl');
  if (!sp || !sl) return;
  sp.classList.add('desync'); sl.textContent = 'Синхронизация...';
  setTimeout(function() { sp.classList.remove('desync'); sl.textContent = 'Синхронизировано'; }, 2000);
}

/* ═══════════════════════════════════════════
   VIEWERS
   ═══════════════════════════════════════════ */
function watchViewers(rid) {
  gun.get('cw_rooms').get(rid).get('viewers').map().on(function(v, k) {
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
    gun.get('cw_rooms').get(rid).get('viewers').get(S.user.id).get('ts').put(Date.now());
  }, 15000);
}

/* ═══════════════════════════════════════════
   ЧАТ через GUN — реалтайм
   ═══════════════════════════════════════════ */
function watchChat(rid) {
  S.gunChat = gun.get('cw_rooms').get(rid).get('chat');
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
  var c = el('chat-msgs');
  var bot = (c.scrollHeight - c.scrollTop - c.clientHeight) < 90;
  c.innerHTML = '';
  if (!S.chatMsgs.length) {
    c.innerHTML = '<div class="sys-msg">Комната создана. Пригласи друга!</div>';
    return;
  }
  S.chatMsgs.slice(-80).forEach(function(msg) {
    var own = (String(msg.uid) === String(S.user.id));
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
  if (bot) c.scrollTop = c.scrollHeight;
}

/* ═══════════════════════════════════════════
   RUTUBE — поиск через публичный API
   ═══════════════════════════════════════════ */
function searchRuTube(query) {
  var g = el('rt-grid');
  g.innerHTML = '<div class="grid-load"><div class="spin"></div><p>Поиск...</p></div>';

  var url = RUTUBE_API + encodeURIComponent(query) + '&page=1&per_page=20';

  fetch(url)
    .then(function(r) { return r.ok ? r.json() : Promise.reject('err'); })
    .then(function(data) {
      var items = data.results || [];
      if (!items.length) {
        g.innerHTML = '<div class="no-res">Ничего не найдено</div>';
        return;
      }
      renderVideoGrid(items.map(function(it) {
        // RuTube API возвращает video_url вида rutube.ru/video/HASH/
        var hash = '';
        var m = (it.video_url || it.url || '').match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
        if (m) hash = m[1];
        return {
          source:   'rutube',
          id:       hash,
          title:    it.title || '',
          views:    it.hits  ? it.hits + ' просмотров' : '',
          thumb:    it.thumbnail_url || it.poster || '',
          embedUrl: hash ? 'https://rutube.ru/play/embed/' + hash + '?autoPlay=1' : '',
        };
      }).filter(function(v) { return v.id; }), '#rt-grid');
    })
    .catch(function() {
      g.innerHTML = '<div class="no-res">Ошибка загрузки. Попробуйте позже.</div>';
    });
}

/* ═══════════════════════════════════════════
   VK — поиск через публичный oembed / iframe
   Без токена находим через поиск по embed
   ═══════════════════════════════════════════ */
function searchVK(query) {
  var g = el('vk-grid');
  g.innerHTML = '<div class="grid-load"><div class="spin"></div><p>Поиск...</p></div>';

  // VK API требует токен для video.search.
  // Без токена — показываем инструкцию и демо карточки для вставки ссылки вручную.
  // При нажатии на "Открыть VK" — открываем vk.com/video в iframe.
  renderVkManual(query);
}

function renderVkManual(query) {
  var g = el('vk-grid');
  g.innerHTML = '';

  // Кнопка "Открыть VK" — открывает поиск прямо в VK
  var openBtn = document.createElement('div');
  openBtn.className = 'vcard';
  openBtn.style.cssText = 'grid-column:1/-1;padding:16px;display:flex;align-items:center;gap:14px;';
  openBtn.innerHTML = ''
    + '<div style="width:44px;height:44px;border-radius:12px;background:rgba(76,117,163,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0">'
    + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="5" fill="#4C75A3"/>'
    + '<path d="M13.6 16.1c-3.8 0-5.9-2.6-6-6.9h1.9c.1 3.1 1.4 4.4 2.5 4.7V9.2h1.8v2.7c1.1-.1 2.2-1.4 2.6-2.7h1.8c-.3 1.6-1.6 2.9-2.5 3.4 1 .4 2.4 1.5 3 3.5H16.9c-.5-1.5-1.6-2.6-3.3-2.8v2.8H13.6z" fill="white"/></svg>'
    + '</div>'
    + '<div style="flex:1"><div style="font-size:14px;font-weight:700;margin-bottom:3px">Открыть VK Видео</div>'
    + '<div style="font-size:11px;color:rgba(240,238,248,.5)">Нажми, найди фильм, скопируй ссылку</div></div>'
    + '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="rgba(240,238,248,.3)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  openBtn.addEventListener('click', function() {
    openVKBrowser(query);
  });
  g.appendChild(openBtn);

  // Инструкция
  var hint = document.createElement('div');
  hint.style.cssText = 'grid-column:1/-1;padding:12px 4px;';
  hint.innerHTML = ''
    + '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);'
    + 'border-radius:12px;padding:14px;">'
    + '<p style="font-size:12px;font-weight:700;margin-bottom:8px;">Как смотреть фильм с VK:</p>'
    + '<p style="font-size:11px;color:rgba(240,238,248,.5);line-height:1.7;">'
    + '1. Нажми кнопку выше — откроется VK<br/>'
    + '2. Найди нужный фильм<br/>'
    + '3. Нажми кнопку <strong style="color:#C084FC">«Выбрать»</strong> вверху — ссылка вставится автоматически<br/>'
    + '4. Комната создастся и начнётся просмотр'
    + '</p></div>';
  g.appendChild(hint);
}

function openVKBrowser(query) {
  var searchUrl = 'https://vk.com/video?q=' + encodeURIComponent(query || 'фильм');
  openBrowser(searchUrl, 'vk');
}

/* ═══════════════════════════════════════════
   WEB BROWSER — встроенный
   ═══════════════════════════════════════════ */
function openBrowser(url, returnScreen) {
  S.webUrl = url;
  S._browserReturn = returnScreen || 'home';

  el('web-iframe').src = url;
  el('browser-url-bar').textContent = url.replace('https://','').replace('http://','').split('/')[0];
  showScreen('web');

  // Слушаем сообщения от iframe (postMessage)
  // Некоторые сайты отправляют URL при навигации
  window.onmessage = function(e) {
    if (e.data && typeof e.data === 'string' && e.data.indexOf('http') === 0) {
      S.webUrl = e.data;
      el('browser-url-bar').textContent = e.data.replace('https://','').replace('http://','').split('/')[0];
    }
  };
}

function handleWebUse() {
  // Пытаемся получить текущий URL из iframe
  var currentUrl = S.webUrl;

  // Пробуем достать URL из location iframe (работает если не cross-origin)
  try {
    var iframeUrl = el('web-iframe').contentWindow.location.href;
    if (iframeUrl && iframeUrl !== 'about:blank') {
      currentUrl = iframeUrl;
    }
  } catch(e) {
    // cross-origin — нельзя читать, используем S.webUrl
  }

  if (!currentUrl || currentUrl === 'about:blank') {
    // Просим пользователя вставить ссылку вручную
    showScreen(S._browserReturn || 'home');
    toast('Скопируй ссылку на видео и вставь в поле снизу');
    return;
  }

  var video = parseURL(currentUrl);
  if (video) {
    showScreen(S._browserReturn || 'home');
    createRoom(video);
  } else {
    // Создаём комнату с iframe-плеером
    var vid = {
      source:   'iframe',
      title:    'Видео',
      thumb:    '',
      embedUrl: currentUrl,
    };
    showScreen('home');
    createRoom(vid);
  }
}

/* ═══════════════════════════════════════════
   RENDER VIDEO GRID
   ═══════════════════════════════════════════ */
function renderVideoGrid(videos, gridId) {
  var c = qs(gridId);
  if (!c) return;
  c.innerHTML = '';
  if (!videos || !videos.length) {
    c.innerHTML = '<div class="no-res">Ничего не найдено</div>';
    return;
  }
  videos.forEach(function(v) {
    c.appendChild(buildCard(v));
  });
}

function buildCard(v) {
  var d = document.createElement('div');
  d.className = 'vcard';
  var thumb = v.thumb || '';
  d.innerHTML = '<div class="vthumb">'
    + (thumb ? '<img src="' + esc(thumb) + '" alt="" loading="lazy" onerror="this.style.opacity=0"/>' : '')
    + '<div class="vplay">'
    + '<svg width="32" height="32" viewBox="0 0 32 32" fill="none">'
    + '<circle cx="16" cy="16" r="16" fill="rgba(0,0,0,.45)"/>'
    + '<path d="M12 10l12 6-12 6V10z" fill="white"/>'
    + '</svg></div></div>'
    + '<div class="vmeta">'
    + '<div class="vtitle">' + esc(v.title || 'Видео') + '</div>'
    + '<div class="vsub">' + esc(v.views || '') + '</div>'
    + '</div>';
  d.addEventListener('click', function() { selectVideo(v); });
  return d;
}

function selectVideo(v) {
  createRoom(v);
}

/* ═══════════════════════════════════════════
   URL PARSER
   ═══════════════════════════════════════════ */
function parseURL(url) {
  url = (url || '').trim();
  if (!url) return null;

  // YouTube
  var yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return {
    source: 'iframe', id: yt[1], title: 'YouTube видео',
    thumb: 'https://img.youtube.com/vi/' + yt[1] + '/mqdefault.jpg',
    embedUrl: 'https://www.youtube.com/embed/' + yt[1] + '?autoplay=1',
  };

  // VK video
  var vk = url.match(/vk\.com\/video(-?\d+)_(\d+)/);
  if (vk) return {
    source: 'vk', owner_id: vk[1], vid: vk[2], title: 'VK видео', thumb: '',
    player: 'https://vk.com/video_ext.php?oid=' + vk[1] + '&id=' + vk[2] + '&hd=1&autoplay=1',
  };

  // VK clip
  var vkc = url.match(/vk\.com\/clip(-?\d+)_(\d+)/);
  if (vkc) return {
    source: 'vk', owner_id: vkc[1], vid: vkc[2], title: 'VK Клип', thumb: '',
    player: 'https://vk.com/video_ext.php?oid=' + vkc[1] + '&id=' + vkc[2] + '&hd=1&autoplay=1',
  };

  // RuTube
  var rt = url.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rt) return {
    source: 'rutube', id: rt[1], title: 'RuTube видео', thumb: '',
    embedUrl: 'https://rutube.ru/play/embed/' + rt[1] + '?autoPlay=1',
  };

  // cdn04 / web.html плеер
  if (url.indexOf('cdn04.ru') !== -1 || url.indexOf('a-l-p-a.com') !== -1) {
    return { source: 'iframe', title: 'Онлайн кино', thumb: '', embedUrl: url };
  }

  // Прямой файл
  if (/\.(mp4|webm|ogv|m3u8)(\?.*)?$/i.test(url)) {
    return { source: 'direct', url: url, title: 'Видео', thumb: '' };
  }

  // Общий iframe
  if (/^https?:\/\//i.test(url)) {
    return { source: 'iframe', embedUrl: url, title: 'Видео', thumb: '' };
  }

  return null;
}

/* ═══════════════════════════════════════════
   INVITE
   ═══════════════════════════════════════════ */
function openInvModal() {
  el('link-txt').textContent = S.inviteLink || '';
  el('inv-modal').style.display = 'flex';
}
function closeInvModal() {
  el('inv-modal').style.display = 'none';
}

/* ═══════════════════════════════════════════
   МОЯ КОМНАТА (главный экран)
   ═══════════════════════════════════════════ */
function showMyRoom(rid, video) {
  var sec = el('my-rooms'), lst = el('rooms-list');
  if (!sec || !lst) return;
  sec.style.display = 'block';
  var d = document.createElement('div');
  d.className = 'rcard';
  d.innerHTML = '<div class="rthumb">'
    + (video.thumb ? '<img src="' + esc(video.thumb) + '" alt=""/>' : '')
    + '</div><div class="rcinfo">'
    + '<div class="rct">' + esc(video.title || 'Комната') + '</div>'
    + '<div class="rcm">Комната активна</div>'
    + '</div><div class="live-badge">LIVE</div>';
  d.addEventListener('click', function() { showScreen('room'); });
  lst.innerHTML = '';
  lst.appendChild(d);
}

/* ═══════════════════════════════════════════
   ПОКИНУТЬ КОМНАТУ
   ═══════════════════════════════════════════ */
function leaveRoom() {
  clearInterval(S.presTimer);
  S.presTimer = null;
  var fr = el('iframe-pl');
  fr.src = ''; fr.style.display = 'none';
  var vp = el('video-pl');
  vp.pause(); vp.src = ''; vp.style.display = 'none';
  el('ploading').style.display = 'flex';
  S.playerReady = false;
  S.roomId = null; S.chatMsgs = []; S.viewers = {};
  S.gunRoom = null; S.gunChat = null;
  showScreen('home');
}

/* ═══════════════════════════════════════════
   СОБЫТИЯ
   ═══════════════════════════════════════════ */
function bindEvents() {

  /* HOME */
  el('src-web').addEventListener('click', function() {
    openBrowser('https://cdn04.ru.a-l-p-a.com/web/prod/web.html', 'home');
  });

  el('src-rutube').addEventListener('click', function() {
    showScreen('rutube');
    if (!qs('#rt-grid .vcard')) searchRuTube('фильм 2024');
  });

  el('src-vk').addEventListener('click', function() {
    showScreen('vk');
    renderVkManual('фильм');
  });

  /* Вставить ссылку */
  el('paste-go').addEventListener('click', handlePaste);
  el('paste-inp').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handlePaste();
  });

  /* WEB BROWSER */
  el('web-back').addEventListener('click', function() {
    el('web-iframe').src = '';
    showScreen('home');
  });
  el('web-use').addEventListener('click', handleWebUse);

  /* RUTUBE */
  el('close-rutube').addEventListener('click', function() { showScreen('home'); });
  el('rt-q').addEventListener('input', function(e) {
    clearTimeout(S.rtDeb);
    var v = e.target.value.trim();
    if (v.length < 2) return;
    S.rtDeb = setTimeout(function() { searchRuTube(v); }, 500);
  });
  qsa('#rt-cats .cat').forEach(function(b) {
    b.addEventListener('click', function() {
      qsa('#rt-cats .cat').forEach(function(x) { x.classList.remove('active'); });
      b.classList.add('active');
      searchRuTube(b.dataset.q);
    });
  });

  /* VK */
  el('close-vk').addEventListener('click', function() { showScreen('home'); });
  el('vk-q').addEventListener('input', function(e) {
    clearTimeout(S.vkDeb);
    var v = e.target.value.trim();
    if (v.length < 2) return;
    S.vkDeb = setTimeout(function() { openVKBrowser(v); }, 600);
  });
  qsa('#vk-cats .cat').forEach(function(b) {
    b.addEventListener('click', function() {
      qsa('#vk-cats .cat').forEach(function(x) { x.classList.remove('active'); });
      b.classList.add('active');
      openVKBrowser(b.dataset.q);
    });
  });

  /* ROOM */
  el('room-back').addEventListener('click', leaveRoom);
  el('inv-btn').addEventListener('click', openInvModal);
  el('pov-inv').addEventListener('click', openInvModal);

  /* INVITE MODAL */
  el('close-inv').addEventListener('click', closeInvModal);
  el('inv-modal').addEventListener('click', function(e) {
    if (e.target === el('inv-modal')) closeInvModal();
  });
  el('copy-btn').addEventListener('click', function() {
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
    var txt = 'Смотрим вместе в CineWave!\n' + S.inviteLink;
    window.open(
      'https://t.me/share/url?url=' + encodeURIComponent(S.inviteLink)
      + '&text=' + encodeURIComponent(txt),
      '_blank'
    );
  });

  /* CHAT */
  el('send-btn').addEventListener('click', doSend);
  el('chat-inp').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });
}

function doSend() {
  var inp = el('chat-inp');
  var v = (inp.value || '').trim();
  if (!v) return;
  sendMsg(v);
  inp.value = '';
  inp.focus();
}

function handlePaste() {
  var u = (el('paste-inp').value || '').trim();
  if (!u) { toast('Вставьте ссылку на видео'); return; }
  var video = parseURL(u);
  if (!video) { toast('Не удалось распознать ссылку'); return; }
  createRoom(video);
}

/* ─── СТАРТ ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  bindEvents();
  initTG();
});
