/* ═══════════════════════════════════════════════════════
   NaDhi OS — Mobile Production Build (Supabase Edition)
═══════════════════════════════════════════════════════ */

// ─── SUPABASE CONFIGURATION ──────────────────────────────
let supabaseClient = null;
if (typeof supabase !== 'undefined') {
  const supabaseUrl = 'https://odgoairxkxlaxnitfmnn.supabase.co';
  const supabaseKey = 'sb_publishable_zzW3MwTSnz-cAkVJvRzUhw_oxMXrVde';
  supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
}

// ─── CONFIG ──────────────────────────────────────────────
let sysSettings = JSON.parse(localStorage.getItem('nadhi_settings') || 'null');
if (!sysSettings) {
  sysSettings = {
    volume: 1.0, 
    speed: 0.9,
    theme: window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light',
    tone: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
    sfxEnabled: true
  };
}
window.sysSettings = sysSettings;

// ─── STATE ───────────────────────────────────────────────
let savedEvents      = [];
let editingEventId   = null;
let activeAlarmEventId = null;
let currentRadarView = 'list';
let historyDisplayLimit = 20;
let pwaPrompt        = null;
let calMonth         = new Date();
let customPresets    = JSON.parse(localStorage.getItem('nadhi_custom_presets') || '[]');

// Alarm audio
let alarmSound = new Audio(sysSettings.tone);
alarmSound.loop = true;
window.alarmSound = alarmSound;

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

// ─── PERSIST ─────────────────────────────────────────────
function persist() {
  try { localStorage.setItem('nadhi_os_cloud', JSON.stringify(savedEvents)); } catch(e) {}
}

// ─── PRESETS ─────────────────────────────────────────────
const defaultPresets = [
  {name:'💧 Hydration Check',priority:'standard',method:'voice-female',category:'health',icon:'💧',label:'Water'},
  {name:'🖥️ System Backup',priority:'critical',method:'sms',category:'work',icon:'🖥️',label:'Backup'},
  {name:'👥 Standup Sync',priority:'standard',method:'voice-male',category:'work',icon:'👥',label:'Meeting'},
  {name:'💊 Medication',priority:'critical',method:'voice-female',category:'health',icon:'💊',label:'Meds'},
  {name:'☕ Coffee Break',priority:'standard',method:'voice-female',category:'personal',icon:'☕',label:'Coffee'},
  {name:'🏋️ Gym Workout',priority:'standard',method:'voice-male',category:'health',icon:'🏋️',label:'Gym'},
  {name:'🧘 Meditation',priority:'standard',method:'voice-female',category:'health',icon:'🧘',label:'Mindful'},
  {name:'✈️ Travel Depart',priority:'critical',method:'sms',category:'other',icon:'✈️',label:'Travel'},
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
  
  // Load initial data
  loadLocalData();
  
  if ('Notification' in window && Notification.permission==='default') {
    document.getElementById('notifyBanner').style.display='flex';
  }
}

