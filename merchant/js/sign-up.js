import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore, doc, setDoc, serverTimestamp, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

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

// Cloudinary Config
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dltoup0cz/auto/upload";
const UPLOAD_PRESET = "runhub_uploads";

// State Management
let currentStep = 1;
const totalSteps = 5;
const collectedData = {
    idFront: null,
    idBack: null,
    selfie: null,
    video: null
};

// --- CAMERA LOGIC ---
const video = document.getElementById('videoPreview');
const canvas = document.getElementById('captureCanvas');
const captureBtn = document.getElementById('captureBtn');
const retakeBtn = document.getElementById('retakeBtn');

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        video.srcObject = stream;
    } catch (err) {
        alert("Camera access denied or unavailable.");
    }
}

function capturePhoto(targetKey) {
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const dataUrl = canvas.toDataURL('image/jpeg');
    collectedData[targetKey] = dataUrl;
    
    document.getElementById(`preview-${targetKey}`).src = dataUrl;
    document.getElementById(`preview-${targetKey}`).style.display = 'block';
    
    if(targetKey === 'idFront') {
        alert("Front Captured! Now flip the card and capture the Back.");
    }
}

// --- VIDEO LOGIC ---
let mediaRecorder;
let videoChunks = [];
const recordBtn = document.getElementById('recordBtn');
const timerEl = document.getElementById('videoTimer');

async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('recordingPreview').srcObject = stream;
    
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => videoChunks.push(e.data);
    mediaRecorder.onstop = () => {
        const blob = new Blob(videoChunks, { type: 'video/mp4' });
        collectedData.video = blob;
        alert("Video recorded successfully!");
    };

    videoChunks = [];
    mediaRecorder.start();
    recordBtn.innerText = "Recording...";
    recordBtn.disabled = true;

    let timeLeft = 15;
    const interval = setInterval(() => {
        timeLeft--;
        timerEl.innerText = `00:${timeLeft.toString().padStart(2, '0')}`;
        if (timeLeft <= 0) {
            clearInterval(interval);
            mediaRecorder.stop();
            stream.getTracks().forEach(track => track.stop());
            recordBtn.innerText = "Video Captured";
        }
    }, 1000);
}

// --- NAVIGATION ---
const steps = document.querySelectorAll('.form-step');
const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');
const submitBtn = document.getElementById('submitBtn');
const indicator = document.getElementById('step-indicator');

function updateStep() {
    steps.forEach((s, i) => s.classList.toggle('active', i === currentStep - 1));
    indicator.innerText = `Step ${currentStep} of ${totalSteps}: ${getStepTitle(currentStep)}`;
    
    prevBtn.style.display = currentStep === 1 ? 'none' : 'block';
    nextBtn.style.display = currentStep === totalSteps ? 'none' : 'block';
    submitBtn.style.display = currentStep === totalSteps ? 'block' : 'none';

    if (currentStep === 1 || currentStep === 2) startCamera();
    if (currentStep === 4) {
        const name = document.getElementById('fullName').value || "Applicant";
        document.getElementById('scriptText').innerHTML = `<i>"I, <b>${name}</b>, am applying to be a merchant on RUNHUB and confirm all my details are authentic."</i>`;
    }
}

function getStepTitle(step) {
    return ["ID Document Scans", "Identity Confirmation", "Video Verification", "Personal Details", "Pledge"][step-1];
}

nextBtn.addEventListener('click', () => {
    if (currentStep === 1 && (!collectedData.idFront || !collectedData.idBack)) return alert("Capture both sides of ID!");
    if (currentStep === 2 && !collectedData.selfie) return alert("Take your profile selfie!");
    if (currentStep === 3 && !collectedData.video) return alert("Record your verification video!");
    
    currentStep++;
    updateStep();
});

prevBtn.addEventListener('click', () => {
    currentStep--;
    updateStep();
});

// --- CAPTURE BUTTON ROUTING ---
captureBtn.addEventListener('click', () => {
    if (currentStep === 1) {
        if (!collectedData.idFront) capturePhoto('idFront');
        else capturePhoto('idBack');
    } else if (currentStep === 2) {
        capturePhoto('selfie');
    }
});

recordBtn.addEventListener('click', startRecording);

// --- UNIQUE CHECKS ---
const checkUniqueness = async (field, value, statusId) => {
    const statusEl = document.getElementById(statusId);
    if (value.length < 3) return;
    try {
        const q = query(collection(db, "users"), where(field, "==", value));
        const snap = await getDocs(q);
        if (snap.empty) {
            statusEl.innerText = "✓ Available";
            statusEl.className = "validation-msg status-available";
        } else {
            statusEl.innerText = "✕ Already Registered";
            statusEl.className = "validation-msg status-taken";
        }
    } catch (e) { console.error(e); }
};

document.getElementById('username').addEventListener('blur', (e) => checkUniqueness("username", e.target.value.toLowerCase(), "username-status"));
document.getElementById('matricNumber').addEventListener('blur', (e) => checkUniqueness("matricNumber", e.target.value, "matric-status"));

// --- SUBMISSION ---
async function uploadToCloudinary(fileOrDataUrl) {
    const formData = new FormData();
    formData.append('file', fileOrDataUrl);
    formData.append('upload_preset', UPLOAD_PRESET);
    const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
    const data = await res.json();
    return data.secure_url;
}

const catchPhrases = ["Silver Mango 82", "Library Falcon Window", "The river flows east today", "Neon Tiger 44", "Blue Ocean 101"];

document.getElementById('verificationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerText = "Processing Details...";

    try {
        const [idFrontUrl, idBackUrl, selfieUrl, videoUrl] = await Promise.all([
            uploadToCloudinary(collectedData.idFront),
            uploadToCloudinary(collectedData.idBack),
            uploadToCloudinary(collectedData.selfie),
            uploadToCloudinary(collectedData.video)
        ]);

        const catchPhrase = catchPhrases[Math.floor(Math.random() * catchPhrases.length)];
        const email = document.getElementById('email').value;

        // Save to Firestore (Pending Status)
        await setDoc(doc(db, "merchant_applications", email), {
            fullName: document.getElementById('fullName').value,
            username: document.getElementById('username').value.toLowerCase(),
            email: email,
            matricNumber: document.getElementById('matricNumber').value,
            phoneNumber: document.getElementById('phoneNumber').value,
            gender: document.getElementById('gender').value,
            level: document.getElementById('level').value,
            hostel: document.getElementById('hostel').value,
            block: document.getElementById('block').value,
            room: document.getElementById('room').value,
            bankName: document.getElementById('bankName').value,
            accountNumber: document.getElementById('accountNumber').value,
            accountName: document.getElementById('accountName').value,
            password: document.getElementById('password').value, // Saved for auto-auth on approval
            idFront: idFrontUrl,
            idBack: idBackUrl,
            profilePhoto: selfieUrl, // selfie is used as profile photo
            verificationVideo: videoUrl,
            catchPhrase: catchPhrase,
            status: "pending",
            appliedAt: serverTimestamp()
        });

        document.getElementById('displayCatchphrase').innerText = catchPhrase;
        document.getElementById('successModal').style.display = 'flex';

    } catch (err) {
        alert("Submission failed: " + err.message);
        submitBtn.disabled = false;
    }
});

// Populate dropdowns
const bSelect = document.getElementById('block');
const rSelect = document.getElementById('room');
for(let i=0; i<=100; i++) bSelect.innerHTML += `<option value="${i}">${i.toString().padStart(2,'0')}</option>`;
for(let i=1; i<=100; i++) rSelect.innerHTML += `<option value="${i}">${i}</option>`;

updateStep();
