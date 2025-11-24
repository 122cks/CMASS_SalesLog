
    // Early diagnostics: capture parsing/runtime errors (includes resource/script errors)
    // so we can surface filenames/lines for live debugging (logged to console).
    try{
      window.__cmass_errors = window.__cmass_errors || [];
      window.addEventListener('error', function(ev){
        try{
          const info = {
            message: ev.message || null,
            filename: ev.filename || (ev.target && ev.target.src) || null,
            lineno: ev.lineno || 0,
            colno: ev.colno || 0,
            stack: ev.error && ev.error.stack ? ev.error.stack : null,
            targetTag: ev.target && ev.target.tagName ? ev.target.tagName : null
          };
          window.__cmass_errors.push(info);
          console.error('__cmass_error__', info);
        }catch(e){}
      }, true);
      window.addEventListener('unhandledrejection', function(ev){
        try{
          const info = { reason: ev.reason && (ev.reason.stack || ev.reason.message || String(ev.reason)), type: 'unhandledrejection' };
          window.__cmass_errors.push(info);
          console.error('__cmass_unhandledrej__', info);
        }catch(e){}
      });
    }catch(e){}
  