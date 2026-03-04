import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// Cloudinary Constants
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dltoup0cz/image/upload";
const UPLOAD_PRESET = "runhub_uploads"; 

const firebaseConfig = {
    apiKey: "AIzaSyC7onB0OptTyu-J6J1PwU6zX799tQIjh4k",
    authDomain: "affiliate-app-dab95.firebaseapp.com",
    databaseURL: "https://affiliate-app-dab95-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "affiliate-app-dab95",
    storageBucket: "affiliate-app-dab95.firebasestorage.app",
    messagingSenderId: "510180440268",
    appId: "1:510180440268:web:99be47162857f635d8ea69"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let isUsernameValid = false;
let isMatricValid = false;

// --- AUTH GUARD ---
onAuthStateChanged(auth, (user) => {
    // Ensuring the logged-in user is actually an admin could be added here
    if (!user) window.location.href = "admin-login.html"; 
});

window.toggleDrawer = () => document.getElementById('navDrawer').classList.toggle('active');

window.handleLogout = async () => {
    if(confirm("Logout from Admin Panel?")) {
        try {
            await signOut(auth);
            window.location.href = "admin-login.html";
        } catch (error) {
            alert("Error: " + error.message);
        }
    }
};

// --- VALIDATION ---
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
        statusEl.innerText = "✓ Available";
        isUsernameValid = true; isMatricValid = true;
    }
};

document.getElementById('username').addEventListener('input', debounce((e) => {
    checkUniqueness("username", e.target.value.trim().toLowerCase(), "username-status");
}, 500));

document.getElementById('matricNumber').addEventListener('input', debounce((e) => {
    checkUniqueness("matricNumber", e.target.value.trim(), "matric-status");
}, 500));

// --- FORM SUBMISSION ---
const signupForm = document.getElementById('merchantSignupForm');

signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');

    if (!isUsernameValid || !isMatricValid) {
        alert("Username or Matric Number is already in use.");
        return;
    }

    const email = document.getElementById('email').value.trim();
    const pass = document.getElementById('password').value;
    const confirmPass = document.getElementById('confirm-password').value;
    const photoFile = document.getElementById('profilePhoto').files[0];

    if (pass !== confirmPass) { alert("Passwords do not match!"); return; }
    if (!photoFile) { alert("Please upload an ID photo."); return; }

    btn.disabled = true;
    btn.innerText = "Uploading & Registering...";

    try {
        // 1. Upload ID to Cloudinary
        const formData = new FormData();
        formData.append('file', photoFile);
        formData.append('upload_preset', UPLOAD_PRESET);

        const cloudRes = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
        const cloudData = await cloudRes.json();
        const photoURL = cloudData.secure_url;

        // 2. Create Firebase Auth Account using the MERCHANT'S OWN EMAIL
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        // 3. Save Merchant Data to Firestore
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            role: "merchant",
            fullName: document.getElementById('fullName').value,
            username: document.getElementById('username').value.trim().toLowerCase(),
            email: email, // Merchant's actual email for login
            level: document.getElementById('level').value,
            matricNumber: document.getElementById('matricNumber').value.trim(),
            phoneNumber: document.getElementById('phoneNumber').value,
            location: document.getElementById('location').value,
            bankDetails: {
                bankName: document.getElementById('bankName').value,
                accountName: document.getElementById('accountName').value,
                accountNumber: document.getElementById('accountNumber').value
            },
            profilePhoto: photoURL,
            walletBalance: 0,
            platformFeesOwing: 0,
            rating: 5.0,
            status: "active",
            isSessionOn: false,
            subscription: {
                type: "trial",
                startDate: serverTimestamp(),
                expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
            },
            createdAt: serverTimestamp()
        });

        alert(`Registration successful! ${email} can now log in to the Merchant Dashboard.`);
        signupForm.reset();
        
        // Clear validation labels
        document.getElementById('username-status').innerText = "";
        document.getElementById('matric-status').innerText = "";

    } catch (error) {
        console.error(error);
        alert("Error: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "Register & Verify Merchant";
    }
});
