import { auth, db } from "./firebase-config.js";
import { doc, onSnapshot, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const orderId = params.get('id');
const merchantId = params.get('m');

let map, merchantMarker;
let staticLocations = [];
let customerLocation = null;

async function initPage() {
    if (!orderId || !merchantId) {
        window.location.href = "track-order.html";
        return;
    }

    setupMap();
    await loadStaticLocations();
    await syncOrderData();
    syncMerchantLiveLocation();
}

async function syncOrderData() {
    onSnapshot(doc(db, "orders", orderId), async (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        
        document.getElementById('orderRoute').innerText = data.route || "Campus Delivery";
        document.getElementById('itemsSummary').innerText = data.items.map(i => `${i.qty}x ${i.name}`).join(", ");

        // ✅ Use stored location if available
        if (data.customerLocation) {
            customerLocation = data.customerLocation;
        } else {
            // If no stored location, try to get live location
            try {
                customerLocation = await getLiveLocation();
            } catch (err) {
                console.warn("Customer location unavailable:", err);
            }
        }
    });
}

function getLiveLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject("Geolocation not supported");
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => reject(err.message)
        );
    });
}

function setupMap() {
    // Initialize map with Satellite view as requested
    map = L.map('map', { 
        zoomControl: false,
        attributionControl: false 
    }).setView([7.1903, 4.5607], 17);

    // Satellite Layer
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
    }).addTo(map);
}

async function loadStaticLocations() {
    const snap = await getDocs(collection(db, "staticLocations"));
    
    staticLocations = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ✅ SHOW THEM ON MAP
    staticLocations.forEach(loc => {
        L.circleMarker([loc.lat, loc.lng], {
            color: '#007aff',
            radius: 6
        })
        .addTo(map)
        .bindPopup(`<b>${loc.name}</b>`);
    });
}

function syncOrderData() {
    onSnapshot(doc(db, "orders", orderId), (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        
        document.getElementById('orderRoute').innerText = data.route || "Campus Delivery";
        document.getElementById('itemsSummary').innerText = data.items.map(i => `${i.qty}x ${i.name}`).join(", ");

        // ✅ ADD THIS
        if (data.customerLocation) {
            customerLocation = data.customerLocation;
        }
    });
}

function syncMerchantLiveLocation() {
    onSnapshot(doc(db, "users", merchantId), (snapshot) => {
        const data = snapshot.data();
        if (!data || !data.location) return;

        const pos = [data.location.lat, data.location.lng];
        
        // Update Marker
        if (merchantMarker) {
            merchantMarker.setLatLng(pos);
        } else {
            merchantMarker = L.marker(pos).addTo(map);
            document.getElementById('merchantName').innerText = `@${data.username}`;
            document.getElementById('merchantImg').src = data.profilePhoto || 'img/default.png';
        }

        // Always zoom on that merchant
        map.flyTo(pos, 18);

        // Update Stats
        updateClosestAndETA(data.location, data.transportMode || "trekking");
    });
}

function updateClosestAndETA(mLoc, mode) {
  
  console.log("Customer:", customerLocation);
  console.log("Merchant:", mLoc);

    let closest = null;
    let minDist = Infinity;

    // ✅ KEEP THIS PART (for "closest location")
    staticLocations.forEach(loc => {
        const dist = Math.hypot(mLoc.lat - loc.lat, mLoc.lng - loc.lng);
        if (dist < minDist) {
            minDist = dist;
            closest = loc.name;
        }
    });

    document.getElementById('closestLoc').innerText = closest || "In Transit";

    // ❗ NOW FIX ETA (use CUSTOMER location instead)
    if (!customerLocation) return;

    const distanceKm = getDistanceKm(
        mLoc.lat,
        mLoc.lng,
        customerLocation.lat,
        customerLocation.lng
    );

    // ✅ ARRIVAL CHECK (ADD HERE)
    if (distanceKm < 0.05) {
        document.getElementById('timeLeft').innerText = "Arrived";
        showLiveTracker("Your rider has arrived 🚀");
        return; // ⛔ STOP further calculation
    }
    
    const speed = (mode === "trekking") ? 5 : 25; // km/h
    
    const minutes = Math.ceil((distanceKm / speed) * 60);
    
    document.getElementById('timeLeft').innerText = `${minutes} mins`;
    showLiveTracker(`Near ${closest || "your area"} • ${minutes} mins away`);
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function showLiveTracker(text) {
    let banner = document.getElementById("liveTracker");

    if (!banner) {
        banner = document.createElement("div");
        banner.id = "liveTracker";
        banner.style.position = "fixed";
        banner.style.bottom = "20px";
        banner.style.left = "50%";
        banner.style.transform = "translateX(-50%)";
        banner.style.background = "#000";
        banner.style.color = "#fff";
        banner.style.padding = "12px 20px";
        banner.style.borderRadius = "30px";
        banner.style.zIndex = "9999";
        document.body.appendChild(banner);
    }

    banner.innerText = text;
}

initPage();

// --- Keep trying to get customer location every 5 seconds if not yet set ---
const locInterval = setInterval(async () => {
    if (!customerLocation) {
        try { 
            customerLocation = await getLiveLocation(); 
            console.log("Got live customer location:", customerLocation);
        } catch(err){ 
            console.warn("Customer location unavailable:", err); 
        }
    } else {
        clearInterval(locInterval); // stop polling once location is set
    }
}, 5000);