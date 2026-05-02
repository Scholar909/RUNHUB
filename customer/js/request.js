import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    doc, getDoc, updateDoc, collection, onSnapshot, 
    addDoc, deleteDoc, query, orderBy, where, getDocs, serverTimestamp, arrayUnion 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- State Management ---
let currentUid = null;
let userData = null;
let requests = [];
let allBoardItems = [];
let activeTab = "Alerts";
let editingRequestId = null;

// --- Constants ---
const MAX_ACTIVE_REQUESTS = 5;
const MAX_HOURS = 5;
const EXPIRY_HRS = 7;

// --- DOM Elements ---
const liveBoard = document.querySelector('.live-board');
const tabContent = document.querySelector('.tab-content');
const tabs = document.querySelectorAll('.tab');
const addContainer = document.getElementById('addContainer');
const boardSearch = document.getElementById('boardSearch');
const formModal = document.getElementById('formModal');
const durationInput = document.getElementById('durationInput');
const submitBtn = document.getElementById('submitBtn');

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
    listenToMyRequests();
    setupSearch();
    setupDurationEnforcement();
    
    // Cleanup interval
    setInterval(cleanupExpiredData, 60000);
}

// --- 2. Real-time Listeners ---

function listenToBoard() {
    const twelveHoursAgo = Date.now() - (12 * 60 * 60 * 1000);
    const q = query(collection(db, "live_board"), where("timestamp", ">", twelveHoursAgo));

    onSnapshot(q, (snapshot) => {
        allBoardItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderBoard();
        if (activeTab === "Reactions") renderTabContent();
    });
}

function listenToMyRequests() {
    const q = query(collection(db, "live_board"), where("uid", "==", currentUid), where("type", "==", "request"));
    onSnapshot(q, (snapshot) => {
        requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (activeTab === "My Requests") renderTabContent();
    });
}

// --- 3. Rendering Logic ---

