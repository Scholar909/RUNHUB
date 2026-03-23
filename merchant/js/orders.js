import { auth, db } from "./firebase-config.js";
import { sendWhatsAppAlert } from "./send-alerts.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    collection, query, where, onSnapshot, doc, updateDoc, getDoc, serverTimestamp , orderBy, increment, runTransaction
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";


const isMonitoringActive = true; // Set to true to enforce GPS
const WAL_THRESHOLD = 1000;

let locationWatcher = null;

// --- State Management ---
let currentMerchantId = null;
let activeOrders = [];
let orderToDecline = null;

const CUSTOMER_FEE = 25;

// --- 1. Auth & Initialization ---
onAuthStateChanged(auth, async (user) => {
    if (!user) return window.location.href = "./sign-login.html";

    currentMerchantId = user.uid;
    initOrdersListener();
    startLocationMonitoring(); // enforce GPS

    // Real-time wallet enforcement
    const userRef = doc(db, "users", user.uid);
    onSnapshot(userRef, async () => {
        await enforceRules(user.uid);
    });
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
        let customerId = "";

        // 1. Database Update
        await runTransaction(db, async (t) => {
            const orderSnap = await t.get(orderRef);
            const orderData = orderSnap.data();
            
            if (orderData.status !== "pending") throw new Error("Already processed");
            
            customerId = orderData.customerId; // Capture ID for the alert later
            const merchantFee = Math.ceil((orderData.deliveryCharge || 0) * 0.1);
            
            t.update(orderRef, { status: "approved", approvedAt: serverTimestamp() });
            t.update(doc(db, "users", currentMerchantId), { 
                feeAccrued: increment(CUSTOMER_FEE + merchantFee) 
            });
        });

        // 2. Notification (Outside transaction, only runs once on success)
        const message = `*Order Approval Alert — NOVAHUB*
Order ID: ${orderId}
Status: Approved & In Transit
Time: ${new Date().toLocaleTimeString()}`;

        await sendWhatsAppAlert(customerId, message);
        alert(`Order Approved! Customer Notified.`);
        
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

        const refundAmount = order.total;

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
        
        const message = `*Order Rejected — NOVAHUB*
        Order ID: ${orderToDecline.id}
        Total: ₦${orderToDecline.total.toLocaleString()}
        Status: Check if you've been refunded. If not, it should arrive within 30 mins.`;
        
        await sendWhatsAppAlert(orderToDecline.customerId, message);
        
        closeModal();
        alert("Order declined and Customer notified.");
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

async function deactivateActiveSession(uid) {
    try {
        await updateDoc(doc(db, "users", uid), { isActive: false });
        const sessionsSnap = await getDocs(query(collection(db, "merchants", uid, "sessions"), where("isActive", "==", true)));
        const batch = [];
        sessionsSnap.forEach(d => batch.push(updateDoc(d.ref, { isActive: false, lastTurnedOff: Date.now() })));
        await Promise.all(batch);
    } catch (e) {
        console.error("Session cleanup failed:", e);
    }
}

async function forceLogout() {
    if (locationWatcher) navigator.geolocation.clearWatch(locationWatcher);
    if (auth.currentUser) await deactivateActiveSession(auth.currentUser.uid);
    await auth.signOut();
    window.location.href = "./sign-login.html";
}

async function enforceRules(uid) {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return forceLogout();

    const data = userSnap.data();

    // Skip admins/customers if needed
    const role = (data.role || "").toLowerCase();
    if (role === "admin" || role === "customer") return;

    // Wallet debt enforcement
    const balance = (data.walletCredit || 0) - (data.feeAccrued || 0);
    if (balance <= -WAL_THRESHOLD) {
        if (!data.walletDueSince) await updateDoc(userRef, { walletDueSince: serverTimestamp() });
        await deactivateActiveSession(uid);
        const debtAmount = Math.abs(balance);
        window.location.href = `./plans.html?action=pay&amount=${debtAmount}`;
    } else if (data.walletDueSince) {
        await updateDoc(userRef, { walletDueSince: null });
    }
}

function startLocationMonitoring() {
    if (!isMonitoringActive) return;

    let lastLocationTimestamp = Date.now();
    const GPS_GRACE_MS = 2 * 60 * 1000; // 2 minutes grace
    let gpsAlertShown = false;

    if ("geolocation" in navigator) {
        locationWatcher = navigator.geolocation.watchPosition(
            () => {
                lastLocationTimestamp = Date.now();
                gpsAlertShown = false;
            },
            () => {
                const now = Date.now();
                if (!gpsAlertShown && now - lastLocationTimestamp > GPS_GRACE_MS) {
                    gpsAlertShown = true;
                    alert("Please turn on your location to remain visible.");
                    forceLogout();
                }
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );
    } else {
        alert("CRITICAL: Location services must remain ON.");
        forceLogout();
    }
}



window.handleLogout = async () => {
    await auth.signOut();
    window.location.href = "./sign-login.html";
};
