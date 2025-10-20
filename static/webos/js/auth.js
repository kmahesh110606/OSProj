// Auth UX helpers: password eye toggles and button ripple
(function(){
  function injectStyle(){
    if(document.getElementById('pw-eye-style')) return;
    const css = `
    .pw-wrap{ position: relative; }
    .pw-wrap .input{ padding-right: 42px; }
    .pw-eye{ position:absolute; right:8px; top:50%; transform:translateY(-50%);
      width:30px; height:30px; border-radius:8px; border:1px solid var(--border, rgba(148,163,184,.25));
      display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
      color: #cbd5e1; background: rgba(2,6,23,0.15); transition: box-shadow .16s ease, border-color .16s ease, background .16s ease;
    }
    .pw-eye:hover{ box-shadow: 0 0 0 3px rgba(96,165,250,0.18); border-color: rgba(96,165,250,.55); }
    .pw-eye svg{ width:18px; height:18px; }
    .btn{ position: relative; overflow: hidden; }
    .btn .ripple{ position:absolute; border-radius:50%; pointer-events:none; transform:translate(-50%,-50%); background:rgba(255,255,255,0.25); animation:ripple .6s ease-out forwards; }
    @keyframes ripple{ from{ width:0; height:0; opacity:.6 } to{ width:260px; height:260px; opacity:0 } }
    `;
    const st = document.createElement('style'); st.id = 'pw-eye-style'; st.textContent = css; document.head.appendChild(st);
  }

  function eyeIconSpan(){ return '<span class="iconify" data-icon="fluent:eye-20-regular"></span>'; }

  function mountPasswordEyes(root){
    injectStyle();
    (root||document).querySelectorAll('input[type="password"]').forEach(inp=>{
      if(inp.dataset.pwEye==='1') return; inp.dataset.pwEye='1';
      const wrap = document.createElement('div'); wrap.className='pw-wrap';
      inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
      const btn = document.createElement('button'); btn.type='button'; btn.className='pw-eye'; btn.setAttribute('aria-label','Show password'); btn.innerHTML = eyeIconSpan();
      btn.addEventListener('click', ()=>{
        const open = inp.type !== 'password';
        if(open){ inp.type='password'; btn.setAttribute('aria-label','Show password'); }
        else { inp.type='text'; btn.setAttribute('aria-label','Hide password'); }
        inp.focus();
      });
      wrap.appendChild(btn);
    });
  }

  function mountRipples(root){
    (root||document).querySelectorAll('.btn').forEach(btn=>{
      if(btn.dataset.ripple==='1') return; btn.dataset.ripple='1';
      btn.addEventListener('click', (e)=>{
        const rect = btn.getBoundingClientRect();
        const el = document.createElement('span'); el.className='ripple';
        const x = e.clientX - rect.left; const y = e.clientY - rect.top;
        el.style.left = x + 'px'; el.style.top = y + 'px';
        btn.appendChild(el); setTimeout(()=> el.remove(), 650);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', ()=>{ mountPasswordEyes(); mountRipples(); });
  // Expose in case apps load content dynamically
  window.AuthUX = { mountPasswordEyes, mountRipples };
})();
