import { auth, db } from "./firebase-config.js";
import { 
    doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

const isMonitoringActive = true; // Set to true to enforce GPS
const WAL_THRESHOLD = 500;
const ADMIN_FEE = 50;
const TRIAL_DAYS = 14;
const GRACE_HOURS = 24;

let locationWatcher = null;

// Helper to handle dates
const toJSDate = (val) => {
    if (!val) return new Date(0);
    if (typeof val.toDate === 'function') return val.toDate();
    return new Date(val);
};

// NEW: Helper to shut down active sessions during enforcement
async function deactivateActiveSession(uid) {
    try {
        // 1. Turn off public visibility
        await updateDoc(doc(db, "users", uid), { isActive: false });
        
        // 2. Find and turn off the active session in sub-collection
        const q = query(collection(db, "merchants", uid, "sessions"), where("isActive", "==", true));
        const snap = await getDocs(q);
        const batch = [];
        snap.forEach(d => {
            batch.push(updateDoc(d.ref, { 
                isActive: false, 
                lastTurnedOff: Date.now() 
            }));
        });
        await Promise.all(batch);
    } catch (e) {
        console.error("Cleanup failed:", e);
    }
}

async function forceLogout() {
    if (locationWatcher) navigator.geolocation.clearWatch(locationWatcher);
    
    // Deactivate session so customers don't see an offline merchant
    if (auth.currentUser) {
        await deactivateActiveSession(auth.currentUser.uid);
    }
    
    await signOut(auth);
    window.location.href = "./sign-login.html"; 
}


function updateUIStatus(enabled) {
    const dot = document.querySelector('.status-indicator .dot');
    const statusText = document.querySelector('.status-indicator');
    if (!dot || !statusText) return;

    if (enabled) {
        dot.style.background = "#34c759";
        statusText.innerHTML = `<span class="dot animate-flicker" style="background:#34c759"></span> ONLINE`;
    } else {
        dot.style.background = "#ff3b30";
        statusText.innerHTML = `<span class="dot" style="background:#ff3b30"></span> OFFLINE (GPS OFF)`;
    }
}

function startLocationMonitoring() {
    if (!isMonitoringActive) {
        updateUIStatus(true); 
        return;
    }

    if ("geolocation" in navigator) {
        let lastLocationTimestamp = Date.now();
        const GPS_GRACE_MS = 2 * 60 * 1000; // 2 minutes grace

        locationWatcher = navigator.geolocation.watchPosition(
            async (pos) => {
                lastLocationTimestamp = Date.now();
                updateUIStatus(true);

                // --- ADD THIS: Update Firestore with fresh location ---
                if (auth.currentUser) {
                    const uid = auth.currentUser.uid;
                    console.log("GPS update received:", pos.coords.latitude, pos.coords.longitude);
                    await updateDoc(doc(db, "users", uid), {
                        "location.lat": pos.coords.latitude,
                        "location.lng": pos.coords.longitude,
                        "locationUpdatedAt": serverTimestamp()
                    });
                }
            },
            () => {
                const now = Date.now();
                if (now - lastLocationTimestamp > GPS_GRACE_MS) {
                    alert("Please turn on your location to remain visible.");
                    forceLogout(); // only after 2 minutes of being off
                } else {
                    updateUIStatus(false); // just show offline temporarily
                }
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );
    } else {
        handleLocationFailure();
    }
}

function handleLocationFailure() {
    if (!isMonitoringActive) return;
    alert("CRITICAL: Location services must remain ON.");
    forceLogout();
}

async function enforceRules(uid) {
    if (window.location.pathname.includes("plans.html")) return;

    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return forceLogout();

    const userData = userSnap.data();
    
    const role = (userData.role || "").toLowerCase();
    
    if (role === "admin" || role === "customer") return;
    
    const now = new Date();

    // 2. Subscription Check
    const createdAt = toJSDate(userData.createdAt);
    if (!userData.subscription) {
        const trialEnd = new Date(createdAt);
        trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
        if (now > trialEnd) { 
            await deactivateActiveSession(uid); // SHUTDOWN SESSIONS
            window.location.href = "./plans.html"; 
            return; 
        }
    } else {
        const expiry = toJSDate(userData.subscription.expiryDate);
        if (now > expiry) { 
            await deactivateActiveSession(uid); // SHUTDOWN SESSIONS
            window.location.href = "./plans.html"; 
            return; 
        }
    }

    // 3. Wallet Debt Check
    const totalPaid = userData.totalPaid || 0;
    const feeAccrued = userData.feeAccrued || 0;
    
    const balance = totalPaid - feeAccrued;

    if (balance <= -WAL_THRESHOLD) {
        if (!userData.walletDueSince) {
            await updateDoc(userRef, { walletDueSince: serverTimestamp() });
        } else {
            const dueSince = toJSDate(userData.walletDueSince);
            const hoursPassed = (now - dueSince) / (1000 * 60 * 60);
    
            if (hoursPassed >= GRACE_HOURS) {
                await deactivateActiveSession(uid);
    
                const debtAmount = Math.abs(balance);
    
                window.location.href = `./plans.html?action=pay&amount=${debtAmount}`;
            }
        }
    } else if (userData.walletDueSince) {
        await updateDoc(userRef, { walletDueSince: null });
    }
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        startLocationMonitoring();

        await enforceRules(user.uid);

        // Run every 3 minutes
        setInterval(() => {
            enforceRules(user.uid);
        }, 3 * 60 * 1000);
    } 
    else {
        const protectedPages = ["./dashboard.html", "./profile.html", "./orders.html", "./history.html", "./merch-ser.html", "./session.html"];
        if (protectedPages.some(p => window.location.pathname.includes(p))) {
            window.location.href = "./sign-login.html";
        }
    }
});
