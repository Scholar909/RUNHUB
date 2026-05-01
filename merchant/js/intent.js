import { auth, db } from "./firebase-config.js";
import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

import {
    collection,
    doc,
    addDoc,
    deleteDoc,
    updateDoc,
    onSnapshot,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

/* =========================
   STATE
========================= */
let uid = null;
let userRole = null;
let editingIntentId = null;
let activeTab = 0;


let requests = [];
let intents = [];
let alerts = [];

/* =========================
   HELPERS
========================= */
const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);

/* =========================
   AUTH
========================= */
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "./sign-login.html";
        return;
    }

    uid = user.uid;

    const snap = await getDoc(doc(db, "users", uid));
    userRole = snap.exists() ? (snap.data().role || "customer") : "customer";

    initUI();
    initData();
});

/* =========================
   INIT UI
========================= */
function initUI() {

    // Tabs
    $$(".tab").forEach((btn, i) => {
        btn.addEventListener("click", () => switchTab(i));
    });

    // FIX: modal button MUST exist before binding
    const createBtn = $("#formModal .btn.primary");
    if (createBtn) {
        createBtn.addEventListener("click", createIntent);
    }

    window.openForm = () => {
        $("#formModal").style.display = "flex";
    };

    window.closeForm = () => {
        editingIntentId = null; // Important: Clear edit state on cancel
        $("#formModal").style.display = "none";
        // Optional: Clear form inputs here
    };


    // FIX: show Add button properly
const addContainer = $("#addContainer");

function updateCreateVisibility(tabIndex) {
    if (!addContainer) return;

    // Only show in "My Intents" tab (index 2) AND only for merchant
    addContainer.style.display =
        (userRole === "merchant" && tabIndex === 2) ? "block" : "none";
}

// call once
updateCreateVisibility(0);

// expose globally
window.updateCreateVisibility = updateCreateVisibility;
}

/* =========================
   INIT DATA STREAMS
========================= */
function initData() {

    onSnapshot(collection(db, "requests"), (snap) => {
    requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    runMatchEngine();
    renderLiveBoard();

    if (activeTab === 1) renderRequests(); // ✅ ONLY when tab is active
  });

  onSnapshot(collection(db, "intents"), (snap) => {
    intents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    runMatchEngine();
    renderLiveBoard();

    if (activeTab === 2) renderMy(); // ✅ ONLY when tab is active
  });

  onSnapshot(collection(db, "alerts"), (snap) => {
    alerts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (activeTab === 0) renderAlerts(); // ✅ ONLY when tab is active
  });

  setInterval(() => {
    renderLiveBoard();
    if (activeTab === 2) renderMy();
  }, 1000);
  
  switchTab(activeTab);
}

/* =========================
   TAB SWITCH
========================= */
function switchTab(index) {

    activeTab = index; // ✅ track current tab

    $$(".tab").forEach(t => t.classList.remove("active"));
    $$(".tab")[index].classList.add("active");

    updateCreateVisibility(index);

    if (index === 0) renderAlerts();
    if (index === 1) renderRequests();
    if (index === 2) renderMy();
}

/* =========================
   MATCH ENGINE (SAFE + NO SPAM)
========================= */
function parse(text = "") {
    return text.toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
}

function match(a, b) {
    return a.some(x => b.includes(x));
}

function isMatch(req, intent) {
    return (
        match(parse(req.from), parse(intent.from)) &&
        match(parse(req.to), parse(intent.to))
    );
}

/* prevent duplicate alerts */
const seenMatches = new Set();

async function runMatchEngine() {

    for (let r of requests) {
        for (let i of intents) {

            if (isMatch(r, i)) {

                const key = `${r.id}_${i.id}`;
                if (seenMatches.has(key)) continue;

                seenMatches.add(key);

                await addDoc(collection(db, "alerts"), {
                    type: "match",
                    from: r.from,
                    to: r.to,
                    requestId: r.id,
                    intentId: i.id,
                    users: [r.userId, i.userId],
                    createdAt: serverTimestamp()
                });
            }
        }
    }
}

function getTimeLeft(expiresAt) {
    const diff = expiresAt - Date.now();
    if (diff <= 0) return "Expired";

    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    return `${mins}m ${secs}s`;
}

/* =========================
   LIVE BOARD (Universal React)
========================= */
function renderLiveBoard() {
    const el = $("#liveBoard");
    const searchTerm = $("#boardSearch")?.value.toLowerCase() || "";
    if (!el) return;
    el.innerHTML = "";

    // Render Requests (Demand)
    requests.forEach(r => {
        if (searchTerm && !(`${r.from} ${r.to} ${r.item}`).toLowerCase().includes(searchTerm)) return;
        
        el.innerHTML += `
        <div class="chat-row left">
            <div class="chat-card">
                <span class="type">REQUEST:</span>
                <div class="route">${r.from} → ${r.to}</div>
                <div class="meta">${r.item || "Items needed"} • ${getTimeLeft(r.expiresAt)}</div>
                <div class="actions">
                    <button class="btn primary" onclick="handleReact('request', '${r.id}')">React</button>
                </div>
            </div>
        </div>`;
    });

    // Render Intents (Supply)
    intents.forEach(i => {
        if (searchTerm && !(`${i.from} ${i.to}`).toLowerCase().includes(searchTerm)) return;
        const isExpired = i.expiresAt < Date.now();
        if (isExpired && i.userId !== uid) return; // Hide others' expired intents

        const mine = i.userId === uid;
        el.innerHTML += `
        <div class="chat-row ${mine ? 'right' : 'left'}">
            <div class="chat-card ${mine ? 'mine' : ''} ${isExpired ? 'expired-card' : ''}">
                <span class="type">INTENT:</span>
                <div class="route">${i.from} → ${i.to}</div>
                <div class="meta">${isExpired ? 'Expired' : 'Leaving in: ' + getTimeLeft(i.expiresAt)}</div>
                ${!mine && !isExpired ? `
                <div class="actions">
                    <button class="btn primary" onclick="handleReact('intent', '${i.id}')">React</button>
                </div>` : ""}
            </div>
        </div>`;
    });
}

