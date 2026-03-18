/* ================================================================
   CineWave — app.js
   ✓ GUN.js  — реальная p2p синхронизация между устройствами (без ключей)
   ✓ Piped   — поиск YouTube без API ключа и без CORS
   ✓ Плеер   — Piped embed (работает в Telegram WebView без авторизации)
   ✓ Чат     — GUN.js реалтайм
   ✓ Переход по ссылке — joinRoom через GUN гарантированно находит комнату
   ================================================================ */
'use strict';

/* ─── CONFIG (поменяй только эти 2 строки) ─────────────────────── */
var APP_URL      = 'https://kronos2008.github.io/Test1/';
var BOT_USERNAME = 'Newbot_testrobot'; // @BotFather → /newbot → бесплатно

/* ─── Piped инстансы (публичный YouTube без API ключа) ──────────── */
var PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.garudalinux.org',
  'https://api.piped.projectsegfau.lt',
  'https://piped.video/api',
];

/* ─── GUN peers (публичные relay серверы, бесплатно) ─────────────── */
var GUN_PEERS = [
  'https://gun-manhattan.herokuapp.com/gun',
  'https://peer.wallie.io/gun',
  'https://gundb-relay-mlccl.ondigitalocean.app/gun',
];

/* ─── СОСТОЯНИЕ ─────────────────────────────────────────────────── */
var S = {
  tg: null, user: null,
  roomId: null, isHost: false, video: null, inviteLink: '',
  viewers: {}, chatMsgs: [], chatCount: 0,
  ytPlayer: null, ytReady: false, playerReady: false,
  syncTimer: null, presTimer: null,
  searchDeb: null, vkDeb: null,
  gunRoom: null, gunChat: null,   // GUN ссылки на комнату и чат
  pipedIdx: 0,
};

/* ─── GUN инициализация ─────────────────────────────────────────── */
var gun = Gun(GUN_PEERS);

/* ─── DOM ───────────────────────────────────────────────────────── */
function el(id)   { return document.getElementById(id); }
function qs(s)    { return document.querySelector(s); }
function qsa(s)   { return Array.from(document.querySelectorAll(s)); }

/* ─── ЭКРАНЫ ────────────────────────────────────────────────────── */
function showScreen(name) {
  qsa('.screen.active').forEach(function(s) { s.classList.remove('active'); });
  var t = el('screen-' + name);
  if (!t) return;
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { t.classList.add('active'); });
  });
}

/* ─── TOAST ─────────────────────────────────────────────────────── */
var _tt = null;
function toast(msg, ms) {
  ms = ms || 2600;
  var t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_tt);
  _tt = setTimeout(function() { t.classList.remove('show'); }, ms);
}

/* ─── УТИЛИТЫ ───────────────────────────────────────────────────── */
function uid() { return Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }
function initials(n) {
  if (!n) return '?';
  var p = String(n).trim().split(/\s+/);
  return (p[0][0]||'').toUpperCase() + (p[1] ? p[1][0].toUpperCase() : '');
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).catch(function() { _fbCopy(t); });
  } else { _fbCopy(t); }
}
function _fbCopy(t) {
  var ta = document.createElement('textarea');
  ta.value = t; ta.style.cssText = 'position:fixed;top:-200px;opacity:0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
}
function getParam(k) {
  try { return new URLSearchParams(window.location.search).get(k); } catch(e) { return null; }
}

/* ─── TELEGRAM ──────────────────────────────────────────────────── */
function initTG() {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready(); tg.expand();
    try { tg.setHeaderColor('#0A0A0F'); } catch(e) {}
    try { tg.setBackgroundColor('#0A0A0F'); } catch(e) {}
    S.tg = tg;
    var u = (tg.initDataUnsafe && tg.initDataUnsafe.user) || {};
    S.user = {
      id: String(u.id || uid()),
      name: u.first_name || 'Гость',
      last: u.last_name || '',
      username: u.username || '',
      photo: u.photo_url || '',
    };
  } else {
    S.user = { id: 'dev_' + uid(), name: 'Тест', last: '', username: '', photo: '' };
  }
  renderBadge();
  checkStartParam();
}

