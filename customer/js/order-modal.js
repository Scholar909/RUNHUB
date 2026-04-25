import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    doc, getDoc, collection, addDoc, updateDoc, increment, onSnapshot 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";


// --- State ---
let merchantData = null;
let activeSessionData = null;
let previousMenu = [];
let platformFee = 25;
let packagingCost = 200;
let pendingMerchantId = null; 

// --- Updated State ---
let isGuest = false;
let guestData = null;

onAuthStateChanged(auth, async (user) => {
    const params = new URLSearchParams(window.location.search);
    const mFromUrl = params.get('m');
    
    if (mFromUrl) {
        localStorage.setItem("selectedMerchantId", mFromUrl);
    }
    
    pendingMerchantId = localStorage.getItem("selectedMerchantId");

    // 1. Determine if we are in a Guest Session
    const isGuestSession = localStorage.getItem("isGuestSession") === "true";

    if (isGuestSession) {
        isGuest = true;
        guestData = JSON.parse(localStorage.getItem("guestTempData"));
        
        if (!pendingMerchantId) {
            alert("Merchant reference lost. Returning home.");
            window.location.href = "./home.html";
            return;
        }

        // HIDE all modals and SHOW the main container
        document.getElementById('gatekeeperModal').style.display = 'none';
        document.getElementById('guestFormModal').style.display = 'none';
        document.querySelector('.modal-container').style.display = 'flex';
        
        loadMerchantAndMenu();
        return; // Exit here for guests
    }

    // 2. If NOT a guest and NOT logged in, show gatekeeper
    if (!user) {
        document.getElementById('gatekeeperModal').style.display = 'flex';
        return;
    }

    // 3. Regular logged-in user logic
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.data();

    if (!userDoc.exists() || userData.role !== 'customer') {
        alert("Access Denied. Only customer accounts can place orders.");
        localStorage.removeItem("selectedMerchantId"); 
        window.location.href = "./sign-login.html";
        return;
    }

    // Hide gatekeeper for logged-in users
    document.getElementById('gatekeeperModal').style.display = 'none';
    
    const deliveryLoc = localStorage.getItem("deliveryLocation");

    if (pendingMerchantId && !deliveryLoc) {
        document.getElementById('locationModal').style.display = 'flex';
    } else if (pendingMerchantId && deliveryLoc) {
        document.querySelector('.modal-container').style.display = 'flex';
        loadMerchantAndMenu();
    }
});




window.openOrderModal = (merchantId) => {
    pendingMerchantId = merchantId;
    document.getElementById('locationModal').style.display = 'flex';
};

window.closeLocationModal = () => {
    document.getElementById('locationModal').style.display = 'none';
};

/**
 * Handles the selection of location
 */
