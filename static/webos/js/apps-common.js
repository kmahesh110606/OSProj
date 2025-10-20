// Common script injected in built-in app iframes to provide UX hooks (cursor tracking for glow)
(function(){
  if(window.top === window) return; // not inside iframe
  // Expose convenience API for apps
  try{
    window.webos = window.webos || {};
    window.webos.openStart = ()=>{ try{ window.top.postMessage({type:'webos:openMenu', menu:'start'}, '*'); }catch{} };
    window.webos.openSearch = ()=>{ try{ window.top.postMessage({type:'webos:openMenu', menu:'search'}, '*'); }catch{} };
    window.webos.openApps = ()=>{ try{ window.top.postMessage({type:'webos:openMenu', menu:'apps'}, '*'); }catch{} };
    window.webos.openUser = ()=>{ try{ window.top.postMessage({type:'webos:openMenu', menu:'user'}, '*'); }catch{} };
    window.webos.togglePane = ()=>{ try{ window.top.postMessage({type:'webos:requestTogglePane'}, '*'); }catch{} };
    window.webos.launch = (app)=>{ try{ window.top.postMessage({type:'webos:launch', app, focus:true}, '*'); }catch{} };
    window.webos.setTitle = (title)=>{ try{ window.top.postMessage({type:'webos:setTitle', title}, '*'); }catch{} };
  }catch{}
  let pending = null;
  let last = {x:0,y:0,w:0,h:0};
  function send(){
    pending = null;
    try{
      window.top.postMessage({type:'webos:cursor', x: last.x, y: last.y, w: last.w, h: last.h}, '*');
    }catch{}
  }
  function onMove(e){
    last.x = e.clientX; last.y = e.clientY; last.w = window.innerWidth; last.h = window.innerHeight;
    if(!pending){ pending = requestAnimationFrame(send); }
  }
  window.addEventListener('mousemove', onMove, {passive:true});

  // Theme sync: request state from top and apply theme-light accordingly
  try{
    window.top.postMessage({type:'webos:getState'}, '*');
    window.addEventListener('message', (ev)=>{
      const msg = ev.data || {};
      if(msg.type === 'webos:state' && msg.state){
        const theme = msg.state.appearance && msg.state.appearance.theme;
        document.body.classList.toggle('theme-light', theme === 'light');
      }
    });
  }catch{}

  // Page-load enter animations for app content
  try{
    const runEnter = ()=>{
      document.body.classList.add('app-animate-enter');
      // Stagger visible cards slightly
      const cards = Array.from(document.querySelectorAll('.app-card'));
      cards.slice(0, 8).forEach((el,i)=>{ el.style.animationDelay = (i*40)+'ms'; el.classList.add('app-card-enter'); });
      setTimeout(()=>{ try{ cards.forEach(el=>{ el.classList.remove('app-card-enter'); el.style.animationDelay=''; }); document.body.classList.remove('app-animate-enter'); }catch{} }, 600);
    };
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', runEnter); else runEnter();
  }catch{}

  // Lightweight toast utility for confirmations across apps
  try{
    const ensureToastHost = ()=>{
      let host = document.getElementById('webos-toast-host');
      if(!host){
        host = document.createElement('div'); host.id='webos-toast-host';
        host.style.position='fixed'; host.style.zIndex='9999'; host.style.left='50%'; host.style.bottom='18px'; host.style.transform='translateX(-50%)';
        host.style.display='flex'; host.style.flexDirection='column'; host.style.gap='8px'; host.style.pointerEvents='none';
        document.body.appendChild(host);
      }
      return host;
    };
    window.showToast = function(msg, opts){
      const host = ensureToastHost();
      const card = document.createElement('div'); card.className='app-card';
      // Styles inline to avoid CSS dependency
      card.style.background='var(--surface, rgba(17,24,39,.9))'; card.style.color='var(--text, #fff)'; card.style.border='1px solid var(--border, #374151)'; card.style.borderRadius='10px'; card.style.padding='10px 12px'; card.style.boxShadow='0 10px 30px rgba(0,0,0,.35)'; card.style.pointerEvents='auto'; card.style.maxWidth='80vw';
      card.textContent = String(msg||''); host.appendChild(card);
      const dur = (opts && opts.duration) || 1800;
      setTimeout(()=>{ try{ host.removeChild(card); }catch{} }, dur);
    };
    // Short alias
    window.toast = window.showToast;
  }catch{}

  // Local Fluent icon replacements (no external Iconify). Map common IDs to emoji.
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
    'fluent:arrow-download-20-regular': '⬇️',
    'fluent:rename-20-regular': '✏️',
    'fluent:cut-20-regular': '✂️',
    'fluent:copy-20-regular': '📄',
    'fluent:clipboard-paste-20-regular': '📋',
    'fluent:delete-20-regular': '🗑️',
    'fluent:more-horizontal-20-regular': '⋯',
    'fluent:image-20-regular': '🖼️',
    'fluent:database-24-regular': '🛢️',
    'fluent:database-20-regular': '🛢️',
    'fluent:database-20-filled': '🛢️',
    'fluent:arrow-trending-24-regular': '📈',
    'fluent:send-20-regular': '📤',
    'fluent:key-reset-20-regular': '🔑',
    'fluent:warning-20-regular': '⚠️',
    'fluent:warning-20-filled': '⚠️',
    'fluent:apps-list-20-regular': '🧩',
    'fluent:apps-list-20-filled': '🧩',
    'fluent:checkmark-circle-20-regular': '✅',
    'fluent:checkmark-circle-20-filled': '✅',
    'fluent:cloud-add-20-regular': '☁️',
    'fluent:cloud-add-20-filled': '☁️',
    'fluent:cloud-upload-20-regular': '☁️⬆️',
    'fluent:paint-brush-20-regular': '🖌️',
    'fluent:paint-brush-20-filled': '🖌️',
    'fluent:lock-closed-20-regular': '🔒',
    'fluent:lock-closed-20-filled': '🔒',
    'fluent:chat-help-20-regular': '💬'
  };
  function replaceIconify(root){
    (root||document).querySelectorAll('span.iconify').forEach(el=>{
      if(el.querySelector('svg')) return; // already rendered
      const id = el.getAttribute('data-icon') || '';
      const ch = ICON_MAP[id] || '🗔';
      el.textContent = ch;
      el.style.fontSize = '1.2em';
      el.style.lineHeight = '1';
      el.style.display = 'inline-flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
    });
  }
  try{
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', ()=> replaceIconify(document));
    } else { replaceIconify(document); }
    const mo = new MutationObserver(muts=>{
      muts.forEach(m=>{
        if(m.type === 'attributes' && m.target && m.target.matches && m.target.matches('span.iconify')){
          replaceIconify(m.target);
        }
        if(m.addedNodes && m.addedNodes.length){
          m.addedNodes.forEach(n=>{ if(n.nodeType===1) replaceIconify(n); });
        }
      });
    });
    mo.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['data-icon']});
  }catch{}
})();
