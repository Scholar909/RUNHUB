import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    collection, query, where, onSnapshot, doc, getDoc 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- State Management ---
let currentMerchantId = null;
const ADMIN_FEE_PER_ORDER = 50;
const WALLET_THRESHOLD = 500;
let latestBalance = 0; 

// Helper to safely handle different timestamp formats
const toJSDate = (val) => {
    if (!val) return new Date(0);
    if (typeof val.toDate === 'function') return val.toDate();
    if (val instanceof Date) return val;
    return new Date(val);
};

// --- 1. Auth Guard & Initialization ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentMerchantId = user.uid;
    
        checkIfBlocked(user.uid);
    
        initWalletAndStatsListener();
        initActiveOrdersBadge();
    }
});

async function checkIfBlocked(uid) {

    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) return;

    const data = snap.data();

    const balance = (data.totalPaid || 0) - (data.feeAccrued || 0);

    if (balance <= -500) {
        const debt = Math.abs(balance);
        window.location.href = `./plans.html?action=pay&amount=${debt}`;
    }
}

function initWalletAndStatsListener() {
    const userRef = doc(db, "users", currentMerchantId);

    onSnapshot(userRef, (userDoc) => {
        if (!userDoc.exists()) return;

        const userData = userDoc.data();

        const totalPaid = userData.totalPaid || 0;
        const feeAccrued = userData.feeAccrued || 0;

        const balance = totalPaid - feeAccrued;

        updateWalletUI(balance);
    });
}


// --- 3. Badge Listener (Orders awaiting Merchant Approval) ---
function initActiveOrdersBadge() {
    const q = query(
        collection(db, "orders"),
        where("merchantId", "==", currentMerchantId),
        where("status", "==", "pending")
    );

    onSnapshot(q, (snapshot) => {
        const count = snapshot.size;
        const badgeBtn = document.querySelector('a[href="orders.html"].btn-outline');
        if (!badgeBtn) return;

        if (count > 0) {
            badgeBtn.innerHTML = `Approve/Decline <span class="badge" style="background: #ff3b30; color: white; padding: 2px 8px; border-radius: 8px; margin-left: 8px; font-size: 0.8rem;">${count}</span>`;
        } else {
            badgeBtn.innerText = "Approve/Decline Orders";
        }
    });
}

// --- 4. UI Updating Functions ---
function updateWalletUI(balance) {
    const walletH3 = document.querySelector('.wallet-card h3');
    const progressFill = document.querySelector('.progress-fill');
    const alertBox = document.querySelector('.alert-box');
    latestBalance = balance;

    if (!walletH3) return;

    walletH3.innerText = `₦${Math.abs(balance).toLocaleString()}.00`;
    
    if (balance > 0) {
        // POSITIVE BALANCE (Green)
        walletH3.style.color = "#34c759"; 
        if (progressFill) progressFill.style.width = "0%"; 
        if (alertBox) alertBox.style.display = 'none';
    } else if (balance === 0) {
        // CLEAN SLATE (Neutral/Gray or Black)
        walletH3.style.color = "var(--text-main, #000)"; // Use your main text color
        if (progressFill) progressFill.style.width = "0%";
        if (alertBox) alertBox.style.display = 'none';
    } else {
        // DEBT (Red)
        walletH3.style.color = "#ff3b30";
        const debt = Math.abs(balance);
        let percentage = (debt / WALLET_THRESHOLD) * 100;
        if (progressFill) {
            progressFill.style.width = `${Math.min(percentage, 100)}%`;
            progressFill.style.background = "#ff3b30";
        }

        if (alertBox && debt >= WALLET_THRESHOLD) {
            alertBox.style.display = 'flex';
            alertBox.innerHTML = `<i class="fi-alert"></i> <span>Threshold reached! Pay ₦${debt} to avoid block.</span>`;
        } else if (alertBox) {
            alertBox.style.display = 'none';
        }
    }
}


function updateStatsUI(pendingCount, completedCount) {
    const statsValues = document.querySelectorAll('.stat-value');
    if(statsValues.length >= 2) {
        // Index 0: Pending Card (Approved orders)
        // Index 1: Completed Card (Delivered orders)
        statsValues[0].innerText = pendingCount.toString().padStart(2, '0');
        statsValues[1].innerText = completedCount.toString().padStart(2, '0');
    }
}

// --- 5. Global Helpers ---
window.redirectToPay = () => {
    if (latestBalance >= 0) {
        alert("You have no outstanding debt.");
        return;
    }
    const debt = Math.abs(latestBalance);
    // Redirect with action and the specific amount
    window.location.href = `./plans.html?action=pay&amount=${debt}`;
};

window.handleDeposit = async () => {
    const amount = prompt("Enter amount to deposit into your wallet:");
    if (!amount || isNaN(amount) || amount <= 0) return;
    
    // Redirect to plans with deposit action
    window.location.href = `./plans.html?action=deposit&amount=${amount}`;
};

window.toggleDrawer = () => {
    const drawer = document.getElementById('navDrawer');
    if (drawer) drawer.classList.toggle('active');
};

window.handleLogout = async () => {
    try {
        await signOut(auth);
        window.location.href = "./sign-login.html";
    } catch (error) {
        console.error("Logout failed", error);
    }
};
