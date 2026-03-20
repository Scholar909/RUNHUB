import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "sign-login.html"; return; }
    initTracking(user.uid);
});

function initTracking(uid) {
    const q = query(
        collection(db, "orders"),
        where("customerId", "==", uid),
        where("status", "==", "approved") // Only show approved/active ones
    );

    onSnapshot(q, (snapshot) => {
        const grid = document.getElementById('activeOrdersGrid');
        grid.innerHTML = '';

        if (snapshot.empty) {
            grid.innerHTML = `<p class="hero-description" style="text-align:center;">No active orders found.</p>`;
            return;
        }

        snapshot.forEach(doc => {
            const order = doc.data();
            const orderId = doc.id;
            
            const card = document.createElement('div');
            card.className = 'trust-card history-card';
            card.style.cursor = 'pointer';
            card.onclick = () => window.location.href = `./map-detail.html?id=${orderId}&m=${order.merchantId}`;

            card.innerHTML = `
                <div class="order-info-stack">
                    <div class="card-tag status-success">IN TRANSIT</div>
                    <div class="order-header">
                        <h3>@${order.merchantName}</h3>
                    </div>
                    <div class="order-summary">
                        <p>${order.route || 'Campus Delivery'}</p>
                        <p style="font-size:0.7rem; color:var(--accent)">₦${order.total}</p>
                    </div>
                </div>
                <button class="btn btn-outline">Track</button>
            `;
            grid.appendChild(card);
        });
    });
}

window.toggleDrawer = () => {
    document.getElementById('navDrawer').classList.toggle('active');
};

window.handleLogout = async () => {
    await auth.signOut();
    window.location.href = "./sign-login.html";
};