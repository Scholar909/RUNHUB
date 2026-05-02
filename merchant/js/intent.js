import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    doc, getDoc, updateDoc, collection, onSnapshot, 
    addDoc, deleteDoc, query, orderBy, where, getDocs, serverTimestamp, arrayUnion, arrayRemove 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- State Management ---
let currentUid = null;
let userData = null;
let intents = [];
let reactions = [];
let allBoardItems = [];
let activeTab = "Alerts";
let editingIntentId = null;

// --- Constants ---
const MAX_INTENT_HOURS = 5;
const EXPIRY_THRESHOLD_HRS = 7;

// --- DOM Elements ---
const liveBoard = document.querySelector('.live-board');
const tabContent = document.querySelector('.tab-content');
const tabs = document.querySelectorAll('.tab');
const addContainer = document.getElementById('addContainer');
const boardSearch = document.getElementById('boardSearch');
const formModal = document.getElementById('formModal');
const durationInput = document.getElementById('durationInput');

// --- 1. Initialization ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUid = user.uid;
        const userRef = doc(db, "users", currentUid);
        const userSnap = await getDoc(userRef);
        userData = userSnap.data();
        
        initApp();
    } else {
        window.location.href = "sign-login.html";
    }
});

function initApp() {
    listenToBoard();
    listenToMyIntents();
    listenToReactions();
    setupSearch();
    
    // Interval for 7-hour cleanup check
    setInterval(cleanupOldData, 60000); 
}

// --- 2. Real-time Listeners ---

function listenToBoard() {
    // Listen to ALL intents and requests from the last 12 hours
    const twelveHoursAgo = Date.now() - (12 * 60 * 60 * 1000);
    const q = query(collection(db, "live_board"), where("timestamp", ">", twelveHoursAgo));

    onSnapshot(q, (snapshot) => {
        allBoardItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderBoard();
    });
}

function listenToMyIntents() {
    const q = query(collection(db, "live_board"), where("uid", "==", currentUid), where("type", "==", "intent"));
    onSnapshot(q, (snapshot) => {
        intents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (activeTab === "My Intents") renderTabContent();
    });
}

function listenToReactions() {
    // Reactions are stored within the "reactions" subcollection of the board item or a central collection
    // For this logic, we listen to items where the user is the owner to show the reaction cards
    const q = query(collection(db, "live_board"), where("uid", "==", currentUid));
    onSnapshot(q, (snapshot) => {
        if (activeTab === "Reactions") renderTabContent();
    });
}

// --- 3. Rendering Logic ---

function renderBoard() {
    const searchTerm = boardSearch.value.toLowerCase();
    liveBoard.innerHTML = '';

    const filtered = allBoardItems
        .filter(item => !item.isPaused) // Don't show paused/editing items
        .filter(item => {
            return item.from.toLowerCase().includes(searchTerm) || 
                   item.to.toLowerCase().includes(searchTerm) || 
                   item.userName?.toLowerCase().includes(searchTerm);
        })
        .sort((a, b) => b.timestamp - a.timestamp);

    filtered.forEach(item => {
        const isMine = item.uid === currentUid;
        const isExpired = (Date.now() - item.timestamp) > (item.duration * 60000);
        
        const cardHtml = `
            <div class="chat-row ${isMine ? 'right' : 'left'}">
                <div class="chat-card ${isMine ? 'mine' : ''} ${isExpired ? 'expired-card' : ''}">
                    <div class="type">${item.type.toUpperCase()} ${isExpired ? '(EXPIRED)' : ''}</div>
                    <div class="route">${item.from} → ${item.to}</div>
                    <div class="meta">By ${item.userName} • ${formatTime(item.timestamp)}</div>
                    
                    <div class="actions">
                        ${renderBoardActions(item, isMine)}
                    </div>
                    <div style="font-size: 0.6rem; margin-top: 5px; color: var(--text-dim);">
                        <i class="fi-heart"></i> ${item.reactionCount || 0} reactions
                    </div>
                </div>
            </div>
        `;
        liveBoard.insertAdjacentHTML('beforeend', cardHtml);
    });
}

