// ==================== ИНИЦИАЛИЗАЦИЯ ====================
let tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.backgroundColor = '#1A1A2E';
    tg.headerColor = '#8A2BE2';
}

// База данных (IndexedDB для плейлистов)
class Database {
    constructor() {
        this.dbName = 'SoundPlayDB';
        this.dbVersion = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('library')) {
                    const store = db.createObjectStore('library', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('trackId', 'trackId', { unique: true });
                }
                
                if (!db.objectStoreNames.contains('playlists')) {
                    const store = db.createObjectStore('playlists', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('name', 'name');
                }
            };
        });
    }

    async addToLibrary(track) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['library'], 'readwrite');
            const store = transaction.objectStore('library');
            
            const request = store.add({
                trackId: track.id,
                title: track.title,
                artist: track.artist,
                duration: track.duration,
                duration_seconds: track.duration_seconds,
                cover: track.cover,
                addedAt: new Date().toISOString()
            });
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getLibrary() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['library'], 'readonly');
            const store = transaction.objectStore('library');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async createPlaylist(name) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['playlists'], 'readwrite');
            const store = transaction.objectStore('playlists');
            
            const request = store.add({
                name: name,
                createdAt: new Date().toISOString()
            });
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getPlaylists() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['playlists'], 'readonly');
            const store = transaction.objectStore('playlists');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

const db = new Database();
let currentPage = 'top';

// ==================== ЗАГРУЗКА ПРИЛОЖЕНИЯ ====================
document.addEventListener('DOMContentLoaded', async () => {
    await db.init();
    await loadPage('top');
    
    // Навигация
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            loadPage(item.dataset.page);
        });
    });
});

// ==================== ЗАГРУЗКА СТРАНИЦ ====================
async function loadPage(page) {
    currentPage = page;
    const content = document.getElementById('content');
    
    switch(page) {
        case 'top':
            await loadTopPage(content);
            break;
        case 'library':
            await loadLibraryPage(content);
            break;
        case 'playlists':
            await loadPlaylistsPage(content);
            break;
        case 'search':
            loadSearchPage(content);
            break;
    }
}

// ==================== СТРАНИЦА ТОП ====================
async function loadTopPage(container) {
    container.innerHTML = '<div class="loading">Загрузка треков...</div>';
    
    const tracks = await yandex.getTopCharts();
    
    let html = `
        <h2 class="page-title">Топ Чарты</h2>
        <div class="action-buttons">
            <button class="play-all" onclick="playAllTracks()">▶ Воспроизвести</button>
            <button class="shuffle-all" onclick="shuffleAllTracks()">☑ Перемешать</button>
        </div>
        <div class="tracks-list">
    `;
    
    tracks.slice(0, 20).forEach(track => {
        html += `
            <div class="track-item" onclick="playTrack(${JSON.stringify(track).replace(/"/g, '&quot;')})">
                <span class="track-num">${track.num}</span>
                <div class="track-info">
                    <div class="track-title">${track.title}</div>
                    <div class="track-artist">${track.artist}</div>
                </div>
                <span class="track-duration">${track.duration}</span>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// ==================== СТРАНИЦА МЕДИАТЕКА ====================
async function loadLibraryPage(container) {
    const library = await db.getLibrary();
    
    if (library.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>У вас пока нет музыки</p>
                <p class="hint">Добавьте треки через поиск, и они появятся здесь</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="action-buttons">
            <button class="play-all" onclick="playAllFromLibrary()">▶ Воспроизвести</button>
            <button class="shuffle-all" onclick="shuffleLibrary()">☑ Перемешать</button>
        </div>
        <div class="tracks-list">
    `;
    
    library.forEach(track => {
        html += `
            <div class="track-item" onclick="playTrack(${JSON.stringify(track).replace(/"/g, '&quot;')})">
                <div class="track-info">
                    <div class="track-title">${track.title}</div>
                    <div class="track-artist">${track.artist}</div>
                </div>
                <span class="track-duration">${track.duration}</span>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// ==================== СТРАНИЦА ПЛЕЙЛИСТЫ ====================
async function loadPlaylistsPage(container) {
    const playlists = await db.getPlaylists();
    
    if (playlists.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>У вас пока нет плейлистов</p>
                <p class="hint">Создайте плейлист, чтобы собирать свои любимые треки</p>
                <button class="create-playlist-btn" onclick="createPlaylist()">+ Создать плейлист</button>
            </div>
        `;
        return;
    }
    
    let html = '<div class="playlists-list">';
    
    playlists.forEach(playlist => {
        html += `
            <div class="playlist-item" onclick="openPlaylist(${playlist.id})">
                <div>
                    <div class="playlist-name">${playlist.name}</div>
                </div>
                <span class="playlist-arrow">▶</span>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// ==================== СТРАНИЦА ПОИСК ====================
function loadSearchPage(container) {
    container.innerHTML = `
        <input type="text" 
               class="search-box" 
               placeholder="Введите название трека или исполнителя"
               onkeyup="searchTracks(this.value)">
        <div id="search-results"></div>
    `;
}

// ==================== ПОИСК ТРЕКОВ ====================
let searchTimeout;
async function searchTracks(query) {
    clearTimeout(searchTimeout);
    
    if (query.length < 2) return;
    
    searchTimeout = setTimeout(async () => {
        const resultsDiv = document.getElementById('search-results');
        resultsDiv.innerHTML = '<div class="loading">Поиск...</div>';
        
        const tracks = await yandex.search(query);
        
        if (tracks.length === 0) {
            resultsDiv.innerHTML = `
                <div class="empty-state">
                    <p>Ничего не найдено</p>
                </div>
            `;
            return;
        }
        
        let html = '<div class="tracks-list">';
        
        tracks.forEach(track => {
            html += `
                <div class="track-item" onclick="playTrack(${JSON.stringify(track).replace(/"/g, '&quot;')})">
                    <div class="track-info">
                        <div class="track-title">${track.title}</div>
                        <div class="track-artist">${track.artist}</div>
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
async function playTrack(track) {
    // Сохраняем в Telegram WebApp
    if (tg) {
        tg.sendData(JSON.stringify({
            action: 'play',
            track: track
        }));
    }
    
    // Переходим на страницу плеера
    localStorage.setItem('currentTrack', JSON.stringify(track));
    window.location.href = 'player.html';
}

// ==================== СОЗДАНИЕ ПЛЕЙЛИСТА ====================
async function createPlaylist() {
    const name = prompt('Введите название плейлиста:');
    if (name) {
        await db.createPlaylist(name);
        await loadPage('playlists');
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function playAllTracks() {
    console.log('Play all tracks');
}

function shuffleAllTracks() {
    console.log('Shuffle all');
}