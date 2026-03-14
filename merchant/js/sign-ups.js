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

        // Start facial scan if this is the face section
        if(section.dataset.requiresFiles === "face" && !blobs.face){
            startFacialScan();
        }
    });
    currentSection = index;
}

document.querySelectorAll(".next").forEach(btn => {
    btn.addEventListener("click", () => {
        const currentSectionEl = sections[currentSection];
        
        // Only check required files if the section has data-requires-files
        const currentRequired = currentSectionEl.dataset.requiresFiles?.split(",") || [];
        if(currentRequired.length && currentRequired.some(f => !urls[f])) {
            alert("Please capture and upload all required files before proceeding.");
            return;
        }

        // 2. Check for required form fields
        const inputs = currentSectionEl.querySelectorAll("input[required], select[required]");
        for (let input of inputs) {
            if (!input.value.trim()) {
                alert(`Please fill in the required field: ${input.previousElementSibling.innerText}`);
                input.focus();
                return;
            }
        }

        // If all good, show next section
        if(currentSection < sections.length - 1) showSection(currentSection + 1);
    });
});

document.querySelectorAll(".prev").forEach(btn => {
    btn.addEventListener("click", ()=>{
        if(currentSection > 0) showSection(currentSection - 1);
    });
});

// ---------------- CAMERA ----------------
const facingModes = {}; // track current facing mode per video

async function startCamera(video, facingMode = "user") {
    try {
        if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());

        const constraints = {
            video: {
                facingMode: facingMode // try "user" or "environment"
            },
            audio: false
        };

        // On iOS/older browsers, fallback to deviceId if facingMode fails
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cam = devices.find(d => d.kind === "videoinput" && 
                ((facingMode === "user" && d.label.toLowerCase().includes("front")) ||
                 (facingMode === "environment" && d.label.toLowerCase().includes("back"))));
            if (!cam) throw new Error("No matching camera found");
            stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: cam.deviceId }, audio: false });
        }

        video.srcObject = stream;
        await video.play();
        return stream;

    } catch (e) {
        console.error(e);
        alert("Camera permission required or device doesn't support requested camera.");
    }
}

async function setupFlip(flipBtnId, videoId) {
    const video = document.getElementById(videoId);
    const btn = document.getElementById(flipBtnId);
    if (!facingModes[videoId]) facingModes[videoId] = "user";

    btn.onclick = async () => {
        try {
            facingModes[videoId] = facingModes[videoId] === "user" ? "environment" : "user";
            await startCamera(video, facingModes[videoId]);
        } catch (err) {
            console.error(err);
            alert("Camera permission required or camera not available.");
        }
    };
}

// ---------------- CAPTURE ----------------
function captureImage(video){
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video,0,0);
    return new Promise(resolve=>{
        canvas.toBlob(blob=>resolve(blob),"image/jpeg");
    });
}

let blobs = {idFront:null, idBack:null, selfie:null, face:null, video:null};
let urls = {idFront:null, idBack:null, selfie:null, face:null, video:null};

// Setup capture with preview and remove
const setupCapture = (vidId, captureBtnId, removeBtnId, previewId, key)=>{
    const video = document.getElementById(vidId);
    startCamera(video);

    document.getElementById(captureBtnId).onclick = async ()=>{
        blobs[key] = await captureImage(video);
        document.getElementById(previewId).src = URL.createObjectURL(blobs[key]);
        urls[key] = await uploadImage(blobs[key]);
        alert(`${key} captured and uploaded. Preview below.`);
    };

    if(removeBtnId){
        document.getElementById(removeBtnId).onclick = ()=>{
            blobs[key] = null;
            document.getElementById(previewId).src = "";
            urls[key] = null;
        };
    }
};

document.querySelectorAll(".btn-filled.next").forEach(btn => btn.disabled = false);

// ---------------- SETUP CAPTURES ----------------
setupCapture("idFrontPreview","captureIdFront","removeIdFront","idFrontImg","idFront");
setupCapture("idBackPreview","captureIdBack","removeIdBack","idBackImg","idBack");
setupCapture("selfiePreview","captureSelfie","removeSelfie","selfieImg","selfie");

// ---------------- SETUP FLIPS ----------------
setupFlip("flipIdFront","idFrontPreview");
setupFlip("flipIdBack","idBackPreview");
setupFlip("flipSelfie","selfiePreview");
setupFlip("flipVideo","videoPreview");

