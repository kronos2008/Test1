/* ================================================================
   CineWave — app.js С ПЛЕЕРОМ ВНУТРИ ПРИЛОЖЕНИЯ

   ТЕПЕРЬ:
   1. Фильм открывается ВНУТРИ приложения (как на скриншоте)
   2. Плеер показывается прямо в комнате
   3. Чат и фильм на одном экране
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
  gun: null,
  playerMode: false // Режим плеера
};

// Инициализируем GUN
var gun = Gun({ peers: GUN_PEERS, localStorage: false });
S.gun = gun;

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

/* ── ПОЛУЧИТЬ ID ВИДЕО ИЗ ССЫЛКИ ── */
function extractVideoId(url) {
  // RuTube
  var rt = url.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rt) return { type: 'rutube', id: rt[1] };
  
  // VK видео
  var vk = url.match(/vk\.com\/video(-?\d+)_(\d+)/);
  if (vk) return { type: 'vk', id: vk[1] + '_' + vk[2] };
  
  // VK клип
  var clip = url.match(/vk\.com\/clip(-?\d+)_(\d+)/);
  if (clip) return { type: 'vk', id: clip[1] + '_' + clip[2] };
  
  // YouTube
  var yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return { type: 'youtube', id: yt[1] };
  
  return null;
}

/* ── СОЗДАТЬ HTML ДЛЯ ПЛЕЕРА ── */
function createPlayerHTML(video) {
  if (!video || !video.originalUrl) return '<div class="player-error">Ссылка на фильм не найдена</div>';
  
  var videoId = extractVideoId(video.originalUrl);
  
  if (!videoId) {
    // Если не можем распознать, пробуем embed
    return '<iframe src="' + esc(video.originalUrl) + '" frameborder="0" allowfullscreen="1" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" style="width:100%;height:100%;"></iframe>';
  }
  
  switch(videoId.type) {
    case 'rutube':
      // RuTube плеер
      return '<iframe src="https://rutube.ru/play/embed/' + videoId.id + '" frameborder="0" allowfullscreen="1" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" style="width:100%;height:100%;"></iframe>';
      
    case 'vk':
      // VK плеер
      return '<iframe src="https://vk.com/video_ext.php?oid=' + videoId.id.split('_')[0] + '&id=' + videoId.id.split('_')[1] + '&hd=1&autoplay=1" frameborder="0" allowfullscreen="1" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" style="width:100%;height:100%;"></iframe>';
      
    case 'youtube':
      // YouTube плеер
      return '<iframe src="https://www.youtube.com/embed/' + videoId.id + '?autoplay=1" frameborder="0" allowfullscreen="1" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" style="width:100%;height:100%;"></iframe>';
      
    default:
      return '<iframe src="' + esc(video.originalUrl) + '" frameborder="0" allowfullscreen="1" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" style="width:100%;height:100%;"></iframe>';
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
      id:    String(u.id    || 'user_' + uid()),
      name:  u.first_name   || 'Гость',
      last:  u.last_name    || '',
      photo: u.photo_url    || '',
    };
    
    renderBadge();
    
    setTimeout(function() {
      checkStart();
    }, 100);
    
  } else {
    S.user = { id: 'dev_' + uid(), name: 'Тест', last: '', photo: '' };
    renderBadge();
    checkStart();
  }
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
  
  if (S.tg && S.tg.initDataUnsafe && S.tg.initDataUnsafe.start_param) {
    p = S.tg.initDataUnsafe.start_param;
  }
  
  if (!p) p = getParam('room');
  if (!p) p = getParam('startapp');
  
  if (p) {
    if (p.indexOf('room_') === 0) {
      joinRoom(p.replace('room_', ''));
    } else {
      joinRoom(p);
    }
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
  S.video = video;

  var g = gun.get('cw4').get(rid);
  
  g.get('host').put(String(S.user.id));
  g.get('title').put(video.title || 'Фильм');
  g.get('thumb').put(video.thumb || '');
  g.get('source').put(video.source || '');
  g.get('url').put(video.originalUrl || '');
  
  var viewerData = {
    id: S.user.id,
    name: S.user.name,
    photo: S.user.photo || '',
    ts: Date.now()
  };
  
  g.get('viewers').get(S.user.id).put(viewerData);
  S.gunRoom = g;

  beginRoom(rid, video);
  
  // АВТОМАТИЧЕСКИ ВКЛЮЧАЕМ ПЛЕЕР
  setTimeout(function() {
    if (video.originalUrl) {
      showPlayer();
    }
  }, 500);
}

/* ═══════════════════════════════════════
   ВОЙТИ В КОМНАТУ
   ═══════════════════════════════════════ */