/* =========================
   REACT TAB (The "Request" Grid)
========================= */
async function renderRequests() {
    const el = $(".tab-content");
    el.innerHTML = "";

    // Show My Intent's Reactions (Grid Style)
    const myActiveIntent = intents.find(i => i.userId === uid && i.expiresAt > Date.now());
    
    // Header for the grid
    const gridDiv = document.createElement('div');
    gridDiv.className = "react-grid-container";
    
    if (myActiveIntent) {
        // Fetch reactions for this intent
        const snap = await getDocs(query(collection(db, "reactions"), where("targetId", "==", myActiveIntent.id)));
        const reactionCount = snap.size;

        el.innerHTML = `
            <div class="panel-card" onclick="openReactionModal('${myActiveIntent.id}')" style="cursor:pointer; border: 1px solid var(--accent);">
                <div class="info">
                    <div class="title">Active Intent Reactions</div>
                    <div class="sub">${myActiveIntent.from} → ${myActiveIntent.to}</div>
                </div>
                <div class="badge" style="background:var(--accent); padding:5px 10px; border-radius:50%;">${reactionCount}</div>
            </div>
        `;
    } else {
        el.innerHTML = `<div class="empty-state">No active intent. Create one to see reactions.</div>`;
    }
}

/* =========================
   ALERTS (TAB 0)
========================= */
function renderAlerts() {
    const el = $(".tab-content");
    if (!el) return;
    el.innerHTML = "";

    const myAlerts = alerts.filter(a => a.users.includes(uid));

    if (myAlerts.length === 0) {
        el.innerHTML = `<div class="empty-state" style="text-align:center; padding: 20px;">No matches found yet.</div>`;
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
                <button class="btn primary">View</button>
                <button class="btn ghost" onclick="deleteAlert('${a.id}')">Delete</button>
            </div>
        </div>`;
    });
}


/* =========================
   CREATE INTENT
========================= */
// Updated createIntent to handle SAVE vs CREATE
async function createIntent() {
    const from = $("#formModal input[placeholder*='From']").value;
    const to = $("#formModal input[placeholder*='To']").value;
    const duration = parseInt($("#durationInput").value);

    if (!from || !to || !duration) return alert("Fill all fields");
    
    // Check for ANY unexpired intent
    const activeIntent = intents.find(i => i.userId === uid && i.expiresAt > Date.now());
    if (activeIntent) {
        return alert("You already have an active intent. Delete it or wait for it to expire.");
    }

    const expiresAt = Date.now() + (duration * 60 * 1000);
    await addDoc(collection(db, "intents"), {
        from, to, duration, expiresAt,
        userId: uid,
        visibility: "public", // Forced public
        createdAt: serverTimestamp()
    });
    
    closeForm();
}

/* =========================
   ACTIONS
========================= */
window.editIntent = (id) => {
    const intent = intents.find(i => i.id === id);
    if (!intent) return;

    editingIntentId = id; // Track that we are editing

    // Fill the form with existing data
    $("#visibilityInput").value = intent.visibility;
    $("#formModal input[placeholder*='From']").value = intent.from;
    $("#formModal input[placeholder*='To']").value = intent.to;
    $("#durationInput").value = intent.duration;

    openForm();
};

window.deleteIntent = async (id) => {
    await deleteDoc(doc(db, "intents", id));
};

window.approveRequest = async (id) => {
    await updateDoc(doc(db, "requests", id), { status: "approved" });
};

window.declineRequest = async (id) => {
    await deleteDoc(doc(db, "requests", id));
};

window.takeOrder = async (id) => {
    await updateDoc(doc(db, "requests", id), {
        status: "taken",
        merchantId: uid
    });
};

/* =========================
   REACTION SYSTEM
========================= */
window.handleReact = async (type, targetId) => {
    // 1. Check Limits (Rule: Max 7-8 active)
    const myReactions = await getDocs(query(collection(db, "reactions"), where("userId", "==", uid)));
    if (myReactions.size >= 8) return alert("You have too many active reactions. Wait for some to expire.");

    // 2. Merchant Rule: Must have active session
    if (userRole === "merchant") {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (!userDoc.data().isActive) return alert("Please turn on a session in the 'Set Session' page first.");
    }

    // 3. Post Reaction
    await addDoc(collection(db, "reactions"), {
        targetId,
        type, // 'intent' or 'request'
        userId: uid,
        timestamp: serverTimestamp(),
        expiresAt: Date.now() + (13 * 60 * 60 * 1000) // 13hr limit
    });
    
    alert("Reaction sent!");
};

window.openReactionModal = async (intentId) => {
    const snap = await getDocs(query(collection(db, "reactions"), where("targetId", "==", intentId)));
    // Build modal showing list of customers who reacted
    // For each: Show Approve (Send Session Link) | Swipe (Delete reaction)
};

$("#boardSearch").addEventListener("input", () => {
    renderLiveBoard();
});

/* =========================
   DRAWER + LOGOUT
========================= */
window.toggleDrawer = () => {
    $("#navDrawer")?.classList.toggle("active");
};

window.handleLogout = async () => {
    await signOut(auth);
    window.location.href = "./sign-login.html";
};