const videoPreview = document.getElementById("videoPreview");
const videoPlayback = document.getElementById("videoPlayback");
const timerEl = document.getElementById("videoTimer");
const startVideoBtn = document.getElementById("startVideoRecording");
let mediaRecorder, recordedChunks = [], videoStream, recording = false;

startCamera(videoPreview).then(stream => {
    videoStream = stream;
    startVideoBtn.disabled = false;
});

startVideoBtn.onclick = () => {
    if (!recording) {
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(videoStream, { mimeType: "video/webm" });
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = async () => {
            blobs.video = new Blob(recordedChunks, { type: "video/webm" });
            videoPlayback.src = URL.createObjectURL(blobs.video);
            urls.video = await uploadVideo(blobs.video);
            startVideoBtn.style.color = "green";
            alert("Video recorded and uploaded.");
        };
        mediaRecorder.start();
        recording = true;
        startVideoBtn.style.color = "red"; // recording
        let sec = 0;
        timerEl.innerText = "00 / 30s";
        const interval = setInterval(() => {
            sec++;
            timerEl.innerText = `${sec < 10 ? '0' : ''}${sec} / 30s`;
            if (sec >= 30) {
                mediaRecorder.stop();
                clearInterval(interval);
                recording = false;
            }
        }, 1000);
    } else {
        mediaRecorder.stop();
        recording = false;
    }
};

// Delete video
document.getElementById("removeVideo").onclick = () => {
    blobs.video = null;
    urls.video = null;
    videoPlayback.src = "";
    timerEl.innerText = "";
    startVideoBtn.style.color = "black";
};

// ---------------- CLOUDINARY UPLOAD ----------------
async function uploadImage(blob){
    const formData = new FormData();
    formData.append("file", blob);
    formData.append("upload_preset", UPLOAD_PRESET);
    const res = await fetch(CLOUDINARY_URL,{method:"POST",body:formData});
    const data = await res.json();
    return data.secure_url;
}

async function uploadVideo(blob){
    const formData = new FormData();
    formData.append("file", blob);
    formData.append("upload_preset", UPLOAD_PRESET);
    const res = await fetch(CLOUDINARY_VIDEO,{method:"POST",body:formData});
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
    if(!urls.idFront||!urls.idBack||!urls.selfie||!urls.face||!urls.video){
        alert("Please capture and upload all required files first.");
        return;
    }
    if(!isUsernameValid || !isMatricValid){
        alert("Username or Matric Number is already in use.");
        return;
    }

    const data = {
        fullName: document.getElementById("fullName").value,
        email: document.getElementById("email").value.trim().toLowerCase(),
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

    await addDoc(collection(db,"merchant_applications"),{
        ...data,
        files:{
            idFront:urls.idFront,
            idBack:urls.idBack,
            selfie:urls.selfie,
            faceScan:urls.face,
            verificationVideo:urls.video
        },
        catchPhrase:generateCatchPhrase(),
        status:"pending",
        submittedAt:serverTimestamp()
    });

    alert("Data sent, awaiting admin review.");
    document.getElementById("merchantVerificationForm").reset();
    location.reload();
});

// Facial scan auto-capture
const faceVideo = document.getElementById("faceScanPreview");
const faceImg = document.getElementById("faceScanImg");

// Facial scan setup (no buttons)
async function startFacialScan() {
    const faceVideo = document.getElementById("faceScanPreview");
    const faceImg = document.getElementById("faceScanImg");
    const removeBtn = document.createElement("button");

    removeBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
    removeBtn.className = "icon-btn remove-btn";
    faceVideo.parentElement.appendChild(removeBtn);

    await startCamera(faceVideo, "user"); // front camera

    // Auto-capture after 10s
    const captureTimeout = setTimeout(async () => {
        const blob = await captureImage(faceVideo);
        blobs.face = blob;
        faceImg.src = URL.createObjectURL(blob);
        urls.face = await uploadImage(blob);
        alert("Facial scan captured and uploaded!");
    }, 10000);

    // Delete button functionality
    removeBtn.onclick = () => {
        clearTimeout(captureTimeout); // cancel auto capture if needed
        blobs.face = null;
        urls.face = null;
        faceImg.src = "";
        startFacialScan(); // restart scan
    };
}

