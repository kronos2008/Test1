// ==================== ИНИЦИАЛИЗАЦИЯ ====================
let tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.backgroundColor = '#1A1A2E';
    tg.headerColor = '#8A2BE2';
}

let currentPage = 'top';

document.addEventListener('DOMContentLoaded', () => {
    loadPage('top');
    
    // Навигация
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            loadPage(this.dataset.page);
        });
    });
});

// ==================== ЗАГРУЗКА СТРАНИЦ ====================
async function loadPage(page) {
    currentPage = page;
    const content = document.getElementById('content');
    
    content.innerHTML = '<div class="loading">Загрузка...</div>';
    
    try {
        if (page === 'top') {
            await loadTopPage(content);
        } else if (page === 'library') {
            loadLibraryPage(content);
        } else if (page === 'playlists') {
            loadPlaylistsPage(content);
        } else if (page === 'search') {
            loadSearchPage(content);
        }
    } catch (error) {
        content.innerHTML = '<div class="error">Ошибка загрузки</div>';
    }
}

// ==================== ТОП ЧАРТЫ ====================
async function loadTopPage(container) {
    const tracks = await vk.getTopCharts();
    
    if (tracks.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет треков</div>';
        return;
    }
    
    let html = `
        <h2 class="page-title">Топ Чарты</h2>
        <div class="action-buttons">
            <button class="play-all" onclick="playAll()">▶ Воспроизвести</button>
            <button class="shuffle-all" onclick="shuffleAll()">☑ Перемешать</button>
        </div>
        <div class="tracks-list">
    `;
    
    tracks.forEach(track => {
        html += `
            <div class="track-item" onclick='playTrack(${JSON.stringify(track).replace(/'/g, "&apos;")})'>
                <span class="track-num">${track.num}</span>
                <div class="track-info">
                    <div class="track-title">${this.escapeHtml(track.title)}</div>
                    <div class="track-artist">${this.escapeHtml(track.artist)}</div>
                </div>
                <span class="track-duration">${track.duration}</span>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// ==================== МЕДИАТЕКА ====================
function loadLibraryPage(container) {
    container.innerHTML = `
        <div class="empty-state">
            <p>У вас пока нет музыки</p>
            <p class="hint">Добавьте треки через поиск, и они появятся здесь</p>
        </div>
    `;
}

// ==================== ПЛЕЙЛИСТЫ ====================
function loadPlaylistsPage(container) {
    container.innerHTML = `
        <div class="empty-state">
            <p>У вас пока нет плейлистов</p>
            <p class="hint">Создайте плейлист, чтобы собирать свои любимые треки</p>
            <button class="create-playlist-btn" onclick="createPlaylist()">+ Создать плейлист</button>
        </div>
    `;
}

// ==================== ПОИСК ====================
function loadSearchPage(container) {
    container.innerHTML = `
        <h2 class="page-title">Поиск музыки</h2>
        <input type="text" 
               class="search-box" 
               placeholder="Введите название трека или исполнителя"
               onkeyup="searchTracks(this.value)">
        <div id="search-results"></div>
    `;
}

let searchTimeout;
async function searchTracks(query) {
    clearTimeout(searchTimeout);
    
    if (query.length < 2) {
        document.getElementById('search-results').innerHTML = '';
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        const resultsDiv = document.getElementById('search-results');
        resultsDiv.innerHTML = '<div class="loading">Поиск...</div>';
        
        const tracks = await vk.search(query);
        
        if (tracks.length === 0) {
            resultsDiv.innerHTML = '<div class="empty-state">Ничего не найдено</div>';
            return;
        }
        
        let html = '<div class="tracks-list">';
        tracks.forEach(track => {
            html += `
                <div class="track-item" onclick='playTrack(${JSON.stringify(track).replace(/'/g, "&apos;")})'>
                    <div class="track-info">
                        <div class="track-title">${escapeHtml(track.title)}</div>
                        <div class="track-artist">${escapeHtml(track.artist)}</div>
                    </div>
                    <span class="track-duration">${track.duration}</span>
                </div>
            `;
        });
        html += '</div>';
        
        resultsDiv.innerHTML = html;
    }, 500);
}

// ==================== ПЛЕЕР ====================
function playTrack(track) {
    // Сохраняем трек для плеера
    localStorage.setItem('currentTrack', JSON.stringify(track));
    
    // Отправляем в Telegram
    if (tg) {
        tg.sendData(JSON.stringify({
            action: 'play',
            track: track
        }));
    }
    
    // Здесь можно открыть плеер
    // window.location.href = 'player.html';
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function playAll() {
    console.log('Play all');
}

function shuffleAll() {
    console.log('Shuffle all');
}

function createPlaylist() {
    const name = prompt('Введите название плейлиста:');
    if (name) {
        alert('Плейлист создан!');
    }
}

// Глобальные функции
window.playTrack = playTrack;
window.searchTracks = searchTracks;
window.createPlaylist = createPlaylist;
window.playAll = playAll;
window.shuffleAll = shuffleAll;