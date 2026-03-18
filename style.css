:root {
    --bg: #09090b;
    --card: rgba(255, 255, 255, 0.05);
    --accent: #8b5cf6; /* Фиолетовый как на скринах */
    --text: #ffffff;
    --text-dim: #a1a1aa;
}

* { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', -apple-system, sans-serif; }

body { background: var(--bg); color: var(--text); overflow: hidden; height: 100vh; }

.bg-glow {
    position: fixed; top: -10%; left: -10%; width: 120%; height: 50%;
    background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%);
    filter: blur(80px); z-index: -1;
}

.app-container { display: flex; flex-direction: column; height: 100vh; }

.header { padding: 20px; z-index: 10; }
.header-top { display: flex; justify-content: space-between; align-items: center; }
.logo { font-size: 24px; font-weight: 800; letter-spacing: -1px; background: linear-gradient(to right, #fff, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.user-badge { background: var(--card); padding: 4px 12px; border-radius: 20px; font-size: 12px; color: var(--accent); border: 1px solid rgba(139, 92, 246, 0.3); }

.content-area { flex: 1; overflow-y: auto; padding: 0 20px 180px 20px; scroll-behavior: smooth; }

.page { display: none; animation: slideUp 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
.page.active { display: block; }

@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

.welcome-block { margin-bottom: 30px; }
.welcome-block h2 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
.welcome-block p { color: var(--text-dim); font-size: 14px; }

/* Список треков в стиле скриншотов */
.track-item {
    display: flex; align-items: center; padding: 10px; margin-bottom: 8px;
    background: var(--card); border-radius: 12px; transition: all 0.2s;
    border: 1px solid transparent;
}
.track-item:active { transform: scale(0.97); background: rgba(255,255,255,0.1); }

.track-img {
    width: 50px; height: 50px; border-radius: 8px; margin-right: 15px;
    background: linear-gradient(45deg, #27272a, #3f3f46);
    display: flex; align-items: center; justify-content: center; font-size: 20px;
}

.track-info { flex: 1; overflow: hidden; }
.track-title { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.track-artist { font-size: 13px; color: var(--text-dim); margin-top: 2px; }

.source-tag { font-size: 9px; padding: 2px 6px; border-radius: 4px; margin-left: 10px; font-weight: bold; text-transform: uppercase; }
.tag-vk { background: #2563eb; color: #fff; }
.tag-ya { background: #facc15; color: #000; }

/* Мини-плеер */
.mini-player {
    position: fixed; bottom: 85px; left: 15px; right: 15px;
    background: rgba(24, 24, 27, 0.9); backdrop-filter: blur(15px);
    border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 10px 30px rgba(0,0,0,0.4); z-index: 50; overflow: hidden;
}
.mp-progress-container { width: 100%; height: 2px; background: rgba(255,255,255,0.1); }
.mp-progress-bar { height: 100%; background: var(--accent); width: 0%; transition: width 0.1s linear; }
.mp-content { display: flex; align-items: center; padding: 10px 15px; }
.mp-cover { width: 40px; height: 40px; border-radius: 6px; background: #333; margin-right: 12px; }
.mp-info { flex: 1; overflow: hidden; }
.mp-title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mp-artist { font-size: 12px; color: var(--text-dim); }
.btn-play { background: none; border: none; color: #fff; font-size: 22px; cursor: pointer; }

/* Нижнее меню */
.bottom-nav {
    position: fixed; bottom: 0; width: 100%; height: 75px;
    background: rgba(9, 9, 11, 0.95); display: flex; border-top: 1px solid rgba(255,255,255,0.05);
    padding-bottom: 10px; z-index: 60;
}
.nav-btn {
    flex: 1; background: none; border: none; color: var(--text-dim);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 4px; font-size: 11px; font-weight: 500; transition: 0.2s;
}
.nav-btn.active { color: var(--accent); }
.nav-icon { font-size: 20px; }

/* Полноэкранный плеер */
.full-player {
    position: fixed; inset: 0; background: var(--bg); z-index: 200;
    padding: 40px 30px; display: flex; flex-direction: column;
    animation: slideInFull 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes slideInFull { from { transform: translateY(100%); } to { transform: translateY(0); } }
.hidden { display: none !important; }
.close-btn { position: absolute; top: 20px; left: 20px; background: none; border: none; color: #fff; font-size: 24px; }
.fp-cover { width: 100%; aspect-ratio: 1/1; border-radius: 24px; background: linear-gradient(135deg, #3f3f46, #18181b); margin: 40px 0; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
.fp-info h2 { font-size: 24px; margin-bottom: 8px; }
.fp-info p { color: var(--accent); font-size: 18px; margin-bottom: 40px; }
.fp-controls { display: flex; justify-content: center; align-items: center; gap: 30px; margin-bottom: 40px; }
.fp-btn.main { width: 80px; height: 80px; border-radius: 50%; background: var(--accent); border: none; color: white; font-size: 30px; }
.fp-btn.secondary { background: none; border: none; color: white; font-size: 30px; opacity: 0.8; }
.btn-like { background: var(--card); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 15px; border-radius: 12px; width: 100%; font-size: 16px; font-weight: 600; }

/* Поиск */
.search-bar { margin-bottom: 20px; }
#search-input { width: 100%; background: var(--card); border: 1px solid rgba(255,255,255,0.1); padding: 15px 20px; border-radius: 12px; color: #fff; outline: none; font-size: 16px; transition: 0.3s; }
#search-input:focus { border-color: var(--accent); background: rgba(255,255,255,0.08); }
