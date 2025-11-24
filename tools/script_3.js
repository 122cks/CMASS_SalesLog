
    // Canonicalize legacy lowercase user tokens to canonical tokens so address bar shows consistent URLs.
    (function canonUserParam(){
      try{
        const params = new URLSearchParams(window.location.search);
        const user = params.get('user');
        if (!user) return;
        const canonMap = {
          'songhunje': 'Songhoonjae',
          'songhoonjae': 'Songhoonjae',
          'imjunho': 'LimJunho',
          'limjunho': 'LimJunho',
          'joyounghwan': 'ChoYounghwan',
          'choyounghwan': 'ChoYounghwan'
        };
        const lower = user.toLowerCase();
        const mapped = canonMap[lower];
        if (mapped && mapped !== user) {
          params.set('user', mapped);
          const newUrl = window.location.pathname + '?' + params.toString();
          history.replaceState(null, '', newUrl);
        }
      } catch(e){ console.warn('canonUserParam error', e); }
    })();
  