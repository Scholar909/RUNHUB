import { auth, db } from "./firebase-config.js";
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc, updateDoc, query, collection, where, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// ==========================================
// MASTER LOCATION TOGGLE (Synced with Global)
// ==========================================
const isMonitoringActive = true; 

const loginForm = document.getElementById('merchant-login');
const authBtn = document.getElementById('auth-btn');
const gpsText = document.getElementById('gps-text');
const gpsDot = document.getElementById('gps-dot');

/**
 * FEATURE: GPS Enforcement
 * Blocks login interaction if location is not detected
 */
function checkEnforcementStatus(hasLocation = false) {
    if (!isMonitoringActive || hasLocation) {
        authBtn.disabled = false;
        authBtn.classList.remove('disabled');
        if (gpsText) gpsText.innerText = "LOCATION ACTIVE";
        if (gpsDot) gpsDot.style.background = "#34c759";
    } else {
        authBtn.disabled = true;
        authBtn.classList.add('disabled');
        if (gpsText) gpsText.innerText = "LOCATION REQUIRED";
        if (gpsDot) gpsDot.style.background = "#ff3b30";
    }
}

// Start in disabled state if monitoring is on
checkEnforcementStatus(false);

// Helper to kill active sessions on lockout
async function deactivateActiveSession(uid) {
    try {
        await updateDoc(doc(db, "users", uid), { isActive: false });
        const q = query(collection(db, "merchants", uid, "sessions"), where("isActive", "==", true));
        const snap = await getDocs(q);
        const batch = [];
        snap.forEach(d => batch.push(updateDoc(d.ref, { isActive: false, lastTurnedOff: Date.now() })));
        await Promise.all(batch);
    } catch (e) { console.error("Lockout cleanup failed:", e); }
}

// ==========================================
// LOGIN LOGIC
// ==========================================
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Get geolocation first
    navigator.geolocation.getCurrentPosition(async (pos) => {
        if (!isInsideCampus({ lat: pos.coords.latitude, lng: pos.coords.longitude })) {
            alert("You are outside campus. Login blocked.");
            return;
        }

        // Proceed with login only if inside campus
        const email = loginForm.querySelector('input[type="text"]').value.trim().toLowerCase();
        const password = loginForm.querySelector('input[type="password"]').value;

        authBtn.innerText = "Verifying Security...";
        authBtn.disabled = true;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const userDoc = await getDoc(doc(db, "users", user.uid));
            
            if (!userDoc.exists()) {
                await signOut(auth);
                throw new Error("No record found. Please contact Admin.");
            }

            const userData = userDoc.data();

            // 1. ACCOUNT STATUS CHECK
            if (userData.status === "Locked") {
                await deactivateActiveSession(user.uid);
                await signOut(auth);
                throw new Error("ACCESS DENIED: Your account is BLOCKED. Pay debt or contact Admin.");
            }

            // 2. RATING CHECK
            if (userData.rating <= 1) {
                await deactivateActiveSession(user.uid);
                await signOut(auth);
                throw new Error("Account Deleted: Rating fell to 1 star.");
            }

            // 3. WALLET DEBT CHECK
            const balance = (userData.totalPaid || 0) - (userData.feeAccrued || 0);
            if (balance <= -WALLET_THRESHOLD) {
                await deactivateActiveSession(user.uid);
                const debtAmount = Math.abs(balance);
                window.location.href = `./plans.html?action=pay&amount=${debtAmount}`;
                return;
            }

            // Success
            authBtn.innerText = "Authorized. Redirecting...";
            setTimeout(() => { window.location.href = "dashboard.html"; }, 1200);

        } catch (error) {
            alert(error.message);
            authBtn.innerText = "Authorize & Go Online";
            authBtn.disabled = false;
        }

    }, () => {
        alert("Unable to detect location. Please enable GPS.");
    }, { enableHighAccuracy: true });
});

// ==========================================
// CONTINUOUS MONITORING
// ==========================================
if (isMonitoringActive && "geolocation" in navigator) {
    navigator.geolocation.watchPosition(
        (position) => {
            checkEnforcementStatus(true);
            // Sync current coordinates to Firestore for Admin radar
            if (auth.currentUser) {
                updateDoc(doc(db, "users", auth.currentUser.uid), {
                    location: {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    }
                });
            }
        },
        () => {
            checkEnforcementStatus(false);
            if (auth.currentUser) {
                deactivateActiveSession(auth.currentUser.uid).then(() => {
                    signOut(auth);
                    window.location.reload();
                });
            }
        },
        { enableHighAccuracy: true }
    );
}

// Modal Toggle Logic
window.openConsentModal = function() {
    document.getElementById('consent-modal').style.display = 'flex';
};

window.closeConsentModal = function() {
    document.getElementById('consent-modal').style.display = 'none';
};

// Consent Checkbox Logic
const consentBox = document.getElementById('consent-checkbox');
const proceedBtn = document.getElementById('proceed-btn');

consentBox.addEventListener('change', function() {
    if (this.checked) {
        proceedBtn.disabled = false;
        proceedBtn.classList.remove('disabled');
    } else {
        proceedBtn.disabled = true;
        proceedBtn.classList.add('disabled');
    }
});

window.redirectToSignUp = function() {
    // Directs user to the verification form page
    window.location.href = "./sign-up.html";
};

window.switchTab = function(tab) {
    if(tab === 'login') {
        // Ensure UI stays on login or reloads to clear states
        window.location.reload();
    }
};

const CAMPUS_BOUNDARY = [
    { lat: 7.9821, lng: 5.0365 },
    { lat: 7.9850, lng: 5.0365 },
    { lat: 7.9850, lng: 5.0400 },
    { lat: 7.9821, lng: 5.0400 }
];

function isInsideCampus({ lat, lng }) {
    // Simple rectangular check
    const lats = CAMPUS_BOUNDARY.map(p => p.lat);
    const lngs = CAMPUS_BOUNDARY.map(p => p.lng);
    return lat >= Math.min(...lats) && lat <= Math.max(...lats)
        && lng >= Math.min(...lngs) && lng <= Math.max(...lngs);
}

async function checkCampusAndToggleButtons() {
    if (!("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(pos => {
        const { latitude, longitude } = pos.coords;
        const inside = isInsideCampus({ lat: latitude, lng: longitude });

        if (!inside) {
            // Disable login & proceed buttons
            if(authBtn) authBtn.disabled = true;
            if(proceedBtn) proceedBtn.disabled = true;
            alert("You must be on Redeemer's University campus to login or sign up.");
        } else {
            if(authBtn) authBtn.disabled = false;
            if(proceedBtn) proceedBtn.disabled = false;
        }
    }, () => {
        alert("Unable to detect location. Please enable GPS.");
        if(authBtn) authBtn.disabled = true;
        if(proceedBtn) proceedBtn.disabled = true;
    }, { enableHighAccuracy: true });
}

// Run on page load and optionally every 30s
checkCampusAndToggleButtons();
setInterval(checkCampusAndToggleButtons, 30000);


document.getElementById('year').textContent = new Date().getFullYear();