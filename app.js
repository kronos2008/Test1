/** 
 * Cinema Party Engine v2.0
 * Реализует синхронизацию через PeerJS и YouTube API
 */

const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

let player;           // Объект YouTube плеера
let peer;             // Объект WebRTC (PeerJS)
let activeConn = null; // Текущее соединение с другом
let isHost = false;    // Роль пользователя
let syncIgnore = false; // Флаг, чтобы избежать зацикливания событий

// 1. Инициализация YouTube API
function onYouTubeIframeAPIReady() {
    console.log("YouTube API загружен и готов.");
    checkUrlParams(); // Проверяем, зашли ли мы по приглашению
}

// 2. Проверка параметров входа (startapp)
function checkUrlParams() {
    const startParam = tg.initDataUnsafe.start_param;
    if (startParam && startParam.startsWith('room_')) {
        const hostId = startParam.replace('room_', '');
        console.log("Найден ID комнаты:", hostId);
        joinRoom(hostId);
    }
}

// 3. Создание комнаты (Хост)
function startMovie() {
    const url = document.getElementById('video-url').value;
    const videoId = extractVideoID(url);

    if (!videoId) {
        tg.showAlert("Пожалуйста, введите корректную ссылку на YouTube");
        return;
    }

    isHost = true;
    initPeer(videoId); // Сначала создаем Peer, потом плеер
}

// 4. Подключение к комнате (Гость)
function joinRoom(hostId) {
    isHost = false;
    initPeer(null, hostId);
}

// 5. Работа с PeerJS (Связь)
function initPeer(videoId, remoteId = null) {
    peer = new Peer();

    peer.on('open', (myId) => {
        console.log("Ваш Peer ID:", myId);
        if (remoteId) {
            connectToHost(remoteId);
        } else {
            createPlayer(videoId);
        }
    });

    // Когда к хосту кто-то подключается
    peer.on('connection', (conn) => {
        activeConn = conn;
        setupCommunication();
        
        // Отправляем гостю текущий ID видео и время
        setTimeout(() => {
            sendData({
                type: 'init_sync',
                vId: videoId,
                currentTime: player.getCurrentTime()
            });
        }, 2000);
        
        appendMessage("Система", "Друг подключился к комнате", "system");
    });

    peer.on('error', (err) => {
        console.error("Ошибка связи:", err);
        tg.showAlert("Ошибка подключения. Попробуйте еще раз.");
    });
}

function connectToHost(hostId) {
    activeConn = peer.connect(hostId);
    setupCommunication();
}

// 6. Обработка входящих данных
function setupCommunication() {
    activeConn.on('data', (data) => {
        console.log("Получены данные:", data);

        switch (data.type) {
            case 'init_sync':
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

    activeConn.on('close', () => {
        appendMessage("Система", "Связь разорвана", "system");
    });
}

// 7. Управление плеером (Синхронизация)
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
            'rel': 0
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

    // Отправляем команды только если мы инициировали действие
    if (state === YT.PlayerState.PLAYING) {
        sendData({ type: 'media_control', action: 'play', time: time });
    } else if (state === YT.PlayerState.PAUSED) {
        sendData({ type: 'media_control', action: 'pause', time: time });
    }
}

function handleRemoteControl(data) {
    syncIgnore = true; // Блокируем отправку ответа, чтобы не зациклить
    
    if (data.action === 'play') {
        player.seekTo(data.time);
        player.playVideo();
    } else if (data.action === 'pause') {
        player.pauseVideo();
        player.seekTo(data.time);
    }
    
    setTimeout(() => { syncIgnore = false; }, 500);
}

// 8. Утилиты
function extractVideoID(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?v=)|(\&v=))([^#\&\?]*).*/;
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
    // ВАЖНО: Замени на свой URL бота
    const botUrl = "https://t.me"; 
    const inviteLink = `${botUrl}?startapp=room_${peer.id}`;
    
    navigator.clipboard.writeText(inviteLink).then(() => {
        tg.showAlert("Ссылка скопирована! Отправь её другу.");
    });
}

function extractID(url) {
    // Дублирующая функция для надежности парсинга
    return extractVideoID(url);
}
