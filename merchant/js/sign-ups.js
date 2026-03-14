import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

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


/* ---------------- CLOUDINARY ---------------- */

const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dltoup0cz/image/upload";
const CLOUDINARY_VIDEO = "https://api.cloudinary.com/v1_1/dltoup0cz/video/upload";
const UPLOAD_PRESET = "runhub_uploads";


/* ---------------- VALIDATION ---------------- */

let isUsernameValid = false;
let isMatricValid = false;

const debounce = (func, delay) => {
let timeout;
return (...args) => {
clearTimeout(timeout);
timeout = setTimeout(() => func.apply(this, args), delay);
};
};

const checkUniqueness = async (field,value,statusId)=>{

const statusEl = document.getElementById(statusId);

if(!value || value.length < 3){
statusEl.innerText="";
return;
}

statusEl.innerText="Checking...";

try{

const q=query(collection(db,"users"),where(field,"==",value));
const snap=await getDocs(q);

if(snap.empty){

statusEl.innerText="✓ Available";
statusEl.className="validation-msg status-available";

if(field==="username") isUsernameValid=true;
if(field==="matricNumber") isMatricValid=true;

}else{

statusEl.innerText="✕ Already Taken";
statusEl.className="validation-msg status-taken";

if(field==="username") isUsernameValid=false;
if(field==="matricNumber") isMatricValid=false;

}

}catch(err){

statusEl.innerText="✓ Available";
isUsernameValid=true;
isMatricValid=true;

}

};

document.getElementById("username").addEventListener("input",debounce(e=>{
checkUniqueness("username",e.target.value.trim().toLowerCase(),"username-status");
},500));

document.getElementById("matricNumber").addEventListener("input",debounce(e=>{
checkUniqueness("matricNumber",e.target.value.trim(),"matric-status");
},500));


/* ---------------- MULTI STEP FORM ---------------- */

const sections=document.querySelectorAll(".form-section");
let currentSection=0;

