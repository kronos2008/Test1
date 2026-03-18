// Telegram Web App инициализация
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Состояние приложения
let currentUser = {
    id: tg.initDataUnsafe?.user?.id || 'user_' + Math.random().toString(36).substr(2, 9),
    name: tg.initDataUnsafe?.user?.first_name || 'Зритель',
    isAdmin: false
};

let roomData = {
    id: null,
    name: 'Комната MovieParty',
    users: [currentUser],
    currentVideo: null,
    isPlaying: false,
    currentTime: 0,
    invitePermission: 'admin',
    chatPermission: 'all'
};

let messages = [];
let isRoomCreator = false;
let syncInterval = null;

// DOM элементы
const loadingScreen = document.getElementById('loading-screen');
const joinScreen = document.getElementById('join-screen');
const roomScreen = document.getElementById('room-screen');
const userNameSpan = document.getElementById('user-name');
const currentUserNameSpan = document.getElementById('current-user-name');

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    // Показываем имя пользователя
    userNameSpan.textContent = currentUser.name;
    currentUserNameSpan.textContent = currentUser.name;
    
    // Проверяем, есть ли ссылка приглашения в URL
    checkInviteLink();
    
    // Скрываем загрузку через 1 секунду
    setTimeout(() => {
        loadingScreen.classList.add('hidden');
    }, 1000);
});

// Проверка ссылки приглашения
function checkInviteLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const startParam = urlParams.get('tgWebAppStartParam');
    
    if (startParam && startParam.startsWith('room_')) {
        const roomId = startParam.replace('room_', '');
        document.getElementById('invite-link-input').value = `https://t.me/your_bot?start=room_${roomId}`;
    }
}

// Создание комнаты
document.getElementById('create-room-btn').addEventListener('click', () => {
    // Генерируем ID комнаты
    roomData.id = 'room_' + Math.random().toString(36).substr(2, 9);
    roomData.name = `Комната ${currentUser.name}`;
    currentUser.isAdmin = true;
    isRoomCreator = true;
    
    // Добавляем админа в список
    roomData.users = [currentUser];
    
    // Показываем комнату
    joinScreen.classList.remove('active');
    roomScreen.classList.add('active');
    
    // Обновляем UI
    updateUsersList();
    updateViewersCount();
    
    // Показываем элементы управления для админа
    document.getElementById('video-controls').style.display = 'flex';
    document.getElementById('movie-selector').style.display = 'block';
    
    // Добавляем системное сообщение
    addSystemMessage('Комната создана. Пригласите друзей!');
    
    // Начинаем синхронизацию (имитация)
    startSync();
});

// Присоединение по ссылке
document.getElementById('join-by-link-btn').addEventListener('click', () => {
    const link = document.getElementById('invite-link-input').value;
    
    if (link && link.includes('room_')) {
        // Извлекаем ID комнаты
        const roomId = link.split('room_')[1];
        roomData.id = 'room_' + roomId;
        
        // Присоединяемся
        joinRoom(roomId);
    } else {
        alert('Неверная ссылка приглашения');
    }
});

function joinRoom(roomId) {
    // Имитация присоединения к комнате
    currentUser.isAdmin = false;
    isRoomCreator = false;
    
    roomData.id = 'room_' + roomId;
    roomData.users = [currentUser];
    
    // Добавляем "других" пользователей для демо
    roomData.users.push({
        id: 'user_demo1',
        name: 'Алексей',
        isAdmin: true
    });
    
    joinScreen.classList.remove('active');
    roomScreen.classList.add('active');
    
    updateUsersList();
    updateViewersCount();
    
    // Скрываем элементы управления для не-админа
    document.getElementById('video-controls').style.display = 'none';
    document.getElementById('movie-selector').style.display = 'none';
    
    addSystemMessage('Вы присоединились к комнате');
    
    startSync();
}

