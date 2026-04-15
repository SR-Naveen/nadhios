/* ═══════════════════════════════════════════════════════
   NaDhi OS — Mobile Production Build (Supabase Edition)
═══════════════════════════════════════════════════════ */

// ─── SUPABASE CONFIGURATION ──────────────────────────────
const supabaseUrl = 'https://odgoairxkxlaxnitfmnn.supabase.co';
const supabaseKey = 'sb_publishable_zzW3MwTSnz-cAkVJvRzUhw_oxMXrVde';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// ─── CONFIG & STATE ──────────────────────────────────────
let sysSettings = JSON.parse(localStorage.getItem('nadhi_settings') || 'null');
if (!sysSettings) {
  sysSettings = {
    volume:1.0, speed:0.9,
    theme: window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light',
    tone:'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
    sfxEnabled:true
  };
}
window.sysSettings = sysSettings;

let savedEvents      = [];
let editingEventId   = null;
let activeAlarmEventId = null;
let currentRadarView = 'list';
let historyDisplayLimit = 20;
let pwaPrompt        = null;
let calMonth         = new Date();
let customPresets    = JSON.parse(localStorage.getItem('nadhi_custom_presets') || '[]');

let alarmSound = new Audio(sysSettings.tone);
alarmSound.loop = true;
window.alarmSound = alarmSound;

// ─── FETCH DATA FROM SUPABASE ────────────────────────────
window.fetchFromSupabase = async function() {
    const { data, error } = await supabaseClient
        .from('protocols')
        .select('*')
        .order('timestamp', { ascending: true }); 

    if (error) {
        console.error("Fetch Error:", error);
    } else {
        savedEvents = data.map(item => ({
             ...item,
             createdAt: item.created_at, 
             rawDate: item.raw_date,
             rawTime: item.raw_time,
             isNotified: item.is_notified,
             isArchived: item.is_archived
        }));
        renderViews();      
        updateNavBadges();  
    }
};

// Start aagum pothu fetch panrom
fetchFromSupabase();

// ─── AUDIO ENGINE ────────────────────────────────────────
let _actx = null;
function initAudioCtx() {
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  if (_actx.state === 'suspended') _actx.resume();
}
function playTone(freq, type, duration, vol = 0.08) {
  if (!sysSettings.sfxEnabled) return;
  initAudioCtx();
  const osc = _actx.createOscillator(), g = _actx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, _actx.currentTime);
  g.gain.setValueAtTime(vol * sysSettings.volume, _actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, _actx.currentTime + duration);
  osc.connect(g); g.connect(_actx.destination);
  osc.start(); osc.stop(_actx.currentTime + duration);
}
window.playHoverSFX  = ()=>playTone(600,'sine',0.05,0.05);
window.playClickSFX  = ()=>playTone(800,'sine',0.1,0.09);
window.playSwitchSFX = ()=>{playTone(300,'triangle',0.14,0.14);setTimeout(()=>playTone(420,'triangle',0.1,0.1),50)};
window.playSuccessSFX= ()=>{playTone(400,'sine',0.1,0.13);setTimeout(()=>playTone(600,'sine',0.13,0.13),100);setTimeout(()=>playTone(1000,'sine',0.16,0.13),250)};
window.playErrorSFX  = ()=>{playTone(300,'sawtooth',0.1,0.13);setTimeout(()=>playTone(150,'sawtooth',0.18,0.13),100)};
window.playDeleteSFX = ()=>{playTone(200,'square',0.18,0.13);setTimeout(()=>playTone(100,'square',0.24,0.13),100)};

// ─── PRESETS ─────────────────────────────────────────────
const defaultPresets = [
  {name:'💧 Hydration Check',priority:'standard',method:'voice-female',category:'health',icon:'💧',label:'Water'},
  {name:'🖥️ System Backup',priority:'critical',method:'sms',category:'work',icon:'🖥️',label:'Backup'},
  {name:'👥 Standup Sync',priority:'standard',method:'voice-male',category:'work',icon:'👥',label:'Meeting'},
  {name:'💊 Medication',priority:'critical',method:'voice-female',category:'health',icon:'💊',label:'Meds'},
  {name:'☕ Coffee Break',priority:'standard',method:'voice-female',category:'personal',icon:'☕',label:'Coffee'},
];

