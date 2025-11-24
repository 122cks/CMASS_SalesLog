(function(){
  // Silence noisy console output: log, debug, info, warn.
  // Keep console.error available for real errors.
  try{
    if (!window || !console) return;
    const methods = ['log','debug','info','warn'];
    const noop = function(){};
    methods.forEach(m => {
      try{ console[m] = noop; }catch(e){}
    });
    // Expose a restore helper if needed
    try{ Object.defineProperty(window, '_cmass_restoreConsole', { value: function(){ methods.forEach(m=>{ try{ delete console[m]; }catch(e){} }); }, writable:false, configurable:true }); }catch(e){}
  }catch(e){}
})();
