// ==================== VK MUSIC API ====================
class VKMusicAPI {
    constructor() {
        // ВАШ ТОКЕН
        this.token = 'vk1.a.EHDQmrIFwC7qweP0qEgpxPxveVc1xNNlzBVcx111rIgJfQcpb9BV7K6M5pPn4HsT2xmDp4lwo-6Z8HuO09jX4rqn8bNRwQAUWLxgKvij9-cQxUjfUZF1_paYtJk9UdS_b0eagtZxn-KDakFmnfw2HTyXp9T_h2Mds_u_1ZlHD-meU6t6VwliaRKQTZTygLhIm7rAAA05owCQxC5PgUG-NQ'; // <--- ВСТАВЬТЕ СЮДА ВАШ ТОКЕН
        this.apiVersion = '5.131';
        this.baseUrl = 'https://api.vk.com/method';
    }

    async request(method, params = {}) {
        params.access_token = this.token;
        params.v = this.apiVersion;

        const url = new URL(`${this.baseUrl}/${method}`);
        url.search = new URLSearchParams(params).toString();

        try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.error) {
                console.error('VK API Error:', data.error);
                return null;
            }
            return data.response;
        } catch (error) {
            console.error('VK Request Error:', error);
            return null;
        }
    }

    async search(query) {
        const result = await this.request('audio.search', {
            q: query,
            count: 20,
            auto_complete: 1,
            lyrics: 0,
            sort: 2
        });

        if (!result || !result.items) return [];

        return result.items.map(track => ({
            id: track.id,
            title: track.title,
            artist: track.artist,
            duration: this.formatDuration(track.duration),
            duration_seconds: track.duration,
            url: track.url
        }));
    }

    async getTopCharts() {
        // VK не имеет прямого "чарта", используем рекомендации
        const result = await this.request('audio.getRecommendations', {
            count: 20
        });

        if (!result || !result.items) return [];

        return result.items.map((track, index) => ({
            num: index + 1,
            id: track.id,
            title: track.title,
            artist: track.artist,
            duration: this.formatDuration(track.duration)
        }));
    }

    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

const vk = new VKMusicAPI();