function showSection(index){

sections.forEach((section,i)=>{

section.classList.remove("active");

if(i===index){

section.classList.add("active");

if(section.dataset.requiresFiles==="face" && !blobs.face){
startFacialScan();
}

if(section.dataset.requiresFiles==="video"){
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

if(currentSection < sections.length-1){
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
await new Promise(res=>setTimeout(res,400));
}

let stream;

try{

stream=await navigator.mediaDevices.getUserMedia({
video:{facingMode},
audio:false
});

}catch{

const devices=await navigator.mediaDevices.enumerateDevices();

const cam=devices.find(d=>d.kind==="videoinput");

stream=await navigator.mediaDevices.getUserMedia({
video:{deviceId:cam.deviceId},
audio:false
});

}

video.srcObject=stream;
await video.play();

return stream;

}catch(err){

console.error(err);
alert("Camera not available or permission denied.");

}

}

function setupFlip(btnId,videoId){

const btn=document.getElementById(btnId);
const video=document.getElementById(videoId);

if(!btn || !video) return;

facingModes[videoId]="user";

btn.onclick=async()=>{

facingModes[videoId]=facingModes[videoId]==="user" ? "environment":"user";

await startCamera(video,facingModes[videoId]);

};

}


/* ---------------- CAPTURE ---------------- */

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


const setupCapture=(videoId,captureBtn,removeBtn,previewId,key)=>{

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

};


/* ---------------- SETUP CAPTURE ---------------- */

setupCapture("idFrontPreview","captureIdFront","removeIdFront","idFrontImg","idFront");
setupCapture("idBackPreview","captureIdBack","removeIdBack","idBackImg","idBack");
setupCapture("selfiePreview","captureSelfie","removeSelfie","selfieImg","selfie");


/* ---------------- FLIPS ---------------- */

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

async function startVideoCamera(){

if(videoStream) return;

videoStream=await startCamera(videoPreview);

startVideoBtn.disabled=false;

}

startVideoBtn.onclick=()=>{

if(!recording){

recordedChunks=[];

mediaRecorder=new MediaRecorder(videoStream,{mimeType:"video/webm"});

mediaRecorder.ondataavailable=e=>{
if(e.data.size>0) recordedChunks.push(e.data);
};

mediaRecorder.onstop=async()=>{

blobs.video=new Blob(recordedChunks,{type:"video/webm"});

videoPlayback.src=URL.createObjectURL(blobs.video);

urls.video=await uploadVideo(blobs.video);

alert("Video recorded");

};

mediaRecorder.start();

recording=true;

startVideoBtn.style.color="red";

let sec=0;

const interval=setInterval(()=>{

sec++;

timerEl.innerText=`${sec}/30s`;

if(sec>=30){

clearInterval(interval);
mediaRecorder.stop();
recording=false;

}

},1000);

}else{

mediaRecorder.stop();
recording=false;

}

};

document.getElementById("removeVideo").onclick=()=>{

blobs.video=null;
urls.video=null;
videoPlayback.src="";
timerEl.innerText="";

};


/* ---------------- CLOUDINARY ---------------- */

async function uploadImage(blob){

const fd=new FormData();

fd.append("file",blob);
fd.append("upload_preset",UPLOAD_PRESET);

const res=await fetch(CLOUDINARY_URL,{method:"POST",body:fd});

const data=await res.json();

return data.secure_url;

}

async function uploadVideo(blob){

const fd=new FormData();

fd.append("file",blob);
fd.append("upload_preset",UPLOAD_PRESET);

const res=await fetch(CLOUDINARY_VIDEO,{method:"POST",body:fd});

const data=await res.json();

return data.secure_url;

}


/* ---------------- CATCH PHRASE ---------------- */

function generateCatchPhrase(){

const words=["Silver","Mango","Falcon","Library","River","Market","Golden","Forest","Tiger","Window","Ocean","Campus","Storm","Bridge","Rocket"];

return `${words[Math.floor(Math.random()*words.length)]} ${words[Math.floor(Math.random()*words.length)]} ${Math.floor(Math.random()*100)}`;

}


/* ---------------- FORM SUBMIT ---------------- */

document.getElementById("merchantVerificationForm").addEventListener("submit",async e=>{

e.preventDefault();

if(!urls.idFront||!urls.idBack||!urls.selfie||!urls.face||!urls.video){

alert("Please capture all required files.");
return;

}

if(!isUsernameValid || !isMatricValid){

alert("Username or Matric already exists.");
return;

}

const data={

fullName:fullName.value,
email:email.value.trim().toLowerCase(),
username:username.value.trim().toLowerCase(),
phoneNumber:phoneNumber.value,
matricNumber:matricNumber.value,
department:department.value,
level:level.value,
gender:gender.value,
hostel:hostel.value,
block:block.value,
room:room.value,
bankName:bankName.value,
accountName:accountName.value,
accountNumber:accountNumber.value

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

alert("Submitted for admin review");

location.reload();

});


/* ---------------- FACIAL SCAN ---------------- */

async function startFacialScan(){

const faceVideo=document.getElementById("faceScanPreview");
const faceImg=document.getElementById("faceScanImg");

let oldBtn=faceVideo.parentElement.querySelector(".remove-face-btn");
if(oldBtn) oldBtn.remove();

const removeBtn=document.createElement("button");

removeBtn.innerHTML='<i class="fas fa-trash"></i> Delete';
removeBtn.className="icon-btn remove-btn remove-face-btn";

faceVideo.parentElement.appendChild(removeBtn);

await startCamera(faceVideo,"user");

const timeout=setTimeout(async()=>{

const blob=await captureImage(faceVideo);

blobs.face=blob;

faceImg.src=URL.createObjectURL(blob);

urls.face=await uploadImage(blob);

alert("Face captured");

},10000);

removeBtn.onclick=()=>{

clearTimeout(timeout);

blobs.face=null;
urls.face=null;

faceImg.src="";

startFacialScan();

};

}