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

const approveBtn = document.getElementById("approveBtn");
const blockBtn = document.getElementById("blockBtn");
const deleteBtn = document.getElementById("deleteBtn");


onAuthStateChanged(auth,(user)=>{

if(!user){
window.location.href="./admin-login.html";
return;
}

loadApplication();

});


async function loadApplication(){

const ref = doc(db,"kyc",appId);
const snap = await getDoc(ref);

if(!snap.exists()){
alert("Application not found");
history.back();
return;
}

const data = snap.data();

/* VERIFIED INFO */

const verifiedText = document.getElementById("verifiedText");

if(data.verifiedAt){

  const verifiedDate = data.verifiedAt.toDate();

  const formatted = verifiedDate.toLocaleString("en-NG",{
    day:"numeric",
    month:"short",
    year:"numeric",
    hour:"2-digit",
    minute:"2-digit"
  });

  verifiedText.textContent = `Verified by Admin • ${formatted}`;
}

displayName.textContent = data.fullName;
handle.textContent = "@"+data.username;

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


/* PERSONAL */

personalDetails.innerHTML = `

<div class="info-row">
<span class="label">Full Name</span>
<span>${data.fullName}</span>
</div>

<div class="info-row">
<span class="label">Email</span>
<span>${data.email}</span>
</div>

<div class="info-row">
<span class="label">Phone</span>
<span>${data.phoneNumber}</span>
</div>

<div class="info-row">
<span class="label">Username</span>
<span>${data.username}</span>
</div>

<div class="info-row">
<span class="label">Matric</span>
<span>${data.matricNumber}</span>
</div>

<div class="info-row">
<span class="label">Department</span>
<span>${data.department}</span>
</div>

<div class="info-row">
<span class="label">Level</span>
<span>${data.level}</span>
</div>

<div class="info-row">
<span class="label">Gender</span>
<span>${data.gender}</span>
</div>

`;


// HOSTEL
hostelDetails.innerHTML = `
<div class="info-row">
  <span class="label">Hostel</span>
  <span>${data.hostel?.hostel || ""}</span>
</div>

<div class="info-row">
  <span class="label">Block</span>
  <span>${data.hostel?.block || ""}</span>
</div>

<div class="info-row">
  <span class="label">Room</span>
  <span>${data.hostel?.room || ""}</span>
</div>
`;

// BANK
bankDetails.innerHTML = `
<div class="info-row">
  <span class="label">Bank</span>
  <span>${data.bankDetails?.bankName || ""}</span>
</div>

<div class="info-row">
  <span class="label">Account Name</span>
  <span>${data.bankDetails?.accountName || ""}</span>
</div>

<div class="info-row">
  <span class="label">Account Number</span>
  <span>${data.bankDetails?.accountNumber || ""}</span>
</div>
`;
}

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