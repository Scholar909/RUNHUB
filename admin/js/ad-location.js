import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    collection,
    onSnapshot,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

let cachedStaticLocations = [];

// Keep the static locations cache updated in real-time
function startStaticLocationSync() {
    onSnapshot(collection(db, "staticLocations"), (snapshot) => {
        cachedStaticLocations = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });
}

// Optimized Closest Location Finder
function getClosestLocationName(merchantLat, merchantLng) {
    if (cachedStaticLocations.length === 0) return "Loading...";

    let closest = null;
    let minDist = Infinity;

    cachedStaticLocations.forEach(loc => {
        // Using the same getDistance formula from your merchant script
        const dist = getDistance(merchantLat, merchantLng, loc.lat, loc.lng);
        if (dist < minDist) {
            minDist = dist;
            closest = loc.name;
        }
    });

    return closest || "N/A";
}

let map;
let merchantMarkers = {};
let staticMarkers = {};
let tempMarker = null;

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
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


// --- Get User Location Before Map Sync ---
function initMap() {
    const overlay = document.getElementById('loadingOverlay');
    
    startStaticLocationSync(); 
    
    map = L.map('map', { zoomControl: false }).setView([7.1903, 4.5607], 16);
    
    map.whenReady(() => {
    map.invalidateSize();
});
    
    // Normal Map
    const normalLayer = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        {
            attribution: '&copy; OpenStreetMap &copy; CARTO'
        }
    );
    
    // Satellite Layer (Esri Free Satellite)
    const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
            attribution: 'Tiles © Esri'
        }
    );
    
    // Add default layer
    normalLayer.addTo(map);
    
    // Add layer control toggle
    L.control.layers(
        {
            "Normal": normalLayer,
            "Satellite": satelliteLayer
        }
    ).addTo(map);

    // Wait for layout to settle
    setTimeout(() => {
        overlay.style.display = 'none';
        map.invalidateSize();

        // Try geolocation
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => {
                    map.setView([pos.coords.latitude, pos.coords.longitude], 16);
                },
                err => console.warn("Location unavailable:", err)
            );
        }

        syncMerchants();
        syncStaticLocations();
    }, 200);
}

// --- 2. Live Merchant Sync (Rule: Real-time pins for logged-in merchants) ---
function syncMerchants() {
    const q = query(collection(db, "users"), where("role", "==", "merchant"));
    
    onSnapshot(q, (snapshot) => {
        const activeIds = new Set();
        const tray = document.getElementById('merchantFooter');
        tray.innerHTML = ''; // 🔥 CLEAR BEFORE RE-ADDING
        
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const id = doc.id;
            activeIds.add(id);
        
            const lastUpdate = data.locationUpdatedAt?.toDate?.();
            const now = new Date();
            
            const isFresh = lastUpdate && (now - lastUpdate) < (5 * 60 * 1000); // 5 mins
            
            if (data.location?.lat && data.location?.lng && isFresh) {
                // This now happens in real-time as the merchant moves
                updateMerchantMarker(id, data, isFresh);
                renderMerchantCard(id, data);
            }
        });

        // Cleanup markers for logged-out merchants
        Object.keys(merchantMarkers).forEach(id => {
            if (!activeIds.has(id)) {
                map.removeLayer(merchantMarkers[id]);
                delete merchantMarkers[id];
            }
        });
    });
}

function updateMerchantMarker(id, data) {
    const { lat, lng } = data.location;
    const closestName = getClosestLocationName(lat, lng);
    
    if (!lat || !lng) return;
    
    const icon = L.icon({
        iconUrl: isFresh ? 'green-dot.png' : 'red-dot.png',
        iconSize: [25, 25]
    });

    if (merchantMarkers[id]) {
        merchantMarkers[id].setLatLng([lat, lng]);
        
        merchantMarkers[id].setIcon(icon);
        // Update the popup content dynamically in case they moved closer to a new spot
        merchantMarkers[id].setPopupContent(`<b>${data.username}</b><br>📍 Near: ${closestName}`);
    } else {
        const marker = L.marker([lat, lng], {icon}).addTo(map)
            .bindPopup(`<b>${data.username}</b><br>📍 Near: ${closestName}`);
        merchantMarkers[id] = marker;
    }
}

