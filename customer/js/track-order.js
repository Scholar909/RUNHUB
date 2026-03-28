import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, query, where, onSnapshot, doc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "sign-login.html"; return; }
    initTracking(user.uid);
});

// Add this helper function at the top of your file
function calculateETA(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return "Calculating...";
    
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceInKm = R * c; 
    const distanceInMeters = distanceInKm * 1000;

    // 1. Check proximity first (If within 30 meters, they are at the same spot)
    if (distanceInMeters < 30) return "Arriving now";

    // 2. Calculate walking time (average 80 meters per minute)
    // We remove the hardcoded +2 buffer to allow for 1-minute estimates
    const timeInMinutes = Math.ceil(distanceInMeters / 80);
    
    if (timeInMinutes <= 1) return "Arriving now";
    return `~${timeInMinutes} mins away`;
}


function initTracking(uid) {
    const q = query(
        collection(db, "orders"),
        where("customerId", "==", uid),
        where("status", "in", ["approved", "picked_up"]) // Show both approved and transit
    );
    
    onSnapshot(q, (snapshot) => {
        const grid = document.getElementById('activeOrdersGrid');
        grid.innerHTML = '';

        if (snapshot.empty) {
            grid.innerHTML = `<p class="hero-description" style="text-align:center;">No active orders found.</p>`;
            return;
        }

        snapshot.forEach(orderDoc => {
            const order = orderDoc.data();
            const orderId = orderDoc.id;
            
            // Create the card immediately
            const card = document.createElement('div');
            card.className = 'trust-card history-card';
            card.innerHTML = `<p style="padding:20px; text-align:center;">Syncing with Merchant...</p>`;
            grid.appendChild(card);

            // Real-time listener for the Merchant's specific location
            onSnapshot(doc(db, "users", order.merchantId), (mSnap) => {
                const mData = mSnap.data();
                const customerLoc = order.customerLocation; // Saved during submitOrder
                const merchantLoc = mData.location; // Updated by merchant's location.js

                let etaText = "Tracking...";
                if (customerLoc && merchantLoc) {
                    etaText = calculateETA(
                        merchantLoc.lat, merchantLoc.lng,
                        customerLoc.lat, customerLoc.lng
                    );
                }

                card.onclick = () => window.location.href = `./map-detail.html?id=${orderId}&m=${order.merchantId}`;
                card.innerHTML = `
                    <div class="order-info-stack">
                        <div class="card-tag status-success" style="display:flex; justify-content:space-between; align-items:center;">
                            <span>IN TRANSIT</span>
                            <span style="font-weight:bold; color:var(--text-main)">${etaText}</span>
                        </div>
                        <div class="order-header">
                            <h3>@${order.merchantName}</h3>
                        </div>
                        <div class="order-summary">
                            <p>${order.route || 'Campus Delivery'}</p>
                            <p style="font-size:0.7rem; color:var(--accent)">Order ID: ...${orderId.slice(-5)}</p>
                        </div>
                    </div>
                    <button class="btn btn-outline">View Map</button>
                `;
            });
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