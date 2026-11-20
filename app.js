import {CONFIG} from './config.js';
const MEMBERS = [
  ['livio','Livio'], ['joel-stocker','Joel Stocker'], ['joel-haeusler','Joel Häusler'],
  ['tim','Tim'], ['nico','Nico'], ['noemi','Noemi'], ['anina','Anina'],
  ['kimo','Kimo'], ['kyle','Kyle'], ['raphael','Raphael'], ['maria','Maria'], ['berni','Berni']
].map(([id,name]) => ({id,name}));
const SCHEDULE = {
  nico:'2026-11-13',livio:'2026-11-20',kimo:'2026-11-27',kyle:'2026-12-04',
  noemi:'2026-12-11',maria:'2026-12-18',anina:'2027-01-08','joel-haeusler':'2027-01-15',tim:'2027-01-22'
};
const ROSTER = Object.entries(SCHEDULE).map(([id,date]) => ({...MEMBERS.find(p=>p.id===id),date}));
const AVATARS=['🍰','🦊','🐸','🐼','🐱','🐻','🦋','🍓','👑','🦄','🐧','🌻'];
const COLORS=['#eaf3fc','#f9e9ee','#e8f2ef','#fff1d5','#eeeaf5','#fae9df'];
const swissToday = (now=new Date()) => {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=type=>parts.find(p=>p.type===type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};
const isOpen = (cake,today=swissToday()) => Boolean(cake.date && cake.date<=today);
function validateVote({score,voterId,targetId,votes=[]}) {
  if (!voterId || !targetId) throw new Error('Bitte melde dich zuerst an.');
  if (!Number.isInteger(score) || score < 1 || score > 10) throw new Error('Wähle eine ganze Punktzahl von 1 bis 10.');
  if (voterId === targetId) throw new Error('Deinen eigenen Kuchen kannst du nicht bewerten.');
  if (votes.some(v => v.target_id === targetId)) throw new Error('Diesen Kuchen hast du bereits bewertet.');
}
function rankCakes(cakes) {
  const sorted = cakes.map(c => ({...c,average:c.average === null ? null : Number(c.average),vote_count:Number(c.vote_count)}))
    .sort((a,b) => (b.vote_count > 0) - (a.vote_count > 0) || (b.average ?? 0) - (a.average ?? 0) || a.name.localeCompare(b.name,'de'));
  let rank=0, previous=null;
  return sorted.map(c => {
    if (c.vote_count && c.average !== previous) { rank++; previous=c.average; }
    return {...c,rank:c.vote_count ? rank : null};
  });
}

const SESSION_KEY='kuchenliga.session.v1';
class ApiError extends Error { constructor(message,code,status){super(message);this.code=code;this.status=status;} }
class ClassApi {
  constructor(config){
    this.url=config.supabaseUrl.replace(/\/$/,'');this.key=config.publishableKey;this.refreshing=null;this.generation=0;this.loginAttempt=0;
    try{this.session=JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null;}catch{this.session=null;}
  }
  remember(session){this.generation++;this.session=session;if(session)sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));else sessionStorage.removeItem(SESSION_KEY);}
  async raw(path,{method='GET',body,token}={}){
    const headers={apikey:this.key,'Content-Type':'application/json'};
    if(token) headers.Authorization=`Bearer ${token}`;
    if(['POST','PATCH'].includes(method) && path.startsWith('/rest/')) headers.Prefer='return=representation';
    let response;
    try { response=await fetch(this.url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)}); }
    catch { throw new ApiError('Keine Verbindung. Prüfe dein Internet und versuche es nochmals.','NETWORK',0); }
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new ApiError(data?.message || data?.msg || 'Die Anfrage konnte nicht abgeschlossen werden.',data?.code || data?.error_code,response.status);
    return data;
  }
  async login(participantId,password){
    const attempt=++this.loginAttempt;
    const data=await this.raw('/auth/v1/token?grant_type=password',{method:'POST',body:{email:`${participantId}@kuchenliga.invalid`,password}});
    if(attempt!==this.loginAttempt)throw new ApiError('Anmeldung überholt.','STALE',409);
    this.remember({...data,expires_at:Date.now()+data.expires_in*1000});
    try {const membership=await this.membership();if(attempt!==this.loginAttempt)throw new ApiError('Anmeldung überholt.','STALE',409);if(!membership) throw new ApiError('Kein Klassenzugang.','NO_MEMBER',403);return membership;}
    catch(error){if(attempt===this.loginAttempt)this.remember(null);throw error;}
  }
  async token(){
    if(!this.session) throw new ApiError('Bitte melde dich erneut an.','SESSION',401);
    if(this.session.expires_at>Date.now()+30000)return this.session.access_token;
    if(!this.refreshing){
      const generation=this.generation;
      this.refreshing=this.raw('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:this.session.refresh_token}})
        .then(data=>{if(this.generation!==generation)throw new ApiError('Sitzung geändert.','STALE',409);this.remember({...data,expires_at:Date.now()+data.expires_in*1000});return data.access_token;})
        .catch(error=>{if(this.generation===generation&&(error.status===400||error.status===401)){this.remember(null);throw new ApiError('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.','SESSION',401);}throw error;})
        .finally(()=>{this.refreshing=null;});
    }
    return this.refreshing;
  }
  async request(path,options={}){const user=this.session?.user?.id;const token=await this.token();if(!user||user!==this.session?.user?.id)throw new ApiError('Sitzung geändert.','STALE',409);return this.raw(path,{...options,token});}
  async membership(){return (await this.request('/rest/v1/members?select=participant_id,display_name,login_id&user_id=eq.'+encodeURIComponent(this.session.user.id)))[0] || null;}
  async load(){
    const [ranking,votes,profiles]=await Promise.all([this.request('/rest/v1/rpc/leaderboard',{method:'POST',body:{}}),this.request('/rest/v1/votes?select=target_id,score'),this.request('/rest/v1/profiles?select=avatar,color')]);
    this.profileExists=profiles.length>0;
    return {ranking,profile:profiles[0]||{avatar:'🍰',color:'#eaf3fc'},votes:votes.map(v=>({...v,score:Number(v.score)}))};
  }
  async saveProfile(avatar,color){
    const rows=await this.request('/rest/v1/profiles'+(this.profileExists?'?user_id=eq.'+encodeURIComponent(this.session.user.id):''),{method:this.profileExists?'PATCH':'POST',body:this.profileExists?{avatar,color}:{user_id:this.session.user.id,avatar,color}});
    if(!rows?.length)throw new ApiError('Profil konnte nicht gespeichert werden.','PROFILE',403);
    this.profileExists=true;return rows[0];
  }
  async vote(targetId,score){
    return this.request('/rest/v1/votes',{method:'POST',body:{voter_id:this.session.user.id,target_id:targetId,score}});
  }
  async logout(){this.loginAttempt++;const token=this.session?.access_token;this.remember(null);if(token) await this.raw('/auth/v1/logout',{method:'POST',token}).catch(()=>{});}
}

