class YandexMusicAPI {
    constructor() {
        this.token = 'y0__xCkjIXbCBje-AYg8sar5BbAxLyLqPrtSMLg7-n6xb3qh4tByw';
    }

    async search(query) {
        try {
            const response = await fetch(
                `https://api.music.yandex.net/search?text=${encodeURIComponent(query)}&type=track`,
                {
                    headers: {
                        'Authorization': `OAuth ${this.token}`
                    }
                }
            );
            
            const data = await response.json();
            console.log('API ответ:', data); // Смотрим в консоль
            
            if (!data.result || !data.result.tracks) {
                return [];
            }
            
            return data.result.tracks.results.map(track => ({
                id: track.id,
                title: track.title,
                artist: track.artists[0]?.name || 'Неизвестно',
                duration: this.formatDuration(track.durationMs)
            }));
        } catch (error) {
            console.error('Ошибка:', error);
            return [];
        }
    }

    async getTopCharts() {
        // Просто ищем популярное
        return this.search('хиты');
    }

    formatDuration(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

window.yandex = new YandexMusicAPI();
