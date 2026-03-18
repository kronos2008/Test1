class YandexMusicAPI {
    constructor() {
        this.token = 'y0__xCkjIXbCBje-AYg8sar5BbAxLyLqPrtSMLg7-n6xb3qh4tByw';
        // Добавляем прокси
        this.proxy = 'https://cors-anywhere.herokuapp.com/';
        this.baseUrl = 'https://api.music.yandex.net';
    }

    async search(query) {
        try {
            // ВОТ СЮДА ВСТАВЛЕН ПРОКСИ
            const url = this.proxy + `${this.baseUrl}/search?text=${encodeURIComponent(query)}&type=track`;
            
            console.log('Запрос к:', url); // Для отладки
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `OAuth ${this.token}`,
                    'Origin': 'https://your-domain.com' // Можно заменить на свой домен
                }
            });
            
            const data = await response.json();
            console.log('API ответ:', data);
            
            if (!data.result || !data.result.tracks) {
                return [];
            }
            
            return data.result.tracks.results.map(track => ({
                id: track.id,
                title: track.title,
                artist: track.artists[0]?.name || 'Неизвестно',
                duration: this.formatDuration(track.durationMs),
                cover: track.coverUri ? `https://${track.coverUri.replace('%%', '400x400')}` : null
            }));
        } catch (error) {
            console.error('Ошибка:', error);
            return [];
        }
    }

    async getTopCharts() {
        return this.search('хиты');
    }

    formatDuration(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

window.yandex = new YandexMusicAPI();
