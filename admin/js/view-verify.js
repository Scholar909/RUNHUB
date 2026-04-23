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
            <span style="color:#34c759; font-weight:bold;">✓ Final Binding Agreement Verified</span>
            <a href="#" id="viewFinalDoc" style="color:#007aff; text-decoration:underline;">View Agreement</a>
        </div>
    `;
    
    // View Logic: Opens ALL pages of the agreement
    document.getElementById("viewFinalDoc").onclick = (e) => {
        e.preventDefault();
        const printWindow = window.open('', '_blank');
        
        // Map through all sheets, but swap the last sheet with the signed one
        const allSheets = [...data.files.bindingAgreementSheets];
        allSheets[allSheets.length - 1] = data.signedAgreementUrl; // Swap blank last page for signed one

        const imagesHtml = allSheets.map(url => 
            `<div style="text-align:center; background:#525659; padding:20px 0;">
                <img src="${url}" style="max-width:100%; height:auto; background:white; box-shadow:0 0 10px rgba(0,0,0,0.5);">
            </div>`
        ).join('');

        printWindow.document.write(`
            <html>
                <head><title>Final Signed Agreement</title></head>
                <body style="margin:0; background:#525659;">
                    ${imagesHtml}
                </body>
            </html>
        `);
    };


    // Hide Board and Save button since signing is final
    document.querySelector('.admin-sign-container').style.display = "none";
    saveSignedDocBtn.style.display = "none";
    safeSetDisabled("approveBtn", false);
} else {
    safeSetDisabled("approveBtn", true);
}


// 3. THE FINAL "STAMPING" LOGIC
saveSignedDocBtn.onclick = async () => {
    const adminName = adminNameInput.value.trim();
    if (!adminName) return alert("Please enter Admin Full Name.");
    
    if(!confirm("Are you sure? This signature is permanent and cannot be reset after saving.")) return;

    saveSignedDocBtn.innerText = "Stamping & Finalizing...";
    saveSignedDocBtn.disabled = true;

    try {
        const sheets = data.files.bindingAgreementSheets;
        const lastPageUrl = sheets[sheets.length - 1];

        // Create Merge Canvas (A4 Dimensions)
        const mergeCanvas = document.createElement('canvas');
        const mCtx = mergeCanvas.getContext('2d');
        const baseImg = await loadImage(lastPageUrl);
        
        mergeCanvas.width = 2480; 
        mergeCanvas.height = 3508;
        mCtx.drawImage(baseImg, 0, 0, 2480, 3508);

        // 1. Draw Admin Canvas Signature (Place on the line)
        const sigData = canvas.toDataURL("image/png");
        // --- 1. Draw Admin Handwriting Signature ---
        const sigImg = await loadImage(canvas.toDataURL("image/png"));
        
        // We set the width to 510 (calculated from your 17/20 ratio: 600 * 0.85)
        // We set Y to 2900 so the signature sits ON the line (sigY is 3100)
        const sigWidth = 510; 
        const sigHeight = 200;
        
        const lineY = 3100;  // The actual Y coordinate of the horizontal line
        
        mCtx.drawImage(sigImg, startX, lineY - sigHeight, sigWidth, sigHeight); 

        // --- 2. Draw Admin Name & Date to the RIGHT of the signature ---
        mCtx.font = "40px Helvetica";
        mCtx.fillStyle = "#000";
        mCtx.textAlign = "left";
        
        const adminText = adminName.toUpperCase();
        const nameX = startX + sigWidth + 20; // 20px gap after the signature
        const textBaselineY = lineY - 10; // Sits slightly above the line for readability
        
        // Draw Name
        mCtx.fillText(adminText, nameX, textBaselineY);
        
        // Draw Date on the same line
        const nameWidth = mCtx.measureText(adminText).width;
        mCtx.fillStyle = "#555";
        mCtx.fillText(`  |  Date: ${adminDateInput.value}`, nameX + nameWidth + 10, textBaselineY);

        
        // Positioning: sigY is 3100. We draw text above the line at 3055.
        const textY = 3055; 
        const startX = 1480; // Start of the admin signature line
        
        // Draw Name
        mCtx.fillText(adminText, startX, textY);
        
        // Draw the separator and date on the same row
        mCtx.fillStyle = "#555";
        mCtx.fillText(`  |  Date: ${adminDateInput.value}`, startX + nameWidth + 10, textY);


        // Convert to Blob and Upload to Cloudinary
        const blob = await new Promise(res => mergeCanvas.toBlob(res, 'image/png'));
        const uploadedUrl = await uploadImage(blob);

        // Update Firestore
        const appRef = doc(db, "merchant_applications", appId);
        await updateDoc(appRef, {
            signedAgreementUrl: uploadedUrl,
            adminSignedByName: adminName,
            agreementFinalizedAt: new Date().toISOString()
        });

        alert("Agreement Finalized Successfully!");
        location.reload();

    } catch (err) {
        console.error(err);
        alert("Error finalizing agreement. Please try again.");
        saveSignedDocBtn.innerText = "Stamp & Finalize Agreement";
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
