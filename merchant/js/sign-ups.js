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
const ADMIN_PHONE = "2349168873680";
const CALLMEBOT_API_KEY = "7465463"; 


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
  
  
  // 1. Generate the PDF Blob
  const pdfBlob = await generateBindingAgreement(data, urls.face);
  
  // 2. Upload PDF to Cloudinary (using your existing upload logic)
  // 2. Upload PDF to Cloudinary
  const pdfUrl = await uploadImage(pdfBlob); 
  
  if (!pdfUrl) {
      alert("Failed to generate or upload the Binding Agreement. Please try again.");
      submitBtn.disabled = false;
      submitBtn.innerText = "Submit Application";
      return; // Stop here if PDF failed
  }
  
  await addDoc(collection(db, "merchant_applications"), {
    ...data,
    files: {
      idFront: urls.idFront,
      idBack: urls.idBack,
      selfie: urls.selfie,
      faceScan: urls.face,
      verificationVideo: urls.video,
      bindingAgreementBlank: pdfUrl
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
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- Header ---
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("NOVAHUB MERCHANT BINDING AGREEMENT", pageWidth / 2, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Redeemer's University, Ede - Official Business Partner", pageWidth / 2, 27, { align: "center" });
    doc.line(margin, 32, pageWidth - margin, 32);

    // --- Passport Photo (Face Scan) ---
    try {
        // We fetch the image to convert it to a base64 string for jsPDF
        const response = await fetch(faceScanUrl);
        const blob = await response.blob();
        const base64Img = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
        doc.addImage(base64Img, 'JPEG', margin, 40, 35, 45); // Top Left Passport
    } catch (e) {
        doc.rect(margin, 40, 35, 45);
        doc.text("Photo ID", margin + 10, 62);
    }

    // --- Merchant Details ---
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("MERCHANT DETAILS", 65, 45);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Full Name: ${data.fullName}`, 65, 52);
    doc.text(`Matric No: ${data.matricNumber}`, 65, 58);
    doc.text(`Department: ${data.department} (${data.level}L)`, 65, 64);
    doc.text(`Contact: ${data.phoneNumber}`, 65, 70);
    doc.text(`Address: ${data.hostel}, Block ${data.block}, Room ${data.room}`, 65, 76);

    // --- The Agreement Body ---
    doc.setFont("helvetica", "bold");
    doc.text("AFFIDAVIT & TERMS OF ENGAGEMENT", margin, 100);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    
    const agreementText = `I, ${data.fullName.toUpperCase()}, a student of Redeemer's University, Ede, hereby solemnly affirm and agree to be bound by the operational guidelines of NOVAHUB. 

1. FINANCIAL OBLIGATION: I acknowledge that funds received from customers are held in trust. I am obligated to utilize said funds solely for the purchase of requested goods.
2. REFUND POLICY: If an order is declined or cannot be fulfilled, I must refund the full amount to the customer within 30 minutes.
3. DELIVERY: I commit to delivering orders promptly. Failure to deliver or refund constitutes a breach of trust and will be reported to the Directorate of Student Services (DSSS) and the Chief Security Officer (CSO).
4. DISPUTE RESOLUTION: I agree that in cases of network delays (where funds are not visible within 10 minutes), I must contact NOVAHUB support immediately.
5. LEGAL STANDING: I understand that NOVAHUB is a registered business entity within Redeemer's University. Any fraudulent activity will result in immediate suspension and disciplinary action by school authorities based on the data provided herein.`;

    const splitText = doc.splitTextToSize(agreementText, pageWidth - (margin * 2));
    doc.text(splitText, margin, 110);

    // --- Signatures ---
    const sigY = 180;
    doc.line(margin, sigY, margin + 60, sigY);
    doc.text("Merchant Signature & Date", margin, sigY + 5);

    doc.line(pageWidth - margin - 60, sigY, pageWidth - margin, sigY);
    doc.text("Admin / Representative", pageWidth - margin - 60, sigY + 5);

    // --- Return the PDF as a Blob for uploading to Cloudinary ---
    return doc.output('blob');
}

async function sendAdminMerchantAlert(data) {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Day formatting logic
    const options = { weekday: 'long' };
    const todayName = new Intl.DateTimeFormat('en-US', options).format(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowName = new Intl.DateTimeFormat('en-US', options).format(tomorrow);
    
    const nextTomorrow = new Date(now);
    nextTomorrow.setDate(now.getDate() + 2);
    const nextTomorrowName = new Intl.DateTimeFormat('en-US', options).format(nextTomorrow);

    // Determine available days based on 8:00 PM (20:00) cutoff
    let dayOptions = "";
    if (currentHour < 20) {
        dayOptions = `1. Today (${todayName})\n2. Tomorrow (${tomorrowName})\n3. ${nextTomorrowName}`;
    } else {
        dayOptions = `1. Tomorrow (${tomorrowName})\n2. ${nextTomorrowName}`;
    }

    const responseGreeting = `Hello ${data.fullName},\n\nYour sign up request for NOVAHUB has been received! 🚀\n\nWe need to decide on a date and time for your physical verification and signing of the binding agreement.\n\nPlease let us know which day works best for you:\n\n${dayOptions}\n\nOnce you've decided, we'll pick a specific time!`;

    const adminReplyUrl = `https://wa.me/${data.phoneNumber}?text=${encodeURIComponent(responseGreeting)}`;

    const notificationText = encodeURIComponent(
        `*MERCHANT SIGN UP ALERT - NOVAHUB*\n\n` +
        `*Name:* ${data.fullName}\n` +
        `*Username:* ${data.username}\n` +
        `*Matric:* ${data.matricNumber}\n` +
        `*Submitted:* ${now.toLocaleTimeString()}\n\n` +
        `*REPLY TO MERCHANT:* \n${adminReplyUrl}`
    );

    const url = `https://api.callmebot.com/whatsapp.php?phone=${ADMIN_PHONE}&text=${notificationText}&apikey=${CALLMEBOT_API_KEY}`;

    try {
        await fetch(url, { mode: 'no-cors' });
    } catch (err) {
        console.error("CallMeBot Error:", err);
    }
}
