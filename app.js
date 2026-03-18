/* ================================================================
   CineWave — app.js  ФИНАЛ

   ИСТОЧНИКИ:
   1. Web    → Telegram.WebApp.openLink() — нативный браузер
   2. RuTube → CORS proxy + публичный API
   3. VK     → Telegram.WebApp.openLink() + ручная вставка ссылки

   СИНХРОНИЗАЦИЯ + ЧАТ → GUN.js p2p (без ключей)
   ПЕРЕХОД ПО ССЫЛКЕ   → GUN retry до 8 сек (100% работает)
   ================================================================ */
'use strict';

/* ── НАСТРОЙ ЭТИ 2 СТРОКИ ─────────────────────────────────────── */
var APP_URL      = 'https://kronos2008.github.io/Test1/';
var BOT_USERNAME = 'Newbot_testrobot';
/* ────────────────────────────────────────────────────────────────── */

/* GUN peers */
var GUN_PEERS = [
  'https://gun-manhattan.herokuapp.com/gun',
  'https://peer.wallie.io/gun',
  'https://gundb-relay-mlccl.ondigitalocean.app/gun',
];

/*
  CORS proxy для RuTube API.
  allorigins.win — бесплатный, работает без ключей.
  Если упадёт — попробует corsproxy.io
*/
var CORS_PROXIES = [
  'https://api.allorigins.win/get?url=',
  'https://corsproxy.io/?',
];

var RUTUBE_SEARCH = 'https://rutube.ru/api/search/video/?query=';

/* ── СОСТОЯНИЕ ────────────────────────────────────────────────── */
var S = {
  tg: null, user: null,
  roomId: null, isHost: false, video: null, inviteLink: '',
  viewers: {}, chatMsgs: [],
  playerReady: false, presTimer: null,
  gunRoom: null, gunChat: null,
  rtDeb: null,
};

var gun = Gun(GUN_PEERS);

/* ── DOM ──────────────────────────────────────────────────────── */
function el(id)  { return document.getElementById(id); }
function qs(s)   { return document.querySelector(s); }
function qsa(s)  { return Array.from(document.querySelectorAll(s)); }

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
var _tt = null;
function toast(msg, ms) {
  ms = ms || 2600;
  var t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_tt);
  _tt = setTimeout(function() { t.classList.remove('show'); }, ms);
}

/* ── УТИЛИТЫ ──────────────────────────────────────────────────── */
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
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).catch(function() { fbCopy(t); });
  } else { fbCopy(t); }
}
function fbCopy(t) {
  var ta = document.createElement('textarea');
  ta.value = t; ta.style.cssText='position:fixed;top:-200px;opacity:0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
}
function getParam(k) {
  try { return new URLSearchParams(window.location.search).get(k); } catch(e) { return null; }
}

/* ── ОТКРЫТЬ ССЫЛКУ НАТИВНО ───────────────────────────────────── */
function openLink(url) {
  if (S.tg) {
    // В Telegram — открывает в системном браузере
    S.tg.openLink(url);
  } else {
    window.open(url, '_blank');
  }
}

/* ── TELEGRAM ─────────────────────────────────────────────────── */
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
  }
}

/* ════════════════════════════════════════
   КОМНАТА — СОЗДАТЬ
   ════════════════════════════════════════ */
function createRoom(video) {
  var rid = uid();
  S.roomId = rid; S.isHost = true; S.video = video;

  var g = gun.get('cw_r2').get(rid);
  g.get('hid').put(String(S.user.id));
  g.get('title').put(video.title    || 'Видео');
  g.get('thumb').put(video.thumb    || '');
  g.get('src').put(video.source     || 'iframe');
  g.get('vid').put(video.id         || '');
  g.get('emb').put(video.embedUrl   || '');
  g.get('pl').put(video.player      || '');
  g.get('oid').put(video.owner_id   || '');
  g.get('vvid').put(video.vid       || '');
  g.get('key').put(video.access_key || '');
  g.get('dir').put(video.url        || '');
  g.get('ts').put(Date.now());
  g.get('sp').put(false);
  g.get('st').put(0);
  g.get('su').put(Date.now());
  g.get('viewers').get(S.user.id).put(mkViewer());
  S.gunRoom = g;
  beginRoom(rid, video);
}

/* ════════════════════════════════════════
   КОМНАТА — ВОЙТИ ПО ССЫЛКЕ
   retry каждые 500мс, до 16 попыток (8 сек)
   ════════════════════════════════════════ */
