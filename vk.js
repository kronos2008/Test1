// ==================== VK MUSIC API - РАБОЧАЯ ====================
class VKMusicAPI {
    constructor() {
        this.token = 'vk1.a.EHDQmrIFwC7qweP0qEgpxPxveVc1xNNlzBVcx111rIgJfQcpb9BV7K6M5pPn4HsT2xmDp4lwo-6Z8HuO09jX4rqn8bNRwQAUWLxgKvij9-cQxUjfUZF1_paYtJk9UdS_b0eagtZxn-KDakFmnfw2HTyXp9T_h2Mds_u_1ZlHD-meU6t6VwliaRKQTZTygLhIm7rAAA05owCQxC5PgUG-NQ';
    }

    async search(query) {
        try {
            const response = await fetch(
                `https://api.vk.com/method/audio.search?q=${encodeURIComponent(query)}&count=20&access_token=${this.token}&v=5.131`
            );
            const data = await response.json();
            
            console.log('VK ответ:', data); // Смотрим в консоль
            
            if (data.response && data.response.items) {
                return data.response.items.map(track => ({
                    id: track.id,
                    title: track.title,
                    artist: track.artist,
                    duration: this.formatDuration(track.duration),
                    url: track.url
                }));
            }
            return [];
        } catch (error) {
            console.error('VK ошибка:', error);
            return [];
        }
    }

    async getTopCharts() {
        const data = await this.search('хиты');
        return data.map((track, index) => ({
            ...track,
            num: index + 1
        }));
    }

    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

window.vk = new VKMusicAPI();
