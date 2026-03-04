import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    collection, query, where, onSnapshot, orderBy 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- State Management ---
let currentTab = 'pending';
let unsubscribe = null;

// --- 1. Initialization ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        initHistoryListener(user.uid);
    } else {
        window.location.href = "./sign-login.html";
    }
});

// --- 2. Real-time Listener ---
function initHistoryListener(uid) {
    if (unsubscribe) unsubscribe();

    // Logic: 
    // Pending Tab: shows 'pending' (Awaiting Approval) or 'approved' (Awaiting Delivery)
    // Delivered Tab: shows 'delivered'
    // Declined Tab: shows 'declined'
    
    let statusFilter;
    if (currentTab === 'pending') {
        statusFilter = ['pending', 'approved'];
    } else if (currentTab === 'delivered') {
        statusFilter = ['delivered'];
    } else {
        statusFilter = ['declined'];
    }

    const q = query(
        collection(db, "orders"),
        where("customerId", "==", uid),
        where("status", "in", statusFilter),
        orderBy("timestamp", "desc")
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
        const orders = [];
        snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
        renderHistory(orders);
    });
}

// --- 3. UI Rendering ---
function renderHistory(orders) {
    const grid = document.getElementById('historyGrid');
    
    if (orders.length === 0) {
        grid.innerHTML = `
            <div style="text-align:center; padding: 40px; color: var(--text-dim); grid-column: 1/-1;">
                <p>No ${currentTab} orders found.</p>
            </div>`;
        return;
    }

    grid.innerHTML = orders.map(order => {
        const statusData = getStatusStyle(order.status);
        const date = new Date(order.timestamp).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        return `
            <div class="trust-card history-card">
                <div class="order-info-stack">
                    <div class="card-tag ${statusData.class}">${statusData.label}</div>
                    <div class="order-header">
                        <h3>@${order.merchantName}</h3>
                    </div>
                    <div class="order-summary">
                        <p>Total: <span class="accent">₦${order.total.toLocaleString()}</span></p>
                    </div>
                    <span class="order-date">${date}</span>
                    ${order.refundStatus === 'completed' ? '<span class="order-date" style="color:var(--success)">REFUNDED</span>' : ''}
                </div>
                <button class="btn btn-outline" onclick="viewReceipt('${order.id}')">View</button>
            </div>
        `;
    }).join('');
}

// --- 4. Helper Functions ---

function getStatusStyle(status) {
    switch(status) {
        case 'pending': 
            return { label: 'PENDING APPROVAL', class: 'status-pending' };
        case 'approved': 
            return { label: 'APPROVED / IN TRANSIT', class: 'status-success' };
        case 'delivered': 
            return { label: 'DELIVERED', class: 'status-success' };
        case 'declined': 
            return { label: 'DECLINED', class: 'status-error' };
        default: 
            return { label: status.toUpperCase(), class: '' };
    }
}

window.switchTab = (tab) => {
    currentTab = tab;
    
    // Update UI buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if(btn.innerText.toLowerCase() === tab) btn.classList.add('active');
    });

    // Re-run listener for the new tab
    if (auth.currentUser) initHistoryListener(auth.currentUser.uid);
};

// ... (Keep existing code above)

// --- 4. Navigation & Details ---
window.viewReceipt = (orderId) => {
    // Store context for the view-rec page
    localStorage.setItem("viewingOrderId", orderId);
    localStorage.setItem("receiptSource", currentTab); 
    // This tells the receipt page we are coming from the customer side
    localStorage.setItem("userRole", "customer"); 
    
    window.location.href = "./cust-view-rec.html";
};

// ... (Keep existing code below)


// --- 5. Global Navigation ---
window.toggleDrawer = () => {
    document.getElementById('navDrawer').classList.toggle('active');
};

window.handleLogout = async () => {
    await auth.signOut();
    window.location.href = "./sign-login.html";
};
