import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// Configuration
const ADMIN_PHONE = "2349168873680";
const API_KEY = "7465463"; // Your CallMeBot API Key
let currentUserData = null;

// 1. Generate a unique Reference ID for the customer complaint
const ticketId = "CUST-" + Math.floor(Date.now() / 10000);

// --- Auth Observer ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const docSnap = await getDoc(doc(db, "users", user.uid));
        if (docSnap.exists()) {
            currentUserData = docSnap.data();
        }
    } else {
        window.location.href = "index.html";
    }
});

// --- Drawer Logic ---
window.toggleDrawer = () => {
    document.getElementById('navDrawer').classList.toggle('active');
};

// --- Logout Logic ---
window.handleLogout = async () => {
    if (confirm("Logout from Support?")) {
        await signOut(auth);
        window.location.href = "index.html";
    }
};

/**
 * FEATURE: Submit Customer Report
 * Sends data to Firestore and alerts Admin via WhatsApp
 */
async function submitReport() {
    // Selectors based on your HTML structure
    const orderIdInput = document.querySelector('.report-card input[type="text"]');
    const messageInput = document.querySelector('.report-card textarea');
    const submitBtn = document.querySelector('.report-card .btn-filled');

    const orderId = orderIdInput.value.trim() || "N/A";
    const message = messageInput.value.trim();

    if (!message) {
        alert("Please describe the problem so we can help you.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "Sending...";

    try {
        // 1. Save Complaint to Firestore
        await addDoc(collection(db, "customer_complaints"), {
            customerUid: auth.currentUser.uid,
            customerName: currentUserData.fullName,
            customerPhone: currentUserData.phoneNumber,
            ticketId: ticketId,
            orderId: orderId,
            message: message,
            status: "pending",
            timestamp: serverTimestamp()
        });

        // 2. Prepare WhatsApp Notification for Admin
        const responseGreeting = `Hi ${currentUserData.fullName}, this is RUNHUB Support regarding your ticket ${ticketId}.`;
        const adminReplyUrl = `https://wa.me/${currentUserData.phoneNumber}?text=${encodeURIComponent(responseGreeting)}`;

        const notificationText = encodeURIComponent(
            `*NEW CUSTOMER ISSUE*\n\n` +
            `*Ticket:* ${ticketId}\n` +
            `*Customer:* ${currentUserData.fullName}\n` +
            `*Title:* ${orderId}\n` +
            `*Issue:* ${message}\n\n` +
            `*REPLY TO CUSTOMER:* \n${adminReplyUrl}`
        );

        // 3. CallMeBot API Call
        const callMeBotUrl = `https://api.callmebot.com/whatsapp.php?phone=${ADMIN_PHONE}&text=${notificationText}&apikey=${API_KEY}`;

        await fetch(callMeBotUrl, { mode: 'no-cors' });

        alert(`Report Sent! Your Reference ID is ${ticketId}. Admin will contact you shortly.`);
        
        // Reset Form
        orderIdInput.value = "";
        messageInput.value = "";

    } catch (error) {
        console.error("Submission Error:", error);
        alert("Failed to send report. Please check your connection.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Send Report";
    }
}

// Bind the function to the button (Since it's a module, we attach it to window or use addEventListener)
document.querySelector('.report-card .btn-filled').addEventListener('click', submitReport);
