import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- 1. Auth Observer ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is authenticated, fetch their specific profile data
        fetchUserProfile(user.uid);
    } else {
        // No user session found, redirect to login
        window.location.href = "./sign-login.html";
    }
});

// --- 2. Fetch & Populate Profile Data ---
async function fetchUserProfile(uid) {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();

            // Safe helper function to update UI text
            const setUI = (id, value) => {
                const element = document.getElementById(id);
                if (element) {
                    element.textContent = value || "Not Provided";
                }
            };

            // Mapping Firestore fields to HTML IDs
            setUI('fullName', data.fullName);
            setUI('displayUsername', `@${data.username}`);
            setUI('matricNum', data.matricNo);
            setUI('level', `${data.level}L`); // Adds 'L' suffix to level (e.g., 400L)
            setUI('gender', data.gender);
            setUI('emailAddr', data.email);
            setUI('phoneNum', data.phoneNumber);
            setUI('roomDetails', data.location);
            
            // Handle Nested Bank Details
            if (data.bankDetails) {
                setUI('bankDetails', `${data.bankDetails.bankName} (${data.bankDetails.accName})`);
                setUI('accNum', data.bankDetails.accNo);
            }

            // Generate Initials Avatar
            const profileImg = document.getElementById('profileImage');
            if (profileImg && data.fullName) {
                const initials = data.fullName
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase();
                profileImg.src = `https://ui-avatars.com/api/?name=${initials}&background=007aff&color=fff&size=150`;
            }

        } else {
            console.error("No Firestore document found for this UID!");
        }
    } catch (error) {
        console.error("Error retrieving profile:", error);
    }
}

// --- 3. Interaction Logic ---
window.contactSupport = () => {
    const adminPhone = "2349168873680"; 
    const message = encodeURIComponent("Hello RUNHUB Admin, I am a merchant and I need assistance with my profile/account.");
    window.location.href = `https://wa.me/${adminPhone}?text=${message}`;
};
/**
 * Initializes button listeners once the DOM is ready
 */
const initializeListeners = () => {
    // Main Logout Button (Red button in content)
    const mainLogout = document.getElementById('mainLogoutBtn');
    if (mainLogout) {
        mainLogout.onclick = () => handleLogout();
    }

    // Global toggle for the Drawer
    window.toggleDrawer = () => {
        const drawer = document.getElementById('navDrawer');
        if (drawer) drawer.classList.toggle('active');
    };

    // Global handleLogout for the Drawer button and Main button
    window.handleLogout = async () => {
        if (confirm("Are you sure you want to logout of RUN HUB?")) {
            try {
                await signOut(auth);
                window.location.href = "./sign-login.html";
            } catch (error) {
                alert("Logout failed. Please try again.");
            }
        }
    };
};

// Ensure scripts run after HTML is fully parsed to avoid 'null' errors
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeListeners);
} else {
    initializeListeners();
}
