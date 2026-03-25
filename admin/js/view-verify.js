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
const verifyVideo = document.getElementById("verifyVideo");

const blockBtn = document.getElementById("blockBtn");
const deleteBtn = document.getElementById("deleteBtn");


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
    verifyVideo.src = data.files.verificationVideo;

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
const signedDocInput = document.getElementById("signedDocInput");
const saveSignedDocBtn = document.getElementById("saveSignedDocBtn");
const uploadStatus = document.getElementById("uploadStatus");

// 1. Set the "View" logic for the blank agreement (Opens in Modal)
if (data.files && data.files.bindingAgreementBlank) {
    downloadBtn.textContent = "View/Print Blank Agreement"; // Changed text for clarity
    downloadBtn.onclick = (e) => {
        e.preventDefault();
        // Use your existing modal function to show it like a receipt
        window.open(data.files.bindingAgreementBlank, '_blank')
    };
    downloadBtn.style.cursor = "pointer";
} else {
    downloadBtn.textContent = "Agreement not generated";
    downloadBtn.style.opacity = "0.5";
}

// 2. PERSISTENCE CHECK: If a signed agreement already exists in the DB
if (data.signedAgreementUrl) {
    if(uploadStatus) {
        uploadStatus.innerHTML = `✓ Signed agreement verified. <a href="${data.signedAgreementUrl}" target="_blank" style="color:#34c759; text-decoration:underline;">View Signed Doc</a>`;
        uploadStatus.style.color = "#34c759";
    }
    // Enable the final approval button
    safeSetDisabled("approveBtn", false); 
}

// 3. Handle File Selection
signedDocInput.onchange = (e) => {
    if (e.target.files.length > 0) {
        saveSignedDocBtn.disabled = false;
        saveSignedDocBtn.style.opacity = "1";
        saveSignedDocBtn.style.cursor = "pointer";
        uploadStatus.innerText = "File selected. Click 'Save' to finalize.";
        uploadStatus.style.color = "orange";
    }
};

// 4. Save Signed Agreement Logic
saveSignedDocBtn.onclick = async () => {
    const file = signedDocInput.files[0];
    if (!file) return;

    saveSignedDocBtn.innerText = "Uploading to Cloudinary...";
    saveSignedDocBtn.disabled = true;

    try {
        // Upload file to Cloudinary
        const uploadedUrl = await uploadImage(file); 

        // Update the specific merchant application document in Firestore
        const appRef = doc(db, "merchant_applications", appId);
        await updateDoc(appRef, {
            signedAgreementUrl: uploadedUrl,
            agreementUploadedAt: new Date().toISOString()
        });

        // Update UI Success State
        uploadStatus.innerHTML = `✓ Saved! <a href="${uploadedUrl}" target="_blank" style="color:#34c759; text-decoration:underline;">View Upload</a>`;
        uploadStatus.style.color = "#34c759";
        saveSignedDocBtn.innerText = "Upload Complete";
        
        // UNLOCK the Approve Button for the Admin
        const approveBtn = document.getElementById("approveBtn");
        if (approveBtn) {
            approveBtn.disabled = false;
            approveBtn.style.opacity = "1";
            approveBtn.style.cursor = "pointer";
        }

    } catch (err) {
        console.error("Upload Error:", err);
        uploadStatus.innerText = "Upload failed. Please try again.";
        uploadStatus.style.color = "#ff3b30";
        saveSignedDocBtn.innerText = "Retry Upload";
        saveSignedDocBtn.disabled = false;
    }
};

// --- PHOTO MODAL LOGIC ---
const createPhotoModal = () => {
  if (document.getElementById('photoModal')) return; // Already exists

  const modal = document.createElement('div');
  modal.id = "photoModal";
  modal.style = `
    display: none; 
    position: fixed; 
    z-index: 9999; 
    left: 0; 
    top: 0; 
    width: 100%; 
    height: 100%; 
    background: rgba(0,0,0,0.9); 
    align-items: center; 
    justify-content: center; 
    backdrop-filter: blur(6px);
  `;

  modal.innerHTML = `
    <span id="modalClose" 
          style="position:absolute; top:30px; right:30px; color:white; font-size:40px; cursor:pointer;">&times;</span>
    <img id="modalImg" style="max-width: 90%; max-height: 85%; border-radius:8px; border:3px solid white;">
  `;

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
  const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dltoup0cz/image/upload";
  const UPLOAD_PRESET = "runhub_uploads"; 

  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", UPLOAD_PRESET);

  const res = await fetch(CLOUDINARY_URL, { method: "POST", body: fd });
  
  if (!res.ok) {
    throw new Error("Failed to upload to Cloudinary");
  }

  const data = await res.json();
  return data.secure_url;
}
}