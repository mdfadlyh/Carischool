# JKM Capture Bookmarklet — turns 360 pages into one tap

## What this is (and why it's OK when the robot wasn't)

A bookmarklet is a bookmark whose "URL" is a tiny script. When you're ON the JKM results
page and tap it, it walks the « 1 2 3 … » pagination inside your own Safari session,
collects each page's text, and shows you a "Salin Semua" button — one paste into admin's
Registry Sync tab instead of 360.

This is different from the GitHub robot in every way that mattered: it runs only when you
tap it, from your phone, on your session, at a polite pace (1.2s between pages, ~8–10 min
for the full directory), fetching exactly the pages you'd otherwise tap through by hand.
It automates your clicking, not access. Keep it that way — the rules baked in:
- Never schedule it or run it from a server.
- Keep the built-in delay (don't "speed it up").
- Twice-a-year cadence, same as your sync ritual.

## One-time iPhone setup (2 minutes)

1. In Safari, bookmark any page (Share → Add Bookmark) and name it **JKM Capture**.
2. Open this file, copy the entire one-line code in the block below.
3. Safari → Bookmarks → Edit → tap **JKM Capture** → replace the URL field with the
   pasted code → Done.

## Each sync (twice a year)

1. Open https://www.jkm.gov.my/main/taska (filter by negeri first if you only want one
   state — the bookmarklet captures whatever result set is on screen).
2. Bookmarks → tap **JKM Capture**.
3. Watch the counter ("Halaman 37/360…"). Keep the screen on. Batal button stops it
   early — everything captured so far is kept.
4. When it finishes: tap **📋 Bahagian 1** → open admin.html → Registry Sync (JKM) →
   paste → Analisa → run the SQL → Kosongkan → repeat for Bahagian 2, 3... The parser already ignores nav/footer noise, so the raw capture
   works as-is.

## The bookmarklet code — v7 (2026-10-16; copy this entire line into the bookmark's URL)

v7 rebuilt from the learnings log because v2-v6 were only ever shipped in chat and this
file still held v1 (the page-1-only version). It carries every recorded fix:
- v2: reads fetched pages with script/style/noscript stripped + textContent (innerText
  is unreliable on DOMParser documents).
- v3: checks JKM's own "Paparan X - Y daripada Z" line advances on every page; stops
  with a Malay reason on screen instead of silently re-capturing page 1.
- v4: drops <select>/<option> lists and trims each page to Paparan..HUBUNGI KAMI (the
  7-million-character paste that froze Safari).
- v5/v6: output split into Bahagian of 40 pages (~400 records); copy buttons revert
  their label so a second tap visibly re-copies.
- v7: newline after each block element, so the first school name doesn't glue onto the
  Paparan line. No "%" anywhere (Safari URL-decodes bookmarklets) and ASCII-only escapes.
Tested 2026-10-16 against a 95-page mock of JKM's markup: 950/950 records parsed by the
live admin.html parseJkmPaste across 3 Bahagian; a stuck-pagination mock stopped at
page 3 with the warning. Not yet run on the real jkm.gov.my -- first live run should be
one small state.

