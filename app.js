/** * Cinema Party Engine v3.0 - No-Auth Fix */

const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.ready();
}

let player;           
let peer;             
let activeConn = null; 
let isHost = false;    
let syncIgnore = false; 
let currentVideoId = "";

function onYouTubeIframeAPIReady() {
    checkUrlParams(); 
}

function checkUrlParams() {
    const startParam = tg?.initDataUnsafe?.start_param;
    if (startParam && startParam.startsWith('room_')) {
        joinRoom(startParam.replace('room_', ''));
    }
}

function startMovie() {
    const url = document.getElementById('video-url').value;
    const videoId = extractVideoID(url);

    if (!videoId) {
        if (tg) tg.showAlert("Введите ссылку на видео!");
        return;
    }

    currentVideoId = videoId;
    isHost = true;
    initPeer(videoId);
}

function joinRoom(hostId) {
    isHost = false;
    initPeer(null, hostId);
}

function initPeer(videoId, remoteId = null) {
    if (typeof Peer === 'undefined') {
        alert("Ошибка загрузки сети. Подождите 3 сек.");
        return;
    }

    peer = new Peer();
    peer.on('open', (id) => {
        if (remoteId) connectToHost(remoteId);
        else createPlayer(videoId);
    });

    peer.on('connection', (conn) => {
        activeConn = conn;
        setupCommunication();
        const sync = setInterval(() => {
            if (player && player.getCurrentTime) {
                sendData({ type: 'init_sync', vId: currentVideoId, currentTime: player.getCurrentTime() });
                clearInterval(sync);
                appendMessage("Система", "Друг вошел", "system");
            }
        }, 1000);
    });
}

function connectToHost(hostId) {
    activeConn = peer.connect(hostId);
    setupCommunication();
}

function setupCommunication() {
    activeConn.on('data', (data) => {
        if (data.type === 'init_sync') {
            currentVideoId = data.vId;
            createPlayer(data.vId, data.currentTime);
        } else if (data.type === 'chat') {
            appendMessage("Друг", data.text, "friend");
        } else if (data.type === 'media_control') {
            handleRemoteControl(data);
        }
    });
}

// ОСНОВНОЙ ФИКС ОКНА "ВОЙДИТЕ В АККАУНТ"
function createPlayer(vId, startTime = 0) {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    player = new YT.Player('yt-player', {
        height: '100%',
        width: '100%',
        videoId: vId,
        host: 'https://www.youtube-nocookie.com', // Используем спец. домен для обхода
        playerVars: {
            'autoplay': 1,
            'controls': 1,
            'start': Math.floor(startTime),
            'rel': 0,
            'enablejsapi': 1,
            'origin': window.location.origin, // Обязательно для работы API в Telegram
            'widget_referrer': window.location.href
        },
        events: {
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerStateChange(event) {
    if (!activeConn || syncIgnore) return;
    const time = player.getCurrentTime();
    if (event.data === YT.PlayerState.PLAYING) {
        sendData({ type: 'media_control', action: 'play', time: time });
    } else if (event.data === YT.PlayerState.PAUSED) {
        sendData({ type: 'media_control', action: 'pause', time: time });
    }
}

function handleRemoteControl(data) {
    syncIgnore = true; 
    if (data.action === 'play') {
        player.seekTo(data.time, true);
        player.playVideo();
    } else if (data.action === 'pause') {
        player.pauseVideo();
        player.seekTo(data.time, true);
    }
    setTimeout(() => { syncIgnore = false; }, 800);
}

function extractVideoID(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?v=)|(\&v=))([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[8].length == 11) ? match[8] : false;
}

function sendData(obj) {
    if (activeConn && activeConn.open) activeConn.send(obj);
}

function sendMsg() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text) return;
    appendMessage("Вы", text, "me");
    sendData({ type: 'chat', text: text });
    input.value = '';
}

document.getElementById('msg-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMsg();
});

function appendMessage(user, text, style) {
    const container = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `msg ${style}`;
    div.innerHTML = `<b>${user}:</b> ${text}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function inviteFriend() {
    const baseUrl = "https://kronos2008.github.io/Test1/"; 
    const inviteLink = `${baseUrl}?startapp=room_${peer.id}`;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(inviteLink).then(() => {
            if (tg) tg.showAlert("Ссылка скопирована!");
        });
    } else {
        alert("Твоя ссылка: " + inviteLink);
    }
}
