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
4. When it finishes: tap **📋 Salin Semua** → open admin.html → Registry Sync (JKM) →
   paste → Analisa. The parser already ignores nav/footer noise, so the raw capture
   works as-is.

## The bookmarklet code (copy this entire line into the bookmark's URL)

```
javascript:(async()=>{const D=1200,CAP=400;let texts=[],stop=false;const ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;';ov.innerHTML='<div id="jkmst" style="font-size:18px;font-weight:700;margin-bottom:14px;">Memulakan...</div><button id="jkmcancel" style="padding:10px 22px;border-radius:10px;border:none;font-weight:700;">Batal</button>';document.body.appendChild(ov);document.getElementById('jkmcancel').onclick=()=>{stop=true};const st=t=>{document.getElementById('jkmst').textContent=t};const grab=doc=>{texts.push(doc.body.innerText)};grab(document);let doc=document,n=1;while(!stop&&n<CAP){const nx=[...doc.querySelectorAll('a')].find(a=>a.textContent.trim()==='\u00bb'&&a.href&&!a.href.endsWith('#'));if(!nx)break;st('Halaman '+(n+1)+' \u2014 memuatkan...');try{const r=await fetch(nx.href,{credentials:'same-origin'});const h=await r.text();doc=new DOMParser().parseFromString(h,'text/html');[...doc.querySelectorAll('a')].forEach(a=>{try{a.href=new URL(a.getAttribute('href'),r.url).href}catch(e){}});grab(doc);n++}catch(e){st('Ralat halaman '+(n+1)+' \u2014 hasil setakat ini dikekalkan');break}await new Promise(r=>setTimeout(r,D))}const blob=texts.join('\n');ov.innerHTML='<div style="font-size:16px;font-weight:700;margin-bottom:12px;">Selesai \u2014 '+n+' halaman ('+blob.length.toLocaleString()+' aksara)</div><button id="jkmcopy" style="padding:12px 26px;border-radius:10px;border:none;font-weight:700;font-size:15px;background:#0D9488;color:#fff;">\ud83d\udccb Salin Semua</button><textarea id="jkmta" style="width:90%;height:30%;margin-top:12px;font-size:10px;"></textarea><button id="jkmclose" style="margin-top:10px;padding:8px 18px;border-radius:10px;border:none;font-weight:700;">Tutup</button>';document.getElementById('jkmta').value=blob;document.getElementById('jkmcopy').onclick=async()=>{try{await navigator.clipboard.writeText(blob);st?0:0;document.getElementById('jkmcopy').textContent='\u2705 Disalin!'}catch(e){const ta=document.getElementById('jkmta');ta.focus();ta.select();document.execCommand('copy');document.getElementById('jkmcopy').textContent='\u2705 Disalin!'}};document.getElementById('jkmclose').onclick=()=>ov.remove();})();
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
