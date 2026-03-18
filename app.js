/* ═══════════════════════════════════════════════════
   SOUNDWAVE  app.js  v4

   ЧАРТЫ  : iTunes RSS  +  Jamendo   (без ключей)
   ПОИСК  : Deezer API  +  Jamendo   (без ключей)
             SoundCloud Widget embed  (без ключей)
             YouTube iFrame API       (без ключей)

   Воспроизведение:
   - iTunes   → Audio() с 30-сек preview URL
   - Jamendo  → Audio() с полным mp3 стримом
   - Deezer   → Audio() с 30-сек preview URL
   - SoundCloud → невидимый SC Widget iframe
   - YouTube  → невидимый YT iframe Player
═══════════════════════════════════════════════════ */
'use strict';

/* ── API bases ── */
const ITUNES  = 'https://itunes.apple.com';
const JAMENDO = 'https://api.jamendo.com/v3.0';
const JM_CID  = '5d07db0e';
// Deezer requires CORS proxy because their API doesn't allow cross-origin browser requests
const DEEZER_PROXY = 'https://corsproxy.io/?url=https://api.deezer.com';

/* ── State ── */
const state = {
  source:        'itunes',   // charts source: 'itunes' | 'jamendo'
  currentTrack:  null,
  queue:         [],
  queueIndex:    -1,
  isPlaying:     false,
  isShuffle:     false,
  isRepeat:      false,
  library:       [],
  playlists:     [],
  charts:        [],
  searchResults: [],
  activeTab:     'charts',
  activeGenre:   'pop',
  audio:         new Audio(),
  searchTimer:   null,
  scWidget:      null,   // SoundCloud Widget instance
  ytPlayer:      null,   // YouTube Player instance
  ytReady:       false,
  currentDriver: 'audio', // 'audio' | 'sc' | 'yt'
};

