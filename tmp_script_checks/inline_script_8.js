
          // Lightweight, always-available wrappers used by inline onclick attributes.
          function front_goInput(){
            try{
              console.log('front_goInput called');
              // Preserve existing query string (user token / staff selection)
              const qs = window.location.search || '';
              const origin = (location && location.origin) ? location.origin : (location.protocol + '//' + location.host);
              const target = origin + '/input' + qs;
              try{ console.log('front_goInput -> navigating to', target); }catch(e){}

              // Try multiple navigation strategies for webviews and browsers
              try{ window.location.assign(target); }catch(e){}
              try{ window.location.href = target; }catch(e){}
              try{
                let a = document.getElementById('__goInputAnchor');
                if (!a){ a = document.createElement('a'); a.id='__goInputAnchor'; a.style.display='none'; document.body.appendChild(a); }
                a.href = target; a.target = '_self'; a.click();
              }catch(e){}
              try{ window.open(target, '_self'); }catch(e){}

              // If navigation is swallowed by a webview, show a visible fallback link
              try{
                setTimeout(()=>{
                  const msgId = '__goInputFallbackMsg';
                  if (!document.getElementById(msgId)){
                    const div = document.createElement('div'); div.id = msgId; div.style.marginTop='8px'; div.style.textAlign='center';
                    div.innerHTML = '자동 이동이 되지 않았습니다. <a href="'+ target +'" onclick="return true;">여기</a>를 누르면 이동합니다.';
                    const hero = document.querySelector('.hero') || document.body;
                    hero.parentNode.insertBefore(div, hero.nextSibling);
                  }
                }, 300);
              }catch(e){}
            }catch(e){ console.warn('front_goInput failed', e); }
          }
          function front_forceRefresh(){ try{ console.log('front_forceRefresh called'); if (typeof forceServiceWorkerUpdate === 'function'){ forceServiceWorkerUpdate(); } else { alert('새로고침 기능을 사용할 수 없습니다.'); } }catch(e){ console.warn(e); } }
          function front_clearLocal(){ try{ console.log('front_clearLocal called'); if (typeof clearCmassLocalDataAndGo === 'function'){ clearCmassLocalDataAndGo(); } else { alert('임시본 삭제 기능을 사용할 수 없습니다.'); } }catch(e){ console.warn(e); } }

          // Robust implementation to force service-worker update and reload page
          async function forceServiceWorkerUpdate(){
            try{
              console.log('forceServiceWorkerUpdate: unregistering service workers and clearing caches');
              if ('serviceWorker' in navigator){
                try{ const regs = await navigator.serviceWorker.getRegistrations().catch(()=>[]); await Promise.all((regs||[]).map(r=>r.unregister().catch(()=>{}))); }catch(e){ console.warn('sw unregister failed', e); }
              }
              if (window.caches && caches.keys){
                try{ const keys = await caches.keys().catch(()=>[]); await Promise.all((keys||[]).map(k=>caches.delete(k).catch(()=>{}))); }catch(e){ console.warn('cache clear failed', e); }
              }
              try{ localStorage.setItem('_cmass_sw_cleared','1'); }catch(e){}
              try{ const u = new URL(window.location.href); u.searchParams.set('sw_cleared','1'); window.location.replace(u.toString()); return; }catch(e){}
              try{ window.location.reload(true); }catch(e){}
            }catch(e){ console.warn('forceServiceWorkerUpdate failed', e); alert('새로고침 시도 중 오류가 발생했습니다. 콘솔을 확인하세요.'); }
          }

          // Clear local CMASS-related localStorage/sessionStorage keys and reload
          function clearCmassLocalDataAndGo(){
            try{
              console.log('clearCmassLocalDataAndGo: clearing localStorage keys (cmass, _cmass, draft)');
              try{
                const keys = Object.keys(localStorage || {});
                keys.forEach(k=>{ try{ if (/^(cmass|_cmass)|draft/i.test(k) || k.indexOf('geocode')!==-1){ localStorage.removeItem(k); } }catch(e){} });
              }catch(e){ console.warn('localStorage clear step failed', e); }
              try{
                const sKeys = Object.keys(sessionStorage || {});
                sKeys.forEach(k=>{ try{ if (/^(cmass|_cmass)|draft/i.test(k) || k.indexOf('geocode')!==-1){ sessionStorage.removeItem(k); } }catch(e){} });
              }catch(e){ console.warn('sessionStorage clear step failed', e); }
              // Also attempt to clear caches and service workers to be safe
              try{ if (window.caches && caches.keys) { caches.keys().then(keys=> Promise.all(keys.map(k=>caches.delete(k).catch(()=>{})))).catch(()=>{}); } }catch(e){}
              try{ if ('serviceWorker' in navigator){ navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r=>r.unregister().catch(()=>{}))).catch(()=>{}); } }catch(e){}
              // reload to apply cleared state
              try{ const u = new URL(window.location.href); u.searchParams.set('cleared_local','1'); window.location.replace(u.toString()); return; }catch(e){}
              try{ window.location.reload(true); }catch(e){}
            }catch(e){ console.warn('clearCmassLocalDataAndGo failed', e); alert('임시본 삭제 중 오류가 발생했습니다. 콘솔을 확인하세요.'); }
          }

          // Ensure buttons are interactable and add lightweight diagnostics in case clicks are swallowed
          (function ensureButtonsClickable(){
            try{
              const sel = '.big-btn, .alt-btn, button';
              const btns = Array.from(document.querySelectorAll(sel));
              btns.forEach(b=>{ try{ b.style.pointerEvents = 'auto'; b.style.touchAction = 'auto'; if (!b.hasAttribute('tabindex')) b.setAttribute('tabindex','0'); }catch(e){} });
              document.addEventListener('click', function(ev){ try{ const t = ev.target && (ev.target.id || ev.target.className || ev.target.tagName) || 'unknown'; console.debug('document click:', t); }catch(e){} }, true);
            }catch(e){ console.warn('ensureButtonsClickable failed', e); }
          })();
        