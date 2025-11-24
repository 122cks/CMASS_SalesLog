
    // Register service worker for offline support and PWA install
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').then(() => console.log('SW registered')).catch(e=>console.warn('SW reg failed',e));
    }
  