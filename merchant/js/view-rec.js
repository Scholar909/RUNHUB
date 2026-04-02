import { auth, db } from "./firebase-config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- Global Config (Synced with Location JS) ---
const WAL_THRESHOLD = 300;
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
            window.location.href = "./history.html"; // Redirect if no order ID found
        }
    } else {
        window.location.href = "./sign-login.html";
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

        const platformFee = 25;
        const delivery = order.deliveryCharge || 0;
        const packaging = order.hasPack ? 200 : 0;
        
        // TRUE subtotal (items only)
        const subtotal = order.total - delivery - packaging - platformFee;
        
        const firstTotal = order.total;
        
        // Commission
        const deliveryCommission = delivery * 0.10;
        
        // ✅ Final merchant earning (clean & logical)
        const merchantEarning = firstTotal - platformFee - deliveryCommission;
          
        // Fetch Customer Info
        const custDoc = await getDoc(doc(db, "users", order.customerId));
        const customer = custDoc.exists() ? custDoc.data() : {};
        
        const finalDeliverySpot = order.deliveryAddress || customer.hostelLocation || 'Location not set';
        const fromSpot = order.fromLocation || 'Merchant Hub';

        // UI Header & Status
        document.getElementById('recId').innerText = `#RH-${currentOrderId.slice(-5).toUpperCase()}`;
        document.getElementById('custUser').innerText = `@${customer.username || 'user'}`;
        
        document.getElementById('custName').innerHTML = `
            <div style="margin-top: 10px;">
                <p><b>Customer:</b> ${customer.fullName}</p>
                <p style="font-size: 0.9em; color: var(--text-dim);">
                    <span style="color: var(--accent)">●</span> Pick-up: ${fromSpot}<br>
                    <span style="color: #28a745">●</span> Delivery: ${finalDeliverySpot}
                </p>
            </div>
        `;
        
        const badge = document.getElementById('statusBadge');
        badge.innerText = order.status.toUpperCase();
        badge.className = `status-badge status-${order.status === 'declined' ? 'error' : (order.status === 'delivered' ? 'success' : 'pending')}`;

        // Item List
        const listContainer = document.getElementById('itemList');
        let itemsHtml = '';
        if (order.hasPack) itemsHtml += `<div class="item-row"><span>1x Food Pack (Standard)</span><span>₦200</span></div>`;
        (order.items || []).forEach(item => {
            itemsHtml += `<div class="item-row"><span>${item.qty}x ${item.name}</span><span>₦${(item.price * item.qty).toLocaleString()}</span></div>`;
        });
        listContainer.innerHTML = itemsHtml;

        document.getElementById('subtotal').innerText = `₦${subtotal.toLocaleString()}`;
        document.getElementById('delivery').innerText = `₦${delivery.toLocaleString()}`;
        document.getElementById('packaging').innerText = `₦${packaging.toLocaleString()}`;
        document.getElementById('firstTotal').innerText = `₦${firstTotal.toLocaleString()}`;
        
        const isMerchant = user.uid === order.merchantId;
          if (isMerchant) {
              document.getElementById('platformFee').innerText = `-₦${platformFee}`;
              document.getElementById('deliveryCommission').innerText = `-₦${deliveryCommission.toLocaleString()}`;
              document.getElementById('adminFeeRow').style.display = 'flex';
              document.getElementById('totalLabel').innerText = "YOU RECEIVED";
              document.getElementById('grandTotal').innerText = `₦${merchantEarning.toLocaleString()}`;
          } else {
              document.getElementById('platformFee').style.display = 'none';
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

    html += createTimelineItem(toMs(order.timestamp), "Order Placed & Payment Sent", "completed");

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
        const orderRef = doc(db, "orders", currentOrderId);
        const orderSnap = await getDoc(orderRef);
        
        if (!orderSnap.exists()) {
            alert("Order not found!");
            return;
        }
        
        const orderData = orderSnap.data();
        const customerId = orderData.customerId; // This MUST be the Firebase UID

        // 1. Update Firestore
        await updateDoc(orderRef, {
            status: "delivered",
            deliveredAt: serverTimestamp()
        });

        alert("Order completed and customer notified!");
        window.location.href = "./history.html"; 
    } catch (e) {
        console.error("Delivery Error:", e);
        alert("Error updating order: " + e.message);
    }
};

window.toggleDrawer = () => document.getElementById('navDrawer').classList.toggle('active');