function renderBoardActions(item, isMine) {
    // Merchant rules:
    // 1. Can't react to other Merchants (Intent).
    // 2. Can react to Customers (Request) IF they have an active session.
    // 3. Can see reaction counts on everything.
    
    if (isMine) return ''; 

    if (item.type === 'request') {
        return `<button class="btn success" onclick="handleReact('${item.id}')">React</button>`;
    }
    
    // If it's an intent (another merchant), they can only see the count (already in card)
    return '';
}

function renderTabContent() {
    tabContent.innerHTML = '';
    
    if (activeTab === "Alerts") {
        addContainer.style.display = 'none';
        tabContent.innerHTML = `<div class="empty-state">No new alerts from customers.</div>`;
        // In a full system, you'd fetch from a 'notifications' collection here
    } 
    
    else if (activeTab === "Reactions") {
        addContainer.style.display = 'none';
        // Show one card per intent (Merchant only allows 1 active)
        const myItems = allBoardItems.filter(i => i.uid === currentUid).sort((a, b) => b.timestamp - a.timestamp);
        
        if (myItems.length === 0) {
            tabContent.innerHTML = `<div class="empty-state">No active or past intents to show reactions for.</div>`;
            return;
        }

        myItems.forEach(item => {
            const card = `
                <div class="panel-card" onclick="showReactionModal('${item.id}')">
                    <div class="info">
                        <div class="title">Reacts for: ${item.from} → ${item.to}</div>
                        <div class="sub">${item.reactionCount || 0} Customers reacted</div>
                    </div>
                    <i class="fi-arrow-right"></i>
                </div>
            `;
            tabContent.insertAdjacentHTML('beforeend', card);
        });
    } 
    
    else if (activeTab === "My Intents") {
        addContainer.style.display = 'block';
        if (intents.length === 0) {
            tabContent.innerHTML = `<div class="empty-state">You haven't created any intents yet.</div>`;
            return;
        }

        intents.forEach(intent => {
            const isExpired = (Date.now() - intent.timestamp) > (intent.duration * 60000);
            tabContent.insertAdjacentHTML('beforeend', `
                <div class="panel-card ${isExpired ? 'expired-card' : ''}">
                    <div class="info">
                        <div class="title">${intent.from} to ${intent.to}</div>
                        <div class="sub">${intent.duration} mins • ${isExpired ? 'Expired' : 'Live'}</div>
                    </div>
                    <div class="actions">
                        <button class="btn ghost" onclick="editIntent('${intent.id}')">Edit</button>
                        <button class="btn danger" onclick="deleteIntent('${intent.id}')">Delete</button>
                    </div>
                </div>
            `);
        });
    }
}

// --- 4. Functionality Logic ---

window.handleReact = async (itemId) => {
    // Check for active session in session.js logic (via user doc)
    const userRef = doc(db, "users", currentUid);
    const userSnap = await getDoc(userRef);
    const uData = userSnap.data();

    if (!uData.isActive || !uData.currentSessionId) {
        alert("You must have an active session to react to requests.");
        return;
    }

    const itemRef = doc(db, "live_board", itemId);
    await updateDoc(itemRef, {
        reactionCount: (allBoardItems.find(i => i.id === itemId).reactionCount || 0) + 1,
        reactors: arrayUnion({
            uid: currentUid,
            name: uData.businessName || "Merchant",
            deliveryFee: uData.deliveryCharge || 0,
            sessionId: uData.currentSessionId
        })
    });
};

