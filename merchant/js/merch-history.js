import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    collection, query, where, onSnapshot, orderBy, getDoc, doc 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- State Management ---
let currentMerchantId = null;
let currentTab = 'pending'; // Default tab
let unsubscribe = null;

// --- 1. Auth Guard & Initialization ---
// location.js handles enforcement (GPS/Debt/Sub). 
// This listener only initializes the page data once authed.
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentMerchantId = user.uid;
        // Start history logic only if user is confirmed
        if (typeof switchTab === 'function') {
            switchTab('pending'); 
        }
    }
    // No 'else' needed; location.js handles unauthorized users
});


/**
 * Switch tabs and refresh the Firestore listener
 * @param {string} tab - 'pending', 'completed', or 'declined'
 */
window.switchTab = (tab) => {
    currentTab = tab;

    // Update UI Active State
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick').includes(tab)) {
            btn.classList.add('active');
        }
    });

    initHistoryListener();
};

// --- 2. Real-time History Listener ---
function initHistoryListener() {
    if (unsubscribe) unsubscribe();

    let statusFilter;
    // Tab Logic:
    // 'pending' tab shows orders already APPROVED by merchant but not yet DELIVERED.
    // 'completed' tab shows orders marked as DELIVERED.
    // 'declined' tab shows orders REFUNDED/DECLINED.
    
    if (currentTab === 'pending') {
        statusFilter = ['approved']; 
    } else if (currentTab === 'completed') {
        statusFilter = ['delivered'];
    } else {
        statusFilter = ['declined'];
    }

    const q = query(
        collection(db, "orders"),
        where("merchantId", "==", currentMerchantId),
        where("status", "in", statusFilter),
        orderBy("timestamp", "desc")
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
        const orders = [];
        snapshot.forEach(doc => {
            orders.push({ id: doc.id, ...doc.data() });
        });
        renderHistoryList(orders);
    }, (error) => {
        console.error("History Listener Error:", error);
    });
}

// --- 3. UI Rendering ---
async function renderHistoryList(orders) {
    const grid = document.getElementById('historyGrid');
    
    if (orders.length === 0) {
        grid.innerHTML = `
            <div style="text-align:center; padding: 50px 20px; color: var(--text-dim); grid-column: 1/-1;">
                <i class="fi-clock" style="font-size: 2rem; opacity: 0.3;"></i>
                <p style="margin-top: 10px;">No ${currentTab} orders found.</p>
            </div>`;
        return;
    }

    // Map through orders and fetch customer names for display
    const listHtml = await Promise.all(orders.map(async (order) => {
        const customerSnap = await getDoc(doc(db, "users", order.customerId));
        const customerData = customerSnap.exists() ? customerSnap.data() : { fullName: "User" };
        
        const dateString = new Date(order.timestamp).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const statusStyle = getStatusLabel(order.status);

        return `
            <div class="trust-card history-card">
                <div class="order-info-stack">
                    <div class="card-tag ${statusStyle.class}">${statusStyle.label}</div>
                    <div class="order-header">
                        <h3>${customerData.fullName}</h3>
                    </div>
                    <div class="order-summary">
                        <p>Total Revenue: <span class="accent">₦${order.total.toLocaleString()}</span></p>
                    </div>
                    <span class="order-date">${dateString}</span>
                </div>
                <button class="btn btn-outline" onclick="viewDetails('${order.id}')">View</button>
            </div>
        `;
    }));

    grid.innerHTML = listHtml.join('');
}

// --- 4. Navigation & Details ---
window.viewDetails = (orderId) => {
    // Store the order ID and the source tab for the receipt page logic
    localStorage.setItem("viewingOrderId", orderId);
    localStorage.setItem("receiptSource", currentTab); 
    window.location.href = "view-rec.html";
};

function getStatusLabel(status) {
    switch (status) {
        case 'approved': return { label: 'AWAITING DELIVERY', class: 'status-pending' };
        case 'delivered': return { label: 'DELIVERED & PAID', class: 'status-success' };
        case 'declined': return { label: 'DECLINED / REFUNDED', class: 'status-error' };
        default: return { label: status.toUpperCase(), class: '' };
    }
}

// --- 5. Global Helpers ---
window.toggleDrawer = () => document.getElementById('navDrawer').classList.toggle('active');

window.handleLogout = async () => {
    try {
        await signOut(auth);
        window.location.href = "sign-login.html";
    } catch (e) { console.error(e); }
};
