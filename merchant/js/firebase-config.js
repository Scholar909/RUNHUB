import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC7onB0OptTyu-J6J1PwU6zX799tQIjh4k",
    authDomain: "affiliate-app-dab95.firebaseapp.com",
    projectId: "affiliate-app-dab95",
    storageBucket: "affiliate-app-dab95.firebasestorage.app",
    messagingSenderId: "510180440268",
    appId: "1:510180440268:web:99be47162857f635d8ea69"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// Keep track of the active listener so we can stop it if needed
let securityListener = null;

onAuthStateChanged(auth, (user) => {
    if (user) {
        const userRef = doc(db, "users", user.uid);
        
        // Unsubscribe from any previous listener to prevent "double alerts"
        if (securityListener) securityListener();

        securityListener = onSnapshot(userRef, (snapshot) => {
            // Check if user is on a restricted page (login/signup)
            const isAuthPage = window.location.pathname.includes("sign-login.html") || 
                               window.location.pathname.includes("index.html");
                               
            if (snapshot.metadata.fromCache && !snapshot.exists()) return;

            if (!snapshot.exists()) {
                // ONLY alert if they aren't already on the login page
                if (!isAuthPage) {
                    handleSecurityExit("Account Verify Failed. If this persists, contact admin.");
                }
                return;
            }

            const userData = snapshot.data();
            
            // Explicitly check for "Locked" status
            if (userData.status === "Locked") {
                handleSecurityExit("Your account has been BLOCKED. Please contact support.");
            }
        }, (error) => {
            console.error("Security Monitor Error:", error);
        });
    } else {
        // If user logs out, clean up the listener
        if (securityListener) {
            securityListener();
            securityListener = null;
        }
    }
});

async function handleSecurityExit(message) {
    // 1. Alert first
    alert(message);
    // 2. Clear Auth
    await signOut(auth);
    // 3. Redirect
    window.location.href = "./sign-login.html";
}

export { auth, db };
