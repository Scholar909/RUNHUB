import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { 
getFirestore, 
collection, 
addDoc, 
serverTimestamp, 
query, 
where, 
getDocs,
doc,
getDoc,
setDoc
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const ADMIN_PHONE = "2349168873680";
const CALLMEBOT_API_KEY = "7465463"; 

document.addEventListener("DOMContentLoaded", () => {

/* ---------------- FIREBASE ---------------- */

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


/* ---------------- STOP ALL CAMERAS ---------------- */

function stopAllCameras(){
document.querySelectorAll("video").forEach(v=>{
if(v.srcObject){
v.srcObject.getTracks().forEach(t=>t.stop());
v.srcObject=null;
}
});
}


/* ---------------- CLOUDINARY ---------------- */

const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dltoup0cz/image/upload";
const CLOUDINARY_VIDEO = "https://api.cloudinary.com/v1_1/dltoup0cz/video/upload";
const UPLOAD_PRESET = "runhub_uploads";
// Add this at the top with your other constants

/* ---------------- VALIDATION ---------------- */

let isUsernameValid=false;
let isMatricValid=false;

const debounce=(func,delay)=>{
    let timeout;
    return(...args)=>{
        clearTimeout(timeout);
        timeout=setTimeout(()=>func.apply(this,args),delay);
    };
};

// Add this immediately after debounce
// Keep your validation as-is
function isValidMatric(matric) {
    // Example pattern: RUN/CPE/23/14551
    const pattern = /^[A-Z]{2,5}\/[A-Z]{2,5}\/\d{2}\/\d{4,6}$/;
    return pattern.test(matric);
}

function isValidUsername(username) {
    // Allows letters, numbers, and underscores only
    const pattern = /^[a-zA-Z0-9_]+$/;
    return pattern.test(username);
}

// Encode matric for Firestore
function encodeMatric(matric) {
    return matric.replace(/\//g, "_"); // Replace all slashes with underscores
}

const checkUniqueness = async (field, value, statusId) => {
    const statusEl = document.getElementById(statusId);

    if (!value || value.length < 3) {
        statusEl.innerText = "";
        return;
    }

    statusEl.innerText = "Checking...";
    statusEl.style.color = "gray";

    try {
        const id = field === "username" 
            ? value.toLowerCase() 
            : `${encodeMatric(value)}_merchant`; // Appending role

        const collectionName = field === "username" ? "usernames" : "matricNumbers";

        const docSnap = await getDoc(doc(db, collectionName, id));

        if (!docSnap.exists()) {
            statusEl.innerText = "✓ Available";
            statusEl.style.color = "#34c759";

            if (field === "username") isUsernameValid = true;
            if (field === "matricNumber") isMatricValid = true; // reuse matric variable for email

        } else {
            statusEl.innerText = "✕ Already Taken";
            statusEl.style.color = "#ff3b30";

            if (field === "username") isUsernameValid = false;
            if (field === "matricNumber") isMatricValid = false;
        }
    } catch (err) {
        console.error(err);
        statusEl.innerText = "Network error";
        statusEl.style.color = "orange";
    }
};

document.getElementById("username").addEventListener("input", debounce(e => {
    const val = e.target.value.trim();
    const statusEl = document.getElementById("username-status");

    if (!isValidUsername(val)) {
        statusEl.innerText = "✕ Only a-z, 0 to 9, and _ allowed";
        statusEl.style.color = "#ff3b30";
        isUsernameValid = false;
        return;
    }

    // If format is good, check database
    checkUniqueness("username", val.toLowerCase(), "username-status");
}, 500));


document.getElementById("matricNumber").addEventListener("input", debounce(e => {
    const val = e.target.value.trim().toUpperCase();
    const statusEl = document.getElementById("matric-status");

    if (!isValidMatric(val)) {
        statusEl.innerText = "✕ Invalid format. Example: RUN/ABC/12/12345";
        statusEl.style.color = "#ff3b30";
        isMatricValid = false;
        return;
    }

    // Continue checking uniqueness
    checkUniqueness("matricNumber", val, "matric-status");
}, 500));


/* ---------------- MULTI STEP FORM ---------------- */

const sections=document.querySelectorAll(".form-section");
let currentSection=0;

function showSection(index){

stopAllCameras();

sections.forEach((section,i)=>{

section.classList.remove("active");

if(i===index){

section.classList.add("active");

if(section.dataset.requiresFiles?.includes("face") && !blobs.face){
startFacialScan();
}

if(section.dataset.requiresFiles?.includes("video")){
startVideoCamera();
}

}

});

currentSection=index;

}

document.querySelectorAll(".next").forEach(btn=>{

btn.addEventListener("click",()=>{

const section=sections[currentSection];
const required=section.dataset.requiresFiles?.split(",") || [];

if(required.length && required.some(f=>!urls[f])){
alert("Please capture and upload all required files before proceeding.");
return;
}

const inputs=section.querySelectorAll("input[required],select[required]");

for(let input of inputs){

if(!input.value.trim()){
alert(`Please fill: ${input.previousElementSibling.innerText}`);
input.focus();
return;
}

}

if(currentSection<sections.length-1){
showSection(currentSection+1);
}

});

});

document.querySelectorAll(".prev").forEach(btn=>{
btn.addEventListener("click",()=>{
if(currentSection>0) showSection(currentSection-1);
});
});


/* ---------------- CAMERA ---------------- */

const facingModes={};

async function startCamera(video,facingMode="user"){

try{

if(video.srcObject){
video.srcObject.getTracks().forEach(t=>t.stop());
video.srcObject=null;
}

await new Promise(res=>setTimeout(res,300));

const stream=await navigator.mediaDevices.getUserMedia({
video:{facingMode:{ideal:facingMode}},
audio:true
});

video.srcObject=stream;
await video.play();

return stream;

}catch(err){

console.error(err);
alert("Camera permission denied");

}

}

function setupFlip(btnId,videoId){

const btn=document.getElementById(btnId);
const video=document.getElementById(videoId);

if(!btn || !video) return;

facingModes[videoId]="user";

btn.onclick=async()=>{

facingModes[videoId]=facingModes[videoId]==="user"?"environment":"user";

await startCamera(video,facingModes[videoId]);

};

}


/* ---------------- IMAGE CAPTURE ---------------- */

function captureImage(video){

const canvas=document.createElement("canvas");

canvas.width=video.videoWidth;
canvas.height=video.videoHeight;

canvas.getContext("2d").drawImage(video,0,0);

return new Promise(resolve=>{
canvas.toBlob(blob=>resolve(blob),"image/jpeg");
});

}


let blobs={idFront:null,idBack:null,selfie:null,face:null,video:null};
let urls={idFront:null,idBack:null,selfie:null,face:null,video:null};


function setupCapture(videoId,captureBtn,removeBtn,previewId,key){

const video=document.getElementById(videoId);

document.getElementById(captureBtn).onclick=async()=>{

if(!video.srcObject) await startCamera(video);

blobs[key]=await captureImage(video);

document.getElementById(previewId).src=URL.createObjectURL(blobs[key]);

urls[key]=await uploadImage(blobs[key]);

alert(`${key} captured`);

};

if(removeBtn){

document.getElementById(removeBtn).onclick=()=>{

blobs[key]=null;
urls[key]=null;
document.getElementById(previewId).src="";

};

}

}


/* ---------------- CAPTURE SETUP ---------------- */

setupCapture("idFrontPreview","captureIdFront","removeIdFront","idFrontImg","idFront");
setupCapture("idBackPreview","captureIdBack","removeIdBack","idBackImg","idBack");
setupCapture("selfiePreview","captureSelfie","removeSelfie","selfieImg","selfie");


/* ---------------- CAMERA FLIP ---------------- */

setupFlip("flipIdFront","idFrontPreview");
setupFlip("flipIdBack","idBackPreview");
setupFlip("flipSelfie","selfiePreview");
setupFlip("flipVideo","videoPreview");


/* ---------------- VIDEO RECORDING ---------------- */

const videoPreview=document.getElementById("videoPreview");
const videoPlayback=document.getElementById("videoPlayback");
const timerEl=document.getElementById("videoTimer");
const startVideoBtn=document.getElementById("startVideoRecording");

let mediaRecorder;
let recordedChunks=[];
let videoStream;
let recording=false;
let videoInterval;

async function startVideoCamera(){

if(videoStream) return;

videoStream=await startCamera(videoPreview);
startVideoBtn.disabled=false;

}

startVideoBtn.onclick = () => {

  if(!recording){

    // Start recording
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(videoStream, { mimeType: "video/webm; codecs=vp8,opus" });

    mediaRecorder.ondataavailable = e => {
      if(e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      clearInterval(videoInterval);

      blobs.video = new Blob(recordedChunks, { type: "video/webm" });
      videoPlayback.src = URL.createObjectURL(blobs.video);

      urls.video = await uploadVideo(blobs.video);

      alert("Video recorded");

      // Turn button green
      startVideoBtn.style.backgroundColor = "green";
    };

    mediaRecorder.start();
    recording = true;

    // Turn button red
    startVideoBtn.style.backgroundColor = "red";

    let sec = 0;
    videoInterval = setInterval(() => {
      sec++;
      timerEl.innerText = `${sec}/30s`;

      if(sec >= 30){
        clearInterval(videoInterval);
        mediaRecorder.stop();
        recording = false;
      }
    }, 1000); // <-- correct interval to 1 second

  } else {
    // Stop recording manually
    mediaRecorder.stop();
    recording = false;
  }

};

document.getElementById("removeVideo").onclick=()=>{

blobs.video=null;
urls.video=null;
videoPlayback.src="";
timerEl.innerText="";

};


/* ---------------- CLOUDINARY ---------------- */

/* --- sign-ups.js FIX --- */

async function uploadImage(blob) {
    const fd = new FormData();
    fd.append("file", blob);
    fd.append("upload_preset", UPLOAD_PRESET);
    // Add this to tell Cloudinary to figure out if it's an image or a PDF/Raw file
    fd.append("resource_type", "auto"); 

    try {
        const res = await fetch(CLOUDINARY_URL, { method: "POST", body: fd });
        if (!res.ok) {
            const errorData = await res.json();
            console.error("Cloudinary Upload Error:", errorData);
            return null;
        }
        const data = await res.json();
        return data.secure_url;
    } catch (err) {
        console.error("Upload failed:", err);
        return null;
    }
}

async function uploadVideo(blob){

const fd=new FormData();

fd.append("file",blob);
fd.append("upload_preset",UPLOAD_PRESET);

const res=await fetch(CLOUDINARY_VIDEO,{method:"POST",body:fd});
const data=await res.json();

return data.secure_url;

}


/* ---------------- FACE SCAN ---------------- */

async function startFacialScan(){

const faceVideo=document.getElementById("faceScanPreview");
const faceImg=document.getElementById("faceScanImg");

await startCamera(faceVideo);

setTimeout(async()=>{

const blob=await captureImage(faceVideo);

blobs.face=blob;
faceImg.src=URL.createObjectURL(blob);
document.getElementById("removeFace").style.display="inline-block";

urls.face=await uploadImage(blob);

alert("Face captured");

},7000);

document.getElementById("removeFace").onclick=()=>{

blobs.face=null;
urls.face=null;

faceImg.src="";

startFacialScan();

};

}

/* ---------------- FORM SUBMIT ---------------- */

document.getElementById("merchantVerificationForm").addEventListener("submit", async e => {

  e.preventDefault();
  
  const usernameInput = document.getElementById("username");
  const emailInput = document.getElementById("email");
  const matricInput = document.getElementById("matricNumber");
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerText = "Submitting Application...";
  
  const rawUsername = usernameInput.value.trim();
  const rawEmail = emailInput.value.trim().toLowerCase(); // Lowercase email here
  
  // 1. Format Check for Username
  if (!isValidUsername(rawUsername)) {
      alert("Username can only contain letters, numbers, and underscores.");
      submitBtn.disabled = false;
      submitBtn.innerText = "Submitting Application...";
      return;
  }

  if(!urls.idFront || !urls.idBack || !urls.selfie || !urls.face || !urls.video){
    alert("Please capture all required files.");
    return;
  }

  if(!isUsernameValid || !isMatricValid){
    alert("Username or Matric already exists.");
    return;
  }
  
  const data = {
    fullName: fullName.value,
    email: email.value.trim().toLowerCase(),
    username: username.value.trim().toLowerCase(),
    phoneNumber: phoneNumber.value,
    matricNumber: matricNumber.value.trim().toUpperCase(),
    department: department.value,
    level: level.value,
    gender: gender.value,
    hostel: hostel.value,
    block: block.value,
    room: room.value,
    bankName: bankName.value,
    accountName: accountName.value,
    accountNumber: accountNumber.value
  };

  const usernameId = data.username;
  const matricId = `${encodeMatric(data.matricNumber)}_merchant`;


  const usernameRef = doc(db, "usernames", usernameId);
  const matricRef = doc(db, "matricNumbers", matricId);

  const usernameSnap = await getDoc(usernameRef);
  const matricSnap = await getDoc(matricRef);

  if(usernameSnap.exists() || matricSnap.exists()){
    alert("Username or Matric already taken.");
    return;
  }

  const catchPhrase = generateCatchPhrase();
  
  
  // 1. Generate the Page Blobs (This is now an Array of Blobs)
  const pageBlobs = await generateBindingAgreement(data, urls.face);
  
  // 2. Upload all pages to Cloudinary individually
  // We use Promise.all to upload them all at once and get an array of URLs back
  const pageUrls = await Promise.all(pageBlobs.map(blob => uploadImage(blob)));
  
  // Check if any upload failed
  if (pageUrls.some(url => !url)) {
      alert("Failed to generate or upload the Binding Agreement pages. Please try again.");
      submitBtn.disabled = false;
      submitBtn.innerText = "Submit Application";
      return; 
  }
  
  // 3. Save to Firestore
  await addDoc(collection(db, "merchant_applications"), {
    ...data,
    files: {
      idFront: urls.idFront,
      idBack: urls.idBack,
      selfie: urls.selfie,
      faceScan: urls.face,
      verificationVideo: urls.video,
      // Store the array of URLs so you can display page 1, then page 2, etc.
      bindingAgreementSheets: pageUrls 
    },
    catchPhrase: catchPhrase,
    status: "pending",
    submittedAt: serverTimestamp()
  });

  
  // MOVE THE ALERT HERE - Before external API calls
  alert(`Application submitted successfully!\n\nYour catch phrase is:\n"${catchPhrase}"\n\nPlease save this for phone verification.`);
  
  try {
      // These are secondary; don't let them block the success message
      await sendAdminMerchantAlert(data);
      await Promise.all([
          setDoc(doc(db,"usernames",usernameId),{reserved:true}),
          setDoc(doc(db,"matricNumbers",matricId),{reserved:true})
      ]);
  } catch (err) {
      console.error("Secondary tasks failed:", err);
  }
  
  window.location.href = "./sign-login.html";

});

function generateCatchPhrase() {
    const phrases = [
        "Silver Mango 82",
        "Library Falcon Window",
        "The river flows east today",
        "Crimson Tiger Jump",
        "Sunny Orange Sky",
        "Quiet Mountain Echo",
        "Blue Horizon Run",
        "Golden Leaf Whisper",

        // New additions
        "Midnight Owl Signal",
        "Electric Sunset Drive",
        "Hidden Bamboo Path",
        "Rapid Thunder Pulse",
        "Velvet Storm Rising",
        "Silent Ocean Drift",
        "Neon City Breeze",
        "Broken Clock Wisdom",
        "Emerald Skyfall",
        "Rolling Desert Code",
        "Frozen Flame Spark",
        "Cosmic Banana Loop",
        "Wild Cherry Orbit",
        "Shadow Lantern Glow",
        "Purple Rain Circuit",
        "Floating Island Signal",
        "Retro Pixel Dream",
        "Caffeine Powered Genius",
        "Binary Sunset Mood",
        "Soft Chaos Theory",
        "Invisible Crown Energy",
        "Dancing Gravity Shift",
        "Turbo Penguin Mode",
        "Infinite Loop Vibes",
        "Cloud Nine Protocol",
        "Digital Jungle Beat",
        "Starlight Coffee Break",
        "Mystic River Sync",
        "Urban Legend Loading",
        "Golden Hour Hack",
        "Phantom WiFi Spirit",
        "Parallel Universe Ping",
        "Skyline Echo Burst",
        "Quantum Chill State",
        "Firefly Debug Mode",
        "Zero Gravity Focus",
        "Hidden Level Unlocked",
        "Dark Mode Energy",
        "Silent Thunder Move",
        "Code Ninja Awakens"
    ];

    return phrases[Math.floor(Math.random() * phrases.length)];
}
});

async function generateBindingAgreement(data, faceScanUrl) {
    const pages = [];
    const canvasWidth = 2480; // A4 at 300 DPI
    const canvasHeight = 3508;
    const margin = 200; // Standard professional margin
    const contentWidth = canvasWidth - (margin * 2);
    const lineHeight = 60;
    const sectionSpacing = 80;

    const loadImage = (url) => new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });

    const faceImg = await loadImage(faceScanUrl);
    const watermark = await loadImage("/start/backdrop.png");

    // NEW STRUCTURE: Exact human-worded pledge
    const sections = [
        { type: 'header', title: "NOVAHUB MERCHANT BINDING AGREEMENT", sub: "Redeemer's University, Ede, Osun State" },
        { 
            type: 'body', 
            title: "1. Merchant Identity", 
            text: `I, ${data.fullName.toUpperCase()},\na student of REDEEMER'S UNIVERSITY, EDE\nwith Matric Number ${data.matricNumber},\nand Username ${data.username},\n\nhereby register as a Merchant on the NOVAHUB platform.` 
        },
        { 
            type: 'body', 
            title: "2. Core Responsibility", 
            text: "I understand that NOVAHUB connects me directly with customers who trust the platform to deliver goods and services reliably.",
            boldLabel: "I hereby agree that:",
            bullets: [
                "I will honestly receive and process all customer orders",
                "I will only accept payments for orders I intend to fulfill",
                "I will deliver the correct items requested by the customer within a reasonable time"
            ]
        },
        { 
            type: 'body', 
            title: "3. Refund Obligation", 
            boldLabel: "In any situation where:",
            bullets: [
                "I am unable to complete an order, OR",
                "The requested item is unavailable, OR",
                "I fail to deliver as agreed"
            ],
            footerText: "I must refund the FULL amount paid by the customer immediately. Failure to refund will be considered fraudulent behavior."
        },
        { 
            type: 'body', 
            title: "4. Platform Commission", 
            boldLabel: "I acknowledge that:",
            bullets: [
                "NOVAHUB earns a commission or service fee from transactions conducted through the platform",
                "Any amount owed to NOVAHUB is NOT my personal income"
            ],
            boldLabel2: "I agree that:",
            bullets2: [
                "I will accurately remit all platform fees owed",
                "I will not bypass, avoid, or manipulate the system to withhold NOVAHUB’s earnings"
            ],
            footerText: "Failure to remit these funds will be treated as financial misconduct and breach of agreement."
        },
        { 
            type: 'body', 
            title: "5. Accountability & Enforcement", 
            boldLabel: "I understand that:",
            bullets: [
                "My identity and student details have been recorded",
                "Any misconduct can be traced back to me"
            ],
            boldLabel2: "If I violate this agreement, I accept that:",
            bullets2: [
                "My account will be suspended or permanently banned",
                "I may be reported to school authorities (if applicable)",
                "I may be publicly blacklisted from the platform",
                "I may be required to repay all owed funds"
            ]
        },
        { 
            type: 'body', 
            title: "6. Good Faith Commitment", 
            boldLabel: "I agree to operate on NOVAHUB with:",
            bullets: ["Honesty", "Responsibility", "Respect for customers and the platform"],
            footerText: "I understand that this platform depends on trust, and any abuse of that trust will carry consequences."
        },
        { 
            type: 'body', 
            title: "7. Agreement Confirmation", 
            boldLabel: "By signing below, I confirm that:",
            bullets: [
                "I have read and understood this agreement",
                "I accept all responsibilities stated above",
                "I agree to be held accountable for my actions on NOVAHUB"
            ]
        }
    ];

    let currentSectionIndex = 0;
    let pageCount = 0;

    while (currentSectionIndex < sections.length) {
        pageCount++;
        const canvas = document.createElement("canvas");
        canvas.width = canvasWidth; canvas.height = canvasHeight;
        const ctx = canvas.getContext("2d");

        // Background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // Watermark on EVERY page
        if (watermark) {
            ctx.save();
            ctx.globalAlpha = 0.20;
            ctx.drawImage(watermark, (canvasWidth - 1600) / 2, (canvasHeight - 1600) / 2, 1600, 1600);
            ctx.restore();
        }

        // Face Scan - FIRST PAGE ONLY
        if (faceImg && pageCount === 1) {
            ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
            const faceW = 350; const faceH = 450;
            ctx.strokeRect(canvasWidth - margin - faceW, margin, faceW, faceH);
            ctx.drawImage(faceImg, canvasWidth - margin - faceW, margin, faceW, faceH);
        }

        let y = margin + 50;

        for (let i = currentSectionIndex; i < sections.length; i++) {
            const sec = sections[i];
            
            // Check if we need a new page BEFORE rendering a section
            if (y > 2800) break; 

            ctx.fillStyle = "#000";
            ctx.textAlign = "left";

            if (sec.type === 'header') {
                ctx.font = "bold 70px Helvetica";
                ctx.fillText(sec.title, margin, y);
                y += 80;
                ctx.font = "40px Helvetica";
                ctx.fillText(sec.sub, margin, y);
                y += (pageCount === 1) ? 550 : 150; // Extra space for face scan on P1
            } else {
                // Section Title
                ctx.font = "bold 48px Helvetica";
                ctx.fillText(sec.title, margin, y);
                y += 70;

                ctx.font = "40px Helvetica";
                // Main Text
                if (sec.text) {
                    y = wrapText(ctx, sec.text, margin, y, contentWidth, lineHeight);
                    y += 30;
                }

                // Render first set of Bullets
                if (sec.boldLabel) {
                    ctx.font = "bold 40px Helvetica";
                    ctx.fillText(sec.boldLabel, margin, y);
                    y += 60;
                }
                if (sec.bullets) {
                    ctx.font = "40px Helvetica";
                    sec.bullets.forEach(b => {
                        ctx.fillText("• " + b, margin + 40, y);
                        y += lineHeight;
                    });
                    y += 20;
                }

                // Render second set of Bullets (if exists)
                if (sec.boldLabel2) {
                    ctx.font = "bold 40px Helvetica";
                    ctx.fillText(sec.boldLabel2, margin, y);
                    y += 60;
                }
                if (sec.bullets2) {
                    ctx.font = "40px Helvetica";
                    sec.bullets2.forEach(b => {
                        ctx.fillText("• " + b, margin + 40, y);
                        y += lineHeight;
                    });
                    y += 20;
                }

                if (sec.footerText) {
                    ctx.font = "italic 40px Helvetica";
                    y = wrapText(ctx, sec.footerText, margin, y, contentWidth, lineHeight);
                }

                y += sectionSpacing;
            }
            currentSectionIndex++;
        }

        // Signature logic: check if there's enough room
        const sigHeight = 400;
        if (currentSectionIndex >= sections.length) {
            if (y + sigHeight > canvasHeight - margin) {
                // Not enough room for signature, push to a brand new page
                const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
                pages.push(blob);
                
                // Create final signature-only page
                const sigCanvas = document.createElement("canvas");
                sigCanvas.width = canvasWidth; sigCanvas.height = canvasHeight;
                const sigCtx = sigCanvas.getContext("2d");
                sigCtx.fillStyle = "#fff"; sigCtx.fillRect(0,0, canvasWidth, canvasHeight);
                if(watermark) { sigctx.globalAlpha = 0.20; sigCtx.drawImage(watermark, (canvasWidth-1600)/2, (canvasHeight-1600)/2, 1600, 1600); sigCtx.globalAlpha=1; }
                renderSignature(sigCtx, canvasWidth, margin, 500);
                const sigBlob = await new Promise(res => sigCanvas.toBlob(res, 'image/png'));
                pages.push(sigBlob);
                return pages; 
            } else {
                renderSignature(ctx, canvasWidth, margin, 3100);
            }
        }

        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        pages.push(blob);
    }

    return pages;
}

// Helper to render signature lines
function renderSignature(ctx, canvasWidth, margin, sigY) {
    ctx.strokeStyle = "#000"; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(margin, sigY); ctx.lineTo(margin + 800, sigY);
    ctx.moveTo(canvasWidth - margin - 800, sigY); ctx.lineTo(canvasWidth - margin, sigY);
    ctx.stroke();
    ctx.fillStyle = "#000";
    ctx.font = "italic 38px Helvetica";
    ctx.textAlign = "left";
    ctx.fillText("Merchant Digital Signature & Date", margin, sigY + 60);
    ctx.textAlign = "right";
    ctx.fillText("Authorized NOVAHUB Representative", canvasWidth - margin, sigY + 60);
}

// Fixed WrapText to handle \n properly
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        let words = lines[i].split(' ');
        let line = '';
        for (let n = 0; n < words.length; n++) {
            let testLine = line + words[n] + ' ';
            let metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && n > 0) {
                ctx.fillText(line, x, y);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, y);
        y += lineHeight;
    }
    return y;
}

