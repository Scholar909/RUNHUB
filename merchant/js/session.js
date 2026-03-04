import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    doc, getDoc, updateDoc, collection, onSnapshot, 
    addDoc, deleteDoc, query, orderBy, where, getDocs, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- State Management ---
let currentUid = null;
let sessions = [];
let editingSessionId = null;
let unsubscribeSessions = null;

// --- Enforcement Constants (Synced with Location JS) ---
const WAL_THRESHOLD = 500;
const ADMIN_FEE = 50;
const TRIAL_DAYS = 14;
const GRACE_HOURS = 24;

// --- DOM Elements ---
const sessionListView = document.getElementById('sessionListView');
const sessionFormView = document.getElementById('sessionFormView');
const menuContainer = document.getElementById('menuContainer');
const sessionGrid = document.querySelector('.session-grid');

// --- 1. Initialization & Auth Guard ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUid = user.uid;
        // Check rules before allowing the merchant to manage sessions
        await enforceRules(user.uid);
        listenToSessions();
    } else {
        window.location.href = "sign-login.html";
    }
});

// --- 2. Enforcement Logic (The "Security Guard") ---
async function enforceRules(uid) {
    if (window.location.pathname.includes("plans.html")) return;

    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    const now = new Date();
    const toJSDate = (val) => (val && typeof val.toDate === 'function') ? val.toDate() : new Date(val || 0);

    // Subscription/Trial Check
    const createdAt = toJSDate(userData.createdAt);
    let isRestricted = false;

    if (!userData.subscription) {
        const trialEnd = new Date(createdAt);
        trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
        if (now > trialEnd) isRestricted = true;
    } else {
        const expiry = toJSDate(userData.subscription.expiryDate);
        if (now > expiry) isRestricted = true;
    }

    if (isRestricted) {
        await deactivateActiveSession(uid);
        window.location.href = "./plans.html";
        return;
    }

    // Wallet/Debt Check
    if (userData.walletDueSince) {
        const dueSince = toJSDate(userData.walletDueSince);
        const hoursPassed = (now - dueSince) / (1000 * 60 * 60);
        if (hoursPassed >= GRACE_HOURS) {
            await deactivateActiveSession(uid);
            window.location.href = "./plans.html?reason=debt";
        }
    }
}

// Helper to kill sessions if restricted
async function deactivateActiveSession(uid) {
    try {
        await updateDoc(doc(db, "users", uid), { isActive: false });
        const q = query(collection(db, "merchants", uid, "sessions"), where("isActive", "==", true));
        const snap = await getDocs(q);
        const batch = [];
        snap.forEach(d => batch.push(updateDoc(d.ref, { isActive: false, lastTurnedOff: Date.now() })));
        await Promise.all(batch);
    } catch (e) { console.error("Session cleanup failed", e); }
}

// --- 3. Real-time Session Listener ---
function listenToSessions() {
    if (unsubscribeSessions) unsubscribeSessions();

    const q = query(
        collection(db, "merchants", currentUid, "sessions"),
        orderBy("timestamp", "desc")
    );

    unsubscribeSessions = onSnapshot(q, (snapshot) => {
        sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        sessions.forEach(session => {
            if (session.isActive === true && session.slotsFilled >= session.maxSlots) {
                console.log(`Session ${session.id} hit limit. Auto-toggling off.`);
                toggleSession(session.id, false, true); 
            }
        });

        renderSessions();
    }, (error) => {
        console.error("Error fetching sessions:", error);
    });
}

// --- 4. Persistent Toggle Logic ---
async function toggleSession(sessionId, targetState, isAutoOff = false) {
    try {
        const merchantRef = doc(db, "users", currentUid);
        const sessionRef = doc(db, "merchants", currentUid, "sessions", sessionId);
        
        const activeSession = sessions.find(s => s.id === sessionId);
        if (!activeSession) return;

        if (targetState === true) {
            let newSlotCount = activeSession.slotsFilled || 0;
            const now = Date.now();
            const lastOff = activeSession.lastTurnedOff || 0;
            const thirtyMinutes = 30 * 60 * 1000;

            if ((now - lastOff > thirtyMinutes) || activeSession.slotsFilled >= activeSession.maxSlots) {
                newSlotCount = 0;
            }

            const deactivateTasks = sessions.map(s => {
                if (s.id !== sessionId && s.isActive) {
                    return updateDoc(doc(db, "merchants", currentUid, "sessions", s.id), { isActive: false });
                }
                return Promise.resolve();
            });
            await Promise.all(deactivateTasks);

            const merchantSnap = await getDoc(merchantRef);
            const mData = merchantSnap.data();

            await updateDoc(merchantRef, {
                isActive: true,
                currentSessionId: sessionId,
                fromLocation: activeSession.fromLocation,
                toLocation: activeSession.toLocation,
                deliveryCharge: Number(activeSession.deliveryCharge),
                maxSlots: Number(activeSession.maxSlots),
                slotsFilled: newSlotCount,
                whatsappNumber: mData?.phoneNumber || ""
            });

            await updateDoc(sessionRef, {
                isActive: true,
                slotsFilled: newSlotCount
            });

        } else {
            await updateDoc(merchantRef, { isActive: false });
            await updateDoc(sessionRef, {
                isActive: false,
                slotsFilled: activeSession.slotsFilled || 0,
                lastTurnedOff: Date.now() 
            });
        }

    } catch (e) {
        console.error("Toggle failed:", e);
        if (!isAutoOff) alert("Sync error. Please check your connection.");
    }
}