window.saveIntent = async () => {
    const from = formModal.querySelector('input[placeholder*="From"]').value;
    const to = formModal.querySelector('input[placeholder*="To"]').value;
    let duration = parseInt(durationInput.value);

    if (!from || !to || !duration) return alert("Fill all fields");
    
    // Enforcement: Max 5 hours
    if (duration > (MAX_INTENT_HOURS * 60)) {
        duration = MAX_INTENT_HOURS * 60;
        durationInput.value = duration;
    }

    const intentData = {
        from,
        to,
        duration,
        type: 'intent',
        uid: currentUid,
        userName: userData.businessName || "Merchant",
        timestamp: Date.now(),
        reactionCount: 0,
        isPaused: false
    };

    try {
        if (editingIntentId) {
            await updateDoc(doc(db, "live_board", editingIntentId), {
                ...intentData,
                isPaused: false // Resume on save
            });
            editingIntentId = null;
        } else {
            // Merchant only allows 1 active intent check
            const active = intents.find(i => (Date.now() - i.timestamp) < (i.duration * 60000));
            if (active) {
                alert("You already have an active intent. Delete or wait for it to expire.");
                return;
            }
            await addDoc(collection(db, "live_board"), intentData);
        }
        closeForm();
    } catch (e) { console.error(e); }
};

window.editIntent = async (id) => {
    editingIntentId = id;
    const intent = intents.find(i => i.id === id);
    
    // Pause and hide from board
    await updateDoc(doc(db, "live_board", id), { isPaused: true });
    
    formModal.querySelector('input[placeholder*="From"]').value = intent.from;
    formModal.querySelector('input[placeholder*="To"]').value = intent.to;
    durationInput.value = intent.duration;
    
    openForm();
    // Change "Create" button to "Save"
    formModal.querySelector('.btn.primary').innerText = "Save Changes";
};

window.deleteIntent = async (id) => {
    if (confirm("Delete this intent? This will also remove it from the live board.")) {
        await deleteDoc(doc(db, "live_board", id));
    }
};

async function cleanupOldData() {
    const cutoff = Date.now() - (EXPIRY_THRESHOLD_HRS * 60 * 60 * 1000);
    const oldItems = allBoardItems.filter(item => item.timestamp < cutoff);
    
    for (const item of oldItems) {
        // Automatically delete data older than 7 hours
        await deleteDoc(doc(db, "live_board", item.id));
    }
}

// --- 5. UI Helpers ---

window.openForm = () => formModal.style.display = 'flex';

window.closeForm = async () => {
    if (editingIntentId) {
        // If they cancel edit, resume the existing intent
        await updateDoc(doc(db, "live_board", editingIntentId), { isPaused: false });
        editingIntentId = null;
    }
    formModal.style.display = 'none';
    formModal.querySelector('.btn.primary').innerText = "Create";
};

function formatTime(ts) {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function setupSearch() {
    boardSearch.addEventListener('input', renderBoard);
}

tabs.forEach(t => {
    t.addEventListener('click', () => {
        tabs.forEach(btn => btn.classList.remove('active'));
        t.classList.add('active');
        activeTab = t.innerText;
        renderTabContent();
    });
});

window.toggleDrawer = () => document.getElementById('navDrawer').classList.toggle('active');

window.handleLogout = async () => {
    await signOut(auth);
    window.location.href = "sign-login.html";
};

// --- Modal for Reactions List ---
window.showReactionModal = (itemId) => {
    const item = allBoardItems.find(i => i.id === itemId);
    if (!item || !item.reactors) return alert("No reactions yet.");

    const modalHtml = `
        <div id="reactionModal" class="form-modal" style="display:flex;">
            <div class="form-box">
                <h3>Customer Reactions</h3>
                <div style="max-height: 300px; overflow-y: auto; margin-bottom: 20px;">
                    ${item.reactors.map(r => `
                        <div class="panel-card" style="margin-bottom: 8px;">
                            <div class="info">
                                <div class="title">${r.name}</div>
                                <div class="sub">Wants to order</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button class="btn ghost w-100" onclick="this.closest('.form-modal').remove()">Close</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

// 5 Hour Input Restriction logic
durationInput.addEventListener('input', () => {
    const maxMins = MAX_INTENT_HOURS * 60;
    if (parseInt(durationInput.value) > maxMins) {
        durationInput.value = maxMins;
    }
});
