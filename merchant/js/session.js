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
let deliveryInput;
let slotsInput;

// --- Enforcement Constants (Synced with Location JS) ---
const WAL_THRESHOLD = 300;
const ADMIN_FEE = 25;
const TRIAL_DAYS = 14;
const GRACE_HOURS = 24;
const MAX_SLOTS_LIMIT = 20;
const MAX_DELIVERY_FEE = 1000;

// --- DOM Elements ---
const sessionListView = document.getElementById('sessionListView');
const sessionFormView = document.getElementById('sessionFormView');
const menuContainer = document.getElementById('menuContainer');
const sessionGrid = document.querySelector('.session-grid');

document.addEventListener("DOMContentLoaded", () => {
    deliveryInput = document.getElementById('deliveryChargeInput');
    slotsInput = document.getElementById('maxSlotsInput');

    deliveryInput.addEventListener("input", () => {
        if (deliveryInput.value > MAX_DELIVERY_FEE) deliveryInput.value = MAX_DELIVERY_FEE;
        if (deliveryInput.value < 0) deliveryInput.value = 0;
    });

    slotsInput.addEventListener("input", () => {
        if (slotsInput.value > MAX_SLOTS_LIMIT) slotsInput.value = MAX_SLOTS_LIMIT;
        if (slotsInput.value < 1) slotsInput.value = 1;
    });
});

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

            // Logic to reset slots to 0 if 30 mins passed or session was full
            if ((now - lastOff > thirtyMinutes) || activeSession.slotsFilled >= activeSession.maxSlots) {
                newSlotCount = 0;
            }

            // Deactivate any other currently active sessions first
            const deactivateTasks = sessions.map(s => {
                if (s.id !== sessionId && s.isActive) {
                    return updateDoc(doc(db, "merchants", currentUid, "sessions", s.id), { isActive: false });
                }
                return Promise.resolve();
            });
            await Promise.all(deactivateTasks);

            const merchantSnap = await getDoc(merchantRef);
            const mData = merchantSnap.data();

            // 1. Update the Global Merchant Profile (Used for Home Page queries)
            await updateDoc(merchantRef, {
                isActive: true,
                currentSessionId: sessionId,
                fromLocation: activeSession.fromLocation,
                toLocation: activeSession.toLocation,
                deliveryCharge: Number(activeSession.deliveryCharge),
                maxSlots: Number(activeSession.maxSlots),
                slotsFilled: newSlotCount, // <--- CRITICAL: Syncs reset to Home Page
                whatsappNumber: mData?.phoneNumber || ""
            });

            // 2. Update the Specific Session Document
            await updateDoc(sessionRef, {
                isActive: true,
                slotsFilled: newSlotCount,
                lastTurnedOff: 0 // Reset the off-timer
            });

        } else {
            // Toggling OFF logic
            await updateDoc(merchantRef, { 
              isActive: false,
              currentSessionId: null // Clear this so Admin/Home Page knows nothing is live
            });
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

    const rawDelivery = Number(deliveryInput.value);
    const rawSlots = Number(slotsInput.value);
    
    const finalDeliveryCharge = Math.max(0, Math.min(rawDelivery || 0, MAX_DELIVERY_FEE));
    const finalMaxSlots = Math.max(1, Math.min(rawSlots || 1, MAX_SLOTS_LIMIT));
    
    deliveryInput.value = finalDeliveryCharge;
    slotsInput.value = finalMaxSlots;
    
    const menuItems = Array.from(document.querySelectorAll('.menu-item-input')).map(row => ({
        name: row.querySelectorAll('input[type="text"]')[0].value,
        price: Number(row.querySelectorAll('input[type="number"]')[0].value),
        available: row.querySelector('.item-availability').checked 
    }));

    if (!nameInput.value || !fromInput.value || menuItems.length === 0) {
        alert("Please fill all fields and add items.");
        return;
    }

    // --- PERSISTENCE LOGIC ---
    // If editing, find the existing session to keep its live status and slots
    const existingSession = editingSessionId ? sessions.find(s => s.id === editingSessionId) : null;

    const sessionData = {
        sessionName: nameInput.value,
        fromLocation: fromInput.value,
        toLocation: toInput.value,
        deliveryCharge: finalDeliveryCharge,
        maxSlots: finalMaxSlots,
        menu: menuItems,
        // Keep current status if editing, otherwise default to off for new sessions
        isActive: existingSession ? existingSession.isActive : false,
        slotsFilled: existingSession ? existingSession.slotsFilled : 0,
        lastTurnedOff: existingSession ? existingSession.lastTurnedOff : 0,
        menu: menuItems,
        version: Date.now(), // Use timestamp as a unique version ID
        copyCount: 0,
        timestamp: existingSession ? existingSession.timestamp : Date.now()
    };

    try {
        if (editingSessionId) {
            await updateDoc(doc(db, "merchants", currentUid, "sessions", editingSessionId), sessionData);
            
            // If the session being edited is currently LIVE, update the Global Merchant Doc too
            if (existingSession && existingSession.isActive) {
                await updateDoc(doc(db, "users", currentUid), {
                    fromLocation: sessionData.fromLocation,
                    toLocation: sessionData.toLocation,
                    deliveryCharge: sessionData.deliveryCharge,
                    maxSlots: sessionData.maxSlots
                });
            }
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
                    <button onclick="copyForWhatsApp('${s.id}')">Copy for WhatsApp</button>
                    <button onclick="copySessionLink('${s.id}')">Copy for Friend</button>
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

window.addMenuItem = (name = "", price = "", isAvailable = true) => {
    const div = document.createElement('div');
    div.className = "menu-item-input";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "8px";

    div.innerHTML = `
        <input type="checkbox" class="item-availability" ${isAvailable ? 'checked' : ''} title="Available?">
        <input type="text" placeholder="Food Name" value="${name}" required style="flex: 2;">
        <input type="number" placeholder="Price" value="${price}" required style="flex: 1;">
        <i class="fi-x remove-btn" onclick="this.parentElement.remove()"></i>
    `;
    menuContainer.appendChild(div);
};


window.showForm = (mode, id = null) => {
    sessionListView.style.display = 'none';
    sessionFormView.style.display = 'block';
    menuContainer.innerHTML = '';
    const nums = sessionFormView.querySelectorAll('input[type="number"]');
    
    if (mode === 'edit' && id) {
        editingSessionId = id;
        const s = sessions.find(x => x.id === id);
        if (!s) return alert("Session not found!");
        document.getElementById('formTitle').innerText = "EDIT SESSION";
        document.querySelector('input[placeholder="e.g. Dinner Run"]').value = s.sessionName;
        document.querySelector('input[placeholder="Pickup point"]').value = s.fromLocation;
        document.querySelector('input[placeholder="Destination"]').value = s.toLocation;
        document.getElementById('deliveryChargeInput').value = s.deliveryCharge;
        document.getElementById('maxSlotsInput').value = s.maxSlots;
        s.menu.forEach(item => window.addMenuItem(item.name, item.price, item.available !== false));
    } else {
        editingSessionId = null;
        document.getElementById('formTitle').innerText = "CREATE NEW SESSION";
        document.querySelectorAll('#sessionFormView input').forEach(inp => inp.value = "");
        window.addMenuItem();
    }
};

// --- Updated Formatting Helper for WhatsApp ---
function formatWhatsAppText(session) {
    const menuText = session.menu
        .filter(item => item.available !== false)
        .map(item => `• ${item.name}: ₦${item.price}`)
        .join('\n');

    // Note: We use a placeholder or the actual merchant UID for the link
    return `*AVAILABLE DELIVERIES*\n` +
           `Route: ${session.fromLocation} → ${session.toLocation}\n\n` +
           `*MENU:*\n${menuText}\n\n` +
           `Delivery fee: ₦${session.deliveryCharge}\n` +
           `Limit: ${session.slotsFilled || 0}/${session.maxSlots} slots\n` +
           `Order here: https://scholar909.github.io/RUNHUB/customer/order-modal.html?m=${currentUid}&s=${session.id}`;
}

// --- Updated Copy Actions ---

// 1. Copy for WhatsApp
window.copyForWhatsApp = async (id) => {
    const session = sessions.find(s => s.id === id);
    if (!session) return;

    const text = formatWhatsAppText(session);
    try {
        await navigator.clipboard.writeText(text);
        alert("WhatsApp message copied! You can now paste it in any chat.");
    } catch (err) {
        console.error('WhatsApp copy failed', err);
    }
};

// 2. Copy for Friend (Existing Short Code logic)
window.copySessionLink = async (id) => {
    const session = sessions.find(s => s.id === id);
    if (!session) return;

    const shareableData = {
        sessionName: session.sessionName,
        fromLocation: session.fromLocation,
        toLocation: session.toLocation,
        deliveryCharge: session.deliveryCharge,
        maxSlots: session.maxSlots,
        menu: session.menu.map(item => ({ name: item.name, price: item.price })),
        createdAt: serverTimestamp()
    };

    try {
        const docRef = await addDoc(collection(db, "shared_sessions"), shareableData);
        await navigator.clipboard.writeText(docRef.id);
        alert("Friend Code copied! Your friend can paste this in 'Import Session' to clone your menu.");
    } catch (e) {
        alert("Failed to generate code.");
    }
};

window.importSession = async () => {
    const importInput = document.getElementById('importLinkInput');
    const shareId = importInput.value.trim();
    if (!shareId) return;

    try {
        // Fetch the shared data using the short ID
        const sharedDoc = await getDoc(doc(db, "shared_sessions", shareId));
        
        if (!sharedDoc.exists()) {
            alert("Invalid or expired session code.");
            return;
        }

        const data = sharedDoc.data();
        
        // Open form and fill fields
        window.showForm('add');
        
        document.querySelector('input[placeholder="e.g. Dinner Run"]').value = data.sessionName || "";
        document.querySelector('input[placeholder="Pickup point"]').value = data.fromLocation || "";
        document.querySelector('input[placeholder="Destination"]').value = data.toLocation || "";
        document.getElementById('deliveryChargeInput').value = data.deliveryCharge || 300;
        document.getElementById('maxSlotsInput').value = data.maxSlots || 5;

        // Reset and fill menu
        menuContainer.innerHTML = '';
        data.menu.forEach(item => {
            window.addMenuItem(item.name, item.price, true);
        });

        // Clean up UI
        importInput.value = ''; 
        document.getElementById('addOptions').style.display = 'none';

    } catch (e) {
        console.error("Import failed", e);
        alert("Error importing session. Make sure the code is correct.");
    }
};

window.toggleAddOptions = () => {
    const opts = document.getElementById('addOptions');
    opts.style.display = opts.style.display === 'none' ? 'block' : 'none';
};

window.hideForm = () => {
    sessionListView.style.display = 'block';
    sessionFormView.style.display = 'none';

    // --- Add these lines to reset the "Link" UI ---
    const addOptions = document.getElementById('addOptions');
    const importInput = document.getElementById('importLinkInput');

    if (addOptions) addOptions.style.display = 'none'; // Hide the box
    if (importInput) importInput.value = '';           // Clear the link
};


window.toggleSession = toggleSession;