function renderBoard() {
    const term = boardSearch.value.toLowerCase();
    liveBoard.innerHTML = '';

    const filtered = allBoardItems
        .filter(item => !item.isPaused)
        .filter(item => {
            return item.from.toLowerCase().includes(term) || 
                   item.to.toLowerCase().includes(term) || 
                   item.item?.toLowerCase().includes(term);
        })
        .sort((a, b) => b.timestamp - a.timestamp);

    filtered.forEach(item => {
        const isMine = item.uid === currentUid;
        const isExpired = (Date.now() - item.timestamp) > (item.duration * 60000);
        
        const cardHtml = `
            <div class="chat-row ${isMine ? 'right' : 'left'}">
                <div class="chat-card ${isMine ? 'mine' : ''} ${isExpired ? 'expired-card' : ''}">
                    <div class="type">
                        <i class="fi-${item.type === 'intent' ? 'marker' : 'shopping-cart'}"></i>
                        ${item.type.toUpperCase()} ${isExpired ? '(EXPIRED)' : ''}
                    </div>
                    <div class="route">${item.from} → ${item.to}</div>
                    ${item.item ? `<div class="meta" style="color:var(--text-main)">Item: ${item.item}</div>` : ''}
                    <div class="meta">By ${item.userName} • ${formatTime(item.timestamp)}</div>
                    
                    <div class="actions">
                        ${renderActions(item, isMine)}
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

function renderActions(item, isMine) {
    if (isMine) return '';
    
    // Rule: Customers can't react to other Customers.
    // Rule: Customers CAN react to Merchants (Intent).
    if (item.type === 'intent') {
        return `<button class="btn success" onclick="handleReact('${item.id}')">React</button>`;
    }

    // Rule: Clicking merchant reactions on ANOTHER customer's request brings up the modal
    if (item.type === 'request' && item.reactionCount > 0) {
        return `<button class="btn ghost" onclick="showMerchantListModal('${item.id}')">View Merchants</button>`;
    }

    return '';
}

function renderTabContent() {
    tabContent.innerHTML = '';
    
    if (activeTab === "Alerts") {
        addContainer.style.display = 'none';
        tabContent.innerHTML = `<div class="empty-state">No new merchant approvals yet.</div>`;
    } 
    
    else if (activeTab === "Reactions") {
        addContainer.style.display = 'none';
        const myItems = allBoardItems.filter(i => i.uid === currentUid).sort((a, b) => b.timestamp - a.timestamp);
        
        if (myItems.length === 0) {
            tabContent.innerHTML = `<div class="empty-state">No active requests to track reactions.</div>`;
            return;
        }

        myItems.forEach(item => {
            tabContent.insertAdjacentHTML('beforeend', `
                <div class="panel-card" onclick="showMerchantListModal('${item.id}')">
                    <div class="info">
                        <div class="title">Reacts for: ${item.item || 'Request'}</div>
                        <div class="sub">${item.reactionCount || 0} Merchants responding</div>
                    </div>
                    <i class="fi-arrow-right"></i>
                </div>
            `);
        });
    } 
    
    else if (activeTab === "My Requests") {
        addContainer.style.display = 'block';
        requests.forEach(req => {
            const isExpired = (Date.now() - req.timestamp) > (req.duration * 60000);
            tabContent.insertAdjacentHTML('beforeend', `
                <div class="panel-card ${isExpired ? 'expired-card' : ''}">
                    <div class="info">
                        <div class="title">${req.item || 'Delivery'}</div>
                        <div class="sub">${req.from} to ${req.to}</div>
                    </div>
                    <div class="actions">
                        <button class="btn ghost" onclick="editRequest('${req.id}')">Edit</button>
                        <button class="btn danger" onclick="deleteRequest('${req.id}')">Delete</button>
                    </div>
                </div>
            `);
        });
    }
}

// --- 4. Functionality ---

window.handleReact = async (itemId) => {
    const itemRef = doc(db, "live_board", itemId);
    const item = allBoardItems.find(i => i.id === itemId);
    
    await updateDoc(itemRef, {
        reactionCount: (item.reactionCount || 0) + 1,
        reactors: arrayUnion({
            uid: currentUid,
            name: userData.fullName || "Customer",
            timestamp: Date.now()
        })
    });
};

submitBtn.onclick = async () => {
    const from = document.getElementById('fromInput').value;
    const to = document.getElementById('toInput').value;
    const item = document.getElementById('itemInput').value;
    let duration = parseInt(durationInput.value);

    if (!from || !to || !item || !duration) return alert("Please fill all fields");

    if (duration > (MAX_HOURS * 60)) duration = MAX_HOURS * 60;

    const requestData = {
        from, to, item, duration,
        type: 'request',
        uid: currentUid,
        userName: userData.fullName || "Customer",
        timestamp: Date.now(),
        reactionCount: 0,
        reactors: [],
        isPaused: false
    };

    try {
        if (editingRequestId) {
            await updateDoc(doc(db, "live_board", editingRequestId), { ...requestData, isPaused: false });
            editingRequestId = null;
        } else {
            const activeCount = requests.filter(r => (Date.now() - r.timestamp) < (r.duration * 60000)).length;
            if (activeCount >= MAX_ACTIVE_REQUESTS) return alert("Max 5 active requests allowed.");
            
            await addDoc(collection(db, "live_board"), requestData);
        }
        closeForm();
    } catch (e) { console.error(e); }
};

window.editRequest = async (id) => {
    editingRequestId = id;
    const req = requests.find(r => r.id === id);
    
    await updateDoc(doc(db, "live_board", id), { isPaused: true });
    
    document.getElementById('fromInput').value = req.from;
    document.getElementById('toInput').value = req.to;
    document.getElementById('itemInput').value = req.item;
    durationInput.value = req.duration;
    
    openForm();
    submitBtn.innerText = "Save Changes";
};

window.deleteRequest = async (id) => {
    if (confirm("Delete this request?")) await deleteDoc(doc(db, "live_board", id));
};

// Modal to see Merchants who reacted to a request
window.showMerchantListModal = (itemId) => {
    const item = allBoardItems.find(i => i.id === itemId);
    if (!item || !item.reactors || item.reactors.length === 0) return alert("No merchants have reacted yet.");

    const modalHtml = `
        <div id="merchantModal" class="form-modal" style="display:flex;">
            <div class="form-box">
                <h3 style="margin-bottom:15px;">Available Merchants</h3>
                <div style="max-height: 350px; overflow-y: auto;">
                    ${item.reactors.map(m => `
                        <div class="panel-card" style="margin-bottom:10px; cursor:pointer;" 
                             onclick="goToOrder('${m.uid}', '${m.sessionId}')">
                            <div class="info">
                                <div class="title">${m.name}</div>
                                <div class="sub">Fee: ₦${m.deliveryFee || 0}</div>
                            </div>
                            <i class="fi-arrow-right"></i>
                        </div>
                    `).join('')}
                </div>
                <button class="btn ghost w-100" style="margin-top:15px;" onclick="this.closest('.form-modal').remove()">Close</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.goToOrder = (merchantUid, sessionId) => {
    window.location.href = `order-modal.html?m=${merchantUid}&s=${sessionId}`;
};

async function cleanupExpiredData() {
    const cutoff = Date.now() - (EXPIRY_HRS * 60 * 60 * 1000);
    const old = allBoardItems.filter(i => i.timestamp < cutoff);
    for (const i of old) await deleteDoc(doc(db, "live_board", i.id));
}

// --- 5. UI Helpers ---

window.openForm = () => formModal.style.display = 'flex';

window.closeForm = async () => {
    if (editingRequestId) {
        await updateDoc(doc(db, "live_board", editingRequestId), { isPaused: false });
        editingRequestId = null;
    }
    formModal.style.display = 'none';
    submitBtn.innerText = "Create";
};

function setupDurationEnforcement() {
    durationInput.addEventListener('input', () => {
        if (parseInt(durationInput.value) > (MAX_HOURS * 60)) {
            durationInput.value = MAX_HOURS * 60;
        }
    });
}

function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

document.querySelector('.logout-btn').onclick = async () => {
    await signOut(auth);
    window.location.href = "sign-login.html";
};
