// ==================== ЯНДЕКС МУЗЫКА API ====================
class YandexMusicAPI {
    constructor() {
        this.token = CONFIG.YANDEX.TOKEN;
        this.baseUrl = 'https://api.music.yandex.net';
        this.headers = {
            'Authorization': `OAuth ${this.token}`,
            'Content-Type': 'application/json'
        };
    }

    // Поиск треков
    async search(query) {
        try {
            const url = `${this.baseUrl}/search?text=${encodeURIComponent(query)}&type=track&page=0`;
            const response = await fetch(url, { headers: this.headers });
            const data = await response.json();
            
            if (!data.result || !data.result.tracks) return [];
            
            return data.result.tracks.results.map(track => ({
                id: track.id.toString(),
                title: track.title,
                artist: track.artists.map(a => a.name).join(', '),
                duration: this.formatDuration(track.durationMs),
                duration_seconds: Math.floor(track.durationMs / 1000),
                album: track.albums[0]?.title,
                cover: track.coverUri ? `https://${track.coverUri.replace('%%', '400x400')}` : null,
                available: track.available
            }));
        } catch (error) {
            console.error('Yandex search error:', error);
            return [];
        }
    }

    // Получить топ-чарты
    async getTopCharts() {
        try {
            // Получаем чарты через плейлист "Новые альбомы"
            const url = `${this.baseUrl}/users/${this.getUid()}/playlists/3`; // 3 - это "Мне нравится" для примера
            const response = await fetch(url, { headers: this.headers });
            const data = await response.json();
            
            if (!data.result || !data.result.tracks) return [];
            
            return data.result.tracks.map((item, index) => ({
                num: index + 1,
                id: item.track.id.toString(),
                title: item.track.title,
                artist: item.track.artists.map(a => a.name).join(', '),
                duration: this.formatDuration(item.track.durationMs),
                duration_seconds: Math.floor(item.track.durationMs / 1000),
                cover: item.track.coverUri ? `https://${item.track.coverUri.replace('%%', '400x400')}` : null,
                album: item.track.albums[0]?.title
            }));
        } catch (error) {
            console.error('Yandex top charts error:', error);
            // Возвращаем популярные треки через поиск
            return this.getPopularTracks();
        }
    }

    // Получить популярные треки (запасной вариант)
    async getPopularTracks() {
        const popularQueries = ['новинки', 'хиты', 'популярное'];
        const randomQuery = popularQueries[Math.floor(Math.random() * popularQueries.length)];
        const tracks = await this.search(randomQuery);
        return tracks.slice(0, 20).map((track, index) => ({
            ...track,
            num: index + 1
        }));
    }

    // Получить URL трека для воспроизведения
    async getTrackUrl(trackId) {
        try {
            const url = `${this.baseUrl}/tracks/${trackId}/download-info`;
            const response = await fetch(url, { headers: this.headers });
            const data = await response.json();
            
            if (data.result && data.result.length > 0) {
                // Берем лучший доступный битрейт
                const downloadInfo = data.result[0];
                const downloadUrl = `${this.baseUrl}/tracks/${trackId}/download?trackId=${trackId}:${downloadInfo.codec}`;
                
                const directResponse = await fetch(downloadUrl, { headers: this.headers });
                const directData = await directResponse.json();
                
                return directData.result?.src || null;
            }
            return null;
        } catch (error) {
            console.error('Get track URL error:', error);
            return null;
        }
    }

    // Получить ID пользователя
    async getUid() {
        try {
            const response = await fetch(`${this.baseUrl}/account/status`, { headers: this.headers });
            const data = await response.json();
            return data.result?.account?.uid || '0';
        } catch {
            return '0';
        }
    }

    // Форматирование длительности
    formatDuration(ms) {
        if (!ms) return '3:00';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}

const yandex = new YandexMusicAPI();