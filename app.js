/* ================================================================
   CineWave — app.js ИСПРАВЛЕННАЯ ВЕРСИЯ

   ИСПРАВЛЕНИЯ:
   1. Починена работа start_param для Telegram WebApp
   2. Исправлена обработка ссылок приглашений
   3. Починена синхронизация комнат через GUN
   4. Исправлена кнопка "Смотреть фильм"
   5. Добавлена правильная обработка deep linking
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
  gun: null
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

/* ── ОТКРЫТЬ ССЫЛКУ В НАТИВНОМ БРАУЗЕРЕ ── */
function openExternal(url) {
  if (!url) {
    toast('Ссылка на фильм не найдена');
    return;
  }
  
  // Пробуем открыть через Telegram WebApp
  if (S.tg && S.tg.openLink) {
    try { 
      S.tg.openLink(url, { try_instant_view: false }); 
      return; 
    } catch(e) {}
  }
  
  // Пробуем открыть через window.open
  try {
    var win = window.open(url, '_blank');
    if (!win) {
      // Если блокируется попапами, пробуем прямой переход
      window.location.href = url;
    }
  } catch(e) {
    toast('Не удалось открыть ссылку');
  }
}

/* ── ПОЛУЧИТЬ ЧИТАЕМОЕ НАЗВАНИЕ ИСТОЧНИКА ── */
function getSourceLabel(video) {
  if (!video) return '';
  var src = video.source || '';
  var url = video.originalUrl || '';

  if (src === 'rutube' || (url && url.indexOf('rutube') !== -1)) return 'RuTube';
  if (src === 'vk'     || (url && url.indexOf('vk.com') !== -1))  return 'VK Видео';
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
      id:    String(u.id    || 'user_' + uid()),
      name:  u.first_name   || 'Гость',
      last:  u.last_name    || '',
      photo: u.photo_url    || '',
    };
    
    console.log('Telegram User:', S.user);
    
    // Проверяем start_param сразу после инициализации
    var startParam = tg.initDataUnsafe && tg.initDataUnsafe.start_param;
    console.log('Start param:', startParam);
    
    renderBadge();
    
    // Запускаем проверку через небольшую задержку для гарантии
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
  
  // Проверяем start_param из Telegram
  if (S.tg && S.tg.initDataUnsafe && S.tg.initDataUnsafe.start_param) {
    p = S.tg.initDataUnsafe.start_param;
    console.log('Found start_param:', p);
  }
  
  // Проверяем URL параметры
  if (!p) p = getParam('room');
  if (!p) p = getParam('startapp');
  
  console.log('Final param:', p);
  
  if (p) {
    // Обрабатываем разные форматы
    if (p.indexOf('room_') === 0) {
      var roomId = p.replace('room_', '');
      console.log('Joining room:', roomId);
      joinRoom(roomId);
    } else if (p.indexOf('room') === 0) {
      var roomId = p.replace('room', '');
      console.log('Joining room (alt):', roomId);
      joinRoom(roomId);
    } else {
      // Пробуем использовать как есть
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
  S.video  = video;

  console.log('Creating room:', rid, video);

  var g = gun.get('cw4').get(rid);
  
  // Сохраняем данные комнаты
  g.get('host').put(String(S.user.id));
  g.get('title').put(video.title || 'Видео');
  g.get('thumb').put(video.thumb || '');
  g.get('source').put(video.source || '');
  g.get('url').put(video.originalUrl || '');  // сохраняем как url для простоты
  g.get('originalUrl').put(video.originalUrl || '');
  g.get('created').put(Date.now());
  
  // Добавляем себя в зрители
  var viewerData = {
    id: S.user.id,
    name: S.user.name,
    photo: S.user.photo || '',
    ts: Date.now()
  };
  
  g.get('viewers').get(S.user.id).put(viewerData);
  
  S.gunRoom = g;

  // Сохраняем комнату в localStorage для быстрого доступа
  try {
    localStorage.setItem('last_room', rid);
    localStorage.setItem('last_video', JSON.stringify(video));
  } catch(e) {}

  beginRoom(rid, video);
}

/* ═══════════════════════════════════════
   ВОЙТИ В КОМНАТУ ПО ССЫЛКЕ
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
  var maxTries = 30; // увеличим количество попыток

  function attempt() {
    if (done) return;
    tries++;
    
    console.log('Join attempt', tries, 'for room', rid);
    
    // Пробуем получить данные комнаты
    g.once(function(data) {
      if (done) return;
      
      console.log('Room data received:', data);
      
      if (!data || !data.host) {
        if (tries < maxTries) { 
          setTimeout(attempt, 500); 
        } else {
          done = true;
          toast('Комната не найдена. Попроси хозяина поделиться ссылкой ещё раз.');
          showScreen('home');
        }
        return;
      }
      
      done = true;
      
      // Комната найдена
      S.roomId = rid;
      S.isHost = (data.host === S.user.id);
      S.video = {
        source:      data.source || '',
        title:       data.title || 'Видео',
        thumb:       data.thumb || '',
        originalUrl: data.url || data.originalUrl || '',
      };
      
      S.gunRoom = g;
      
      // Добавляем себя в зрители
      var viewerData = {
        id: S.user.id,
        name: S.user.name,
        photo: S.user.photo || '',
        ts: Date.now()
      };
      
      g.get('viewers').get(S.user.id).put(viewerData);
      
      beginRoom(rid, S.video);
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
  
  var cmsgs = el('cmsgs');
  if (cmsgs) {
    cmsgs.innerHTML = '<div class="sys-msg">Комната создана. Пригласи друга!</div>';
  }

  buildLink(rid);
  renderMovieBlock(video);
  listenViewers(rid);
  listenChat(rid);
  startPresence(rid);
  updateMyRoomCard(rid, video);
}

function buildLink(rid) {
  // Правильное формирование ссылки для Telegram
  var link = '';
  
  if (S.tg) {
    // Для Telegram бота используем startapp
    link = 'https://t.me/' + BOT_USERNAME + '?startapp=room_' + rid;
  } else {
    // Для веба используем параметр room
    link = APP_URL + '?room=' + rid;
  }
  
  S.inviteLink = link;
  
  var ltxt = el('ltxt');
  if (ltxt) ltxt.textContent = link;
  
  console.log('Invite link:', link);
}

/* ═══════════════════════════════════════
   БЛОК С ФИЛЬМОМ
   ═══════════════════════════════════════ */
function renderMovieBlock(video) {
  if (!video) return;
  
  // Источник
  var sourceLabel = el('movie-source-label');
  if (sourceLabel) sourceLabel.textContent = getSourceLabel(video);

  // Название
  var title = video.title || 'Фильм';
  var titleEl = el('movie-title');
  if (titleEl) titleEl.textContent = title;

  // Превью
  var thumbEl = el('movie-thumb');
  if (thumbEl) {
    if (video.thumb) {
      thumbEl.innerHTML = '<img src="' + esc(video.thumb) + '" alt="" onerror="this.innerHTML=\'<div class=movie-thumb-placeholder><svg width=32 height=32 viewBox=\\\'0 0 32 32\\\' fill=none opacity=.3><circle cx=16 cy=16 r=15 stroke=white stroke-width=1.5/><path d=\\\'M12 10l12 6-12 6V10z\\\' fill=white/></svg></div>\'"/>';
    } else {
      thumbEl.innerHTML = '<div class="movie-thumb-placeholder"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" opacity=".3"><circle cx="16" cy="16" r="15" stroke="white" stroke-width="1.5"/><path d="M12 10l12 6-12 6V10z" fill="white"/></svg></div>';
    }
  }

  // Кнопка "Смотреть"
  var btn = el('watch-now-btn');
  if (btn) {
    // Убираем все предыдущие обработчики
    btn.onclick = null;
    
    // Добавляем новый обработчик
    btn.onclick = function() {
      var url = video.originalUrl || video.url;
      console.log('Watch button clicked, URL:', url);
      
      if (!url) { 
        toast('Ссылка на фильм не найдена'); 
        return; 
      }
      
      // Показываем тост перед открытием
      toast('Открываем фильм...', 1500);
      
      // Небольшая задержка для тоста
      setTimeout(function() {
        openExternal(url);
      }, 100);
    };
  }
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
  
  // Очищаем старых зрителей (которые не обновлялись > 30 сек)
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
    
    if (changed) {
      renderViewers();
    }
  }, 10000);
}

