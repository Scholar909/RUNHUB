import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const categorySelect = document.querySelector('.admin-select');
const policyTextarea = document.querySelector('.policy-textarea');
const updateBtn = document.querySelector('.btn-filled');
const lastUpdateSpan = document.getElementById('lastUpdate');

// --- Auth Protection ---
onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "index.html";
});

// --- Fetch Content on Change ---
categorySelect.addEventListener('change', async (e) => {
    const category = e.target.value;
    if (!category) {
        policyTextarea.value = "";
        return;
    }

    policyTextarea.placeholder = "Loading content...";
    
    try {
        const docRef = doc(db, "platform_legal", category);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            policyTextarea.value = docSnap.data().content;
            const date = docSnap.data().updatedAt?.toDate();
            lastUpdateSpan.innerText = date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "Recently";
        } else {
            policyTextarea.value = "";
            lastUpdateSpan.innerText = "No record found";
        }
    } catch (error) {
        console.error("Error fetching policy:", error);
    }
});

// --- Update Content ---
updateBtn.addEventListener('click', async () => {
    const category = categorySelect.value;
    const content = policyTextarea.value.trim();

    if (!category) return alert("Please select a category first.");
    if (!content) return alert("Content cannot be empty.");

    updateBtn.disabled = true;
    updateBtn.innerText = "Publishing...";

    try {
        await setDoc(doc(db, "platform_legal", category), {
            content: content,
            updatedAt: serverTimestamp()
        });
        alert("Policy updated successfully! Changes are now live.");
    } catch (error) {
        console.error("Update failed:", error);
        alert("Failed to update policy.");
    } finally {
        updateBtn.disabled = false;
        updateBtn.innerText = "Update & Publish Changes";
    }
});

// Navigation Drawer
window.toggleDrawer = () => document.getElementById('navDrawer').classList.toggle('active');
window.handleLogout = () => signOut(auth).then(() => window.location.href = "./admin-login.html");
