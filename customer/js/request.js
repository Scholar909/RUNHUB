import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, doc, addDoc, deleteDoc, updateDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

/* =========================
   STATE & CONSTANTS
========================= */
let uid = null;
let requests = [];
let intents = [];
let alerts = [];
let activeTab = 0;
let editingRequestId = null;

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);

/* =========================
   AUTH CHECK
========================= */
onAuthStateChanged(auth, async (user) => {
    if (!user) { 
        window.location.href = "./sign-login.html"; 
        return; 
    }
    uid = user.uid;
    initUI();
    initData();
});

/* =========================
   INITIALIZE UI
========================= */
function initUI() {
    $$(".tab").forEach((btn, i) => {
        btn.addEventListener("click", () => switchTab(i));
    });

    const submitBtn = $("#submitBtn");
    if (submitBtn) {
        submitBtn.addEventListener("click", handleRequestSubmit);
    }
    
    window.toggleDrawer = () => $("#navDrawer")?.classList.toggle("active");

    window.openForm = () => { $("#formModal").style.display = "flex"; };

    window.closeForm = async () => { 
        // If we close the form and were editing, set it back to pending so it shows up again
        if (editingRequestId) {
            try {
                await updateDoc(doc(db, "requests", editingRequestId), { status: "pending" });
            } catch (e) { console.error("Revert failed", e); }
        }
        editingRequestId = null;
        $("#formModal").style.display = "none";
        ["#fromInput", "#toInput", "#itemInput", "#durationInput"].forEach(id => $(id).value = "");
    };

    window.handleLogout = async () => {
        await signOut(auth);
        window.location.href = "./sign-login.html";
    };
}


/* =========================
   DATA STREAMS
========================= */
function initData() {
    // Listen to Requests
    onSnapshot(collection(db, "requests"), (snap) => {
        requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        runMatchEngine();
        refreshCurrentView();
    });

    // Listen to Merchant Intents
    onSnapshot(collection(db, "intents"), (snap) => {
        intents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        runMatchEngine();
        refreshCurrentView();
    });

    // Listen to Alerts
    onSnapshot(collection(db, "alerts"), (snap) => {
        alerts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (activeTab === 0) renderAlerts();
    });

    // Real-time timer updates
    setInterval(refreshCurrentView, 1000);
}

function refreshCurrentView() {
    renderLiveBoard();
    if (activeTab === 0) renderAlerts();
    if (activeTab === 1) renderPeerRequests();
    if (activeTab === 2) renderMyRequests();
}

/* =========================
   NAVIGATION & TABS
========================= */
function switchTab(index) {
    activeTab = index;
    $$(".tab").forEach(t => t.classList.remove("active"));
    $$(".tab")[index].classList.add("active");
    
    // Show "Create" button only on "My Requests" tab
    $("#addContainer").style.display = (index === 2) ? "block" : "none";
    refreshCurrentView();
}

/* =========================
   RENDERING LOGIC
========================= */

function renderLiveBoard() {
    const el = $(".live-board");
    if (!el) return;
    el.innerHTML = "";

    // Render Requests
    requests.forEach(r => {
        if (r.expiresAt < Date.now()) return;
        const isMine = r.userId === uid;
        el.innerHTML += `
        <div class="chat-row ${isMine ? 'right' : 'left'}">
            <div class="chat-card ${isMine ? 'mine' : ''}">
                <span class="type">REQUEST:</span>
                <div class="route">${r.from} → ${r.to}</div>
                <div class="meta">Items: ${r.item} • ${getTimeLeft(r.expiresAt)}</div>
                </div>
        </div>`;
    });

    // Render Merchant Intents
    intents.forEach(i => {
        if (i.expiresAt < Date.now()) return;
        el.innerHTML += `
        <div class="chat-row left">
            <div class="chat-card" style="border-left: 4px solid var(--accent);">
                <span class="type">MERCHANT INTENT:</span>
                <div class="route">${i.from} → ${i.to}</div>
                <div class="meta">Leaves in: ${getTimeLeft(i.expiresAt)}</div>
                <div class="actions">
                    <button class="btn primary" onclick="handleReact('intent', '${i.id}')">React</button>
                </div>
            </div>
        </div>`;
    });
}

/* =========================
   NEW: renderReactions (The React Tab)
========================= */
async function renderReactions() {
    const el = $(".tab-content");
    el.innerHTML = "";

    // Show all my requests (active and recently expired but not deleted)
    const myRequests = requests.filter(r => r.userId === uid).sort((a,b) => b.createdAt - a.createdAt);

    if (myRequests.length === 0) {
        el.innerHTML = `<div class="empty-state">Post a request to see merchant reactions.</div>`;
        return;
    }

    for (let r of myRequests) {
        const isExpired = r.expiresAt < Date.now();
        // Count merchant reactions for this specific request
        const snap = await getDocs(query(collection(db, "reactions"), where("targetId", "==", r.id)));
        
        el.innerHTML += `
            <div class="panel-card ${isExpired ? 'expired-card' : ''}" onclick="openReactionModal('${r.id}')" style="cursor:pointer; margin-bottom:10px;">
                <div class="info">
                    <div class="title">${r.item} ${isExpired ? '(Expired)' : ''}</div>
                    <div class="sub">${r.from} → ${r.to}</div>
                </div>
                <div class="badge" style="background:var(--accent); padding:4px 10px; border-radius:12px; font-size:0.7rem;">
                    ${snap.size} Reactions
                </div>
            </div>
        `;
    }
}


