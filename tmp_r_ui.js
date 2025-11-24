(function(){
  try{
    // Ensure anonymous auth is attempted when this script loads.
    // It's deliberately defensive: if Firebase SDK isn't ready yet we retry.
    function ensureAnon(){
      try{
        if (!window.firebase || !firebase.auth) { 
          // retry after short delay until SDK loads (but only a few times)
          attempts = (typeof attempts === 'number') ? attempts + 1 : 1;
          if (attempts < 50) setTimeout(ensureAnon, 200);
          return;
        }
        if (firebase.auth().currentUser){ console.debug('[report_upload_integration] already signed in', firebase.auth().currentUser && firebase.auth().currentUser.uid); return; }
        firebase.auth().signInAnonymously()
          .then(cred => { console.debug('[report_upload_integration] anonymous sign-in success', cred && cred.user && cred.user.uid); })
          .catch(err => { console.warn('[report_upload_integration] anonymous sign-in failed', err); });
      }catch(e){ console.warn('[report_upload_integration] ensureAnon error', e); }
    }

    // Kick off as soon as possible
    var attempts = 0;
    ensureAnon();
    // Also try on load/pageshow to cover delayed SDK loads
    window.addEventListener('load', ensureAnon);
    window.addEventListener('pageshow', ensureAnon);
  }catch(e){ console.warn('report_upload_integration init failed', e); }
})();