/* ── Helpers ── */
const $   = id => document.getElementById(id);
const esc = s  => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function fmtMs(ms) { if(!ms||ms<=0)return''; const s=Math.floor(ms/1000); return`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
function fmtSec(s) { if(!s||isNaN(s))return'0:00'; return`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`; }

/* ── Persist ── */
function loadPersisted() {
  try {
    const lib=localStorage.getItem('sw4_lib'); if(lib)state.library=JSON.parse(lib);
    const pl=localStorage.getItem('sw4_pl');   if(pl)state.playlists=JSON.parse(pl);
  } catch(e){}
}
function savePersisted() {
  localStorage.setItem('sw4_lib',JSON.stringify(state.library));
  localStorage.setItem('sw4_pl', JSON.stringify(state.playlists));
}

/* ═══════════════════════════════════════════════════
   ── iTunes API ──────────────────────────────────
═══════════════════════════════════════════════════ */
const IT_GID = {pop:10,'hip-hop':18,rock:21,electronic:7,rnb:15,jazz:11,metal:1203,indie:1004};

async function iTunesSearch(term,limit=20) {
  const r=await fetch(`${ITUNES}/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=${limit}&explicit=no`);
  const d=await r.json();
  return (d.results||[]).map(normalizeIT);
}
async function iTunesCharts(genre,limit=25) {
  const gid=IT_GID[genre]||14;
  const r=await fetch(`${ITUNES}/us/rss/topsongs/limit=${limit}/genre=${gid}/json`);
  const d=await r.json();
  const raw=d?.feed?.entry||[];
  const basic=raw.map(e=>({
    trackId:'it_rss_'+(e.id?.attributes?.['im:id']||Math.random()),
    trackName:e['im:name']?.label||'Unknown',
    artistName:e['im:artist']?.label||'Unknown',
    artworkUrl:(e['im:image']?.[2]?.label||'').replace('170x170bb','600x600bb'),
    durationMs:0,previewUrl:null,source:'itunes',driver:'audio',
  }));
  const out=[];
  for(let i=0;i<basic.length;i+=5){
    const b=await Promise.all(basic.slice(i,i+5).map(enrichIT));
    out.push(...b);
  }
  return out;
}
async function enrichIT(t) {
  try {
    const r=await fetch(`${ITUNES}/search?term=${encodeURIComponent(t.artistName+' '+t.trackName)}&media=music&entity=song&limit=1&explicit=no`);
    const d=await r.json();
    const m=d.results?.[0];
    if(m){t.previewUrl=m.previewUrl||null;t.durationMs=m.trackTimeMillis||0;t.artworkUrl=(m.artworkUrl100||t.artworkUrl).replace('100x100bb','600x600bb').replace('100x100','600x600');t.trackId='it_'+m.trackId;}
  }catch(e){}
  return t;
}
function normalizeIT(r){
  return{trackId:'it_'+r.trackId,trackName:r.trackName||'Unknown',artistName:r.artistName||'Unknown',
    artworkUrl:(r.artworkUrl100||'').replace('100x100bb','600x600bb').replace('100x100','600x600'),
    durationMs:r.trackTimeMillis||0,previewUrl:r.previewUrl||null,source:'itunes',driver:'audio'};
}

/* ═══════════════════════════════════════════════════
   ── Jamendo API ─────────────────────────────────
   Full free tracks, no key needed beyond public client_id
═══════════════════════════════════════════════════ */
const JM_TAG={pop:'pop','hip-hop':'hip-hop',rock:'rock',electronic:'electronic',rnb:'rnb',jazz:'jazz',metal:'metal',indie:'indie'};

async function jamendoSearch(term,limit=20) {
  const r=await fetch(`${JAMENDO}/tracks/?client_id=${JM_CID}&format=json&limit=${limit}&search=${encodeURIComponent(term)}&audioformat=mp32&include=musicinfo`);
  const d=await r.json();
  return(d.results||[]).map(normalizeJM);
}
async function jamendoCharts(genre,limit=25) {
  const tag=JM_TAG[genre]||genre;
  const r=await fetch(`${JAMENDO}/tracks/?client_id=${JM_CID}&format=json&limit=${limit}&tags=${encodeURIComponent(tag)}&audioformat=mp32&order=popularity_total&include=musicinfo`);
  const d=await r.json();
  if(!d.results?.length)return jamendoSearch(tag+' music',limit);
  return d.results.map(normalizeJM);
}
function normalizeJM(t){
  return{trackId:'jm_'+t.id,trackName:t.name||'Unknown',artistName:t.artist_name||'Unknown',
    artworkUrl:(t.album_image||t.image||'').replace('1.200.jpg','1.500.jpg'),
    durationMs:(t.duration||0)*1000,previewUrl:t.audio||t.audiodownload||null,
    source:'jamendo',driver:'audio',shareUrl:t.shareurl||''};
}

/* ═══════════════════════════════════════════════════
   ── Deezer API (via CORS proxy) ─────────────────
   30-sec previews, huge catalog, no key
═══════════════════════════════════════════════════ */
async function deezerSearch(term,limit=20) {
  try {
    const r=await fetch(`${DEEZER_PROXY}/search?q=${encodeURIComponent(term)}&limit=${limit}`);
    const d=await r.json();
    return(d.data||[]).filter(t=>t.preview).map(normalizeDeezer);
  } catch(e){ console.warn('Deezer error:',e); return[]; }
}
function normalizeDeezer(t){
  return{
    trackId:'dz_'+t.id,
    trackName:t.title||'Unknown',
    artistName:t.artist?.name||'Unknown',
    artworkUrl:t.album?.cover_xl||t.album?.cover_big||t.album?.cover||'',
    durationMs:(t.duration||0)*1000,
    previewUrl:t.preview||null,   // 30-sec mp3, direct link
    source:'deezer',
    driver:'audio',
    deezerId:t.id,
  };
}

/* ═══════════════════════════════════════════════════
   ── SoundCloud Widget ───────────────────────────
   No API key. Uses SC embed iframes.
   Search via oEmbed can get track by URL;
   For search we use SC public search endpoint
   (works without key for basic search)
═══════════════════════════════════════════════════ */
async function scSearch(term,limit=10) {
  try {
    // SC public search (no auth, rate-limited but works for small queries)
    const url=`https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(term)}&limit=${limit}&client_id=iZIs9mchVcX5lhVRyQNGAu6XITa60A33`;
    const r=await fetch(url);
    if(!r.ok)throw new Error('SC search failed');
    const d=await r.json();
    return(d.collection||[]).filter(t=>t.media?.transcodings?.length||t.stream_url).map(normalizeSC);
  } catch(e){ console.warn('SC search failed:',e); return[]; }
}
function normalizeSC(t){
  // Use permalink_url for widget embed — no API key needed for the widget
  return{
    trackId:'sc_'+t.id,
    trackName:t.title||'Unknown',
    artistName:t.user?.username||'Unknown',
    artworkUrl:(t.artwork_url||t.user?.avatar_url||'').replace('-large','-t500x500'),
    durationMs:t.duration||0,
    previewUrl:null,        // SC plays via Widget, not Audio()
    scUrl:t.permalink_url||'',  // used by SC Widget
    source:'soundcloud',
    driver:'sc',
  };
}

/* SC Widget setup */
function initSCWidget() {
  // Create hidden SC iframe
  const iframe=document.createElement('iframe');
  iframe.id='sc-widget-iframe';
  iframe.allow='autoplay';
  iframe.src='https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/discover&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false';
  iframe.style.cssText='position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;top:-9999px;left:-9999px;';
  document.body.appendChild(iframe);

  // Load SC Widget API script
  if(!window.SC){
    const s=document.createElement('script');
    s.src='https://w.soundcloud.com/player/api.js';
    s.onload=()=>{
      state.scWidget=window.SC.Widget(iframe);
      state.scWidget.bind(window.SC.Widget.Events.PLAY,()=>{
        state.isPlaying=true;
        $('mini-player')?.classList.add('is-playing');
        updatePlayIcons();rerenderCards();
      });
      state.scWidget.bind(window.SC.Widget.Events.PAUSE,()=>{
        state.isPlaying=false;
        $('mini-player')?.classList.remove('is-playing');
        updatePlayIcons();rerenderCards();
      });
      state.scWidget.bind(window.SC.Widget.Events.FINISH,()=>{
        if(state.isRepeat)state.scWidget.seekTo(0);
        else playNext();
      });
      state.scWidget.bind(window.SC.Widget.Events.PLAY_PROGRESS,data=>{
        if(!data.loadedProgress)return;
        const pct=(data.relativePosition||0)*100;
        const mpf=$('mini-progress-fill'),fpf=$('fp-progress-fill');
        if(mpf)mpf.style.width=pct+'%';
        if(fpf)fpf.style.width=pct+'%';
        const fpc=$('fp-current'),fpd=$('fp-duration');
        if(fpc)fpc.textContent=fmtMs(data.currentPosition);
        if(fpd&&state.currentTrack)fpd.textContent=fmtMs(state.currentTrack.durationMs);
      });
    };
    document.head.appendChild(s);
  }
}

function playSCTrack(track) {
  if(!state.scWidget||!track.scUrl){
    showToast('SoundCloud виджет ещё загружается...');
    return;
  }
  state.currentDriver='sc';
  state.audio.pause();
  state.scWidget.load(track.scUrl,{
    auto_play:true,
    hide_related:true,
    show_comments:false,
    show_user:false,
    show_reposts:false,
    visual:false,
  });
  state.isPlaying=true;
  updatePlayIcons();
}

/* ═══════════════════════════════════════════════════
   ── YouTube iFrame API ──────────────────────────
   Search via YouTube Data API v3 — needs key BUT
   we can use a public invidious instance as proxy
═══════════════════════════════════════════════════ */
const INVIDIOUS = 'https://inv.nadeko.net'; // public Invidious instance

async function ytSearch(term,limit=10) {
  try {
    const r=await fetch(`${INVIDIOUS}/api/v1/search?q=${encodeURIComponent(term)}&type=video&fields=videoId,title,author,lengthSeconds,videoThumbnails`);
    if(!r.ok)throw new Error('YT search failed');
    const d=await r.json();
    return(d||[]).slice(0,limit).map(normalizeYT);
  } catch(e){ console.warn('YT search failed:',e); return[]; }
}
function normalizeYT(v){
  const thumb=(v.videoThumbnails||[]).find(t=>t.quality==='medium')||v.videoThumbnails?.[0];
  return{
    trackId:'yt_'+v.videoId,
    trackName:v.title||'Unknown',
    artistName:v.author||'Unknown',
    artworkUrl:thumb?.url||`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
    durationMs:(v.lengthSeconds||0)*1000,
    previewUrl:null,
    ytId:v.videoId,
    source:'youtube',
    driver:'yt',
  };
}

