import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

/* ------------------ FIREBASE CONFIG ------------------ */

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


/* ------------------ CLOUDINARY ------------------ */

const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dltoup0cz/image/upload";
const CLOUDINARY_VIDEO = "https://api.cloudinary.com/v1_1/dltoup0cz/video/upload";
const UPLOAD_PRESET = "runhub_uploads";


/* ------------------ FORM SECTIONS ------------------ */

const sections = document.querySelectorAll(".form-section");
let currentSection = 0;

function showSection(index){

sections.forEach((section,i)=>{
section.classList.remove("active");

if(i===index){
section.classList.add("active");
}
});

currentSection=index;
}

/* next buttons */

document.querySelectorAll(".next").forEach(btn=>{
btn.addEventListener("click",()=>{

if(currentSection < sections.length-1){
showSection(currentSection+1);
}

});
});

/* previous buttons */

document.querySelectorAll(".prev").forEach(btn=>{
btn.addEventListener("click",()=>{

if(currentSection > 0){
showSection(currentSection-1);
}

});
});


/* ------------------ CAMERA ACCESS ------------------ */

let stream;

async function startCamera(videoElement){

try{

stream = await navigator.mediaDevices.getUserMedia({
video:true,
audio:false
});

videoElement.srcObject = stream;

}catch(e){

alert("Camera permission required for verification.");

}

}

/* start cameras for all previews */

startCamera(document.getElementById("idFrontPreview"));
startCamera(document.getElementById("idBackPreview"));
startCamera(document.getElementById("selfiePreview"));
startCamera(document.getElementById("faceScanPreview"));
startCamera(document.getElementById("videoPreview"));


/* ------------------ IMAGE CAPTURE ------------------ */

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

/* captured images */

let idFrontBlob = null;
let idBackBlob = null;
let selfieBlob = null;
let faceBlob = null;


/* capture buttons */

const captureBtns = document.querySelectorAll(".capture-btn");

captureBtns[0].onclick = async ()=>{
idFrontBlob = await captureImage(document.getElementById("idFrontPreview"));
alert("ID Front Captured");
};

captureBtns[1].onclick = async ()=>{
idBackBlob = await captureImage(document.getElementById("idBackPreview"));
alert("ID Back Captured");
};

captureBtns[2].onclick = async ()=>{
selfieBlob = await captureImage(document.getElementById("selfiePreview"));
alert("Selfie Captured");
};


/* facial scan auto capture after 3s */

setTimeout(async()=>{
faceBlob = await captureImage(document.getElementById("faceScanPreview"));
},3000);



/* ------------------ VIDEO RECORDING ------------------ */

let mediaRecorder;
let recordedChunks=[];
let verificationVideoBlob=null;

captureBtns[3].onclick = ()=>{

recordedChunks=[];

mediaRecorder = new MediaRecorder(stream);

mediaRecorder.ondataavailable = e=>{
if(e.data.size>0){
recordedChunks.push(e.data);
}
};

mediaRecorder.onstop = ()=>{

verificationVideoBlob = new Blob(recordedChunks,{type:"video/webm"});

alert("Verification Video Recorded");

};

mediaRecorder.start();

setTimeout(()=>{
mediaRecorder.stop();
},8000);

};



/* ------------------ CLOUDINARY UPLOAD ------------------ */

async function uploadImage(blob){

const formData = new FormData();

formData.append("file",blob);
formData.append("upload_preset",UPLOAD_PRESET);

const res = await fetch(CLOUDINARY_URL,{
method:"POST",
body:formData
});

const data = await res.json();

return data.secure_url;

}

async function uploadVideo(blob){

const formData = new FormData();

formData.append("file",blob);
formData.append("upload_preset",UPLOAD_PRESET);

const res = await fetch(CLOUDINARY_VIDEO,{
method:"POST",
body:formData
});

const data = await res.json();

return data.secure_url;

}



/* ------------------ RANDOM CATCH PHRASE ------------------ */

function generateCatchPhrase(){

const words = [
"Silver","Mango","Falcon","Library","River",
"Market","Golden","Forest","Tiger","Window",
"Ocean","Campus","Storm","Bridge","Rocket"
];

const a = words[Math.floor(Math.random()*words.length)];
const b = words[Math.floor(Math.random()*words.length)];
const c = Math.floor(Math.random()*100);

return `${a} ${b} ${c}`;

}



/* ------------------ FORM SUBMIT ------------------ */

const form = document.getElementById("merchantVerificationForm");

form.addEventListener("submit", async (e)=>{

e.preventDefault();

alert("Uploading verification files...");

/* upload files */

const idFrontURL = await uploadImage(idFrontBlob);
const idBackURL = await uploadImage(idBackBlob);
const selfieURL = await uploadImage(selfieBlob);
const faceURL = await uploadImage(faceBlob);
const videoURL = await uploadVideo(verificationVideoBlob);


/* collect form values */

const inputs = document.querySelectorAll("input,select");

const data = {
fullName: inputs[0].value,
email: inputs[1].value,
phone: inputs[2].value,
matricNumber: inputs[3].value,
department: inputs[4].value,
level: inputs[5].value,
gender: inputs[6].value,
hostel: inputs[7].value,
block: inputs[8].value,
room: inputs[9].value,
bankName: inputs[10].value,
accountName: inputs[11].value,
accountNumber: inputs[12].value
};


/* generate catch phrase */

const catchPhrase = generateCatchPhrase();


/* save to firestore */

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


alert(
"Verification submitted.\n\nSave this catch phrase:\n\n" + catchPhrase
);


form.reset();

location.reload();

});