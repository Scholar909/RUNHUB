import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    collection, query, where, onSnapshot, doc, getDoc 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- State Management ---
let currentMerchantId = null;
const WALLET_THRESHOLD = 1000;
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
        initOrderStats();
    }
});

async function checkIfBlocked(uid) {

    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) return;

    const data = snap.data();

    const balance = (data.walletCredit || 0) - (data.feeAccrued || 0);

    if (balance <= -1000) {
        const debt = Math.abs(balance);
        window.location.href = `./plans.html?action=pay&amount=${debt}`;
    }
}

function initWalletAndStatsListener() {
    const userRef = doc(db, "users", currentMerchantId);

    onSnapshot(userRef, (userDoc) => {
        if (!userDoc.exists()) return;

        const userData = userDoc.data();

        const feeAccrued = Number(userData.feeAccrued || 0);
        const walletCredit = Number(userData.walletCredit || 0);

        const balance = walletCredit - feeAccrued;

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
    latestBalance = Number(balance);
    const payBtn = document.getElementById("payDebtBtn");
    const depositBtn = document.getElementById("depositBtn");

    if (!walletH3) return;

    walletH3.innerText = balance < 0     ? `-₦${Math.abs(balance).toLocaleString()}.00`     : `₦${balance.toLocaleString()}.00`;
    
    if (balance < 0) {
        // Debt state
        payBtn.disabled = false;
        depositBtn.disabled = true;
    
        depositBtn.onclick = () => alert("You must clear your debt first.");
    
    } else {
        // Zero or Positive
        payBtn.disabled = true;
        depositBtn.disabled = false;
    
        payBtn.onclick = () => alert("No outstanding debt.");
    }
    
    if (balance > 0) {
        // POSITIVE BALANCE (Green)
        walletH3.style.color = "#34c759"; 
        if (progressFill) progressFill.style.width = "0%"; 
        if (alertBox) alertBox.style.display = 'none';
        } else if (balance === 0) {
            // CLEAN SLATE
            walletH3.style.color = "var(--text-main, #f5f5f7)"; 
            if (progressFill) {
                progressFill.style.width = "0%";
                progressFill.style.background = "var(--accent)"; // Reset to blue or green
            }
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

function initOrderStats() {
    const ordersRef = collection(db, "orders");
    const q = query(ordersRef, where("merchantId", "==", currentMerchantId));

    onSnapshot(q, (snapshot) => {
        let pendingCount = 0;
        let completedCount = 0;

        snapshot.forEach(doc => {
            const status = doc.data().status;
            if (status === "approved") pendingCount++;
            if (status === "delivered") completedCount++;
        });

        updateStatsUI(pendingCount, completedCount);
    });
}

// --- 5. Global Helpers ---
window.redirectToPay = () => {
    if (latestBalance >= 0) {
        alert("No debt to pay.");
        return;
    }

    // Convert negative balance (e.g., -1200) into a positive payment amount (1200)
    const debtAmount = Math.abs(latestBalance);
    window.location.href = `./plans.html?action=pay&amount=${debtAmount}`;
};

window.handleDeposit = async () => {
    if (latestBalance < 0) {
        alert("Clear your debt before depositing.");
        return;
    }

    const amount = prompt("Enter amount to deposit (₦):");
    
    // Validation: Ensure it's a number and greater than 0
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
        alert("Please enter a valid amount.");
        return;
    }

    // Forward the custom amount to the plans page
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
