import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    collection, onSnapshot, doc, addDoc, serverTimestamp, getDocs, query, where 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

let map;
let merchantMarkers = {};
let staticMarkers = {};
let tempMarker = null;

// --- Get User Location Before Map Sync ---
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([6.6726, 3.1614], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    // Hide loading overlay so footer/nav are usable
    document.getElementById('loadingOverlay').style.display = 'none';

    // Try to get admin location to center map and unlock live pins
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                map.setView([lat, lng], 16);

                // Now live merchant pins can appear
                syncMerchants(true); // pass true = admin location is ON
            },
            (err) => {
                console.warn("Admin location not available:", err);
                // Location off → don't show merchant pins yet
                syncMerchants(false); // pass false = admin location is OFF
            }
        );
    } else {
        console.warn("Geolocation not supported");
        syncMerchants(false);
    }

    // Static locations can sync regardless
    syncStaticLocations();
}

// --- 2. Live Merchant Sync (Rule: Real-time pins for logged-in merchants) ---
function syncMerchants(adminLocationOn) {
    const q = query(collection(db, "users"), where("accountType", "==", "merchant"));
    
    onSnapshot(q, (snapshot) => {
        const tray = document.getElementById('merchantFooter');
        tray.innerHTML = '';

        snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            const id = change.doc.id;

            // Admin location ON → show only merchants with location
            if (data.location && data.location.lat) {
                updateMerchantMarker(id, data);
                renderMerchantCard(id, data);
            } else if (merchantMarkers[id]) {
                map.removeLayer(merchantMarkers[id]);
                delete merchantMarkers[id];
            }
        });
    });
}

function updateMerchantMarker(id, data) {
    const pos = [data.location.lat, data.location.lng];
    
    // Determine session status for label
    let status = data.isActive ? "Available" : "Unavailable";
    
    if (merchantMarkers[id]) {
        merchantMarkers[id].setLatLng(pos);
    } else {
        const marker = L.marker(pos).addTo(map)
            .bindPopup(`<b>${data.username}</b><br>Status: ${status}`);
        merchantMarkers[id] = marker;
    }
}

// --- 3. Static Location Management (Buildings/Restaurants) ---
async function syncStaticLocations() {
    const q = collection(db, "staticLocations");
    onSnapshot(q, (snapshot) => {
        const tray = document.getElementById('restaurantFooter');
        tray.innerHTML = '';
        
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const pos = [data.lat, data.lng];
            
            // Add to Map
            if (!staticMarkers[doc.id]) {
                staticMarkers[doc.id] = L.circleMarker(pos, { color: '#007aff', radius: 8 }).addTo(map)
                    .bindPopup(`<b>${data.name}</b>`);
            }
            
            // Add to Tray
            const card = document.createElement('div');
            card.className = 'merchant-card';
            card.innerHTML = `<span>📍</span><span>${data.name}</span>`;
            card.onclick = () => map.flyTo(pos, 18);
            tray.appendChild(card);
        });
    });
}

// --- 4. Interactive Pin Placement ---
window.toggleAddLocation = () => {
    const btn = document.getElementById('addRestaurantBtn');
    if (btn.innerText === '+') {
        alert("Click on the map to place a new location pin.");
        map.on('click', onMapClick);
        btn.innerText = '×';
        btn.style.background = '#ff3b30';
    } else {
        cancelLocationPlacement();
    }
};

function onMapClick(e) {
    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = L.marker(e.latlng, { draggable: true }).addTo(map);
    document.getElementById('confirmBtn').style.display = 'flex';
}

function cancelLocationPlacement() {
    if (tempMarker) map.removeLayer(tempMarker);
    map.off('click');
    document.getElementById('confirmBtn').style.display = 'none';
    const btn = document.getElementById('addRestaurantBtn');
    btn.innerText = '+';
    btn.style.background = '#007aff';
}

// Save to Firebase
document.getElementById('confirmBtn').onclick = () => {
    const name = prompt("Enter Location Name (e.g., Cafeteria, Science Block):");
    if (name && tempMarker) {
        const pos = tempMarker.getLatLng();
        addDoc(collection(db, "staticLocations"), {
            name: name,
            lat: pos.lat,
            lng: pos.lng,
            createdAt: serverTimestamp()
        });
        cancelLocationPlacement();
    }
};

// --- 5. UI Helpers ---
function renderMerchantCard(id, data) {
    const tray = document.getElementById('merchantFooter');
    const card = document.createElement('div');
    card.className = 'merchant-card';
    card.innerHTML = `
        <img src="${data.profilePic || 'img/default.png'}">
        <span>${data.username}</span>
    `;
    // Rule: Click tray card to zoom into merchant pin
    card.onclick = () => map.flyTo([data.location.lat, data.location.lng], 18);
    tray.appendChild(card);
}

window.toggleDrawer = () => document.getElementById('navDrawer').classList.toggle('active');

window.handleLogout = async () => {
    await signOut(auth);
    window.location.href = "./admin-login.html";
};

// --- Start ---
onAuthStateChanged(auth, (user) => {
    if (user) initMap();
});

document.getElementById('addRestaurantBtn').onclick = window.toggleAddLocation;
