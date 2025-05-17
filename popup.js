/* popup.js  – with service-worker wake-up & persistent log */

const keyEl  = document.getElementById('key');
const logsEl = document.getElementById('logs');

/* ---------- encryption helpers (unchanged) ---------- */
async function getCryptoKey(){
  let store = await chrome.storage.local.get('cryptoSalt');
  if(!store.cryptoSalt){
    store.cryptoSalt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
    await chrome.storage.local.set({cryptoSalt: store.cryptoSalt});
  }
  const salt   = new Uint8Array(store.cryptoSalt);
  const base   = await crypto.subtle.importKey('raw', salt, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations:1000, hash:'SHA-256' },
    base,
    { name:'AES-GCM', length:256 },
    false,
    ['encrypt','decrypt']
  );
}
async function encrypt(text){
  const key = await getCryptoKey();
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...iv) + String.fromCharCode(...new Uint8Array(buf)));
}
async function decrypt(b64){
  try{
    const bytes = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
    const iv    = bytes.slice(0,12);
    const data  = bytes.slice(12);
    const key   = await getCryptoKey();
    const buf   = await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, data);
    return new TextDecoder().decode(buf);
  }catch{return '';}
}

/* ---------- persistent logs ---------- */
function addLog(msg){
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logsEl.textContent += line + "\n";
  logsEl.scrollTop = logsEl.scrollHeight;
  chrome.storage.local.get('logHist', r=>{
    const hist = r.logHist || [];
    hist.push(line);
    if (hist.length > 500) hist.shift();
    chrome.storage.local.set({ logHist: hist });
  });
}

/* restore key + logs on popup open */
(async()=>{
  const store = await chrome.storage.local.get(['apiKeyEnc','logHist']);
  if (store.apiKeyEnc) keyEl.value = await decrypt(store.apiKeyEnc);
  (store.logHist || []).forEach(l => logsEl.textContent += l + "\n");
})();

/* ---------- NEW: keep-alive helper ---------- */
function ensureWorkerAwake(){
  return new Promise(res=>{
    chrome.runtime.sendMessage({action:'ping'}, ()=>{
      // If the worker was sleeping, first call sets lastError; ping again after wake-up.
      if (chrome.runtime.lastError){
        setTimeout(()=>chrome.runtime.sendMessage({action:'ping'}, res), 150);
      } else {
        res();
      }
    });
  });
}

/* ---------- UI actions ---------- */
document.getElementById('save').onclick = async ()=>{
  const raw = keyEl.value.trim();
  if (!raw) return addLog('Key empty');
  const enc = await encrypt(raw);
  await chrome.storage.local.set({ apiKeyEnc: enc });
  addLog('Key saved securely');
};

document.getElementById('analyze').onclick = async ()=>{
  const { apiKeyEnc } = await chrome.storage.local.get('apiKeyEnc');
  if (!apiKeyEnc) return addLog('Save key first');

  const key = await decrypt(apiKeyEnc);
  if (!key) return addLog('Key decrypt failed');

  /* wake the service-worker */
  await ensureWorkerAwake();

  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab) return addLog('No active tab');
  chrome.runtime.sendMessage(
    { action:'startAnalysis', tabId: tab.id, apiKey: key },
    ()=> addLog('Analysis triggered')
  );
};

/* live log stream */
const port = chrome.runtime.connect({name:'log'});
port.onMessage.addListener(m=>{ if (m.log) addLog(m.log); });
