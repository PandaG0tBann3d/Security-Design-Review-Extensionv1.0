
function sevKey(k){
  k=(k||'informational').toLowerCase();
  if(k.startsWith('c')) return 'critical';
  if(k.startsWith('h')) return 'high';
  if(k.startsWith('m')) return 'medium';
  if(k.startsWith('l')) return 'low';
  return 'informational';
}
const order=['critical','high','medium','low','informational'];
document.addEventListener('DOMContentLoaded',()=>{
  chrome.storage.local.get('lastResults',res=>{
    const data=(res.lastResults||[]).slice().sort((a,b)=>order.indexOf(sevKey(a.severity))-order.indexOf(sevKey(b.severity)));
    const counts={critical:0,high:0,medium:0,low:0,informational:0};
    const sumBody=document.getElementById('tbody');
    const detBody=document.getElementById('detailBody');
    data.forEach((v,i)=>{
      const sev=sevKey(v.severity);
      counts[sev]++;
      const tr=document.createElement('tr');tr.className=sev;
      ['name','description','severity','impact','remediation'].forEach(k=>{const td=document.createElement('td');td.textContent=v[k]||'';tr.appendChild(td);});
      sumBody.appendChild(tr);
      const dr=document.createElement('tr');dr.className=sev;
      dr.innerHTML=`<td>${i+1}</td><td>${v.name}</td><td>${v.evidence||'N/A'}</td><td>${v.poc||'N/A'}</td>`;
      detBody.appendChild(dr);
    });
    document.getElementById('count-summary').textContent='('+data.length+')';
    
    
    });
  });
  document.getElementById('tab-summary').onclick=()=>{document.getElementById('summary').classList.add('active');document.getElementById('details').classList.remove('active');};
  document.getElementById('tab-details').onclick=()=>{document.getElementById('details').classList.add('active');document.getElementById('summary').classList.remove('active');};