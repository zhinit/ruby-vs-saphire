const KEY = 'ruby-sapphire-session';
let configuration;
let refreshInFlight;
export function savedSession() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function save(session) {
  if(session?.access_token) localStorage.setItem(KEY, JSON.stringify(session));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('sessionchange'));
}
export async function config() {
  if (!configuration) {
    const response=await fetch('/api/config');
    const data=await response.json();
    if(!response.ok)throw new Error(data.detail || 'Backend unavailable. Start the app with npm run dev.');
    configuration=data;
  }
  return configuration;
}
async function authRequest(path, body, token) {
  const {url,key}=await config();
  const response=await fetch(`${url}/auth/v1/${path}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.msg || data.error_description || data.message || 'Authentication failed.');
  return data;
}
export async function authenticate(mode,{email,password,name}) {
  const data=await authRequest(mode==='signup'?'signup':'token?grant_type=password',{email,password,...(mode==='signup'?{data:{name}}:{})});
  if(data.access_token)save({...data,expires_at:data.expires_at || Math.floor(Date.now()/1000)+data.expires_in});
  return data;
}
export async function token() {
  const current=savedSession();
  if(!current)return null;
  if(current.expires_at*1000>Date.now()+60000)return current.access_token;
  if(!refreshInFlight)refreshInFlight=(async()=>{
    try {
      const data=await authRequest('token?grant_type=refresh_token',{refresh_token:current.refresh_token});
      // A sign-out or another tab's login must not be undone by a late refresh.
      if(savedSession()?.refresh_token!==current.refresh_token)return savedSession()?.access_token || null;
      save({...data,expires_at:data.expires_at || Math.floor(Date.now()/1000)+data.expires_in});return data.access_token;
    } catch(e) {throw new Error('Could not refresh your session. Please sign in again.');}
    finally {refreshInFlight=null;}
  })();
  return refreshInFlight;
}
export async function signOut() {
  const current=savedSession();save(null);
  if(current)await authRequest('logout',null,current.access_token).catch(()=>{});
}
export async function api(path,body) {
  const access=await token();
  let response;
  try {response=await fetch(`/api${path}`,{method:body===undefined?'GET':'POST',headers:{...(access?{Authorization:`Bearer ${access}`} : {}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}catch{throw new Error('Cannot reach the backend. Check your connection and try again.');}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){if(response.status===401)save(null);throw new Error(typeof data.detail==='string'?data.detail:'The request failed. Please try again.');}
  return data;
}
export async function compressPhoto(file) {
  if(!file.type.startsWith('image/'))throw new Error('Choose a photo.');
  if(file.size>20*1024*1024)throw new Error('Choose a photo smaller than 20 MB.');
  const image=await createImageBitmap(file).catch(()=>{throw new Error('Could not read this photo. Try a JPEG, PNG, or WebP image.');});
  const scale=Math.min(1,1600/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
  const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);image.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.8));
  if(!blob || blob.size>2*1024*1024)throw new Error('Photo is still too large. Try a smaller image.');
  return blob;
}
export async function uploadPhoto(game,task,file) {
  const blob=await compressPhoto(file);
  const target=await api(`/games/${game}/tasks/${task}/upload`,{content_type:blob.type,size:blob.size});
  const {key}=await config();
  const response=await fetch(target.url,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${await token()}`,'Content-Type':blob.type,'x-upsert':'false'},body:blob});
  if(!response.ok)throw new Error('Photo upload failed. The task may already be complete or the game may have ended. Refresh and try again.');
  return api(`/games/${game}/tasks/${task}/complete`,{photo_path:target.path});
}
export async function photoUrl(path) {
  const {url,key}=await config();
  const response=await fetch(`${url}/storage/v1/object/authenticated/evidence/${path.split('/').map(encodeURIComponent).join('/')}`,{headers:{apikey:key,Authorization:`Bearer ${await token()}`}});
  if(!response.ok)throw new Error('Unable to load this photo.');
  return URL.createObjectURL(await response.blob());
}
