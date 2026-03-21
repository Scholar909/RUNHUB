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
    showLiveTracker(`${closest || "Moving"} • ${minutes} mins away`);
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