function renderAlerts() {
    const el = $(".tab-content");
    el.innerHTML = "";
    const myAlerts = alerts.filter(a => a.users && a.users.includes(uid));

    if (myAlerts.length === 0) {
        el.innerHTML = `<div class="empty-state">No matches yet.</div>`;
        return;
    }

    myAlerts.forEach(a => {
        el.innerHTML += `
        <div class="panel-card">
            <div class="info">
                <div class="title">Match Found</div>
                <div class="sub">${a.from} → ${a.to}</div>
            </div>
            <div class="actions">
                <button class="btn ghost" onclick="deleteAlert('${a.id}')">Delete</button>
            </div>
        </div>`;
    });
}

function renderPeerRequests() {
    const el = $(".tab-content");
    el.innerHTML = "";
    const others = requests.filter(r => r.userId !== uid && r.status === "pending" && r.expiresAt > Date.now());

    if (others.length === 0) {
        el.innerHTML = `<div class="empty-state">No intents active.</div>`;
        return;
    }

    others.forEach(r => {
        el.innerHTML += `
        <div class="panel-card">
            <div class="info">
                <div class="title">Customer Request</div>
                <div class="sub">${r.from} → ${r.to} • ${r.item}</div>
            </div>
        </div>`;
    });
}

function renderMyRequests() {
    const el = $(".tab-content");
    el.innerHTML = "";
    const myData = requests.filter(r => r.userId === uid);

    if (myData.length === 0) {
        el.innerHTML = `<div class="empty-state">You haven't posted any requests.</div>`;
        return;
    }

    myData.forEach(r => {
        const isExpired = r.expiresAt < Date.now();
        el.innerHTML += `
        <div class="panel-card ${isExpired ? 'expired-card' : ''}">
            <div class="info">
                <div class="title">My Request (${r.visibility})</div>
                <div class="sub">${r.from} → ${r.to} • ${getTimeLeft(r.expiresAt)}</div>
            </div>
            <div class="actions">
                ${!isExpired ? `<button class="btn ghost" onclick="editRequest('${r.id}')">Edit</button>` : ''}
                <button class="btn danger" onclick="deleteRequest('${r.id}')">Delete</button>
            </div>
        </div>`;
    });
}

/* =========================
   REPLACED: handleRequestSubmit
========================= */
async function handleRequestSubmit() {
    const from = $("#fromInput").value;
    const to = $("#toInput").value;
    const item = $("#itemInput").value;
    const duration = parseInt($("#durationInput").value);

    if (!from || !to || !item || !duration) return alert("Fill all fields");
    
    // Increased limit to 5 as requested
    const activeCount = requests.filter(r => r.userId === uid && r.expiresAt > Date.now()).length;
    if (!editingRequestId && activeCount >= 5) return alert("Limit: 5 active requests.");

    const expiresAt = Date.now() + (duration * 60 * 1000);

    try {
        if (editingRequestId) {
            const docId = editingRequestId;
            editingRequestId = null;
            await updateDoc(doc(db, "requests", docId), {
                from, to, item, expiresAt, status: "pending"
            });
        } else {
            await addDoc(collection(db, "requests"), {
                userId: uid, from, to, item, expiresAt,
                status: "pending", createdAt: serverTimestamp()
            });
        }
        window.closeForm(); 
    } catch (e) { console.error(e); }
}

// EXPOSE ACTIONS TO WINDOW FOR HTML ONCLICK
window.editRequest = async (id) => {
    const r = requests.find(req => req.id === id);
    if (!r) return;
    editingRequestId = id;
    
    // Hide from public while editing
    await updateDoc(doc(db, "requests", id), { status: "editing" });

    $("#fromInput").value = r.from;
    $("#toInput").value = r.to;
    $("#itemInput").value = r.item;
    window.openForm();
};

window.deleteRequest = async (id) => {
    if (confirm("Delete this request?")) await deleteDoc(doc(db, "requests", id));
};

window.deleteAlert = async (id) => {
    await deleteDoc(doc(db, "alerts", id));
};

window.startOrder = (intentId) => {
    console.log("Navigating to order for intent:", intentId);
    // window.location.href = `order.html?intentId=${intentId}`;
};

/* =========================
   HELPERS & ENGINE
========================= */

function getTimeLeft(ex) {
    const diff = ex - Date.now();
    if (diff <= 0) return "Expired";
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}m ${secs}s`;
}

const seenMatches = new Set();
async function runMatchEngine() {
    for (let r of requests) {
        if (r.userId !== uid || r.expiresAt < Date.now()) continue;
        for (let i of intents) {
            if (i.expiresAt < Date.now()) continue;

            const key = `${r.id}_${i.id}`;
            if (seenMatches.has(key)) continue;
            
            const rFrom = r.from.toLowerCase().split(",").map(s => s.trim());
            const iFrom = i.from.toLowerCase().split(",").map(s => s.trim());
            
            if (rFrom.some(l => iFrom.includes(l))) {
                seenMatches.add(key);
                await addDoc(collection(db, "alerts"), {
                    type: "match", from: r.from, to: r.to, 
                    users: [r.userId, i.userId], 
                    createdAt: serverTimestamp()
                });
            }
        }
    }
}

// Expose these so the HTML buttons can trigger them
window.editRequest = editRequest;
window.deleteRequest = deleteRequest;
window.deleteAlert = deleteAlert;
window.switchTab = switchTab; 
