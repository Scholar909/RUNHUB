import { auth, db } from "./firebase-config.js";
import { 
    doc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "./sign-login.html";
        return;
    }
    currentUser = user;
    
    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const amount = Number(urlParams.get('amount') || 0);

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    const data = snap.data();
    
    const balance = (data.walletCredit || 0) - (data.feeAccrued || 0);
    
    // Block wrong actions
    if (action === "deposit" && balance < 0) {
        alert("Clear your debt before depositing.");
        window.location.href = "./dashboard.html";
        return;
    }
    
    if (action === "pay" && balance >= 0) {
        alert("No debt to pay.");
        window.location.href = "./dashboard.html";
        return;
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
    // Amount in kobo for Paystack (₦1 = 100 kobo)
    const payAmount = amount * 100;

    const handler = PaystackPop.setup({
        key: 'pk_live_1c0f2f6165bbfe84dfe28a7388b68cee17a2353f', // 🔑 Replace with your Paystack public key
        email: currentUser.email,
        amount: payAmount,
        currency: 'NGN',
        ref: 'NOVAHUB_' + Math.floor(Math.random() * 1000000000),
        metadata: {
            custom_fields: [
                {
                    display_name: "User ID",
                    variable_name: "user_id",
                    value: currentUser.uid
                }
            ]
        },
        callback: async function(response) {
            console.log('Payment successful! Reference:', response.reference);
            // Finalize the payment like you do now
            await finalizeWalletPayment(amount, action);
        },
        onClose: function() {
            alert('Payment cancelled.');
        }
    });

    handler.openIframe();
};

async function finalizeWalletPayment(amount, action) {
    const userRef = doc(db, "users", currentUser.uid);

    try {
        if (action === "deposit") {
            // Safe atomic update
            await updateDoc(userRef, {
                walletCredit: increment(amount)
            });

        else if (action === "pay") {
            const snap = await getDoc(userRef);
            const data = snap.data();
        
            const walletCredit = Number(data.walletCredit || 0);
            const feeAccrued = Number(data.feeAccrued || 0);
        
            const actualDebt = Math.max(0, feeAccrued - walletCredit);
        
            const amountToClear = Math.min(amount, actualDebt);
        
            await updateDoc(userRef, {
                feeAccrued: increment(-amountToClear)
            });
        }

        alert("Payment successful!");
        window.location.href = "./dashboard.html";

    } catch (err) {
        console.error("Payment error:", err);
        alert("Payment failed. Try again.");
    }
}