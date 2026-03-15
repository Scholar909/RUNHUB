import { auth, db, firebaseConfig } from './firebase-config.js';

import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

// Secondary app to create merchant without logging out admin
const secondaryApp = !getApps().some(a => a.name === "Secondary")
  ? initializeApp(firebaseConfig, "Secondary")
  : getApp("Secondary");

const secondaryAuth = getAuth(secondaryApp);

/* -----------------------------
AUTH GUARD (ADMIN ONLY)
----------------------------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "./admin-login.html";
    return;
  }
  try {
    const userRef = doc(db,"users",user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      window.location.href="admin-login.html";
      return;
    }
    const role = snap.data().role;
    if(role !== "admin"){
      alert("Access denied: Admins only.");
      await signOut(auth);
      return;
    }
    initMerchantQueue();
  } catch(err){
    console.error("Auth error:",err);
  }
});

/* -----------------------------
UI UTILITIES
----------------------------- */
window.toggleDrawer = () => {
  document.getElementById("navDrawer").classList.toggle("active");
};

window.handleLogout = async () => {
    if(confirm("Are you sure you want to logout?")) {
        try {
            await signOut(auth);
            window.location.href = "./admin-login.html";
        } catch (error) {
            console.error("Logout Error:", error);
        }
    }
};

/* -----------------------------
ELEMENTS
----------------------------- */
const tableBody = document.getElementById("merchantTable");
const searchInput = document.getElementById("searchInput");
let applications = [];

/* -----------------------------
FORMAT NIGERIAN PHONE NUMBER
----------------------------- */
function formatNGNumber(phone){

  let digits = phone.replace(/\D/g,"");

  if(digits.startsWith("234")){
    return digits;
  }

  if(digits.startsWith("0")){
    return "234" + digits.slice(1);
  }

  if(digits.length === 10){
    return "234" + digits;
  }

  return digits;
}

/* -----------------------------
LOAD APPLICATIONS
----------------------------- */
function initMerchantQueue(){
  const ref = collection(db,"merchant_applications");
  const q = query(ref, orderBy("submittedAt","desc"));
  onSnapshot(q,(snapshot)=>{
    applications=[];
    snapshot.forEach(docSnap=>{
      applications.push({
        id:docSnap.id,
        ...docSnap.data()
      });
    });
    renderTable(applications);
  });
}

