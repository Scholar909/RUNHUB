import { auth, db } from './firebase-config.js';
import { 
    doc, 
    getDoc, 
    updateDoc,
    collection,
    query,
    where,
    getDocs 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

async function getClosestLocationName(merchantLatLng) {
    if (!merchantLatLng || !merchantLatLng.lat || !merchantLatLng.lng) return "N/A";

    const staticSnap = await getDocs(collection(db, "staticLocations"));
    let closest = null;
    let minDist = Infinity;

    staticSnap.forEach(doc => {
        const loc = doc.data();
        const dist = Math.hypot(merchantLatLng.lat - loc.lat, merchantLatLng.lng - loc.lng); // rough distance
        if (dist < minDist) {
            minDist = dist;
            closest = loc.name;
        }
    });

    return closest || "N/A";
}

// --- CONFIG ---
const ADMIN_FEE_PER_ORDER = 50;

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "./admin-login.html";
        return;
    }

    if (!userId) {
        window.location.href = "./dashboard.html";
        return;
    }

    fetchUserDetails();
});

// --- SELECTORS ---
const profileImg = document.querySelector('.profile-img');
const avatarWrapper = document.querySelector('.profile-avatar-wrapper');
const roleBadge = document.querySelector('.profile-avatar-wrapper .badge');
const displayName = document.querySelector('.user-display-name');
const handle = document.querySelector('.user-handle');
const detailsGrid = document.querySelector('.details-grid');
const suspendBtn = document.querySelector('.btn-danger');

const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id');

/**
 * Helper: Formats Firebase Timestamps or Strings safely
 */
function formatDate(timestamp) {
    if (!timestamp) return "N/A";
    
    // If it's a Firebase Timestamp object
    if (timestamp.seconds) {
        return new Date(timestamp.seconds * 1000).toLocaleDateString();
    }
    
    // If it's already a Date object or a valid ISO string
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString();
}

async function fetchUserDetails() {
    try {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const userData = userSnap.data();
            
            // If the user is a merchant, calculate the wallet from the orders collection
            let calculatedWallet = 0;
            if (userData.role?.toLowerCase() === 'merchant') {
                calculatedWallet = await calculateMerchantWallet(userId);
            }

            renderProfile(userData, calculatedWallet);
        } else {
            alert("User not found.");
            window.location.href = "./dashboard.html";
        }
    } catch (error) {
        console.error("Error fetching details:", error);
    }
}

/**
 * Logic: Matches the Merchant Dashboard calculation perfectly
 */
