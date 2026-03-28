import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

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
    let liveCustomerLoc = null;

    // 1. WATCH & PUSH: This ensures the Merchant always sees the Customer
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(async (pos) => {
            liveCustomerLoc = { 
                lat: pos.coords.latitude, 
                lng: pos.coords.longitude 
            };

            // ✅ CRITICAL: Update the customer's current position for ALL active orders
            // This allows the merchant's app to stay in sync
            const activeOrdersQuery = query(
                collection(db, "orders"),
                where("customerId", "==", uid),
                where("status", "in", ["approved", "picked_up"])
            );
            
            const activeSnaps = await getDocs(activeOrdersQuery);
            activeSnaps.forEach(async (orderDoc) => {
                await updateDoc(doc(db, "orders", orderDoc.id), {
                    customerLocation: liveCustomerLoc,
                    lastCustomerUpdate: serverTimestamp()
                });
            });

        }, (err) => console.error("Location error", err), {
            enableHighAccuracy: true,
            maximumAge: 0
        });
    }

    // 2. RENDER THE LIST
    const q = query(
        collection(db, "orders"),
        where("customerId", "==", uid),
        where("status", "in", ["approved", "picked_up"])
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
            
            const card = document.createElement('div');
            card.className = 'trust-card history-card';
            card.innerHTML = `<p style="padding:20px; text-align:center;">Syncing...</p>`;
            grid.appendChild(card);

            // Listen to the Merchant's live location from their User Profile
            onSnapshot(doc(db, "users", order.merchantId), (mSnap) => {
                const mData = mSnap.data();
                if (!mData || !mData.location) return;

                const merchantLoc = mData.location;
                // Use the live local GPS if available, otherwise fallback to the DB version
                const effectiveCustLoc = liveCustomerLoc || order.customerLocation;

                let etaText = "Tracking...";
                if (effectiveCustLoc && merchantLoc) {
                    etaText = calculateETA(
                        merchantLoc.lat, merchantLoc.lng,
                        effectiveCustLoc.lat, effectiveCustLoc.lng
                    );
                }

                card.onclick = () => window.location.href = `./map-detail.html?id=${orderId}&m=${order.merchantId}`;
                card.innerHTML = `
                    <div class="order-info-stack">
                        <div class="card-tag status-success" style="display:flex; justify-content:space-between; align-items:center;">
                            <span>${order.status.replace('_', ' ').toUpperCase()}</span>
                            <span style="font-weight:bold; color:var(--text-main)">${etaText}</span>
                        </div>
                        <div class="order-header">
                            <h3>@${order.merchantName || 'Merchant'}</h3>
                        </div>
                        <div class="order-summary">
                            <p>${order.route || 'Campus Delivery'}</p>
                            <p style="font-size:0.7rem; color:var(--accent)">ID: ...${orderId.slice(-5)}</p>
                        </div>
                    </div>
                    <button class="btn btn-outline" style="margin-top:10px; width:100%">View Live Map</button>
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