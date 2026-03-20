import { auth, db } from "./firebase-config.js";
import { 
    doc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

let currentUser = null;
const ADMIN_FEE_PER_ORDER = 25;

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

async function finalizeWalletPayment(paidAmount, action) {
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();

    const totalPaid = userData.totalPaid || 0;
    const feeAccrued = userData.feeAccrued || 0;

    // Current debt
    const currentDebt = Math.max(0, feeAccrued - totalPaid);
    
    // Apply any existing wallet credit to reduce current debt
    let usableCredit = Math.min(userData.walletCredit || 0, currentDebt);
    let remainingDebt = currentDebt - usableCredit;
    let newCredit = (userData.walletCredit || 0) - usableCredit;
    
    // Determine how much still needs Paystack payment
    const amountToPay = Math.max(0, remainingDebt - paidAmount); // paidAmount = what came from Paystack

    if (action === 'pay') {
        if (paidAmount >= currentDebt) {
            // Payment covers debt completely
            const excess = paidAmount - currentDebt;

            await updateDoc(userRef, {
                totalPaid: totalPaid + currentDebt + excess, // sum of previous + debt paid + extra
                feeAccrued: 0, // debt cleared
                walletDueSince: null,
                walletCredit: (userData.walletCredit || 0) + excess // store excess as credit
            });

        } else {
            // Payment partially reduces debt
            await updateDoc(userRef, {
                totalPaid: totalPaid + paidAmount,
                feeAccrued: feeAccrued - paidAmount,
                walletDueSince: null
            });
        }

    } else {
        // Manual deposit (Credit)
        await updateDoc(userRef, {
            totalPaid: totalPaid + usableCredit + paidAmount,
            feeAccrued: Math.max(0, feeAccrued - (usableCredit + paidAmount)),
            walletCredit: newCredit,
            walletDueSince: null
        });
    }

    alert("Payment processed! Redirecting to verify your status...");
    window.location.href = "./dashboard.html";
}