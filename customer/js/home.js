import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    collection, query, where, onSnapshot, doc, getDoc 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- State Management ---
let merchants = [];
let longClickTimer;

// --- 1. Auth & Initialization ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "sign-login.html";
    } else {
        listenToActiveMerchants();
    }
});

// --- 2. Real-time Merchant Listener ---
/**
 * Rule: Only merchants who have a session toggled ON 
 * and whose slots are NOT full appear.
 */
function listenToActiveMerchants() {
    const q = query(
        collection(db, "users"),
        where("isActive", "==", true) // Merchant toggled session ON
    );

    onSnapshot(q, (snapshot) => {
        merchants = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(m => m.slotsFilled < m.maxSlots); // Filter out full slots
        
        renderMerchantGrid();
    });
}

// --- 3. UI Rendering ---
function renderMerchantGrid() {
    const grid = document.getElementById('merchantGrid');
    const searchFrom = document.getElementById('searchFrom').value.toLowerCase();
    const searchTo = document.getElementById('searchTo').value.toLowerCase();

    const filtered = merchants.filter(m => {
        const matchFrom = m.fromLocation?.toLowerCase().includes(searchFrom);
        const matchTo = m.toLocation?.toLowerCase().includes(searchTo);
        return matchFrom && matchTo;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="empty-state">No merchants available for this route.</div>`;
        return;
    }

    grid.innerHTML = filtered.map(m => {
        const progress = (m.slotsFilled / m.maxSlots) * 100;
        return `
            <div class="trust-card merchant-card" 
                 onmousedown="handleStartClick('${m.phoneNumber}')" 
                 onmouseup="handleEndClick()" 
                 onmouseleave="handleEndClick()"
                 ontouchstart="handleStartClick('${m.phoneNumber}')" 
                 ontouchend="handleEndClick()">
                <div class="card-tag">AVAILABLE</div>
                <div class="merchant-header">
                    <h3 class="merchant-name-label">@${m.username}</h3>
                    <div class="rating">
                        ${generateStars(m.rating || 5)} 
                        (${(m.rating || 5.0).toFixed(1)}) 
                        <span style="font-size: 0.85rem; color: var(--text-dim); margin-left: 2px;">
                            (${m.ratingCount || 0})
                        </span>
                    </div>
                </div>

                <div class="route">
                    <p><strong>From:</strong> ${m.fromLocation}</p>
                    <p><strong>To:</strong> ${m.toLocation}</p>
                </div>
                <div class="delivery-meta">
                    <span class="charge">₦${m.deliveryCharge} Delivery</span>
                </div>
                <div class="slot-counter">
                    <div class="slot-bar">
                        <div class="fill" style="width: ${progress}%;"></div>
                    </div>
                    <p>Slots: ${m.slotsFilled}/${m.maxSlots}</p>
                </div>
                <button class="btn btn-filled w-100" onclick="openOrderModal('${m.id}')">Order Now</button>
            </div>
        `;
    }).join('');
}

// --- 4. Special Features (Long Click & Search) ---

/**
 * Long click on merchant name reveals WhatsApp number for coordination.
 */

window.handleStartClick = (phone) => {
    longClickTimer = setTimeout(() => {

        // small vibration feedback (if supported)
        if (navigator.vibrate) navigator.vibrate(80);

        alert(`Merchant Contact: ${phone}\n(Use for urgent coordination only)`);

    }, 3000); // 3 seconds
};

window.handleEndClick = () => {
    clearTimeout(longClickTimer);
};

// Search Listeners
document.getElementById('searchFrom').addEventListener('input', renderMerchantGrid);
document.getElementById('searchTo').addEventListener('input', renderMerchantGrid);

// --- 5. Navigation & Global Helpers ---
window.toggleDrawer = () => {
    document.getElementById('navDrawer').classList.toggle('active');
};

window.handleLogout = async () => {
    if (confirm("Logout of RUNHUB?")) {
        await signOut(auth);
        window.location.href = "sign-login.html";
    }
};

/**
 * Open Order Modal (Functionality placeholder for the modal popup)
 * [cite: 3, 4]
 */
window.openOrderModal = (merchantId) => {
    // Save the selected merchant ID to local storage
    localStorage.setItem("selectedMerchantId", merchantId);
    // Redirect to the standalone order page
    window.location.href = "order-modal.html";
};


function generateStars(rating) {
    let stars = "";
    for (let i = 0; i < 5; i++) {
        stars += i < Math.floor(rating) ? "⭐" : "☆";
    }
    return stars;
}