function initYTPlayer() {
  if(window.YT&&window.YT.Player){setupYTPlayer();return;}
  const s=document.createElement('script');
  s.src='https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
  window.onYouTubeIframeAPIReady=setupYTPlayer;
}
function setupYTPlayer() {
  const div=document.createElement('div');
  div.id='yt-player-div';
  div.style.cssText='position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;top:-9999px;left:-9999px;';
  document.body.appendChild(div);
  state.ytPlayer=new window.YT.Player('yt-player-div',{
    height:'1',width:'1',
    playerVars:{autoplay:0,controls:0,playsinline:1},
    events:{
      onReady:()=>{ state.ytReady=true; },
      onStateChange:(e)=>{
        const YTS=window.YT.PlayerState;
        if(e.data===YTS.PLAYING){
          state.isPlaying=true;
          $('mini-player')?.classList.add('is-playing');
          updatePlayIcons();rerenderCards();
          // start progress polling
          startYTProgress();
        } else if(e.data===YTS.PAUSED||e.data===YTS.ENDED){
          state.isPlaying=false;
          $('mini-player')?.classList.remove('is-playing');
          updatePlayIcons();rerenderCards();
          if(e.data===YTS.ENDED){
            if(state.isRepeat)state.ytPlayer.seekTo(0);
            else playNext();
          }
        }
      },
      onError:()=>showToast('YouTube: ошибка воспроизведения'),
    }
  });
}

let _ytProgressInterval=null;
function startYTProgress() {
  clearInterval(_ytProgressInterval);
  _ytProgressInterval=setInterval(()=>{
    if(!state.ytPlayer||state.currentDriver!=='yt')return;
    const cur=state.ytPlayer.getCurrentTime?.()||0;
    const dur=state.ytPlayer.getDuration?.()||0;
    if(!dur)return;
    const pct=(cur/dur)*100;
    const mpf=$('mini-progress-fill'),fpf=$('fp-progress-fill');
    if(mpf)mpf.style.width=pct+'%';
    if(fpf)fpf.style.width=pct+'%';
    const fpc=$('fp-current'),fpd=$('fp-duration');
    if(fpc)fpc.textContent=fmtSec(cur);
    if(fpd)fpd.textContent=fmtSec(dur);
  },500);
}

function playYTTrack(track) {
  if(!state.ytReady){
    showToast('YouTube плеер ещё загружается...');
    return;
  }
  state.currentDriver='yt';
  state.audio.pause();
  if(state.scWidget) try{state.scWidget.pause();}catch(e){}
  state.ytPlayer.loadVideoById(track.ytId);
  state.isPlaying=true;
  updatePlayIcons();
}

/* ═══════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded',()=>{
  loadPersisted();
  initSourceToggle();
  initTabs();
  initMiniPlayer();
  initFullPlayer();
  initSearch();
  initGenreChips();
  initPlaylists();
  initButtons();
  initTheme();
  initAudio();
  initSCWidget();
  initYTPlayer();
  loadCharts('pop');
  updateTabIndicator();
  renderLibrary();
  renderPlaylists();
});

/* ── Source toggle (charts) ── */
function initSourceToggle() {
  $('src-itunes').addEventListener('click', ()=>setSource('itunes'));
  $('src-jamendo').addEventListener('click',()=>setSource('jamendo'));
}
function setSource(src) {
  if(state.source===src)return;
  state.source=src;
  $('src-itunes').classList.toggle('active',src==='itunes');
  $('src-jamendo').classList.toggle('active',src==='jamendo');
  loadCharts(state.activeGenre);
}

