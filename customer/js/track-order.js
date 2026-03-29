import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "sign-login.html"; return; }
    initTracking(user.uid);
});

// ✅ HIGH-ACCURACY HAVERSINE (MATCHES MAP-DETAIL.JS EXACTLY)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

function initTracking(uid) {
    // 1. Listen for order updates (Only approved or picked_up)
    const q = query(
        collection(db, "orders"), 
        where("customerId", "==", uid), 
        where("status", "in", ["approved", "picked_up"])
    );
    
    onSnapshot(q, (snapshot) => {
        const grid = document.getElementById('activeOrdersGrid');
        if (!grid) return;
        
        grid.innerHTML = snapshot.empty ? `<p style="text-align:center; padding:20px; opacity:0.6;">No active orders.</p>` : '';

        snapshot.forEach(orderDoc => {
            const orderId = orderDoc.id;
            const orderData = orderDoc.data();
            
            // Create the card container
            const card = document.createElement('div');
            card.className = 'trust-card history-card';
            card.id = `order-card-${orderId}`;
            grid.appendChild(card);

            // 2. Listen to the Merchant's live location
            onSnapshot(doc(db, "users", orderData.merchantId), (mSnap) => {
                const mData = mSnap.data();
                if (!mData?.location || !orderData.customerLocation) return;

                // ✅ FIX: Use ONLY the saved location from the moment of order
                const cLat = orderData.customerLocation.lat;
                const cLng = orderData.customerLocation.lng;

                let etaText = "Calculating...";
                
                const distM = getDistance(mData.location.lat, mData.location.lng, cLat, cLng);
                
                // ✅ SYNCED ETA LOGIC (Matches Map-Detail exactly)
                if (distM < 30) {
                    etaText = "Arriving now";
                } else {
                    const mins = Math.ceil(distM / 80);
                    etaText = mins <= 1 ? "Arriving now" : `${mins} mins`;
                }

                card.innerHTML = `
                    <div class="order-info-stack" onclick="window.location.href='./map-detail.html?id=${orderId}&m=${orderData.merchantId}'">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <span class="card-tag status-success">${orderData.status.replace('_', ' ').toUpperCase()}</span>
                            <span style="font-weight:bold; color:#34c759">${etaText}</span>
                        </div>
                        <h3 style="margin:0; font-size:1.1rem;">@${orderData.merchantName || 'Merchant'}</h3>
                        <p style="font-size:0.85rem; opacity:0.7; margin:5px 0;">${orderData.route || 'Campus Delivery'}</p>
                        <p style="font-size:0.75rem; opacity:0.5;">Tap to view live map</p>
                    </div>
                `;
            });
        });
    });
}


window.toggleDrawer = () => document.getElementById('navDrawer').classList.toggle('active');

window.handleLogout = async () => {
    await signOut(auth);
    window.location.href = "./admin-login.html";
};