// --- 5. CRUD Operations ---
window.saveSession = async () => {
    const nameInput = document.querySelector('input[placeholder="e.g. Dinner Run"]');
    const fromInput = document.querySelector('input[placeholder="Pickup point"]');
    const toInput = document.querySelector('input[placeholder="Destination"]');
    const nums = document.querySelectorAll('input[type="number"]');
    
    const menuItems = Array.from(document.querySelectorAll('.menu-item-input')).map(row => ({
        name: row.querySelectorAll('input')[0].value,
        price: Number(row.querySelectorAll('input')[1].value)
    }));

    if (!nameInput.value || !fromInput.value || menuItems.length === 0) {
        alert("Please fill all fields and add items.");
        return;
    }

    const sessionData = {
        sessionName: nameInput.value,
        fromLocation: fromInput.value,
        toLocation: toInput.value,
        deliveryCharge: Number(nums[0].value),
        maxSlots: Number(nums[1].value),
        menu: menuItems,
        isActive: false,
        slotsFilled: 0,
        lastTurnedOff: 0,
        timestamp: Date.now()
    };

    try {
        if (editingSessionId) {
            await updateDoc(doc(db, "merchants", currentUid, "sessions", editingSessionId), sessionData);
        } else {
            await addDoc(collection(db, "merchants", currentUid, "sessions"), sessionData);
        }
        window.hideForm();
    } catch (e) { 
        console.error(e);
        alert("Error saving session"); 
    }
};

window.deleteSession = async (id) => {
    if (confirm("Delete this session?")) {
        const session = sessions.find(s => s.id === id);
        if (session.isActive) {
            await updateDoc(doc(db, "users", currentUid), { isActive: false });
        }
        await deleteDoc(doc(db, "merchants", currentUid, "sessions", id));
    }
};

// --- 6. UI Rendering ---
function renderSessions() {
    if (sessions.length === 0) {
        sessionGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-dim);"><p>No saved sessions found.</p></div>`;
        return;
    }

    sessionGrid.innerHTML = sessions.map(s => {
        const isFull = s.slotsFilled >= s.maxSlots;
        return `
        <div class="trust-card session-card ${s.isActive ? 'active-session' : ''}">
            <div class="card-options">
                <i class="fi-list-bullet"></i>
                <div class="options-dropdown">
                    <button onclick="showForm('edit', '${s.id}')">Edit</button>
                    <button class="text-error" onclick="deleteSession('${s.id}')">Delete</button>
                </div>
            </div>
            <div class="card-tag" style="color: ${s.isActive ? 'var(--success)' : isFull ? '#ff3b30' : 'var(--accent)'}">
                ${s.isActive ? '● LIVE ON FEED' : isFull ? '● SESSION FULL' : 'SAVED SESSION'}
            </div>
            <h3>${s.sessionName}</h3>
            <p class="route">${s.fromLocation} → ${s.toLocation}</p>
            <div class="card-footer">
                <div class="load-info">
                    <span class="label">Slots:</span>
                    <span class="stat-value" style="color: ${isFull ? '#ff3b30' : 'var(--accent)'}">
                        ${s.slotsFilled || 0} / ${s.maxSlots}
                    </span>
                </div>
                <label class="switch">
                    <input type="checkbox" ${s.isActive ? 'checked' : ''} 
                        onchange="toggleSession('${s.id}', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>
    `}).join('');
}

window.toggleDrawer = () => document.getElementById('navDrawer').classList.toggle('active');

window.handleLogout = async () => {
    try {
        await signOut(auth);
        window.location.href = "sign-login.html";
    } catch (error) { console.error("Logout failed", error); }
};

window.addMenuItem = (name = "", price = "") => {
    const div = document.createElement('div');
    div.className = "menu-item-input";
    div.innerHTML = `
        <input type="text" placeholder="Food Name" value="${name}" required>
        <input type="number" placeholder="Price" value="${price}" required>
        <i class="fi-x remove-btn" onclick="this.parentElement.remove()"></i>
    `;
    menuContainer.appendChild(div);
};

window.showForm = (mode, id = null) => {
    sessionListView.style.display = 'none';
    sessionFormView.style.display = 'block';
    menuContainer.innerHTML = '';
    
    if (mode === 'edit' && id) {
        editingSessionId = id;
        const s = sessions.find(x => x.id === id);
        document.getElementById('formTitle').innerText = "EDIT SESSION";
        document.querySelector('input[placeholder="e.g. Dinner Run"]').value = s.sessionName;
        document.querySelector('input[placeholder="Pickup point"]').value = s.fromLocation;
        document.querySelector('input[placeholder="Destination"]').value = s.toLocation;
        document.querySelectorAll('input[type="number"]')[0].value = s.deliveryCharge;
        document.querySelectorAll('input[type="number"]')[1].value = s.maxSlots;
        s.menu.forEach(item => window.addMenuItem(item.name, item.price));
    } else {
        editingSessionId = null;
        document.getElementById('formTitle').innerText = "CREATE NEW SESSION";
        document.querySelectorAll('#sessionFormView input').forEach(inp => inp.value = "");
        window.addMenuItem();
    }
};

window.hideForm = () => {
    sessionListView.style.display = 'block';
    sessionFormView.style.display = 'none';
};

window.toggleSession = toggleSession;