// ─── THEME & SETTINGS ────────────────────────────────────
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
  localStorage.setItem('nadhi_settings', JSON.stringify(sysSettings));
};
window.toggleSFX = function() {
  sysSettings.sfxEnabled = document.getElementById('sfxToggle').checked;
  if (sysSettings.sfxEnabled) playSuccessSFX(); 
  localStorage.setItem('nadhi_settings', JSON.stringify(sysSettings));
};
window.testAlarm = function() {
  playClickSFX();
  triggerAlarm({id:'test',name:'System Test Protocol',method:document.getElementById('alertType').value,priority:'critical'});
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

// ─── DATA SYNC & DEPLOY ──────────────────────────────────
function loadLocalData() {
  const local = localStorage.getItem('nadhi_os_cloud');
  if(local) {
      try { savedEvents = JSON.parse(local); renderViews(); updateNavBadges(); } 
      catch(e) { savedEvents = []; }
  }
}

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

  let customAudioData = null;
  if (document.getElementById('alertType').value==='custom-music') {
    const fi=document.getElementById('customAudioInput');
    if (fi.files.length>0) {
      if (fi.files[0].size > 1024 * 1024) { showToast('File too large! Max 1MB.', 'error'); playErrorSFX(); return; }
      customAudioData = await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej();r.readAsDataURL(fi.files[0])});
    } else if (!editingEventId) { showToast('Select music file','error'); playErrorSFX(); return; }
  }

  const newEvent = {
    id:eventId, name:nameEl.value.trim(), date:fmtDate, time:fmtTime,
    priority:document.getElementById('eventPriority').value,
    method:document.getElementById('alertType').value,
    repeat:document.getElementById('eventRepeat').value,
    category:document.getElementById('eventCategory').value,
    timestamp, createdAt:Date.now(),
    rawDate:dateEl.value, rawTime:timeEl.value,
    isNotified:false, isArchived:false,
    customAudio:customAudioData,
  };

  const btn = document.getElementById('saveBtn');
  btn.disabled=true;
  btn.innerHTML=`<span class="spinner"></span>${editingEventId?'Updating...':'Deploying...'}`;

  // Local Save (Fast UI)
  if (editingEventId) savedEvents=savedEvents.map(e=>e.id===editingEventId?newEvent:e);
  else savedEvents.push(newEvent);
  
  try { persist(); } catch(e) {
    showToast('Storage Full! Remove old data.','error'); playErrorSFX();
    savedEvents = savedEvents.filter(e => e.id !== eventId);
    btn.disabled = false; btn.innerHTML = 'Deploy Protocol 🚀'; return; 
  }

  // Supabase Cloud Sync (Background)
  if (supabaseClient) {
      try {
          // Attempt to sync to cloud if table exists
          await supabaseClient.from('protocols').upsert(newEvent);
      } catch(e) { console.warn("Supabase sync skipped - Table might not exist yet."); }
  }

  if ('Notification' in window && Notification.permission==='default') reqNotify();
  playSuccessSFX();
  showToast(editingEventId ? 'Protocol Updated 📝' : 'Deployed Successfully 🚀');
  speakFeedback(editingEventId?'Protocol updated, Boss.':'Protocol saved and secured, Boss.');
  editingEventId=null; resetForm(); renderViews(); updateNavBadges();
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

window.abortProtocol = async function(id) {
  playDeleteSFX();
  
  // Update Local
  savedEvents=savedEvents.filter(e=>e.id!==id);
  persist(); renderViews(); updateNavBadges();

  // Update Supabase
  if(supabaseClient) {
      try { await supabaseClient.from('protocols').delete().eq('id', id); } catch(e) {}
  }

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
      <div class="ev-card ${isCrit?'crit':''}" id="${evt.id}" data-name="${nm}">
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

  if (aCount===0) radarList.innerHTML='<div class="empty">📡 Radar Clear — No Active Protocols</div>';

  const allHist=savedEvents.filter(e=>e.isArchived);
  const filtH=allHist.filter(e=>e.name.toLowerCase().includes(searchH));
  const pagH=filtH.slice(0,historyDisplayLimit);

  if (!pagH.length) { histList.innerHTML='<div class="empty">📜 No History Logs Yet</div>'; }
  pagH.forEach((evt,i) => {
    histList.insertAdjacentHTML('beforeend',`
      <div class="ev-card hist" data-name="${evt.name.toLowerCase()}">
        <div class="ev-title">${evt.priority==='critical'?'🔴':'🔵'} ${evt.name}</div>
        <div class="ev-meta"><span>📅 ${evt.date}</span><span>🕒 ${evt.time}</span></div>
        <div class="ev-foot">
          <div class="badges">${methodBadge(evt.method)}${catBadge(evt.category)}</div>
          <span class="bdg b-green">✅ COMPLETED</span>
        </div>
      </div>`);
  });
};

// ─── ALARM & TEXT TO SPEECH ──────────────────────────────
const synth = window.speechSynthesis;
let systemVoices = [];
function populateVoiceList() { if (synth) systemVoices = synth.getVoices(); }
if (synth && 'onvoiceschanged' in synth) synth.onvoiceschanged = populateVoiceList;
populateVoiceList();

function playVoiceAlert(message, channelType) {
  if (!synth) return;
  if (synth.speaking) synth.cancel();
  if (systemVoices.length === 0) systemVoices = synth.getVoices();

  const utterance = new SpeechSynthesisUtterance(message);
  let selectedVoice = systemVoices.find(voice => 
      channelType === 'voice-female' ? /female|zira|samantha/i.test(voice.name) : /male|david|mark/i.test(voice.name)
  );
  if (selectedVoice) utterance.voice = selectedVoice;
  utterance.rate = sysSettings.speed;
  utterance.volume = sysSettings.volume;
  setTimeout(() => synth.speak(utterance), 50);
  return utterance;
}