const $=s=>document.querySelector(s);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const configured=Boolean(/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(CONFIG.supabaseUrl) && (CONFIG.publishableKey.startsWith('sb_publishable_') || CONFIG.publishableKey.startsWith('eyJ')));
const api=configured?new ClassApi(CONFIG):null;
const state={profile:{avatar:'🍰',color:'#eaf3fc'},person:null,votes:[],ranking:[],filter:'all',view:'cakes',target:null,score:null,saving:false,loading:false};
const blankRanking=()=>ROSTER.map(p=>({...p,average:null,vote_count:0}));
const number=n=>Number(n).toLocaleString('de-CH',{minimumFractionDigits:1,maximumFractionDigits:1});
const dateLabel=date=>new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Zurich'}).format(new Date(date+'T12:00:00Z'));
function renderSchedule(){const today=swissToday();$('#schedule-list').innerHTML=ROSTER.map(p=>`<div class="schedule-row ${p.date===today?'today':''}"><time datetime="${p.date}">${dateLabel(p.date)}</time><strong>${escape(p.name)}</strong><span>${p.date===today?'Heute am Start':p.date<today?'Bereit zum Bewerten':'Kommt noch'}</span></div>`).join('');}
function notice(message){$('#notice').textContent=message;$('#notice').hidden=!message;}
function dialogError(id,message){$(id).textContent=message;$(id).hidden=!message;}
function showView(view){state.view=view;for(const name of ['cakes','ranking','schedule','rules'])$('#view-'+name).hidden=name!==view;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));}
function render(){
  const signedIn=Boolean(state.person); const ranked=rankCakes(state.ranking.length?state.ranking:blankRanking());
  $('#account').innerHTML=signedIn?`<div class="account-user"><button id="open-profile" aria-label="Profil bearbeiten"><span class="profile-avatar" style="background:${state.profile.color}">${state.profile.avatar}</span><span>${escape(state.person.name)}</span></button><button id="logout">Abmelden</button></div>`:'<button class="button small dark" data-login>Anmelden</button>';
  $('#mode-banner').classList.toggle('live',signedIn);
  $('#mode-banner').innerHTML=signedIn?'Du kannst jeden freigegebenen Kuchen einmal bewerten. Deine Wertung ist endgültig.':configured?'<button data-login>Anmelden</button>, um Kuchen zu bewerten und die Rangliste zu sehen.':'Vorschau: Die Datenbank ist noch nicht verbunden. Es werden keine Stimmen gespeichert.';
  const byId=new Map(ranked.map(p=>[p.id,p]));
  const cakes=ROSTER.filter(p=>{
    const voted=state.votes.some(v=>v.target_id===p.id);
    const cake=byId.get(p.id);const date=signedIn?cake?.baking_date:p.date;return state.filter==='all'||(state.filter==='done'?voted:!voted&&p.id!==state.person?.id&&isOpen({date}));
  });
  $('#cakes').innerHTML=cakes.length?cakes.map(p=>{
    const cake=byId.get(p.id)||p,vote=signedIn?state.votes.find(v=>v.target_id===p.id):null,self=state.person?.id===p.id;
    const date=signedIn?cake.baking_date:p.date;const locked=!isOpen({date});
    const avatar=AVATARS.includes(cake.avatar)?cake.avatar:'🍰',color=COLORS.includes(cake.color)?cake.color:'#eaf3fc';
    return `<article class="cake-card"><div class="person-block"><span class="card-avatar" style="background:${color}" aria-hidden="true">${avatar}</span><div><h3>${escape(p.name)}</h3>${self?'<span class="self-label">Dein Kuchen</span>':''}</div></div><div class="date-block"><span class="row-label">Kuchentermin</span><span>${date?dateLabel(date):'Termin folgt'}</span></div><div class="score-block"><span class="average">${signedIn&&cake.vote_count?number(cake.average)+' / 10':'Noch keine Punkte'}</span><span class="row-label">${signedIn?cake.vote_count||0:0} Bewertungen</span></div><button class="card-button ${vote?'done':self?'self':''}" ${vote||self||locked?'disabled':''} data-vote="${p.id}" aria-label="${vote?'Bereits bewertet':self?'Dein eigener Kuchen':locked?escape(p.name)+': ab '+dateLabel(date):escape(p.name)+' bewerten'}">${vote?'Deine Wertung: '+vote.score+'/10':self?'Dein eigener Kuchen':locked?'Ab '+dateLabel(date):'Bewerten'}</button></article>`;
  }).join(''):`<div class="empty"><span class="empty-icon" aria-hidden="true">${state.filter==='done'?'✦':'✓'}</span><h3>${state.filter==='done'?'Hier kommen deine Wertungen hin.':'Für heute alles bewertet.'}</h3><p>${state.filter==='done'?'Sobald du einen Kuchen bewertest, findest du ihn hier.':'Weitere Kuchen werden an ihrem Termin freigeschaltet.'}</p></div>`;
  $('#progress').hidden=!signedIn;
  $('#progress').innerHTML=`<div class="progress-text"><span>Dein Kuchenpass</span><span>${state.votes.length} von ${ROSTER.length-(ROSTER.some(p=>p.id===state.person?.id)?1:0)} bewertet</span></div><div class="progress-bar"><i style="width:${state.votes.length/(ROSTER.length-(ROSTER.some(p=>p.id===state.person?.id)?1:0))*100}%"></i></div>`;
  renderSchedule();
  const hasVotes=signedIn&&ranked.some(p=>p.vote_count);
  $('#ranking').innerHTML=hasVotes?`<table class="ranking-table"><thead><tr><th>Platz</th><th>Gebacken von</th><th class="track-cell"><span class="sr-only">Punktebalken</span></th><th>Wertungen</th><th>Ø Punkte</th></tr></thead><tbody>${ranked.map(p=>`<tr><td class="rank-num">${p.rank||'–'}</td><td class="rank-name">${escape(p.name)}</td><td class="track-cell"><div class="rank-track"><span style="width:${(p.average||0)*10}%"></span></div></td><td>${p.vote_count}</td><td class="rank-score">${p.vote_count?number(p.average):'–'}</td></tr>`).join('')}</tbody></table>`:`<div class="empty"><span class="empty-icon" aria-hidden="true">♜</span><h3>${signedIn||!configured?'Noch ist alles offen.':'Die Rangliste gehört der Klasse.'}</h3><p>${signedIn?'Mit der ersten Bewertung startet das Rennen.':configured?'Melde dich mit deinem Klassen-Zugang an, um die Ergebnisse zu sehen.':'Sobald die Kuchenliga eingerichtet ist, erscheinen hier die echten Ergebnisse.'}</p></div>`;
  $('#refresh').disabled=!signedIn||state.loading;
}
function loginDialog(){
  dialogError('#login-error',configured?'':'Die Kuchenliga wird noch eingerichtet. Du kannst die Kuchen bereits in der Vorschau ansehen.');
  $('#login-submit').disabled=!configured;$('#login-dialog').showModal();
}
function openVote(id){
  if(configured&&!state.person){loginDialog();return;}
  state.target=ROSTER.find(p=>p.id===id);state.score=null;state.saving=false;
  $('#vote-title').textContent='Der Kuchen von '+state.target.name;
  $('#score-buttons').innerHTML=Array.from({length:10},(_,i)=>`<button type="button" class="score-button" data-score="${i+1}" aria-label="${i+1} ${i===0?'Punkt':'Punkte'}" aria-pressed="false">${i+1}</button>`).join('');
  $('#preview-note').hidden=configured;$('#vote-confirm').checked=false;$('#vote-confirm').disabled=!configured;
  $('#selection-summary').textContent='Wähle deine Punktzahl.';dialogError('#vote-error','');$('#submit-vote').disabled=true;$('#vote-dialog').showModal();
}
function updateSubmit(){ $('#submit-vote').disabled=!(state.person&&state.score&&$('#vote-confirm').checked&&!state.saving); }
let viewGeneration=0;
async function sync(){
  if(!state.person)return;const generation=viewGeneration;const person=state.person.id;state.loading=true;
  try{const data=await api.load();if(generation!==viewGeneration||person!==state.person?.id)return;state.votes=data.votes;state.ranking=data.ranking;state.profile=data.profile;}
  catch(error){if(generation===viewGeneration)throw error;}
  finally{if(generation===viewGeneration){state.loading=false;render();}}
}
function handleError(error){
  if(error.status===401){viewGeneration++;api?.remember(null);state.person=null;state.votes=[];state.ranking=[];render();return 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.';}
  return error.code==='NETWORK'?error.message:'Die Daten konnten nicht geladen werden. Versuche es nochmals.';
}
$('#person').insertAdjacentHTML('beforeend',MEMBERS.map(p=>`<option value="${p.id}">${escape(p.name)}</option>`).join(''));
$('.count').textContent=ROSTER.length;
document.addEventListener('click',async event=>{
  if(event.target.closest('#open-profile')){openProfile();return;}
  const avatarButton=event.target.closest('[data-avatar]');if(avatarButton){profileDraft.avatar=avatarButton.dataset.avatar;renderProfile();return;}
  const colorButton=event.target.closest('[data-color]');if(colorButton){profileDraft.color=colorButton.dataset.color;renderProfile();return;}
  const login=event.target.closest('[data-login]');if(login){loginDialog();return;}
  const close=event.target.closest('[data-close]');if(close){if(state.saving&&close.closest('#vote-dialog'))return;close.closest('dialog').close();return;}
  const nav=event.target.closest('[data-view]');if(nav){showView(nav.dataset.view);return;}
  const filter=event.target.closest('[data-filter]');if(filter){state.filter=filter.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b===filter);b.setAttribute('aria-pressed',String(b===filter));});render();return;}
  const vote=event.target.closest('[data-vote]');if(vote&&!vote.disabled){openVote(vote.dataset.vote);return;}
  const score=event.target.closest('[data-score]');if(score&&!state.saving){state.score=Number(score.dataset.score);document.querySelectorAll('[data-score]').forEach(b=>b.setAttribute('aria-pressed',String(b===score)));$('#selection-summary').textContent=`${state.score} von 10 Punkten für ${state.target.name}`;updateSubmit();return;}
  if(event.target.closest('#logout')){viewGeneration++;state.loading=false;const logout=api.logout();state.person=null;state.votes=[];state.ranking=[];state.profile={avatar:'🍰',color:'#eaf3fc'};state.filter='all';document.querySelector('[data-filter="all"]').click();notice('Du bist abgemeldet.');render();await logout;}
});
$('#start-voting')?.addEventListener('click',()=>{showView('cakes');$('.league').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
$('#vote-confirm').addEventListener('change',updateSubmit);
$('#vote-dialog').addEventListener('cancel',event=>{if(state.saving)event.preventDefault();});
let loginViewAttempt=0;
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!api)return;const attempt=++loginViewAttempt;viewGeneration++;$('#login-submit').disabled=true;$('#login-submit').textContent='Wird angemeldet…';dialogError('#login-error','');
  try{const m=await api.login($('#person').value,$('#password').value);state.person=MEMBERS.find(p=>p.id===(m.login_id||m.participant_id));if(!state.person)throw Error('Unknown member');await sync();$('#password').value='';$('#login-dialog').close();notice('Willkommen am Kuchentisch, '+state.person.name+'!');}
  catch(error){if(attempt!==loginViewAttempt||error.code==='STALE')return;state.person=null;state.votes=[];state.ranking=[];api.remember(null);render();dialogError('#login-error',error.code==='NETWORK'?error.message:error.status===429?'Zu viele Anmeldeversuche. Bitte warte kurz.':'Anmeldung nicht möglich. Prüfe deinen Namen und dein Passwort oder versuche es später erneut.');}
  finally{if(attempt===loginViewAttempt){$('#login-submit').disabled=false;$('#login-submit').textContent='Jetzt anmelden';}}
});
$('#submit-vote').addEventListener('click',async()=>{
  if(state.saving||!state.person||!state.score||!$('#vote-confirm').checked)return;
  try{validateVote({score:state.score,voterId:state.person.id,targetId:state.target.id,votes:state.votes});}catch(error){dialogError('#vote-error',error.message);return;}
  state.saving=true;updateSubmit();$('#submit-vote').textContent='Wird gespeichert…';dialogError('#vote-error','');
  const score=state.score,target=state.target.id,saveGeneration=viewGeneration;
  try{
    await api.vote(target,score);if(saveGeneration!==viewGeneration)return;
    // Only mark saved after the database confirms the INSERT.
    state.votes.push({target_id:target,score});render();$('#vote-dialog').close();notice(`Deine ${score} Punkte sind gespeichert.`);
    try{await sync();}catch(error){notice(`Deine ${score} Punkte sind gespeichert. Die Rangliste konnte noch nicht aktualisiert werden.`);}
  }catch(error){
    if(saveGeneration!==viewGeneration)return;
    if(error.code==='23505'){
      try{await sync();}catch{}
      dialogError('#vote-error','Dieser Kuchen wurde bereits bewertet. Deine gespeicherte Wertung wird geladen.');
      $('#vote-confirm').checked=false;
    }else dialogError('#vote-error',error.status===401?handleError(error):error.code==='42501'?'Dieser Kuchen ist noch nicht freigegeben oder darf von dir nicht bewertet werden.':'Speichern nicht bestätigt. Bitte nochmals versuchen.');
  }finally{state.saving=false;$('#submit-vote').textContent='Verbindlich bewerten';updateSubmit();}
});
$('#refresh').addEventListener('click',async()=>{try{await sync();notice('Die Rangliste ist aktuell.');}catch(error){notice(handleError(error));}});
render();
if(api?.session){
  (async()=>{try{const m=await api.membership();if(!m)throw Error('No member');state.person=MEMBERS.find(p=>p.id===(m.login_id||m.participant_id));await sync();}catch(error){if(error.code==='NETWORK'){notice('Keine Verbindung. Lade die Seite nochmals, sobald du online bist.');}else{api.remember(null);state.person=null;state.votes=[];state.ranking=[];render();notice('Bitte melde dich erneut an.');}}})();
}

