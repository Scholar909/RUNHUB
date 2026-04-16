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

    window.openForm = () => {
        $("#formModal").style.display = "flex";
    };

    window.closeForm = () => {
        $("#formModal").style.display = "none";
    };

    // CREATE BUTTON ONLY IN REQUESTS TAB
    const addContainer = $("#addContainer");

    function updateCreateVisibility(tabIndex) {
        if (!addContainer) return;
        addContainer.style.display = (tabIndex === 1) ? "block" : "none";
    }

    updateCreateVisibility(0);
    window.updateCreateVisibility = updateCreateVisibility;
}

/* =========================
   INIT DATA
========================= */
function initData() {

    onSnapshot(collection(db, "requests"), (snap) => {
        requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        runMatchEngine();
        renderLiveBoard();
        renderRequests();
        renderMy();
    });

    onSnapshot(collection(db, "intents"), (snap) => {
        intents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderLiveBoard();
    });

    onSnapshot(collection(db, "alerts"), (snap) => {
        alerts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAlerts();
    });

    setInterval(() => {
        renderLiveBoard();
        renderMy();
    }, 1000);
    
    switchTab(0);
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
   MATCH ENGINE
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

const seenMatches = new Set();

async function runMatchEngine() {

    const now = Date.now();

    for (let r of requests) {
        for (let i of intents) {

            if (isMatch(r, i)) {

                const key = `${r.id}_${i.id}`;
                if (seenMatches.has(key)) continue;
                if (r.expiresAt < now || i.expiresAt < now) continue;

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

/* =========================
   TIMER
========================= */
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

    // REQUESTS (PUBLIC ONLY)
    requests.forEach(r => {
      
      if (r.status === "editing") return;
      
      if (getTimeLeft(r.expiresAt) === "Expired") return;

        if (r.visibility === "private" && r.userId !== uid) return;

        const mine = r.userId === uid;

        el.innerHTML += `
        <div class="chat-row ${mine ? 'right' : 'left'}">
            <div class="chat-card ${mine ? 'mine' : ''}">
                <span class="type">REQUEST:</span>
                <div class="route">${r.from} → ${r.to}</div>
                <div class="meta">Item: ${r.item || "N/A"} • ${getTimeLeft(r.expiresAt)}</div>

                ${mine ? `
                <div class="actions">
                    <button class="btn ghost" onclick="editRequest('${r.id}')">Edit</button>
                    <button class="btn danger" onclick="deleteRequest('${r.id}')">Delete</button>
                </div>` : ""}
            </div>
        </div>`;
    });

    // INTENTS (CUSTOMER CAN PLACE ORDER)
    intents.forEach(i => {
      
      if (getTimeLeft(i.expiresAt) === "Expired") return;

        if (i.visibility === "private" && i.userId !== uid) return;

        el.innerHTML += `
        <div class="chat-row left">
            <div class="chat-card">
                <span class="type">INTENT:</span>
                <div class="route">${i.from} → ${i.to}</div>
                <div class="meta">${getTimeLeft(i.expiresAt)}</div>

                <div class="actions">
                    <button class="btn primary" onclick="placeOrder('${i.id}')">Place Order</button>
                </div>
            </div>
        </div>`;
    });
}

/* =========================
   REQUESTS TAB
========================= */
function renderRequests() {

    const el = $(".tab-content");
    if (!el) return;

    el.innerHTML = "";

    requests
        .filter(r => r.status === "pending" && r.userId === uid)
        .forEach(r => {

            el.innerHTML += `
            <div class="panel-card">
                <div class="info">
                    <div class="title">My Request</div>
                    <div class="sub">${r.from} → ${r.to}</div>
                </div>

                <div class="actions">
                    <button class="btn ghost">Menu</button>
                    <button class="btn success">Accept</button>
                    <button class="btn danger">Decline</button>
                </div>
            </div>`;
        });
}

/* =========================
   MY TAB
========================= */
function renderMy() {

    const el = $(".tab-content");
    if (!el) return;

    el.innerHTML = "";

    requests
        .filter(r => r.userId === uid)
        .forEach(r => {

            el.innerHTML += `
            <div class="panel-card">
                <div class="info">
                    <div class="title">My Request</div>
                    <div class="sub">${r.from} → ${r.to} • ${getTimeLeft(r.expiresAt)}</div>
                </div>

                <div class="actions">
                    <button class="btn ghost" onclick="editRequest('${r.id}')">Edit</button>
                    <button class="btn danger" onclick="deleteRequest('${r.id}')">Delete</button>
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
    
        const req = requests.find(r => r.id === a.requestId);
        const intent = intents.find(i => i.id === a.intentId);
    
        if (!req || !intent) return;
    
        if (getTimeLeft(req.expiresAt) === "Expired") return;
        if (getTimeLeft(intent.expiresAt) === "Expired") return;
    
        if (!a.users.includes(uid)) return;

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
   CREATE REQUEST
========================= */
window.createRequest = async () => {
    const visibility = $("#visibilityInput").value;
    const from = $("#formModal input[placeholder*='From']").value;
    const to = $("#formModal input[placeholder*='To']").value;
    const item = $("#formModal input[placeholder*='Item']").value;
    const duration = parseInt($("#durationInput").value);

    if (!from || !to || !item || !duration) return alert("Fill all fields");

    const expiresAt = Date.now() + (duration * 60 * 1000);
    
    const active = requests.filter(r => r.userId === uid && getTimeLeft(r.expiresAt) !== "Expired");
    
    if (active.length >= 3) {
        return alert("Too many active requests");
    }

    await addDoc(collection(db, "requests"), {
        from,
        to,
        item,
        duration,
        expiresAt,
        visibility,
        userId: uid,
        status: "pending",
        createdAt: serverTimestamp()
    });

    closeForm();
};

/* =========================
   ACTIONS
========================= */
window.deleteRequest = async (id) => {
    await deleteDoc(doc(db, "requests", id));
};

window.editRequest = async (id) => {

    await updateDoc(doc(db, "requests", id), {
        status: "editing"
    });

    openForm();
};

window.placeOrder = (id) => {
    alert("Order flow starts here");
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