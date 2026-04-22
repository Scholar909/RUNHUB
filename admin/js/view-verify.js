import { auth, db } from "./firebase-config.js";

import {
doc,
getDoc,
updateDoc,
deleteDoc
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

import {
onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

// Use a helper to check if element exists before styling
const safeSetDisabled = (id, state) => {
const el = document.getElementById(id);
if (el) {
el.disabled = state;
el.style.opacity = state ? "0.5" : "1";
el.style.cursor = state ? "not-allowed" : "pointer";
}
};

// Initial state (Safe check)
const approveBtn = document.getElementById("approveBtn");
if (approveBtn) {
approveBtn.disabled = true;
approveBtn.style.opacity = "0.5";
approveBtn.style.cursor = "not-allowed";
}

const params = new URLSearchParams(window.location.search);
const appId = params.get("id");

const profilePhoto = document.getElementById("profilePhoto");
const displayName = document.getElementById("displayName");
const handle = document.getElementById("handle");

const personalDetails = document.getElementById("personalDetails");
const hostelDetails = document.getElementById("hostelDetails");
const bankDetails = document.getElementById("bankDetails");

const idFront = document.getElementById("idFront");
const idBack = document.getElementById("idBack");
const faceScan = document.getElementById("faceScan");
const profileBottom = document.getElementById("profileBottom");


const blockBtn = document.getElementById("blockBtn");
const deleteBtn = document.getElementById("deleteBtn");

let isDrawing = false;
let canvas, ctx;


onAuthStateChanged(auth,(user)=>{

if(!user){
window.location.href="./admin-login.html";
return;
}

loadApplication();

});

async function loadApplication() {
const ref = doc(db, "merchant_applications", appId);
const snap = await getDoc(ref);

if (!snap.exists()) {  
    alert("Application not found");  
    history.back();  
    return;  
}  

const data = snap.data();  

// --- UI DISPLAY LOGIC ---  
displayName.textContent = data.fullName;  
handle.textContent = "@" + data.username;  

const catchPhraseEl = document.getElementById("catchPhrase");  
if (catchPhraseEl && data.catchPhrase) {  
    catchPhraseEl.textContent = data.catchPhrase;  
}  

profilePhoto.src = data.files.selfie;  
idFront.src = data.files.idFront;  
idBack.src = data.files.idBack;  
faceScan.src = data.files.faceScan;  
profileBottom.src = data.files.selfie;  
  

/* PERSONAL DETAILS */  
personalDetails.innerHTML = `  
    <div class="info-row"><span class="label">Full Name</span><span>${data.fullName}</span></div>  
    <div class="info-row"><span class="label">Email</span><span>${data.email}</span></div>  
    <div class="info-row"><span class="label">Phone</span><span>${data.phoneNumber}</span></div>  
    <div class="info-row"><span class="label">Username</span><span>${data.username}</span></div>  
    <div class="info-row"><span class="label">Matric</span><span>${data.matricNumber}</span></div>  
    <div class="info-row"><span class="label">Department</span><span>${data.department}</span></div>  
    <div class="info-row"><span class="label">Level</span><span>${data.level}</span></div>  
    <div class="info-row"><span class="label">Gender</span><span>${data.gender}</span></div>  
`;  

/* HOSTEL INFORMATION */  
hostelDetails.innerHTML = `  
    <div class="info-row"><span class="label">Hostel</span><span>${data.hostel}</span></div>  
    <div class="info-row"><span class="label">Block</span><span>${data.block}</span></div>  
    <div class="info-row"><span class="label">Room</span><span>${data.room}</span></div>  
`;  

/* BANK DETAILS */  
bankDetails.innerHTML = `  
    <div class="info-row"><span class="label">Bank</span><span>${data.bankName}</span></div>  
    <div class="info-row"><span class="label">Account Name</span><span>${data.accountName}</span></div>  
    <div class="info-row"><span class="label">Account Number</span><span>${data.accountNumber}</span></div>  
`;

/* ---------------- BINDING AGREEMENT & APPROVAL LOCK LOGIC ---------------- */

const downloadBtn = document.getElementById("downloadAgreement");
const saveSignedDocBtn = document.getElementById("saveSignedDocBtn");
const uploadStatus = document.getElementById("uploadStatus");

// --- INITIALIZE CANVAS ---
canvas = document.getElementById('adminSignCanvas');
ctx = canvas.getContext('2d');
const adminNameInput = document.getElementById('adminFullName');
const adminDateInput = document.getElementById('adminSignDate');

// Auto-set today's date
adminDateInput.value = new Date().toLocaleDateString('en-GB');

// Canvas Setup
const setupCanvas = () => {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2; // High DPI
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
};
setTimeout(setupCanvas, 500); // Small delay to ensure layout is rendered

// Drawing Event Listeners
const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX || e.touches[0].clientX) - rect.left,
        y: (e.clientY || e.touches[0].clientY) - rect.top
    };
};

const startDraw = (e) => { isDrawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); };
const draw = (e) => { if(!isDrawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
const stopDraw = () => { isDrawing = false; };

canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', draw);
window.addEventListener('mouseup', stopDraw);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e); });
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e); });
canvas.addEventListener('touchend', stopDraw);

document.getElementById('clearBoard').onclick = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

