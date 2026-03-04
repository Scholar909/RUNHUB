import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- Global Config (Synced with Location JS) ---
const WAL_THRESHOLD = 500;
const ADMIN_FEE = 50;
const TRIAL_DAYS = 14;
const GRACE_HOURS = 24;

let currentOrderId = localStorage.getItem("viewingOrderId");
let sourceTab = localStorage.getItem("receiptSource"); 

// --- 1. Initialization & Security Guard ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Run rule enforcement first
        await enforceRules(user.uid);
        
        if (currentOrderId) {
            loadOrderDetails(user);
        } else {
            window.location.href = "history.html"; // Redirect if no order ID found
        }
    } else {
        window.location.href = "sign-login.html";
    }
});

// --- 2. Enforcement Logic (Keep this in sync with Location JS) ---
async function enforceRules(uid) {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    const now = new Date();
    const toJSDate = (val) => val?.toDate ? val.toDate() : new Date(val || 0);

    // Subscription/Trial Check
    const createdAt = toJSDate(userData.createdAt);
    let isExpired = false;
    if (!userData.subscription) {
        const trialEnd = new Date(createdAt);
        trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
        if (now > trialEnd) isExpired = true;
    } else if (now > toJSDate(userData.subscription.expiryDate)) {
        isExpired = true;
    }

    if (isExpired) {
        window.location.href = "./plans.html";
        return;
    }

    // Wallet/Debt Check (Simplified for the view page check)
    if (userData.walletDueSince) {
        const dueSince = toJSDate(userData.walletDueSince);
        const hoursPassed = (now - dueSince) / (1000 * 60 * 60);
        if (hoursPassed >= GRACE_HOURS) {
            window.location.href = "./plans.html?reason=debt";
        }
    }
}

// --- 3. Data Loading ---
async function loadOrderDetails(user) {
    try {
        const orderDoc = await getDoc(doc(db, "orders", currentOrderId));
        if (!orderDoc.exists()) return;
        const order = orderDoc.data();

        // Fetch Customer Info
        const custDoc = await getDoc(doc(db, "users", order.customerId));
        const customer = custDoc.exists() ? custDoc.data() : {};

        // UI Header & Status
        document.getElementById('recId').innerText = `#RH-${currentOrderId.slice(-5).toUpperCase()}`;
        document.getElementById('custUser').innerText = `@${customer.username || 'user'}`;
        document.getElementById('custName').innerText = `Customer: ${customer.fullName} (${customer.location || 'No Location'})`;
        
        const badge = document.getElementById('statusBadge');
        badge.innerText = order.status.toUpperCase();
        badge.className = `status-badge status-${order.status === 'declined' ? 'error' : (order.status === 'delivered' ? 'success' : 'pending')}`;

        // Item List
        const listContainer = document.getElementById('itemList');
        let itemsHtml = '';
        if (order.hasPack) itemsHtml += `<div class="item-row"><span>1x Food Pack (Standard)</span><span>₦200</span></div>`;
        order.items.forEach(item => {
            itemsHtml += `<div class="item-row"><span>${item.qty}x ${item.name}</span><span>₦${(item.price * item.qty).toLocaleString()}</span></div>`;
        });
        listContainer.innerHTML = itemsHtml;

        // Financials
        const subtotalValue = order.total - order.deliveryCharge - (order.hasPack ? 200 : 0) - 50;
        document.getElementById('subtotal').innerText = `₦${subtotalValue.toLocaleString()}`;
        document.getElementById('delivery').innerText = `₦${order.deliveryCharge.toLocaleString()}`;
        document.getElementById('packaging').innerText = `₦${(order.hasPack ? 200 : 0).toLocaleString()}`;
        
        const isMerchant = user.uid === order.merchantId;
        if (isMerchant) {
            document.getElementById('adminFeeRow').style.display = 'flex';
            document.getElementById('totalLabel').innerText = "YOUR EARNING";
            document.getElementById('grandTotal').innerText = `₦${(order.total - 50).toLocaleString()}`;
        } else {
            document.getElementById('adminFeeRow').style.display = 'none';
            document.getElementById('totalLabel').innerText = "TOTAL PAID";
            document.getElementById('grandTotal').innerText = `₦${order.total.toLocaleString()}`;
        }

        renderTimeline(order);

        // Action Button Visibility
        if (isMerchant && sourceTab === 'pending' && order.status === 'approved') {
            document.getElementById('merchantActionArea').style.display = 'block';
        }

    } catch (e) {
        console.error("Error loading receipt:", e);
    }
}

// --- 4. UI Rendering Helpers ---
function renderTimeline(order) {
    const timeline = document.getElementById('timeline');
    let html = `<h3>Transaction Logs</h3>`;
    const toMs = (time) => time?.toMillis ? time.toMillis() : time;

    html += createTimelineItem(order.timestamp, "Order Placed & Payment Sent", "completed");

    if (order.approvedAt) {
        html += createTimelineItem(toMs(order.approvedAt), "Merchant Approved Payment", "completed");
    }

    if (order.status === 'delivered' && order.deliveredAt) {
        html += createTimelineItem(toMs(order.deliveredAt), "Delivered to Customer", "completed");
    }

    if (order.status === 'declined' && order.declinedAt) {
        html += createTimelineItem(toMs(order.declinedAt), "Order Declined & Refunded", "completed");
    }

    timeline.innerHTML = html;
}

function createTimelineItem(time, text, type) {
    const t = new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
        <div class="timeline-item ${type}">
            <div class="time-stamp">${t}</div>
            <div class="timeline-content"><p>${text}</p></div>
        </div>`;
}

// --- 5. Actions ---
window.markOrderDelivered = async () => {
    if (!confirm("Confirm that this order has been delivered to the customer?")) return;

    try {
        await updateDoc(doc(db, "orders", currentOrderId), {
            status: "delivered",
            deliveredAt: serverTimestamp()
        });
        alert("Order completed! Moving to Completed tab.");
        window.location.href = "history.html"; 
    } catch (e) {
        alert("Error updating order.");
    }
};

window.toggleDrawer = () => document.getElementById('navDrawer').classList.toggle('active');