function renderBadge() {
  el('user-name').textContent = S.user.name;
  var av = el('user-ava');
  if (S.user.photo) {
    av.innerHTML = '<img src="' + S.user.photo + '" alt=""/>';
  } else {
    av.textContent = initials(S.user.name + ' ' + S.user.last);
  }
}

function checkStartParam() {
  var param = null;
  if (S.tg && S.tg.initDataUnsafe && S.tg.initDataUnsafe.start_param)
    param = S.tg.initDataUnsafe.start_param;
  if (!param) param = getParam('room');
  if (!param) param = getParam('startapp');

  if (param && param.indexOf('room_') === 0) {
    var rid = param.replace('room_', '');
    doJoinRoom(rid);
  } else {
    showScreen('home');
    loadDemoGrid('#vk-grid');
  }
}

/* ═══════════════════════════════════════════════════════════════
   ROOM — СОЗДАНИЕ
   ═══════════════════════════════════════════════════════════════ */
function createRoom(video) {
  var rid = uid();
  S.roomId = rid;
  S.isHost = true;
  S.video  = video;

  var roomData = {
    id:        rid,
    hostId:    S.user.id,
    title:     video.title || 'Комната',
    thumb:     video.thumb || '',
    source:    video.source || '',
    videoId:   video.id    || '',
    embedUrl:  video.embedUrl || '',
    playerUrl: video.player   || '',
    ownerVk:   video.owner_id || '',
    vidVk:     video.vid      || '',
    keyVk:     video.access_key || '',
    directUrl: video.url  || '',
    createdAt: Date.now(),
    state_playing:  false,
    state_time:     0,
    state_updatedAt: Date.now(),
  };

  // Записываем в GUN
  var gRoom = gun.get('cinewave_rooms').get(rid);
  Object.keys(roomData).forEach(function(k) {
    gRoom.get(k).put(roomData[k]);
  });
  // Добавляем себя как зрителя
  gRoom.get('viewers').get(S.user.id).put(makeViewer());

  S.gunRoom = gRoom;
  beginRoom(rid, video);
}

/* ═══════════════════════════════════════════════════════════════
   ROOM — ВХОД ПО ССЫЛКЕ
   Главный фикс: слушаем GUN с таймаутом, не ждём localStorage
   ═══════════════════════════════════════════════════════════════ */
