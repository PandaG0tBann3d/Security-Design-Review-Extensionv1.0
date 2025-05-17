// background.js  (dynamic prompt, more scans, higher token limit)

const logPorts = [];
function log(m) {
  const entry = `[${new Date().toLocaleTimeString()}] ${m}`;
  console.log(entry);
  logPorts.forEach(p => { try { p.postMessage({ log: entry }); } catch {} });
}
chrome.runtime.onConnect.addListener(p => {
  if (p.name === 'log') {
    logPorts.push(p);
    p.onDisconnect.addListener(() => {
      const i = logPorts.indexOf(p);
      if (i > -1) logPorts.splice(i, 1);
    });
  }
});

/* ── capture headers ── */
const headersByTab = {};
chrome.webRequest.onCompleted.addListener(
  d => { if (d.type === 'main_frame') headersByTab[d.tabId] = d.responseHeaders || []; },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

/* ── light Net / TLS flags ── */
let networkFindings = [], tlsFindings = [];
chrome.webRequest.onBeforeRequest.addListener(
  det => {
    try {
      const u = new URL(det.url);
      if (/password=|pwd=|pass=/i.test(u.search))
        networkFindings.push({ url: det.url, issue: 'password in query', evidence: u.search });
      if (u.protocol === 'http:')
        tlsFindings.push({ url: det.url, issue: 'unencrypted HTTP' });
    } catch {}
  },
  { urls: ['<all_urls>'] },
  []
);

/* ── util ── */
const sendToTab = (id, msg) => new Promise(r => chrome.tabs.sendMessage(id, msg, r));

/* ── richer JS scan (inline + external) ── */
async function scanScripts(list, inlineSnips) {
  const regexes = [
    { rx: /eval\(/,              tag: 'eval()' },
    { rx: /document\.write\(/,   tag: 'document.write()' },
    { rx: /innerHTML\s*=/,       tag: 'innerHTML =' },
    { rx: /\blocalStorage\b/,    tag: 'localStorage' }
  ];

  const findings = [];

  /* external */
  for (const src of list.slice(0, 20)) {
    try {
      const txt = await fetch(src, { mode:'no-cors' }).then(r=>r.text());
      const hits = regexes.filter(r=>r.rx.test(txt)).map(r=>r.tag);
      if (hits.length) findings.push({ url: src, issues: hits });
    } catch {}
  }
  /* inline */
  inlineSnips.forEach((code, i) => {
    const hits = regexes.filter(r=>r.rx.test(code)).map(r=>r.tag);
    if (hits.length) findings.push({ url: `inline[${i}]`, issues: hits });
  });

  return findings;
}

/* ── small PHP probe ── */
async function scanPhp(urls) {
  const out = [];
  for (const u of urls.slice(0, 10)) {
    try {
      const res = await fetch(u, { mode:'no-cors' });
      out.push({ url: u, status: res.status });
    } catch {}
  }
  return out;
}

/* ── better prompt ── */
function buildPrompt(b, headers, jsFind, phpFind) {
  const hdrLines = headers.slice(0,5).map(h=>`${h.name}: ${h.value}`).join('\\n');
  const jsList   = jsFind.slice(0,5).map(f=>`${f.url} ▸ ${f.issues.join(',')}`).join('\\n');
  const cookie   = b.cookieStr || 'N/A';

  return `
🔐  SECURITY DESIGN REVIEW

Return ONLY a JSON array (no markdown, no fencing).
Each object must include:
name, description, severity (Critical|High|Medium|Low|Informational),
impact, remediation, evidence, poc.

----------------------- CONTEXT -----------------------
HTML snippet (trimmed):
${b.htmlSnippet}

Key response headers:
${hdrLines}

JS findings (first 5):
${jsList}

Cookie string: ${cookie}
LocalStorage keys: ${b.localKeys.join(', ') || 'none'}
SessionStorage keys: ${b.sessionKeys.join(', ') || 'none'}

Counts → JS:${jsFind.length}  PHP:${phpFind.length}
Network flags:${networkFindings.length}  TLS flags:${tlsFindings.length}
PageType:${b.pageType}  Inputs:${b.inputFields.length}
------------------------------------------------------
`.trim();
}

/* ── LLM call ── */
async function callLLM(prompt, key) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
    body: JSON.stringify({
      model:'gpt-4o-mini',
      messages:[{role:'user',content:prompt}],
      temperature:0.4,
      max_tokens:2048
    })
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.choices[0].message.content;
}
const clean = t => {
  let s = t.trim();
  if (s.startsWith('```')) s=s.replace(/^```[a-z]*\\n/i,'').replace(/```$/,'').trim();
  const a=s.indexOf('['),b=s.lastIndexOf(']');
  return (a!==-1 && b!==-1) ? s.slice(a,b+1) : s;
};

/* ── master routine ── */
async function startAnalysis(tabId, key) {
  chrome.storage.local.remove('lastResults');
  log(`► Scan tab ${tabId}`);

  /* collect */
  const basics = await sendToTab(tabId,{action:'collectBasics'});
  if(!basics?.ok){log('collectBasics failed');return;}
  const headers = headersByTab[tabId]||[];

  /* scans */
  const jsFind = await scanScripts(basics.data.scriptSrcs, basics.data.inlineSnips);
  const phpFind = await scanPhp(basics.data.phpLinks);

  /* prompt */
  const prompt = buildPrompt(basics.data, headers, jsFind, phpFind);
  log('Calling LLM…');

  let raw; try { raw = await callLLM(prompt, key); } catch(e){ log('LLM error'); return; }
  let results; try { results = JSON.parse(clean(raw)); } catch { log('JSON parse err'); return; }

  chrome.storage.local.set({lastResults:results}, () =>
    chrome.tabs.create({url: chrome.runtime.getURL('dashboard.html')})
  );
}

chrome.runtime.onMessage.addListener((req, sender, send) => {
  /* NEW: keep-alive ping */
  if (req.action === 'ping'){ send({ok:true}); return; }

  if (req.action === 'getHeaders'){
    send({ headers: headersByTab[req.tabId] || [] });
  }
  else if (req.action === 'startAnalysis'){
    startAnalysis(req.tabId, req.apiKey);
    send({ started: true });
  }
});
