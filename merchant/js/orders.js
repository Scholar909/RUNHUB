import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    collection, query, where, onSnapshot, doc, updateDoc, getDoc, serverTimestamp , orderBy, increment
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- State Management ---
let currentMerchantId = null;
let activeOrders = [];
let orderToDecline = null;

// --- 1. Auth & Initialization ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentMerchantId = user.uid;
        initOrdersListener();
    }
});

// --- 2. Real-time Orders Listener ---
function initOrdersListener() {
    const q = query(
        collection(db, "orders"), 
        where("merchantId", "==", currentMerchantId),
        where("status", "==", "pending"),
        orderBy("timestamp", "asc")
    );

    onSnapshot(q, (snapshot) => {
        activeOrders = [];
        snapshot.forEach(doc => {
            activeOrders.push({ id: doc.id, ...doc.data() });
        });
        renderOrders();
    });
}

// --- 3. UI Rendering ---
async function renderOrders() {
    const container = document.querySelector('.orders-feed');
    
    if (activeOrders.length === 0) {
        container.innerHTML = `
            <div class="trust-card" style="text-align:center; padding: 40px;">
                <p style="color: var(--text-dim);">No active orders at the moment.</p>
            </div>`;
        return;
    }

    let html = '';
    // Use Promise.all to fetch all customer data in parallel for better performance
    const orderCards = await Promise.all(activeOrders.map(async (order) => {
        const customerSnap = await getDoc(doc(db, "users", order.customerId));
        const customer = customerSnap.exists() ? customerSnap.data() : {};
        const timeAgo = formatTime(order.timestamp);

        return `
            <div class="trust-card order-card">
                <div class="order-top">
                    <div class="card-tag">AWAITING APPROVAL</div>
                    <span class="order-time">${timeAgo}</span>
                </div>
                
                <div class="customer-info">
                    <h3>${customer.fullName || 'Unknown Customer'}</h3>
                    <p>@${customer.username || 'user'} • ${customer.hostelLocation || 'Location not set'}</p>
                </div>

                <div class="order-items">
                    <label>Order Detail</label>
                    <ul>
                        ${order.hasPack ? '<li>1x Food Pack (Standard)</li>' : ''}
                        ${(order.items || []).map(item => `<li>${item.qty}x ${item.name}</li>`).join('')}
                    </ul>
                </div>

                <div class="payment-summary">
                    <div class="total-row">
                        <span>Total Paid:</span>
                        <span class="accent">₦${order.total.toLocaleString()}</span>
                    </div>
                </div>

                <div class="action-buttons">
                    <button class="btn btn-filled flex-1" onclick="approveOrder('${order.id}')">Approve</button>
                    <button class="btn btn-outline flex-1" onclick="prepareDecline('${order.id}')">Decline</button>
                </div>
            </div>
        `;
    }));

    container.innerHTML = orderCards.join('');
}

// --- 4. Order Actions ---

window.approveOrder = async (orderId) => {
    try {
        const orderRef = doc(db, "orders", orderId);
        await updateDoc(orderRef, {
            status: "approved",
            approvedAt: serverTimestamp()
        });
        
        // Increment platform fee
        await updateDoc(doc(db, "users", currentMerchantId), {
            feeAccrued: increment(50)
        });
        alert("Order Approved! It has moved to your Pending History tab.");
    } catch (error) {
        console.error("Approval error:", error);
        alert("Failed to approve order.");
    }
};

window.prepareDecline = async (orderId) => {
    const order = activeOrders.find(o => o.id === orderId);
    if (!order) return;

    orderToDecline = order;

    try {
        // Fetch fresh customer bank details directly from their profile
        const customerSnap = await getDoc(doc(db, "users", order.customerId));
        const customer = customerSnap.exists() ? customerSnap.data() : {};
        
        // Mapping to your signup keys: bankName, accName, accNo
        const bank = customer.bankDetails || {};

        // Calculate refund amount: Total paid minus 50 naira platform fee
        const refundAmount = order.total - 50;

        document.getElementById('refundName').innerText = bank.accName || "Not Provided";
        document.getElementById('refundNumber').innerText = bank.accNo || "Not Provided";
        document.getElementById('refundBank').innerText = bank.bankName || "Not Provided";
        document.getElementById('refundAmount').innerText = `₦${refundAmount.toLocaleString()}`;

        document.getElementById('declineModal').style.display = 'flex';
    } catch (error) {
        console.error("Error fetching refund details:", error);
        alert("Could not retrieve customer bank details.");
    }
};

window.confirmRefund = async () => {
    if (!orderToDecline) return;

    try {
        const orderRef = doc(db, "orders", orderToDecline.id);
        
        // As per RUNHub doc: Status moves to declined, and we track manual refund
        await updateDoc(orderRef, {
            status: "declined",
            refundStatus: "completed",
            processedAt: serverTimestamp(),
            declinedAt: serverTimestamp()
        });
        
        // Increment platform fee
        await updateDoc(doc(db, "users", currentMerchantId), {
            feeAccrued: increment(50)
        });

        closeModal();
        alert("Order declined. Refund has been marked as completed.");
    } catch (error) {
        console.error("Decline error:", error);
        alert("Error updating order status.");
    }
};

// --- 5. Utilities & UI Helpers ---
window.toggleDrawer = () => {
    document.getElementById('navDrawer').classList.toggle('active');
};

window.closeModal = () => {
    document.getElementById('declineModal').style.display = 'none';
    orderToDecline = null;
};

function formatTime(timestamp) {
    if (!timestamp) return "Just now";
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return "Just now";
    const mins = Math.floor(seconds / 60);
    return `${mins} mins ago`;
}

window.handleLogout = async () => {
    await auth.signOut();
    window.location.href = "./sign-login.html";
};
