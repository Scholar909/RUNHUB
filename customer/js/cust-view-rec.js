import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

let currentOrderId = localStorage.getItem("viewingOrderId");

onAuthStateChanged(auth, (user) => {
    if (user && currentOrderId) {
        loadOrderDetails();
    } else {
        window.location.href = "sign-login.html";
    }
});

async function loadOrderDetails() {
    try {
        const orderDoc = await getDoc(doc(db, "orders", currentOrderId));
        if (!orderDoc.exists()) return;
        const order = orderDoc.data();

        // 1. Fetch Merchant Info (Since Customer is viewing this)
        const merchDoc = await getDoc(doc(db, "users", order.merchantId));
        const merchant = merchDoc.exists() ? merchDoc.data() : {};

        // 2. UI Header & Status
        document.getElementById('recId').innerText = `#RH-${currentOrderId.slice(-5).toUpperCase()}`;
        document.getElementById('merchantHandle').innerText = `@${merchant.username || 'merchant'}`;
        document.getElementById('merchantFullName').innerText = merchant.fullName || 'RUNHUB Merchant';
        
        const badge = document.getElementById('statusBadge');
        const status = order.status;
        badge.innerText = status.toUpperCase();
        
        // Status Styling
        if (status === 'delivered') badge.className = 'status-badge status-delivered';
        else if (status === 'declined') badge.className = 'status-badge status-error';
        else badge.className = 'status-badge status-pending';

        // 3. Item List
        const listContainer = document.getElementById('itemList');
        let itemsHtml = '';
        if (order.hasPack) itemsHtml += `<div class="item-row"><span>1x Food Pack (Standard)</span><span>₦200</span></div>`;
        
        order.items.forEach(item => {
            itemsHtml += `
                <div class="item-row">
                    <span>${item.qty}x ${item.name}</span>
                    <span>₦${(item.price * item.qty).toLocaleString()}</span>
                </div>`;
        });
        listContainer.innerHTML = itemsHtml;

        // 4. Financials (Customer View)
        // Subtotal = Grand Total - Delivery - Pack - Platform Fee
        const packCost = order.hasPack ? 200 : 0;
        const subtotalValue = order.total - order.deliveryCharge - packCost - 50;

        document.getElementById('subtotal').innerText = `₦${subtotalValue.toLocaleString()}`;
        document.getElementById('delivery').innerText = `₦${order.deliveryCharge.toLocaleString()}`;
        document.getElementById('packaging').innerText = `₦${packCost.toLocaleString()}`;
        document.getElementById('grandTotal').innerText = `₦${order.total.toLocaleString()}`;

        // 5. Timeline Logic
        renderTimeline(order);

    } catch (e) {
        console.error("Error loading receipt:", e);
    }
}

function renderTimeline(order) {
    const timeline = document.getElementById('timeline');
    let html = `<h3>Order Journey</h3>`;

    // Order Placed
    html += createTimelineItem(order.timestamp, "Order Placed & Payment Sent", "completed");

    // Approved Time
    if (order.approvedAt) {
        html += createTimelineItem(order.approvedAt.toMillis ? order.approvedAt.toMillis() : order.approvedAt, "Accepted by Merchant", "completed");
    }

    // Delivered Time
    if (order.status === 'delivered' && order.deliveredAt) {
        html += createTimelineItem(order.deliveredAt.toMillis(), "Order Delivered", "completed");
    }

    // Declined/Refunded Time
    if (order.status === 'declined' && order.declinedAt) {
        html += createTimelineItem(order.declinedAt.toMillis(), "Order Declined & Refunded", "completed");
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
