import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// -------------------------
// CLOUDINARY CONFIG
// -------------------------
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dltoup0cz/image/upload";
const UPLOAD_PRESET = "runhub_uploads";

// -------------------------
// FIREBASE CONFIG
// -------------------------
const firebaseConfig = {
    apiKey: "AIzaSyC7onB0OptTyu-J6J1PwU6zX799tQIjh4k",
    authDomain: "affiliate-app-dab95.firebaseapp.com",
    databaseURL: "https://affiliate-app-dab95-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "affiliate-app-dab95",
    storageBucket: "affiliate-app-dab95.appspot.com",
    messagingSenderId: "510180440268",
    appId: "1:510180440268:web:99be47162857f635d8ea69"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// -------------------------
// FORM NAVIGATION
// -------------------------
const formSections = document.querySelectorAll(".form-section");
let currentSection = 0;

const showSection = (index) => {
    formSections.forEach((sec, i) => sec.classList.toggle("active", i === index));
};
showSection(currentSection);

document.querySelectorAll(".btn.next").forEach(btn => btn.disabled = true);
document.querySelectorAll(".btn.next").forEach(btn => {
    btn.addEventListener("click", () => {
        if (currentSection < formSections.length - 1) {
            currentSection++;
            showSection(currentSection);
        }
    });
});
document.querySelectorAll(".btn.prev").forEach(btn => {
    btn.addEventListener("click", () => {
        if (currentSection > 0) {
            currentSection--;
            showSection(currentSection);
        }
    });
});

// -------------------------
// MEDIA STATE
// -------------------------
const mediaState = { idFront: null, idBack: null, selfie: null, face: null, video: null };

// -------------------------
// RANDOM CATCH PHRASE
// -------------------------
function generateCatchPhrase() {
    const phrases = [
        "Silver Mango 82",
        "Library Falcon Window",
        "The river flows east today",
        "Bright Moon Shadow",
        "Green Tiger Jump",
        "Skyline River Drift"
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}

// -------------------------
// CLOUDINARY UPLOAD
// -------------------------
async function uploadToCloudinary(fileOrDataUrl) {
    const formData = new FormData();
    formData.append("file", fileOrDataUrl);
    formData.append("upload_preset", UPLOAD_PRESET);
    const res = await fetch(CLOUDINARY_URL, { method: "POST", body: formData });
    const data = await res.json();
    return data.secure_url;
}

// -------------------------
// CAMERA HANDLER
// -------------------------
async function initCamera(videoEl, facingMode = "environment") {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: true });
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
}

// Capture photo and upload
async function captureAndUpload(videoEl, previewImg, key, nextBtn) {
    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.getContext("2d").drawImage(videoEl, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/png");
    previewImg.src = dataUrl;

    // Upload
    const uploadedUrl = await uploadToCloudinary(dataUrl);
    mediaState[key] = uploadedUrl;
    alert(`${key} uploaded successfully!`);

    // Enable Next button
    if (nextBtn) nextBtn.disabled = false;
}

// -------------------------
// VIDEO RECORDING WITH AUDIO
// -------------------------
const videoPreview = document.getElementById("videoPreview");
const videoPlayback = document.getElementById("videoPlayback");
const startVideoBtn = document.getElementById("startVideoRecording");
const removeVideoBtn = document.getElementById("removeVideo");
const videoTimerEl = document.getElementById("videoTimer");

let mediaRecorder, recordedChunks = [];

startVideoBtn.addEventListener("click", async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        startVideoBtn.style.backgroundColor = "green";
        return;
    }
    const stream = await initCamera(videoPreview, "user");
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];
    mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
    mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        videoPlayback.src = url;

        // Upload to Cloudinary
        const uploadedUrl = await uploadToCloudinary(blob);
        mediaState.video = uploadedUrl;
        alert("Video uploaded successfully!");
        startVideoBtn.disabled = false;
    };
    mediaRecorder.start();
    startVideoBtn.style.backgroundColor = "red";

    let seconds = 0;
    const timerInterval = setInterval(() => {
        seconds++;
        videoTimerEl.textContent = `${String(seconds).padStart(2, "0")} / 30s`;
        if (seconds >= 30) {
            mediaRecorder.stop();
            clearInterval(timerInterval);
        }
    }, 1000);
});
removeVideoBtn.addEventListener("click", () => {
    videoPlayback.src = "";
    mediaState.video = null;
    startVideoBtn.disabled = false;
});

// -------------------------
// FORM SUBMISSION
// -------------------------
const merchantForm = document.getElementById("merchantVerificationForm");
merchantForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Ensure all media uploaded
    if (!mediaState.idFront || !mediaState.idBack || !mediaState.selfie || !mediaState.face || !mediaState.video) {
        return alert("Please upload all required media before submitting!");
    }

    const catchPhrase = generateCatchPhrase();

    const data = {
        fullName: document.getElementById("fullName").value,
        email: document.getElementById("email").value,
        phoneNumber: document.getElementById("phoneNumber").value,
        username: document.getElementById("username").value.trim().toLowerCase(),
        matricNumber: document.getElementById("matricNumber").value,
        department: document.getElementById("department").value,
        level: document.getElementById("level").value,
        gender: document.getElementById("gender").value,
        hostel: document.getElementById("hostel").value,
        block: document.getElementById("block").value,
        room: document.getElementById("room").value,
        bankName: document.getElementById("bankName").value,
        accountName: document.getElementById("accountName").value,
        accountNumber: document.getElementById("accountNumber").value,
        files: { ...mediaState },
        catchPhrase,
        submittedAt: serverTimestamp(),
        status: "pending"
    };

    try {
        await setDoc(doc(db, "merchant_applications", Date.now().toString()), data);
        alert(`Application submitted successfully! Your catch phrase: "${catchPhrase}"\nPlease save it for phone verification.`);
        merchantForm.reset();
        window.location.reload();
    } catch (err) {
        console.error(err);
        alert("Failed to submit application: " + err.message);
    }
});