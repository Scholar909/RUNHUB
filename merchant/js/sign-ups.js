import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// ---------------- FIREBASE CONFIG ----------------
const firebaseConfig = {
    apiKey: "AIzaSyC7onB0OptTyu-J6J1PwU6zX799tQIjh4k",
    authDomain: "affiliate-app-dab95.firebaseapp.com",
    projectId: "affiliate-app-dab95",
    storageBucket: "affiliate-app-dab95.firebasestorage.app",
    messagingSenderId: "510180440268",
    appId: "1:510180440268:web:99be47162857f635d8ea69"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ---------------- CLOUDINARY ----------------
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dltoup0cz/image/upload";
const CLOUDINARY_VIDEO = "https://api.cloudinary.com/v1_1/dltoup0cz/video/upload";
const UPLOAD_PRESET = "runhub_uploads";

// ---------------- VALIDATION ----------------
let isUsernameValid = false;
let isMatricValid = false;

const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

const checkUniqueness = async (field, value, statusId) => {
    const statusEl = document.getElementById(statusId);
    if (!value || value.length < 3) {
        statusEl.innerText = "";
        return;
    }
    statusEl.innerText = "Checking...";
    try {
        const q = query(collection(db, "users"), where(field, "==", value));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            statusEl.innerText = "✓ Available";
            statusEl.className = "validation-msg status-available";
            if (field === "username") isUsernameValid = true;
            if (field === "matricNumber") isMatricValid = true;
        } else {
            statusEl.innerText = "✕ Already Taken";
            statusEl.className = "validation-msg status-taken";
            if (field === "username") isUsernameValid = false;
            if (field === "matricNumber") isMatricValid = false;
        }
    } catch (err) {
        statusEl.innerText = "✓ Available"; // fallback
        isUsernameValid = true;
        isMatricValid = true;
    }
};

document.getElementById('username').addEventListener('input', debounce(e => {
    checkUniqueness("username", e.target.value.trim().toLowerCase(), "username-status");
}, 500));

document.getElementById('matricNumber').addEventListener('input', debounce(e => {
    checkUniqueness("matricNumber", e.target.value.trim(), "matric-status");
}, 500));

// ---------------- MULTI-STEP FORM ----------------
const sections = document.querySelectorAll(".form-section");
let currentSection = 0;

function showSection(index){
    sections.forEach((section,i)=>{
        section.classList.remove("active");
        if(i===index) section.classList.add("active");
    });
    currentSection = index;
}

document.querySelectorAll(".next").forEach(btn => {
    btn.addEventListener("click", ()=>{
        if(currentSection < sections.length - 1) showSection(currentSection + 1);
    });
});
document.querySelectorAll(".prev").forEach(btn => {
    btn.addEventListener("click", ()=>{
        if(currentSection > 0) showSection(currentSection - 1);
    });
});

// ---------------- CAMERA / VIDEO ----------------
let stream;
async function startCamera(videoElement){
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
        videoElement.srcObject = stream;
    } catch(e) {
        alert("Camera permission required for verification.");
    }
}

// Start cameras
startCamera(document.getElementById("idFrontPreview"));
startCamera(document.getElementById("idBackPreview"));
startCamera(document.getElementById("selfiePreview"));
startCamera(document.getElementById("faceScanPreview"));
startCamera(document.getElementById("videoPreview"));

// ---------------- CAPTURE IMAGES ----------------
function captureImage(video){
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video,0,0);
    return new Promise(resolve=>{
        canvas.toBlob(blob=>{
            resolve(blob);
        },"image/jpeg");
    });
}

let idFrontBlob=null, idBackBlob=null, selfieBlob=null, faceBlob=null, verificationVideoBlob=null;

document.getElementById("captureIdFront").onclick = async () => {
    idFrontBlob = await captureImage(document.getElementById("idFrontPreview"));
    alert("ID Front Captured");
};
document.getElementById("captureIdBack").onclick = async () => {
    idBackBlob = await captureImage(document.getElementById("idBackPreview"));
    alert("ID Back Captured");
};
document.getElementById("captureSelfie").onclick = async () => {
    selfieBlob = await captureImage(document.getElementById("selfiePreview"));
    alert("Selfie Captured");
};