// Обновление списка участников
function updateUsersList() {
    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '';
    
    roomData.users.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = `user-item ${user.isAdmin ? 'admin' : ''}`;
        userDiv.dataset.userId = user.id;
        
        let userHtml = `
            <div class="user-avatar">👤</div>
            <div class="user-name">
                <span>${user.name} ${user.id === currentUser.id ? '(Вы)' : ''}</span>
                ${user.isAdmin ? '<span class="user-badge admin-badge">Админ</span>' : ''}
        `;
        
        // Кнопка кика только для админа и не для себя
        if (currentUser.isAdmin && user.id !== currentUser.id) {
            userHtml += `<button class="kick-btn" onclick="kickUser('${user.id}')">✕</button>`;
        }
        
        userHtml += '</div>';
        userDiv.innerHTML = userHtml;
        usersList.appendChild(userDiv);
    });
    
    document.getElementById('users-count').textContent = roomData.users.length;
}

// Обновление счетчика зрителей
function updateViewersCount() {
    document.getElementById('viewers-count').textContent = `👥 ${roomData.users.length} ${getViewersText(roomData.users.length)}`;
}

function getViewersText(count) {
    if (count === 1) return 'зритель';
    if (count >= 2 && count <= 4) return 'зрителя';
    return 'зрителей';
}

// Кик пользователя
window.kickUser = (userId) => {
    if (!currentUser.isAdmin) return;
    
    const userIndex = roomData.users.findIndex(u => u.id === userId);
    if (userIndex > -1) {
        const kickedUser = roomData.users[userIndex];
        roomData.users.splice(userIndex, 1);
        updateUsersList();
        updateViewersCount();
        addSystemMessage(`${kickedUser.name} был удален из комнаты`);
    }
};

// Чат
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');

function addMessage(text, userId = null, userName = null) {
    const message = {
        id: Date.now() + Math.random(),
        text: text,
        userId: userId || currentUser.id,
        userName: userName || currentUser.name,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        isOwn: userId === currentUser.id || userId === null
    };
    
    messages.push(message);
    
    if (messagesContainer) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.isOwn ? 'own' : 'other'}`;
        messageDiv.innerHTML = `
            ${!message.isOwn ? `<div class="message-info"><span class="message-sender">${message.userName}</span></div>` : ''}
            <div class="message-text">${message.text}</div>
            <div class="message-time">${message.time}</div>
        `;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system';
    messageDiv.textContent = text;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

document.getElementById('send-message-btn').addEventListener('click', () => {
    const text = messageInput.value.trim();
    if (text) {
        addMessage(text);
        messageInput.value = '';
    }
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('send-message-btn').click();
    }
});

// Переключение табов
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`${tab}-tab`).classList.add('active');
    });
});

// Модальное окно приглашения
const inviteModal = document.getElementById('invite-modal');
const inviteLinkBox = document.getElementById('invite-link-box');

document.getElementById('invite-users-btn').addEventListener('click', () => {
    // Генерируем ссылку приглашения
    const inviteLink = `https://t.me/your_bot?start=${roomData.id}`;
    inviteLinkBox.textContent = inviteLink;
    inviteModal.classList.add('active');
});

document.getElementById('close-invite-modal').addEventListener('click', () => {
    inviteModal.classList.remove('active');
});

document.getElementById('copy-invite-link').addEventListener('click', () => {
    navigator.clipboard.writeText(inviteLinkBox.textContent);
    alert('Ссылка скопирована!');
});

// Поиск пользователя
document.getElementById('search-user-btn').addEventListener('click', () => {
    const username = document.getElementById('search-user-input').value.trim();
    const searchResult = document.getElementById('search-result');
    
    if (username) {
        // Имитация поиска
        searchResult.innerHTML = `
            <div class="user-item">
                <div class="user-avatar">👤</div>
                <div class="user-name">
                    <span>${username}</span>
                </div>
                <button class="btn btn-small" onclick="inviteUser('${username}')">Пригласить</button>
            </div>
        `;
        searchResult.classList.add('active');
    }
});

window.inviteUser = (username) => {
    alert(`Приглашение отправлено пользователю ${username}`);
    inviteModal.classList.remove('active');
};