/* ── Tabs ── */
function initTabs() {
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>switchTab(t.dataset.tab)));
}
function switchTab(name) {
  if(state.activeTab===name)return;
  const prev=document.querySelector('.page.active');
  if(prev){prev.classList.remove('active');prev.classList.add('exit-left');setTimeout(()=>prev.classList.remove('exit-left'),340);}
  state.activeTab=name;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));
  const next=$('page-'+name);
  if(next){next.style.transform='translateX(22px)';requestAnimationFrame(()=>next.classList.add('active'));}
  updateTabIndicator();
}
function updateTabIndicator() {
  const at=document.querySelector('.tab.active'),bar=$('tab-bar');if(!at||!bar)return;
  const tr=at.getBoundingClientRect(),br=bar.getBoundingClientRect();
  $('tab-indicator').style.left=(tr.left-br.left)+'px';$('tab-indicator').style.width=tr.width+'px';
}
window.addEventListener('resize',updateTabIndicator);

/* ── Genre chips ── */
function initGenreChips() {
  $('genre-chips').addEventListener('click',e=>{
    const chip=e.target.closest('.chip');if(!chip)return;
    document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');state.activeGenre=chip.dataset.genre;
    loadCharts(chip.dataset.genre);
  });
}

/* ── Load charts ── */
async function loadCharts(genre) {
  const el=$('charts-list');
  el.innerHTML='<div class="loading-state"><div class="loader"></div><p>Загружаем чарты…</p></div>';
  try {
    const tracks=state.source==='jamendo'?await jamendoCharts(genre,25):await iTunesCharts(genre,25);
    state.charts=tracks;
    renderTrackList(el,tracks,'charts');
  } catch(e) {
    console.error(e);
    el.innerHTML=`<div class="empty-state"><div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><p class="empty-title">Ошибка загрузки</p><p class="empty-sub">Проверьте интернет-соединение</p></div>`;
  }
}

/* ═══════════════════════════════════════════════════
   SEARCH — Deezer + Jamendo + SoundCloud + YouTube
═══════════════════════════════════════════════════ */
function initSearch() {
  const inp=$('search-input'),clr=$('search-clear');
  inp.addEventListener('input',()=>{
    const v=inp.value.trim();
    clr.classList.toggle('visible',v.length>0);
    clearTimeout(state.searchTimer);
    if(!v){showSearchHint();return;}
    $('search-results').innerHTML='<div class="loading-state"><div class="loader"></div><p>Ищем во всех источниках…</p></div>';
    state.searchTimer=setTimeout(()=>doSearch(v),500);
  });
  clr.addEventListener('click',()=>{inp.value='';clr.classList.remove('visible');showSearchHint();inp.focus();});
}

async function doSearch(term) {
  const res=$('search-results');
  res.innerHTML='<div class="loading-state"><div class="loader"></div><p>Ищем во всех источниках…</p></div>';
  try {
    // Run all searches in parallel
    const [dzTracks,jmTracks,scTracks,ytTracks]=await Promise.allSettled([
      deezerSearch(term,15),
      jamendoSearch(term,10),
      scSearch(term,8),
      ytSearch(term,8),
    ]);

    const dz = dzTracks.status==='fulfilled' ? dzTracks.value : [];
    const jm = jmTracks.status==='fulfilled' ? jmTracks.value : [];
    const sc = scTracks.status==='fulfilled' ? scTracks.value : [];
    const yt = ytTracks.status==='fulfilled' ? ytTracks.value : [];

    // Interleave results: Deezer first (biggest catalog), then Jamendo (full tracks), then SC, then YT
    const all=[];
    const maxLen=Math.max(dz.length,jm.length,sc.length,yt.length);
    for(let i=0;i<maxLen;i++){
      if(i<dz.length)all.push(dz[i]);
      if(i<jm.length)all.push(jm[i]);
      if(i<sc.length)all.push(sc[i]);
      if(i<yt.length)all.push(yt[i]);
    }

    state.searchResults=all;

    if(!all.length){
      res.innerHTML='<div class="empty-state"><p class="empty-title">Ничего не найдено</p><p class="empty-sub">Попробуйте другой запрос</p></div>';
      return;
    }

    // Show source stats
    const stats=[];
    if(dz.length)stats.push(`Deezer: ${dz.length}`);
    if(jm.length)stats.push(`Jamendo: ${jm.length}`);
    if(sc.length)stats.push(`SoundCloud: ${sc.length}`);
    if(yt.length)stats.push(`YouTube: ${yt.length}`);

    res.innerHTML=`<p class="search-stats">${stats.join(' · ')}</p>`;
    all.forEach((t,i)=>res.appendChild(buildCard(t,i,'search')));

  } catch(e) {
    console.error(e);
    res.innerHTML='<div class="empty-state"><p class="empty-title">Ошибка поиска</p><p class="empty-sub">Проверьте интернет-соединение</p></div>';
  }
}

