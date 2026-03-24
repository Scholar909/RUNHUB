// Register service worker
// Register service worker and auto-update
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('Service Worker registered:', reg);

        // Listen for updates to the service worker
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Automatically activate new SW and reload page
              newWorker.postMessage({ type: 'SKIP_WAITING' });

              // Optional: slight delay to ensure skipWaiting finishes
              setTimeout(() => window.location.reload(), 100);
            }
          });
        });

        // If a new SW is waiting from before, activate immediately
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          setTimeout(() => window.location.reload(), 100);
        }

      })
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}

// PWA Install Prompt
// --- NEW IOS DETECTION ---
const isIos = () => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}
// Check if already installed
const isInStandaloneMode = () => ('standalone' in window.navigator) && (window.navigator.standalone);

let deferredPrompt;
const installBtn = document.createElement('button');
installBtn.textContent = 'Install NOVAHUB';
installBtn.className = 'btn btn-filled';
installBtn.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:1000; display:none;';
document.body.appendChild(installBtn);

// Logic for Android / Chrome
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display = 'block';
});

// Logic for iOS
if (isIos() && !isInStandaloneMode()) {
  installBtn.style.display = 'block';
  installBtn.textContent = 'How to Install'; // Change text to be helpful
}

installBtn.addEventListener('click', async () => {
  if (deferredPrompt) {
    // Android behavior
    installBtn.style.display = 'none';
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
  } else if (isIos()) {
    // iOS behavior: Show instructions instead of a prompt
    alert('To install NOVAHUB on your iPhone:\n1. Tap the "Share" icon (square with arrow) at the bottom.\n2. Scroll down and tap "Add to Home Screen".');
  }
});