window.renderPresets = function() {
  const c = document.getElementById('presetsContainer');
  let h = `<span class="chip save" onclick="saveCurrentAsPreset()">➕ Save Current</span>`;
  customPresets.forEach((p, i) => {
    h += `<span class="chip custom" onclick="applyPreset('${esc(p.name)}','${p.priority}','${p.method}','${p.category}')">${p.icon} ${p.label}<span class="chip-x" onclick="event.stopPropagation();deleteCustomPreset(${i})">✕</span></span>`;
  });
  defaultPresets.forEach(p => {
    h += `<span class="chip" onclick="applyPreset('${esc(p.name)}','${p.priority}','${p.method}','${p.category}')">${p.icon} ${p.label}</span>`;
  });
  c.innerHTML = h;
};
function esc(s){ return s.replace(/'/g,"\\'"); }

window.saveCurrentAsPreset = function() {
  playClickSFX();
  const name = document.getElementById('eventName').value.trim();
  if (!name) { showToast('Enter name first!','error'); playErrorSFX(); return; }
  const lbl = name.length > 12 ? name.slice(0,10)+'…' : name;
  customPresets.unshift({name, priority:document.getElementById('eventPriority').value, method:document.getElementById('alertType').value, category:document.getElementById('eventCategory').value, icon:'⭐', label:lbl});
  localStorage.setItem('nadhi_custom_presets', JSON.stringify(customPresets));
  renderPresets(); showToast('Preset Saved ⭐'); playSuccessSFX();
};

window.deleteCustomPreset = function(idx) {
  playDeleteSFX(); customPresets.splice(idx,1);
  localStorage.setItem('nadhi_custom_presets', JSON.stringify(customPresets));
  renderPresets(); showToast('Preset Deleted','warn');
};

window.applyPreset = function(name, priority, method, category='other') {
  playClickSFX();
  document.getElementById('eventName').value = name;
  document.getElementById('eventPriority').value = priority;
  document.getElementById('alertType').value = method;
  document.getElementById('eventCategory').value = category;
  handleChannelChange();
  ['eventName','eventDate','eventTime'].forEach(id => document.getElementById(id).classList.remove('err'));
  const now = new Date(Date.now() + 10*60000);
  document.getElementById('eventDate').value = now.toISOString().split('T')[0];
  document.getElementById('eventTime').value = now.toTimeString().slice(0,5);
  showToast('Preset Loaded ⚡');
};

// ─── BOOT ────────────────────────────────────────────────
window.initializeSystem = function() { boot(); }
function boot() {
  initAudioCtx(); playSuccessSFX();
  alarmSound.volume=0; alarmSound.play().catch(()=>{}); alarmSound.pause(); alarmSound.currentTime=0;
  if ('speechSynthesis' in window) { const u=new SpeechSynthesisUtterance('');u.volume=0;speechSynthesis.speak(u);speechSynthesis.getVoices(); }
  const el = document.getElementById('init');
  el.classList.add('hide');
  setTimeout(() => el.style.display='none', 580);
  showToast('System Online 🟢');
  speakFeedback('NaDhi OS System Online. Ready for commands, Boss.');
  
  // Update status for Supabase
  document.getElementById('hdrStatus').textContent='● CLOUD';
  document.getElementById('hdrStatus').className='hdr-status on';
  document.getElementById('brandDot').style.background='var(--primary)';
  document.getElementById('brandDot').style.boxShadow='0 0 10px var(--primary)';
  
  if ('Notification' in window && Notification.permission==='default') {
    document.getElementById('notifyBanner').style.display='flex';
  }
}

// ─── THEME ───────────────────────────────────────────────
window.applyTheme = function() {
  const light = sysSettings.theme==='light';
  document.body.classList.toggle('light', light);
  document.getElementById('themeBtn').textContent = light ? '🌙' : '☀️';
  document.getElementById('themeMeta').content = light ? '#ebf3ff' : '#030810';
};
window.toggleTheme = function() {
  sysSettings.theme = sysSettings.theme==='dark' ? 'light' : 'dark';
  playClickSFX(); localStorage.setItem('nadhi_settings', JSON.stringify(sysSettings)); applyTheme();
};

// ─── SETTINGS ────────────────────────────────────────────
function loadSettingsUI() {
  document.getElementById('settingVolume').value = sysSettings.volume;
  document.getElementById('settingSpeed').value = sysSettings.speed;
  document.getElementById('settingTone').value = sysSettings.tone;
  document.getElementById('sfxToggle').checked = sysSettings.sfxEnabled;
  document.getElementById('volLabel').textContent = Math.round(sysSettings.volume*100)+'%';
  document.getElementById('speedLabel').textContent = sysSettings.speed+'x';
}
window.updateSettings = function() {
  sysSettings.volume = parseFloat(document.getElementById('settingVolume').value);
  sysSettings.speed = parseFloat(document.getElementById('settingSpeed').value);
  sysSettings.tone = document.getElementById('settingTone').value;
  document.getElementById('volLabel').textContent = Math.round(sysSettings.volume*100)+'%';
  document.getElementById('speedLabel').textContent = sysSettings.speed+'x';
  alarmSound.src = sysSettings.tone;
  saveSettings();
};
function saveSettings() {
  localStorage.setItem('nadhi_settings', JSON.stringify(sysSettings));
}
window.toggleSFX = function() {
  sysSettings.sfxEnabled = document.getElementById('sfxToggle').checked;
  if (sysSettings.sfxEnabled) playSuccessSFX(); saveSettings();
};
window.testAlarm = function() {
  playClickSFX();
  triggerAlarm({id:'test',name:'System Test Protocol',method:'voice-female',priority:'critical'});
  setTimeout(() => acknowledgeAlarm(), 5000);
};

// ─── VOICE INPUT ─────────────────────────────────────────
window.startVoiceTyping = window.voiceType = function() {
  playClickSFX();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast('Voice not supported','error'); playErrorSFX(); return; }
  const r = new SR(); r.lang='en-US'; r.interimResults=false;
  const btn = document.getElementById('micBtn');
  r.onstart = () => { btn.classList.add('rec'); showToast('Listening 🎤'); };
  r.onresult = e => {
    let txt = e.results[0][0].transcript, nm = txt;
    const tM = txt.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i);
    if (tM) {
      let h=parseInt(tM[1]),m=tM[2]||'00',p=tM[3].toLowerCase().replace(/\./g,'');
      if(p==='pm'&&h<12)h+=12; if(p==='am'&&h===12)h=0;
      document.getElementById('eventTime').value = `${String(h).padStart(2,'0')}:${m}`;
      nm = nm.replace(tM[0],'');
    }
    const d = new Date();
    if (txt.toLowerCase().includes('tomorrow')) { d.setDate(d.getDate()+1); nm=nm.replace(/tomorrow/i,''); }
    document.getElementById('eventDate').value = d.toISOString().split('T')[0];
    nm = nm.replace(/remind me to|remind me|set an? alarm for/i,'').trim();
    document.getElementById('eventName').value = nm.charAt(0).toUpperCase()+nm.slice(1);
    ['eventName','eventDate','eventTime'].forEach(id=>document.getElementById(id).classList.remove('err'));
    showToast('AI Smart Parsed 🧠'); playSuccessSFX();
  };
  r.onerror = ev => { showToast('Mic Error: '+ev.error,'error'); playErrorSFX(); };
  r.onend = () => btn.classList.remove('rec');
  r.start();
};
window.handleChannelChange = function() {
  document.getElementById('customMusicGroup').style.display =
    document.getElementById('alertType').value==='custom-music' ? 'block' : 'none';
};