function showSearchHint() {
  $('search-results').innerHTML=`
    <div class="search-sources-hint">
      <p class="hint-title">Поиск по всем источникам</p>
      <div class="hint-sources">
        <div class="hint-src dz"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.81 11.62l.02 3.74-11.29.02-.01-3.74zm-5.66-3.36l.02 3.74-5.63.01-.01-3.74zm-5.66 0v3.74H2.42v-3.74zm11.31 0v3.74h-5.64v-3.74zm0-3.36v3.74h-5.64V4.9zm-5.65 6.72v3.74H7.52v-3.74zm0 3.36v3.74H7.52v-3.74zM21.58 8.26v3.74h-2.77V8.26z"/></svg> Deezer</div>
        <div class="hint-src jm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> Jamendo</div>
        <div class="hint-src sc"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.56 8.87V17h8.76l1.04-4.07-1.04-4.06c-1.55-.08-2.96.43-4.05 1.34-.3-2.63-2.52-4.67-5.22-4.67-.74 0-1.44.16-2.08.44.87.54 1.6 1.26 2.11 2.14.29-.12.6-.18.93-.18.06 0 .11 0 .17.01-.41.59-.63 1.3-.63 2.07h.01z"/></svg> SoundCloud</div>
        <div class="hint-src yt"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.5v-7l6.25 3.5-6.25 3.5z"/></svg> YouTube</div>
      </div>
      <p class="hint-sub">Введите название трека или исполнителя</p>
    </div>`;
}

/* ═══════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════ */
function renderTrackList(container,tracks,context) {
  if(!tracks?.length){container.innerHTML='<div class="empty-state"><p class="empty-title">Ничего не найдено</p></div>';return;}
  container.innerHTML='';
  tracks.forEach((t,i)=>container.appendChild(buildCard(t,i,context)));
}

const FALLBACK_ART="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='52' height='52'%3E%3Crect width='52' height='52' rx='12' fill='%231b1e31'/%3E%3Cpath d='M26 18v9M22 32a4 4 0 1 0 8 0 4 4 0 0 0-8 0' stroke='%23475569' stroke-width='1.5' stroke-linecap='round' fill='none'/%3E%3C/svg%3E";

const SOURCE_META={
  itunes:  {cls:'itl',label:'iTunes',   color:'var(--acc)'},
  jamendo: {cls:'jm', label:'Jamendo',  color:'#10b981'},
  deezer:  {cls:'dz', label:'Deezer',   color:'#a855f7'},
  soundcloud:{cls:'sc',label:'SoundCloud',color:'#f97316'},
  youtube: {cls:'yt', label:'YouTube',  color:'#ef4444'},
};

function buildCard(track,index,context) {
  const playing=state.currentTrack?.trackId===track.trackId&&state.isPlaying;
  const liked=state.library.some(t=>t.trackId===track.trackId);
  const dur=fmtMs(track.durationMs);
  const sm=SOURCE_META[track.source]||SOURCE_META.itunes;

  const div=document.createElement('div');
  div.className='track-card'+(playing?' is-playing':'');
  div.dataset.trackId=track.trackId;
  div.style.animationDelay=Math.min(index*0.035,0.7)+'s';

  div.innerHTML=`
    <span class="track-rank">${index+1}</span>
    <div class="track-art-wrap">
      <img class="track-art" src="${esc(track.artworkUrl)||FALLBACK_ART}" alt="" loading="lazy" onerror="this.src='${FALLBACK_ART}'"/>
      <div class="art-ring"></div>
      <div class="playing-bars"><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div></div>
    </div>
    <div class="track-info">
      <p class="track-name">${esc(track.trackName)}</p>
      <p class="track-artist">${esc(track.artistName)} <span class="src-tag ${sm.cls}">${sm.label}</span></p>
    </div>
    ${dur?`<span class="track-duration">${dur}</span>`:''}
    <div class="track-actions">
      <button class="track-btn like-btn${liked?' liked':''}" title="В библиотеку">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
      <button class="track-btn add-pl-btn" title="В плейлист">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>`;

  div.addEventListener('click',e=>{
    if(e.target.closest('.track-actions'))return;
    playFromList(listByCtx(context),index);
  });
  div.querySelector('.like-btn').addEventListener('click',e=>{e.stopPropagation();toggleLike(track);rerenderCards();});
  div.querySelector('.add-pl-btn').addEventListener('click',e=>{e.stopPropagation();openAddToPlaylist(track);});
  return div;
}

function listByCtx(ctx) {
  if(ctx==='charts')return state.charts;
  if(ctx==='library')return state.library;
  if(ctx==='search')return state.searchResults;
  if(ctx?.startsWith('playlist:'))return state.playlists.find(p=>p.id===ctx.split(':')[1])?.tracks||[];
  return[];
}

function rerenderCards() {
  document.querySelectorAll('.track-card').forEach(card=>{
    const tid=card.dataset.trackId;
    const liked=state.library.some(t=>t.trackId===tid);
    const playing=state.currentTrack?.trackId===tid&&state.isPlaying;
    card.classList.toggle('is-playing',!!playing);
    const btn=card.querySelector('.like-btn');
    if(btn){btn.classList.toggle('liked',liked);const svg=btn.querySelector('svg');if(svg)svg.setAttribute('fill',liked?'currentColor':'none');}
  });
  updateMiniLike();updateFpLike();
}

/* ═══════════════════════════════════════════════════
   PLAYBACK  — routes to correct driver
═══════════════════════════════════════════════════ */
function playFromList(list,index) {
  if(!list?.length)return;
  state.queue=[...list];state.queueIndex=index;
  playTrack(state.queue[index]);
}

