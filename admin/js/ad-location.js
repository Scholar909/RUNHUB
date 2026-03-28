import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    collection,
    onSnapshot,
    doc,
    updateDoc,
    serverTimestamp,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- 1. Background Location Tracking ---
// This function monitors the location 24/7 as long as the app is open/logged in
function startLocationTracking(userId) {
    if (!navigator.geolocation) {
        console.error("Geolocation is not supported by this browser.");
        return;
    }

    // Options for high accuracy security monitoring
    const geoOptions = {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 27000
    };

    const watchId = navigator.geolocation.watchPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            
            try {
                const userRef = doc(db, "users", userId);
                await updateDoc(userRef, {
                    location: {
                        lat: latitude,
                        lng: longitude
                    },
                    locationUpdatedAt: serverTimestamp()
                });
                console.log("Security: Location updated for user", userId);
            } catch (err) {
                console.error("Error updating security location:", err);
            }
        },
        (error) => console.error("Location Watch Error:", error),
        geoOptions
    );

    return watchId;
}

// --- 2. Live Merchant Sync (Displaying Pins) ---
function syncMerchants() {
    const q = query(
        collection(db, "users"),
        where("role", "==", "merchant")
    );
    
    onSnapshot(q, (snapshot) => {
        const tray = document.getElementById('merchantFooter');
        tray.innerHTML = '';

        snapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            const id = docSnap.id;

            if (data.location?.lat && data.location?.lng) {
                // REMOVED: The 2-minute freshness check. 
                // We now display the merchant's last known location 24/7.
                updateMerchantMarker(id, data);
                renderMerchantCard(id, data);
            } else if (merchantMarkers[id]) {
                map.removeLayer(merchantMarkers[id]);
                delete merchantMarkers[id];
            }
        });
    });
}

// --- Modified Auth Logic ---
let locationWatchId = null;

onAuthStateChanged(auth, (user) => {
    if (!user) {
        if (locationWatchId) navigator.geolocation.clearWatch(locationWatchId);
        window.location.href = "./admin-login.html";
        return;
    }

    // 1. Initialize the Map
    initMap();

    // 2. Start 24/7 Security Tracking for the logged-in user
    locationWatchId = startLocationTracking(user.uid);
});

// --- UI & Helper Functions (Kept same as your original) ---

async function updateMerchantMarker(id, data) {
    const pos = { lat: data.location.lat, lng: data.location.lng };
    const closestName = await getClosestLocationName(pos);

    if (merchantMarkers[id]) {
        merchantMarkers[id].setLatLng([pos.lat, pos.lng]);
        merchantMarkers[id].getPopup().setContent(`<b>${data.username}</b><br>Closest to: ${closestName}`);
    } else {
        const marker = L.marker([pos.lat, pos.lng]).addTo(map)
            .bindPopup(`<b>${data.username}</b><br>Closest to: ${closestName}`);
        merchantMarkers[id] = marker;
    }
}

// ... Rest of your initMap, syncStaticLocations, and UI Helper functions remain the same ...


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