// ─── DEPLOY (SAVE TO SUPABASE) ───────────────────────────
window.deployProtocol = async function() {
  playClickSFX();
  const nameEl=document.getElementById('eventName'),dateEl=document.getElementById('eventDate'),timeEl=document.getElementById('eventTime');
  let err = false;
  [nameEl,dateEl,timeEl].forEach(el=>{el.classList.remove('err');void el.offsetWidth});
  if (!nameEl.value.trim()) { nameEl.classList.add('err'); err=true; }
  if (!dateEl.value)        { dateEl.classList.add('err'); err=true; }
  if (!timeEl.value)        { timeEl.classList.add('err'); err=true; }
  if (err) { showToast('Fill highlighted fields','error'); playErrorSFX(); return; }
 
  const [h,mi] = timeEl.value.split(':');
  const [yy, mm, dd] = dateEl.value.split('-'); 
  const evDate = new Date(parseInt(yy), parseInt(mm) - 1, parseInt(dd));
  evDate.setHours(parseInt(h), parseInt(mi), 0, 0);
  const timestamp = evDate.getTime();
  if (timestamp<Date.now()) { showToast('Time is in the past','error'); timeEl.classList.add('err'); playErrorSFX(); return; }
 
  const fmtDate=evDate.toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'});
  const fmtTime=evDate.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});
  const eventId = editingEventId || 'N-'+Date.now();
 
  const newEvent = {
    id:eventId, 
    name:nameEl.value.trim(), 
    date:fmtDate, 
    time:fmtTime,
    priority:document.getElementById('eventPriority').value,
    method:document.getElementById('alertType').value,
    category:document.getElementById('eventCategory').value,
    timestamp: timestamp, 
    created_at:Date.now(),
    raw_date:dateEl.value, 
    raw_time:timeEl.value,
    is_notified:false, 
    is_archived:false
  };
 
  const btn = document.getElementById('saveBtn');
  btn.disabled=true;
  btn.innerHTML=`<span class="spinner"></span>${editingEventId?'Updating...':'Deploying...'}`;
 
  // Send data to Supabase
  const { data, error: supaErr } = await supabaseClient
    .from('protocols')
    .upsert([newEvent]);

  if (supaErr) {
      console.error('Supabase Error:', supaErr);
      showToast('Database Error! Check console.', 'error');
      playErrorSFX();
  } else {
      showToast(editingEventId ? 'Protocol Updated in Cloud 📝' : 'Deployed to Cloud 🚀');
      speakFeedback(editingEventId ? 'Protocol updated, Boss.' : 'Protocol saved to Cloud, Boss.');
      fetchFromSupabase(); 
  }

  btn.disabled = false;
  btn.innerHTML = 'Deploy Protocol 🚀';
  editingEventId=null; 
  resetForm(); 
  switchTab('radar', document.querySelectorAll('.nav-item')[1]);
};

