import {CONFIG} from './config.js';
// Recovery credentials are kept in memory only, never in browser storage.
class PasswordReset {
 constructor(config,tokenHash,remote=fetch){this.base=config.supabaseUrl.replace(/\/$/,'');this.key=config.publishableKey;this.hash=tokenHash;this.remote=(...args)=>remote(...args);this.access=null;this.done=false;}
 async call(path,method,body,token){
  let response;try{response=await this.remote(this.base+path,{method,headers:{apikey:this.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{throw Error('Keine Verbindung. Bitte versuche es nochmals.');}
  const data=await response.json().catch(()=>null);
  if(!response.ok){if(path.endsWith('/verify'))throw Error('Dieser Link ist abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen an.');if(response.status===422)throw Error('Dieses Passwort ist zu schwach oder entspricht deinem bisherigen Passwort. Wähle ein anderes, stärkeres Passwort.');if(response.status===401){this.access=null;throw Error('Die Sitzung ist abgelaufen. Bitte fordere einen neuen Link an.');}throw Error('Das neue Passwort wurde nicht bestätigt. Bitte versuche es nochmals.');}
  return data;
 }
 async save(password,repeat){
  if(this.done)throw Error('Das Passwort wurde bereits geändert.');
  if(typeof password!=='string'||password.length<12||password.length>128)throw Error('Dein Passwort muss 12 bis 128 Zeichen lang sein.');
  if(password!==repeat)throw Error('Die beiden Passwörter stimmen nicht überein.');
  if(!this.hash&&!this.access)throw Error('Bitte öffne deinen persönlichen Wiederherstellungslink.');
  if(!this.access){const data=await this.call('/auth/v1/verify','POST',{token_hash:this.hash,type:'recovery'});if(!data?.access_token)throw Error('Der Link konnte nicht bestätigt werden. Bitte fordere einen neuen an.');this.access=data.access_token;this.hash=null;}
  await this.call('/auth/v1/user','PUT',{password},this.access);this.done=true;this.access=null;
 }
}

const $=s=>document.querySelector(s),params=new URLSearchParams(location.hash.slice(1));
const token=params.get('token_hash');
// Remove bearer links from the current history entry immediately.
history.replaceState(null,'',location.pathname);
window.addEventListener('hashchange',()=>{if(location.hash)location.reload();});
const error=message=>{$('#error').textContent=message;$('#error').hidden=!message;};
if(token){
 const flow=new PasswordReset(CONFIG,token);let busy=false;
 $('#reset-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;$('#reset-submit').disabled=true;error('');
  try{await flow.save($('#reset-password').value,$('#reset-repeat').value);$('#reset-password').value='';$('#reset-repeat').value='';$('#reset-form').hidden=true;$('#success').textContent='Dein neues Passwort ist gespeichert. Melde dich mit deinem Namen und dem neuen Passwort an.';$('#success').hidden=false;}
  catch(e){error(e.message);}finally{busy=false;$('#reset-submit').disabled=false;}
 });
}else{$('#reset-form').hidden=true;error('Bitte öffne deinen persönlichen Wiederherstellungslink.');}