async function sendAdminMerchantAlert(data) {
    const ADMIN_PHONE = "2349168873680";
    const CALLMEBOT_API_KEY = "7465463"; 

    try {
        const now = new Date();
        const currentHour = now.getHours();

        const options = { weekday: 'long' };
        const todayName = new Intl.DateTimeFormat('en-US', options).format(now);

        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const tomorrowName = new Intl.DateTimeFormat('en-US', options).format(tomorrow);

        const nextTomorrow = new Date(now);
        nextTomorrow.setDate(now.getDate() + 2);
        const nextTomorrowName = new Intl.DateTimeFormat('en-US', options).format(nextTomorrow);

        let dayOptions = (currentHour < 20) 
            ? `1. Today (${todayName}), 2. Tomorrow (${tomorrowName}), 3. ${nextTomorrowName}`
            : `1. Tomorrow (${tomorrowName}), 2. ${nextTomorrowName}`;

        // ✅ ONE-LINE MESSAGE (no \n at all)
        const replyMessage = 
`Hello ${data.fullName}, your sign up request for NOVAHUB has been received 🚀, we need to decide on a date and time for your physical verification and signing of the binding agreement, please let us know which day works best for you, ${dayOptions}, once you have decided, we will pick a specific time.`;

        // ✅ Encode once (safe now)
        const encodedMessage = encodeURIComponent(replyMessage);

        // ✅ Single clean clickable link
        const adminReplyUrl = `https://wa.me/${data.phoneNumber}?text=${encodedMessage}`;

        const notificationRaw = 
`*MERCHANT SIGN UP ALERT - NOVAHUB*

*Name:* ${data.fullName}
*Username:* ${data.username}
*Matric:* ${data.matricNumber}
*Submitted:* ${now.toLocaleTimeString()}

*REPLY TO MERCHANT:*
${adminReplyUrl}`;

        const notificationText = encodeURIComponent(notificationRaw);

        const url = `https://api.callmebot.com/whatsapp.php?phone=${ADMIN_PHONE}&text=${notificationText}&apikey=${CALLMEBOT_API_KEY}`;

        await fetch(url, { mode: 'no-cors' });

        console.log("✅ Perfect: One clean link + clean readable message.");

    } catch (err) {
        console.error("❌ Error:", err);
    }
}