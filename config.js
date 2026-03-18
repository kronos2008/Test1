// ==================== КОНФИГУРАЦИЯ ====================
const CONFIG = {
    // Данные для авторизации в Яндекс.Музыке
    YANDEX: {
        // OAuth токен (как получить написано ниже)
        TOKEN: 'y0__xCkjIXbCBje-AYg8sar5BbAxLyLqPrtSMLg7-n6xb3qh4tByw',
        
        // Клиент ID от официального приложения (менять не нужно)
        CLIENT_ID: '23cabbbdc6cd418abb4b39c32c41195d',
        CLIENT_SECRET: '53bc75238f0c4d08a118e51fe9203300'
    },
    
    // Настройки приложения
    APP_NAME: 'SoundPlay',
    USERS_COUNT: '19,135'
};

// ==================== КАК ПОЛУЧИТЬ ТОКЕН ====================
/*
Самый простой способ через браузер:
1. Открой ссылку: https://oauth.yandex.ru/authorize?response_type=token&client_id=23cabbbdc6cd418abb4b39c32c41195d
2. Авторизуйся и разреши доступ
3. СРАЗУ после редиректа посмотри в адресную строку - там будет #access_token=...
4. Скопируй токен (то что после access_token= до &token_type)

ИЛИ через консоль браузера выполни:
window.location.hash.substring(1).split('&')[0].split('=')[1]
*/