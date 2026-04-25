import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    collection, query, where, onSnapshot, doc, updateDoc, getDoc, serverTimestamp , orderBy, increment, runTransaction
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";


const isMonitoringActive = true; // Set to true to enforce GPS
const WAL_THRESHOLD = 300;

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
        
        const displayAddress = order.deliveryAddress || customer.hostelLocation || 'No location provided';
        
        const guestTag = order.isGuest ? `<span style="background: #ff9500; color: #000; padding: 2px 8px; border-radius: 4px; font-size: 0.6rem; font-weight: bold; margin-left: 10px;">• GUEST</span>` : '';

        return `
            <div class="trust-card order-card">
                <div class="order-top">
                    <div class="card-tag">AWAITING APPROVAL</div>
                    <span class="order-time">${timeAgo}</span>
                </div>
                
                <div class="customer-info">
                    <h3>${customer.fullName || order.customerName || 'Unknown Customer'} ${guestTag}</h3>
                    <p>@${customer.username || 'user'}</p>
                    
                    <div style="margin-top: 8px; font-size: 0.9rem; font-weight: bold;">
                <i class="fi-phone"></i> 
                <a href="tel:${order.customerPhone}" style="color: var(--accent); text-decoration: none;">
                    ${order.customerPhone || 'No Phone'}
                </a>
                </div>
                    
                  <div class="delivery-spot" style="display: flex; flex-direction: column; gap: 5px; margin-top: 10px;">
                      <div style="font-size: 0.8rem;">
                          <span style="color: var(--accent); font-weight: bold;">FROM:</span> 
                          <span>${order.fromLocation || 'Merchant Location'}</span>
                      </div>
                      <div style="font-size: 0.8rem;">
                          <span style="color: #28a745; font-weight: bold;">TO:</span> 
                          <span>${displayAddress}</span>
                      </div>
                  </div>
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
        const merchantRef = doc(db, "users", currentMerchantId);

        await runTransaction(db, async (t) => {
            const orderSnap = await t.get(orderRef);
            const merchantSnap = await t.get(merchantRef);
            
            if (!orderSnap.exists()) throw "Order missing";
            if (!merchantSnap.exists()) throw "Merchant missing";

            const orderData = orderSnap.data();
            const merchantData = merchantSnap.data();
            
            if (orderData.status !== "pending") throw "Already processed";
            
            // Calculate total fee for this delivery
            const merchantCommission = Math.ceil((orderData.deliveryCharge || 0) * 0.1);
            const totalFeeToPlatform = CUSTOMER_FEE + merchantCommission;

            // Update Order Status
            t.update(orderRef, { 
                status: "approved", 
                approvedAt: serverTimestamp() 
            });

            // WALLET LOGIC: 
            // If merchant has enough credit, deduct from wallet.
            // Otherwise, add to feeAccrued (debt).
            const currentCredit = Number(merchantData.walletCredit || 0);

            if (currentCredit >= totalFeeToPlatform) {
                t.update(merchantRef, { 
                    walletCredit: increment(-totalFeeToPlatform) 
                });
            } else {
                t.update(merchantRef, { 
                    feeAccrued: increment(totalFeeToPlatform) 
                });
            }
        });

        alert(`Order Approved!`);
        
    } catch (error) {
        console.error("Approval error:", error);
        alert(typeof error === 'string' ? error : "Failed to approve order.");
    }
};



window.prepareDecline = async (orderId) => {
    const order = activeOrders.find(o => o.id === orderId);
    if (!order) return;

    orderToDecline = order;

    try {
        let bank = {};
        let refundAmount = order.total;

        // Logic Check: If Guest, use data embedded in order. If User, fetch from profile.
        if (order.isGuest && order.guestBankInfo) {
            bank = {
                accName: order.guestBankInfo.accName,
                accNo: order.guestBankInfo.accNo,
                bankName: order.guestBankInfo.bankName
            };
        } else {
            // Fetch fresh customer bank details directly from their profile
            const customerSnap = await getDoc(doc(db, "users", order.customerId));
            const customer = customerSnap.exists() ? customerSnap.data() : {};
            bank = customer.bankDetails || {};
        }

        // Update Modal UI
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
    if (!userSnap.exists()) return;

    const data = userSnap.data();
    const wallet = Number(data.walletCredit || 0);
    const fees = Number(data.feeAccrued || 0);
    
    // The True Balance
    const netBalance = wallet - fees;

    // Only block if the TOTAL deficit is more than 300
    if (netBalance <= -WAL_THRESHOLD) {
        await deactivateActiveSession(uid);
        const amountToPay = Math.abs(netBalance);
        window.location.href = `./plans.html?action=pay&amount=${amountToPay}`;
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