function resetForm() {
  document.getElementById('eventName').value='';
  document.getElementById('eventDate').value='';
  document.getElementById('eventTime').value='';
  document.getElementById('eventRepeat').value='none';
  document.getElementById('eventCategory').value='other';
  document.getElementById('eventPriority').value='standard';
  document.getElementById('alertType').value='sms';
  document.getElementById('customMusicGroup').style.display='none';
  document.getElementById('formTitle').textContent='Command Center';
  const btn=document.getElementById('saveBtn');
  btn.textContent='Deploy Protocol 🚀';btn.classList.remove('update');btn.disabled=false;
  document.getElementById('cancelEditBtn').style.display='none';
  ['eventName','eventDate','eventTime'].forEach(id=>document.getElementById(id).classList.remove('err'));
}

window.cancelEdit = function() { playClickSFX(); editingEventId=null; resetForm(); };

window.editProtocol = function(id) {
  playClickSFX();
  const evt=savedEvents.find(e=>e.id===id); if(!evt)return;
  editingEventId=id;
  document.getElementById('formTitle').textContent='Edit Protocol ✏️';
  document.getElementById('eventName').value=evt.name;
  document.getElementById('eventPriority').value=evt.priority;
  document.getElementById('alertType').value=evt.method;
  if(evt.category)document.getElementById('eventCategory').value=evt.category;
  if(evt.repeat)document.getElementById('eventRepeat').value=evt.repeat;
  if(evt.rawDate)document.getElementById('eventDate').value=evt.rawDate;
  if(evt.rawTime)document.getElementById('eventTime').value=evt.rawTime;
  handleChannelChange();
  const btn=document.getElementById('saveBtn');
  btn.textContent='Update Protocol 📝';btn.classList.add('update');
  document.getElementById('cancelEditBtn').style.display='block';
  switchTab('command',document.querySelectorAll('.nav-item')[0]);
};

// Delete from Supabase
window.abortProtocol = async function(id) {
  playDeleteSFX();
  
  // Delete from DB
  await supabaseClient.from('protocols').delete().eq('id', id);
  
  savedEvents=savedEvents.filter(e=>e.id!==id);
  renderViews(); updateNavBadges();
  
  showToast('Protocol Deleted','error');
  speakFeedback('Protocol aborted, Boss.');
};