window.triggerAlarm=function(evt){
  activeAlarmEventId=evt.id;
  document.getElementById('modalEventName').textContent=evt.name;
  document.getElementById('alarmModal').classList.add('active');
  
  if(evt.method==='custom-music'&&evt.customAudio){
    alarmSound.src=evt.customAudio;alarmSound.volume=sysSettings.volume;alarmSound.currentTime=0;
    alarmSound.play().catch(()=>showToast('🚨 ALARM TRIGGERED! Click to hear.','error'));
  } else if(evt.method.startsWith('voice')){
    const message = `Attention Boss. Protocol for ${evt.name} has reached execution time.`;
    playVoiceAlert(message, evt.method);
  } else {
    alarmSound.src=sysSettings.tone;alarmSound.volume=sysSettings.volume;alarmSound.currentTime=0;
    alarmSound.play().catch(()=>showToast('🚨 ALARM TRIGGERED!','error'));
  }
};

function stopAlarm(){
  alarmSound.pause();alarmSound.currentTime=0;
  if('speechSynthesis' in window)synth.cancel();
  document.getElementById('alarmModal').classList.remove('active');
}

window.snoozeAlarm=async function(){
  playClickSFX(); stopAlarm();
  if(activeAlarmEventId==='test'){activeAlarmEventId=null;return;}
  const evt=savedEvents.find(e=>e.id===activeAlarmEventId);
  if(evt){
    const nTs=Date.now()+5*60*1000,nD=new Date(nTs),pad=n=>n<10?'0'+n:n;
    evt.timestamp=nTs;evt.isNotified=false;
    evt.time=nD.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});
    persist(); renderViews();
  }
  activeAlarmEventId=null;
  showToast('Snoozed 5 mins ⏳','warn');
};

window.acknowledgeAlarm=async function(){
  playClickSFX(); stopAlarm();
  if(activeAlarmEventId==='test'){activeAlarmEventId=null;return;}
  const evt=savedEvents.find(e=>e.id===activeAlarmEventId);
  if(evt){
    if(evt.repeat&&evt.repeat!=='none'){
      evt.timestamp=evt.timestamp+(evt.repeat==='daily'?86400000:604800000);
      evt.isNotified=false; persist();
    } else {
      evt.isArchived=true; persist();
    }
    renderViews(); updateNavBadges();
  }
  activeAlarmEventId=null;
};

// ─── CSV / CLEAR ─────────────────────────────────────────
window.clearHistory=async function(){
  playClickSFX();
  if(!confirm('Clear all history logs?'))return;
  savedEvents=savedEvents.filter(e=>!e.isArchived);
  persist();renderViews();updateNavBadges();
  showToast('History Cleared 🧹');playDeleteSFX();
};

window.switchTab=function(tabId,btnEl){
  playSwitchSFX();
  document.querySelectorAll('.tab-section').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+tabId).classList.add('active');
  btnEl.classList.add('active');
};
function updateNavBadges(){
  const active=savedEvents.filter(e=>!e.isArchived).length;
  document.getElementById('radarBadge').style.display=active>0?'flex':'none';
  document.getElementById('radarBadge').textContent=active;
}

window.speakFeedback=function(text){
  if(!synth) return;
  if(synth.speaking) synth.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.rate=sysSettings.speed; setTimeout(() => synth.speak(u), 50);
};

let _toastTimer;
function showToast(msg,type='success'){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className=type;t.style.display='block';
  setTimeout(()=>t.classList.add('show'),10);
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.style.display='none',220)},3000);
}

// ─── CLOCK TICK ──────────────────────────────────────────
setInterval(()=>{
  const nowTs=Date.now();
  document.getElementById('liveClock').textContent=new Date(nowTs).toLocaleTimeString('en-US',{hour12:false});
  let dirty=false;
  savedEvents.filter(e => !e.isArchived).forEach(evt => {
    if(!evt.isNotified && evt.timestamp <= nowTs){ triggerAlarm(evt); evt.isNotified=true; persist(); dirty=true; }
    if(!evt.isNotified){
      const cdEl=document.getElementById(`cd-${evt.id}`);
      if(cdEl){
        const diff=evt.timestamp-nowTs;
        if(diff>0){ cdEl.textContent=fmtDiff(diff); cdEl.classList.remove('exec'); } 
        else { cdEl.textContent='EXECUTING'; cdEl.classList.add('exec'); }
      }
    }
  });
  if(dirty)renderViews();
},1000);

// ─── INIT ────────────────────────────────────────────────
applyTheme();
loadSettingsUI();
renderPresets();
// ─── NOTIFICATIONS FIX ───────────────────────────────────
window.reqNotify = function(){
  if('Notification' in window) Notification.requestPermission().then(p=>{
    if(p==='granted') showToast('Push Alerts Enabled 🔔');
  });
};