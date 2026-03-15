import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyC7onB0OptTyu-J6J1PwU6zX799tQIjh4k",
    authDomain: "affiliate-app-dab95.firebaseapp.com",
    projectId: "affiliate-app-dab95",
    storageBucket: "affiliate-app-dab95.firebasestorage.app",
    messagingSenderId: "510180440268",
    appId: "1:510180440268:web:99be47162857f635d8ea69"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const customerCountEl = document.getElementById("customerCount");
const merchantCountEl = document.getElementById("merchantCount");

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered:', reg))
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}

// PWA Install Prompt
let deferredPrompt;
const installBtn = document.createElement('button');
installBtn.textContent = 'Install NOVAHUB';
installBtn.className = 'btn btn-filled';
installBtn.style.position = 'fixed';
installBtn.style.bottom = '20px';
installBtn.style.right = '20px';
installBtn.style.zIndex = '1000';
installBtn.style.display = 'none';
document.body.appendChild(installBtn);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display = 'block';
});

installBtn.addEventListener('click', async () => {
  installBtn.style.display = 'none';
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log('User response to install prompt:', outcome);
  deferredPrompt = null;
});

const merchantBtn = document.getElementById("merchantAccess");

if (merchantBtn) {
  merchantBtn.addEventListener("click", (e) => {
    e.preventDefault(); // stop immediate navigation

    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your device.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log("Latitude:", position.coords.latitude);
        console.log("Longitude:", position.coords.longitude);

        // permission granted → go to merchant login
        window.location.href = "./merchant/sign-login.html";
      },
      (error) => {
        alert("Location permission is required for merchant access.");
        console.error(error);
      }
    );
  });
}

function loadPlatformStats() {
    const usersRef = collection(db, "users");

    onSnapshot(usersRef, (snapshot) => {
        let customers = 0;
        let merchants = 0;

        snapshot.forEach(doc => {
            const role = (doc.data().role || "").toLowerCase();
            if (role === "customer") customers++;
            if (role === "merchant") merchants++;
        });

        if(customerCountEl) customerCountEl.textContent = customers.toLocaleString();
        if(merchantCountEl) merchantCountEl.textContent = merchants.toLocaleString();
    }, (error) => {
        console.error("Error fetching platform stats:", error);
    });
}

loadPlatformStats();

// Optional: show today's date
const dateEl = document.getElementById("todayDate");
if(dateEl){
    const today = new Date();
    dateEl.textContent = today.toDateString();
}

export{auth, db}