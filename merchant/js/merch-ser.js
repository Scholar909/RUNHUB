import { auth, db } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

let currentMerchant = null;
const ADMIN_PHONE = "2349168873680";
const API_KEY = "7465463";

// Generate a random Reference ID when the page loads
const ticketId = "REF-" + Math.floor(Date.now() / 10000);

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const docSnap = await getDoc(doc(db, "users", user.uid));
        if (docSnap.exists()) {
            currentMerchant = docSnap.data();
            // Show the generated ID in the input field
            document.getElementById('auto-ref').value = ticketId;
        }
    } else {
        window.location.href = "./sign-login.html";
    }
});

window.toggleDrawer = () => document.getElementById('navDrawer').classList.toggle('active');

window.contactSupport = () => {
    const adminPhone = "2349168873680"; 
    const message = encodeURIComponent("Hello RUNHUB Admin, I am a merchant and I need assistance with my account.");
    window.location.href = `https://wa.me/${adminPhone}?text=${message}`;
};

/**
 * FEATURE: Dispute Submission with CallMeBot Notification
 */
window.submitDispute = async () => {
    const category = document.getElementById('issue-category').value;
    const explanation = document.getElementById('issue-explanation').value.trim();
    const submitBtn = document.querySelector('.report-section .btn-filled');

    if (!explanation) {
        alert("Please provide an explanation of the issue.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "Processing...";

    try {
        const timeNow = new Date().toLocaleString();
        
        // 1. Save to Firestore
        await addDoc(collection(db, "complaints"), {
            merchantUid: auth.currentUser.uid,
            merchantName: currentMerchant.fullName,
            merchantPhone: currentMerchant.phoneNumber,
            ticketId: ticketId,
            category: category,
            message: explanation,
            status: "pending",
            timestamp: serverTimestamp()
        });

        // 2. Format the Response Message
        const responseMsg = `Hi ${currentMerchant.fullName}, I am replying to your RUNHUB ticket ${ticketId} regarding ${category}.`;
        
        // 3. ENCODE THE REPLY URL (First Level)
        const adminReplyUrl = `https://wa.me/${currentMerchant.phoneNumber}?text=${encodeURIComponent(responseMsg)}\n`;

        // 4. Construct the Notification Message
        // Use encodeURIComponent on the values to ensure special characters don't break the string
        const notificationMessage = encodeURIComponent(
            `*RUNHUB DISPUTE ALERT*\n\n` +
            `*Ticket:* ${ticketId}\n` +
            `*Category:* ${category}\n` +
            `*Merchant:* ${currentMerchant.fullName}\n` +
            `*Details:* ${explanation}\n\n` +
            `*REPLY TO MERCHANT:* \n${adminReplyUrl}`
        );

        // 5. Final API Call
        // The notificationMessage is now safely bundled
        const callMeBotUrl = `https://api.callmebot.com/whatsapp.php?phone=${ADMIN_PHONE}&text=${notificationMessage}&apikey=${API_KEY}`;

        await fetch(callMeBotUrl, {
            mode: 'no-cors'
        });

        alert("Submitted Successfully! Admin has been notified.");
        document.getElementById('issue-explanation').value = "";

    } catch (error) {
        console.error("Dispute Error:", error);
        alert("Error submitting. Please check your internet.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Submit to Admin";
    }
};