// ─── RENDER ──────────────────────────────────────────────
function catBadge(c){ return {work:'<span class="bdg b-cyan">💼 Work</span>',health:'<span class="bdg b-amber">💊 Health</span>',personal:'<span class="bdg b-muted">🏠 Personal</span>',other:'<span class="bdg b-muted">📌 Other</span>'}[c]||'<span class="bdg b-muted">📌 Other</span>' }
function methodBadge(m){ return {sms:'<span class="bdg b-muted">📱 SMS</span>','voice-female':'<span class="bdg b-cyan">👩 Voice</span>','voice-male':'<span class="bdg b-cyan">👨 Voice</span>','custom-music':'<span class="bdg b-amber">🎵 Music</span>'}[m]||'' }
function fmtDiff(ms){ const s=Math.floor(ms/1000);return`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` }

window.renderViews = function() {
  const radarList=document.getElementById('eventsList');
  const histList=document.getElementById('historyList');
  const loadMoreBtn=document.getElementById('loadMoreContainer');
  radarList.innerHTML=''; histList.innerHTML='';
  let aCount=0;
  const searchR=document.getElementById('searchRadar').value.toLowerCase();
  const searchH=document.getElementById('searchHistory').value.toLowerCase();

  savedEvents.forEach((evt,i) => {
    if (evt.isArchived) return;
    const nm=evt.name.toLowerCase();
    if (!nm.includes(searchR)) return;
    const isCrit=evt.priority==='critical';
    aCount++;
    const diff=evt.timestamp-Date.now();
    const start=evt.createdAt||evt.timestamp-3600000;
    const pct=diff>0?Math.max(0,Math.min(100,(diff/(evt.timestamp-start))*100)):0;
    const cdTxt=diff>0?fmtDiff(diff):'EXECUTING';
    const exClass=diff<=0?'exec':'';

    radarList.insertAdjacentHTML('beforeend',`
      <div class="ev-card ${isCrit?'crit':''}" id="${evt.id}" data-name="${nm}" style="animation-delay:${i*0.04}s"
        ontouchstart="handleTouchStart(event,'${evt.id}')"
        ontouchmove="handleTouchMove(event,'${evt.id}')"
        ontouchend="handleTouchEnd(event,'${evt.id}')">
        <div class="swipe-bg">🗑️ DELETE</div>
        <button class="edit-btn" onclick="editProtocol('${evt.id}')">✏️</button>
        <div class="ev-title">${isCrit?'🔴':'🔵'} ${evt.name}</div>
        <div class="ev-meta"><span>📅 ${evt.date}</span><span>🕒 ${evt.time}</span></div>
        <div class="ev-foot">
          <div class="badges">${methodBadge(evt.method)}${catBadge(evt.category)}</div>
          <div style="text-align:right">
            <span style="font-size:8px;color:var(--muted);display:block;margin-bottom:2px">T-MINUS</span>
            <span class="cdwn ${isCrit?'crit':''} ${exClass}" id="cd-${evt.id}">${cdTxt}</span>
          </div>
        </div>
        <div class="prog-track"><div class="prog-fill" id="prog-${evt.id}" style="width:${pct}%"></div></div>
      </div>`);
  });

  if (aCount===0) radarList.innerHTML='<div class="empty"><span class="empty-ico">📡</span>Radar Clear — No Active Protocols</div>';

  const allHist=savedEvents.filter(e=>e.isArchived);
  const filtH=allHist.filter(e=>e.name.toLowerCase().includes(searchH));
  const pagH=filtH.slice(0,historyDisplayLimit);
  loadMoreBtn.style.display=filtH.length>historyDisplayLimit?'block':'none';

  if (!pagH.length) { histList.innerHTML='<div class="empty"><span class="empty-ico">📜</span>No History Logs Yet</div>'; }
  pagH.forEach((evt,i) => {
    histList.insertAdjacentHTML('beforeend',`
      <div class="ev-card hist" data-name="${evt.name.toLowerCase()}" style="animation-delay:${i*0.04}s"
        ontouchstart="handleTouchStart(event,'${evt.id}')"
        ontouchmove="handleTouchMove(event,'${evt.id}')"
        ontouchend="handleTouchEnd(event,'${evt.id}')">
        <div class="swipe-bg">🗑️ DELETE</div>
        <div class="ev-title">${evt.priority==='critical'?'🔴':'🔵'} ${evt.name}</div>
        <div class="ev-meta"><span>📅 ${evt.date}</span><span>🕒 ${evt.time}</span></div>
        <div class="ev-foot">
          <div class="badges">${methodBadge(evt.method)}${catBadge(evt.category)}</div>
          <span class="bdg b-green">✅ COMPLETED</span>
        </div>
      </div>`);
  });

  if (currentRadarView==='calendar') renderCalendar();
};