// Модальное окно настроек
const settingsModal = document.getElementById('settings-modal');

document.getElementById('room-settings-btn').addEventListener('click', () => {
    if (currentUser.isAdmin) {
        settingsModal.classList.add('active');
    } else {
        alert('Только администратор может изменять настройки');
    }
});

document.getElementById('close-settings-modal').addEventListener('click', () => {
    settingsModal.classList.remove('active');
});

document.getElementById('end-session-btn').addEventListener('click', () => {
    if (confirm('Завершить сеанс? Все участники будут отключены.')) {
        alert('Сеанс завершен');
        // Возврат на главный экран
        roomScreen.classList.remove('active');
        joinScreen.classList.add('active');
        settingsModal.classList.remove('active');
        stopSync();
    }
});

// Селектор фильмов
const movieSelector = document.getElementById('movie-selector');
const videoPlaceholder = document.getElementById('video-placeholder');

document.getElementById('video-placeholder').addEventListener('click', () => {
    if (currentUser.isAdmin) {
        movieSelector.classList.add('active');
    }
});

document.getElementById('close-selector').addEventListener('click', () => {
    movieSelector.classList.remove('active');
});

// Выбор фильма
document.querySelectorAll('.movie-item').forEach(item => {
    item.addEventListener('click', () => {
        const url = item.dataset.url;
        const title = item.querySelector('.movie-title').textContent;
        
        // Загружаем видео (имитация)
        loadVideo(url, title);
        movieSelector.classList.remove('active');
    });
});

function loadVideo(url, title) {
    videoPlaceholder.innerHTML = `
        <iframe 
            src="${url}" 
            width="100%" 
            height="100%" 
            frameborder="0" 
            allow="autoplay; encrypted-media; fullscreen"
            allowfullscreen>
        </iframe>
    `;
    
    roomData.currentVideo = { url, title };
    addSystemMessage(`Администратор начал показ: ${title}`);
}

// Управление видео
let isVideoPlaying = false;
const playPauseBtn = document.getElementById('play-pause-btn');
const progressFill = document.getElementById('progress-fill');
const timeDisplay = document.getElementById('time-display');

playPauseBtn.addEventListener('click', () => {
    isVideoPlaying = !isVideoPlaying;
    playPauseBtn.textContent = isVideoPlaying ? '⏸' : '▶';
    
    // Синхронизация с другими
    broadcastVideoState();
});

// Имитация прогресса
let progressInterval;
function startProgressTracking() {
    progressInterval = setInterval(() => {
        if (isVideoPlaying) {
            // Имитация увеличения времени
            const currentWidth = parseFloat(progressFill.style.width) || 0;
            if (currentWidth < 100) {
                progressFill.style.width = (currentWidth + 0.1) + '%';
                
                const currentTime = (currentWidth / 100) * 120; // 2 часа = 120 минут
                const minutes = Math.floor(currentTime);
                const seconds = Math.floor((currentTime * 60) % 60);
                timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')} / 2:00`;
            }
        }
    }, 1000);
}

startProgressTracking();

// Синхронизация (имитация)
function startSync() {
    syncInterval = setInterval(() => {
        broadcastVideoState();
    }, 5000);
}

function stopSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
}

function broadcastVideoState() {
    // В реальном приложении здесь будет отправка на сервер
    console.log('Синхронизация:', {
        isPlaying: isVideoPlaying,
        currentTime: parseFloat(progressFill.style.width) || 0,
        viewers: roomData.users.length
    });
}

// Закрытие модалок по клику вне
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

// Обработка закрытия
tg.onEvent('backButtonClicked', () => {
    if (roomScreen.classList.contains('active')) {
        if (confirm('Выйти из комнаты?')) {
            roomScreen.classList.remove('active');
            joinScreen.classList.add('active');
            stopSync();
        }
    } else {
        tg.close();
    }
});

// Показываем кнопку назад
tg.BackButton.show();