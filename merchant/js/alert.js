import { auth, db } from "./firebase-config.js";
import { 
    doc, setDoc, getDoc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

// --- CONFIG ---
// This is the key change you requested
const COLLECTION_NAME = "merchant_alerts"; 

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "./sign-login.html"; // Redirect to merchant login
        return;
    }
    currentUser = user;
    loadSavedAlert();
});

// --- HELPER: GET REF ---
// Using a helper function prevents typos in the collection name
const getAlertRef = () => doc(db, COLLECTION_NAME, currentUser.uid);

// --- FORMAT PHONE ---
function formatPhone(phone) {
    phone = phone.replace(/\D/g, ""); 
    if (phone.startsWith("0")) phone = "234" + phone.substring(1);
    if (!phone.startsWith("234")) phone = "234" + phone;
    return phone;
}

// --- SAVE MERCHANT ALERT ---
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

    try {
        await setDoc(getAlertRef(), {
            phone,
            api,
            enabled: true,
            userType: "merchant", // Good for filtering later
            updatedAt: Date.now()
        });
        loadSavedAlert(); 
    } catch (error) {
        console.error("Error saving:", error);
    }
};

// --- TOGGLE ---
window.toggleAlerts = async () => {
    const ref = getAlertRef();
    const snap = await getDoc(ref);

    if (snap.exists()) {
        await setDoc(ref, {
            ...snap.data(),
            enabled: !snap.data().enabled
        }, { merge: true });
        loadSavedAlert();
    }
};

// --- LOAD ---
window.loadSavedAlert = async () => { 
    if (!currentUser) return;
    const snap = await getDoc(getAlertRef());

    if (snap.exists()) {
        const data = snap.data();
        showSaved(data.phone, data.enabled);
    }
};

function showSaved(phone, enabled = true) {
    const formCard = document.getElementById("alertFormCard");
    const savedCard = document.getElementById("savedCard");
    
    if(formCard && savedCard) {
        formCard.classList.add("hidden");
        savedCard.classList.remove("hidden");
        document.getElementById("savedNumber").innerText = phone;
        document.getElementById("toggleBtn").innerText = enabled ? "Disable Alerts" : "Enable Alerts";
    }
}

window.editAlert = () => {
    document.getElementById("alertFormCard").classList.remove("hidden");
    document.getElementById("savedCard").classList.add("hidden");
};

window.deleteAlert = async () => {
    if(confirm("Are you sure you want to delete these alert settings?")) {
        await deleteDoc(getAlertRef());
        location.reload();
    }
};

window.toggleDrawer = () => {
    const drawer = document.getElementById('navDrawer');
    if (drawer) drawer.classList.toggle('active');
};

window.handleLogout = async () => {
    try {
        await signOut(auth);
        window.location.href = "./sign-login.html";
    } catch (error) {
        console.error("Logout failed", error);
    }
};
