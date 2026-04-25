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
        const packPrice = 200;
        
        // --- 1. Categorization Logic ---
        let totals = { food: 0, drink: 0, snacks: 0 };
        let itemsHtml = '';
        const listContainer = document.getElementById('itemList');

        // Add Pack to Food if it exists
        if (order.hasPack) {
            totals.food += packPrice;
            itemsHtml += `<div class="item-row"><span>1x Food Pack (Standard)</span><span>₦${packPrice}</span></div>`;
        }

        // Group items and calculate category totals
        (order.items || []).forEach(item => {
            const itemTotal = item.price * item.qty;
            const cat = (item.category || 'food').toLowerCase();
            if (totals.hasOwnProperty(cat)) totals[cat] += itemTotal;
            
            itemsHtml += `<div class="item-row"><span>${item.qty}x ${item.name}</span><span>₦${itemTotal.toLocaleString()}</span></div>`;
        });
        listContainer.innerHTML = itemsHtml;

        // --- 2. Calculate Final Values ---
        const itemsSubtotal = totals.food + totals.drink + totals.snacks;
        const firstTotal = order.total; // total sent by customer
        const deliveryCommission = delivery * 0.10;
        const merchantEarning = firstTotal - platformFee - deliveryCommission - itemsSubtotal;

        // --- 3. UI Update: Category Breakdown ---
        const breakdownContainer = document.getElementById('categoryBreakdown');
        let breakdownHtml = '';
        
        // Only show categories that have items
        if (totals.food > 0) breakdownHtml += `<div class="price-row"><span>Food Total ${order.hasPack ? '(incl. Pack)' : ''}</span><span>₦${totals.food.toLocaleString()}</span></div>`;
        if (totals.drink > 0) breakdownHtml += `<div class="price-row"><span>Drink Total</span><span>₦${totals.drink.toLocaleString()}</span></div>`;
        if (totals.snacks > 0) breakdownHtml += `<div class="price-row"><span>Snacks Total</span><span>₦${totals.snacks.toLocaleString()}</span></div>`;
        
        breakdownContainer.innerHTML = breakdownHtml;

        // --- 4. UI Update: Main Summary ---
        document.getElementById('subtotal').innerText = `₦${itemsSubtotal.toLocaleString()}`;
        document.getElementById('delivery').innerText = `₦${delivery.toLocaleString()}`;
        document.getElementById('firstTotal').innerText = `₦${firstTotal.toLocaleString()}`;

        // Fetch Customer Info
        // --- Updated Customer Info Logic in view-rec.js ---
        
        // 1. Determine Display Name and Username
        let displayCustName = order.customerName || "Guest User";
        let displayCustUser = order.customerUsername || "guest";
        let displayCustPhone = order.customerPhone || "No Phone";
        
        // 2. Identify the correct delivery address
        // Priority: Order Address -> Guest Location -> Profile Location
        const displayAddress = order.deliveryAddress || order.deliveryAddress; 
        
        // Update the UI
        document.getElementById('recId').innerText = `#RH-${currentOrderId.slice(-5).toUpperCase()}`;
        document.getElementById('custUser').innerText = `@${displayCustUser}`;
        
        // Handle the Guest Tag visually
        const guestTag = order.isGuest ? `<span style="background: #ff9500; color: #000; padding: 2px 8px; border-radius: 4px; font-size: 0.6rem; font-weight: bold; margin-left: 5px;">• GUEST</span>` : '';
        
        document.getElementById('custName').innerHTML = `
            <div style="margin-top: 10px;">
                <p style="font-size: 0.85rem; color: #ffffff;">Phone/ID: ${displayCustPhone} ${guestTag}</p>
                <br>
                <p><b>Customer:</b> ${displayCustName}</p>
                <p style="font-size: 0.9em; color: var(--text-dim);">
                    <span style="color: var(--accent)">●</span> Pick-up: ${order.fromLocation || 'Hub'}<br>
                    <span style="color: #28a745">●</span> Delivery: ${displayAddress}
                </p>
            </div>`;


        const isMerchant = user.uid === order.merchantId;
        if (isMerchant) {
            document.getElementById('platformFee').innerText = `-₦${platformFee}`;
            document.getElementById('deliveryCommission').innerText = `-₦${deliveryCommission.toLocaleString()}`;
            document.getElementById('adminFeeRow').style.display = 'flex';
            document.getElementById('totalLabel').innerText = "YOU EARNED";
            document.getElementById('grandTotal').innerText = `₦${merchantEarning.toLocaleString()}`;
            
            // Save categorized data back to order doc for History Summary (Silent Update)
            // This ensures the "History Select Info" feature works correctly!
            updateDoc(doc(db, "orders", currentOrderId), {
                foodTotal: totals.food,
                drinkTotal: totals.drink,
                snackTotal: totals.snacks
            });

        } else {
            document.getElementById('adminFeeRow').style.display = 'none';
            document.getElementById('totalLabel').innerText = "TOTAL PAID";
            document.getElementById('grandTotal').innerText = `₦${firstTotal.toLocaleString()}`;
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