function renderViewers() {
  var keys = Object.keys(S.viewers);
  var countEl = el('watch-n');
  if (countEl) countEl.textContent = keys.length;
  
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
  
  // Отправляем присутствие каждые 10 секунд
  S.presTimer = setInterval(function() {
    if (S.roomId && S.user && S.user.id) {
      gun.get('cw4').get(rid).get('viewers').get(S.user.id).get('ts').put(Date.now());
    }
  }, 10000);
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
  
  var msg = {
    uid:   S.user.id,
    name:  S.user.name,
    photo: S.user.photo || '',
    text:  text,
    ts:    Date.now(),
  };
  
  S.gunChat.get(uid()).put(msg);
}

function renderChat() {
  var c = el('cmsgs');
  if (!c) return;
  
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
   МОЯ КОМНАТА (главный экран)
   ═══════════════════════════════════════ */
function updateMyRoomCard(rid, video) {
  var sec  = el('my-room-section');
  var card = el('my-room-card');
  
  if (!sec || !card) return;
  
  sec.style.display = 'block';

  var d = document.createElement('div');
  d.className = 'rcard';
  
  var thumbHtml = video.thumb 
    ? '<img src="' + esc(video.thumb) + '" alt=""/>'
    : '<div class="movie-thumb-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" opacity=".3"><circle cx="12" cy="12" r="11" stroke="white" stroke-width="1.5"/><path d="M9 7.5l9 4.5-9 4.5V7.5z" fill="white"/></svg></div>';
  
  d.innerHTML = ''
    + '<div class="rthumb">' + thumbHtml + '</div>'
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
  var ltxt = el('ltxt');
  if (ltxt) ltxt.textContent = S.inviteLink || '';
  
  var modal = el('inv-modal');
  if (modal) modal.style.display = 'flex';
}

function closeInv() {
  var modal = el('inv-modal');
  if (modal) modal.style.display = 'none';
}

/* ═══════════════════════════════════════
   СОБЫТИЯ
   ═══════════════════════════════════════ */
function bindEvents() {

  /* Открыть RuTube */
  var openRutube = el('open-rutube');
  if (openRutube) {
    openRutube.addEventListener('click', function() {
      openExternal('https://rutube.ru');
      toast('Найди фильм → нажми кнопку «Поделиться» → скопируй ссылку → вернись сюда и вставь', 5000);
    });
  }

  /* Открыть VK Видео */
  var openVk = el('open-vk');
  if (openVk) {
    openVk.addEventListener('click', function() {
      openExternal('https://vk.com/video');
      toast('Найди фильм → скопируй ссылку из адресной строки → вернись и вставь', 5000);
    });
  }

  /* Кнопка GO */
  var urlGo = el('url-go');
  var urlInp = el('url-inp');
  
  if (urlGo) urlGo.addEventListener('click', handleGo);
  if (urlInp) {
    urlInp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') handleGo();
    });
  }

  /* Комната */
  var btnBack = el('btn-back');
  if (btnBack) btnBack.addEventListener('click', leaveRoom);
  
  var btnInv = el('btn-inv');
  if (btnInv) btnInv.addEventListener('click', openInv);

  /* Invite modal */
  var closeInvBtn = el('close-inv');
  if (closeInvBtn) closeInvBtn.addEventListener('click', closeInv);
  
  var invModal = el('inv-modal');
  if (invModal) {
    invModal.addEventListener('click', function(e) {
      if (e.target === invModal) closeInv();
    });
  }
  
  var cbtn = el('cbtn');
  if (cbtn) {
    cbtn.addEventListener('click', function() {
      copyText(S.inviteLink);
      toast('Ссылка скопирована!');
    });
  }
  
  var tgShare = el('tg-share');
  if (tgShare) {
    tgShare.addEventListener('click', function() {
      if (S.tg && S.tg.switchInlineQuery) {
        try {
          S.tg.switchInlineQuery('room_' + S.roomId, ['users', 'groups']);
          return;
        } catch(e) {
          console.log('switchInlineQuery error:', e);
        }
      }
      
      window.open(
        'https://t.me/share/url?url=' + encodeURIComponent(S.inviteLink) +
        '&text=' + encodeURIComponent('Смотрим вместе в CineWave!\nПрисоединяйся!'),
        '_blank'
      );
    });
  }

  /* Чат */
  var sbtn = el('sbtn');
  var cinp = el('cinp');
  
  if (sbtn) sbtn.addEventListener('click', doSend);
  if (cinp) {
    cinp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });
  }
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
  console.log('DOM loaded, initializing...');
  bindEvents();
  initTG();
});

// Обработка ошибок
window.addEventListener('error', function(e) {
  console.error('Global error:', e.error);
});

console.log('App initialized');
