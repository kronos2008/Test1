// ==================== VK MUSIC API - РАБОЧАЯ ВЕРСИЯ ====================
class VKMusicAPI {
    constructor() {
        this.token = 'vk1.a.EHDQmrIFwC7qweP0qEgpxPxveVc1xNNlzBVcx111rIgJfQcpb9BV7K6M5pPn4HsT2xmDp4lwo-6Z8HuO09jX4rqn8bNRwQAUWLxgKvij9-cQxUjfUZF1_paYtJk9UdS_b0eagtZxn-KDakFmnfw2HTyXp9T_h2Mds_u_1ZlHD-meU6t6VwliaRKQTZTygLhIm7rAAA05owCQxC5PgUG-NQ';
        this.apiVersion = '5.131';
    }

    async request(method, params) {
        const url = `https://api.vk.com/method/${method}?${params}&access_token=${this.token}&v=${this.apiVersion}`;
        
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.error) {
                console.error('VK Error:', data.error);
                return null;
            }
            return data.response;
        } catch (error) {
            console.error('VK Request Error:', error);
            return null;
        }
    }

    async search(query) {
        const response = await this.request('audio.search', `q=${encodeURIComponent(query)}&count=30&auto_complete=1`);
        
        if (!response || !response.items || response.items.length === 0) {
            return [];
        }
        
        return response.items.map(track => ({
            id: track.id,
            title: track.title,
            artist: track.artist,
            duration: this.formatDuration(track.duration),
            duration_seconds: track.duration,
            url: track.url
        }));
    }

    async getTopCharts() {
        // Получаем популярные треки через поиск
        const popular = await this.request('audio.search', 'q=хиты&count=30&auto_complete=1');
        
        if (!popular || !popular.items) {
            return [];
        }
        
        return popular.items.map((track, index) => ({
            num: index + 1,
            id: track.id,
            title: track.title,
            artist: track.artist,
            duration: this.formatDuration(track.duration),
            duration_seconds: track.duration
        }));
    }

    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

window.vk = new VKMusicAPI();