
    // One-time automatic service-worker & cache cleanup to ensure clients load the
    // newest JS/CSS. This runs only once per-browser (flagged in localStorage)
    // and reloads the page with `sw_cleared=1` to avoid loops.
    (function(){
      try{
        const params = new URLSearchParams(window.location.search);
        if (params.get('sw_cleared') === '1') { try{ localStorage.setItem('_cmass_sw_cleared','1'); }catch(e){} return; }
        if (localStorage.getItem('_cmass_sw_cleared') === '1') return;
        (async function(){
          try{
            if ('serviceWorker' in navigator){
              try{ const regs = await navigator.serviceWorker.getRegistrations().catch(()=>[]); await Promise.all((regs||[]).map(r=>r.unregister().catch(()=>{}))); }catch(e){}
            }
            if (window.caches && caches.keys){
              try{ const keys = await caches.keys().catch(()=>[]); await Promise.all((keys||[]).map(k=>caches.delete(k).catch(()=>{}))); }catch(e){}
            }
          }catch(e){ console.warn('sw cleanup inner failed', e); }
          try{ localStorage.setItem('_cmass_sw_cleared','1'); }catch(e){}
          try{
            const u = new URL(window.location.href);
            u.searchParams.set('sw_cleared','1');
            window.location.replace(u.toString());
          }catch(e){ try{ window.location.reload(true); }catch(_){} }
        })();
      }catch(e){ console.warn('sw cleanup failed', e); }
    })();
  