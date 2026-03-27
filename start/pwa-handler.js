// Register service worker
// Register service worker and auto-update
if ('serviceWorker' in navigator) {
  let refreshing = false;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('Service Worker registered:', reg);
        
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });

        // Listen for updates to the service worker
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Automatically activate new SW and reload page
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        // If a new SW is waiting from before, activate immediately
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

      })
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}

/* -----------------------------
PWA INSTALL PROMPT WITH DISMISS
----------------------------- */
const isIos = () => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}
const isInStandaloneMode = () => ('standalone' in window.navigator) || (window.navigator.standalone);

// 1. Create the Container
const installContainer = document.createElement('div');
installContainer.id = 'pwa-install-banner';
installContainer.style.cssText = `
  position: fixed; bottom: 20px; right: 20px; z-index: 10000;
  display: none; align-items: center; gap: 10px;
  background: #ffffff; padding: 12px 16px; border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.15); border: 1px solid #eee;
  transition: transform 0.3s ease-out, opacity 0.3s ease;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
`;

// 2. Create the Button
const installBtn = document.createElement('button');
installBtn.className = 'btn btn-filled';
installBtn.style.cssText = 'margin: 0; padding: 8px 16px; font-size: 14px; cursor: pointer; border-radius: 8px; border: none; background: #007aff; color: white; font-weight: 600;';
installBtn.textContent = isIos() ? 'How to Install' : 'Install NOVAHUB';

// 3. Create the Close (X) Button
const closeBtn = document.createElement('button');
closeBtn.innerHTML = '&times;';
closeBtn.style.cssText = `
  background: #f1f1f1; border: none; border-radius: 50%;
  width: 28px; height: 28px; cursor: pointer; font-size: 20px;
  display: flex; align-items: center; justify-content: center; color: #666;
  line-height: 1;
`;

installContainer.appendChild(installBtn);
installContainer.appendChild(closeBtn);
document.body.appendChild(installContainer);

let deferredPrompt;

// Logic to show banner
const showBanner = () => {
  const isDismissed = localStorage.getItem('pwa-dismissed');
  if (!isDismissed && !isInStandaloneMode()) {
    installContainer.style.display = 'flex';
    // Small timeout to trigger the entrance transition if you add one
  }
};

// Dismiss Logic (Slide away and save preference)
const dismissBanner = () => {
  installContainer.style.transform = 'translateX(120%)';
  installContainer.style.opacity = '0';
  localStorage.setItem('pwa-dismissed', 'true'); 
  setTimeout(() => { installContainer.style.display = 'none'; }, 300);
};

closeBtn.onclick = (e) => {
  e.stopPropagation();
  dismissBanner();
};

// Android Listener
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showBanner();
});

// iOS Immediate Check
if (isIos() && !isInStandaloneMode()) {
  showBanner();
}

// Click Handling
installBtn.addEventListener('click', async () => {
  if (deferredPrompt) {
    // Android behavior: Prompt then hide
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        dismissBanner();
    }
    deferredPrompt = null;
  } else if (isIos()) {
    // iOS behavior: Show instructions
    alert('TO INSTALL ON IPHONE:\n\n1. Tap the "Share" icon (the square with an arrow) at the bottom of your screen.\n2. Scroll down the list and tap "Add to Home Screen".\n3. Tap "Add" at the top right.');
    // Note: We don't call dismissBanner() here so they can re-read if they miss the icon
  }
});
  