function joinRoom(rid) {
  if (!rid) {
    toast('Неверная ссылка на комнату');
    showScreen('home');
    return;
  }
  
  toast('Подключение к комнате...', 10000);
  
  var g = gun.get('cw4').get(rid);
  var done = false;
  var tries = 0;
  var maxTries = 20;

  function attempt() {
    if (done) return;
    tries++;
    
    g.once(function(data) {
      if (done) return;
      
      if (!data || !data.host || !data.url) {
        if (tries < maxTries) { 
          setTimeout(attempt, 500); 
        } else {
          done = true;
          toast('Комната не найдена');
          showScreen('home');
        }
        return;
      }
      
      done = true;
      
      S.roomId = rid;
      S.isHost = (data.host === S.user.id);
      
      S.video = {
        source:      data.source || '',
        title:       data.title || 'Фильм',
        thumb:       data.thumb || '',
        originalUrl: data.url || '',
      };
      
      S.gunRoom = g;
      
      var viewerData = {
        id: S.user.id,
        name: S.user.name,
        photo: S.user.photo || '',
        ts: Date.now()
      };
      
      g.get('viewers').get(S.user.id).put(viewerData);
      
      beginRoom(rid, S.video);
      
      // АВТОМАТИЧЕСКИ ВКЛЮЧАЕМ ПЛЕЕР ДЛЯ ДРУГА
      setTimeout(function() {
        if (S.video.originalUrl) {
          showPlayer();
        }
      }, 1000);
    });
  }
  
  attempt();
}

/* ═══════════════════════════════════════
   ЗАПУСТИТЬ КОМНАТУ
   ═══════════════════════════════════════ */
function beginRoom(rid, video) {
  toastClear();
  showScreen('room');
  S.chatMsgs = [];
  
  // Скрываем плеер при входе в комнату
  hidePlayer();
  
  var cmsgs = el('cmsgs');
  if (cmsgs) {
    cmsgs.innerHTML = '<div class="sys-msg">Комната создана. Фильм сейчас начнется...</div>';
  }

  buildLink(rid);
  renderMovieBlock(video);
  listenViewers(rid);
  listenChat(rid);
  startPresence(rid);
  updateMyRoomCard(rid, video);
}

/* ═══════════════════════════════════════
   ПОКАЗАТЬ/СКРЫТЬ ПЛЕЕР
   ═══════════════════════════════════════ */
function showPlayer() {
  S.playerMode = true;
  
  var movieBlock = el('movie-block');
  var roomWrap = qs('.room-wrap');
  var rpanel = qs('.rpanel');
  
  if (movieBlock) movieBlock.style.display = 'none';
  if (rpanel) rpanel.style.display = 'none';
  
  // Создаем или показываем плеер
  var playerContainer = el('player-container');
  if (!playerContainer) {
    playerContainer = document.createElement('div');
    playerContainer.id = 'player-container';
    playerContainer.className = 'player-container';
    
    if (roomWrap) {
      roomWrap.insertBefore(playerContainer, roomWrap.firstChild);
    }
  }
  
  playerContainer.style.display = 'block';
  playerContainer.innerHTML = '<div class="player-header">' +
    '<button class="back-from-player" id="back-from-player">' +
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>' +
    '</button>' +
    '<span class="player-title">' + esc(S.video.title) + '</span>' +
    '</div>' +
    '<div class="player-wrapper">' + createPlayerHTML(S.video) + '</div>';
  
  // Добавляем обработчик для кнопки назад
  var backBtn = el('back-from-player');
  if (backBtn) {
    backBtn.addEventListener('click', hidePlayer);
  }
}

function hidePlayer() {
  S.playerMode = false;
  
  var movieBlock = el('movie-block');
  var rpanel = qs('.rpanel');
  var playerContainer = el('player-container');
  
  if (movieBlock) movieBlock.style.display = 'flex';
  if (rpanel) rpanel.style.display = 'flex';
  if (playerContainer) playerContainer.style.display = 'none';
}

function buildLink(rid) {
  var link = S.tg
    ? 'https://t.me/' + BOT_USERNAME + '?startapp=room_' + rid
    : APP_URL + '?room=' + rid;
  
  S.inviteLink = link;
  
  var ltxt = el('ltxt');
  if (ltxt) ltxt.textContent = link;
}

/* ═══════════════════════════════════════
   БЛОК С ФИЛЬМОМ
   ═══════════════════════════════════════ */
function renderMovieBlock(video) {
  if (!video) return;
  
  el('movie-source-label').textContent = getSourceLabel(video);
  el('movie-title').textContent = video.title || 'Фильм';

  var thumbEl = el('movie-thumb');
  if (thumbEl) {
    if (video.thumb) {
      thumbEl.innerHTML = '<img src="' + esc(video.thumb) + '" alt=""/>';
    } else {
      thumbEl.innerHTML = '<div class="movie-thumb-placeholder"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" opacity=".3"><circle cx="16" cy="16" r="15" stroke="white" stroke-width="1.5"/><path d="M12 10l12 6-12 6V10z" fill="white"/></svg></div>';
    }
  }

  var btn = el('watch-now-btn');
  if (btn) {
    btn.onclick = function() {
      if (video.originalUrl) {
        showPlayer(); // Показываем плеер внутри приложения
      } else {
        toast('Ссылка на фильм не найдена');
      }
    };
  }
}

/* ═══════════════════════════════════════
   ПОЛУЧИТЬ ИСТОЧНИК
   ═══════════════════════════════════════ */
