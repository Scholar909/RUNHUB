import { auth, db } from "./firebase-config.js";
import { 
    doc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

let currentUser = null;
const ADMIN_FEE_PER_ORDER = 50;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "./sign-login.html";
        return;
    }
    currentUser = user;
    
    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const amount = urlParams.get('amount');

    if (action === 'pay' || action === 'deposit') {
        showDebtPaymentUI(action, amount);
    }
});

function showDebtPaymentUI(action, amount) {
    const walletCard = document.getElementById("walletCard");
    const walletAmountDisp = document.getElementById("walletAmount");
    
    walletCard.style.display = "block";
    walletAmountDisp.innerText = `₦${Number(amount).toLocaleString()}.00`;
    
    // Change wording based on action
    const tag = walletCard.querySelector('.card-tag');
    tag.innerText = action === 'pay' ? "OUTSTANDING DEBT" : "WALLET DEPOSIT";

    // Add a dedicated button for this specific amount
    const btnContainer = document.createElement('div');
    btnContainer.innerHTML = `
        <button class="btn btn-filled" style="margin-top:15px; background:#28a745;" onclick="processWalletPayment(${amount}, '${action}')">
            Pay ₦${amount} Now
        </button>
    `;
    walletCard.appendChild(btnContainer);
}

window.processWalletPayment = async (amount, action) => {
    // TRIGGER PAYSTACK HERE
    // For now, simulating success:
    const confirmed = confirm(`Proceed to pay ₦${amount} via Paystack?`);
    if (!confirmed) return;

    await finalizeWalletPayment(amount, action);
};

async function finalizeWalletPayment(paidAmount, action) {
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();

    // 1. Get current debt one last time
    const ordersQuery = query(collection(db, "orders"), where("merchantId", "==", currentUser.uid));
    const ordersSnap = await getDocs(ordersQuery);
    
    const resetTime = (userData.walletResetAt?.toDate?.() || new Date(0));
    let debtOrders = 0;
    ordersSnap.forEach(d => {
        const data = d.data();
        const ot = (data.processedAt?.toDate?.() || data.timestamp?.toDate?.() || new Date(0));
        if (ot > resetTime && (data.status === 'delivered' || data.status === 'declined')) debtOrders++;
    });

    const currentDebt = debtOrders * ADMIN_FEE_PER_ORDER;

    // 2. Determine the new totalPaid and Reset logic
    if (action === 'pay') {
        // If they pay exactly the debt or more
        const excess = Math.max(0, paidAmount - currentDebt); 
        
        await updateDoc(userRef, {
            totalPaid: excess, // Will be 0 if they paid exactly the debt
            walletResetAt: serverTimestamp(), // This clears the "history" for the next calculation
            walletDueSince: null
        });
    } else {
        // This is a manual deposit (Credit)
        const currentPaid = userData.totalPaid || 0;
        await updateDoc(userRef, {
            totalPaid: currentPaid + paidAmount
        });
    }

    alert("Debt cleared! Redirecting to verify your status...");
    window.location.href = "./dashboard.html";
}


// Keep your existing subscribe function for plans...


/* ---------------------- */
/* SUBSCRIPTION LOGIC */
/* ---------------------- */

window.subscribe = async function(planType, amount) {

    // 🔹 Replace this block with Paystack popup
    const confirmPayment = confirm(
        `Proceed to pay ₦${amount} for ${planType} plan?`
    );

    if (!confirmPayment) return;

    const now = new Date();
    let expiryDate;

    if (planType === "weekly") {
        expiryDate = new Date(now.setDate(now.getDate() + 7));
    } else {
        expiryDate = new Date(now.setDate(now.getDate() + 30));
    }

    const userRef = doc(db, "users", currentUser.uid);

    await updateDoc(userRef, {
        subscription: {
            type: planType,
            startDate: new Date(),
            expiryDate: expiryDate,
            status: "Active"
        },
        walletResetAt: serverTimestamp()
    });

    alert("Payment successful. Please login again.");

    await signOut(auth);
    window.location.href = "./sign-login.html";
};