function playTrack(track) {
  if(!track)return;
  state.currentTrack=track;

  // Stop all players
  state.audio.pause();
  if(state.scWidget)try{state.scWidget.pause();}catch(e){}
  if(state.ytPlayer&&state.ytReady)try{state.ytPlayer.stopVideo();}catch(e){}
  clearInterval(_ytProgressInterval);

  if(track.driver==='sc'){
    playSCTrack(track);
  } else if(track.driver==='yt'){
    playYTTrack(track);
  } else {
    // audio driver (iTunes, Jamendo, Deezer)
    state.currentDriver='audio';
    if(track.previewUrl){
      state.audio.src=track.previewUrl;
      state.audio.volume=($('fp-volume')?.value||80)/100;
      state.audio.play().catch(()=>showToast('Не удалось воспроизвести'));
      state.isPlaying=true;
    } else {
      state.audio.src='';state.isPlaying=false;
      showToast('Нет аудио для этого трека');
    }
  }

  updateMiniPlayer();updateFullPlayer();updatePlayIcons();rerenderCards();
  const mp=$('mini-player');mp.classList.remove('hidden');requestAnimationFrame(()=>mp.classList.add('visible'));
}

function togglePlay() {
  if(!state.currentTrack)return;
  if(state.currentDriver==='sc'&&state.scWidget){
    state.scWidget.toggle();return;
  }
  if(state.currentDriver==='yt'&&state.ytPlayer&&state.ytReady){
    const YTS=window.YT?.PlayerState;
    if(state.ytPlayer.getPlayerState?.()===YTS?.PLAYING)state.ytPlayer.pauseVideo();
    else state.ytPlayer.playVideo();
    return;
  }
  if(state.audio.paused){state.audio.play().catch(()=>{});state.isPlaying=true;}
  else{state.audio.pause();state.isPlaying=false;}
  updatePlayIcons();rerenderCards();
}

function playNext() {
  if(!state.queue.length)return;
  const n=state.isShuffle?Math.floor(Math.random()*state.queue.length):(state.queueIndex+1)%state.queue.length;
  state.queueIndex=n;playTrack(state.queue[n]);
}
function playPrev() {
  if(!state.queue.length)return;
  const getCurrent=()=>{
    if(state.currentDriver==='audio')return state.audio.currentTime;
    if(state.currentDriver==='yt'&&state.ytPlayer)return state.ytPlayer.getCurrentTime?.()||0;
    return 0;
  };
  if(getCurrent()>3){
    if(state.currentDriver==='audio')state.audio.currentTime=0;
    else if(state.currentDriver==='yt'&&state.ytPlayer)state.ytPlayer.seekTo(0);
    return;
  }
  const p=(state.queueIndex-1+state.queue.length)%state.queue.length;
  state.queueIndex=p;playTrack(state.queue[p]);
}

/* ── Audio (HTML5) events ── */
function initAudio() {
  const a=state.audio;
  a.addEventListener('timeupdate',()=>{
    if(!a.duration||state.currentDriver!=='audio')return;
    const pct=(a.currentTime/a.duration)*100;
    const mpf=$('mini-progress-fill'),fpf=$('fp-progress-fill');
    if(mpf)mpf.style.width=pct+'%';if(fpf)fpf.style.width=pct+'%';
    const fpc=$('fp-current'),fpd=$('fp-duration');
    if(fpc)fpc.textContent=fmtSec(a.currentTime);
    if(fpd)fpd.textContent=fmtSec(a.duration);
  });
  a.addEventListener('loadedmetadata',()=>{
    const fpd=$('fp-duration');if(fpd&&a.duration)fpd.textContent=fmtSec(a.duration);
    if(state.currentTrack&&!state.currentTrack.durationMs&&a.duration)state.currentTrack.durationMs=a.duration*1000;
  });
  a.addEventListener('ended',()=>{if(state.currentDriver!=='audio')return;if(state.isRepeat){a.currentTime=0;a.play().catch(()=>{});}else playNext();});
  a.addEventListener('play', ()=>{if(state.currentDriver!=='audio')return;state.isPlaying=true; $('mini-player')?.classList.add('is-playing');   updatePlayIcons();rerenderCards();});
  a.addEventListener('pause',()=>{if(state.currentDriver!=='audio')return;state.isPlaying=false;$('mini-player')?.classList.remove('is-playing');updatePlayIcons();rerenderCards();});
  a.addEventListener('error',()=>{showToast('Ошибка воспроизведения');state.isPlaying=false;updatePlayIcons();});
}

const PLAY_SVG ='<polygon points="5 3 19 12 5 21 5 3"/>';
const PAUSE_SVG='<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
function updatePlayIcons(){const h=state.isPlaying?PAUSE_SVG:PLAY_SVG;const mi=$('mini-play-icon'),fpi=$('fp-play-icon');if(mi)mi.innerHTML=h;if(fpi)fpi.innerHTML=h;}

/* ── Mini player ── */
function initMiniPlayer(){
  $('mini-play').addEventListener('click',togglePlay);
  $('mini-next').addEventListener('click',playNext);
  $('mini-prev').addEventListener('click',playPrev);
  $('mini-open-player').addEventListener('click',openFullPlayer);
  $('mini-like').addEventListener('click',()=>{if(state.currentTrack){toggleLike(state.currentTrack);rerenderCards();}});
}
function updateMiniPlayer(){
  const t=state.currentTrack;if(!t)return;
  const ma=$('mini-art'),mt=$('mini-title'),mar=$('mini-artist');
  if(ma)ma.src=t.artworkUrl||'';if(mt)mt.textContent=t.trackName||'—';if(mar)mar.textContent=t.artistName||'—';
  updateMiniLike();
}
function updateMiniLike(){
  const btn=$('mini-like');if(!btn||!state.currentTrack)return;
  const liked=state.library.some(t=>t.trackId===state.currentTrack.trackId);
  btn.classList.toggle('liked',liked);
  const svg=btn.querySelector('svg');if(svg)svg.setAttribute('fill',liked?'currentColor':'none');
}

