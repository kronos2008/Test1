/** * Cinema Party Engine v2.1 - Fixed Edition
 */

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
    console.log("YouTube API загружен.");
    checkUrlParams();
}

// 2. Проверка параметров входа
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
        if (tg) tg.showAlert("Пожалуйста, введите корректную ссылку на YouTube");
        else alert("Некорректная ссылка");
        return;
    }

    currentVideoId = videoId;
    isHost = true;
    initPeer(videoId);
}

// 4. Подключение к комнате (Гость)
function joinRoom(hostId) {
    isHost = false;
    initPeer(null, hostId);
}

// 5. Работа с PeerJS
function initPeer(videoId, remoteId = null) {
    // Если библиотеки нет, выводим ошибку
    if (typeof Peer === 'undefined') {
        alert("Ошибка: Библиотека PeerJS не загружена!");
        return;
    }

    peer = new Peer();

    peer.on('open', (myId) => {
        console.log("Ваш Peer ID:", myId);
        if (remoteId) {
            connectToHost(remoteId);
        } else {
            createPlayer(videoId);
        }
    });

    peer.on('connection', (conn) => {
        activeConn = conn;
        setupCommunication();
        
        // Ждем, пока плеер создастся, прежде чем синхронизировать гостя
        const waitPlayer = setInterval(() => {
            if (player && player.getCurrentTime) {
                sendData({
                    type: 'init_sync',
                    vId: currentVideoId,
                    currentTime: player.getCurrentTime()
                });
                clearInterval(waitPlayer);
                appendMessage("Система", "Друг подключился", "system");
            }
        }, 1000);
    });

    peer.on('error', (err) => {
        console.error("Ошибка PeerJS:", err);
    });
}

function connectToHost(hostId) {
    activeConn = peer.connect(hostId);
    setupCommunication();
}

// 6. Обработка входящих данных
function setupCommunication() {
    activeConn.on('data', (data) => {
        console.log("Данные получены:", data);
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
        height: '100%',
        width: '100%',
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

    const state = event.data;
    const time = player.getCurrentTime();

    if (state === YT.PlayerState.PLAYING) {
        sendData({ type: 'media_control', action: 'play', time: time });
    } else if (state === YT.PlayerState.PAUSED) {
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
    
    // Даем небольшую задержку, чтобы событие изменения состояния не отправилось обратно
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

function appendMessage(user, text, style) {
    const container = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `msg ${style}`;
    div.innerHTML = `<b>${user}:</b> ${text}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function inviteFriend() {
    // ЗАМЕНИТЬ НА ВАШУ ССЫЛКУ БОТА
    const botUrl = "https://kronos2008.github.io/Test1/"; 
    const inviteLink = `${botUrl}?startapp=room_${peer.id}`;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(inviteLink).then(() => {
            if (tg) tg.showAlert("Ссылка скопирована!");
            else alert("Ссылка скопирована!");
        });
    } else {
        alert("Скопируйте вручную: " + inviteLink);
    }
}