// 1. View Logic (Merchant's Copy)
if (data.files && data.files.bindingAgreementSheets) {
    const sheets = data.files.bindingAgreementSheets;
    downloadBtn.onclick = (e) => {
        e.preventDefault();
        const printWindow = window.open('', '_blank');
        const imagesHtml = sheets.map(url => `<div style="text-align:center"><img src="${url}" style="max-width:100%"></div>`).join('');
        printWindow.document.write(`<html><body>${imagesHtml}</body></html>`);
    };
}

// 2. PERSISTENCE CHECK: If Admin already signed
if (data.signedAgreementUrl) {
    uploadStatus.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px;">
            <span>✓ Final Agreement Verified (Both Parties Signed)</span>
            <a href="${data.signedAgreementUrl}" target="_blank" style="color:#34c759; text-decoration:underline;">View/Download</a>
            <a href="#" id="removeSignedDoc" style="color:#ff3b30; text-decoration:underline;">Reset Signature</a>
        </div>
    `;
    
    // Hide Board and Save button since it's done
    document.querySelector('.admin-sign-container').style.display = "none";
    saveSignedDocBtn.style.display = "none";
    safeSetDisabled("approveBtn", false);

    document.getElementById("removeSignedDoc").onclick = async (e) => {
        e.preventDefault();
        if (!confirm("Remove signature? This will reset the verification.")) return;
        await updateDoc(ref, { signedAgreementUrl: null });
        location.reload();
    };
} else {
    safeSetDisabled("approveBtn", true);
}

// 3. THE NEW "SAVE" (STAMPING) LOGIC
saveSignedDocBtn.onclick = async () => {
    const adminName = adminNameInput.value.trim();
    if (!adminName) return alert("Please enter Admin Name.");

    saveSignedDocBtn.innerText = "Stamping & Uploading...";
    saveSignedDocBtn.disabled = true;

    try {
        const sheets = data.files.bindingAgreementSheets;
        const lastPageUrl = sheets[sheets.length - 1];

        // Create Merge Canvas
        const mergeCanvas = document.createElement('canvas');
        const mCtx = mergeCanvas.getContext('2d');
        const baseImg = await loadImage(lastPageUrl);
        
        mergeCanvas.width = 2480; // A4 Standard
        mergeCanvas.height = 3508;
        mCtx.drawImage(baseImg, 0, 0, 2480, 3508);

        // Draw Admin Signature (Right Side)
        const sigData = canvas.toDataURL("image/png");
        const sigImg = await loadImage(sigData);
        mCtx.drawImage(sigImg, 1450, 3050, 700, 250); // Adjusted coordinates

        // Draw Text (Admin Name & Date)
        mCtx.fillStyle = "black";
        mCtx.font = "italic 35px Arial";
        mCtx.fillText(`${adminName}  -  ${adminDateInput.value}`, 1500, 3350);

        // Convert to Blob and Upload
        const blob = await new Promise(res => mergeCanvas.toBlob(res, 'image/png'));
        const uploadedUrl = await uploadImage(blob);

        // Save to Firebase
        await updateDoc(ref, {
            signedAgreementUrl: uploadedUrl,
            adminSignedByName: adminName,
            agreementUploadedAt: new Date().toISOString()
        });

        alert("Final agreement created and saved!");
        location.reload();

    } catch (err) {
        console.error(err);
        alert("Error finalizing agreement.");
        saveSignedDocBtn.innerText = "Retry Save";
        saveSignedDocBtn.disabled = false;
    }
};

// Helper: Load Image
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}


// --- PHOTO MODAL LOGIC ---
const createPhotoModal = () => {
if (document.getElementById('photoModal')) return; // Already exists

const modal = document.createElement('div');
modal.id = "photoModal";
modal.style = "display: none; position: fixed; z-index: 9999; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); align-items: center; justify-content: center; backdrop-filter: blur(6px);";

modal.innerHTML = `<span id="modalClose" style="position:absolute; top:30px; right:30px; color:white; font-size:40px; cursor:pointer;">&times;</span><img id="modalImg" style="max-width: 90%; max-height: 85%; border-radius:8px; border:3px solid white;">`;

document.body.appendChild(modal);

// Close modal
modal.onclick = (e) => {
if (e.target.id === 'photoModal' || e.target.id === 'modalClose') {
modal.style.display = 'none';
}
};
};

// Open modal with given image src
const openModal = (src) => {
const modal = document.getElementById('photoModal');
document.getElementById('modalImg').src = src;
modal.style.display = 'flex';
};

// Initialize modal
createPhotoModal();

// Make profile photo clickable
profilePhoto.style.cursor = "pointer";
profilePhoto.onclick = () => openModal(profilePhoto.src);

// Optional: make bottom images clickable too (idFront, idBack, faceScan)
[idFront, idBack, faceScan, profileBottom].forEach(img => {
img.style.cursor = "pointer";
img.onclick = () => openModal(img.src);
});

/* --- CLOUDINARY UPLOAD HELPER --- */
async function uploadImage(file) {
    const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dltoup0cz/raw/upload";
    const UPLOAD_PRESET = "runhub_uploads";

    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", UPLOAD_PRESET);

    const res = await fetch(CLOUDINARY_URL, { method: "POST", body: fd });

    if (!res.ok) {
        const err = await res.json();
        console.error("Cloudinary Error:", err);
        throw new Error("Failed to upload to Cloudinary");
    }

    const data = await res.json();
    return data.secure_url;
}
}