/* ── Full player ── */
function initFullPlayer(){
  $('fp-close').addEventListener('click',closeFullPlayer);
  $('fp-play').addEventListener('click',togglePlay);
  $('fp-next').addEventListener('click',playNext);
  $('fp-prev').addEventListener('click',playPrev);
  $('fp-like').addEventListener('click',()=>{if(state.currentTrack){toggleLike(state.currentTrack);rerenderCards();}});
  $('fp-shuffle').addEventListener('click',()=>{state.isShuffle=!state.isShuffle;$('fp-shuffle').classList.toggle('active',state.isShuffle);showToast(state.isShuffle?'Перемешивание включено':'Перемешивание выключено');});
  $('fp-repeat').addEventListener('click',()=>{state.isRepeat=!state.isRepeat;$('fp-repeat').classList.toggle('active',state.isRepeat);showToast(state.isRepeat?'Повтор включён':'Повтор выключен');});
  $('fp-progress-track').addEventListener('click',e=>{
    if(state.currentDriver==='audio'&&!state.audio.duration)return;
    if(state.currentDriver==='yt'&&(!state.ytPlayer||!state.ytReady))return;
    const r=$('fp-progress-track').getBoundingClientRect();
    const pct=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
    if(state.currentDriver==='audio')state.audio.currentTime=pct*state.audio.duration;
    else if(state.currentDriver==='yt')state.ytPlayer.seekTo(pct*(state.ytPlayer.getDuration?.())||0);
    else if(state.currentDriver==='sc'&&state.scWidget)state.scWidget.getDuration(d=>state.scWidget.seekTo(pct*d));
  });
  $('fp-volume').addEventListener('input',()=>{
    const v=$('fp-volume').value/100;
    state.audio.volume=v;
    if(state.scWidget)try{state.scWidget.setVolume($('fp-volume').value);}catch(e){}
    if(state.ytPlayer&&state.ytReady)try{state.ytPlayer.setVolume($('fp-volume').value);}catch(e){}
  });
  $('fp-bg-blur').addEventListener('click',closeFullPlayer);
}
function openFullPlayer(){
  const fp=$('full-player');fp.classList.remove('hidden');
  requestAnimationFrame(()=>{fp.classList.add('entering');requestAnimationFrame(()=>{fp.classList.remove('entering');fp.classList.add('entered');});});
  updateFullPlayer();
}
function closeFullPlayer(){
  const fp=$('full-player');fp.classList.remove('entered');fp.classList.add('entering');
  setTimeout(()=>{fp.classList.remove('entering');fp.classList.add('hidden');},400);
}
function updateFullPlayer(){
  const t=state.currentTrack;if(!t)return;
  $('fp-art').src=t.artworkUrl||'';
  $('fp-title').textContent=t.trackName||'—';
  $('fp-artist').textContent=t.artistName||'—';
  const sm=SOURCE_META[t.source]||SOURCE_META.itunes;
  const badge=$('fp-source-badge');
  if(badge){
    const labels={itunes:'iTunes — 30-сек превью',jamendo:'Jamendo — полный трек',deezer:'Deezer — 30-сек превью',soundcloud:'SoundCloud — полный трек',youtube:'YouTube — полный трек'};
    badge.textContent=labels[t.source]||t.source;
    badge.className='fp-source-badge '+sm.cls;
  }
  const glow=$('fp-art-glow');if(glow)glow.style.background=sm.color;
  const fpd=$('fp-duration');if(fpd&&t.durationMs)fpd.textContent=fmtMs(t.durationMs);
  updateFpLike();
}
function updateFpLike(){
  const btn=$('fp-like');if(!btn||!state.currentTrack)return;
  const liked=state.library.some(t=>t.trackId===state.currentTrack.trackId);
  btn.classList.toggle('liked',liked);
  const svg=btn.querySelector('svg');if(svg)svg.setAttribute('fill',liked?'currentColor':'none');
}