function renderCalendar() {
  const cv=document.getElementById('calendarView'); cv.innerHTML='';
  const y=calMonth.getFullYear(),mo=calMonth.getMonth();
  const dim=new Date(y,mo+1,0).getDate(),first=new Date(y,mo,1).getDay();
  const mnames=['January','February','March','April','May','June','July','August','September','October','November','December'];
  let h=`<div class="cal-wrap">
    <div class="cal-hdr">
      <button class="cal-nav-btn" onclick="changeCalMonth(-1)">‹</button>
      <div class="cal-month-lbl">${mnames[mo]} ${y}</div>
      <button class="cal-nav-btn" onclick="changeCalMonth(1)">›</button>
    </div>
    <div class="cal-days-row">${['S','M','T','W','T','F','S'].map(d=>`<div>${d}</div>`).join('')}</div>
    <div class="cal-grid">`;
  for(let i=0;i<first;i++) h+='<div class="cal-cell empty"></div>';
  const now=new Date();
  for(let d=1;d<=dim;d++){
    const ds=new Date(y,mo,d).toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'});
    const evs=savedEvents.filter(e=>!e.isArchived&&e.date===ds);
    const isToday=d===now.getDate()&&mo===now.getMonth()&&y===now.getFullYear();
    const dots=evs.map(e=>`<div class="cal-dot ${e.priority==='critical'?'crit':''}"></div>`).join('');
    h+=`<div class="cal-cell ${isToday?'today':''}"><div class="cal-num">${d}</div><div class="cal-dots">${dots}</div></div>`;
  }
  h+='</div></div>';
  cv.innerHTML=h;
}
function changeCalMonth(dir){playClickSFX();calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+dir,1);renderCalendar()}

// ─── SWIPE DELETE ────────────────────────────────────────
let _startX=0,_curX=0;
window.handleTouchStart=(e,id)=>{_startX=e.touches[0].clientX;};
window.handleTouchMove=(e,id)=>{
  _curX=e.touches[0].clientX;
  const el=document.getElementById(id);
  if(el&&_curX-_startX<0)el.style.transform=`translateX(${_curX-_startX}px)`;
};
window.handleTouchEnd=(e,id)=>{
  const el=document.getElementById(id); if(!el)return;
  if(_curX-_startX<-90){el.style.transition='transform 0.2s ease';el.style.transform='translateX(-100vw)';setTimeout(()=>abortProtocol(id),190);}
  else{el.style.transform='';}
};

window.searchEvents=function(tab){if(tab==='radar')renderViews();else renderViews()};
window.loadMoreHistory=function(){playClickSFX();historyDisplayLimit+=20;renderViews()};
window.toggleRadarView=function(viewType){
  playClickSFX(); currentRadarView=viewType;
  document.getElementById('btnViewList').classList.toggle('active',viewType==='list');
  document.getElementById('btnViewCal').classList.toggle('active',viewType==='calendar');
  document.getElementById('eventsList').style.display=viewType==='list'?'flex':'none';
  document.getElementById('calendarView').style.display=viewType==='calendar'?'block':'none';
  if(viewType==='calendar')renderCalendar();
};

