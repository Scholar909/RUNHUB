import { auth, db } from "./firebase-config.js";
import { doc, onSnapshot, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const orderId = params.get('id');
const merchantId = params.get('m');

let map, merchantMarker;
let staticLocations = [];

async function initPage() {
    if (!orderId || !merchantId) {
        window.location.href = "track-order.html";
        return;
    }

    setupMap();
    await loadStaticLocations();
    syncOrderData();
    syncMerchantLiveLocation();
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
}

function syncOrderData() {
    onSnapshot(doc(db, "orders", orderId), (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        
        document.getElementById('orderRoute').innerText = data.route || "Campus Delivery";
        document.getElementById('itemsSummary').innerText = data.items.map(i => `${i.qty}x ${i.name}`).join(", ");
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
    let closest = null;
    let minDist = Infinity;

    staticLocations.forEach(loc => {
        const dist = Math.hypot(mLoc.lat - loc.lat, mLoc.lng - loc.lng);
        if (dist < minDist) {
            minDist = dist;
            closest = loc.name;
        }
    });

    document.getElementById('closestLoc').innerText = closest || "In Transit";

    // Logic: ETA based on distance and mode
    // Multiplier for trekking vs vehicle (Keke)
    const speedFactor = (mode === "trekking") ? 1500 : 3000;
    const minutes = Math.ceil(minDist * speedFactor);
    
    document.getElementById('timeLeft').innerText = `${minutes} mins`;
}

initPage();