```
javascript:(async()=>{ const D=1200,CAP=400,PER=40; let P=[],stop=false,prev=null,why=''; const ov=document.createElement('div'); ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:2147483647;color:#fff;font:16px sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;overflow:auto;'; ov.innerHTML='<div id="jst" style="font-weight:700;margin-bottom:14px">Memulakan...</div><button id="jx" style="padding:10px 22px;border-radius:10px;border:0;font-weight:700">Batal</button>'; document.body.appendChild(ov); const $=i=>document.getElementById(i); $('jx').onclick=()=>{stop=true;why='Dibatalkan'}; const st=t=>{$('jst').textContent=t}; const txt=d=>{const b=d.body.cloneNode(true);b.querySelectorAll('script,style,noscript,select,option,iframe').forEach(e=>e.remove());b.querySelectorAll('p,div,li,tr,td,th,h1,h2,h3,h4,h5,h6,br,section,article,table').forEach(e=>e.after('\n'));let t=b.textContent.replace(/[ \t\r\u00a0]+/g,' ').replace(/ ?\n ?/g,'\n').replace(/\n+/g,'\n');const a=t.search(/Paparan\s+\d/i);if(a>0)t=t.slice(a);const z=t.search(/HUBUNGI KAMI/i);if(z>0)t=t.slice(0,z);return t.trim()}; const rng=t=>{const m=t.match(/Paparan\s+([\d,]+)\s*[-\u2010-\u2014\u2212]\s*([\d,]+)\s+daripada\s+([\d,]+)/i);return m?m.slice(1,4).map(x=>+x.replace(/,/g,'')):null}; const nxt=d=>[...d.querySelectorAll('a')].find(a=>a.textContent.trim()==='\u00bb'&&a.href&&!/#$|^javascript/i.test(a.href)); let doc=document,t=txt(doc),r=rng(t); if(!r)why='Tiada baris "Paparan ... daripada" di halaman ini. Buat carian JKM dahulu.'; P.push(t);prev=r; while(!stop&&r&&P.length<CAP){ const nx=nxt(doc); if(!nx){if(r[1]<r[2])why='Pautan \u00bb tiada sebelum rekod terakhir.';break} st('Halaman '+(P.length+1)+' / '+Math.ceil(r[2]/Math.max(1,r[1]-r[0]+1))+' ... rekod '+r[1]+' drpd '+r[2]); await new Promise(s=>setTimeout(s,D)); if(stop)break; try{ const q=await fetch(nx.href,{credentials:'same-origin'}); doc=new DOMParser().parseFromString(await q.text(),'text/html'); doc.querySelectorAll('a[href]').forEach(a=>{try{a.href=new URL(a.getAttribute('href'),q.url).href}catch(e){}}); t=txt(doc);r=rng(t); if(!r){why='Halaman '+(P.length+1)+' tiada baris "Paparan". Berhenti di sini.';break} if(r[0]<=prev[0]){why='Halaman tidak bergerak (rekod '+r[0]+' lagi). Berhenti supaya tiada data berulang.';break} P.push(t);prev=r; }catch(e){why='Ralat rangkaian di halaman '+(P.length+1)+'. Hasil setakat ini disimpan.';break} } const B=[];for(let i=0;i<P.length;i+=PER)B.push({a:i+1,b:Math.min(i+PER,P.length),t:P.slice(i,i+PER).join('\n')}); const done=prev?prev[1]:0,tot=prev?prev[2]:0; ov.innerHTML='<div style="font-weight:700;font-size:17px;margin-bottom:6px">'+(done>=tot&&tot?'\u2705 Lengkap':'\u26a0\ufe0f Tidak lengkap')+' \u2014 rekod '+done+' drpd '+tot+' ('+P.length+' halaman)</div>'+(why?'<div style="color:#FCD34D;font-size:14px;margin-bottom:10px">'+why+'</div>':'')+'<div style="font-size:13px;margin-bottom:10px">Salin satu bahagian, tampal di admin, Analisa, jalankan SQL, kemudian Kosongkan sebelum bahagian seterusnya. Butang boleh ditekan semula.</div><div id="jbs" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center"></div><textarea id="jta" style="width:92vw;height:22vh;margin-top:12px;font-size:10px" readonly></textarea><button id="jcl" style="margin-top:10px;padding:8px 18px;border-radius:10px;border:0;font-weight:700">Tutup</button>'; B.forEach((c,i)=>{const b=document.createElement('button');const L='\ud83d\udccb Bahagian '+(i+1)+' (hlm '+c.a+'\u2013'+c.b+')';b.textContent=L;b.style.cssText='padding:11px 16px;border-radius:10px;border:0;font-weight:700;background:#0D9488;color:#fff';b.onclick=async()=>{$('jta').value=c.t;let ok=false;try{await navigator.clipboard.writeText(c.t);ok=true}catch(e){const a=$('jta');a.focus();a.select();try{ok=document.execCommand('copy')}catch(e2){}}b.textContent=ok?'\u2705 Disalin \u2014 Bahagian '+(i+1):'Pilih teks di kotak & Copy';setTimeout(()=>{b.textContent=L},2500)};$('jbs').appendChild(b)}); $('jcl').onclick=()=>ov.remove(); })();
```

## How it works / limits

- It follows the » (next) link page by page, so it works whatever filter you applied,
  and stops at the last page or the 400-page safety cap.
- Each fetched page's full text is captured; the Registry Sync parser was built to
  ignore the surrounding noise, so no fragile HTML selectors are involved — if JKM
  redesigns, the parser sees whatever you'd see.
- If a page fails mid-run (network blip), it stops gracefully and keeps everything
  captured so far — Salin Semua still works; note the page number and resume by
  navigating there and running it again.
- If the copy button fails on very large blobs, the textarea below it holds the full
  text — select-all manually from there.
- If the » link is missing on JKM's first page (layout change), tap to page 2 once
  manually and run from there.
