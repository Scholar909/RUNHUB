import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    doc, getDoc, collection, addDoc, updateDoc, increment 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- State ---
let merchantData = null;
let activeSessionData = null;
let platformFee = 50;
let packagingCost = 200;

// --- 1. Initialization ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "sign-login.html";
    } else {
        loadMerchantAndMenu();
    }
});

async function loadMerchantAndMenu() {
    const merchantId = localStorage.getItem("selectedMerchantId");
    if (!merchantId) {
        alert("No merchant selected.");
        window.location.href = "home.html";
        return;
    }

    try {
        // Fetch Merchant Global Info
        const merchantDoc = await getDoc(doc(db, "users", merchantId));
        if (!merchantDoc.exists()) throw new Error("Merchant not found");
        merchantData = merchantDoc.data();

        // Fetch the specific Live Session
        const sessionDoc = await getDoc(doc(db, "merchants", merchantId, "sessions", merchantData.currentSessionId));
        if (!sessionDoc.exists()) throw new Error("Session is no longer active");
        activeSessionData = sessionDoc.data();

        renderOrderUI();
    } catch (error) {
        console.error(error);
        alert("Error loading order page: " + error.message);
        window.location.href = "home.html";
    }
}

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

    const delivery = merchantData.deliveryCharge || 0;
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
    const selectedItems = [];
    const itemCheckboxes = document.querySelectorAll('.menu-item-checkbox');
    
    itemCheckboxes.forEach(cb => {
        if (cb.checked) {
            const index = cb.dataset.index;
            selectedItems.push({
                name: activeSessionData.menu[index].name,
                price: activeSessionData.menu[index].price,
                qty: parseInt(document.getElementById(`qty-${index}`).innerText)
            });
        }
    });

    if (selectedItems.length === 0 && !document.getElementById('pack-checkbox').checked) {
        alert("Please select at least one item to order.");
        return;
    }

    try {
        const totalAmountText = document.querySelector('.total-row .accent').innerText;
        const totalAmount = parseInt(totalAmountText.replace(/[^0-9]/g, ''));

        const orderObj = {
            customerId: auth.currentUser.uid,
            merchantId: localStorage.getItem("selectedMerchantId"),
            merchantName: merchantData.username,
            items: selectedItems,
            hasPack: document.getElementById('pack-checkbox').checked,
            total: totalAmount,
            deliveryCharge: merchantData.deliveryCharge,
            status: "pending",
            timestamp: Date.now(),
            route: `${merchantData.fromLocation} to ${merchantData.toLocation}`
        };

        // 1. Save Order
        await addDoc(collection(db, "orders"), orderObj);

        // 2. Increment Slots Filled (Both in User doc and Session doc)
        const mId = localStorage.getItem("selectedMerchantId");
        const merchantRef = doc(db, "users", mId);
        const sessionRef = doc(db, "merchants", mId, "sessions", merchantData.currentSessionId);

        await updateDoc(merchantRef, { slotsFilled: increment(1) });
        await updateDoc(sessionRef, { slotsFilled: increment(1) });

        alert("Order Sent! Awaiting Merchant Approval.");
        window.location.href = "history.html";

    } catch (e) {
        console.error(e);
        alert("Failed to process order. Please try again.");
    }
};

// --- 5. Navigation ---
document.querySelector('.close-btn').onclick = () => window.location.href = "home.html";
document.querySelector('.btn-outline').onclick = () => window.location.href = "home.html";
document.querySelector('.btn-filled').onclick = submitOrder;
