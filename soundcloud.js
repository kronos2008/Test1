// SoundCloud API
class SoundCloudAPI {
    constructor() {
        this.clientId = CONFIG.SOUNDCLOUD_CLIENT_ID;
        this.baseUrl = CONFIG.SOUNDCLOUD_API;
    }

    // Поиск треков
    async search(query, limit = 20) {
        try {
            const url = `${this.baseUrl}/tracks?q=${encodeURIComponent(query)}&client_id=${this.clientId}&limit=${limit}&format=json`;
            const response = await fetch(url);
            const tracks = await response.json();
            
            return tracks.map(track => ({
                id: track.id.toString(),
                title: track.title,
                artist: track.user.username,
                duration: this.formatDuration(track.duration),
                duration_seconds: Math.floor(track.duration / 1000),
                artwork: track.artwork_url || track.user.avatar_url,
                stream_url: `${this.baseUrl}/tracks/${track.id}/stream?client_id=${this.clientId}`,
                permalink: track.permalink_url
            }));
        } catch (error) {
            console.error('SoundCloud search error:', error);
            return [];
        }
    }

    // Получить топ-чарты
    async getTopCharts(limit = 50) {
        try {
            const url = `${this.baseUrl}/tracks?client_id=${this.clientId}&limit=${limit}&order=hotness&format=json`;
            const response = await fetch(url);
            const tracks = await response.json();
            
            return tracks.map((track, index) => ({
                num: index + 1,
                id: track.id.toString(),
                title: track.title,
                artist: track.user.username,
                duration: this.formatDuration(track.duration),
                duration_seconds: Math.floor(track.duration / 1000),
                artwork: track.artwork_url || track.user.avatar_url,
                stream_url: `${this.baseUrl}/tracks/${track.id}/stream?client_id=${this.clientId}`
            }));
        } catch (error) {
            console.error('SoundCloud top charts error:', error);
            return [];
        }
    }

    // Получить трек по ID
    async getTrack(trackId) {
        try {
            const url = `${this.baseUrl}/tracks/${trackId}?client_id=${this.clientId}&format=json`;
            const response = await fetch(url);
            const track = await response.json();
            
            return {
                id: track.id.toString(),
                title: track.title,
                artist: track.user.username,
                duration: this.formatDuration(track.duration),
                duration_seconds: Math.floor(track.duration / 1000),
                artwork: track.artwork_url || track.user.avatar_url,
                stream_url: `${this.baseUrl}/tracks/${track.id}/stream?client_id=${this.clientId}`,
                permalink: track.permalink_url
            };
        } catch (error) {
            console.error('SoundCloud get track error:', error);
            return null;
        }
    }

    // Форматирование длительности
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}

const soundcloud = new SoundCloudAPI();