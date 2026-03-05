import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const isMonitoringActive = false; 

// --- 1. Photo Modal Logic ---
const createPhotoModal = () => {
    if (document.getElementById('photoModal')) return;
    const modal = document.createElement('div');
    modal.id = "photoModal";
    modal.style = `
        display: none; position: fixed; z-index: 9999; left: 0; top: 0; 
        width: 100%; height: 100%; background: rgba(0,0,0,0.95); 
        align-items: center; justify-content: center; backdrop-filter: blur(8px);
    `;
    modal.innerHTML = `
        <span style="position:absolute; top:30px; right:30px; color:white; font-size:40px; cursor:pointer; font-family:Arial;">&times;</span>
        <img id="modalImg" style="max-width: 90%; max-height: 85%; border-radius: 8px; border: 3px solid white;">
    `;
    document.body.appendChild(modal);
    modal.onclick = () => modal.style.display = "none";
};

const openModal = (src) => {
    const modal = document.getElementById('photoModal');
    document.getElementById('modalImg').src = src;
    modal.style.display = "flex";
};

/**
 * Helper: Formats Firebase Timestamps or Dates for the UI
 */
const formatSubDate = (timestamp) => {
    if (!timestamp) return "N/A";
    // If it's a Firebase Timestamp object
    if (timestamp.seconds) {
        return new Date(timestamp.seconds * 1000).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    }
    // Fallback for string or JS Date
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric'
    });
};

/**
 * Core UI Rendering Function
 */
const renderProfileUI = (data) => {
    // 1. Identity & Profile Header
    document.querySelector('.user-info h2').innerText = data.fullName || "Merchant";
    document.querySelector('.username').innerText = `@${data.username || 'user'}`;
    
    const pPhoto = document.querySelector('.profile-photo');
    if (data.profilePhoto) {
        pPhoto.src = data.profilePhoto;
        pPhoto.style.cursor = "pointer";
        pPhoto.onclick = () => openModal(data.profilePhoto);
    }

    // 2. Stars & Rating
    const ratingScore = data.rating || 0.0; // Default to 0 if no rating exists
    const reviewCount = data.ratingCount || 0; // Pulling the count from your DB
    
    document.querySelector('.rating-val').innerText = `${ratingScore.toFixed(1)} / 5.0 Rating`;
    // Update the bracketed number
    document.getElementById('p-review-count').innerText = `(${reviewCount})`; 
    
    updateStars(ratingScore);


    // 3. Detailed Account Details
    document.getElementById('p-gender').innerText = data.gender || "N/A";
    document.getElementById('p-matric').innerText = data.matricNumber || "N/A";
    document.getElementById('p-dept').innerText = `${data.location || 'Unknown'} (${data.level || '0'}L)`;
    document.getElementById('p-email').innerText = data.email || "N/A";
    document.getElementById('p-phone').innerText = data.phoneNumber || "N/A";

    // 4. Bank Details
    const bank = data.bankDetails || {};
    document.getElementById('p-bank').innerText = `${bank.bankName || 'N/A'} — ${bank.accountNumber || 'N/A'}`;
    document.getElementById('p-acc-name').innerText = `Account Name: ${bank.accountName || 'N/A'}`;

    // 5. Merchant Subscription Status (Admin View Style)
    const sub = data.subscription || {};
    const subType = sub.type || "No Active Plan";
    
    const typeEl = document.getElementById('p-sub-type');
    const statusEl = document.getElementById('p-sub-status');
    const expiryEl = document.getElementById('p-sub-expiry');

    if (typeEl && statusEl && expiryEl) {
        // Set Plan Type & Color
        typeEl.innerText = subType.toUpperCase();
        typeEl.style.color = subType.toLowerCase() === 'trial' ? "#ff9500" : "var(--success)";

        // Set Expiry Date
        expiryEl.innerText = formatSubDate(sub.expiryDate);

        // Determine Expiry Logic
        const now = new Date();
        const expiryDate = sub.expiryDate?.seconds ? new Date(sub.expiryDate.seconds * 1000) : new Date(sub.expiryDate);

        if (sub.expiryDate && expiryDate < now) {
            statusEl.innerText = "EXPIRED";
            statusEl.style.color = "var(--error)";
        } else {
            statusEl.innerText = "CURRENT";
            statusEl.style.color = "var(--success)";
        }
    }

    // 6. System Status Indicators
    const locStatus = document.querySelector('.trust-card:nth-child(2) .stat-row:nth-child(2) span:last-child');
    if (locStatus) {
        locStatus.innerText = !isMonitoringActive ? "ACTIVE" : "GPS MONITORING";
        locStatus.className = "text-success";
    }
};


const updateStars = (rating) => {
    const starContainer = document.querySelector('.stars');
    starContainer.innerHTML = '';
    const fullStars = Math.floor(rating);
    for (let i = 1; i <= 5; i++) {
        const star = document.createElement('i');
        star.className = i <= fullStars ? 'fi-star filled' : 'fi-star';
        starContainer.appendChild(star);
    }
};

// --- 3. Core Logic ---
const loadMerchantData = (uid) => {
    onSnapshot(doc(db, "users", uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.rating < 2) {
                alert("Account Locked.");
                window.handleLogout();
                return;
            }
            renderProfileUI(data);
        }
    });
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        // location.js handles the Gatekeeper rules (GPS/Debt/Sub)
        // This listener just keeps the Profile UI updated in real-time
        onSnapshot(doc(db, "users", user.uid), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // Account Locking Logic (Keep this unique profile check)
                if (data.rating < 2 || data.status === "Locked") {
                    alert("Your account has been restricted by Admin.");
                    window.handleLogout();
                    return;
                }
                
                renderProfileUI(data);
            }
        });
    }
    // No 'else' needed; location.js handles unauthorized users
});

// Init drawer and modal
window.toggleDrawer = () => document.getElementById('navDrawer').classList.toggle('active');
createPhotoModal();

// Add these to your "Actions" section in js/profile.js

// --- 4. Merchant Actions ---

/**
 * Contact Support via WhatsApp
 * Uses the admin's official number
 */
window.contactSupport = () => {
    const adminPhone = "2349168873680"; 
    const message = encodeURIComponent("Hello RUNHUB Admin, I am a merchant and I need assistance with my profile/account.");
    window.location.href = `https://wa.me/${adminPhone}?text=${message}`;
};

/**
 * Handle Logout
 * Clears session and redirects to login
 */
window.handleLogout = async () => {
    if (confirm("Are you sure you want to logout?")) {
        try {
            // If location.js is loaded, it might have a more complex forceLogout
            // We call signOut and redirect here for immediate action
            await signOut(auth);
            window.location.href = "sign-login.html";
        } catch (error) {
            console.error("Logout Error:", error);
            alert("Failed to logout. Please try again.");
        }
    }
};