// ─── ALARM ───────────────────────────────────────────────
window.triggerAlarm=function(evt){
  activeAlarmEventId=evt.id;
  document.getElementById('modalEventName').textContent=evt.name;
  const ch={sms:'ENCRYPTED SMS','voice-female':'VOICE (FEMALE)','voice-male':'VOICE (MALE)','custom-music':'OWN MUSIC 🎵'}[evt.method]||evt.method;
  document.getElementById('modalEventMode').textContent=ch;
  document.getElementById('alarmModal').classList.add('active');
  if('Notification' in window&&Notification.permission==='granted'){
    const n=new Notification('🚨 Protocol: '+evt.name,{body:'Execution Target Reached. Channel: '+ch,icon:'https://cdn-icons-png.flaticon.com/512/1827/1827372.png',vibrate:[300,100,300,100,500]});
    n.onclick=()=>{window.focus();n.close()};
  }
  if('vibrate' in navigator)navigator.vibrate([300,100,300,100,500,200,500]);
  if(evt.method.startsWith('voice')&&'speechSynthesis' in window){
    const u=new SpeechSynthesisUtterance(`Attention Boss. Protocol for ${evt.name} has reached execution time.`);
    u.rate=sysSettings.speed;
    const vs=speechSynthesis.getVoices();
    let sel=evt.method==='voice-female'?vs.find(v=>/female|woman|zira|samantha|siri|victoria/i.test(v.name)):vs.find(v=>/male|man|david|mark|daniel/i.test(v.name));
    if(sel)u.voice=sel;
    alarmSound.src=sysSettings.tone;alarmSound.volume=sysSettings.volume*0.2;alarmSound.currentTime=0;
    alarmSound.play().catch(()=>{});
    speechSynthesis.speak(u);
  } else {
    alarmSound.src=sysSettings.tone;alarmSound.volume=sysSettings.volume;alarmSound.currentTime=0;
    alarmSound.play().catch(()=>{});
  }
};

function stopAlarm(){
  alarmSound.pause();alarmSound.currentTime=0;
  if('speechSynthesis' in window)speechSynthesis.cancel();
  if('vibrate' in navigator)navigator.vibrate(0);
  document.getElementById('alarmModal').classList.remove('active');
}

window.snoozeAlarm=async function(){
  playClickSFX(); stopAlarm();
  if(activeAlarmEventId==='test'){activeAlarmEventId=null;showToast('Test Snoozed');return;}
  const evt=savedEvents.find(e=>e.id===activeAlarmEventId);
  if(evt){
    const nTs=Date.now()+5*60*1000,nD=new Date(nTs),pad=n=>n<10?'0'+n:n;
    evt.timestamp=nTs;
    evt.date=nD.toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'});
    evt.time=nD.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});
    evt.rawDate=`${nD.getFullYear()}-${pad(nD.getMonth()+1)}-${pad(nD.getDate())}`;
    evt.rawTime=`${pad(nD.getHours())}:${pad(nD.getMinutes())}`;
    evt.isNotified=false;
    
    await supabaseClient.from('protocols').update({
        timestamp: nTs,
        date: evt.date,
        time: evt.time,
        raw_date: evt.rawDate,
        raw_time: evt.rawTime,
        is_notified: false
    }).eq('id', evt.id);
    
    fetchFromSupabase();
  }
  activeAlarmEventId=null;
  document.getElementById('searchRadar').value='';
  showToast('Snoozed 5 mins ⏳','warn');
  speakFeedback('Alarm snoozed for 5 minutes, Boss.');
};

window.acknowledgeAlarm=async function(){
  playClickSFX(); stopAlarm();
  if(activeAlarmEventId==='test'){activeAlarmEventId=null;return;}
  const evt=savedEvents.find(e=>e.id===activeAlarmEventId);
  if(evt){
    evt.isArchived = true;
    await supabaseClient.from('protocols').update({ is_archived: true }).eq('id', evt.id);
    fetchFromSupabase();
  }
  activeAlarmEventId=null;
};

