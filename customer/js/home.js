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
        localStorage.removeItem("deliveryLocation");
        localStorage.removeItem("selectedMerchantId");
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
        where("isActive", "==", true) 
    );

    onSnapshot(q, async (snapshot) => {
        const merchantPromises = snapshot.docs.map(async (userDoc) => {
            const mData = userDoc.data();
            const mId = userDoc.id;

            // If the merchant has a current session, fetch its LIVE slot count
            if (mData.currentSessionId) {
                const sessionRef = doc(db, "merchants", mId, "sessions", mData.currentSessionId);
                const sessionSnap = await getDoc(sessionRef);
                
                if (sessionSnap.exists()) {
                    const sData = sessionSnap.data();
                    // Override the user-level slots with the actual Session-level slots
                    return { 
                        id: mId, 
                        ...mData, 
                        slotsFilled: sData.slotsFilled || 0,
                        maxSlots: sData.maxSlots || mData.maxSlots 
                    };
                }
            }
            return { id: mId, ...mData };
        });

        const resolvedMerchants = await Promise.all(merchantPromises);
        
        // Filter out full slots and update the global state
        merchants = resolvedMerchants.filter(m => m.slotsFilled < m.maxSlots);
        
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
        grid.innerHTML = `<div class="empty-state">No merchants available.</div>`;
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

// --- Global variables for the modal ---
let pendingMerchantId = null;

/**
 * Triggered when "Order Now" is clicked.
 * Instead of redirecting immediately, it opens the prompt.
 */
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

    if (type === 'room') {
        // Fetch saved room data from current user's profile
        const user = auth.currentUser;
        if (!user) return;

        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            finalAddress = userDoc.data().hostelLocation;
        } else {
            alert("Could not find saved room data.");
            return;
        }
    } else {
        // Custom address logic
        const input = document.getElementById('customAddress').value.trim();
        if (input.length < 2) {
            alert("Please provide a more specific address for the merchant to find you.");
            return;
        }
        finalAddress = input;
    }

    // Save selection and proceed
    localStorage.setItem("selectedMerchantId", pendingMerchantId);
    localStorage.setItem("deliveryLocation", finalAddress); // Store this for the order page
    
    window.location.href = "./order-modal.html";
};

function generateStars(rating) {
    let stars = "";
    for (let i = 0; i < 5; i++) {
        stars += i < Math.floor(rating) ? "⭐" : "☆";
    }
    return stars;
}
