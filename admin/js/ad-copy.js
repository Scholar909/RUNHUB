import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    collection, query, where, onSnapshot, orderBy, limit, doc, getDoc 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- State ---
let activeTab = 'sessions';
let copyCounts = JSON.parse(localStorage.getItem('runhub_copy_counts') || '{}');

// --- Auth Guard ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "./admin-login.html";
    } else {
        initRealtimeListeners();
    }
});

// --- Listeners ---
function initRealtimeListeners() {
    // Listen for ACTIVE merchants
    const merchantQuery = query(
        collection(db, "users"),
        where("role", "==", "merchant"),
        where("isActive", "==", true)
    );

    onSnapshot(merchantQuery, async (snapshot) => {
        const sessionPromises = snapshot.docs.map(async (merchantDoc) => {
            const mData = merchantDoc.data();
            const mId = merchantDoc.id;

            if (mData.currentSessionId) {
                // Fetch the actual session document to get the MENU and global COPY COUNT
                const sDoc = await getDoc(doc(db, "merchants", mId, "sessions", mData.currentSessionId));
                if (sDoc.exists()) {
                    return { 
                        id: mId, 
                        ...mData, 
                        menu: sDoc.data().menu, 
                        copyCount: sDoc.data().copyCount || 0,
                        sessionId: sDoc.id 
                    };
                }
            }
            return null;
        });

        const activeSessions = (await Promise.all(sessionPromises)).filter(s => s !== null);
        renderSessions(activeSessions);
    });

    // ... Ratings listener stays the same ...
}

function renderSessions(merchants) {
    const container = document.getElementById('sessionsTab');
    if (merchants.length === 0) {
        container.innerHTML = `<p class="hero-description">No active delivery sessions.</p>`;
        return;
    }

    container.innerHTML = merchants.map(m => {
        // Format the Menu Items for WhatsApp
        const menuText = m.menu
            .filter(item => item.available !== false)
            .map(item => `• ${item.name}: ₦${item.price}`)
            .join('\n');

        const waText = `*NOVAHUB DELIVERY AVAILABLE*\n` +
                       `Merchant: ${m.username}\n` +
                       `From: ${m.fromLocation}\n` +
                       `To: ${m.toLocation}\n\n` +
                       `*MENU:*\n${menuText}\n\n` +
                       `Delivery fee: ₦${m.deliveryCharge}\n` +
                       `Limit: ${m.slotsFilled}/${m.maxSlots} slots\n` +
                       `Link: https://scholar909.github.io/RUNHUB/customer/order-modal.html?m=${m.id}&s=${m.currentSessionId}`;

        return `
            <div class="copy-card">
                <div class="copy-title">@${m.username} Session</div>
                <div class="copy-line">${m.fromLocation} → ${m.toLocation}</div>
                <button class="copy-btn"
                    data-text="${encodeURIComponent(waText)}"
                    data-mid="${m.id}"
                    data-sid="${m.currentSessionId}"
                    onclick="copyToClipboard(this)">
                    Copy for WhatsApp (${m.copyCount})
                </button>
            </div>
        `;
    }).join('');
}


function renderRatings(ratings) {
    const container = document.getElementById('ratingsTab');
    
    container.innerHTML = ratings.map(r => {
        const dateStr = r.timestamp ? new Date(r.timestamp.toDate()).toLocaleDateString() : 'Just now';
        const storageKey = `rating_${r.id}`;
        const count = copyCounts[storageKey] || 0;

        const waText = `*REVIEWS*\n` +
                       `By: ${r.customerUsername}\n` +
                       `On: @${r.merchantUsername}\n` +
                       `Stars: ${r.stars}/5\n` +
                       `Review: ${r.review || 'No comment'}\n` +
                       `Time: ${dateStr}`;

        return `
            <div class="copy-card">
                <div class="copy-title">Review for @${r.merchantUsername}</div>
                <div class="copy-line">"${r.review || 'No comment'}" - ${r.stars} Stars</div>
              <button class="copy-btn"
              data-text="${encodeURIComponent(waText)}"
              data-key="${storageKey}"
              onclick="copyToClipboard(this)">
              Copy Review (${count})
              </button>
            </div>
        `;
    }).join('');
}

// --- Actions ---

import { increment, updateDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

window.copyToClipboard = async (btn) => {
    const text = decodeURIComponent(btn.dataset.text);
    const mId = btn.dataset.mid;
    const sId = btn.dataset.sid;

    try {
        await navigator.clipboard.writeText(text);
        
        // Update the count in Firebase globally
        if (mId && sId) {
            const sessionRef = doc(db, "merchants", mId, "sessions", sId);
            await updateDoc(sessionRef, {
                copyCount: increment(1)
            });
        }

        btn.innerText = "COPIED!";
        btn.style.background = "var(--success)";
        
        setTimeout(() => {
            btn.style.background = "var(--accent)";
            // The text will automatically update via the onSnapshot listener
        }, 1200);

    } catch (err) {
        console.error('Copy failed:', err);
    }
};


window.switchTab = (tab, btn) => {
    activeTab = tab;
    
    // Update button styling
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    // Toggle visibility using the .hidden class
    if (tab === 'sessions') {
        document.getElementById('sessionsTab').classList.remove('hidden');
        document.getElementById('ratingsTab').classList.add('hidden');
    } else {
        document.getElementById('sessionsTab').classList.add('hidden');
        document.getElementById('ratingsTab').classList.remove('hidden');
    }
};


// --- Standard UI Helpers ---
window.toggleDrawer = () => document.getElementById('navDrawer').classList.toggle('active');

window.handleLogout = async () => {
    try {
        await signOut(auth);
        window.location.href = "./admin-login.html";
    } catch (error) { console.error(error); }
};
