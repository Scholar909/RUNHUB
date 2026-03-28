import { auth, db } from "./firebase-config.js";
import { sendWhatsAppAlert } from "./send-alert.js"; 

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    doc, getDoc, collection, addDoc, updateDoc, increment, onSnapshot 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";


// --- State ---
let merchantData = null;
let activeSessionData = null;
let platformFee = 25;
let packagingCost = 200;

// --- 1. Initialization ---
onAuthStateChanged(auth, (user) => {
    const params = new URLSearchParams(window.location.search);
    const mId = params.get('m');

    // Save merchant ID if provided in URL (WhatsApp link)
    if (mId) {
        localStorage.setItem("selectedMerchantId", mId);
    }

    if (!user) {
        sessionStorage.setItem("redirectAfterLogin", window.location.href);
        window.location.href = "./sign-login.html";
    } else {
        // Entry Requirement: We just need to know WHO the merchant is
        if (localStorage.getItem("selectedMerchantId")) {
            loadMerchantAndMenu();
        } else {
            window.location.href = "./home.html";
        }
    }
});

async function loadMerchantAndMenu() {
    const params = new URLSearchParams(window.location.search);
    const urlSessionId = params.get('s'); // Session from WhatsApp link
    const merchantId = localStorage.getItem("selectedMerchantId");

    try {
        // 1. Fetch Merchant Global Info
        const merchantDoc = await getDoc(doc(db, "users", merchantId));
        if (!merchantDoc.exists()) throw new Error("Merchant not found");
        merchantData = merchantDoc.data();

        // 2. Determine the Session ID to load
        // Use the link ID if available, otherwise use the merchant's current session
        const targetSessionId = urlSessionId || merchantData.currentSessionId;

        // 3. The "Safety" Check
        // Kick them out if: 
        // - Merchant is offline (isActive is false)
        // - OR they came from a WhatsApp link that is no longer the "current" one
        const isSessionStillLive = merchantData.isActive === true && 
                                   (urlSessionId ? urlSessionId === merchantData.currentSessionId : true);

        if (!isSessionStillLive || !targetSessionId) {
            alert("This delivery session is no longer active.");
            window.location.href = "./home.html";
            return;
        }

        // 4. Listen to the Session Data in Real-Time
        onSnapshot(doc(db, "merchants", merchantId, "sessions", targetSessionId), (sessionDoc) => {
            if (!sessionDoc.exists()) {
                alert("This delivery session is no longer available.");
                window.location.href = "./home.html";
                return;
            }

            activeSessionData = sessionDoc.data();

            // 5. Real-time Slot Check
            if (activeSessionData.slotsFilled >= activeSessionData.maxSlots) {
                 alert("Sorry, all slots for this session are now full.");
                 window.location.href = "./home.html";
                 return;
            }

            // This will re-run every time the merchant toggles an item!
            renderOrderUI(); 
        });

// --- 2. UI Rendering ---
function renderOrderUI() {
    // Header Info
    document.querySelector('.merchant-meta h2').innerHTML = `Order from <span class="accent">@${merchantData.username}</span>`;
    
    // Bank Details
    const bank = merchantData.bankDetails || {};
    document.querySelector('.bank-card h4').innerText = bank.bankName || "N/A";
    document.querySelector('.acc-num').innerText = bank.accountNumber || "N/A";
    document.querySelector('.acc-name').innerText = bank.accountName || "N/A";

    // Menu Items
    const menuContainer = document.querySelector('.selection-section');
    // Clear existing placeholder items but keep the header
    menuContainer.innerHTML = '<h3>Select Items</h3>';

    // Add Packaging/Food Pack toggle first (Requirement: default checked)
    const packDiv = document.createElement('div');
    packDiv.className = 'food-item';
    packDiv.innerHTML = `
        <div class="item-details">
            <label class="check-container">
                <input type="checkbox" id="pack-checkbox" checked onchange="updateTotal()">
                <span class="checkmark"></span>
                Food Pack (Standard)
            </label>
        </div>
        <span class="item-price">₦${packagingCost}</span>
    `;
    menuContainer.appendChild(packDiv);
    
    // Add Merchant Menu Items
    activeSessionData.menu.forEach((item, index) => {
        // ONLY render if available is not explicitly false
        if (item.available !== false) { 
            const itemDiv = document.createElement('div');
            itemDiv.className = 'food-item';
            itemDiv.innerHTML = `
                <div class="item-details">
                    <label class="check-container">
                        <input type="checkbox" class="menu-item-checkbox" data-index="${index}" onchange="updateTotal()">
                        <span class="checkmark"></span>
                        ${item.name}
                    </label>
                </div>
                <div class="quantity-control">
                    <button class="qty-btn" onclick="changeQty(${index}, -1)">-</button>
                    <span class="qty-val" id="qty-${index}">1</span>
                    <button class="qty-btn" onclick="changeQty(${index}, 1)">+</button>
                </div>
                <span class="item-price">₦${item.price}</span>
            `;
            menuContainer.appendChild(itemDiv);
        }
    });

    updateTotal();
}

// --- 3. Calculation Logic ---
window.changeQty = (index, delta) => {
    const qtySpan = document.getElementById(`qty-${index}`);
    let currentQty = parseInt(qtySpan.innerText);
    currentQty = Math.max(1, currentQty + delta);
    qtySpan.innerText = currentQty;
    updateTotal();
};

window.updateTotal = () => {
    let subtotal = 0;
    const itemCheckboxes = document.querySelectorAll('.menu-item-checkbox');
    const packChecked = document.getElementById('pack-checkbox').checked;

    itemCheckboxes.forEach(cb => {
        if (cb.checked) {
            const index = cb.dataset.index;
            const price = activeSessionData.menu[index].price;
            const qty = parseInt(document.getElementById(`qty-${index}`).innerText);
            subtotal += (price * qty);
        }
    });

    const delivery = activeSessionData.deliveryCharge || 0;
    const currentPackCost = packChecked ? packagingCost : 0;
    const grandTotal = subtotal + delivery + currentPackCost + platformFee;

    // Update Breakdown UI
    const rows = document.querySelectorAll('.price-row span:last-child');
    rows[0].innerText = `₦${subtotal.toLocaleString()}`; // Subtotal
    rows[1].innerText = `₦${delivery.toLocaleString()}`; // Delivery
    rows[2].innerText = `₦${currentPackCost.toLocaleString()}`; // Packaging
    rows[3].innerText = `₦${platformFee}`; // Platform
    
    document.querySelector('.total-row .accent').innerText = `₦${grandTotal.toLocaleString()}`;
};

// --- 4. Final Order Submission ---
window.submitOrder = async () => {
    const submitBtn = document.querySelector('.btn-filled');
    
    // 1. Initial UI Lock
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.6';

    try {
        const merchantId = localStorage.getItem("selectedMerchantId");
        
        // --- SECURITY CHECK: VERIFY AVAILABILITY BEFORE SAVING ---
        // We use the 'activeSessionData' which is now kept fresh by the listener
        const selectedItems = [];
        const itemCheckboxes = document.querySelectorAll('.menu-item-checkbox');
        let unavailableFound = false;

        itemCheckboxes.forEach(cb => {
            if (cb.checked) {
                const index = cb.dataset.index;
                const itemName = activeSessionData.menu[index].name;
                
                // Check if the item in our local 'activeSessionData' is marked unavailable
                // This data is synced real-time, but checking here prevents "ghost" orders
                if (activeSessionData.menu[index].available === false) {
                    unavailableFound = true;
                    alert(`Sorry, "${itemName}" was just marked unavailable by the merchant.`);
                }

                selectedItems.push({
                    name: itemName,
                    price: activeSessionData.menu[index].price,
                    qty: parseInt(document.getElementById(`qty-${index}`).innerText)
                });
            }
        });

        if (unavailableFound) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            return; // Stop the order from being created
        }
        // --- END OF SECURITY CHECK ---

        // Proceed with your existing code (fetching location, customer data, etc.)
        if (selectedItems.length === 0 && !document.getElementById('pack-checkbox').checked) {
            alert("Please select at least one item to order.");
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            return;
        }

    try {
        const merchantId = localStorage.getItem("selectedMerchantId");
        const customerSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
        const customerData = customerSnap.exists() ? customerSnap.data() : {};
        const customerUsername = customerData.username || "Guest";
        const totalAmountText = document.querySelector('.total-row .accent').innerText;
        const totalAmount = parseInt(totalAmountText.replace(/[^0-9]/g, ''));
        const customerLoc = await getCustomerLocation();

        const orderObj = {
            customerId: auth.currentUser.uid,
            merchantId: merchantId,
            merchantName: merchantData.username,
            items: selectedItems,
            hasPack: document.getElementById('pack-checkbox').checked,
            total: totalAmount,
            deliveryCharge: activeSessionData.deliveryCharge,
            status: "pending",
            timestamp: Date.now(),
            route: `${merchantData.fromLocation} to ${merchantData.toLocation}`,
            customerLocation: customerLoc // <--- store as object
        };

        // 1. Save Order
        const orderRef = await addDoc(collection(db, "orders"), orderObj);
        
        const orderId = orderRef.id;

        // 2. Increment Slots Filled
        const merchantRef = doc(db, "users", merchantId);
        const sessionRef = doc(db, "merchants", merchantId, "sessions", merchantData.currentSessionId);

        await updateDoc(merchantRef, { slotsFilled: increment(1) });
        await updateDoc(sessionRef, { slotsFilled: increment(1) });

        try {
            // Check if THIS specific merchant has alerts enabled
            const alertRef = doc(db, "merchant_alerts", merchantId);
            const alertSnap = await getDoc(alertRef);

            if (alertSnap.exists()) {
                const alertData = alertSnap.data();

                if (alertData.enabled) {
                    const message = `*New Order Received — NOVAHUB* 🔔
Order ID: ${orderId}
Customer: @${customerUsername}
Total: ₦${totalAmount.toLocaleString()}
Route: ${orderObj.route}

Please confirm the payment, then log in to your dashboard to Approve or Decline the order.`;

                    // Send to the merchant's saved phone number
                    await sendWhatsAppAlert(merchantId, message, "merchant_alerts"); 
                }
            }
        } catch (alertErr) {
            console.error("Alert failed to send, but order was placed:", alertErr);
            // We don't alert the customer if the merchant's notification fails
        }

        alert("Order Sent! Awaiting Merchant Approval.");
        window.location.href = "./history.html";

    } catch (e) {
        console.error(e);
        alert("Failed to process order. Please try again.");

        // Re-enable button if order fails
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
    }
};

async function getCustomerLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject("Geolocation not supported");
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            },
            (err) => reject(err.message)
        );
    });
}

// --- 5. Navigation ---
document.querySelector('.close-btn').onclick = () => window.location.href = "./home.html";
document.querySelector('.btn-outline').onclick = () => window.location.href = "./home.html";
document.querySelector('.btn-filled').onclick = submitOrder;
