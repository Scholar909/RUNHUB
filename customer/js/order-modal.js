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

onAuthStateChanged(auth, (user) => {
    const params = new URLSearchParams(window.location.search);
    const mId = params.get('m');
    if (mId) localStorage.setItem("selectedMerchantId", mId);

    if (!user) {
        sessionStorage.setItem("redirectAfterLogin", window.location.href);
        window.location.href = "./sign-login.html";
    } else {
        if (localStorage.getItem("selectedMerchantId")) {
            loadMerchantAndMenu();
        } else {
            window.location.href = "./home.html";
        }
    }
});

async function loadMerchantAndMenu() {
    const params = new URLSearchParams(window.location.search);
    const urlSessionId = params.get('s');
    const merchantId = localStorage.getItem("selectedMerchantId");

    try {
        const merchantDoc = await getDoc(doc(db, "users", merchantId));
        if (!merchantDoc.exists()) throw new Error("Merchant not found");
        merchantData = merchantDoc.data();

        const targetSessionId = urlSessionId || merchantData.currentSessionId;
        const isSessionStillLive = merchantData.isActive === true && 
                                   (urlSessionId ? urlSessionId === merchantData.currentSessionId : true);

        if (!isSessionStillLive || !targetSessionId) {
            alert("This delivery session is no longer active.");
            window.location.href = "./home.html";
            return;
        }

        // --- REAL-TIME LISTENER ---
        onSnapshot(doc(db, "merchants", merchantId, "sessions", targetSessionId), (sessionDoc) => {
            if (!sessionDoc.exists()) {
                alert("This delivery session is no longer available.");
                window.location.href = "./home.html";
                return;
            }

            activeSessionData = sessionDoc.data();

            if (activeSessionData.slotsFilled >= activeSessionData.maxSlots) {
                 alert("Sorry, all slots for this session are now full.");
                 window.location.href = "./home.html";
                 return;
            }

            renderOrderUI(); // Re-renders whenever availability changes
        });

    } catch (e) {
        console.error("Initialization error:", e);
        alert("Error loading menu. Please try again.");
    }
}

function renderOrderUI() {
    document.querySelector('.merchant-meta h2').innerHTML = `Order from <span class="accent">@${merchantData.username}</span>`;
    
    const bank = merchantData.bankDetails || {};
    document.querySelector('.bank-card h4').innerText = bank.bankName || "N/A";
    document.querySelector('.acc-num').innerText = bank.accountNumber || "N/A";
    document.querySelector('.acc-name').innerText = bank.accountName || "N/A";

    const menuContainer = document.querySelector('.selection-section');
    menuContainer.innerHTML = '<h3>Select Items</h3>';

    // Packaging Toggle
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
    
    // Filtered Menu Items
    activeSessionData.menu.forEach((item, index) => {
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

// Global functions for HTML onclicks
window.changeQty = (index, delta) => {
    const qtySpan = document.getElementById(`qty-${index}`);
    if (!qtySpan) return;
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

    const rows = document.querySelectorAll('.price-row span:last-child');
    if (rows.length >= 4) {
        rows[0].innerText = `₦${subtotal.toLocaleString()}`;
        rows[1].innerText = `₦${delivery.toLocaleString()}`;
        rows[2].innerText = `₦${currentPackCost.toLocaleString()}`;
        rows[3].innerText = `₦${platformFee}`;
    }
    document.querySelector('.total-row .accent').innerText = `₦${grandTotal.toLocaleString()}`;
};

window.submitOrder = async () => {
    const submitBtn = document.querySelector('.btn-filled');
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.6';

    try {
        const merchantId = localStorage.getItem("selectedMerchantId");
        const selectedItems = [];
        const itemCheckboxes = document.querySelectorAll('.menu-item-checkbox');
        let unavailableFound = false;

        itemCheckboxes.forEach(cb => {
            if (cb.checked) {
                const index = cb.dataset.index;
                const item = activeSessionData.menu[index];
                
                // Final Availability Check
                if (item.available === false) {
                    unavailableFound = true;
                    alert(`Sorry, "${item.name}" was just marked unavailable.`);
                }

                selectedItems.push({
                    name: item.name,
                    price: item.price,
                    qty: parseInt(document.getElementById(`qty-${index}`).innerText)
                });
            }
        });

        if (unavailableFound) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            return;
        }

        if (selectedItems.length === 0 && !document.getElementById('pack-checkbox').checked) {
            alert("Please select at least one item.");
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            return;
        }

        const customerSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
        const customerData = customerSnap.exists() ? customerSnap.data() : {};
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
            customerLocation: customerLoc
        };

        const orderRef = await addDoc(collection(db, "orders"), orderObj);
        
        // Update Slots
        const merchantRef = doc(db, "users", merchantId);
        const sessionRef = doc(db, "merchants", merchantId, "sessions", merchantData.currentSessionId);
        await updateDoc(merchantRef, { slotsFilled: increment(1) });
        await updateDoc(sessionRef, { slotsFilled: increment(1) });

        // WhatsApp Notification
        const alertSnap = await getDoc(doc(db, "merchant_alerts", merchantId));
        if (alertSnap.exists() && alertSnap.data().enabled) {
            const msg = `*New Order - NOVAHUB*\nID: ${orderRef.id}\nCustomer: @${customerData.username || 'Guest'}\nTotal: ₦${totalAmount.toLocaleString()}\nRoute: ${orderObj.route}`;
            await sendWhatsAppAlert(merchantId, msg, "merchant_alerts");
        }

        alert("Order Sent! Awaiting Merchant Approval.");
        window.location.href = "./history.html";

    } catch (e) {
        console.error(e);
        alert("Failed to process order.");
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
    }
};

async function getCustomerLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject("Geolocation not supported");
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => reject(err.message)
        );
    });
}

document.querySelector('.close-btn').onclick = () => window.location.href = "./home.html";
document.querySelector('.btn-outline').onclick = () => window.location.href = "./home.html";
document.querySelector('.btn-filled').onclick = window.submitOrder;