// facial scan auto capture after 3s
setTimeout(async()=>{
    faceBlob = await captureImage(document.getElementById("faceScanPreview"));
},3000);

// ---------------- VIDEO RECORDING ----------------
let mediaRecorder, recordedChunks=[];
document.getElementById("startVideoRecording").onclick = ()=>{
    recordedChunks=[];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e=>{
        if(e.data.size>0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = ()=>{
        verificationVideoBlob = new Blob(recordedChunks,{type:"video/webm"});
        alert("Verification Video Recorded");
    };
    mediaRecorder.start();
    setTimeout(()=> mediaRecorder.stop(),8000);
};

// ---------------- CLOUDINARY UPLOAD ----------------
async function uploadImage(blob){
    const formData = new FormData();
    formData.append("file", blob);
    formData.append("upload_preset", UPLOAD_PRESET);
    const res = await fetch(CLOUDINARY_URL,{method:"POST", body:formData});
    const data = await res.json();
    return data.secure_url;
}
async function uploadVideo(blob){
    const formData = new FormData();
    formData.append("file", blob);
    formData.append("upload_preset", UPLOAD_PRESET);
    const res = await fetch(CLOUDINARY_VIDEO,{method:"POST", body:formData});
    const data = await res.json();
    return data.secure_url;
}

// ---------------- RANDOM CATCH PHRASE ----------------
function generateCatchPhrase(){
    const words = ["Silver","Mango","Falcon","Library","River","Market","Golden","Forest","Tiger","Window","Ocean","Campus","Storm","Bridge","Rocket"];
    const a = words[Math.floor(Math.random()*words.length)];
    const b = words[Math.floor(Math.random()*words.length)];
    const c = Math.floor(Math.random()*100);
    return `${a} ${b} ${c}`;
}

// ---------------- FORM SUBMIT ----------------
document.getElementById("merchantVerificationForm").addEventListener("submit", async e=>{
    e.preventDefault();
    if(!isUsernameValid || !isMatricValid){
        alert("Username or Matric Number is already in use.");
        return;
    }
    alert("Uploading verification files...");

    // upload files to cloudinary
    const idFrontURL = await uploadImage(idFrontBlob);
    const idBackURL = await uploadImage(idBackBlob);
    const selfieURL = await uploadImage(selfieBlob);
    const faceURL = await uploadImage(faceBlob);
    const videoURL = await uploadVideo(verificationVideoBlob);

    // collect form data
    const data = {
        fullName: document.getElementById("fullName").value,
        email: document.getElementById("email").value,
        username: document.getElementById("username").value.trim().toLowerCase(),
        phoneNumber: document.getElementById("phoneNumber").value,
        matricNumber: document.getElementById("matricNumber").value.trim(),
        department: document.getElementById("department").value,
        level: document.getElementById("level").value,
        gender: document.getElementById("gender").value,
        hostel: document.getElementById("hostel").value,
        block: document.getElementById("block").value,
        room: document.getElementById("room").value,
        bankName: document.getElementById("bankName").value,
        accountName: document.getElementById("accountName").value,
        accountNumber: document.getElementById("accountNumber").value
    };

    const catchPhrase = generateCatchPhrase();

    await addDoc(collection(db,"merchant_applications"),{
        ...data,
        files:{
            idFront:idFrontURL,
            idBack:idBackURL,
            selfie:selfieURL,
            faceScan:faceURL,
            verificationVideo:videoURL
        },
        catchPhrase:catchPhrase,
        status:"pending",
        submittedAt:serverTimestamp()
    });

    alert(`Verification submitted.\nSave this catch phrase:\n${catchPhrase}`);
    document.getElementById("merchantVerificationForm").reset();
    location.reload();
});