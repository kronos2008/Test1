/** * Cinema Party Engine v2.2 - Stable Edition
 */

// Резервный загрузчик PeerJS на случай сбоя сети
(function checkPeerLib() {
    if (typeof Peer === 'undefined') {
        const s = document.createElement('script');
        s.src = "https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js";
        document.head.appendChild(s);
    }
})();

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

// 1. YouTube API Ready
function onYouTubeIframeAPIReady() {
    checkUrlParams(); 
}

// 2. Проверка входа через Telegram
function checkUrlParams() {
    const startParam = tg?.initDataUnsafe?.start_param;
    if (startParam && startParam.startsWith('room_')) {
        const hostId = startParam.replace('room_', '');
        joinRoom(hostId);
    }
}

// 3. Создание комнаты (Хост)
function startMovie() {
    const url = document.getElementById('video-url').value;
    const videoId = extractVideoID(url);

    if (!videoId) {
        if (tg) tg.showAlert("Введите корректную ссылку!");
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

// 5. PeerJS Связь
function initPeer(videoId, remoteId = null) {
    if (typeof Peer === 'undefined') {
        alert("Ошибка: Сеть еще загружается. Нажмите еще раз через 2 секунды.");
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
        
        // Синхронизация нового участника
        const syncCheck = setInterval(() => {
            if (player && player.getCurrentTime) {
                sendData({
                    type: 'init_sync',
                    vId: currentVideoId,
                    currentTime: player.getCurrentTime()
                });
                clearInterval(syncCheck);
                appendMessage("Система", "Друг вошел в зал", "system");
            }
        }, 1000);
    });
}

function connectToHost(hostId) {
    activeConn = peer.connect(hostId);
    setupCommunication();
}

// 6. Обработка данных
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

// 7. Управление плеером
function createPlayer(vId, startTime = 0) {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    player = new YT.Player('yt-player', {
        videoId: vId,
        playerVars: {
            'autoplay': 1,
            'controls': 1,
            'start': Math.floor(startTime),
            'rel': 0,
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

// 8. Утилиты
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

// Поддержка Enter
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

// Ссылка изменена на твою!
function inviteFriend() {
    const baseUrl = "https://kronos2008.github.io/Test1/"; 
    const inviteLink = `${baseUrl}?startapp=room_${peer.id}`;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(inviteLink).then(() => {
            if (tg) tg.showAlert("Ссылка скопирована!");
            else alert("Скопировано!");
        });
    } else {
        alert("Твоя ссылка: " + inviteLink);
    }
}
