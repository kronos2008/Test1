// База данных (IndexedDB)
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
                
                // Медиатека
                if (!db.objectStoreNames.contains('library')) {
                    const libraryStore = db.createObjectStore('library', { keyPath: 'id', autoIncrement: true });
                    libraryStore.createIndex('trackId', 'trackId', { unique: true });
                    libraryStore.createIndex('title', 'title');
                }
                
                // Плейлисты
                if (!db.objectStoreNames.contains('playlists')) {
                    const playlistStore = db.createObjectStore('playlists', { keyPath: 'id', autoIncrement: true });
                    playlistStore.createIndex('name', 'name');
                }
                
                // Треки в плейлистах
                if (!db.objectStoreNames.contains('playlist_tracks')) {
                    const playlistTracksStore = db.createObjectStore('playlist_tracks', { keyPath: 'id', autoIncrement: true });
                    playlistTracksStore.createIndex('playlistId', 'playlistId');
                }
            };
        });
    }

    // Добавить в медиатеку
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
                artwork: track.artwork,
                stream_url: track.stream_url,
                addedAt: new Date().toISOString()
            });
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Получить медиатеку
    async getLibrary() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['library'], 'readonly');
            const store = transaction.objectStore('library');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Создать плейлист
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

    // Получить плейлисты
    async getPlaylists() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['playlists'], 'readonly');
            const store = transaction.objectStore('playlists');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Добавить трек в плейлист
    async addTrackToPlaylist(playlistId, trackId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['playlist_tracks'], 'readwrite');
            const store = transaction.objectStore('playlist_tracks');
            
            const request = store.add({
                playlistId: playlistId,
                trackId: trackId,
                addedAt: new Date().toISOString()
            });
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Получить треки плейлиста
    async getPlaylistTracks(playlistId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['playlist_tracks', 'library'], 'readonly');
            const trackStore = transaction.objectStore('playlist_tracks');
            const libraryStore = transaction.objectStore('library');
            
            const index = trackStore.index('playlistId');
            const request = index.getAll(playlistId);
            
            request.onsuccess = async () => {
                const playlistEntries = request.result;
                const tracks = [];
                
                for (const entry of playlistEntries) {
                    const trackRequest = libraryStore.get(entry.trackId);
                    await new Promise(resolve => {
                        trackRequest.onsuccess = () => {
                            tracks.push(trackRequest.result);
                            resolve();
                        };
                    });
                }
                
                resolve(tracks);
            };
            
            request.onerror = () => reject(request.error);
        });
    }
}

const db = new Database();