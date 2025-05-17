
# Security Design Review Chrome Extension  
_Comprehensive client‑side VAPT helper (MV3 — v0.50.2)_

---

## Features
* **One‑click scan** – collects HTML, headers, JS, PHP & storage data  
* **OpenAI‑powered analysis** – GPT‑4o‑mini (`temperature 0.4`, `max_tokens 2048`)  
* **Encrypted API key** – AES‑GCM with extension‑unique salt  
* **Persistent log pane** – popup shows live logs, remembers last 500 lines  
* **Dashboard** – severity‑sorted tables and severity counts (`C:H:M:L:I`)  

---

## Installation
1. Download / unzip the folder.  
2. Visit `chrome://extensions/`, enable **Developer mode**.  
3. Click **Load unpacked** and select the extension folder.

---

## Quick Start
1. Click the extension icon.  
2. Paste your OpenAI key → **Save** (stored encrypted).  
3. Open any HTTP/HTTPS page to analyse.  
4. Click **Analyze** in the popup.  
   *A new tab opens with the results; logs stream in the popup.*

---

## Flow Diagram
```mermaid
flowchart TD
  A[Popup • Analyze] -->|ensureWorkerAwake()| B(startAnalysis)
  B --> C[content.js collectBasics]
  C --> D[background.js static scans]
  subgraph Net/TLS
    X[onBeforeRequest] -->|pwd in URL / HTTP| nFinds
    Y[onCompleted] --> hdrs
  end
  D & nFinds & hdrs --> E[buildPrompt → callLLM]
  E --> F[clean + JSON.parse]
  F --> G[store lastResults + open dashboard]
  G --> H[dashboard.js render tables + counts]
```

---

## File Guide

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 configuration |
| `background.js` | Service‑worker: scans, prompt, LLM call, ping handler |
| `content.js` | In‑page collector: HTML, scripts, storage, etc. |
| `popup.html / popup.js` | Dark‑theme UI, encrypted key, persistent logs |
| `dashboard.html / dashboard.js` | Results UI, severity sorting, counts |
| `chart.min.js` | (stub, unused since v21) |

---

## Customising Scans

| Surface | Add‑on idea |
|---------|-------------|
| **CSP / CORS** | Parse `Content‑Security‑Policy`, `Access‑Control‑Allow‑Origin` |
| **Cookies** | Flag missing `Secure` / `HttpOnly` |
| **Service Workers** | Detect `navigator.serviceWorker.register` |
| **Mixed Content** | List `http:` sub‑resources on an HTTPS page |

Extend `scanScripts`, `scanPhp`, or add new collectors and reference them in `buildPrompt()`.

---

## Troubleshooting

| Log message | Meaning & Fix |
|-------------|---------------|
| *runtime.lastError … receiving end does not exist* | Worker was asleep – popup now pings; reload if persists. |
| *collectBasics failed* | Content script blocked (non‑http page or CSP). |
| *LLM error* | Invalid API key or quota exhausted. |
| *JSON parse error* | Model didn’t return valid JSON – raise `max_tokens` or retry. |

---

## License
MIT — free to use, just keep attribution.