window.selectLocation = async (type) => {
    let finalAddress = "";
    // Re-verify merchant ID from storage if the local variable is lost
    const mId = pendingMerchantId || localStorage.getItem("selectedMerchantId");

    if (type === 'room') {
        const user = auth.currentUser;
        if (!user) return;

        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            finalAddress = userDoc.data().hostelLocation;
            if (!finalAddress) {
                alert("No hostel location found in your profile.");
                localStorage.setItem("redirectAfterLogin", window.location.href);
                window.location.href = "./sign-login.html";
                return;
            }
        }
    } else {
        const input = document.getElementById('customAddress').value.trim();
        if (input.length < 2) {
            alert("Please enter a valid address.");
            return;
        }
        finalAddress = input;
    }

    localStorage.setItem("selectedMerchantId", mId);
    localStorage.setItem("deliveryLocation", finalAddress);

    document.getElementById('locationModal').style.display = 'none';
    document.querySelector('.modal-container').style.display = 'flex';
    loadMerchantAndMenu(); 
};

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
                alert("This delivery session has been deleted.");
                window.location.href = "./home.html";
                return;
            }

            const newData = sessionDoc.data();

            // --- MENU CHANGE DETECTION ---
            if (previousMenu.length > 0) {
                let changes = [];

                // 1. Check for newly added items
                newData.menu.forEach(newItem => {
                    const oldItem = previousMenu.find(m => m.name === newItem.name);
                    // If it wasn't there before OR was unavailable and now is available
                    if ((!oldItem && newItem.available !== false) || (oldItem && oldItem.available === false && newItem.available !== false)) {
                        changes.push(`➕ Added: ${newItem.name}`);
                    }
                });

                // 2. Check for removed or toggled-off items
                previousMenu.forEach(oldItem => {
                    const newItem = newData.menu.find(m => m.name === oldItem.name);
                    // If it's gone from the list OR was available and now is unavailable
                    if ((!newItem && oldItem.available !== false) || (newItem && newItem.available === false && oldItem.available !== false)) {
                        changes.push(`❌ Removed: ${oldItem.name}`);
                    }
                });

                if (changes.length > 0) {
                    alert(`The merchant just updated the menu:\n\n${changes.join('\n')}\n\nPlease review your selection before paying.`);
                }
            }

            // Update state
            activeSessionData = newData;
            previousMenu = JSON.parse(JSON.stringify(newData.menu)); // Deep copy to prevent reference issues

            if (activeSessionData.isActive === false) {
                alert("This delivery session is no longer active.");
                window.location.href = "./home.html";
                return;
            }

            if (activeSessionData.slotsFilled >= activeSessionData.maxSlots) {
                 alert("Sorry, all slots for this session are now full.");
                 window.location.href = "./home.html";
                 return;
            }

            renderOrderUI(); 
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
    startPaymentTimer(50);
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
    if (submitBtn.disabled) return; 
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.6';

    try {
        const merchantId = localStorage.getItem("selectedMerchantId");
        const selectedItems = [];
        const itemCheckboxes = document.querySelectorAll('.menu-item-checkbox');
        let unavailableItems = [];

        // Check each selected item against the most recent 'activeSessionData'
        itemCheckboxes.forEach(cb => {
            if (cb.checked) {
                const index = cb.dataset.index;
                const item = activeSessionData.menu[index];

                // If merchant toggled this specific item off while customer was on the page
                if (item.available === false) {
                    unavailableItems.push(item.name);
                } else {
                    selectedItems.push({
                        name: item.name,
                        price: item.price,
                        category: item.category || "food",
                        qty: parseInt(document.getElementById(`qty-${index}`).innerText)
                    });
                }
            }
        });

        // If any selected items are now unavailable, block the order
        if (unavailableItems.length > 0) {
            alert(`The following items are no longer available: ${unavailableItems.join(", ")}. Your menu will now update.`);
            renderOrderUI(); // Refresh the UI to remove the unavailable items
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
        const customerLoc = await getCustomerLocation().catch(() => null);
        const selectedDeliveryAddress = localStorage.getItem("deliveryLocation") || "No address provided";
        
        // Determine customer details based on status
        let finalCustomerId = isGuest ? "GUEST_" + Date.now() : auth.currentUser.uid;
        let finalCustomerName = isGuest ? guestData.fullName : (merchantData.username || 'User'); 
        let finalPhone = isGuest ? guestData.phone : (customerData.phoneNumber || "No Phone");
        let finalUsername = isGuest ? guestData.fullName : (customerData.username || "Guest");
        
        const orderObj = {
            customerId: finalCustomerId,
            customerPhone: finalPhone,
            customerName: finalCustomerName,
            customerUsername: finalUsername,
            isGuest: isGuest, // <--- MERCHANT TAG
            matricNo: isGuest ? guestData.matricNo : (customerData.matricNo || "N/A"),
            merchantId: merchantId,
            merchantName: merchantData.username,
            items: selectedItems,
            hasPack: document.getElementById('pack-checkbox').checked,
            total: totalAmount,
            deliveryCharge: activeSessionData.deliveryCharge,
            status: "pending",
            timestamp: Date.now(),
            fromLocation: merchantData.fromLocation || "Merchant Hub", 
            route: `${merchantData.fromLocation} to ${merchantData.toLocation}`,
            deliveryAddress: selectedDeliveryAddress,
            // Add guest bank details for refunds
            guestBankInfo: isGuest ? guestData.bankDetails : null 
        };


        const orderRef = await addDoc(collection(db, "orders"), orderObj);
        localStorage.removeItem("deliveryLocation");

        // Update Slots
        const merchantRef = doc(db, "users", merchantId);
        const sessionRef = doc(db, "merchants", merchantId, "sessions", merchantData.currentSessionId);
        await updateDoc(merchantRef, { slotsFilled: increment(1) });
        await updateDoc(sessionRef, { slotsFilled: increment(1) });

        // WhatsApp Notification
        const alertSnap = await getDoc(doc(db, "merchant_alerts", merchantId));
        if (alertSnap.exists() && alertSnap.data().enabled) {
            const msg = `*New Order - NOVAHUB*\nID: ${orderRef.id}\nCustomer: @${customerData.username || 'Guest'}\nTotal: ₦${totalAmount.toLocaleString()}\nRoute: ${orderObj.route}`;
        }

        alert("Order Sent! Awaiting Merchant Approval.");
        if (isGuest) {
            localStorage.clear(); // Clear guest session
            alert("Since you are a guest, you can't track this order. Please screenshot this page. We recommend signing up next time!");
            window.location.href = "./sign-login.html"; // Send to signup
        } else {
            window.location.href = "./history.html";
        }

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

let countdownInterval;

function startPaymentTimer(duration) {
    const submitBtn = document.querySelector('.btn-filled');
    if (!submitBtn) return;

    // Clear any existing interval to prevent overlapping
    clearInterval(countdownInterval);

    let timer = duration;
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.6';
    submitBtn.style.cursor = 'not-allowed';

    countdownInterval = setInterval(() => {
        const minutes = Math.floor(timer / 60);
        const seconds = timer % 60;

        // Update button text to show remaining time
        submitBtn.innerText = `Confirm in ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

        if (--timer < 0) {
            clearInterval(countdownInterval);
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
            submitBtn.innerText = "Pay and Confirm Order"; // Original text
        }
    }, 1000);
}

window.showGuestForm = () => {
    document.getElementById('gatekeeperModal').style.display = 'none';
    document.getElementById('guestFormModal').style.display = 'flex';
};

window.submitGuestDetails = () => {
    const data = {
        fullName: document.getElementById('guestName').value.trim(),
        matricNo: document.getElementById('guestMatric').value.trim(),
        phone: document.getElementById('guestPhone').value.trim(),
        location: document.getElementById('guestAddress').value.trim(),
        bankDetails: {
            bankName: document.getElementById('guestBankName').value,
            accName: document.getElementById('guestAccName').value,
            accNo: document.getElementById('guestAccNum').value
        }
    };

    if (!data.fullName || !data.phone || !data.location) {
        alert("Please fill in Name, Phone, and Location.");
        return;
    }

    localStorage.setItem("isGuestSession", "true");
    localStorage.setItem("guestTempData", JSON.stringify(data));
    localStorage.setItem("deliveryLocation", data.location);
    
    window.location.reload(); // Refresh to trigger the Auth Listener Guest logic
};


document.querySelector('.close-btn').onclick = () => window.location.href = "./home.html";
document.querySelector('.btn-outline').onclick = () => window.location.href = "./home.html";
document.querySelector('.btn-filled').onclick = window.submitOrder;