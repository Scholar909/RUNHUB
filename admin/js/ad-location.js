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

async function getClosestLocationName(merchantLatLng) {
    const staticSnap = await getDocs(collection(db, "staticLocations"));
    let closest = null;
    let minDist = Infinity;

    staticSnap.forEach(doc => {
        const loc = doc.data();
        const dist = Math.hypot(merchantLatLng.lat - loc.lat, merchantLatLng.lng - loc.lng); // rough distance
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

// --- Get User Location Before Map Sync ---
function initMap() {
    const overlay = document.getElementById('loadingOverlay');
    
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
    const q = query(
        collection(db, "users"),
        where("role", "==", "merchant"),
        where("isActive", "==", true)  //only active/logged-in merchants
    );
    
    onSnapshot(q, async (snapshot) => {
      console.log("Snapshot size:", snapshot.size);
        const tray = document.getElementById('merchantFooter');
        tray.innerHTML = '';

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const id = doc.id;

            if (data.location?.lat && data.location?.lng) {
                updateMerchantMarker(id, data);
                renderMerchantCard(id, data);
            } else if (merchantMarkers[id]) {
                map.removeLayer(merchantMarkers[id]);
                delete merchantMarkers[id];
            }
        });
    });
}

async function updateMerchantMarker(id, data) {
    const pos = { lat: data.location.lat, lng: data.location.lng };
    const closestName = await getClosestLocationName(pos);

    if (merchantMarkers[id]) {
        merchantMarkers[id].setLatLng([pos.lat, pos.lng]);
        merchantMarkers[id].bindPopup(`<b>${data.username}</b><br>Closest to: ${closestName}`);
    } else {
        const marker = L.marker([pos.lat, pos.lng]).addTo(map)
            .bindPopup(`<b>${data.username}</b><br>Closest to: ${closestName}`);
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
