const tg = window.Telegram.WebApp;
if (tg) {
    tg.expand();
    tg.ready();
}

let player;
let peer;
let activeConn = null;
let isHost = false;
let syncIgnore = false;
let currentVideoId = ""; // Храним ID для синхронизации новых подключений

// 1. YouTube API Ready
function onYouTubeIframeAPIReady() {
    console.log("YouTube API готов.");
    checkUrlParams();
}

// 2. Проверка входа
function checkUrlParams() {
    const startParam = tg.initDataUnsafe?.start_param;
    if (startParam && startParam.startsWith('room_')) {
        const hostId = startParam.replace('room_', '');
        joinRoom(hostId);
    }
}

// 3. Старт (Хост)
function startMovie() {
    const url = document.getElementById('video-url').value;
    const videoId = extractVideoID(url);

    if (!videoId) {
        alert("Пожалуйста, введите корректную ссылку на YouTube");
        return;
    }

    currentVideoId = videoId;
    isHost = true;
    initPeer(videoId);
}

// 4. Подключение (Гость)
function joinRoom(hostId) {
    isHost = false;
    initPeer(null, hostId);
}

// 5. PeerJS
function initPeer(videoId, remoteId = null) {
    // Создаем Peer без параметров (использует дефолтные облачные серверы PeerJS)
    peer = new Peer();

    peer.on('open', (id) => {
        console.log("Peer ID:", id);
        if (remoteId) {
            connectToHost(remoteId);
        } else {
            createPlayer(videoId);
        }
    });

    peer.on('connection', (conn) => {
        activeConn = conn;
        setupCommunication();
        
        // Ждем готовности плеера перед отправкой данных гостю
        const checkReady = setInterval(() => {
            if (player && player.getCurrentTime) {
                sendData({
                    type: 'init_sync',
                    vId: currentVideoId,
                    currentTime: player.getCurrentTime()
                });
                clearInterval(checkReady);
                appendMessage("Система", "Друг подключился", "system");
            }
        }, 500);
    });

    peer.on('error', (err) => {
        console.error("Peer error:", err);
        alert("Ошибка связи. Попробуйте обновить страницу.");
    });
}

function connectToHost(hostId) {
    activeConn = peer.connect(hostId);
    setupCommunication();
}

function setupCommunication() {
    activeConn.on('data', (data) => {
        switch (data.type) {
            case 'init_sync':
                currentVideoId = data.vId;
                createPlayer(data.vId, data.currentTime);
                break;
            case 'chat':
                appendMessage("Друг", data.text, "friend");
                break;
            case 'media_control':
                handleRemoteControl(data);
                break;
        }
    });
}

// 6. Плеер
function createPlayer(vId, startTime = 0) {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    player = new YT.Player('yt-player', {
        videoId: vId,
        playerVars: {
            'autoplay': 1,
            'controls': 1,
            'start': Math.floor(startTime),
            'origin': window.location.origin
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

// 7. Утилиты
function extractVideoID(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?v=)|(&v=))([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[8].length == 11) ? match[8] : false;
}

function sendData(obj) {
    if (activeConn && activeConn.open) {
        activeConn.send(obj);
    }
}

function sendMsg() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text) return;

    appendMessage("Вы", text, "me");
    sendData({ type: 'chat', text: text });
    input.value = '';
}

// Отправка по нажатию Enter
document.getElementById('msg-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMsg();
});

function appendMessage(user, text, style) {
    const container = document.getElementById('messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `msg ${style}`;
    div.innerHTML = `<b>${user}:</b> ${text}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function inviteFriend() {
    const botUrl = "https://kronos2008.github.io/Test1/"; // ЗАМЕНИ НА СВОЕ
    const inviteLink = `${botUrl}?startapp=room_${peer.id}`;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(inviteLink).then(() => {
            alert("Ссылка скопирована!");
        });
    } else {
        alert("Твоя ссылка: " + inviteLink);
    }
}