/* -----------------------------
RENDER TABLE
----------------------------- */
function renderTable(data){
  tableBody.innerHTML="";
  if(data.length===0){
    tableBody.innerHTML=`
      <tr>
        <td colspan="5" style="text-align:center;padding:20px;color:#86868b">
          No merchant applications
        </td>
      </tr>`;
    return;
  }
  data.forEach(app=>{
    const status = (app.status || "pending").toLowerCase();
    let statusClass="pending";
    if(status==="approved") statusClass="approved";
    if(status==="blocked") statusClass="blocked";

    let actionButtons = "";
    if(status === "pending"){
      actionButtons = `
        <a href="view-verify.html?id=${app.id}" class="action-btn view-btn" title="View Application">
          <i class="fi-eye"></i>
        </a>
        <button class="action-btn approve-btn" id="approve-${app.id}" title="Approve Merchant" onclick="approveMerchant('${app.id}')">
          <i class="fi-check"></i>
        </button>
        <button class="action-btn block-btn" title="Block Application" onclick="blockMerchant('${app.id}')">
          <i class="fi-x-circle"></i>
        </button>
        <button class="action-btn delete-btn" title="Delete Application" onclick="deleteApplication('${app.id}')">
          <i class="fi-trash"></i>
        </button>
      `;
    } else {
      actionButtons = `
        <a href="view-verify.html?id=${app.id}" class="action-btn view-btn" title="View Application">
          <i class="fi-eye"></i>
        </a>
        <button class="action-btn delete-btn" title="Delete Application" onclick="deleteApplication('${app.id}')">
          <i class="fi-trash"></i>
        </button>
      `;
    }

    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td>${app.fullName || "Unknown"}</td>
      <td>${app.email || "N/A"}</td>
      <td>${app.phoneNumber || "N/A"}</td>
      <td><span class="status-pill ${statusClass}">${status}</span></td>
      <td class="action-cell">${actionButtons}</td>`;
    tableBody.appendChild(tr);
  });
}

/* -----------------------------
SEARCH
----------------------------- */
searchInput.addEventListener("input",()=>{
  const term=searchInput.value.toLowerCase().trim();
  const filtered=applications.filter(app=>{
    const name=(app.fullName||"").toLowerCase();
    const email=(app.email||"").toLowerCase();
    const phone=(app.phoneNumber||"").toLowerCase();
    return(
      name.includes(term) ||
      email.includes(term) ||
      phone.includes(term)
    );
  });
  renderTable(filtered);
});

/* -----------------------------
ADMIN ACTIONS
----------------------------- */
window.approveMerchant = async(id)=>{
  if(!confirm("Approve this merchant?")) return;
  try{
    /* get application data */
    const appRef = doc(db,"merchant_applications",id);
    const snap = await getDoc(appRef);
    if(!snap.exists()){
      alert("Application not found");
      return;
    }
    const data = snap.data();

    /* create firebase auth account with temp password (user resets it) */
    const tempPassword = Math.random().toString(36).slice(-8) + "A1";
    // Create merchant using secondary auth instance
    const cred = await createUserWithEmailAndPassword(secondaryAuth, data.email, tempPassword);
    const user = cred.user;
    await Promise.all([
      setDoc(doc(db,"usernames",(data.username || "").toLowerCase()),{
        uid:user.uid
      }),
      setDoc(doc(db,"matricNumbers",(data.matricNumber || "").toUpperCase()),{
        uid:user.uid
      })
    ]);

    /* save merchant profile */
    await setDoc(doc(db,"users",user.uid),{
      uid:user.uid,
      role:"merchant",
      fullName:data.fullName || "",
      username:(data.username || "").toLowerCase().trim(),
      email:data.email,
      level:data.level || "",
      matricNumber:data.matricNumber || "",
      phoneNumber:data.phoneNumber || "",
      gender:data.gender || "",
      hostelLocation:`Block ${data.block}, Room ${data.room}, ${data.hostel}`,
      bankDetails:{
        bankName:data.bankName || "",
        accountName:data.accountName || "",
        accountNumber:data.accountNumber || ""
      },
      profilePhoto:data.files?.selfie || "",
      totalPaid:0,
      feeAccrued:0,
      walletDueSince:null,
      rating:5.0,
      status:"active",
      isSessionOn:false,
      subscription:{
        type:"trial",
        startDate:serverTimestamp(),
        expiryDate:new Date(Date.now() + 14*24*60*60*1000)
      },
      createdAt:serverTimestamp(),
      walletLastUpdated:serverTimestamp()
    });

    /* update application status */
    await updateDoc(appRef,{
      status:"approved",
      approvedAt:new Date().toISOString(),
      merchantUid:user.uid
    });
    
    // after updateDoc(appRef, {...})
    const index = applications.findIndex(a => a.id === id);
    if(index !== -1) {
        applications[index].status = "approved";
        applications[index].merchantUid = user.uid;
        renderTable(applications);
    }

    /* send password reset email so merchant sets their own password */
    await sendPasswordResetEmail(secondaryAuth, data.email)
      .then(() => {
        alert(`Merchant approved successfully.\nA password reset email has been sent to ${data.email}.\nMerchant can now set their own password.`);
      })
      .catch((err) => {
        console.error(err);
        alert("Failed to send password reset email: " + err.message);
      });

  } catch(err){
    console.error(err);
    alert("Approval failed: " + err.message);
  }
};

window.blockMerchant = (id) => {
  const app = applications.find(a => a.id === id);
  if (!app) return;

  const modal = document.getElementById("rejectModal");
  const reasonInput = document.getElementById("rejectReason");
  const sendBtn = document.getElementById("sendReject");

  reasonInput.value = "";
  modal.style.display = "flex";

  // Remove any previously attached click handlers
  sendBtn.replaceWith(sendBtn.cloneNode(true));
  const newSendBtn = document.getElementById("sendReject");

  newSendBtn.addEventListener("click", async () => {
    const reason = reasonInput.value.trim();
    if (!reason) {
      alert("Please type a rejection reason");
      return;
    }

    try {
      // 1️⃣ Update status first
      await updateDoc(doc(db, "merchant_applications", id), {
        status: "rejected",
        rejectedAt: new Date().toISOString(),
        rejectionReason: reason
      });

      // 2️⃣ Delete username and matric, only if they exist
      const deletes = [];
      if (app.username) deletes.push(deleteDoc(doc(db, "usernames", app.username.toLowerCase())));
      if (app.matricNumber) deletes.push(deleteDoc(doc(db, "matricNumbers", app.matricNumber.toUpperCase())));
      if (deletes.length) await Promise.all(deletes);

      // 3️⃣ Update UI
      const index = applications.findIndex(a => a.id === id);
      if (index !== -1) {
        applications[index].status = "rejected";
        renderTable(applications);
      }

      // 4️⃣ Open WhatsApp
      const message = `RUNHUB MERCHANT REQUEST REJECTION NOTICE

Hello ${app.fullName},

This is to inform you that your request to join RUNHUB as a merchant was rejected due to the reason below:

${reason}

You may resubmit your merchant application again with the correct details.

If you believe this message was sent in error, you may ignore it.

We hope to see you join the RUNHUB merchant community soon.

— RUNHUB Team`;

      const encoded = encodeURIComponent(message);
      const phone = formatNGNumber(app.phoneNumber);
      const whatsappURL = `https://wa.me/${phone}?text=${encoded}`;
      window.open(whatsappURL, "_blank");

      modal.style.display = "none";
    } catch (err) {
      console.error(err);
      alert("Failed to reject application: " + err.message);
    }
  });
};

window.deleteApplication = async(id)=>{
  if(!confirm("Delete this application permanently?")) return;
  try{
    await deleteDoc(doc(db,"merchant_applications",id));
    alert("Application deleted");
  } catch(err){
    console.error(err);
    alert("Deletion failed");
  }
};

document.getElementById("cancelReject").onclick = () => {
  document.getElementById("rejectModal").style.display = "none";
};