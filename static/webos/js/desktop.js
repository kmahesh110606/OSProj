(function(){
  const $ = s=>document.querySelector(s);
  const desktop = $('#desktop');
  const taskbar = $('#taskbar-windows');
  const taskbarEl = document.getElementById('taskbar');
  const startBtn = $('#start-button');
  const appsBtn = $('#apps-button');
  const searchBtn = document.getElementById('search-button');
  const startMenu = $('#start-menu');
  const startTabPinned = document.getElementById('start-tab-pinned');
  const startTabAll = document.getElementById('start-tab-all');
  const searchMenu = document.getElementById('search-menu');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const startCtx = document.getElementById('start-ctx');
  const pinnedContainer = document.getElementById('pinned-container');
  const allAppsContainer = document.getElementById('allapps-container');
  const taskbarPins = document.getElementById('taskbar-pins');
  const clock = $('#clock');
  const calendar = document.getElementById('calendar');
  const appsMenu = document.getElementById('apps-menu');
  const appsList = document.getElementById('open-windows-list');
  const btnCloseAll = document.getElementById('close-all');
  const userBtn = document.getElementById('user-button');
  const userMenu = document.getElementById('user-menu');
  const userNameEl = document.getElementById('user-name');
  const userPhoneEl = document.getElementById('user-phone');
  const userAvatarEl = document.getElementById('user-avatar');
  const userOpenSettings = document.getElementById('user-open-settings');
  const userLogout = document.getElementById('user-logout');
  const userSyncEl = document.getElementById('user-sync');
  const userNetEl = document.getElementById('user-net');
  let originalUserBtnHTML = null;
  let shield = null;
  const tpl = document.getElementById('window-template');
  const zBase = 100;
  let zTop = zBase;
  const splash = document.getElementById('splash');
  const splashBar = document.getElementById('splash-bar');
  const splashSub = document.getElementById('splash-sub');
  // Dock popup elements and timers
  const dockPop = document.getElementById('dock-pop');
  const dockPopIcon = dockPop?.querySelector('.dock-pop-icon');
  const dockPopTitle = dockPop?.querySelector('.dock-pop-title');
  let dockHideTimer = null;

  const state = { windows: [] };
  let saveTimer = null;
  let autosaveTimer = null;
  let lastSyncOk = null; // null unknown, true ok, false error

  function tick(){
    const d = new Date();
    const time = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const date = d.toLocaleDateString();
    if(clock){ clock.innerHTML = `<div class="time">${time}</div><div class="date">${date}</div>`; }
  }
  setInterval(tick, 1000); tick();

  // Responsive detection
  function updateResponsive(){
    const mobile = window.innerWidth <= 720;
    document.body.classList.toggle('is-mobile', mobile);
    // Avatar rendering handled by ensureAccountLoaded
  }
  window.addEventListener('resize', updateResponsive);
  window.addEventListener('orientationchange', updateResponsive);
  updateResponsive();

  // Mobile now shows both Pinned and All apps in a single scroll; no tab toggles needed

  function getCsrf(){
    const name = 'csrftoken=';
    const c = document.cookie.split(';').find(c=>c.trim().startsWith(name));
    return c ? decodeURIComponent(c.split('=')[1]) : '';
  }

  async function loadState(){
    try{
  const res = await fetch('/os/api/state');
      const data = await res.json();
      const serverState = (data && data.state) || {};
      // Merge server + local backup for robustness; prefer server when both exist
      let backup = null;
      try{ backup = JSON.parse(localStorage.getItem('webos_state') || 'null'); }catch{}
      const merged = Object.assign({}, backup||{}, serverState||{});
      Object.assign(state, merged);
      // Keep a local backup for resilience
      try{ localStorage.setItem('webos_state', JSON.stringify(state)); }catch{}
      // Normalize a few keys to expected shapes to avoid odd states
      if(!Array.isArray(state.windows)) state.windows = [];
      if(!Array.isArray(state.pinned_apps)) state.pinned_apps = [];
      if(!Array.isArray(state.taskbar_pins)) state.taskbar_pins = [];
      // If server had nothing but we had backup, push back to server to keep in sync
      try{
        const emptyServer = !serverState || (Object.keys(serverState).length===0);
        if(emptyServer && (state.windows.length || state.pinned_apps.length || state.taskbar_pins.length)){
          // Best-effort save; don't block
          fetch('/os/api/state/save', {method:'POST', headers:{'Content-Type':'application/json','X-CSRFToken':getCsrf()}, body: JSON.stringify({state})}).catch(()=>{});
        }
      }catch{}
      applyAppearance();
    }catch{
      // Fallback to localStorage if server fetch fails
      try{
        const raw = localStorage.getItem('webos_state');
        if(raw){
          const cached = JSON.parse(raw);
          if(cached && typeof cached === 'object') Object.assign(state, cached);
        }
      }catch{}
      if(!Array.isArray(state.windows)) state.windows = [];
      if(!Array.isArray(state.pinned_apps)) state.pinned_apps = [];
      if(!Array.isArray(state.taskbar_pins)) state.taskbar_pins = [];
      applyAppearance();
    }
  }

    async function saveStateNow(timeoutMs){
      try{
        setSyncStatus('syncing');
        const ctrl = timeoutMs ? new AbortController() : null;
        let timer = null;
        if(ctrl){ timer = setTimeout(()=> ctrl.abort(), timeoutMs); }
        const res = await fetch('/os/api/state/save', {method:'POST', headers:{'Content-Type':'application/json','X-CSRFToken':getCsrf()}, body: JSON.stringify({state}), signal: ctrl?.signal});
        if(timer) clearTimeout(timer);
        lastSyncOk = res.ok; setSyncStatus(res.ok?'ok':'error');
        return res.ok;
      }catch{
        lastSyncOk = false; setSyncStatus('error');
        return false;
      }
    }

  function scheduleSave(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async ()=>{
      try{
        setSyncStatus('syncing');
  const res = await fetch('/os/api/state/save', {method:'POST', headers:{'Content-Type':'application/json','X-CSRFToken':getCsrf()}, body: JSON.stringify({state})});
        lastSyncOk = res.ok; setSyncStatus(res.ok ? 'ok' : 'error');
        if(res.ok){ try{ localStorage.setItem('webos_state', JSON.stringify(state)); }catch{} }
      }catch{
        lastSyncOk = false; setSyncStatus('error');
      }
    }, 500);
  }

  // Pinned apps and taskbar pins in shell state
  function getPinned(){ return (state.pinned_apps || []); }
  function setPinned(arr){ state.pinned_apps = arr; renderPinned(); scheduleSave(); saveStateNow(1500); }
  function isPinned(slug){ return getPinned().includes(slug); }
  function togglePinned(slug){ const s=new Set(getPinned()); if(s.has(slug)) s.delete(slug); else s.add(slug); setPinned([...s]); }
  function getDockPins(){ return (state.taskbar_pins || []); }
  function setDockPins(arr){ state.taskbar_pins = arr; renderDockPins(); scheduleSave(); saveStateNow(1500); }
  function toggleDockPin(slug){ const s=new Set(getDockPins()); if(s.has(slug)) s.delete(slug); else s.add(slug); setDockPins([...s]); }

  function renderPinned(){ if(!pinnedContainer) return; pinnedContainer.querySelectorAll('button.start-app').forEach(b=>{ if(!b.dataset.staticPinned) b.remove(); });
    // Add dynamic pinned from state (exclude built-in static ones already present)
    getPinned().forEach(slug=>{
      if(pinnedContainer.querySelector(`.start-app[data-slug="${slug}"]`)) return;
      const app = appFromSlug(slug) || { slug, title: slug, kind:'builtin', path:`apps/html/${slug}` };
  const btn = document.createElement('button'); btn.className='start-app'; btn.dataset.slug=slug; btn.dataset.kind=app.kind; btn.dataset.icon=app.icon||'fluent:app-folder-20-regular';
  const iconHtml = app.icon && app.icon.includes(':')? `<span class="iconify" data-icon="${app.icon}"></span>` : (app.icon && app.icon.startsWith('/')? `<img class="app-img" src="${app.icon}">` : `<span class="iconify" data-icon="fluent:app-folder-20-regular"></span>`);
      btn.innerHTML = `<span class="app-icon">${iconHtml}</span><span class="app-title">${app.title}</span>`;
      // Wire behavior: click to launch, context menu like other start items
      btn.addEventListener('click', ()=>{
        const meta = appFromSlug(slug) || app; // re-resolve in case All apps loaded later
        launchApp(meta);
        startMenu.classList.add('hidden');
        appsMenu?.classList.add('hidden');
      });
      btn.addEventListener('contextmenu', (ev)=>{
        ev.preventDefault();
        if(!startCtx) return;
        startCtx.classList.remove('hidden');
        startCtx.style.left = ev.clientX + 'px';
        startCtx.style.top = ev.clientY + 'px';
        startCtx.dataset.slug = slug;
        startCtx.dataset.appId = '';
      });
      pinnedContainer.appendChild(btn);
    });
  }
  function renderDockPins(){ if(!taskbarPins) return; taskbarPins.innerHTML=''; getDockPins().forEach(slug=>{ const app=appFromSlug(slug) || {slug, title:slug, icon:'fluent:app-folder-20-regular', kind:'builtin', path:`apps/html/${slug}`}; const b=document.createElement('button'); b.className='pin'; b.title=app.title; const icon = app.icon && app.icon.includes(':')? `<span class="iconify" data-icon="${app.icon}"></span>` : (app.icon && app.icon.startsWith('/')? `<img src="${app.icon}" alt="">` : `<span class="iconify" data-icon="fluent:app-folder-20-regular"></span>`); b.innerHTML=icon; b.onclick=()=> launchApp(app); taskbarPins.appendChild(b); }); }

  function startAutoSave(){
    clearInterval(autosaveTimer);
    autosaveTimer = setInterval(()=>{
  fetch('/os/api/state/save', {method:'POST', headers:{'Content-Type':'application/json','X-CSRFToken':getCsrf()}, body: JSON.stringify({state})})
        .then(r=>{ lastSyncOk = r.ok; setSyncStatus(r.ok?'ok':'error'); if(r.ok){ try{ localStorage.setItem('webos_state', JSON.stringify(state)); }catch{} } })
        .catch(()=>{ lastSyncOk = false; setSyncStatus('error'); });
    }, 10000); // every 10s
  }

  function bringToFront(win){
    // Remove active from others and set on this
    document.querySelectorAll('.window.active-window').forEach(w=>w.classList.remove('active-window'));
    win.classList.add('active-window');
    win.style.zIndex = ++zTop;
  }

  function addTaskItem(winId, title, icon){
    const btn = document.createElement('button');
    btn.className = 'task-item';
  let iconHtml = `<span class="iconify" data-icon="fluent:app-folder-20-regular"></span>`;
    if(icon){
      if(typeof icon === 'string' && (icon.startsWith('/') || icon.startsWith('http'))){
        iconHtml = `<img src="${icon}" alt="${title}">`;
      } else if(typeof icon === 'string' && icon.includes(':')){
        iconHtml = `<span class="iconify" data-icon="${icon}"></span>`;
      } else if(/^<img/i.test(String(icon))){
        iconHtml = String(icon);
      } else {
        iconHtml = `<span class="iconify" data-icon="fluent:app-folder-20-regular"></span>`;
      }
    }
  btn.innerHTML = `<span class="task-icon">${iconHtml}</span><span class="task-title">${title}</span>`;
    btn.dataset.win = winId;
    btn.onclick = ()=>{
      const w = document.querySelector(`.window[data-window-id="${winId}"]`);
      if(!w) return;
      const nowHidden = (w.style.display === 'none');
      if(nowHidden){
        w.style.display = 'flex';
        w.classList.add('restoring');
        bringToFront(w);
        setTimeout(()=> w.classList.remove('restoring'), 240);
      } else {
        // Smooth minimize
        w.classList.add('minimizing');
        setTimeout(()=>{ w.style.display='none'; w.classList.remove('minimizing'); }, 200);
      }
    };
    taskbar.appendChild(btn);
    updateDockDensity();

    // If the icon is an iconify span, manage filled/regular on hover/active
    const iconSpan = btn.querySelector('span.iconify');
    function toFilled(id){ return id ? id.replace('-regular','-filled') : id; }
    function toRegular(id){ return id ? id.replace('-filled','-regular') : id; }
    if(iconSpan){
      btn.addEventListener('mouseenter', ()=>{ const id = iconSpan.getAttribute('data-icon')||''; iconSpan.setAttribute('data-icon', toFilled(id)); });
      btn.addEventListener('mouseleave', ()=>{ const id = iconSpan.getAttribute('data-icon')||''; iconSpan.setAttribute('data-icon', toRegular(id)); });
      btn.addEventListener('focus', ()=>{ const id = iconSpan.getAttribute('data-icon')||''; iconSpan.setAttribute('data-icon', toFilled(id)); });
      btn.addEventListener('blur', ()=>{ const id = iconSpan.getAttribute('data-icon')||''; iconSpan.setAttribute('data-icon', toRegular(id)); });
    }

    // Dock hover popup (big icon + name) using global timer to avoid cross-item flicker
    const buildPopIcon = ()=>{
      if(!dockPopIcon) return;
      // Try to render large image or icon
      if(typeof icon === 'string' && (icon.startsWith('/') || icon.startsWith('http'))){
        dockPopIcon.innerHTML = `<img src="${icon}" alt="${title}">`;
      } else if(typeof icon === 'string' && icon.includes(':')){
        dockPopIcon.innerHTML = `<span class="iconify" data-icon="${icon}" style="font-size:46px"></span>`;
      } else if(/^<img/i.test(String(icon||''))){
        dockPopIcon.innerHTML = String(icon).replace(/width="\d+"|height="\d+"/g,'').replace('<img ','<img width="56" height="56" ');
      } else if(typeof icon === 'string' && icon.trim().length <= 3){
        dockPopIcon.innerHTML = `<span style="font-size:46px">${icon}</span>`;
      } else {
  dockPopIcon.innerHTML = '<span class="iconify" data-icon="fluent:app-folder-20-regular" style="font-size:46px"></span>';
      }
    };
    const showPop = ()=>{
      if(!dockPop) return;
      if(dockHideTimer){ clearTimeout(dockHideTimer); dockHideTimer=null; }
      buildPopIcon();
      if(dockPopTitle) dockPopTitle.textContent = title;
      const r = btn.getBoundingClientRect();
      dockPop.style.left = (r.left + r.width/2) + 'px';
      dockPop.style.top = (r.top - 8) + 'px';
      dockPop.classList.remove('hidden');
      requestAnimationFrame(()=> dockPop.classList.add('show'));
      taskbar.classList.add('dock-hover');
      document.getElementById('taskbar-windows')?.classList.add('dock-hover');
    };
    const hidePop = (immediate)=>{
      if(!dockPop) return;
      dockPop.classList.remove('show');
      const act = ()=> dockPop.classList.add('hidden');
      if(immediate){ act(); } else { setTimeout(act, 120); }
    };
    btn.addEventListener('mouseenter', ()=>{
      if(dockHideTimer){ clearTimeout(dockHideTimer); dockHideTimer=null; }
      showPop();
    });
    btn.addEventListener('mouseleave', ()=>{
      // Delay hide to allow moving into neighbor item without flicker
      if(dockHideTimer){ clearTimeout(dockHideTimer); }
      dockHideTimer = setTimeout(()=>{
        const hovering = Array.from(taskbar.querySelectorAll('.task-item')).some(el=> el.matches(':hover'));
        if(!hovering){ hidePop(); taskbar.classList.remove('dock-hover'); document.getElementById('taskbar-windows')?.classList.remove('dock-hover'); }
      }, 140);
    });
    btn.addEventListener('focus', showPop);
    btn.addEventListener('blur', ()=> hidePop(true));
  }

  function removeTaskItem(winId){
    const btn = taskbar.querySelector(`[data-win="${winId}"]`);
    if(btn) btn.remove();
    updateDockDensity();
  }

  function updateDockDensity(){
    if(!taskbarEl) return;
    const count = taskbar.querySelectorAll('.task-item').length;
    taskbarEl.classList.toggle('crowded', count > 6);
    requestAnimationFrame(()=>{
      const scrollable = taskbar.scrollWidth > taskbar.clientWidth + 2;
      taskbarEl.classList.toggle('scrollable', scrollable);
    });
  }
  window.addEventListener('resize', updateDockDensity);

  // Wheel to scroll taskbar horizontally (trackpads/mice)
  const windowsStrip = document.getElementById('taskbar-windows');
  if(windowsStrip){
    windowsStrip.addEventListener('wheel', (e)=>{
      // Convert vertical scroll into horizontal scroll for the strip
      if(Math.abs(e.deltaY) >= Math.abs(e.deltaX)){
        windowsStrip.scrollLeft += e.deltaY * 0.8;
        e.preventDefault();
      }
    }, {passive:false});
    // Hide popup when leaving the entire strip
    windowsStrip.addEventListener('mouseleave', ()=>{
      if(dockHideTimer){ clearTimeout(dockHideTimer); }
      dockHideTimer = setTimeout(()=>{
        const hovering = Array.from(taskbar.querySelectorAll('.task-item')).some(el=> el.matches(':hover'));
        if(!hovering){
          if(dockPop){ dockPop.classList.remove('show'); setTimeout(()=> dockPop.classList.add('hidden'), 120); }
          taskbar.classList.remove('dock-hover');
          windowsStrip.classList.remove('dock-hover');
        }
      }, 160);
    });
    windowsStrip.addEventListener('mouseenter', ()=>{ if(dockHideTimer){ clearTimeout(dockHideTimer); dockHideTimer=null; } });
  }

  function makeDraggable(win){
    if(document.body.classList.contains('is-mobile')) return; // skip drag on mobile
    const bar = win.querySelector('.titlebar');
    let dx=0, dy=0, dragging=false, pending=null, lastX=0, lastY=0;
    function render(){ if(!dragging) return; win.style.left = (lastX - dx) + 'px'; win.style.top = (lastY - dy) + 'px'; pending = null; }
    function onStart(e){
      // Don't start drag when clicking on control buttons or left controls (Back/Pane)
      if(e.target && e.target.closest && (e.target.closest('.controls') || e.target.closest('.left-controls'))) return;
      dragging=true; bringToFront(win);
      const cx = (e.touches? e.touches[0].clientX : e.clientX), cy=(e.touches? e.touches[0].clientY : e.clientY);
      dx = cx - win.offsetLeft; dy = cy - win.offsetTop; lastX=cx; lastY=cy;
      // add shield to avoid iframe capture while dragging
      if(!shield){ shield = document.createElement('div'); shield.className='interaction-shield'; document.body.appendChild(shield); }
      const mm = (ev)=>{ const x = (ev.touches? ev.touches[0].clientX : ev.clientX), y=(ev.touches? ev.touches[0].clientY : ev.clientY); lastX=x; lastY=y; if(!pending){ pending = requestAnimationFrame(render); } };
      const mu = ()=>{ dragging=false; document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); document.removeEventListener('touchmove', mm); document.removeEventListener('touchend', mu); if(shield){ shield.remove(); shield=null; } capturePositions(); };
      document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
      document.addEventListener('touchmove', mm, {passive:true}); document.addEventListener('touchend', mu);
    }
    bar.addEventListener('mousedown', onStart);
    bar.addEventListener('touchstart', onStart, {passive:true});

    // Pointer events with capture for robust dragging
    if(window.PointerEvent){
      bar.addEventListener('pointerdown', (e)=>{
        if(e.button !== 0) return; // left click only
        if(dragging) return;
        // Ignore pointer down on control zones (both right controls and left Back/Pane)
        if(e.target && e.target.closest && (e.target.closest('.controls') || e.target.closest('.left-controls'))) return;
        e.preventDefault();
        dragging = true; bringToFront(win);
        dx = e.clientX - win.offsetLeft; dy = e.clientY - win.offsetTop; lastX = e.clientX; lastY = e.clientY;
        if(!shield){ shield = document.createElement('div'); shield.className='interaction-shield'; document.body.appendChild(shield); }
        try{ bar.setPointerCapture(e.pointerId); }catch{}
        const mm = (ev)=>{ lastX = ev.clientX; lastY = ev.clientY; if(!pending){ pending = requestAnimationFrame(render); } };
        const mu = ()=>{ dragging=false; try{ bar.releasePointerCapture(e.pointerId); }catch{}; bar.removeEventListener('pointermove', mm); bar.removeEventListener('pointerup', mu); bar.removeEventListener('pointercancel', mu); if(shield){ shield.remove(); shield=null; } capturePositions(); };
        bar.addEventListener('pointermove', mm, {passive:true});
        bar.addEventListener('pointerup', mu);
        bar.addEventListener('pointercancel', mu);
      });
    }
  }

  function makeResizable(win){
    if(document.body.classList.contains('is-mobile')) return; // skip resize on mobile
    const minW=320, minH=240;
    function startResize(e, dir){
      e.preventDefault(); bringToFront(win);
      const startX=(e.touches? e.touches[0].clientX : e.clientX), startY=(e.touches? e.touches[0].clientY : e.clientY);
      const startLeft=win.offsetLeft, startTop=win.offsetTop;
      const startW=win.offsetWidth, startH=win.offsetHeight;
      if(!shield){ shield = document.createElement('div'); shield.className='interaction-shield'; document.body.appendChild(shield); }
      function onMove(ev){
        const cx=(ev.touches? ev.touches[0].clientX : ev.clientX), cy=(ev.touches? ev.touches[0].clientY : ev.clientY);
        const dx=cx-startX, dy=cy-startY;
        let newW=startW, newH=startH, newL=startLeft, newT=startTop;
        if(dir.includes('e')) newW = Math.max(minW, startW+dx);
        if(dir.includes('s')) newH = Math.max(minH, startH+dy);
        if(dir.includes('w')) { newW = Math.max(minW, startW-dx); newL = startLeft + (startW - newW); }
        if(dir.includes('n')) { newH = Math.max(minH, startH-dy); newT = startTop + (startH - newH); }
        win.style.width = newW+'px';
        win.style.height = newH+'px';
        win.style.left = newL+'px';
        win.style.top = newT+'px';
      }
      function onUp(){ document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp); if(shield){ shield.remove(); shield=null; } capturePositions(); captureSizes(); }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, {passive:true}); document.addEventListener('touchend', onUp);
    }

    function startResizePointer(e, dir){
      e.preventDefault(); bringToFront(win);
      const startX = e.clientX, startY = e.clientY;
      const startLeft=win.offsetLeft, startTop=win.offsetTop;
      const startW=win.offsetWidth, startH=win.offsetHeight;
      if(!shield){ shield = document.createElement('div'); shield.className='interaction-shield'; document.body.appendChild(shield); }
      const onMove = (ev)=>{
        const cx=ev.clientX, cy=ev.clientY;
        const dx=cx-startX, dy=cy-startY;
        let newW=startW, newH=startH, newL=startLeft, newT=startTop;
        if(dir.includes('e')) newW = Math.max(minW, startW+dx);
        if(dir.includes('s')) newH = Math.max(minH, startH+dy);
        if(dir.includes('w')) { newW = Math.max(minW, startW-dx); newL = startLeft + (startW - newW); }
        if(dir.includes('n')) { newH = Math.max(minH, startH-dy); newT = startTop + (startH - newH); }
        win.style.width = newW+'px';
        win.style.height = newH+'px';
        win.style.left = newL+'px';
        win.style.top = newT+'px';
      };
      const onUp = ()=>{ try{ e.target.releasePointerCapture(e.pointerId); }catch{}; e.target.removeEventListener('pointermove', onMove); e.target.removeEventListener('pointerup', onUp); e.target.removeEventListener('pointercancel', onUp); if(shield){ shield.remove(); shield=null; } capturePositions(); captureSizes(); };
      try{ e.target.setPointerCapture(e.pointerId); }catch{}
      e.target.addEventListener('pointermove', onMove, {passive:true});
      e.target.addEventListener('pointerup', onUp);
      e.target.addEventListener('pointercancel', onUp);
    }
    [
      ['.resizer-e','e'],['.resizer-w','w'],['.resizer-n','n'],['.resizer-s','s'],
      ['.resizer-ne','ne'],['.resizer-nw','nw'],['.resizer-se','se'],['.resizer-sw','sw']
    ].forEach(([sel,dir])=>{
      const el = win.querySelector(sel); if(!el) return;
      el.addEventListener('mousedown', e=>startResize(e, dir));
      el.addEventListener('touchstart', e=>startResize(e, dir), {passive:false});
      if(window.PointerEvent){ el.addEventListener('pointerdown', (e)=>{ if(e.button!==0) return; startResizePointer(e, dir); }); }
    });
  }

  function capturePositions(){
    document.querySelectorAll('.window').forEach(w=>{
      const id = w.dataset.windowId;
      const rec = state.windows.find(x=>x.id===id); if(rec){ rec.left=w.style.left; rec.top=w.style.top; }
    });
    scheduleSave(); try{ localStorage.setItem('webos_state', JSON.stringify(state)); }catch{}
  }
  function captureSizes(){
    document.querySelectorAll('.window').forEach(w=>{
      const id = w.dataset.windowId;
      const rec = state.windows.find(x=>x.id===id); if(rec){ rec.width=w.style.width; rec.height=w.style.height; }
    });
    scheduleSave(); try{ localStorage.setItem('webos_state', JSON.stringify(state)); }catch{}
  }

  async function launchApp(app, opts){
    // app: {id, slug, title, kind, path or url}
    const node = tpl.content.firstElementChild.cloneNode(true);
    const restoring = !!(opts && opts.restore);
    const id = (restoring && app.id) ? app.id : ('w'+Math.random().toString(36).slice(2,9));
    node.dataset.windowId = id;
    const titleTextEl = node.querySelector('.title-text');
    const titleIconEl = node.querySelector('.title-icon');
    if(titleTextEl) titleTextEl.textContent = app.title;
    if(titleIconEl){
      if(app.icon && typeof app.icon === 'string' && app.icon.includes(':')){
        titleIconEl.innerHTML = `<span class="iconify" data-icon="${app.icon}"></span>`;
      } else if(app.icon && typeof app.icon === 'string' && app.icon.startsWith('/')){
        titleIconEl.innerHTML = `<img src="${app.icon}" alt="icon">`;
      } else if(app.url){
        try{
          const u = new URL(app.url);
          const fav = `${u.protocol}//${u.host}/favicon.ico`;
          const prox = `/os/api/proxy?asset=1&url=${encodeURIComponent(fav)}`;
          titleIconEl.innerHTML = `<img src="${prox}" alt="favicon">`;
        }catch{
          titleIconEl.innerHTML = '<span class="iconify" data-icon="fluent:globe-20-regular"></span>';
        }
      } else {
        titleIconEl.innerHTML = '<span class="iconify" data-icon="fluent:app-folder-20-regular"></span>';
      }
    }
    node.style.left = (100 + Math.random()*80) + 'px';
    node.style.top = (80 + Math.random()*60) + 'px';
    node.style.width = app.width || '720px';
    node.style.height = app.height || '480px';
    // Decide best icon for taskbar/dock: built-in logo if provided, else PWA favicon if available
    let taskIcon = app.icon;
    try{
      if(!taskIcon && app.url){
        const u = new URL(app.url);
        const fav = `${u.protocol}//${u.host}/favicon.ico`;
        taskIcon = `/os/api/proxy?asset=1&url=${encodeURIComponent(fav)}`;
      }
    }catch{}
    bringToFront(node);
    desktop.appendChild(node);
    addTaskItem(id, app.title, taskIcon || app.icon);

  const btnCloseEl = node.querySelector('.btn-close');
    const btnMinEl = node.querySelector('.btn-min');
    const btnMaxEl = node.querySelector('.btn-max');
  const btnBackEl = node.querySelector('.btn-back');
  const btnPaneEl = node.querySelector('.btn-pane');
    let maximized = false;
    const prevRect = { left: node.style.left, top: node.style.top, width: node.style.width, height: node.style.height };
  btnCloseEl.onclick = ()=>{ node.remove(); removeTaskItem(id); const i=state.windows.findIndex(x=>x.id===id); if(i>=0){ state.windows.splice(i,1); scheduleSave(); saveStateNow(1500); try{ localStorage.setItem('webos_state', JSON.stringify(state)); }catch{} } renderRunningApps(); };
  btnMinEl.onclick = ()=>{ node.classList.add('minimizing'); setTimeout(()=>{ node.style.display='none'; node.classList.remove('minimizing'); }, 200); };
    btnMaxEl.onclick = ()=>{
      if(!maximized){
        prevRect.left = node.style.left; prevRect.top = node.style.top; prevRect.width = node.style.width; prevRect.height = node.style.height;
        node.style.left='0px'; node.style.top='0px'; node.style.width='100%'; node.style.height='calc(100% - 40px)';
      } else {
        node.style.left = prevRect.left; node.style.top = prevRect.top; node.style.width = prevRect.width; node.style.height = prevRect.height;
      }
      maximized = !maximized;
  // Toggle icon: maximize vs restore
  const maxIco = btnMaxEl.querySelector('span.iconify');
  if(maxIco){ const id = maximized ? 'fluent:restore-20-regular' : 'fluent:maximize-20-regular'; maxIco.setAttribute('data-icon', id); }
      capturePositions(); captureSizes();
    };
    makeDraggable(node); makeResizable(node);

    const content = node.querySelector('.content');
    // Enable glow with inertia and track mouse inside window
    node.classList.add('glow-enabled');
    const glow = { tx: 0, ty: 0, cx: 0, cy: 0, raf: 0, fadeTimer: 0 };
    function ensureGlowLoop(){
      if(glow.raf) return;
      const step = ()=>{
        // ease current toward target for a water-like inertia
  glow.cx += (glow.tx - glow.cx) * 0.3; // even faster for high fluidity
  glow.cy += (glow.ty - glow.cy) * 0.3;
        node.style.setProperty('--mx', glow.cx + 'px');
        node.style.setProperty('--my', glow.cy + 'px');
        glow.raf = requestAnimationFrame(step);
      };
      glow.raf = requestAnimationFrame(step);
    }
    // initialize to center
    requestAnimationFrame(()=>{
      const r = node.getBoundingClientRect();
      glow.tx = glow.cx = r.width/2;
      glow.ty = glow.cy = r.height/2;
      ensureGlowLoop();
    });
    function bumpGlow(){
  node.style.setProperty('--gopa', '0.68');
      clearTimeout(glow.fadeTimer);
      glow.fadeTimer = setTimeout(()=>{ node.style.setProperty('--gopa', '0'); }, 650);
    }
    node.addEventListener('mousemove', (e)=>{
      const rect = node.getBoundingClientRect();
      glow.tx = e.clientX - rect.left;
      glow.ty = e.clientY - rect.top;
      ensureGlowLoop();
      bumpGlow();
    }, {passive:true});
    node.addEventListener('mouseleave', ()=>{ node.style.setProperty('--gopa', '0'); });
  // Focus should switch only on click, not hover; clicking anywhere should focus
  node.addEventListener('pointerdown', ()=>{ bringToFront(node); }, true);
    // Always use iframe for apps (builtin or pwa)
    const iframe = document.createElement('iframe');
  iframe.className = 'app-frame';
  // If PWA or proxy flagged, wrap via server proxy to containerize external app
  const shouldProxy = (app.kind === 'pwa') || !!app.proxy;
  let src = app.url || app.path;
  if(app.url && !/^https?:\/\//i.test(app.url)){
    src = 'https://' + String(app.url).replace(/^\/*/, '');
    app.url = src;
  }
  if(shouldProxy && app.url){
    let rewrite = 1, sanitize = 1;
    try{
      const h = new URL(app.url).hostname.toLowerCase();
      // For Google domains, avoid rewriting resources and stripping scripts
      if(/(^|\.)google\./.test(h)){
        // Keep rewrite=1 so navigation and assets stay within our proxy; but don't sanitize, to preserve scripts
        rewrite = 1; sanitize = 0;
      }
    }catch{}
    src = `/os/api/proxy?rewrite=${rewrite}&sanitize=${sanitize}&url=${encodeURIComponent(app.url)}`;
  }
  if(app.params && app.params.path){
    const sep = src.includes('?') ? '&' : '?';
    src = `${src}${sep}path=${encodeURIComponent(app.params.path)}`;
  }
  iframe.src = src;
  if(app.kind === 'pwa'){
    // Constrain capabilities but allow same-origin within the proxied page
    iframe.setAttribute('sandbox', 'allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads');
  }
    content.appendChild(iframe);

    // If this app was launched with params, deliver them once the iframe is ready
    try{
      iframe.addEventListener('load', ()=>{
        try{
          if(app && app.params){
            iframe.contentWindow.postMessage({ type: 'webos:params', params: app.params }, '*');
          }
        }catch{}
      });
    }catch{}

    // Basic bridge for persistence via postMessage (works for same-origin and cooperating PWAs)
    const handle = (ev)=>{
      if(ev.source !== iframe.contentWindow) return;
      const msg = ev.data || {};
      if(msg.type === 'webos:getState'){
        iframe.contentWindow.postMessage({type:'webos:state', state}, '*');
      } else if(msg.type === 'webos:setState'){
        // Shallow merge only; server merges deeply by top-level keys
        Object.assign(state, msg.state || {});
        applyAppearance();
        scheduleSave();
    } else if(msg.type === 'webos:launch' && msg.app){
      if(msg.params && !msg.app.params){ msg.app.params = msg.params; }
      launchApp(msg.app);
      } else if(msg.type === 'webos:setTitle' && typeof msg.title === 'string'){
        // Allow app to update the window title dynamically
        if(titleTextEl){ titleTextEl.textContent = msg.title; }
      } else if(msg.type === 'webos:cursor'){
        // Cursor position relayed from inside iframe: map to window coordinates
        try{
          const rWin = node.getBoundingClientRect();
          const rFrame = iframe.getBoundingClientRect();
          const fw = (msg.w || rFrame.width) || 1;
          const fh = (msg.h || rFrame.height) || 1;
          const localX = (msg.x / fw) * rFrame.width + (rFrame.left - rWin.left);
          const localY = (msg.y / fh) * rFrame.height + (rFrame.top - rWin.top);
          glow.tx = localX;
          glow.ty = localY;
          ensureGlowLoop();
          bumpGlow();
        }catch{}
      }
    };
  window.addEventListener('message', handle);
  // Back and Pane toggle buttons -> forward to iframe
  if(btnBackEl){ btnBackEl.addEventListener('click', ()=>{
    try{
      if(iframe && iframe.contentWindow && iframe.contentWindow.history){
        iframe.contentWindow.history.back();
      } else {
        iframe.contentWindow.postMessage({type:'webos:navigate', action:'back'}, '*');
      }
    }catch{
      try{ iframe.contentWindow.postMessage({type:'webos:navigate', action:'back'}, '*'); }catch{}
    }
  }); }
  if(btnPaneEl){
    if(app.kind === 'pwa'){
      // Hide for PWA: no pane concept
      btnPaneEl.style.display = 'none';
    } else {
      btnPaneEl.addEventListener('click', ()=>{ try{ iframe.contentWindow.postMessage({type:'webos:togglePane'}, '*'); }catch{} });
    }
  }

  // Clicking inside iframe should also bring its window to front
    iframe.addEventListener('pointerdown', ()=>{ bringToFront(node); });
    // Cleanup on close
    const oldClose = node.querySelector('.btn-close').onclick;
    node.querySelector('.btn-close').onclick = ()=>{ window.removeEventListener('message', handle); if(glow.raf){ cancelAnimationFrame(glow.raf); glow.raf = 0; } clearTimeout(glow.fadeTimer); oldClose(); };

    if(!restoring){
      state.windows.push({ id, slug: app.slug, title: app.title, kind: app.kind, path: app.path, url: app.url, icon: (taskIcon || app.icon), left: node.style.left, top: node.style.top, width: node.style.width, height: node.style.height });
      scheduleSave(); saveStateNow(1500);
      try{ localStorage.setItem('webos_state', JSON.stringify(state)); }catch{}
      renderRunningApps();
    }
    return node;
  }

  function restore(){
    (state.windows||[]).forEach(async (w)=>{
      const node = await launchApp(w, {restore:true});
      if(node){ node.style.left=w.left||node.style.left; node.style.top=w.top||node.style.top; node.style.width=w.width||node.style.width; node.style.height=w.height||node.style.height; }
    });
    // Update Apps menu list reflecting restored windows
    try{ renderRunningApps(); }catch{}
  }

  // Allow apps to request shell menus or pane toggles
  try{
    window.addEventListener('message', (ev)=>{
      const msg = ev.data||{};
      if(msg && msg.type === 'webos:openMenu'){
        try{
          if(msg.menu === 'start'){ startMenu.classList.remove('hidden'); appsMenu?.classList.add('hidden'); userMenu?.classList.add('hidden'); placeMenuCentered(startMenu); }
          else if(msg.menu === 'search'){ if(searchMenu.classList.contains('hidden')){ searchMenu.classList.remove('hidden'); searchMenu.classList.add('show'); placeMenuCentered(searchMenu); setTimeout(()=> searchInput?.focus(), 10);} }
          else if(msg.menu === 'apps'){ appsMenu.classList.remove('hidden'); startMenu.classList.add('hidden'); userMenu?.classList.add('hidden'); placeMenuCentered(appsMenu); renderRunningApps(); }
          else if(msg.menu === 'user'){ userMenu.classList.remove('hidden'); startMenu.classList.add('hidden'); appsMenu?.classList.add('hidden'); ensureAccountLoaded(); placeMenuCentered(userMenu); }
        }catch{}
      } else if(msg && msg.type === 'webos:requestTogglePane'){
        try{
          // Find active window and forward togglePane to its iframe
          const win = document.querySelector('.window.active-window');
          const iframe = win?.querySelector('iframe.app-frame');
          if(iframe && iframe.contentWindow){ iframe.contentWindow.postMessage({type:'webos:togglePane'}, '*'); }
        }catch{}
      }
    });
  }catch{}

  function appFromSlug(slug){
    if(WEBOS_APPS[slug]){ const info = WEBOS_APPS[slug]; return { slug, title: info.title, kind: info.kind, path: info.path, icon: info.icon }; }
    // Lookup button metadata
    const btn = document.querySelector(`.start-app[data-slug="${slug}"]`);
    if(!btn) return null;
    const kind = btn.dataset.kind;
    const title = btn.querySelector('.app-title')?.textContent?.trim() || btn.textContent.trim();
    if(kind === 'pwa'){
      return { slug, title, kind, url: btn.dataset.url, proxy: true, icon: btn.dataset.icon || (btn.querySelector('.app-icon')?.textContent)||'🌐' };
    }
    // Default built-in HTML app path
  return { slug, title, kind: 'builtin', path: `apps/html/${slug}`, icon: btn.dataset.icon || 'fluent:app-folder-20-regular' };
  }

  // Populate All apps list with any built-in apps not listed by server
  function ensureBuiltinsInAllApps(){
    const host = document.getElementById('allapps-container'); if(!host) return;
      const existing = new Set(Array.from(host.querySelectorAll('.start-app')).map(b=>b.dataset.slug));
      const entries = Object.entries(WEBOS_APPS||{}).sort((a,b)=> String(a[1].title||a[0]).localeCompare(String(b[1].title||b[0])));
      entries.forEach(([slug, info])=>{
      if(existing.has(slug)) return;
  const btn = document.createElement('button'); btn.className='start-app'; btn.dataset.slug=slug; btn.dataset.kind=info.kind; btn.dataset.icon=info.icon||''; btn.dataset.url='';
  const iconHtml = (info.icon && String(info.icon).includes(':'))? `<span class="iconify" data-icon="${info.icon}"></span>` : (info.icon && String(info.icon).startsWith('/')? `<img class="app-img" src="${info.icon}" alt="">` : `<span class="iconify" data-icon="fluent:app-folder-20-regular"></span>`);
      btn.innerHTML = `<span class="app-icon">${iconHtml}</span><span class="app-title">${info.title||slug}</span>`;
      // click + context same as others
  btn.addEventListener('click', ()=>{ launchApp(appFromSlug(slug)); startMenu.classList.add('hidden'); appsMenu?.classList.add('hidden'); });
      btn.addEventListener('contextmenu', (ev)=>{ ev.preventDefault(); if(!startCtx) return; startCtx.classList.remove('hidden'); startCtx.style.left=ev.clientX+'px'; startCtx.style.top=ev.clientY+'px'; startCtx.dataset.slug=slug; startCtx.dataset.appId=''; });
      host.appendChild(btn);
    });
  }

  // Refresh All apps list from server (installed PWAs) and keep built-ins
  async function refreshAllAppsFromServer(){
    try{
      const res = await fetch('/os/api/store/apps');
      if(!res.ok) return;
      const data = await res.json();
      const apps = (data && data.apps) || [];
      const host = document.getElementById('allapps-container'); if(!host) return;
      // Preserve built-ins already in DOM; remove non-built-in rows and rebuild from response where installed
      Array.from(host.querySelectorAll('.start-app')).forEach(btn=>{
        const isBuiltin = !btn.dataset.appId; // built-ins have no appId in template
        if(!isBuiltin){ btn.remove(); }
      });
      // Remove any leftover placeholder nodes
      Array.from(host.children).forEach(ch=>{ if(!ch.classList.contains('start-app')) ch.remove(); });
      apps.filter(a=> a.installed && !a.builtin).forEach(a=>{
        // avoid duplicates by slug
        if(host.querySelector(`.start-app[data-slug="${a.slug}"]`)) return;
        const btn = document.createElement('button'); btn.className='start-app';
        btn.dataset.slug = a.slug; btn.dataset.appId = a.id; btn.dataset.kind = a.kind; btn.dataset.url = a.launch_url || ''; btn.dataset.proxy = a.use_proxy ? '1' : '0'; btn.dataset.icon = a.icon || '';
        let iconHtml = '';
        if(a.icon && a.icon.includes(':')){ iconHtml = `<span class="iconify" data-icon="${a.icon}"></span>`; }
  else if(a.kind === 'pwa' && a.launch_url){ iconHtml = '<span class="iconify" data-icon="fluent:globe-20-regular"></span>'; }
  else if(a.icon && a.icon.startsWith('/')){ iconHtml = `<img class="app-img" src="${a.icon}" alt="">`; }
  else { iconHtml = a.icon ? `<span class="iconify" data-icon="${a.icon}"></span>` : '<span class="iconify" data-icon="fluent:globe-20-regular"></span>'; }
        btn.innerHTML = `<span class="app-icon">${iconHtml}</span><span class="app-title">${a.name}</span>`;
        btn.addEventListener('click', ()=>{
          const app = { slug: a.slug, title: a.name, kind: a.kind, url: a.launch_url, proxy: true, icon: a.icon };
          launchApp(app); startMenu.classList.add('hidden'); appsMenu?.classList.add('hidden');
        });
        btn.addEventListener('contextmenu', (ev)=>{ ev.preventDefault(); if(!startCtx) return; startCtx.classList.remove('hidden'); startCtx.style.left=ev.clientX+'px'; startCtx.style.top=ev.clientY+'px'; startCtx.dataset.slug=a.slug; startCtx.dataset.appId=String(a.id||''); });
        host.appendChild(btn);
      });
      ensureBuiltinsInAllApps();

      // Prune Start pinned and taskbar pins that refer to uninstalled apps (keep built-ins)
      const builtinSlugs = new Set(Object.keys(WEBOS_APPS||{}));
      const installedSlugs = new Set(apps.filter(a=> a.installed && !a.builtin).map(a=> a.slug));
      const keep = (slug)=> builtinSlugs.has(slug) || installedSlugs.has(slug);
      const beforePinned = Array.isArray(state.pinned_apps) ? state.pinned_apps.slice() : [];
      const beforeDock = Array.isArray(state.taskbar_pins) ? state.taskbar_pins.slice() : [];
      state.pinned_apps = beforePinned.filter(keep);
      state.taskbar_pins = beforeDock.filter(keep);
      renderPinned(); renderDockPins(); scheduleSave();
    }catch{}
  }

  function placeMenuCentered(menu){ const mw = menu.offsetWidth || 360; menu.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, (window.innerWidth/2) - (mw/2))) + 'px'; }
  function renderRunningApps(){
    const host = document.getElementById('running-apps');
    if(!host) return;
    host.innerHTML = '';
    (state.windows||[]).forEach(w=>{
      const btn = document.createElement('button');
      btn.className = 'start-app';
      let iconHtml = '';
      if(w.icon && (String(w.icon).startsWith('/') || String(w.icon).startsWith('http'))){
        iconHtml = `<img class="app-img" src="${w.icon}" alt="icon" />`;
      } else if(w.icon && String(w.icon).includes(':')){
        iconHtml = `<span class="iconify" data-icon="${w.icon}"></span>`;
      } else if(w.icon && /^<img/i.test(String(w.icon))){
        iconHtml = String(w.icon);
      } else if(w.url){
        try{
          const u = new URL(w.url);
          const fav = `${u.protocol}//${u.host}/favicon.ico`;
          const prox = `/os/api/proxy?asset=1&url=${encodeURIComponent(fav)}`;
          iconHtml = `<img class="app-img" src="${prox}" alt="favicon" />`;
  }catch{ iconHtml = '<span class="iconify" data-icon="fluent:globe-20-regular"></span>'; }
      } else {
  iconHtml = w.icon ? `<span class="iconify" data-icon="${w.icon}"></span>` : '<span class="iconify" data-icon="fluent:app-folder-20-regular"></span>';
      }
  btn.innerHTML = `<span class="app-icon">${iconHtml}</span><span class="app-title">${w.title}</span><span class="app-close" title="Close"><span class="iconify" data-icon="fluent:dismiss-20-regular"></span></span>`;
      btn.onclick = ()=>{
        const node = document.querySelector(`.window[data-window-id="${w.id}"]`);
        if(node){ node.style.display='flex'; bringToFront(node); appsMenu.classList.add('hidden'); }
      };
      // Close button behavior
      const closeEl = btn.querySelector('.app-close');
      closeEl.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        const node = document.querySelector(`.window[data-window-id="${w.id}"]`);
        if(node){ node.remove(); }
        removeTaskItem(w.id);
        const i = state.windows.findIndex(x=>x.id===w.id);
        if(i>=0){ state.windows.splice(i,1); }
        scheduleSave();
        renderRunningApps();
      });
      host.appendChild(btn);
    });
  }
  startBtn.addEventListener('click', (e)=>{ startMenu.classList.toggle('hidden'); appsMenu?.classList.add('hidden'); userMenu?.classList.add('hidden'); placeMenuCentered(startMenu); renderPinned(); ensureBuiltinsInAllApps(); e.stopPropagation(); });
  appsBtn.addEventListener('click', (e)=>{ appsMenu.classList.toggle('hidden'); startMenu.classList.add('hidden'); userMenu?.classList.add('hidden'); placeMenuCentered(appsMenu); renderRunningApps(); e.stopPropagation(); });
  if(searchBtn){ searchBtn.addEventListener('click', (e)=>{ const wasHidden = searchMenu.classList.contains('hidden'); searchMenu.classList.toggle('hidden'); startMenu.classList.add('hidden'); appsMenu?.classList.add('hidden'); userMenu?.classList.add('hidden'); if(!searchMenu.classList.contains('hidden')){ searchMenu.classList.add('show'); placeMenuCentered(searchMenu); setTimeout(()=> searchInput?.focus(), 10); } else { searchMenu.classList.remove('show'); } e.stopPropagation(); }); }
  // Swap search icon regular/filled on hover/active
  (function(){ if(!searchBtn) return; const ico = searchBtn.querySelector('span.iconify'); if(!ico) return; const toFilled=s=>s.replace('-regular','-filled'); const toRegular=s=>s.replace('-filled','-regular'); searchBtn.addEventListener('mouseenter', ()=>{ const id=ico.getAttribute('data-icon')||''; ico.setAttribute('data-icon', toFilled(id)); }); searchBtn.addEventListener('mouseleave', ()=>{ const id=ico.getAttribute('data-icon')||''; ico.setAttribute('data-icon', toRegular(id)); }); })();
  const dockLeftBtn = document.getElementById('dock-left');
  const dockRightBtn = document.getElementById('dock-right');
  if(dockLeftBtn){ dockLeftBtn.addEventListener('click', ()=> taskbar.scrollBy({left:-200,behavior:'smooth'})); }
  if(dockRightBtn){ dockRightBtn.addEventListener('click', ()=> taskbar.scrollBy({left:200,behavior:'smooth'})); }
  const appsCloseBtn = document.getElementById('apps-close');
  if(appsCloseBtn){ appsCloseBtn.addEventListener('click', ()=> appsMenu.classList.add('hidden')); }
  const appsCloseAllBtn = document.getElementById('apps-close-all');
  if(appsCloseAllBtn){ appsCloseAllBtn.addEventListener('click', ()=>{
    document.querySelectorAll('.window').forEach(w=>w.remove());
    taskbar.querySelectorAll('.task-item').forEach(b=>b.remove());
    state.windows = [];
    scheduleSave();
    updateDockDensity();
  }); }
  userBtn.addEventListener('click', (e)=>{ userMenu.classList.toggle('hidden'); startMenu.classList.add('hidden'); appsMenu?.classList.add('hidden'); if(!userMenu.classList.contains('hidden')) ensureAccountLoaded(); placeMenuCentered(userMenu); e.stopPropagation(); });
  document.addEventListener('click', (e)=>{ if(!startMenu.contains(e.target) && e.target!==startBtn){ startMenu.classList.add('hidden'); }});
  document.addEventListener('click', (e)=>{ if(!appsMenu.contains(e.target) && e.target!==appsBtn){ appsMenu.classList.add('hidden'); }});
  document.addEventListener('click', (e)=>{ if(!userMenu.contains(e.target) && e.target!==userBtn){ userMenu.classList.add('hidden'); }});
  document.addEventListener('click', (e)=>{ if(searchMenu && !searchMenu.contains(e.target) && e.target!==searchBtn){ searchMenu.classList.add('hidden'); searchMenu.classList.remove('show'); }});
  document.querySelectorAll('.start-app').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const slug = btn.dataset.slug; const kind = btn.dataset.kind; const url = btn.dataset.url;
      let app = null;
      if(kind==='pwa'){
  app = { slug, title: btn.querySelector('.app-title')?.textContent?.trim() || btn.textContent.trim(), kind, url, proxy: true, icon: btn.dataset.icon || 'fluent:globe-20-regular' };
      } else {
        app = appFromSlug(slug) || { slug, title: btn.querySelector('.app-title')?.textContent?.trim() || btn.textContent.trim(), kind: 'builtin', path: `apps/html/${slug}`, icon: btn.dataset.icon || (btn.querySelector('.app-icon')?.textContent)||'🗔' };
      }
      if(app) launchApp(app);
      startMenu.classList.add('hidden');
      appsMenu?.classList.add('hidden');
    });
    // Context menu for pin/uninstall
    btn.addEventListener('contextmenu', (ev)=>{
      ev.preventDefault(); const b=ev.currentTarget; const slug=b.dataset.slug; const appId=b.dataset.appId; if(!startCtx) return; startCtx.classList.remove('hidden'); startCtx.style.left=ev.clientX+'px'; startCtx.style.top=ev.clientY+'px'; startCtx.dataset.slug=slug||''; startCtx.dataset.appId=appId||''; });
  });

  document.addEventListener('click', (e)=>{ if(startCtx && !startCtx.contains(e.target)) startCtx.classList.add('hidden'); });
  if(startCtx){
    startCtx.addEventListener('click', async (e)=>{
      const act = e.target.closest('.menu-btn')?.dataset?.act; if(!act) return; const slug = startCtx.dataset.slug; const appId = startCtx.dataset.appId; startCtx.classList.add('hidden');
  if(act==='pin-start'){ togglePinned(slug); renderPinned(); /* keep start menu open to pin more */ placeMenuCentered(startMenu); }
      else if(act==='pin-taskbar'){ toggleDockPin(slug); }
  else if(act==='uninstall' && appId){ try{ const fd=new FormData(); fd.set('app_id', appId); await fetch('/os/api/store/uninstall',{method:'POST', body:fd, headers:{'X-CSRFToken':getCsrf()}}); await refreshAllAppsFromServer(); }catch{} }
    });
    // Dynamically set labels (Pin/Unpin) when opening the context menu
    document.addEventListener('contextmenu', (ev)=>{
      const target = ev.target.closest && ev.target.closest('.start-app');
      if(!target) return;
      const slug = target.dataset.slug;
      const isStartPinned = isPinned(slug);
      const isDocked = getDockPins().includes(slug);
      const pinStartBtn = startCtx.querySelector('[data-act="pin-start"]');
      const pinTaskbarBtn = startCtx.querySelector('[data-act="pin-taskbar"]');
      const uninstallBtn = startCtx.querySelector('[data-act="uninstall"]');
      if(pinStartBtn){ pinStartBtn.textContent = isStartPinned ? 'Unpin from Start' : 'Pin to Start'; }
      if(pinTaskbarBtn){ pinTaskbarBtn.textContent = isDocked ? 'Unpin from taskbar' : 'Pin to taskbar'; }
      // Hide uninstall for built-ins or items without appId
      const appId = target.dataset.appId || '';
      if(uninstallBtn){ uninstallBtn.style.display = appId ? '' : 'none'; }
    }, true);
  }

  if(userOpenSettings){ userOpenSettings.addEventListener('click', ()=>{
    startMenu.classList.add('hidden'); appsMenu.classList.add('hidden'); userMenu.classList.add('hidden');
    const btn = document.querySelector('.start-app[data-slug="settings"]'); if(btn) btn.click();
  }); }
  if(userLogout){ userLogout.addEventListener('click', async ()=>{ await saveStateNow(1500); window.location.href = '/signout/'; }); }

  // Profile card population
  let accountLoaded = false;
  async function ensureAccountLoaded(){
    if(accountLoaded) return;
    try{
      const [accRes, storRes] = await Promise.all([
        fetch('/os/api/account'),
        fetch('/os/api/storage')
      ]);
      if(!accRes.ok) return;
      const data = await accRes.json();
      let plan = 'free';
      try{ if(storRes.ok){ const j = await storRes.json(); plan = j.plan || 'free'; } }catch{}
      fillUserCard(data || {}, plan);
      accountLoaded = true;
    }catch{}
  }
  function fillUserCard(acc, plan){
    if(userNameEl) userNameEl.textContent = acc.username || acc.email || 'User';
    if(userPhoneEl) userPhoneEl.textContent = acc.phone || '—';
    const tierEl = document.getElementById('user-tier'); if(tierEl) tierEl.textContent = plan==='premium'?'Premium':'Free';
    if(userAvatarEl){
      const avatar = acc.avatar;
      if(avatar){ userAvatarEl.innerHTML = `<img src="${avatar}" alt="avatar">`; }
      else {
        const base = (acc.username || acc.email || 'U').toString().trim();
        const initials = base.split(/\s+/).map(s=>s[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
        userAvatarEl.textContent = initials || 'U';
      }
    }
    if(userBtn){
      const avatar = acc.avatar;
      if(avatar){ userBtn.innerHTML = `<img class="tb-avatar-img" src="${avatar}" alt="avatar">`; }
      else {
        const base = (acc.username || acc.email || 'U').toString().trim();
        const initials = base.split(/\s+/).map(s=>s[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
        userBtn.innerHTML = `<span class="tb-avatar">${initials || 'U'}</span>`;
      }
    }
  }

  // Splash progress helper
  function setSplashProgress(p){ if(splashBar){ splashBar.style.width = Math.max(0, Math.min(100, p)) + '%'; } }
  function setSplashText(t){ if(splashSub) splashSub.textContent = t; }

  // Load state and restore windows with splash timing
  (async function init(){
    setSplashText('Loading your desktop…'); setSplashProgress(10);
    await loadState(); setSplashProgress(35);
    setSplashText('Restoring apps…'); restore(); setSplashProgress(55);
    setSplashText('Preparing UI…');
    // Initialize status pills
    setNetworkStatus(navigator.onLine ? 'online' : 'offline');
    setSyncStatus('ok');
  startAutoSave(); updateDockDensity(); renderPinned(); renderDockPins(); ensureBuiltinsInAllApps(); await refreshAllAppsFromServer(); setSplashProgress(80);
    // Give a tiny delay for layout/paint, then finish
    await new Promise(r=> setTimeout(r, 450)); setSplashProgress(100);
    await new Promise(r=> setTimeout(r, 250));
    if(splash){ splash.classList.add('hidden'); setTimeout(()=> splash.remove && splash.remove(), 600); }
  })();

  // Save on unload
  window.addEventListener('beforeunload', ()=>{ try{ localStorage.setItem('webos_state', JSON.stringify(state)); }catch{}; navigator.sendBeacon && navigator.sendBeacon('/os/api/state/save', new Blob([JSON.stringify({state})], {type:'application/json'})); });
  // Save when tab is hidden as an extra guard
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden'){ try{ localStorage.setItem('webos_state', JSON.stringify(state)); }catch{}; navigator.sendBeacon && navigator.sendBeacon('/os/api/state/save', new Blob([JSON.stringify({state})], {type:'application/json'})); }});

  // Listen for install/uninstall from Store app
  window.addEventListener('message', (ev)=>{
    const msg = ev.data || {};
    if(msg.type === 'webos:appsChanged'){
      refreshAllAppsFromServer();
    }
  });
  

  // Mini calendar popup on clock click
  function renderCalendar(date){
    const y=date.getFullYear(), m=date.getMonth();
    const first=new Date(y,m,1), last=new Date(y,m+1,0);
    const days=['Su','Mo','Tu','We','Th','Fr','Sa'];
    let html=`<div class="header"><button id="cal-prev">◀</button><div>${date.toLocaleString(undefined,{month:'long',year:'numeric'})}</div><button id="cal-next">▶</button></div>`;
    html += '<table><thead><tr>'+days.map(d=>`<th>${d}</th>`).join('')+'</tr></thead><tbody>';
    const pad = first.getDay(); let dnum=1; for(let r=0;r<6;r++){ html+='<tr>'; for(let c=0;c<7;c++){ if(r===0 && c<pad || dnum>last.getDate()){ html+='<td></td>'; } else { html+=`<td>${dnum++}</td>`; } } html+='</tr>'; if(dnum>last.getDate()) break; }
    html+='</tbody></table>';
    calendar.innerHTML=html;
    calendar.querySelector('#cal-prev').onclick=()=>{ renderCalendar(new Date(y,m-1,1)); };
    calendar.querySelector('#cal-next').onclick=()=>{ renderCalendar(new Date(y,m+1,1)); };
  }
  clock.addEventListener('click', ()=>{ if(calendar.classList.contains('hidden')){ renderCalendar(new Date()); calendar.classList.remove('hidden'); } else { calendar.classList.add('hidden'); } });
  document.addEventListener('click', (e)=>{ if(!calendar.contains(e.target) && e.target!==clock) calendar.classList.add('hidden'); });

  // Apply blur/glass from settings
  function applyAppearance(){
    const ap = state.appearance || {};
    const blur = !!ap.blur;
    document.body.classList.toggle('blur-on', blur);
    // Theme toggle on body for iframe overrides
    document.body.classList.toggle('theme-light', ap.theme === 'light');
    // Wallpaper on desktop element
    if(ap.wallpaper){
      // Route wallpaper through proxy if it's an external URL
      try{
        const u = new URL(ap.wallpaper, window.location.origin);
        let src = ap.wallpaper;
        if(u.origin !== window.location.origin){
          src = `/os/api/proxy?asset=1&url=${encodeURIComponent(u.href)}`;
        }
        desktop.style.backgroundImage = `url('${src}')`;
      }catch{
        desktop.style.backgroundImage = `url('${ap.wallpaper}')`;
      }
      desktop.style.backgroundSize = 'cover';
      desktop.style.backgroundPosition = 'center';
    } else {
      // Use local default wallpaper (provide an image under static)
      desktop.style.backgroundImage = "url('/static/assets/images/default-wallpaper.jpg')";
    }
  }

  function setNetworkStatus(stateStr){
    if(!userNetEl) return;
    if(stateStr==='online'){
      userNetEl.textContent = 'Online';
      userNetEl.classList.remove('danger');
    } else {
      userNetEl.textContent = 'Offline';
      userNetEl.classList.add('danger');
    }
  }
  function setSyncStatus(stateStr){
    if(!userSyncEl) return;
    const labelEl = userSyncEl.querySelector('.label');
    const icoEl = userSyncEl.querySelector('.iconify');
    userSyncEl.classList.remove('pill-ok','pill-warn','pill-danger','pill-spinning');
    if(stateStr==='syncing'){
      if(labelEl) labelEl.textContent = 'Syncing…';
      userSyncEl.classList.add('pill-warn','pill-spinning');
    } else if(stateStr==='ok'){
      if(labelEl) labelEl.textContent = 'Synced';
      userSyncEl.classList.add('pill-ok');
    } else if(stateStr==='error'){
      if(labelEl) labelEl.textContent = 'Sync error';
      userSyncEl.classList.add('pill-danger');
    }
  }
  window.addEventListener('online', ()=> setNetworkStatus('online'));
  window.addEventListener('offline', ()=> setNetworkStatus('offline'));

  // Manual sync on click
  if(userSyncEl){
    // Hover effect for icon fill
    (function(){ const ico = userSyncEl.querySelector('span.iconify'); if(!ico) return; const toFilled=s=>s.replace('-regular','-filled'); const toRegular=s=>s.replace('-filled','-regular'); userSyncEl.addEventListener('mouseenter', ()=>{ const id=ico.getAttribute('data-icon')||''; ico.setAttribute('data-icon', toFilled(id)); }); userSyncEl.addEventListener('mouseleave', ()=>{ const id=ico.getAttribute('data-icon')||''; ico.setAttribute('data-icon', toRegular(id)); }); })();
    userSyncEl.addEventListener('click', async ()=>{
      await saveStateNow(4000);
    });
  }

  function refreshAppsMenu(){
    if(!appsList) return;
    appsList.innerHTML = '';
    (state.windows||[]).forEach(w=>{
      const item = document.createElement('div'); item.className='item';
      let iconHtml = '🗔';
      if(w.icon && (String(w.icon).startsWith('/') || String(w.icon).startsWith('http'))){
        iconHtml = `<img class="app-img" src="${w.icon}" alt="icon" />`;
      } else if(w.icon && String(w.icon).includes(':')){
        iconHtml = `<span class="iconify" data-icon="${w.icon}"></span>`;
      } else if(w.icon && /^<img/i.test(String(w.icon))){
        iconHtml = String(w.icon);
      } else if(w.icon){
        iconHtml = String(w.icon);
      }
      item.innerHTML = `<span class="icon">${iconHtml}</span><span>${w.title}</span>`;
      item.dataset.win = w.id;
      item.onclick = ()=>{
        const node = document.querySelector(`.window[data-window-id="${w.id}"]`);
        if(node){ node.style.display='flex'; bringToFront(node); }
      };
      appsList.appendChild(item);
    });
  }

  // Search: scan built-in apps, server-listed apps in All apps, and file paths (if cached in state)
  function performSearch(q){ q=(q||'').trim().toLowerCase(); if(!q){ searchResults.innerHTML=''; return; }
    const results=[];
    // Built-in apps
    Object.entries(WEBOS_APPS||{}).forEach(([slug,info])=>{ const title=String(info.title||slug); if(title.toLowerCase().includes(q)) results.push({type:'app', title, slug, icon:info.icon, app: {slug, kind:info.kind, path:info.path, url: null, icon: info.icon}}); });
    // Server apps already rendered in All apps
    document.querySelectorAll('#allapps-container .start-app').forEach(btn=>{ const name = btn.querySelector('.app-title')?.textContent?.trim()||''; const slug = btn.dataset.slug; if(name.toLowerCase().includes(q) && !results.find(r=>r.slug===slug)){
      const kind = btn.dataset.kind; const url = btn.dataset.url; const icon = btn.dataset.icon || btn.querySelector('.app-icon')?.textContent || '🗔'; results.push({type:'app', title:name, slug, icon, app:{slug, kind, url, proxy: (kind==='pwa') ? true : (btn.dataset.proxy==='1'), icon}});
    }});
    // Files/folders from last listing (if available in window state.cache)
    try{
      const cache = state.fs_cache || [];
      cache.forEach(e=>{ const nm=String(e.name||''); if(nm.toLowerCase().includes(q)) results.push({type:e.is_dir?'folder':'file', title:nm, path:e.path}); });
    }catch{}
    renderSearchResults(results.slice(0, 50));
  }
  function renderSearchResults(list){ if(!searchResults) return; searchResults.innerHTML=''; if(!list.length){ searchResults.innerHTML='<div class="muted" style="padding:6px 4px">No results</div>'; return; }
    list.forEach(it=>{
      const row=document.createElement('div'); row.className='result';
      let icon='🔎'; if(it.type==='app'){ if(it.icon && String(it.icon).includes(':')) icon = `<span class="iconify" data-icon="${it.icon}"></span>`; else if(it.icon && String(it.icon).startsWith('/')) icon = `<img class="app-img" src="${it.icon}" alt="">`; else icon = it.icon || '🗔'; }
      else { icon = it.type==='folder'? '📁' : '📄'; }
      row.innerHTML = `<span class="ico">${icon}</span><span class="ttl">${it.title}</span>`;
      row.addEventListener('click', ()=>{
        if(it.type==='app'){ launchApp(it.app); } else {
          // Open Explorer to the path
          try{ window.postMessage({type:'webos:launch', app:{slug:'explorer', kind:'builtin', path: WEBOS_APPS['explorer'].path }, params:{path:it.path}, focus:true}, '*'); }catch{}
        }
        searchMenu.classList.add('hidden'); searchMenu.classList.remove('show');
      });
      searchResults.appendChild(row);
    });
  }
  if(searchInput){ searchInput.addEventListener('input', ()=> performSearch(searchInput.value)); }

  if(btnCloseAll){ btnCloseAll.addEventListener('click', ()=>{
    document.querySelectorAll('.window').forEach(w=>w.remove());
    taskbar.querySelectorAll('.task-item').forEach(b=>b.remove());
    state.windows = [];
    refreshAppsMenu();
    scheduleSave();
  }); }

  // Icon fallback: if Iconify CDN fails or is blocked, replace .iconify nodes with a local SVG
  function replaceMissingIconify(root){
    (root || document).querySelectorAll('span.iconify').forEach(el=>{
      // If Iconify already injected an SVG, keep it
      if(el.querySelector('svg')) return;
      if(el.dataset.fallbackApplied==='1') return;
      el.dataset.fallbackApplied = '1';
      // Insert neutral emoji fallback
      el.textContent = '🗔';
      el.style.fontSize = '1.2em';
      el.style.lineHeight = '1';
      el.style.display = 'inline-flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
    });
  }
  // Try once after load, then observe DOM mutations (new windows, menus)
  setTimeout(()=> replaceMissingIconify(document), 700);
  const mo = new MutationObserver((muts)=>{
    for(const m of muts){ if(m.addedNodes && m.addedNodes.length){ m.addedNodes.forEach(n=>{ if(n.nodeType===1){ replaceMissingIconify(n); } }); } }
  });
  try{ mo.observe(document.body, {childList:true, subtree:true}); }catch{}

  // Local Fluent icon replacements (no external Iconify)
  (function(){
    const ICON_MAP = {
      'fluent:search-20-regular': '🔍',
      'fluent:chevron-left-24-regular': '◀',
      'fluent:chevron-right-24-regular': '▶',
      'fluent:person-24-regular': '👤',
      'fluent:person-20-regular': '👤',
      'fluent:person-20-filled': '👤',
      'fluent:dismiss-20-regular': '✖',
      'fluent:dismiss-square-multiple-20-regular': '✖',
      'fluent:arrow-sync-20-regular': '🔁',
      'fluent:settings-20-regular': '⚙️',
      'fluent:arrow-exit-20-regular': '🚪',
      'fluent:apps-list-20-regular': '🧩',
      'fluent:apps-list-20-filled': '🧩',
      'fluent:checkmark-circle-20-regular': '✅',
      'fluent:checkmark-circle-20-filled': '✅',
      'fluent:cloud-add-20-regular': '☁️',
      'fluent:cloud-add-20-filled': '☁️',
      'fluent:cloud-upload-20-regular': '☁️⬆️',
      'fluent:warning-20-regular': '⚠️',
      'fluent:warning-20-filled': '⚠️',
      'fluent:database-24-regular': '🛢️',
      'fluent:database-20-regular': '🛢️',
      'fluent:database-20-filled': '🛢️',
    };
    function replace(root){
      (root||document).querySelectorAll('span.iconify').forEach(el=>{
        if(el.querySelector('svg')) return;
        const id = el.getAttribute('data-icon') || '';
        const ch = ICON_MAP[id];
        if(!ch) return; // leave to generic fallback above
        el.textContent = ch;
        el.style.fontSize = '1.2em';
        el.style.lineHeight = '1';
        el.style.display = 'inline-flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
      });
    }
    try{
      replace(document);
      const mo2 = new MutationObserver(m=> m.forEach(x=>{
        if(x.type==='attributes' && x.target && x.target.matches && x.target.matches('span.iconify')){ replace(x.target); }
        if(x.addedNodes && x.addedNodes.length){ x.addedNodes.forEach(n=>{ if(n.nodeType===1) replace(n); }); }
      }));
      mo2.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['data-icon']});
    }catch{}
  })();
})();