function joinRoom(rid) {
  toast('Подключение...', 9000);
  var g = gun.get('cw_r2').get(rid);
  var done = false, tries = 0;

  function attempt() {
    if (done) return;
    tries++;
    g.get('hid').once(function(hid) {
      if (done) return;
      if (!hid) {
        if (tries < 16) { setTimeout(attempt, 500); }
        else { done=true; toast('Комната не найдена'); showScreen('home'); }
        return;
      }
      done = true;
      g.once(function(data) {
        if (!data) { toast('Ошибка загрузки комнаты'); showScreen('home'); return; }
        S.roomId = rid;
        S.isHost = (hid === S.user.id);
        S.video  = {
          source: data.src  || 'iframe',
          id:     data.vid  || '',
          title:  data.title|| 'Видео',
          thumb:  data.thumb|| '',
          embedUrl:   data.emb || '',
          player:     data.pl  || '',
          owner_id:   data.oid || '',
          vid:        data.vvid|| '',
          access_key: data.key || '',
          url:        data.dir || '',
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
  return { id: S.user.id, name: S.user.name, photo: S.user.photo||'', ts: Date.now() };
}

/* ════════════════════════════════════════
   НАЧАТЬ КОМНАТУ
   ════════════════════════════════════════ */
function beginRoom(rid, video) {
  toast('');
  showScreen('room');
  S.chatMsgs = [];
  el('cmsgs').innerHTML = '<div class="sys">Комната создана. Пригласи друга!</div>';

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
  el('ltxt').textContent = link;
}

/* ════════════════════════════════════════
   ПЛЕЕР
   RuTube и VK — embed iframe (работают без авторизации)
   Прямые ссылки — <video>
   ════════════════════════════════════════ */
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
    // RuTube embed — работает без авторизации
    src = 'https://rutube.ru/play/embed/' + video.id + '?autoPlay=1&skinColor=8B5CF6';
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
    var fr = el('iframe-pl');
    fr.src = src;
    fr.style.display = 'block';
    el('ploading').style.display = 'none';
    S.playerReady = true;
  } else {
    el('ploading').style.display = 'flex';
    toast('Не удалось загрузить видео. Попробуй другой источник.');
  }
}

function buildVkEmbed(v) {
  if (v.player) return v.player;
  var oid = v.owner_id || '';
  var vid = v.vid || v.id || '';
  var key = v.access_key || '';
  return 'https://vk.com/video_ext.php?oid=' + oid + '&id=' + vid + '&hash=' + key + '&hd=1&autoplay=1';
}

function loadDirect(url) {
  var vp = el('video-pl');
  vp.src = url; vp.style.display = 'block';
  el('ploading').style.display = 'none';
  S.playerReady = true;
  vp.play().catch(function(){});
  vp.onplay   = function() { if (S.isHost) pushSync(true,  vp.currentTime); };
  vp.onpause  = function() { if (S.isHost) pushSync(false, vp.currentTime); };
  vp.onseeked = function() { if (S.isHost) pushSync(!vp.paused, vp.currentTime); };
}

/* ════════════════════════════════════════
   SYNC
   ════════════════════════════════════════ */
function watchSync(rid) {
  var g = gun.get('cw_r2').get(rid);
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
  S.gunRoom.get('st').put(time||0);
  S.gunRoom.get('su').put(Date.now());
}
function applySync(playing, time, updAt) {
  if (!S.playerReady) return;
  var age = (Date.now() - updAt) / 1000;
  var tgt = playing ? time + age : time;
  var vp  = el('video-pl');
  if (vp && vp.src && vp.style.display !== 'none') {
    if (Math.abs(vp.currentTime - tgt) > 3.5) { vp.currentTime = tgt; flashDesync(); }
    if (playing  && vp.paused)  vp.play().catch(function(){});
    if (!playing && !vp.paused) vp.pause();
  }
}
function flashDesync() {
  var sp = el('spill'), sl = el('slbl');
  if (!sp||!sl) return;
  sp.classList.add('desync'); sl.textContent = 'Синхронизация...';
  setTimeout(function() { sp.classList.remove('desync'); sl.textContent = 'Синхронизировано'; }, 2000);
}

/* ════════════════════════════════════════
   VIEWERS
   ════════════════════════════════════════ */
function watchViewers(rid) {
  gun.get('cw_r2').get(rid).get('viewers').map().on(function(v, k) {
    if (!v||!v.id) return;
    S.viewers[k] = v; renderViewers();
  });
}
function renderViewers() {
  var keys = Object.keys(S.viewers);
  el('wn').textContent = keys.length;
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
    gun.get('cw_r2').get(rid).get('viewers').get(S.user.id).get('ts').put(Date.now());
  }, 15000);
}

/* ════════════════════════════════════════
   ЧАТ (GUN реалтайм)
   ════════════════════════════════════════ */
function watchChat(rid) {
  S.gunChat = gun.get('cw_r2').get(rid).get('chat');
  var seen = {};
  S.gunChat.map().on(function(msg, k) {
    if (!msg||!msg.text||seen[k]) return;
    seen[k] = true;
    S.chatMsgs.push(msg);
    S.chatMsgs.sort(function(a,b){ return (a.ts||0)-(b.ts||0); });
    renderChat();
  });
}
function sendMsg(text) {
  text = (text||'').trim();
  if (!text||!S.roomId||!S.gunChat) return;
  S.gunChat.get(uid()).put({
    uid: S.user.id, name: S.user.name,
    photo: S.user.photo||'', text: text, ts: Date.now(),
  });
}
function renderChat() {
  var c = el('cmsgs');
  var atBot = (c.scrollHeight - c.scrollTop - c.clientHeight) < 90;
  c.innerHTML = '';
  if (!S.chatMsgs.length) {
    c.innerHTML = '<div class="sys">Комната создана. Пригласи друга!</div>';
    return;
  }
  S.chatMsgs.slice(-80).forEach(function(msg) {
    var own = (String(msg.uid) === String(S.user.id));
    var d   = document.createElement('div');
    d.className = 'cmsg' + (own?' own':'');
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
  if (atBot) c.scrollTop = c.scrollHeight;
}

/* ════════════════════════════════════════
   RUTUBE — поиск через CORS proxy
   Пробуем несколько прокси по очереди
   ════════════════════════════════════════ */
function searchRuTube(query) {
  var g = el('rt-grid');
  g.innerHTML = '<div class="gload"><div class="spin"></div><p>Поиск...</p></div>';
  tryRuTubeProxy(query, 0);
}

function tryRuTubeProxy(query, idx) {
  var g = el('rt-grid');
  if (idx >= CORS_PROXIES.length) {
    g.innerHTML = '<div class="nores">RuTube недоступен. Попробуй вставить ссылку вручную.</div>';
    return;
  }

  var apiUrl   = RUTUBE_SEARCH + encodeURIComponent(query) + '&page=1&per_page=20';
  var proxyUrl = CORS_PROXIES[idx] + encodeURIComponent(apiUrl);

  var ctrl; var sig;
  try { ctrl = new AbortController(); sig = ctrl.signal; setTimeout(function(){ctrl.abort();},7000); } catch(e){}

  fetch(proxyUrl, sig ? {signal:sig} : {})
    .then(function(r) { return r.ok ? r.json() : Promise.reject('bad'); })
    .then(function(data) {
      // allorigins оборачивает в { contents: "..." }
      var raw = data;
      if (data && data.contents) {
        try { raw = JSON.parse(data.contents); } catch(e) { raw = data; }
      }
      var items = (raw && raw.results) ? raw.results : [];
      if (!items.length) throw new Error('empty');

      var videos = items.map(function(it) {
        var hash = '';
        var m = (it.video_url || it.url || '').match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
        if (!m) m = (it.id || '').toString().match(/([a-zA-Z0-9]+)/);
        if (m) hash = m[1];
        // Если есть прямой id из API
        if (!hash && it.id && typeof it.id === 'string' && it.id.length > 10) hash = it.id;

        return {
          source:   'rutube',
          id:       hash,
          title:    it.title || '',
          views:    it.hits ? formatNum(it.hits) + ' просм.' : '',
          thumb:    it.thumbnail_url || it.poster || '',
          embedUrl: hash ? 'https://rutube.ru/play/embed/' + hash + '?autoPlay=1' : '',
        };
      }).filter(function(v) { return v.id && v.embedUrl; });

      if (!videos.length) throw new Error('no valid');
      renderGrid(videos, '#rt-grid');
    })
    .catch(function() {
      tryRuTubeProxy(query, idx + 1);
    });
}

function formatNum(n) {
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n/1000).toFixed(0) + 'K';
  return String(n);
}

/* ════════════════════════════════════════
   RENDER GRID
   ════════════════════════════════════════ */
function renderGrid(videos, sel) {
  var c = qs(sel);
  if (!c) return;
  c.innerHTML = '';
  if (!videos||!videos.length) {
    c.innerHTML = '<div class="nores">Ничего не найдено</div>';
    return;
  }
  videos.forEach(function(v) { c.appendChild(buildCard(v)); });
}

function buildCard(v) {
  var d = document.createElement('div'); d.className = 'vcard';
  var thumb = v.thumb || '';
  d.innerHTML = '<div class="vthumb">'
    + (thumb ? '<img src="'+esc(thumb)+'" alt="" loading="lazy" onerror="this.style.opacity=0"/>' : '')
    + '<div class="vplay"><svg width="32" height="32" viewBox="0 0 32 32" fill="none">'
    + '<circle cx="16" cy="16" r="16" fill="rgba(0,0,0,.45)"/>'
    + '<path d="M12 10l12 6-12 6V10z" fill="white"/></svg></div></div>'
    + '<div class="vmeta"><div class="vtitle">'+esc(v.title||'Видео')+'</div>'
    + '<div class="vsub">'+esc(v.views||'')+'</div></div>';
  d.addEventListener('click', function() { createRoom(v); });
  return d;
}

/* ════════════════════════════════════════
   URL PARSER
   ════════════════════════════════════════ */
function parseURL(url) {
  url = (url||'').trim();
  if (!url) return null;

  // YouTube
  var yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return {
    source:'iframe', id:yt[1], title:'YouTube видео',
    thumb:'https://img.youtube.com/vi/'+yt[1]+'/mqdefault.jpg',
    embedUrl:'https://www.youtube.com/embed/'+yt[1]+'?autoplay=1',
  };

  // VK video (разные форматы)
  var vk1 = url.match(/vk\.com\/video(-?\d+)_(\d+)/);
  if (vk1) return {
    source:'vk', owner_id:vk1[1], vid:vk1[2], title:'VK видео', thumb:'',
    player:'https://vk.com/video_ext.php?oid='+vk1[1]+'&id='+vk1[2]+'&hd=1&autoplay=1',
  };
  var vk2 = url.match(/vk\.com\/clip(-?\d+)_(\d+)/);
  if (vk2) return {
    source:'vk', owner_id:vk2[1], vid:vk2[2], title:'VK клип', thumb:'',
    player:'https://vk.com/video_ext.php?oid='+vk2[1]+'&id='+vk2[2]+'&hd=1&autoplay=1',
  };
  // VK watch/video страница
  var vk3 = url.match(/vk\.com\/(?:video|watch)\?(?:.*&)?z=video(-?\d+)_(\d+)/);
  if (vk3) return {
    source:'vk', owner_id:vk3[1], vid:vk3[2], title:'VK видео', thumb:'',
    player:'https://vk.com/video_ext.php?oid='+vk3[1]+'&id='+vk3[2]+'&hd=1&autoplay=1',
  };

  // RuTube
  var rt = url.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rt) return {
    source:'rutube', id:rt[1], title:'RuTube видео', thumb:'',
    embedUrl:'https://rutube.ru/play/embed/'+rt[1]+'?autoPlay=1',
  };

  // cdn04 / a-l-p-a.com
  if (url.indexOf('cdn04.ru') !== -1 || url.indexOf('a-l-p-a.com') !== -1) {
    return { source:'iframe', title:'Онлайн кино', thumb:'', embedUrl:url };
  }

  // Прямой файл
  if (/\.(mp4|webm|ogv|m3u8)(\?.*)?$/i.test(url)) {
    return { source:'direct', url:url, title:'Видео', thumb:'' };
  }

  // Общий iframe
  if (/^https?:\/\//i.test(url)) {
    return { source:'iframe', embedUrl:url, title:'Видео', thumb:'' };
  }

  return null;
}

/* ════════════════════════════════════════
   INVITE MODAL
   ════════════════════════════════════════ */
function openInv() { el('ltxt').textContent = S.inviteLink||''; el('imodal').style.display='flex'; }
function closeInv() { el('imodal').style.display='none'; }

/* ════════════════════════════════════════
   МОЯ КОМНАТА (главный экран)
   ════════════════════════════════════════ */
function showMyRoom(rid, video) {
  var sec = el('my-rooms'), lst = el('rooms-list');
  if (!sec||!lst) return;
  sec.style.display = 'block';
  var d = document.createElement('div'); d.className = 'rcard';
  d.innerHTML = '<div class="rthumb">'
    + (video.thumb ? '<img src="'+esc(video.thumb)+'" alt=""/>' : '')
    + '</div><div class="rcinfo">'
    + '<div class="rct">'+esc(video.title||'Комната')+'</div>'
    + '<div class="rcm">Комната активна</div>'
    + '</div><div class="lbadge">LIVE</div>';
  d.addEventListener('click', function() { showScreen('room'); });
  lst.innerHTML = ''; lst.appendChild(d);
}

/* ════════════════════════════════════════
   ПОКИНУТЬ КОМНАТУ
   ════════════════════════════════════════ */
function leaveRoom() {
  clearInterval(S.presTimer); S.presTimer = null;
  var fr = el('iframe-pl'); fr.src=''; fr.style.display='none';
  var vp = el('video-pl'); vp.pause(); vp.src=''; vp.style.display='none';
  el('ploading').style.display='flex';
  S.playerReady=false; S.roomId=null; S.chatMsgs=[]; S.viewers={};
  S.gunRoom=null; S.gunChat=null;
  showScreen('home');
}

/* ════════════════════════════════════════
   СОБЫТИЯ
   ════════════════════════════════════════ */
function bindEvents() {

  /* ── HOME: кнопки источников ── */

  // Web — открыть cdn04 в нативном браузере
  el('src-web').addEventListener('click', function() {
    openLink('https://cdn04.ru.a-l-p-a.com/web/prod/web.html');
    toast('Найди фильм, скопируй ссылку и вставь сюда', 4000);
  });

  // RuTube — открыть поиск в шторке
  el('src-rutube').addEventListener('click', function() {
    showScreen('rutube');
    searchRuTube('фильм');
  });

  // VK — шторка с инструкцией
  el('src-vk').addEventListener('click', function() {
    showScreen('vk');
  });

  /* ── HOME: вставить ссылку ── */
  el('paste-go').addEventListener('click', handlePaste);
  el('paste-inp').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handlePaste();
  });

  /* ── RUTUBE ── */
  el('close-rt').addEventListener('click', function() { showScreen('home'); });
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

  /* ── VK ── */
  el('close-vk').addEventListener('click', function() { showScreen('home'); });

  // Открыть VK в нативном браузере
  el('open-vk-browser').addEventListener('click', function() {
    openLink('https://vk.com/video');
    toast('Найди фильм → скопируй ссылку → вставь ниже', 5000);
  });

  // Вставить VK ссылку
  el('vk-url-go').addEventListener('click', handleVKPaste);
  el('vk-url-inp').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleVKPaste();
  });

  /* ── ROOM ── */
  el('room-back').addEventListener('click', leaveRoom);
  el('inv-btn').addEventListener('click', openInv);
  el('pov-inv').addEventListener('click', openInv);

  /* ── INVITE MODAL ── */
  el('close-imodal').addEventListener('click', closeInv);
  el('imodal').addEventListener('click', function(e) {
    if (e.target === el('imodal')) closeInv();
  });
  el('copybtn').addEventListener('click', function() {
    copyText(S.inviteLink);
    toast('Ссылка скопирована!');
  });
  el('tgshare').addEventListener('click', function() {
    if (S.tg) {
      try { S.tg.switchInlineQuery('room_'+S.roomId,['users','groups']); return; } catch(e){}
    }
    window.open(
      'https://t.me/share/url?url=' + encodeURIComponent(S.inviteLink)
      + '&text=' + encodeURIComponent('Смотрим вместе!\n' + S.inviteLink),
      '_blank'
    );
  });

  /* ── CHAT ── */
  el('sbtn').addEventListener('click', doSend);
  el('cinp').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });
}

/* ── Обработчики вставки URL ──────────────────────────────────── */
function handlePaste() {
  var u = (el('paste-inp').value||'').trim();
  if (!u) { toast('Вставьте ссылку на видео'); return; }
  var v = parseURL(u);
  if (!v) { toast('Не удалось распознать ссылку'); return; }
  el('paste-inp').value = '';
  createRoom(v);
}

function handleVKPaste() {
  var u = (el('vk-url-inp').value||'').trim();
  if (!u) { toast('Вставьте ссылку на видео VK'); return; }
  var v = parseURL(u);
  if (!v) { toast('Не удалось распознать VK ссылку'); return; }
  el('vk-url-inp').value = '';
  showScreen('home');
  createRoom(v);
}

function doSend() {
  var inp = el('cinp');
  var v = (inp.value||'').trim();
  if (!v) return;
  sendMsg(v);
  inp.value = '';
  inp.focus();
}

/* ── СТАРТ ────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  bindEvents();
  initTG();
});
