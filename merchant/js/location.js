import { auth, db } from "./firebase-config.js";
import { 
    doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

const isMonitoringActive = true; // Set to true to enforce GPS
const WAL_THRESHOLD = 300;
const ADMIN_FEE = 25;
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
    
    // RESET the tracker so the next login starts fresh
    lastSavedLoc = null; 
    
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

// Calculate distance in meters between two points (Haversine formula)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // returns distance in meters
}

let lastSavedLoc = null; // Track last coordinates written to DB
const MOVE_THRESHOLD_METERS = 10; // Only update if moved 10m

function startLocationMonitoring() {
    if (!isMonitoringActive) {
        updateUIStatus(true); 
        return;
    }

    if ("geolocation" in navigator) {
        let lastLocationTimestamp = Date.now();
        const GPS_GRACE_MS = 2 * 60 * 1000;
        let gpsAlertShown = false;
      
        locationWatcher = navigator.geolocation.watchPosition(
            (pos) => {
                const now = Date.now();
                const { latitude: lat, longitude: lng } = pos.coords;
                
                lastLocationTimestamp = now;
                gpsAlertShown = false;
                updateUIStatus(true);

                // --- THROTTLE LOGIC START ---
                let distanceMoved = 0;
                if (lastSavedLoc) {
                    distanceMoved = getDistance(lastSavedLoc.lat, lastSavedLoc.lng, lat, lng);
                }

                // Only update DB if:
                // 1. We have no previous record OR
                // 2. Merchant moved more than 10 meters OR
                // 3. It's been more than 5 minutes since last update (heartbeat)
                    const THREE_MINS = 3 * 60 * 1000;
                    const timeSinceLastUpdate = lastSavedLoc ? (now - lastSavedLoc.time) : Infinity;

                    if (!lastSavedLoc || (timeSinceLastUpdate >= THREE_MINS && distanceMoved >= MOVE_THRESHOLD_METERS)) {
                    
                    lastSavedLoc = { lat, lng, time: now }; // Update local cache

                    updateDoc(doc(db, "users", auth.currentUser.uid), { 
                        location: { lat, lng },
                        locationUpdatedAt: serverTimestamp(),
                        lastSeen: serverTimestamp() 
                    }).catch(err => console.error("Firestore update failed:", err));
                    
                    console.log(`Location saved after ${Math.round(timeSinceLastUpdate / 1000)}s, moved ${Math.round(distanceMoved)}m`);
                }
                // --- THROTTLE LOGIC END ---
            },
            () => {
                const now = Date.now();
                if (!gpsAlertShown && now - lastLocationTimestamp > GPS_GRACE_MS) {
                    gpsAlertShown = true;
                    alert("Please turn on your location to remain visible.");
                    forceLogout();
                } else {
                    updateUIStatus(false);
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

    // 3. Wallet Debt Check
    // 3. Wallet Debt Check
    const totalPaid = userData.totalPaid || 0;
    const feeAccrued = userData.feeAccrued || 0;
    
    const balance = totalPaid - feeAccrued;
    
    if (balance <= -WAL_THRESHOLD) {
        // Ensure walletDueSince is set
        if (!userData.walletDueSince) {
            await updateDoc(userRef, { walletDueSince: serverTimestamp() });
        }
    
        // Immediately deactivate sessions
        await deactivateActiveSession(uid);
    
        // Redirect to plans page with debt amount
        const debtAmount = Math.abs(balance);
        window.location.href = `./plans.html?action=pay&amount=${debtAmount}`;
    } else if (userData.walletDueSince) {
        await updateDoc(userRef, { walletDueSince: null });
    }
}

let enforcementListener = null;

onAuthStateChanged(auth, user => {
    if (!user) {
        const protectedPages = ["./dashboard.html","./profile.html","./orders.html","./history.html","./merch-ser.html","./session.html"];
        if (protectedPages.some(p => window.location.pathname.includes(p))) {
            window.location.href = "./sign-login.html";
        }
        return;
    }
    
    startLocationMonitoring();

    if (!enforcementListener) {
        const userRef = doc(db, "users", user.uid);
        enforcementListener = onSnapshot(userRef, async () => {
            await enforceRules(user.uid);
        });
    }
});