// --- 3. Static Location Management (Buildings/Restaurants) ---
async function syncStaticLocations() {
    const q = collection(db, "staticLocations");

    onSnapshot(q, (snapshot) => {
        const tray = document.getElementById('restaurantFooter');
        tray.innerHTML = '';

        snapshot.docs.forEach(docSnap => {

            const data = docSnap.data();
            const id = docSnap.id;
            const pos = [data.lat, data.lng];

            // ADD MARKER IF NOT EXISTS
            if (!staticMarkers[id]) {

                const marker = L.circleMarker(pos, {
                    color: '#007aff',
                    radius: 8
                }).addTo(map).bindPopup(`<b>${data.name}</b>`);

                staticMarkers[id] = marker;

                let pressTimer;

                marker.on('mousedown touchstart', () => {
                    pressTimer = setTimeout(() => {
                        editOrDeleteLocation(id, data);
                    }, 700);
                });

                marker.on('mouseup touchend', () => clearTimeout(pressTimer));

                marker.on('contextmenu', () => {
                    editOrDeleteLocation(id, data);
                });
            }

            // ADD CARD TO FOOTER
            const card = document.createElement('div');
            card.className = 'merchant-card';
            card.innerHTML = `<span>📍</span><span>${data.name}</span>`;
            card.onclick = () => map.flyTo(pos, 18);

            attachLongPress(card, () => editOrDeleteLocation(id, data));

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
        <img src="${data.profilePhoto || 'img/default.png'}">
        <span>${data.username}</span>
    `;
    // Rule: Click tray card to zoom into merchant pin
    card.onclick = () => map.flyTo([data.location.lat, data.location.lng], 18);
    tray.appendChild(card);
}

async function editOrDeleteLocation(id, data) {
    const action = prompt(
        `Location: ${data.name}\n\nType:\n1 to EDIT name\n2 to DELETE location`
    );

    if (action === "1") {
        const newName = prompt("Enter new name:", data.name);
        if (newName && newName.trim() !== "") {
            await updateDoc(doc(db, "staticLocations", id), {
                name: newName.trim()
            });
        }
    }

    if (action === "2") {
        if (confirm(`Delete "${data.name}" permanently?`)) {
            await deleteDoc(doc(db, "staticLocations", id));
        }
    }
}

function attachLongPress(element, callback) {
    let pressTimer;

    element.addEventListener("mousedown", () => {
        pressTimer = setTimeout(callback, 700); // 700ms hold
    });

    element.addEventListener("mouseup", () => clearTimeout(pressTimer));
    element.addEventListener("mouseleave", () => clearTimeout(pressTimer));

    // Mobile support
    element.addEventListener("touchstart", () => {
        pressTimer = setTimeout(callback, 700);
    });

    element.addEventListener("touchend", () => clearTimeout(pressTimer));
}

window.toggleDrawer = () => document.getElementById('navDrawer').classList.toggle('active');

window.handleLogout = async () => {
    await signOut(auth);
    window.location.href = "./admin-login.html";
};

// --- Start ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "./admin-login.html";
        return;
    }

    initMap();
});

document.getElementById('addRestaurantBtn').onclick = window.toggleAddLocation;

// --- Search Functionality ---
const searchWrapper = document.getElementById('searchWrapper');
const searchToggle = document.getElementById('searchToggle');
const searchInput = document.getElementById('mapSearchInput');

// 1. Toggle Animation
searchToggle.onclick = () => {
    searchWrapper.classList.toggle('active');
    if (searchWrapper.classList.contains('active')) {
        searchInput.focus();
    } else {
        searchInput.value = '';
        filterCards(''); // Reset filters when closing
    }
};

// 2. Real-time Filtering Logic
searchInput.oninput = (e) => {
    filterCards(e.target.value.toLowerCase());
};

function filterCards(query) {
    // Select all cards from both trays
    const allCards = document.querySelectorAll('.merchant-card');
    
    allCards.forEach(card => {
        // Get the text inside the card (merchant name or restaurant name)
        const name = card.innerText.toLowerCase();
        
        if (name.includes(query)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}