// ─── CSV / CLEAR ─────────────────────────────────────────
window.exportCSV=function(){
  playClickSFX();
  const hist=savedEvents.filter(e=>e.isArchived);
  if(!hist.length){showToast('No logs to export','error');playErrorSFX();return;}
  let csv='Protocol Name,Execution Date,Execution Time,Priority,Channel,Category\n';
  hist.forEach(e=>{csv+=`"${e.name}","${e.date}","${e.time}","${e.priority}","${e.method}","${e.category||'other'}"\n`});
  const a=document.createElement('a');a.href=encodeURI('data:text/csv;charset=utf-8,'+csv);
  a.download=`NaDhi_OS_Logs_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  showToast('Export Complete 📥');playSuccessSFX();
};

window.clearHistory=async function(){
  playClickSFX();
  if(!confirm('Clear all history logs?'))return;
  const hist=savedEvents.filter(e=>e.isArchived);
  if(!hist.length){showToast('History empty','error');playErrorSFX();return;}
  
  for (const e of hist) {
     await supabaseClient.from('protocols').delete().eq('id', e.id);
  }
  
  fetchFromSupabase();
  showToast('History Cleared 🧹');playDeleteSFX();
  speakFeedback('History cleared, Boss.');
};

// ─── NAV / TABS ──────────────────────────────────────────
window.switchTab=function(tabId,btnEl){
  playSwitchSFX();
  document.querySelectorAll('.tab-section').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+tabId).classList.add('active');
  btnEl.classList.add('active');
  document.getElementById('main').scrollTop=0;
};
function updateNavBadges(){
  const active=savedEvents.filter(e=>!e.isArchived).length;
  const hist=savedEvents.filter(e=>e.isArchived).length;
  const rb=document.getElementById('radarBadge'),hb=document.getElementById('histBadge');
  rb.textContent=active;rb.style.display=active>0?'flex':'none';
  hb.textContent=hist;hb.style.display=hist>0?'flex':'none';
}

window.requestNotificationPermission = window.reqNotify = function(){
  playClickSFX();
  if('Notification' in window)Notification.requestPermission().then(p=>{
    if(p==='granted'){document.getElementById('notifyBanner').style.display='none';showToast('Push Alerts Enabled 🔔');playSuccessSFX();}
  });
};

window.speakFeedback=function(text){
  if(!('speechSynthesis' in window))return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.rate=sysSettings.speed||0.9;u.pitch=0.9;
  const vs=speechSynthesis.getVoices();
  const sel=vs.find(v=>/uk english male|en-gb-male|daniel|david/i.test(v.name));
  if(sel)u.voice=sel;
  speechSynthesis.speak(u);
};

let _toastTimer;
function showToast(msg,type='success'){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className=type==='error'?'error':type==='warn'?'warn':type==='info'?'info':'';
  t.style.display='block';
  requestAnimationFrame(()=>t.classList.add('show'));
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.style.display='none',220)},3000);
}

// ─── CLOCK + ALARM TICK ──────────────────────────────────
setInterval(()=>{
  const nowTs=Date.now();
  document.getElementById('liveClock').textContent=new Date(nowTs).toLocaleTimeString('en-US',{hour12:false});
  let dirty=false;
  
  const activeEvents = savedEvents.filter(e => !e.isArchived);
  activeEvents.forEach(evt => {
    if(!evt.isNotified && evt.timestamp <= nowTs){
      triggerAlarm(evt);
      evt.isNotified=true;
      supabaseClient.from('protocols').update({ is_notified: true }).eq('id', evt.id).then(()=>{});
      dirty=true;
    }
    if(!evt.isNotified){
      const cdEl=document.getElementById(`cd-${evt.id}`),pfEl=document.getElementById(`prog-${evt.id}`);
      if(cdEl){
        const diff=evt.timestamp-nowTs;
        if(diff>0){
          cdEl.textContent=fmtDiff(diff);cdEl.classList.remove('exec');
          if(pfEl){
              const start=evt.createdAt||(evt.timestamp-3600000);
              pfEl.style.width=Math.max(0,Math.min(100,(diff/(evt.timestamp-start))*100))+'%';
          }
        } else {
            cdEl.textContent='EXECUTING';
            cdEl.classList.add('exec');
        }
      }
    }
  });
  if(dirty)renderViews();
},1000);

// ─── PWA & MISC ──────────────────────────────────────────
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();pwaPrompt=e;document.getElementById('pwaInstallContainer').style.display='block'});
window.installPWA=async()=>{if(!pwaPrompt)return;pwaPrompt.prompt();const{outcome}=await pwaPrompt.userChoice;if(outcome==='accepted')document.getElementById('pwaInstallContainer').style.display='none';pwaPrompt=null};

// Boot Init
applyTheme();
loadSettingsUI();
renderPresets();
document.getElementById('eventDate').setAttribute('min',new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().split('T')[0]);