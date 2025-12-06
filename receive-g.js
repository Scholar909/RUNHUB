import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDkDF1_MSfBDf5LkqtYL3wo2Ic72rSBaps",
  authDomain: "callmebot-form.firebaseapp.com",
  projectId: "callmebot-form",
  storageBucket: "callmebot-form.appspot.com",
  messagingSenderId: "134486558762",
  appId: "1:134486558762:web:3b64f2ba9d245eacb19b53",
  measurementId: "G-4E3274FQBJ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* DEVICE ID */
let deviceId = localStorage.getItem("deviceId");
if (!deviceId) {
  deviceId = crypto.randomUUID();
  localStorage.setItem("deviceId", deviceId);
}

/* DOM Elements */
const receiveBtn = document.getElementById("receiveBtn");
const taskDetails = document.getElementById("taskDetails");

/* SHOW TASK DATA */
function show(d) {
  fn.innerText = d.firstName;
  ln.innerText = d.lastName;
  em.innerText = d.email;
  pw.innerText = d.password;
  rc.innerText = d.recovery;
  taskDetails.style.display = "block";
  receiveBtn.style.display = "none";
}

/* ASSIGN TASK WITH TRANSACTION */
async function assignTask() {
  try {
    // Check if this device already has a task
    const q1 = query(collection(db, "accounts"), where("assignedTo", "==", deviceId));
    const snap1 = await getDocs(q1);

    if (!snap1.empty) {
      const data = snap1.docs[0].data();
      const assignedAt = snap1.docs[0].data().assignedAt?.toDate();
      const now = new Date();

      // Check if 24h has passed
      if (assignedAt && (now - assignedAt) < 24*60*60*1000) {
        show(data);
        return;
      }
      // Else, allow reassigning after 24h
    }

    // Get unassigned tasks
    const q2 = query(collection(db, "accounts"), where("assignedTo", "==", null));
    const snap2 = await getDocs(q2);

    if (snap2.empty) {
      alert("No available tasks.");
      return;
    }

    const randomDoc = snap2.docs[Math.floor(Math.random() * snap2.docs.length)];
    const randomDocRef = doc(db, "accounts", randomDoc.id);

    // Transaction to safely claim the task
    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(randomDocRef);
      const data = docSnap.data();

      if (data.assignedTo !== null) {
        // Someone else grabbed it at the same time
        throw "Task already claimed. Please try again.";
      }

      transaction.update(randomDocRef, {
        assignedTo: deviceId,
        assignedAt: serverTimestamp()
      });
    });

    // Show the assigned task
    show(randomDoc.data());

  } catch (err) {
    console.error("Transaction failed:", err);
    alert(err);
  }
}

/* EVENT LISTENER */
receiveBtn.addEventListener("click", assignTask);