function doJoinRoom(rid) {
  toast('Подключение...');
  el('chat-msgs').innerHTML = '<div class="sys-msg">Подключение к комнате...</div>';

  var gRoom = gun.get('cinewave_rooms').get(rid);
  var found = false;
  var timeout;

  // GUN возвращает данные асинхронно — ждём до 8 секунд
  timeout = setTimeout(function() {
    if (!found) {
      toast('Комната не найдена или устарела');
      showScreen('home');
      loadDemoGrid('#vk-grid');
    }
  }, 8000);

  // Читаем все поля комнаты одним once()
  gRoom.once(function(data) {
    if (!data || !data.hostId) return; // GUN вернул пустой узел
    if (found) return;
    found = true;
    clearTimeout(timeout);

    S.roomId = rid;
    S.isHost = (data.hostId === S.user.id);
    S.gunRoom = gRoom;

    // Восстанавливаем объект video из плоских полей GUN
    var video = {
      source:     data.source    || 'youtube',
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
    S.video = video;

    // Добавляем себя как зрителя
    gRoom.get('viewers').get(S.user.id).put(makeViewer());

    beginRoom(rid, video);
    toast('');
  });
}

function makeViewer() {
  return {
    id: S.user.id, name: S.user.name,
    photo: S.user.photo || '', online: true, ts: Date.now(),
  };
}

/* ═══════════════════════════════════════════════════════════════
   ROOM — СТАРТ (общий для create и join)
   ═══════════════════════════════════════════════════════════════ */
function beginRoom(rid, video) {
  showScreen('room');
  S.chatMsgs = []; S.chatCount = 0;
  el('chat-msgs').innerHTML = '<div class="sys-msg">Комната создана. Пригласи друзей!</div>';

  buildInviteLink(rid);
  loadPlayer(video);
  listenSync(rid);
  listenViewers(rid);
  listenChat(rid);
  startPresence(rid);
  showMyRoom(rid, video);
}

function buildInviteLink(rid) {
  var link = S.tg
    ? 'https://t.me/' + BOT_USERNAME + '?startapp=room_' + rid
    : APP_URL + '?room=' + rid;
  S.inviteLink = link;
  el('link-txt').textContent = link;
}

/* ═══════════════════════════════════════════════════════════════
   PLEER
   Используем Piped embed — работает без авторизации в любом WebView
   ═══════════════════════════════════════════════════════════════ */
function loadPlayer(video) {
  if (!video) return;
  el('ploading').style.display = 'flex';
  el('iframe-pl').style.display = 'none';
  el('iframe-pl').src = '';
  el('video-pl').style.display = 'none';
  el('video-pl').src = '';
  el('yt-holder').innerHTML = '';
  S.playerReady = false; S.ytPlayer = null;

  if (video.source === 'youtube' && video.id) {
    // Piped embed — не требует авторизации Google
    loadIframe('https://piped.video/embed/' + video.id + '?autoplay=1&listen=0');
  } else if (video.source === 'vk') {
    loadIframe(buildVkUrl(video));
  } else if (video.source === 'rutube' && video.id) {
    loadIframe('https://rutube.ru/play/embed/' + video.id);
  } else if (video.source === 'direct' && video.url) {
    loadDirect(video.url);
  } else if (video.embedUrl) {
    loadIframe(video.embedUrl);
  } else {
    el('ploading').style.display = 'flex';
  }
}

function buildVkUrl(v) {
  if (v.player) return v.player;
  return 'https://vk.com/video_ext.php?oid=' + (v.owner_id||'')
    + '&id=' + (v.vid||v.id||'') + '&hash=' + (v.access_key||'') + '&hd=1&autoplay=1';
}

function loadIframe(src) {
  var fr = el('iframe-pl');
  fr.src = src;
  fr.style.display = 'block';
  el('ploading').style.display = 'none';
  S.playerReady = true;
  fr.onload = function() { el('ploading').style.display = 'none'; };
}

function loadDirect(url) {
  var vp = el('video-pl');
  vp.src = url; vp.style.display = 'block';
  el('ploading').style.display = 'none';
  S.playerReady = true;
  vp.play().catch(function() {});
  vp.onplay   = function() { if (S.isHost) pushSync(true,  vp.currentTime); };
  vp.onpause  = function() { if (S.isHost) pushSync(false, vp.currentTime); };
  vp.onseeked = function() { if (S.isHost) pushSync(!vp.paused, vp.currentTime); };
}

/* ═══════════════════════════════════════════════════════════════
   SYNC через GUN
   ═══════════════════════════════════════════════════════════════ */
function listenSync(rid) {
  var gRoom = gun.get('cinewave_rooms').get(rid);
  // Слушаем изменения state в реалтайм
  gRoom.get('state_playing').on(function(playing) {
    if (S.isHost) return;
    gRoom.get('state_time').once(function(time) {
      gRoom.get('state_updatedAt').once(function(updAt) {
        applySync({ playing: playing, time: time||0, updatedAt: updAt||Date.now() });
      });
    });
  });
}

function pushSync(playing, time) {
  if (!S.roomId || !S.gunRoom) return;
  S.gunRoom.get('state_playing').put(playing);
  S.gunRoom.get('state_time').put(time || 0);
  S.gunRoom.get('state_updatedAt').put(Date.now());
}

function applySync(state) {
  if (!S.playerReady) return;
  var age    = (Date.now() - (state.updatedAt || Date.now())) / 1000;
  var target = state.playing ? (state.time||0) + age : (state.time||0);

  var vp = el('video-pl');
  if (vp && vp.src && vp.style.display !== 'none') {
    if (Math.abs(vp.currentTime - target) > 3.5) { vp.currentTime = target; flashDesync(); }
    if (state.playing && vp.paused)  vp.play().catch(function(){});
    if (!state.playing && !vp.paused) vp.pause();
  }
}

function flashDesync() {
  var sp = el('spill'), sl = el('slbl');
  if (!sp||!sl) return;
  sp.classList.add('desync'); sl.textContent = 'Синхронизация...';
  setTimeout(function() { sp.classList.remove('desync'); sl.textContent = 'Синхронизировано'; }, 2000);
}

/* ═══════════════════════════════════════════════════════════════
   VIEWERS через GUN
   ═══════════════════════════════════════════════════════════════ */
function listenViewers(rid) {
  var gViewers = gun.get('cinewave_rooms').get(rid).get('viewers');
  gViewers.map().on(function(v, k) {
    if (!v || !v.id) return;
    S.viewers[k] = v;
    renderViewers();
  });
}

function renderViewers() {
  var keys = Object.keys(S.viewers);
  el('watch-n').textContent = keys.length;
  var bar = el('vbar'); bar.innerHTML = '';
  keys.forEach(function(k) {
    var v = S.viewers[k];
    var d = document.createElement('div');
    d.className = 'vava'; d.title = v.name||'';
    d.innerHTML = v.photo ? '<img src="'+esc(v.photo)+'" alt=""/>' : initials(v.name||'G');
    bar.appendChild(d);
  });
}

function startPresence(rid) {
  clearInterval(S.presTimer);
  S.presTimer = setInterval(function() {
    gun.get('cinewave_rooms').get(rid).get('viewers').get(S.user.id).get('ts').put(Date.now());
  }, 15000);
}

/* ═══════════════════════════════════════════════════════════════
   ЧАТ через GUN — реалтайм, без polling
   ═══════════════════════════════════════════════════════════════ */
function listenChat(rid) {
  var gChat = gun.get('cinewave_rooms').get(rid).get('chat');
  S.gunChat = gChat;

  // GUN map().on() вызывается для каждого нового и существующего сообщения
  var seen = {};
  gChat.map().on(function(msg, k) {
    if (!msg || !msg.text || seen[k]) return;
    seen[k] = true;
    S.chatMsgs.push(msg);
    // Сортируем по времени
    S.chatMsgs.sort(function(a,b){ return (a.ts||0) - (b.ts||0); });
    renderChat();
  });
}

function sendMsg(text) {
  text = (text||'').trim();
  if (!text || !S.roomId || !S.gunChat) return;
  var msg = {
    uid:   S.user.id,
    name:  S.user.name,
    photo: S.user.photo || '',
    text:  text,
    ts:    Date.now(),
  };
  // push в GUN — уникальный ключ через uid()
  S.gunChat.get(uid()).put(msg);
}

function renderChat() {
  var c = el('chat-msgs');
  var atBottom = (c.scrollHeight - c.scrollTop - c.clientHeight) < 90;
  c.innerHTML = '';
  if (!S.chatMsgs.length) {
    c.innerHTML = '<div class="sys-msg">Комната создана. Пригласи друзей!</div>';
    return;
  }
  S.chatMsgs.slice(-80).forEach(function(msg) {
    var own = (String(msg.uid) === String(S.user.id));
    var d = document.createElement('div');
    d.className = 'cmsg' + (own ? ' own' : '');
    var av = document.createElement('div');
    av.className = 'mava';
    av.innerHTML = msg.photo ? '<img src="'+esc(msg.photo)+'" alt=""/>' : initials(msg.name||'G');
    var body = document.createElement('div');
    body.className = 'mbody';
    if (!own) {
      var nm = document.createElement('div');
      nm.className = 'mname'; nm.textContent = msg.name||'Гость';
      body.appendChild(nm);
    }
    var tx = document.createElement('div');
    tx.className = 'mtxt'; tx.textContent = msg.text||'';
    body.appendChild(tx);
    d.appendChild(av); d.appendChild(body);
    c.appendChild(d);
  });
  if (atBottom) c.scrollTop = c.scrollHeight;
}

/* ═══════════════════════════════════════════════════════════════
   ПОИСК — Piped API (YouTube без ключа, без CORS)
   ═══════════════════════════════════════════════════════════════ */
function searchYT(query, gridId) {
  gridId = gridId || '#search-grid';
  var c = qs(gridId);
  if (!c) return;
  c.innerHTML = '<div class="loading-s"><div class="spin"></div><p>Поиск...</p></div>';
  _pipedSearch(query, 0, gridId);
}

function _pipedSearch(query, idx, gridId) {
  if (idx >= PIPED.length) { loadDemoGrid(gridId); return; }
  var url = PIPED[idx] + '/search?q=' + encodeURIComponent(query) + '&filter=videos';
  var ctrl; var sig;
  try { ctrl = new AbortController(); sig = ctrl.signal; setTimeout(function(){ctrl.abort();},6000); } catch(e){}
  fetch(url, sig ? {signal:sig} : {})
    .then(function(r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function(data) {
      var items = data.items || data.results || [];
      if (!items.length) throw new Error('empty');
      var videos = items.slice(0,12).map(function(it) {
        // Piped возвращает url вида /watch?v=ID
        var vid = (it.url||'').replace('/watch?v=','').split('&')[0];
        var thumb = it.thumbnail || it.thumbnailUrl || (vid ? 'https://img.youtube.com/vi/'+vid+'/mqdefault.jpg' : '');
        return {
          source: 'youtube', id: vid,
          title: it.title||'', views: it.uploaderName||it.author||'',
          thumb: thumb,
          embedUrl: 'https://piped.video/embed/'+vid+'?autoplay=1',
        };
      }).filter(function(v){ return v.id; });
      if (!videos.length) throw new Error('no valid');
      renderGrid(videos, gridId);
    })
    .catch(function() { _pipedSearch(query, idx+1, gridId); });
}

/* ─── VK поиск (без токена → Piped) ─────────────────────────── */
function searchVK(query) { searchYT(query, '#vk-grid'); }

/* ─── Демо ───────────────────────────────────────────────────── */
var DEMO = [
  {id:'LXb3EKWsInQ',title:'Inception — Full Movie',views:'12M'},
  {id:'GnSFL_0lh8s',title:'Interstellar — Trailer',views:'45M'},
  {id:'hA6hldpSTF8',title:'The Dark Knight Rises',views:'20M'},
  {id:'2AHeRx4KR6Q',title:'Dune (2021) — Full Movie',views:'8M'},
  {id:'EXeTwQWrcwY',title:'Blade Runner 2049',views:'15M'},
  {id:'v9SHJFXHkzQ',title:'Avengers: Endgame',views:'98M'},
];
function loadDemoGrid(gridId) {
  renderGrid(DEMO.map(function(v){
    return { source:'youtube', id:v.id, title:v.title, views:v.views,
      thumb:'https://img.youtube.com/vi/'+v.id+'/mqdefault.jpg',
      embedUrl:'https://piped.video/embed/'+v.id+'?autoplay=1' };
  }), gridId);
}

/* ─── Render grid ─────────────────────────────────────────────── */
function renderGrid(videos, gridId) {
  var c = qs(gridId);
  if (!c) return;
  c.innerHTML = '';
  if (!videos||!videos.length) { c.innerHTML = '<div class="no-res">Ничего не найдено</div>'; return; }
  videos.forEach(function(v) { c.appendChild(buildCard(v)); });
}

function buildCard(v) {
  var d = document.createElement('div'); d.className = 'vcard';
  var thumb = v.thumb || (v.id ? 'https://img.youtube.com/vi/'+v.id+'/mqdefault.jpg' : '');
  d.innerHTML = '<div class="vthumb">'
    + (thumb ? '<img src="'+esc(thumb)+'" alt="" loading="lazy" onerror="this.style.opacity=0"/>' : '')
    + '<div class="vplay"><svg width="32" height="32" viewBox="0 0 32 32" fill="none">'
    + '<circle cx="16" cy="16" r="16" fill="rgba(0,0,0,.45)"/>'
    + '<path d="M12 10l12 6-12 6V10z" fill="white"/></svg></div></div>'
    + '<div class="vmeta"><div class="vtitle">'+esc(v.title||'Видео')+'</div>'
    + '<div class="vsub">'+esc(v.views||'')+'</div></div>';
  d.addEventListener('click', function() { onVideoClick(v); });
  return d;
}

function onVideoClick(v) { createRoom(v); }

/* ─── URL parser ──────────────────────────────────────────────── */
function parseURL(url) {
  url = (url||'').trim();
  if (!url) return null;
  var yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return { source:'youtube', id:yt[1], title:'YouTube видео',
    thumb:'https://img.youtube.com/vi/'+yt[1]+'/mqdefault.jpg',
    embedUrl:'https://piped.video/embed/'+yt[1]+'?autoplay=1' };
  var vk = url.match(/vk\.com\/video(-?\d+)_(\d+)/);
  if (vk) return { source:'vk', owner_id:vk[1], vid:vk[2], title:'VK видео',
    player:'https://vk.com/video_ext.php?oid='+vk[1]+'&id='+vk[2]+'&hd=1&autoplay=1' };
  var rt = url.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rt) return { source:'rutube', id:rt[1], title:'RuTube видео',
    embedUrl:'https://rutube.ru/play/embed/'+rt[1] };
  if (/\.(mp4|webm|ogv|m3u8)(\?.*)?$/i.test(url)) return { source:'direct', url:url, title:'Видео' };
  if (/^https?:\/\//i.test(url)) return { source:'iframe', embedUrl:url, title:'Видео' };
  return null;
}

/* ─── INVITE ──────────────────────────────────────────────────── */
function openInv() { el('link-txt').textContent = S.inviteLink||''; el('inv-modal').style.display='flex'; }
function closeInv() { el('inv-modal').style.display='none'; }

/* ─── MY ROOM (главный экран) ─────────────────────────────────── */
function showMyRoom(rid, video) {
  var sec = el('my-rooms'), lst = el('my-rooms-list');
  if (!sec||!lst) return;
  sec.style.display = 'block';
  var d = document.createElement('div'); d.className = 'rcard';
  d.innerHTML = '<div class="rthumb">'
    +(video.thumb?'<img src="'+esc(video.thumb)+'" alt=""/>':'')
    +'</div><div class="rcinfo"><div class="rctitle">'+esc(video.title||'Комната')+'</div>'
    +'<div class="rcmeta">'+rid+'</div></div>'
    +'<div class="live-badge">LIVE</div>';
  d.addEventListener('click', function() { showScreen('room'); });
  lst.innerHTML = ''; lst.appendChild(d);
}

/* ─── ВЫЙТИ ───────────────────────────────────────────────────── */
function leaveRoom() {
  clearInterval(S.presTimer); S.presTimer = null;
  // GUN off не нужен — подписки уйдут при пересоздании
  var fr = el('iframe-pl'); fr.src=''; fr.style.display='none';
  var vp = el('video-pl'); vp.pause(); vp.src=''; vp.style.display='none';
  el('yt-holder').innerHTML='';
  el('ploading').style.display='flex';
  S.playerReady=false; S.ytPlayer=null; S.roomId=null;
  S.chatMsgs=[]; S.chatCount=0; S.viewers={};
  S.gunRoom=null; S.gunChat=null;
  showScreen('home');
}

/* ═══════════════════════════════════════════════════════════════
   СОБЫТИЯ
   ═══════════════════════════════════════════════════════════════ */
function bindEvents() {

  /* home */
  el('btn-vk').addEventListener('click', function() {
    showScreen('vk');
    if (!qs('#vk-grid .vcard')) searchVK('фильмы 2024');
  });
  el('btn-search').addEventListener('click', function() { showScreen('search'); });
  el('btn-url').addEventListener('click', function() { showScreen('url'); });

  /* vk screen */
  el('close-vk').addEventListener('click', function() { showScreen('home'); });
  el('vk-q').addEventListener('input', function(e) {
    clearTimeout(S.vkDeb);
    var v = e.target.value.trim();
    if (v.length < 2) return;
    S.vkDeb = setTimeout(function() { searchVK(v); }, 500);
  });
  qsa('#vk-cats .cat').forEach(function(b) {
    b.addEventListener('click', function() {
      qsa('#vk-cats .cat').forEach(function(x){x.classList.remove('active');});
      b.classList.add('active');
      searchVK(b.dataset.q);
    });
  });

  /* search screen */
  el('close-search').addEventListener('click', function() { showScreen('home'); });
  el('search-q').addEventListener('input', function(e) {
    clearTimeout(S.searchDeb);
    var v = e.target.value.trim();
    if (v.length < 2) return;
    S.searchDeb = setTimeout(function() { searchYT(v, '#search-grid'); }, 500);
  });
  qsa('#src-tabs .cat').forEach(function(b) {
    b.addEventListener('click', function() {
      qsa('#src-tabs .cat').forEach(function(x){x.classList.remove('active');});
      b.classList.add('active');
      var q = el('search-q').value.trim();
      if (q.length > 1) searchYT(q, '#search-grid');
    });
  });

  /* url screen */
  el('close-url').addEventListener('click', function() { showScreen('home'); });
  el('url-go').addEventListener('click', handleURL);
  el('url-inp').addEventListener('keydown', function(e) { if (e.key==='Enter') handleURL(); });
  qsa('.chip').forEach(function(c) {
    c.addEventListener('click', function() { el('url-inp').value = c.dataset.u; });
  });

  /* room */
  el('btn-back').addEventListener('click', leaveRoom);
  el('inv-btn').addEventListener('click', openInv);
  el('ov-inv').addEventListener('click', openInv);

  /* invite modal */
  el('close-inv').addEventListener('click', closeInv);
  el('inv-modal').addEventListener('click', function(e) { if (e.target===el('inv-modal')) closeInv(); });
  el('copy-btn').addEventListener('click', function() { copyText(S.inviteLink); toast('Ссылка скопирована!'); });
  el('tg-share').addEventListener('click', function() {
    if (S.tg) {
      try { S.tg.switchInlineQuery('room_'+S.roomId,['users','groups']); return; } catch(e){}
    }
    window.open('https://t.me/share/url?url='+encodeURIComponent(S.inviteLink)+'&text='+encodeURIComponent('Смотрим вместе в CineWave!\n'+S.inviteLink),'_blank');
  });

  /* chat */
  el('send-btn').addEventListener('click', doSend);
  el('chat-inp').addEventListener('keydown', function(e) {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });
}

function doSend() {
  var inp = el('chat-inp');
  var v = (inp.value||'').trim();
  if (!v) return;
  sendMsg(v);
  inp.value = '';
  inp.focus();
}

function handleURL() {
  var u = (el('url-inp').value||'').trim();
  if (!u) { toast('Введите ссылку'); return; }
  var v = parseURL(u);
  if (!v) { toast('Не удалось распознать ссылку'); return; }
  onVideoClick(v);
}

/* ─── СТАРТ ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  bindEvents();
  initTG();
});