function getSourceLabel(video) {
  if (!video) return '';
  var src = video.source || '';
  var url = video.originalUrl || '';

  if (src === 'rutube' || (url && url.indexOf('rutube') !== -1)) return 'RuTube';
  if (src === 'vk'     || (url && url.indexOf('vk.com') !== -1))  return 'VK Видео';
  if (src === 'youtube' || (url && url.indexOf('youtube') !== -1)) return 'YouTube';
  return 'Видео';
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
  
  setInterval(function() {
    var now = Date.now();
    var changed = false;
    
    Object.keys(S.viewers).forEach(function(k) {
      var v = S.viewers[k];
      if (v && v.ts && (now - v.ts > 30000)) {
        delete S.viewers[k];
        changed = true;
      }
    });
    
    if (changed) renderViewers();
  }, 10000);
}

function renderViewers() {
  var keys = Object.keys(S.viewers);
  el('watch-n').textContent = keys.length;
  
  var bar = el('vbar');
  if (!bar) return;
  
  bar.innerHTML = '';
  
  keys.forEach(function(k) {
    var v = S.viewers[k];
    var d = document.createElement('div');
    d.className = 'vava';
    d.title = v.name || '';
    
    if (v.photo) {
      d.innerHTML = '<img src="' + esc(v.photo) + '" alt=""/>';
    } else {
      d.textContent = initials(v.name || 'G');
    }
    
    bar.appendChild(d);
  });
}

function startPresence(rid) {
  clearInterval(S.presTimer);
  
  S.presTimer = setInterval(function() {
    if (S.roomId && S.user && S.user.id) {
      gun.get('cw4').get(rid).get('viewers').get(S.user.id).get('ts').put(Date.now());
    }
  }, 10000);
}

/* ═══════════════════════════════════════
   ЧАТ
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
  if (!c) return;
  
  var atBot = (c.scrollHeight - c.scrollTop - c.clientHeight) < 90;
  c.innerHTML = '';

  if (!S.chatMsgs.length) {
    c.innerHTML = '<div class="sys-msg">Чат комнаты</div>';
    return;
  }

  S.chatMsgs.slice(-50).forEach(function(msg) {
    var own = String(msg.uid) === String(S.user.id);
    var d = document.createElement('div');
    d.className = 'cmsg' + (own ? ' own' : '');

    var av = document.createElement('div');
    av.className = 'mava';
    
    if (msg.photo) {
      av.innerHTML = '<img src="' + esc(msg.photo) + '" alt=""/>';
    } else {
      av.textContent = initials(msg.name || 'G');
    }

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
   МОЯ КОМНАТА
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
    + (video.thumb ? '<img src="' + esc(video.thumb) + '" alt=""/>' : '<div class="movie-thumb-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" opacity=".3"><circle cx="12" cy="12" r="11" stroke="white" stroke-width="1.5"/><path d="M9 7.5l9 4.5-9 4.5V7.5z" fill="white"/></svg></div>')
    + '</div>'
    + '<div class="rcinfo">'
    + '<div class="rct">' + esc(video.title || 'Комната') + '</div>'
    + '<div class="rcm">' + esc(getSourceLabel(video)) + '</div>'
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
  S.playerMode = false;
  hidePlayer();
  showScreen('home');
}

/* ═══════════════════════════════════════
   ПАРСЕР ССЫЛОК
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
      originalUrl: url,
    };
  }

  // VK video
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

  // Прямой MP4
  if (/\.(mp4|webm|ogv|m3u8)(\?.*)?$/i.test(url)) {
    return {
      source:      'direct',
      title:       'Видео',
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
  el('open-rutube')?.addEventListener('click', function() {
    window.open('https://rutube.ru', '_blank');
  });

  el('open-vk')?.addEventListener('click', function() {
    window.open('https://vk.com/video', '_blank');
  });

  el('url-go')?.addEventListener('click', handleGo);
  
  el('url-inp')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleGo();
  });

  el('btn-back')?.addEventListener('click', leaveRoom);
  el('btn-inv')?.addEventListener('click', openInv);

  el('close-inv')?.addEventListener('click', closeInv);
  
  el('inv-modal')?.addEventListener('click', function(e) {
    if (e.target === el('inv-modal')) closeInv();
  });
  
  el('cbtn')?.addEventListener('click', function() {
    copyText(S.inviteLink);
    toast('Ссылка скопирована!');
  });
  
  el('tg-share')?.addEventListener('click', function() {
    if (S.tg && S.tg.switchInlineQuery) {
      try {
        S.tg.switchInlineQuery('room_' + S.roomId, ['users', 'groups']);
        return;
      } catch(e) {}
    }
    
    window.open(
      'https://t.me/share/url?url=' + encodeURIComponent(S.inviteLink) +
      '&text=' + encodeURIComponent('Смотрим вместе в CineWave!\nПрисоединяйся!'),
      '_blank'
    );
  });

  el('sbtn')?.addEventListener('click', doSend);
  
  el('cinp')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });
}

function handleGo() {
  var inp = el('url-inp');
  if (!inp) return;
  
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
  
  // Создаем комнату и показываем плеер
  createRoom(video);
}

function doSend() {
  var inp = el('cinp');
  if (!inp) return;
  
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