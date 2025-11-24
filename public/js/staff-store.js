// staff-store.js
// Centralized helpers for storing and retrieving the active staff across the app.
// Policy: persist canonical values in localStorage and mirror them to sessionStorage
// for immediate navigation. Use sessionStorage next_* keys for single navigation handoff.

var staffStore = (function(){
  // Helper: normalize incoming token/label values to the canonical English token
  function canonicalizeToken(raw){
    try{
      if (!raw && raw !== 0) return null;
      var s = String(raw).trim(); if (!s) return null;
      var lower = s.toLowerCase();
      var map = {
        // Korean -> canonical token
  '송훈재': 'SongHoonjae', '송훈재 부장': 'SongHoonjae', '송훈재부장': 'SongHoonjae',
        '임준호': 'LimJunho', '임준호 차장': 'LimJunho', '임준호차장': 'LimJunho',
        '조영환': 'ChoYounghwan', '조영환 부장': 'ChoYounghwan', '조영환부장': 'ChoYounghwan'
      };
      if (map[s]) return map[s];
      if (map[lower]) return map[lower];
      // If already looks like canonical candidate, normalize casing
  var cands = ['SongHoonjae','LimJunho','ChoYounghwan'];
  for (var i=0;i<cands.length;i++){ if (cands[i].toLowerCase() === lower) return cands[i]; }
  // Unknown/unsupported variants (especially arbitrary lowercase tokens) should not be
  // returned as-is — treat them as missing so caller won't surface them in the UI/URL.
  return null;
    }catch(e){ return String(raw); }
  }
  function safeSet(storage, key, val){ try{ if (!storage) return; if (val === null || val === undefined) storage.removeItem(key); else storage.setItem(key, String(val)); }catch(e){} }
  function safeGet(storage, key){ try{ if (!storage) return null; return storage.getItem(key); }catch(e){ return null; } }

  function setStaff(token, label){
    try{
      safeSet(localStorage, 'cmass:staffToken', token || '');
      safeSet(localStorage, 'cmass:staff', label || '');
      // Mirror to sessionStorage for immediate navigation flows
      safeSet(sessionStorage, 'cmass:staffToken', token || '');
      safeSet(sessionStorage, 'cmass:staff', label || '');
      // Also keep legacy keys for compatibility
      safeSet(localStorage, 'cmass:staffToken', token || '');
      safeSet(localStorage, 'cmass:staff', label || '');
    }catch(e){}
  }

  function setNextForNavigation(opts){
    try{
      if (!opts || typeof opts !== 'object') return;
      safeSet(sessionStorage, 'cmass:next_staff_token', opts.token || '');
      safeSet(sessionStorage, 'cmass:next_staff_label', opts.label || '');
      if (opts.visitDate) safeSet(sessionStorage, 'cmass:next_visitDate', opts.visitDate);
      if (opts.region) safeSet(sessionStorage, 'cmass:next_region', opts.region);
      if (opts.school) safeSet(sessionStorage, 'cmass:next_school', opts.school);
    }catch(e){}
  }

  function clearNextNavigation(){ try{ safeSet(sessionStorage, 'cmass:next_staff_token', null); safeSet(sessionStorage, 'cmass:next_staff_label', null); safeSet(sessionStorage, 'cmass:next_visitDate', null); safeSet(sessionStorage, 'cmass:next_region', null); safeSet(sessionStorage, 'cmass:next_school', null); }catch(e){} }

  function getEffectiveStaff(){
    try{
      // 1. session next keys for navigation handoff (highest priority)
      var tok = safeGet(sessionStorage, 'cmass:next_staff_token') || null;
      var lbl = safeGet(sessionStorage, 'cmass:next_staff_label') || null;
      if (tok || lbl){ var canon = canonicalizeToken(tok || lbl); return { token: canon, label: canon, source: 'session:next' }; }

      // 2. URL query
      try{ var q = new URLSearchParams(window.location.search || ''); var qtok = q.get('staff'); if (qtok){ var canon = canonicalizeToken(qtok); return { token: canon, label: canon, source: 'url' }; } }catch(e){}

      // 3. window globals
      try{ if (window._cmass_staffToken || window._cmass_staffParam){ var canon = canonicalizeToken(window._cmass_staffToken || window._cmass_staffParam); return { token: canon, label: canon, source: 'window' }; } }catch(e){}

      // 4. sessionStorage mirrors
      var sTok = safeGet(sessionStorage, 'cmass:staffToken'); var sLbl = safeGet(sessionStorage, 'cmass:staff');
      if (sTok || sLbl){ var canon = canonicalizeToken(sTok || sLbl); return { token: canon, label: canon, source: 'session' }; }

      // 5. fallback to localStorage persistent
      var lTok = safeGet(localStorage, 'cmass:staffToken') || safeGet(localStorage, 'cmass:staff');
      var lLbl = safeGet(localStorage, 'cmass:staff') || safeGet(localStorage, 'cmass:staffLabel');
      if (lTok || lLbl){ var canon = canonicalizeToken(lTok || lLbl); return { token: canon, label: canon || (lLbl || lTok), source: 'local' }; }

      return { token: null, label: null, source: 'none' };
    }catch(e){ return { token:null,label:null,source:'error' }; }
  }

  return {
    setStaff: setStaff,
    setNextForNavigation: setNextForNavigation,
    clearNextNavigation: clearNextNavigation,
    getEffectiveStaff: getEffectiveStaff
  };
})();