async function calculateMerchantWallet(merchantId) {
    try {
        const userRef = doc(db, "users", merchantId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return 0;

        const userData = userSnap.data();

        // Simply mirror the merchant dashboard
        const totalPaid = userData.totalPaid || 0;
        const feeAccrued = userData.feeAccrued || 0;

        const currentBalance = totalPaid - feeAccrued;
        return currentBalance;

    } catch (err) {
        console.error("Error calculating wallet:", err);
        return 0;
    }
}


function getInitials(name) {
    if (!name) return "??";
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

async function renderProfile(data, walletAmt) {
    let role = "customer"; // default assume customer
    
    if (data.role) {
        role = data.role.toLowerCase().trim();
    }
    
    // 1. Profile Picture Logic
    if (role === 'merchant' && data.profilePhoto) {
        profileImg.src = data.profilePhoto;
        profileImg.style.display = "block";
        // ADDED FOR MODAL
        profileImg.style.cursor = "pointer";
        profileImg.onclick = () => openModal(data.profilePhoto);
    } else {
        profileImg.style.display = "none";
        // Reset onclick if no photo exists
        profileImg.onclick = null; 
        
        avatarWrapper.style.background = "var(--accent)";
        avatarWrapper.style.borderRadius = "50%";
        avatarWrapper.style.display = "flex";
        avatarWrapper.style.alignItems = "center";
        avatarWrapper.style.justifyContent = "center";
        
        const existingSpan = avatarWrapper.querySelector('.initials-span');
        if (existingSpan) existingSpan.remove();
        avatarWrapper.innerHTML += `<span class="initials-span" style="font-size: 2.5rem; font-weight: 800; color: white; position: absolute;">${getInitials(data.fullName)}</span>`;
    }


    roleBadge.textContent = role.toUpperCase();
    roleBadge.className = `badge ${role}`;

    displayName.textContent = data.fullName || "Unknown";
    handle.textContent = `@${data.username || 'user'}`;

    const isLocked = data.status?.toLowerCase() === 'locked';
    suspendBtn.textContent = isLocked ? "Unlock Account" : "Suspend Account";
    suspendBtn.onclick = () => toggleLock(isLocked);
    
    let staticLocation = "N/A";
    
    if (data.role?.toLowerCase() === 'merchant' && data.location?.lat && data.location?.lng) {
        const closestName = await getClosestLocationName(data.location);
        staticLocation = closestName;
    }

    // 2. Info Grid Construction
    let htmlContent = `
        <div class="trust-card details-card">
            <div class="card-tag">PERSONAL & SYSTEM INFO</div>
            ${createInfoRow("Full Name", data.fullName)}
            ${createInfoRow("Email", data.email)}
            ${createInfoRow("Username", data.username)}
            ${createInfoRow("Gender", data.gender)}
            ${createInfoRow("Phone", data.phoneNumber || N/A)}
            ${createInfoRow("Level", data.level)}
            ${createInfoRow("Matric No", data.matricNumber || data.matricNo)}
            ${role === 'merchant' ? createInfoRow("Closest To", staticLocation) : ""}
            ${createInfoRow("Hostel Location", data.hostelLocation)}
            ${createInfoRow("Status", data.status || "Active")}
            ${createInfoRow("Created At", formatDate(data.createdAt))}
        </div>

        <div class="trust-card details-card">
            <div class="card-tag">BANK ACCOUNT DETAILS</div>
            ${createInfoRow("Bank Name", data.bankDetails?.bankName)}
            ${createInfoRow("Account Name", data.bankDetails?.accountName || data.bankDetails?.accName)}
            ${createInfoRow("Account Number", data.bankDetails?.accountNumber || data.bankDetails?.accNo)}
        </div>
    `;

    // 3. Merchant Specifics & Wallet Logic
    if (role === 'merchant') {
        // Determine display style for wallet (Negative = Debt, Positive = Credit)
        const walletLabel = walletAmt < 0 ? "Outstanding Debt" : "Wallet Balance";
        const walletColor = walletAmt < 0 ? "#ff3b30" : (walletAmt > 0 ? "#34c759" : "inherit");
        const displayAmt = `₦${Math.abs(walletAmt).toLocaleString()}.00`;

        htmlContent += `
            <div class="trust-card details-card">
                <div class="card-tag">MERCHANT STATUS & WALLET</div>
                <div class="info-row">
                    <span class="label">${walletLabel}:</span>
                    <span class="value" style="color: ${walletColor}; font-weight: bold;">${displayAmt}</span>
                </div>
                ${createInfoRow("Rating", `
                    ${(data.rating || 5.0).toFixed(1)} / 5.0 
                    <span style="color: var(--text-dim); font-weight: normal; margin-left: 5px;">
                        (${data.ratingCount || 0} reviews)
                    </span>
                `)}

                ${createInfoRow("Current Plan", data.subscription?.type?.toUpperCase())}
                ${createInfoRow("Expiry Date", formatDate(data.subscription?.expiryDate))}
            </div>
        `;
    }

    detailsGrid.innerHTML = htmlContent;
}


function createInfoRow(label, value) {
    return `
        <div class="info-row">
            <span class="label">${label}:</span>
            <span class="value">${value || 'N/A'}</span>
        </div>
    `;
}

async function toggleLock(currentlyLocked) {
    const action = currentlyLocked ? "Unlock" : "Suspend";
    if (confirm(`Are you sure you want to ${action} this account?`)) {
        try {
            const newStatus = currentlyLocked ? "Active" : "Locked";
            await updateDoc(doc(db, "users", userId), { status: newStatus });
            location.reload();
        } catch (error) {
            alert("Error: " + error.message);
        }
    }
}

// --- PHOTO MODAL LOGIC ---
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

// Initialize Modal
createPhotoModal();
