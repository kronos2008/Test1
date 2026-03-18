// Конфиг с твоими токенами
const TOKENS = {
    VK: 'vk1.a.EHDQmrIFwC7qweP0qEgpxPxveVc1xNNlzBVcx111rIgJfQcpb9BV7K6M5pPn4HsT2xmDp4lwo-6Z8HuO09jX4rqn8bNRwQAUWLxgKvij9-cQxUjfUZF1_paYtJk9UdS_b0eagtZxn-KDakFmnfw2HTyXp9T_h2Mds_u_1ZlHD-meU6t6VwliaRKQTZTygLhIm7rAAA05owCQxC5PgUG-NQ',
    YANDEX: 'y0__xCkjIXbCBje-AYg8sar5BbAxLyLqPrtSMLg7-n6xb3qh4tByw'
};

let audio = new Audio();
let currentTrack = null;
let library = JSON.parse(localStorage.getItem('sp_lib')) || [];

// Общий метод для JSONP запросов
function jsonpRequest(url, callbackParam = 'callback') {
    return new Promise((resolve) => {
        const cbName = 'cb_' + Math.random().toString(36).slice(2);
        window[cbName] = (data) => {
            delete window[cbName];
            document.getElementById(cbName)?.remove();
            resolve(data);
        };
        const script = document.createElement('script');
        script.id = cbName;
        script.src = url + (url.includes('?') ? '&' : '?') + `${callbackParam}=${cbName}`;
        document.head.appendChild(script);
    });
}

// Поиск в ВК
async function searchVK(query) {
    const res = await jsonpRequest(`https://api.vk.com/method/audio.search?q=${encodeURIComponent(query)}&access_token=${TOKENS.VK}&v=5.131`);
    return (res?.response?.items || []).map(t => ({
        id: 'vk_' + t.id,
        title: t.title,
        artist: t.artist,
        url: t.url,
        source: 'VK'
    }));
}

// Поиск в Яндексе (через публичный API)
async function searchYandex(query) {
    // ВАЖНО: Прямой поиск Яндекса требует сложных заголовков. 
    // Здесь упрощенная имитация. Если треков нет — нужен бэкенд-прокси.
    try {
        const res = await fetch(`https://api.music.yandex.net/search?text=${encodeURIComponent(query)}&type=track`, {
            headers: { 'Authorization': `OAuth ${TOKENS.YANDEX}` }
        }).then(r => r.json());
        
        return (res?.result?.tracks?.results || []).map(t => ({
            id: 'ya_' + t.id,
            title: t.title,
            artist: t.artists[0].name,
            url: '', // Ссылка на поток у Яндекса зашифрована, требует 3-х этапного получения
            source: 'YA'
        }));
    } catch(e) { return []; }
}

// Объединенный поиск
async function performSearch(query) {
    const [vkTracks, yaTracks] = await Promise.all([searchVK(query), searchYandex(query)]);
    return [...vkTracks, ...yaTracks];
}

function renderTracks(tracks, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = tracks.length ? '' : '<div class="status-msg">Ничего не найдено</div>';
    
    tracks.forEach(track => {
        const div = document.createElement('div');
        div.className = 'track-item';
        div.onclick = () => playTrack(track);
        div.innerHTML = `
            <div class="track-source ${track.source === 'VK' ? 'src-vk' : 'src-ya'}">${track.source}</div>
            <div class="track-info">
                <div class="track-title">${track.title}</div>
                <div class="track-artist">${track.artist}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

function playTrack(track) {
    if (track.source === 'YA' && !track.url) {
        alert('Для проигрывания Яндекса требуется серверная часть. ВК работает напрямую.');
        return;
    }
    currentTrack = track;
    audio.src = track.url;
    audio.play();
    
    document.getElementById('mini-player').classList.remove('hidden');
    document.getElementById('mp-title').textContent = track.title;
    document.getElementById('mp-artist').textContent = track.artist;
    document.getElementById('btn-play-pause').textContent = '⏸';
}

// Навигация и поиск
document.getElementById('search-input').oninput = async (e) => {
    const q = e.target.value;
    if (q.length > 2) {
        const results = await performSearch(q);
        renderTracks(results, 'search-results');
    }
};

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.onclick = (e) => {
        document.querySelectorAll('.nav-btn, .page').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
        if (btn.dataset.target === 'page-library') renderTracks(library, 'library-tracks');
    };
});

document.getElementById('btn-play-pause').onclick = () => {
    audio.paused ? (audio.play(), document.getElementById('btn-play-pause').textContent = '⏸') : (audio.pause(), document.getElementById('btn-play-pause').textContent = '▶');
};

audio.ontimeupdate = () => {
    document.getElementById('mp-progress').style.width = (audio.currentTime / audio.duration * 100) + '%';
};
