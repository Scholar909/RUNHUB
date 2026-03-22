import { auth, db } from "./firebase-config.js";
import { 
    doc, setDoc, getDoc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

// --- INIT ---
let currentUser = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "./sign-login.html";
        return;
    }

    currentUser = user;
    loadSavedAlert();
});

// --- FORMAT PHONE ---
function formatPhone(phone) {
    phone = phone.replace(/\D/g, ""); // remove non-digits

    if (phone.startsWith("0")) {
        phone = "234" + phone.substring(1);
    }

    if (!phone.startsWith("234")) {
        phone = "234" + phone;
    }

    return phone;
}

// --- SAVE ALERT ---
window.saveAlertDetails = async () => {
    let phone = document.getElementById("phoneInput").value.trim();
    let api = document.getElementById("apiInput").value.trim();

    if (!phone || !api) {
        alert("Enter phone and API key");
        return;
    }

    phone = formatPhone(phone);
    api = api.replace(/\s/g, "");

    if (api.length !== 7) {
        alert("API key must be 7 digits");
        return;
    }

    const ref = doc(db, "alertSettings", currentUser.uid);

    await setDoc(ref, {
        phone,
        api,
        enabled: true,
        createdAt: Date.now()
    });

    showSaved(phone);
};

window.toggleAlerts = async () => {
    const ref = doc(db, "alertSettings", currentUser.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) return;

    const current = snap.data().enabled;

    await setDoc(ref, {
        ...snap.data(),
        enabled: !current
    });

    loadSavedAlert(); // refresh UI
};

// --- LOAD SAVED ---
// Add this so the UI refreshes correctly
window.loadSavedAlert = async () => { 
    if (!auth.currentUser) return; // Guard clause
    const ref = doc(db, "alertSettings", auth.currentUser.uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
        const data = snap.data();
        showSaved(data.phone, data.enabled);
    }
};

// --- SHOW SAVED UI ---
// This doesn't need to be on window unless called by HTML, 
// but it's safer to keep as a standard function.
function showSaved(phone, enabled = true) {
    const formCard = document.getElementById("alertFormCard");
    const savedCard = document.getElementById("savedCard");
    
    if(formCard && savedCard) {
        formCard.classList.add("hidden");
        savedCard.classList.remove("hidden");
        document.getElementById("savedNumber").innerText = phone;
        const toggleBtn = document.getElementById("toggleBtn");
        toggleBtn.innerText = enabled ? "Disable Alerts" : "Enable Alerts";
    }
}


// --- EDIT ---
window.editAlert = () => {
    document.getElementById("alertFormCard").classList.remove("hidden");
    document.getElementById("savedCard").classList.add("hidden");
};

// --- DELETE ---
window.deleteAlert = async () => {
    const ref = doc(db, "alertSettings", currentUser.uid);
    await deleteDoc(ref);

    location.reload();
};

// --- NAV ---
window.toggleDrawer = () => {
    document.getElementById("navDrawer").classList.toggle("active");
};

window.handleLogout = async () => {
    await auth.signOut();
    window.location.href = "./sign-login.html";
};