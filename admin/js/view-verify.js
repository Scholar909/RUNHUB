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

const ref = doc(db,"merchant_applications",appId);
const snap = await getDoc(ref);

if(!snap.exists()){
alert("Application not found");
history.back();
return;
}

const data = snap.data();

displayName.textContent = data.fullName;
handle.textContent = "@"+data.matricNumber;

profilePhoto.src = data.files.selfie;

idFront.src = data.files.idFront;
idBack.src = data.files.idBack;
faceScan.src = data.files.faceScan;

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
<span>${data.phone}</span>
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


/* HOSTEL */

hostelDetails.innerHTML = `

<div class="info-row">
<span class="label">Hostel</span>
<span>${data.hostel}</span>
</div>

<div class="info-row">
<span class="label">Block</span>
<span>${data.block}</span>
</div>

<div class="info-row">
<span class="label">Room</span>
<span>${data.room}</span>
</div>

`;


/* BANK */

bankDetails.innerHTML = `

<div class="info-row">
<span class="label">Bank</span>
<span>${data.bankName}</span>
</div>

<div class="info-row">
<span class="label">Account Name</span>
<span>${data.accountName}</span>
</div>

<div class="info-row">
<span class="label">Account Number</span>
<span>${data.accountNumber}</span>
</div>

`;
}
