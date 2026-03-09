import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    collection, query, where, onSnapshot, orderBy, limit, doc, getDoc 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- State ---
let activeTab = 'sessions';
const copyCounts = JSON.parse(localStorage.getItem('runhub_copy_counts') || '{}');

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
    // 1. Listen for Active Sessions across ALL merchants
    // We query 'users' where role is merchant and isActive is true
    const sessionQuery = query(
        collection(db, "users"),
        where("role", "==", "merchant"),
        where("isActive", "==", true)
    );

    onSnapshot(sessionQuery, (snapshot) => {
        renderSessions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Listen for Latest Ratings
    const ratingsQuery = query(
        collection(db, "ratings"),
        orderBy("timestamp", "desc"),
        limit(20)
    );

    onSnapshot(ratingsQuery, (snapshot) => {
        renderRatings(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

// --- Renderers ---

function renderSessions(merchants) {
    const container = document.getElementById('sessionsTab');
    if (merchants.length === 0) {
        container.innerHTML = `<p class="hero-description">No active delivery sessions right now.</p>`;
        return;
    }

    container.innerHTML = merchants.map(m => {
        const storageKey = `session_${m.id}_${m.currentSessionId}`;
        const count = m.slotsFilled === 0 ? 0 : (copyCounts[storageKey] || 0);
        
        // CORRECTED LINK: Added /customer/ to the path
        const waText = `*AVAILABLE DELIVERIES*\n` +
                       `Merchant: ${m.username}\n` +
                       `From: ${m.fromLocation}\n` +
                       `To: ${m.toLocation}\n` +
                       `Delivery fee: ₦${m.deliveryCharge}\n` +
                       `Limit: ${m.slotsFilled}/${m.maxSlots} slots\n` +
                       `Link: https://scholar909.github.io/RUNHUB/customer/order-modal.html?m=${m.id}&s=${m.currentSessionId}`;

        return `
            <div class="copy-card">
                <div class="copy-title">@${m.username} Session</div>
                <div class="copy-line">${m.fromLocation} → ${m.toLocation}</div>
                <button class="copy-btn" onclick="copyToClipboard(\`${waText}\`, '${storageKey}', this)">
                    Copy for WhatsApp ${count > 0 ? `(${count})` : ''}
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
                       `By: ${r.customerName}\n` +
                       `On: @${r.merchantUsername}\n` +
                       `Stars: ${r.stars}/5\n` +
                       `Review: ${r.review || 'No comment'}\n` +
                       `Time: ${dateStr}`;

        return `
            <div class="copy-card">
                <div class="copy-title">Review for @${r.merchantUsername}</div>
                <div class="copy-line">"${r.review || 'No comment'}" - ${r.stars} Stars</div>
                <button class="copy-btn" onclick="copyToClipboard(\`${waText}\`, '${storageKey}', this)">
                    Copy Review ${count > 0 ? `(${count})` : ''}
                </button>
            </div>
        `;
    }).join('');
}

// --- Actions ---

window.copyToClipboard = (text, storageKey, btn) => {
    navigator.clipboard.writeText(text).then(() => {
        // Update Count
        copyCounts[storageKey] = (copyCounts[storageKey] || 0) + 1;
        localStorage.setItem('runhub_copy_counts', JSON.stringify(copyCounts));
        
        // Visual Feedback
        const originalText = btn.innerText;
        btn.innerText = "COPIED!";
        btn.style.background = "var(--success)";
        
        setTimeout(() => {
            btn.innerText = `Copy for WhatsApp (${copyCounts[storageKey]})`;
            btn.style.background = "var(--accent)";
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
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
