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

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
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
            // 1. Check if the document truly doesn't exist on the server
            // We check !snapshot.exists() AND make sure it's not just a local "guess"
            if (!snapshot.exists()) {
                // Only trigger if the state is "synchronized" with the server
                if (!snapshot.metadata.hasPendingWrites && !snapshot.metadata.fromCache) {
                    handleSecurityExit("Your account no longer exists. Please contact admin.");
                    return;
                }
                return; // Ignore temporary "null" states during initial sync
            }
        
            const userData = snapshot.data();
            
            // 2. Explicit status check
            if (userData && userData.status === "Locked") {
                handleSecurityExit("Your account has been BLOCKED. Please contact support.");
            }
        }, (error) => {
            // Ignore permission-denied errors often caused by the document being deleted
            if (error.code === 'permission-denied') {
                handleSecurityExit("Access denied. Your account may have been removed.");
            }
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
    window.location.href = "sign-login.html";
}

export { auth, db };
