import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "sign-login.html"; return; }
    initTracking(user.uid);
});

// ✅ MATCHES MAP-DETAIL.JS EXACTLY
function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function initTracking(uid) {
    let liveCustomerLoc = null;

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(async (pos) => {
            liveCustomerLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            
            const qActive = query(collection(db, "orders"), where("customerId", "==", uid), where("status", "in", ["approved", "picked_up"]));
            const snap = await getDocs(qActive);
            snap.forEach(d => updateDoc(d.ref, { customerLocation: liveCustomerLoc, lastCustomerUpdate: serverTimestamp() }));
        }, null, { enableHighAccuracy: true });
    }

    const q = query(collection(db, "orders"), where("customerId", "==", uid), where("status", "in", ["approved", "picked_up"]));
    
    onSnapshot(q, (snapshot) => {
        const grid = document.getElementById('activeOrdersGrid');
        grid.innerHTML = snapshot.empty ? `<p style="text-align:center;">No active orders.</p>` : '';

        snapshot.forEach(orderDoc => {
            const order = orderDoc.id;
            const data = orderDoc.data();
            const card = document.createElement('div');
            card.className = 'trust-card history-card';
            grid.appendChild(card);

            onSnapshot(doc(db, "users", data.merchantId), (mSnap) => {
                const mData = mSnap.data();
                if (!mData?.location) return;

                const distM = getDistanceKm(mData.location.lat, mData.location.lng, (liveCustomerLoc?.lat || data.customerLocation?.lat), (liveCustomerLoc?.lng || data.customerLocation?.lng)) * 1000;
                
                // ✅ SYNCED ETA LOGIC
                let etaText = "Syncing...";
                if (distM < 30) {
                    etaText = "Arriving now";
                } else {
                    const mins = Math.ceil(distM / 80);
                    etaText = mins <= 1 ? "Arriving now" : `${mins} mins`;
                }

                card.innerHTML = `
                    <div class="order-info-stack" onclick="window.location.href='./map-detail.html?id=${order}&m=${data.merchantId}'">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <span class="card-tag status-success">${data.status.replace('_', ' ')}</span>
                            <span style="font-weight:bold; color:var(--text-main)">${etaText}</span>
                        </div>
                        <h3>@${data.merchantName || 'Merchant'}</h3>
                        <p style="font-size:0.85rem; opacity:0.8;">${data.route || 'Campus Delivery'}</p>
                    </div>
                `;
            });
        });
    });
}
