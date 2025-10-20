(function(){
  // Prefer official Fluent icons via Iconify CDN. Fall back to local renderers if CDN unavailable.
  const ICONIFY_SRC = 'https://code.iconify.design/2/2.2.1/iconify.min.js';
  let iconifyRequested = false;
  function ensureIconify(){
    if(typeof window !== 'undefined' && window.Iconify) return true;
    if(iconifyRequested) return false;
    try{
      const existing = document.getElementById('iconify-cdn-script');
      if(existing){ iconifyRequested = true; return false; }
      const s = document.createElement('script');
      s.id = 'iconify-cdn-script'; s.src = ICONIFY_SRC; s.async = true; s.defer = true;
      s.onload = ()=>{ try{ window.__iconifyLoaded = true; }catch(e){} };
      document.head.appendChild(s);
      iconifyRequested = true;
    }catch(e){}
    return false;
  }
  // Try to inline official Microsoft Fluent System Icons from local static files if present.
  async function tryInlineOfficial(el, id, size){
    try{
      if(!(id||'').startsWith('fluent:')) return false;
      const meta = (id||'').slice(7); // after 'fluent:'
      // Parse pattern: name-size-style, e.g., apps-list-20-regular
      const parts = meta.split('-');
      if(parts.length < 3) return false;
      const style = parts.pop(); // regular | filled
      const sz = parts.pop();
      const nameSlug = parts.join('-');
      const nameUnderscore = nameSlug.replace(/-/g,'_');
      const words = nameSlug.split('-').map(w=> w.charAt(0).toUpperCase()+w.slice(1));
      const folderGuess = words.join(' ');
      // Known folder overrides (in case of mismatches)
      const FOLDER_OVERRIDES = {
        'apps-list':'Apps List',
        'chevron-left':'Chevron Left',
        'chevron-right':'Chevron Right',
        'dismiss-square-multiple':'Dismiss Square Multiple',
        'panel-left':'Panel Left',
        'arrow-left':'Arrow Left',
        'arrow-sync':'Arrow Sync',
        'arrow-exit':'Arrow Exit',
        'arrow-download':'Arrow Download',
        'arrow-trending':'Arrow Trending',
        'clipboard-paste':'Clipboard Paste',
        'people-community':'People Community',
        'more-horizontal':'More Horizontal',
        'key-reset':'Key Reset',
      };
      const folder = FOLDER_OVERRIDES[nameSlug] || folderGuess;
      const file = `ic_fluent_${nameUnderscore}_${sz}_${style}.svg`;
      const url = `/static/webos/fluent/assets/${folder}/SVG/${file}`;
      const res = await fetch(url, { cache: 'force-cache' });
      if(!res.ok) return false;
      const svgText = await res.text();
      // Inline the SVG; ensure width/height and currentColor
      el.innerHTML = svgText;
      const svg = el.querySelector('svg');
      if(svg){
        const s = parseInt(size||20,10)||20;
        svg.setAttribute('width', String(s));
        svg.setAttribute('height', String(s));
        // Ensure currentColor is used if not already
        if(!svg.getAttribute('fill')) svg.setAttribute('fill', 'currentColor');
      }
      return true;
    }catch(e){ return false; }
  }

  // Local SVG icon pack: minimal, consistent line icons. All paths are original simple shapes.
  function svgEl(tag){ return document.createElementNS('http://www.w3.org/2000/svg', tag); }
  function makeBase(size){
    const svg = svgEl('svg');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.setAttribute('width', String(size||20));
    svg.setAttribute('height', String(size||20));
    svg.setAttribute('fill','none');
    svg.setAttribute('stroke','currentColor');
    svg.setAttribute('stroke-width','1.8');
    svg.setAttribute('stroke-linecap','round');
    svg.setAttribute('stroke-linejoin','round');
    return svg;
  }
  // Regular (outline) icons
  const draw = {
    search(){ const svg=makeBase(); const c=svgEl('circle'); c.setAttribute('cx','11'); c.setAttribute('cy','11'); c.setAttribute('r','6'); const l=svgEl('line'); l.setAttribute('x1','16'); l.setAttribute('y1','16'); l.setAttribute('x2','21'); l.setAttribute('y2','21'); svg.append(c,l); return svg; },
    chevron_left(){ const svg=makeBase(); const p=svgEl('polyline'); p.setAttribute('points','15 18 9 12 15 6'); svg.append(p); return svg; },
    chevron_right(){ const svg=makeBase(); const p=svgEl('polyline'); p.setAttribute('points','9 6 15 12 9 18'); svg.append(p); return svg; },
  add(){ const svg=makeBase(); const v=svgEl('line'); v.setAttribute('x1','12'); v.setAttribute('y1','6'); v.setAttribute('x2','12'); v.setAttribute('y2','18'); const h=svgEl('line'); h.setAttribute('x1','6'); h.setAttribute('y1','12'); h.setAttribute('x2','18'); h.setAttribute('y2','12'); svg.append(v,h); return svg; },
  person(){ const svg=makeBase(); const head=svgEl('circle'); head.setAttribute('cx','12'); head.setAttribute('cy','8'); head.setAttribute('r','3'); const body=svgEl('path'); body.setAttribute('d','M5 20c0-3.3 3.6-5 7-5s7 1.7 7 5'); svg.append(head, body); return svg; },
    dismiss(){ const svg=makeBase(); const a=svgEl('line'); a.setAttribute('x1','6'); a.setAttribute('y1','6'); a.setAttribute('x2','18'); a.setAttribute('y2','18'); const b=svgEl('line'); b.setAttribute('x1','6'); b.setAttribute('y1','18'); b.setAttribute('x2','18'); b.setAttribute('y2','6'); svg.append(a,b); return svg; },
    sync(){ const svg=makeBase(); const p1=svgEl('path'); p1.setAttribute('d','M3 11a8 8 0 0 1 13-5'); const a1=svgEl('polyline'); a1.setAttribute('points','13 3 16 6 13 9'); const p2=svgEl('path'); p2.setAttribute('d','M21 13a8 8 0 0 1-13 5'); const a2=svgEl('polyline'); a2.setAttribute('points','11 21 8 18 11 15'); svg.append(p1,a1,p2,a2); return svg; },
    settings(){ const svg=makeBase(); const c=svgEl('circle'); c.setAttribute('cx','12'); c.setAttribute('cy','12'); c.setAttribute('r','3'); const g=svgEl('path'); g.setAttribute('d','M4 12h2M18 12h2M12 4v2M12 18v2M6.5 6.5l1.4 1.4M16.1 16.1l1.4 1.4M17.5 6.5l-1.4 1.4M7.9 16.1l-1.4 1.4'); svg.append(c,g); return svg; },
    logout(){ const svg=makeBase(); const d=svgEl('path'); d.setAttribute('d','M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4'); const a=svgEl('polyline'); a.setAttribute('points','14 15 18 12 14 9'); const l=svgEl('line'); l.setAttribute('x1','18'); l.setAttribute('y1','12'); l.setAttribute('x2','8'); l.setAttribute('y2','12'); svg.append(d,a,l); return svg; },
  apps(){ const svg=makeBase(); const rects=[]; const coords=[[6,6],[12,6],[18,6],[6,12],[12,12],[18,12],[6,18],[12,18],[18,18]]; coords.forEach(([x,y])=>{ const r=svgEl('rect'); r.setAttribute('x',x-1.5); r.setAttribute('y',y-1.5); r.setAttribute('width','3'); r.setAttribute('height','3'); rects.push(r); }); rects.forEach(r=>svg.append(r)); return svg; },
    check_circle(){ const svg=makeBase(); const c=svgEl('circle'); c.setAttribute('cx','12'); c.setAttribute('cy','12'); c.setAttribute('r','9'); const p=svgEl('polyline'); p.setAttribute('points','8 12 11 15 16 9'); svg.append(c,p); return svg; },
    cloud_add(){ const svg=makeBase(); const c=svgEl('path'); c.setAttribute('d','M5 18a4 4 0 0 1 0-8 6 6 0 0 1 11-1 4 4 0 1 1 2 9'); const v=svgEl('line'); v.setAttribute('x1','12'); v.setAttribute('y1','10'); v.setAttribute('x2','12'); v.setAttribute('y2','16'); const h=svgEl('line'); h.setAttribute('x1','9'); h.setAttribute('y1','13'); h.setAttribute('x2','15'); h.setAttribute('y2','13'); svg.append(c,v,h); return svg; },
    cloud_upload(){ const svg=makeBase(); const c=svgEl('path'); c.setAttribute('d','M5 18a4 4 0 0 1 0-8 6 6 0 0 1 11-1 4 4 0 1 1 2 9'); const a=svgEl('polyline'); a.setAttribute('points','12 16 12 10 9 13'); const l=svgEl('line'); l.setAttribute('x1','12'); l.setAttribute('y1','10'); l.setAttribute('x2','15'); l.setAttribute('y2','13'); svg.append(c,a,l); return svg; },
    warning(){ const svg=makeBase(); const p=svgEl('polygon'); p.setAttribute('points','12 3 21 19 3 19'); const l=svgEl('line'); l.setAttribute('x1','12'); l.setAttribute('y1','9'); l.setAttribute('x2','12'); l.setAttribute('y2','13'); const d=svgEl('circle'); d.setAttribute('cx','12'); d.setAttribute('cy','16'); d.setAttribute('r','1'); svg.append(p,l,d); return svg; },
    database(){ const svg=makeBase(); const top=svgEl('ellipse'); top.setAttribute('cx','12'); top.setAttribute('cy','6'); top.setAttribute('rx','6'); top.setAttribute('ry','2'); const body=svgEl('path'); body.setAttribute('d','M6 6v8c0 1.1 2.7 2 6 2s6-.9 6-2V6'); const mid=svgEl('path'); mid.setAttribute('d','M6 10c0 1.1 2.7 2 6 2s6-.9 6-2'); svg.append(top,body,mid); return svg; },
    trend(){ const svg=makeBase(); const p=svgEl('polyline'); p.setAttribute('points','4 14 9 9 13 13 20 6'); svg.append(p); return svg; },
    send(){ const svg=makeBase(); const p=svgEl('polygon'); p.setAttribute('points','3 11 21 3 14 21 11 13 3 11'); svg.append(p); return svg; },
    key(){ const svg=makeBase(); const c=svgEl('circle'); c.setAttribute('cx','7'); c.setAttribute('cy','14'); c.setAttribute('r','3'); const l1=svgEl('line'); l1.setAttribute('x1','10'); l1.setAttribute('y1','14'); l1.setAttribute('x2','21'); l1.setAttribute('y2','14'); const l2=svgEl('line'); l2.setAttribute('x1','17'); l2.setAttribute('y1','12'); l2.setAttribute('x2','17'); l2.setAttribute('y2','16'); svg.append(c,l1,l2); return svg; },
    brush(){ const svg=makeBase(); const p=svgEl('path'); p.setAttribute('d','M14 3l7 7-4 4-7-7 4-4zM3 21c2 0 3.5-1.5 3.5-3.5S7 14 9 14'); svg.append(p); return svg; },
    lock(){ const svg=makeBase(); const r=svgEl('rect'); r.setAttribute('x','6'); r.setAttribute('y','10'); r.setAttribute('width','12'); r.setAttribute('height','10'); r.setAttribute('rx','2'); const a=svgEl('path'); a.setAttribute('d','M8 10V8a4 4 0 0 1 8 0v2'); svg.append(r,a); return svg; },
    chat(){ const svg=makeBase(); const p=svgEl('path'); p.setAttribute('d','M21 12a8 8 0 0 1-8 8H7l-4 3 1-5A8 8 0 1 1 21 12z'); svg.append(p); return svg; },
  people_community(){ const svg=makeBase(); const h1=svgEl('circle'); h1.setAttribute('cx','9'); h1.setAttribute('cy','8'); h1.setAttribute('r','2.5'); const h2=svgEl('circle'); h2.setAttribute('cx','15'); h2.setAttribute('cy','9'); h2.setAttribute('r','2'); const b1=svgEl('path'); b1.setAttribute('d','M3 19c0-3 3.5-4.5 6-4.5s6 1.5 6 4.5'); const b2=svgEl('path'); b2.setAttribute('d','M10.5 19c.2-2.2 2.3-3.3 4.5-3.3 1.4 0 2.8.5 3.5 1.8'); svg.append(h1,h2,b1,b2); return svg; },
  eye(){ const svg=makeBase(); const p=svgEl('path'); p.setAttribute('d','M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z'); const c=svgEl('circle'); c.setAttribute('cx','12'); c.setAttribute('cy','12'); c.setAttribute('r','2'); svg.append(p,c); return svg; },
  save(){ const svg=makeBase(); const r=svgEl('rect'); r.setAttribute('x','5'); r.setAttribute('y','5'); r.setAttribute('width','14'); r.setAttribute('height','14'); r.setAttribute('rx','2'); const t=svgEl('rect'); t.setAttribute('x','8'); t.setAttribute('y','5'); t.setAttribute('width','8'); t.setAttribute('height','4'); const l=svgEl('polyline'); l.setAttribute('points','8 13 12 17 17 11'); svg.append(r,t,l); return svg; },
  more_horizontal(){ const svg=makeBase(); const c1=svgEl('circle'); c1.setAttribute('cx','7'); c1.setAttribute('cy','12'); c1.setAttribute('r','1.5'); const c2=svgEl('circle'); c2.setAttribute('cx','12'); c2.setAttribute('cy','12'); c2.setAttribute('r','1.5'); const c3=svgEl('circle'); c3.setAttribute('cx','17'); c3.setAttribute('cy','12'); c3.setAttribute('r','1.5'); svg.append(c1,c2,c3); return svg; },
  document(){ const svg=makeBase(); const p=svgEl('path'); p.setAttribute('d','M7 4h7l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'); const f=svgEl('polyline'); f.setAttribute('points','14 4 14 8 18 8'); svg.append(p,f); return svg; },
    download(){ const svg=makeBase(); const a=svgEl('polyline'); a.setAttribute('points','7 10 12 15 17 10'); const l=svgEl('line'); l.setAttribute('x1','12'); l.setAttribute('y1','15'); l.setAttribute('x2','12'); l.setAttribute('y2','3'); const b=svgEl('line'); b.setAttribute('x1','5'); b.setAttribute('y1','21'); b.setAttribute('x2','19'); b.setAttribute('y2','21'); svg.append(a,l,b); return svg; },
    edit(){ const svg=makeBase(); const p=svgEl('path'); p.setAttribute('d','M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z'); const l=svgEl('line'); l.setAttribute('x1','14'); l.setAttribute('y1','4'); l.setAttribute('x2','20'); l.setAttribute('y2','10'); svg.append(p,l); return svg; },
    scissors(){ const svg=makeBase(); const c1=svgEl('circle'); c1.setAttribute('cx','6'); c1.setAttribute('cy','6'); c1.setAttribute('r','2'); const c2=svgEl('circle'); c2.setAttribute('cx','6'); c2.setAttribute('cy','18'); c2.setAttribute('r','2'); const l1=svgEl('line'); l1.setAttribute('x1','20'); l1.setAttribute('y1','4'); l1.setAttribute('x2','8'); l1.setAttribute('y2','12'); const l2=svgEl('line'); l2.setAttribute('x1','8'); l2.setAttribute('y1','12'); l2.setAttribute('x2','20'); l2.setAttribute('y2','20'); svg.append(c1,c2,l1,l2); return svg; },
    copy(){ const svg=makeBase(); const r1=svgEl('rect'); r1.setAttribute('x','9'); r1.setAttribute('y','9'); r1.setAttribute('width','10'); r1.setAttribute('height','10'); r1.setAttribute('rx','2'); const r2=svgEl('rect'); r2.setAttribute('x','5'); r2.setAttribute('y','5'); r2.setAttribute('width','10'); r2.setAttribute('height','10'); r2.setAttribute('rx','2'); svg.append(r2,r1); return svg; },
    clipboard(){ const svg=makeBase(); const r=svgEl('rect'); r.setAttribute('x','7'); r.setAttribute('y','5'); r.setAttribute('width','10'); r.setAttribute('height','14'); r.setAttribute('rx','2'); const t=svgEl('rect'); t.setAttribute('x','9'); t.setAttribute('y','3'); t.setAttribute('width','6'); t.setAttribute('height','4'); t.setAttribute('rx','1'); svg.append(r,t); return svg; },
    trash(){ const svg=makeBase(); const b=svgEl('rect'); b.setAttribute('x','6'); b.setAttribute('y','7'); b.setAttribute('width','12'); b.setAttribute('height','13'); b.setAttribute('rx','2'); const l=svgEl('line'); l.setAttribute('x1','9'); l.setAttribute('y1','7'); l.setAttribute('x2','9'); l.setAttribute('y2','20'); const l2=svgEl('line'); l2.setAttribute('x1','15'); l2.setAttribute('y1','7'); l2.setAttribute('x2','15'); l2.setAttribute('y2','20'); const h=svgEl('line'); h.setAttribute('x1','4'); h.setAttribute('y1','7'); h.setAttribute('x2','20'); h.setAttribute('y2','7'); const lid=svgEl('path'); lid.setAttribute('d','M10 7V5h4v2'); svg.append(b,l,l2,h,lid); return svg; },
    image(){ const svg=makeBase(); const r=svgEl('rect'); r.setAttribute('x','4'); r.setAttribute('y','6'); r.setAttribute('width','16'); r.setAttribute('height','12'); r.setAttribute('rx','2'); const sun=svgEl('circle'); sun.setAttribute('cx','9'); sun.setAttribute('cy','10'); sun.setAttribute('r','1.5'); const m=svgEl('polyline'); m.setAttribute('points','6 17 11 12 14 15 18 11 20 13 20 18'); svg.append(r,sun,m); return svg; },
    mail(){ const svg=makeBase(); const rect=svgEl('rect'); rect.setAttribute('x','3'); rect.setAttribute('y','6'); rect.setAttribute('width','18'); rect.setAttribute('height','12'); rect.setAttribute('rx','2'); const flap=svgEl('polyline'); flap.setAttribute('points','3 7 12 13 21 7'); svg.append(rect, flap); return svg; }
    ,window(){ const svg=makeBase(); const r=svgEl('rect'); r.setAttribute('x','4'); r.setAttribute('y','5'); r.setAttribute('width','16'); r.setAttribute('height','14'); r.setAttribute('rx','2'); const bar=svgEl('line'); bar.setAttribute('x1','4'); bar.setAttribute('y1','9'); bar.setAttribute('x2','20'); bar.setAttribute('y2','9'); svg.append(r,bar); return svg; }
    ,folder(){ const svg=makeBase(); const p=svgEl('path'); p.setAttribute('d','M4 8a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z'); svg.append(p); return svg; }
    ,notebook(){ const svg=makeBase(); const b=svgEl('rect'); b.setAttribute('x','7'); b.setAttribute('y','4'); b.setAttribute('width','11'); b.setAttribute('height','16'); b.setAttribute('rx','2'); const spine=svgEl('rect'); spine.setAttribute('x','6'); spine.setAttribute('y','4'); spine.setAttribute('width','2'); spine.setAttribute('height','16'); svg.append(b,spine); return svg; }
    ,arrow_left(){ const svg=makeBase(); const p=svgEl('polyline'); p.setAttribute('points','14 18 8 12 14 6'); svg.append(p); return svg; }
    ,panel_left(){ const svg=makeBase(); const r=svgEl('rect'); r.setAttribute('x','3'); r.setAttribute('y','5'); r.setAttribute('width','18'); r.setAttribute('height','14'); r.setAttribute('rx','2'); const v=svgEl('line'); v.setAttribute('x1','9'); v.setAttribute('y1','5'); v.setAttribute('x2','9'); v.setAttribute('y2','19'); svg.append(r,v); return svg; }
    ,subtract(){ const svg=makeBase(); const l=svgEl('line'); l.setAttribute('x1','6'); l.setAttribute('y1','12'); l.setAttribute('x2','18'); l.setAttribute('y2','12'); svg.append(l); return svg; }
    ,maximize(){ const svg=makeBase(); const r=svgEl('rect'); r.setAttribute('x','6'); r.setAttribute('y','6'); r.setAttribute('width','12'); r.setAttribute('height','12'); svg.append(r); return svg; }
    ,restore(){ const svg=makeBase(); const r1=svgEl('rect'); r1.setAttribute('x','7'); r1.setAttribute('y','7'); r1.setAttribute('width','10'); r1.setAttribute('height','10'); const r2=svgEl('rect'); r2.setAttribute('x','9'); r2.setAttribute('y','5'); r2.setAttribute('width','10'); r2.setAttribute('height','10'); svg.append(r2,r1); return svg; }
    ,cart(){ const svg=makeBase(); const p=svgEl('path'); p.setAttribute('d','M6 6h14l-2 8H8L6 6z'); const c1=svgEl('circle'); c1.setAttribute('cx','9'); c1.setAttribute('cy','18'); c1.setAttribute('r','1.5'); const c2=svgEl('circle'); c2.setAttribute('cx','17'); c2.setAttribute('cy','18'); c2.setAttribute('r','1.5'); svg.append(p,c1,c2); return svg; }
    ,app_folder(){ const svg=makeBase(); const p=svgEl('path'); p.setAttribute('d','M4 8h6l2 2h8v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z'); svg.append(p); return svg; }
    ,globe(){ const svg=makeBase(); const c=svgEl('circle'); c.setAttribute('cx','12'); c.setAttribute('cy','12'); c.setAttribute('r','9'); const m1=svgEl('ellipse'); m1.setAttribute('cx','12'); m1.setAttribute('cy','12'); m1.setAttribute('rx','6'); m1.setAttribute('ry','9'); const m2=svgEl('line'); m2.setAttribute('x1','3'); m2.setAttribute('y1','12'); m2.setAttribute('x2','21'); m2.setAttribute('y2','12'); svg.append(c,m1,m2); return svg; }
    ,timer(){ const svg=makeBase(); const c=svgEl('circle'); c.setAttribute('cx','12'); c.setAttribute('cy','13'); c.setAttribute('r','7'); const top=svgEl('rect'); top.setAttribute('x','10'); top.setAttribute('y','3'); top.setAttribute('width','4'); top.setAttribute('height','3'); const hand=svgEl('line'); hand.setAttribute('x1','12'); hand.setAttribute('y1','13'); hand.setAttribute('x2','12'); hand.setAttribute('y2','9'); svg.append(c,top,hand); return svg; }
    ,arrow_swap(){ const svg=makeBase(); const p1=svgEl('polyline'); p1.setAttribute('points','4 7 8 7 8 7 8 7 12 11'); const p2=svgEl('polyline'); p2.setAttribute('points','20 17 16 17 12 13'); svg.append(p1,p2); return svg; }
  };
  // Filled variants
  const drawFilled = {
    person(){ const svg=makeBase(); svg.setAttribute('stroke','none'); svg.setAttribute('fill','currentColor'); const head=svgEl('circle'); head.setAttribute('cx','12'); head.setAttribute('cy','8'); head.setAttribute('r','3'); const body=svgEl('path'); body.setAttribute('d','M4 20c.5-3.8 4.3-6 8-6s7.5 2.2 8 6H4z'); svg.append(head, body); return svg; },
    apps(){ const svg=makeBase(); svg.setAttribute('stroke','none'); svg.setAttribute('fill','currentColor'); const coords=[[6,6],[12,6],[18,6],[6,12],[12,12],[18,12],[6,18],[12,18],[18,18]]; coords.forEach(([x,y])=>{ const r=svgEl('rect'); r.setAttribute('x',x-2); r.setAttribute('y',y-2); r.setAttribute('width','4'); r.setAttribute('height','4'); svg.append(r); }); return svg; },
    warning(){ const svg=makeBase(); svg.setAttribute('stroke','none'); svg.setAttribute('fill','currentColor'); const p=svgEl('polygon'); p.setAttribute('points','12 3 21 19 3 19'); const hole=svgEl('circle'); hole.setAttribute('cx','12'); hole.setAttribute('cy','16'); hole.setAttribute('r','1'); hole.setAttribute('fill','#000'); const bar=svgEl('rect'); bar.setAttribute('x','11.25'); bar.setAttribute('y','9'); bar.setAttribute('width','1.5'); bar.setAttribute('height','4'); bar.setAttribute('fill','#000'); svg.append(p, bar, hole); return svg; },
    database(){ const svg=makeBase(); svg.setAttribute('stroke','none'); svg.setAttribute('fill','currentColor'); const top=svgEl('ellipse'); top.setAttribute('cx','12'); top.setAttribute('cy','6'); top.setAttribute('rx','6'); top.setAttribute('ry','2'); const body=svgEl('rect'); body.setAttribute('x','6'); body.setAttribute('y','6'); body.setAttribute('width','12'); body.setAttribute('height','10'); const mid=svgEl('ellipse'); mid.setAttribute('cx','12'); mid.setAttribute('cy','16'); mid.setAttribute('rx','6'); mid.setAttribute('ry','2'); svg.append(body, mid, top); return svg; }
  };
  const map = {
    'fluent:search-20-regular': 'search',
    'fluent:chevron-left-24-regular': 'chevron_left',
    'fluent:chevron-right-24-regular': 'chevron_right',
    'fluent:person-24-regular': 'person',
    'fluent:person-20-regular': 'person',
    'fluent:person-20-filled': 'person',
  'fluent:add-20-regular': 'add',
    'fluent:dismiss-20-regular': 'dismiss',
    'fluent:dismiss-square-multiple-20-regular': 'dismiss',
    'fluent:arrow-sync-20-regular': 'sync',
    'fluent:settings-20-regular': 'settings',
    'fluent:arrow-exit-20-regular': 'logout',
    'fluent:apps-list-20-regular': 'apps',
    'fluent:apps-list-20-filled': 'apps',
    'fluent:checkmark-circle-20-regular': 'check_circle',
    'fluent:checkmark-circle-20-filled': 'check_circle',
    'fluent:cloud-add-20-regular': 'cloud_add',
    'fluent:cloud-add-20-filled': 'cloud_add',
    'fluent:cloud-upload-20-regular': 'cloud_upload',
    'fluent:paint-brush-20-regular': 'brush',
    'fluent:paint-brush-20-filled': 'brush',
    'fluent:lock-closed-20-regular': 'lock',
    'fluent:lock-closed-20-filled': 'lock',
  'fluent:chat-help-20-regular': 'chat',
  'fluent:chat-20-regular': 'chat',
    'fluent:database-24-regular': 'database',
    'fluent:database-20-regular': 'database',
    'fluent:database-20-filled': 'database',
    'fluent:arrow-trending-24-regular': 'trend',
    'fluent:send-20-regular': 'send',
  'fluent:eye-20-regular': 'eye',
  'fluent:save-20-regular': 'save',
    'fluent:key-reset-20-regular': 'key',
    'fluent:warning-20-regular': 'warning',
    'fluent:warning-20-filled': 'warning',
    'fluent:arrow-download-20-regular': 'download',
    'fluent:rename-20-regular': 'edit',
    'fluent:cut-20-regular': 'scissors',
    'fluent:copy-20-regular': 'copy',
    'fluent:clipboard-paste-20-regular': 'clipboard',
    'fluent:delete-20-regular': 'trash',
    'fluent:image-20-regular': 'image'
  ,'fluent:mail-20-regular': 'mail'
    ,'fluent:mail-20-regular': 'mail'
    ,'fluent:window-20-regular': 'window'
    ,'fluent:folder-20-regular': 'folder'
  ,'fluent:document-20-regular': 'document'
    ,'fluent:notebook-20-regular': 'notebook'
    ,'fluent:arrow-left-20-regular': 'arrow_left'
    ,'fluent:panel-left-20-regular': 'panel_left'
    ,'fluent:subtract-20-regular': 'subtract'
    ,'fluent:maximize-20-regular': 'maximize'
    ,'fluent:restore-20-regular': 'restore'
    ,'fluent:dismiss-20-regular': 'dismiss'
    ,'fluent:app-folder-20-regular': 'app_folder'
    ,'fluent:globe-20-regular': 'globe'
    ,'fluent:timer-20-regular': 'timer'
    ,'fluent:arrow-swap-20-regular': 'arrow_swap'
    ,'fluent:cart-20-regular': 'cart'
    ,'fluent:people-community-20-regular': 'people_community'
    ,'fluent:more-horizontal-20-regular': 'more_horizontal'
  };
  function renderIcon(id, size){
    const name = map[id] || null;
    if(!name) return null;
    const isFilled = /-filled$/i.test(id);
    if(isFilled && drawFilled[name]) return drawFilled[name](size||20);
    if(draw[name]) return draw[name](size||20);
    return null;
  }
  function replaceIcons(root){
    // If Iconify is present or being requested, let it handle <span class="iconify"> automatically.
    if(typeof window !== 'undefined' && (window.Iconify || iconifyRequested)) return;
    (root||document).querySelectorAll('span.iconify').forEach(el=>{
      const id = el.getAttribute('data-icon')||'';
      const size = parseInt(el.getAttribute('data-size')||'20',10);
      // Attempt official inline SVG files from local vendor folder first
      tryInlineOfficial(el, id, size).then(success=>{
        if(success) return; // already inlined official
        const svg = renderIcon(id, size);
        if(!svg) return;
        while(el.firstChild) el.removeChild(el.firstChild);
        el.appendChild(svg);
      });
    });
  }
  // Expose
  window.WEBOS_ICONS = { renderIcon, replaceIcons };
  // Auto-run once and observe mutations
  try{
    // Request Iconify and give it a brief moment to load; if it doesn't, use our fallbacks.
    ensureIconify();
    const kickFallback = ()=> replaceIcons(document);
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kickFallback);
    else kickFallback();
    const mo = new MutationObserver(muts=>{
      muts.forEach(m=>{
        if(typeof window !== 'undefined' && (window.Iconify || iconifyRequested)) return; // Iconify handles icons
        if(m.type==='attributes' && m.target && m.target.matches && m.target.matches('span.iconify')){ replaceIcons(m.target.parentElement || m.target); }
        if(m.addedNodes && m.addedNodes.length){ m.addedNodes.forEach(n=>{ if(n.nodeType===1) replaceIcons(n); }); }
      });
    });
    mo.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['data-icon']});
    // Hard fallback in case CDN fails to load after a while
    setTimeout(()=>{ if(!(typeof window !== 'undefined' && window.Iconify)) replaceIcons(document); }, 2500);
  }catch(e){}
})();
