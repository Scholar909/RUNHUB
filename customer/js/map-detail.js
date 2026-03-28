import { auth, db } from "./firebase-config.js";
import { doc, onSnapshot, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const orderId = params.get('id');
const merchantId = params.get('m');

let map, merchantMarker;
let staticLocations = [];
let customerLocation = null;
let lastNotifiedLocation = null;
let lastAlertTime = 0;
let cachedStaticLocations = [];

// 1. Keep static locations in memory (Syncs exactly like Admin)
function startStaticLocationSync() {
    onSnapshot(collection(db, "staticLocations"), (snapshot) => {
        cachedStaticLocations = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });
}

// 2. Exact same distance formula used by Merchant/Admin
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

async function initPage() {
    if (!orderId || !merchantId) {
        window.location.href = "track-order.html";
        return;
    }

    setupMap();
    startStaticLocationSync();
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

function updateClosestAndETA(mLoc) {
    // --- 1. FIND CLOSEST STATIC LOCATION ---
    let closestName = "In Transit";
    let minDist = Infinity;

    cachedStaticLocations.forEach(loc => {
        const dist = getDistance(mLoc.lat, mLoc.lng, loc.lat, loc.lng);
        if (dist < minDist) {
            minDist = dist;
            closestName = loc.name;
        }
    });
    document.getElementById('closestLoc').innerText = closestName;

    // --- 2. CALCULATE ETA TO CUSTOMER ---
    if (!customerLocation) {
        document.getElementById('timeLeft').innerText = "Syncing...";
        return;
    }

    const distanceMeters = getDistance(
        mLoc.lat, 
        mLoc.lng, 
        customerLocation.lat, 
        customerLocation.lng
    );

    // Threshold: Arriving now (under 30 meters)
    if (distanceMeters < 30) {
        document.getElementById('timeLeft').innerText = "Arriving now";
        return;
    }

    // Walking speed: 80 meters per minute (matches your logic)
    const minutes = Math.ceil(distanceMeters / 80);

    if (minutes <= 1) {
        document.getElementById('timeLeft').innerText = "Arrived";
    } else {
        document.getElementById('timeLeft').innerText = `${minutes} mins`;
    }
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

// Replace the setInterval at the bottom of map-detail.js with this:
// Replace the watchPosition at the bottom of the customer tracking page
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(async (pos) => {
        const coords = { 
            lat: pos.coords.latitude, 
            lng: pos.coords.longitude 
        };
        
        // Update local variable for UI math
        customerLocation = coords;

        // ✅ PUSH TO FIREBASE: Save to the specific order document
        // This allows the merchant's app to see exactly where the customer is
        if (orderId) {
            try {
                await updateDoc(doc(db, "orders", orderId), {
                    customerLocation: coords,
                    lastCustomerUpdate: serverTimestamp()
                });
            } catch (err) {
                console.error("Failed to sync customer location to Firebase:", err);
            }
        }
    }, (err) => console.warn("Location update failed", err), {
        enableHighAccuracy: true,
        maximumAge: 0
    });
}