let profileDraft={avatar:'🍰',color:'#eaf3fc'};
function renderProfile(){
 $('#profile-preview').textContent=profileDraft.avatar;$('#profile-preview').style.background=profileDraft.color;
 $('#avatar-options').innerHTML=AVATARS.map(a=>`<button type="button" class="avatar-option" data-avatar="${a}" aria-label="Avatar ${a}" aria-pressed="${a===profileDraft.avatar}">${a}</button>`).join('');
 $('#color-options').innerHTML=COLORS.map((c,i)=>`<button type="button" class="color-option" data-color="${c}" style="background:${c}" aria-label="Farbe ${['Hellblau','Rosa','Mint','Vanille','Lavendel','Pfirsich'][i]}" aria-pressed="${c===profileDraft.color}"></button>`).join('');
}
function openProfile(){profileDraft={...state.profile};$('#profile-name').textContent=state.person.name;dialogError('#profile-error','');renderProfile();$('#profile-dialog').showModal();}
$('#save-profile').addEventListener('click',async()=>{
 const generation=viewGeneration;$('#save-profile').disabled=true;dialogError('#profile-error','');
 try{const saved=await api.saveProfile(profileDraft.avatar,profileDraft.color);if(generation!==viewGeneration)return;state.profile={avatar:saved.avatar,color:saved.color};$('#profile-dialog').close();render();notice('Dein Profil ist gespeichert.');try{await sync();}catch{}}
 catch(error){dialogError('#profile-error',handleError(error));}
 finally{$('#save-profile').disabled=false;}
});

let lastCalendarDay=swissToday();setInterval(()=>{const today=swissToday();if(today!==lastCalendarDay){lastCalendarDay=today;render();}},60000);
