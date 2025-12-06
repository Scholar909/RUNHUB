import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDkDF1_MSfBDf5LkqtYL3wo2Ic72rSBaps",
  authDomain: "callmebot-form.firebaseapp.com",
  projectId: "callmebot-form",
  storageBucket: "callmebot-form.appspot.com", // ✅ fixed
  messagingSenderId: "134486558762",
  appId: "1:134486558762:web:3b64f2ba9d245eacb19b53",
  measurementId: "G-4E3274FQBJ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM Elements
const fn = document.getElementById("fn");
const ln = document.getElementById("ln");
const em = document.getElementById("em");
const pw = document.getElementById("pw");
const rc = document.getElementById("rc");
const status = document.getElementById("status");
const accountsGrid = document.getElementById("accountsGrid");

// Add account
window.addData = async function () {
  const data = {
    firstName: fn.value.trim(),
    lastName: ln.value.trim(),
    email: em.value.trim(),
    password: pw.value.trim(),
    recovery: rc.value.trim(),
    assignedTo: null,
    assignedAt: null
  };

  if (!data.firstName || !data.lastName || !data.email || !data.password || !data.recovery) {
    status.innerText = "Fill all fields!";
    return;
  }

  try {
    status.innerText = "Saving to Firebase...";
    // Only clear inputs after successful save
    const docRef = await addDoc(collection(db, "accounts"), data);
    status.innerText = "Saved successfully!";
    fn.value = ln.value = em.value = pw.value = rc.value = "";
  } catch (err) {
    console.error("Firestore Add Error:", err);
    status.innerText = "Error saving data. Check your internet or Firebase config.";
  }
};

// Real-time update
onSnapshot(collection(db, "accounts"), (snapshot) => {
  accountsGrid.innerHTML = "";
  snapshot.docs.forEach(docSnap => {
    const d = docSnap.data();
    const card = document.createElement("div");
    card.classList.add("card");
    if(d.assignedTo) card.classList.add("claimed");

    card.innerHTML = `
      <button class="deleteBtn" onclick="deleteData('${docSnap.id}')">x</button>
      <p><b>First Name:</b> ${d.firstName}</p>
      <p><b>Last Name:</b> ${d.lastName}</p>
      <p><b>Email:</b> ${d.email}</p>
      <p><b>Password:</b> ${d.password}</p>
      <p><b>Recovery:</b> ${d.recovery}</p>
      <div class="statusTag">${d.assignedTo ? 'Claimed' : 'Unclaimed'}</div>
    `;

    accountsGrid.appendChild(card);
  });
});

// Delete account
window.deleteData = async function(id){
  if(confirm("Delete this account?")){
    try {
      await deleteDoc(doc(db, "accounts", id));
    } catch(err){
      console.error("Delete Error:", err);
      alert("Failed to delete. Check your internet.");
    }
  }
}