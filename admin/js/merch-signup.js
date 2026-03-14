import { auth, db } from './firebase-config.js';

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
  if(confirm("Logout?")){
    await signOut(auth);
    window.location.href="admin-login.html";
  }
};

/* -----------------------------
ELEMENTS
----------------------------- */
const tableBody = document.getElementById("merchantTable");
const searchInput = document.getElementById("searchInput");
let applications = [];

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
        <button class="action-btn approve-btn" title="Approve Merchant" onclick="approveMerchant('${app.id}')">
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
    const cred = await createUserWithEmailAndPassword(auth, data.email, tempPassword);
    const user = cred.user;

    /* save merchant profile */
    await setDoc(doc(db,"users",user.uid),{
      uid:user.uid,
      role:"merchant",
      fullName:data.fullName || "",
      username:(data.fullName || "").toLowerCase().replace(/\s+/g,""),
      email:data.email,
      level:data.level || "",
      matricNumber:data.matricNumber || "",
      phoneNumber:data.phone || "",
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

    /* send password reset email so merchant sets their own password */
    await sendPasswordResetEmail(auth, data.email)
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

window.blockMerchant = async(id)=>{
  if(!confirm("Block this application?")) return;
  try{
    await updateDoc(doc(db,"merchant_applications",id),{
      status:"blocked",
      blockedAt:new Date().toISOString()
    });
    alert("Application blocked");
  } catch(err){
    console.error(err);
    alert("Block failed");
  }
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