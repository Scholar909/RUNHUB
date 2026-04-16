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
        $("#formModal").style.display = "none";
    };

    // FIX: show Add button properly
const addContainer = $("#addContainer");

function updateCreateVisibility(tabIndex) {
    if (!addContainer) return;

    // Only show in Requests tab (index 1) AND only for merchant
    addContainer.style.display =
        (userRole === "merchant" && tabIndex === 1) ? "block" : "none";
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
        renderRequests();
    });

    onSnapshot(collection(db, "intents"), (snap) => {
        intents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        runMatchEngine();
        renderLiveBoard();
        renderMy();
    });

    onSnapshot(collection(db, "alerts"), (snap) => {
        alerts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAlerts();
    });
    
    setInterval(() => {
        renderLiveBoard();
        renderMy();
    }, 1000);
}

/* =========================
   TAB SWITCH
========================= */
function switchTab(index) {

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
   LIVE BOARD
========================= */
function renderLiveBoard() {

    const el = $(".live-board");
    if (!el) return;

    el.innerHTML = "";

    // REQUESTS
    requests.forEach(r => {
        el.innerHTML += `
        <div class="chat-row left">
            <div class="chat-card">
                <span class="type">REQUEST:</span>
                <div class="route">${r.from} → ${r.to}</div>
                <div class="meta">${r.item || "N/A"}</div>

                ${userRole === "merchant" ? `
                <div class="actions">
                    <button class="btn primary" onclick="takeOrder('${r.id}')">Take Order</button>
                </div>` : ""}
            </div>
        </div>`;
    });

    // INTENTS
    intents.forEach(i => {
      
        if (i.visibility === "private" && i.userId !== uid) return;

        const mine = i.userId === uid;

        el.innerHTML += `
        <div class="chat-row ${mine ? 'right' : 'left'}">
            <div class="chat-card ${mine ? 'mine' : ''}">
                <span class="type">INTENT:</span>
                <div class="route">${i.from} → ${i.to}</div>
                <div class="meta">${getTimeLeft(i.expiresAt)}</div>

                ${mine ? `
                <div class="actions">
                    <button class="btn ghost" onclick="editIntent('${i.id}')">Edit</button>
                    <button class="btn danger" onclick="deleteIntent('${i.id}')">Delete</button>
                </div>` : ""}
            </div>
        </div>`;
    });
}

/* =========================
   REQUESTS
========================= */
function renderRequests() {

    const el = $(".tab-content");
    if (!el) return;

    el.innerHTML = "";

    requests
        .filter(r => r.status === "pending")
        .forEach(r => {

            el.innerHTML += `
            <div class="panel-card">
                <div class="info">
                    <div class="title">Customer Request</div>
                    <div class="sub">${r.from} → ${r.to}</div>
                </div>

                <div class="actions">
                    <button class="btn success" onclick="approveRequest('${r.id}')">Approve</button>
                    <button class="btn danger" onclick="declineRequest('${r.id}')">Decline</button>
                </div>
            </div>`;
        });
}

/* =========================
   MY INTENTS
========================= */
function renderMy() {

    const el = $(".tab-content");
    if (!el) return;

    el.innerHTML = "";

    intents
        .filter(i => i.userId === uid)
        .forEach(i => {

            el.innerHTML += `
            <div class="panel-card">
                <div class="info">
                    <div class="title">My Intent</div>
                    <div class="sub">${i.from} → ${i.to} • ${getTimeLeft(i.expiresAt)}</div>
                </div>

                <div class="actions">
                    <button class="btn ghost" onclick="editIntent('${i.id}')">Edit</button>
                    <button class="btn danger" onclick="deleteIntent('${i.id}')">Delete</button>
                </div>
            </div>`;
        });
}

/* =========================
   ALERTS
========================= */
function renderAlerts() {

    const el = $(".tab-content");
    if (!el) return;

    el.innerHTML = "";

    alerts.forEach(a => {

        el.innerHTML += `
        <div class="panel-card">
            <div class="info">
                <div class="title">Match Found</div>
                <div class="sub">${a.from} → ${a.to}</div>
            </div>

            <div class="actions">
                <button class="btn primary">View</button>
                <button class="btn ghost">Delete</button>
            </div>
        </div>`;
    });
}

/* =========================
   CREATE INTENT
========================= */
async function createIntent() {
    const visibility = $("#visibilityInput").value;
    const from = $("#formModal input[placeholder*='From']").value;
    const to = $("#formModal input[placeholder*='To']").value;
    const duration = parseInt($("#durationInput").value);

    if (!from || !to || !duration) return alert("Fill all fields");

    const expiresAt = Date.now() + (duration * 60 * 1000);
    
    await addDoc(collection(db, "intents"), {
        from,
        to,
        duration,
        expiresAt,
        visibility,
        userId: uid,
        status: "active",
        createdAt: serverTimestamp()
    });

    closeForm();
}

/* =========================
   ACTIONS
========================= */
window.editIntent = (id) => {
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
   DRAWER + LOGOUT
========================= */
window.toggleDrawer = () => {
    $("#navDrawer")?.classList.toggle("active");
};

window.handleLogout = async () => {
    await signOut(auth);
    window.location.href = "./sign-login.html";
};