/* ── Library ── */
function toggleLike(track){
  const idx=state.library.findIndex(t=>t.trackId===track.trackId);
  if(idx>-1){state.library.splice(idx,1);showToast('Удалено из библиотеки');}
  else{state.library.unshift({...track});showToast('Добавлено в библиотеку');}
  savePersisted();renderLibrary();
}
function renderLibrary(){
  const el=$('library-list');if(!el)return;
  if(!state.library.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div><p class="empty-title">Библиотека пуста</p><p class="empty-sub">Найдите треки и добавьте через иконку сердца</p></div>`;return;}
  renderTrackList(el,state.library,'library');
}

/* ── Playlists ── */
function initPlaylists(){
  $('btn-new-playlist').addEventListener('click',openPlaylistModal);
  $('playlist-cancel').addEventListener('click',closePlaylistModal);
  $('playlist-modal-overlay').addEventListener('click',closePlaylistModal);
  $('playlist-create').addEventListener('click',createPlaylist);
  $('playlist-name-input').addEventListener('keydown',e=>{if(e.key==='Enter')createPlaylist();});
  $('add-playlist-cancel').addEventListener('click',closeAddModal);
  $('add-playlist-overlay').addEventListener('click',closeAddModal);
}
function openPlaylistModal(){$('playlist-modal').classList.remove('hidden');setTimeout(()=>$('playlist-name-input').focus(),50);}
function closePlaylistModal(){$('playlist-modal').classList.add('hidden');$('playlist-name-input').value='';}
function createPlaylist(){const name=$('playlist-name-input').value.trim();if(!name)return;state.playlists.unshift({id:'pl_'+Date.now(),name,tracks:[]});savePersisted();renderPlaylists();closePlaylistModal();showToast('Плейлист создан');}
function renderPlaylists(){
  const grid=$('playlists-grid');if(!grid)return;
  if(!state.playlists.length){grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></div><p class="empty-title">Нет плейлистов</p><p class="empty-sub">Нажмите + чтобы создать плейлист</p></div>`;return;}
  grid.innerHTML='';state.playlists.forEach((pl,i)=>grid.appendChild(buildPlCard(pl,i)));
}
function buildPlCard(pl,i){
  const div=document.createElement('div');div.className='playlist-card';div.style.animationDelay=(i*0.06)+'s';
  let cover='';
  if(pl.tracks.length>=4)cover=`<div class="playlist-cover-grid">${pl.tracks.slice(0,4).map(t=>`<img src="${esc(t.artworkUrl||'')}" alt="" onerror="this.style.background='var(--s3)'">`).join('')}</div>`;
  else if(pl.tracks.length)cover=`<img class="playlist-cover" src="${esc(pl.tracks[0].artworkUrl||'')}" alt="" onerror="this.style.background='var(--s3)'"/>`;
  else cover=`<div class="playlist-cover-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`;
  div.innerHTML=`${cover}<div class="playlist-info"><p class="playlist-name">${esc(pl.name)}</p><p class="playlist-count">${pl.tracks.length} треков</p></div>`;
  div.addEventListener('click',()=>openPlaylistDetail(pl));return div;
}
function openPlaylistDetail(pl){
  const page=$('page-playlists');
  page.innerHTML=`<div class="page-title-row" style="margin-bottom:18px"><div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0"><button class="icon-btn" id="pl-back"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button><h1 class="page-title" style="margin-bottom:0;font-size:28px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(pl.name)}</h1></div></div><div class="action-row"><button class="btn-primary" id="pl-play"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>Воспроизвести</button><button class="btn-secondary" id="pl-shuffle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>Перемешать</button></div><div id="pl-track-list"></div>`;
  renderTrackList($('pl-track-list'),pl.tracks,'playlist:'+pl.id);
  $('pl-back').addEventListener('click',()=>{page.innerHTML=`<div class="page-title-row"><h1 class="page-title">ПЛЕЙ<span class="accent">ЛИСТЫ</span></h1><button class="icon-btn" id="btn-new-playlist"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button></div><div id="playlists-grid"></div>`;$('btn-new-playlist').addEventListener('click',openPlaylistModal);renderPlaylists();});
  $('pl-play').addEventListener('click',()=>playFromList(pl.tracks,0));
  $('pl-shuffle').addEventListener('click',()=>{if(!pl.tracks.length)return;playFromList(pl.tracks,Math.floor(Math.random()*pl.tracks.length));});
}
function openAddToPlaylist(track){
  const list=$('add-playlist-list');
  if(!state.playlists.length){showToast('Сначала создайте плейлист');return;}
  list.innerHTML='';
  state.playlists.forEach(pl=>{
    const item=document.createElement('div');item.className='add-pl-item';
    const art=pl.tracks[0]?.artworkUrl||'';
    item.innerHTML=`<img class="add-pl-item-cover" src="${esc(art)}" alt="" onerror="this.style.background='var(--s3)'"/><span class="add-pl-item-name">${esc(pl.name)}</span><span class="add-pl-item-count">${pl.tracks.length} тр.</span>`;
    item.addEventListener('click',()=>{
      if(pl.tracks.some(t=>t.trackId===track.trackId)){showToast('Уже в этом плейлисте');}
      else{pl.tracks.push({...track});savePersisted();showToast(`Добавлено в "${pl.name}"`);renderPlaylists();}
      closeAddModal();
    });
    list.appendChild(item);
  });
  $('add-playlist-modal').classList.remove('hidden');
}
function closeAddModal(){$('add-playlist-modal').classList.add('hidden');}

/* ── Buttons / theme / toast ── */
function initButtons(){
  $('charts-play-all').addEventListener('click',()=>{if(state.charts.length)playFromList(state.charts,0);});
  $('charts-shuffle').addEventListener('click',()=>{if(!state.charts.length)return;state.isShuffle=true;playFromList(state.charts,Math.floor(Math.random()*state.charts.length));});
  $('library-play-all').addEventListener('click',()=>{if(state.library.length)playFromList(state.library,0);});
  $('library-shuffle').addEventListener('click',()=>{if(!state.library.length)return;playFromList(state.library,Math.floor(Math.random()*state.library.length));});
}
function initTheme(){$('btn-theme').addEventListener('click',()=>{document.body.classList.toggle('light');showToast(document.body.classList.contains('light')?'Светлая тема':'Тёмная тема');});}
let _tt=null;
function showToast(msg){const el=$('toast');el.textContent=msg;el.classList.remove('hidden');el.classList.add('show');clearTimeout(_tt);_tt=setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.classList.add('hidden'),320);},2400);}
