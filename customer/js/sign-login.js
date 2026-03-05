import { auth, db } from "./firebase-config.js";
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    signOut 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    doc, 
    setDoc, 
    getDoc, 
    query, 
    collection, 
    where, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- State Tracking ---
let isUsernameValid = false;
let isMatricValid = false;

// --- Generate Block and Room Dropdowns ---

const blockSelect = document.getElementById("block");
const roomSelect = document.getElementById("room");

// Blocks 00 - 100
for (let i = 0; i <= 100; i++) {
    const option = document.createElement("option");
    option.value = i.toString().padStart(2, "0");
    option.textContent = "Block " + i.toString().padStart(2, "0");
    blockSelect.appendChild(option);
}

// Rooms 1 - 100
for (let i = 1; i <= 100; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = "Room " + i;
    roomSelect.appendChild(option);
}

// --- UI Logic: Tab Switching ---
window.switchTab = (tab) => {
    const loginView = document.getElementById('login-view');
    const signupView = document.getElementById('signup-view');
    const loginBtn = document.getElementById('l-btn');
    const signupBtn = document.getElementById('s-btn');

    if (tab === 'login') {
        loginView.classList.add('active');
        signupView.classList.remove('active');
        loginBtn.classList.add('active');
        signupBtn.classList.remove('active');
    } else {
        loginView.classList.remove('active');
        signupView.classList.add('active');
        loginBtn.classList.remove('active');
        signupBtn.classList.add('active');
    }
};

// --- REAL-TIME UNIQUENESS CHECKS ---

const debounce = (func, delay = 500) => {
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
        statusEl.className = "validation-msg";
        return;
    }

    statusEl.innerText = "Checking...";
    statusEl.style.color = "gray";

    try {
        const q = query(collection(db, "users"), where(field, "==", value.toLowerCase()));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            statusEl.innerText = "✓ Available";
            statusEl.className = "validation-msg status-available";
            statusEl.style.color = "#34c759";
            if (field === "username") isUsernameValid = true;
            if (field === "matricNo") isMatricValid = true;
        } else {
            statusEl.innerText = "✕ Already Taken";
            statusEl.className = "validation-msg status-taken";
            statusEl.style.color = "#ff3b30";
            if (field === "username") isUsernameValid = false;
            if (field === "matricNo") isMatricValid = false;
        }
    } catch (err) {
        console.error("Validation error:", err);
    }
};

const signupForm = document.getElementById('customer-signup');
const inputs = signupForm.querySelectorAll('input');
const usernameInput = inputs[1]; 
const matricInput = inputs[4]; 

// Attach listeners (Make sure IDs 'username-status' and 'matric-status' exist in HTML)
usernameInput.addEventListener('input', debounce((e) => {
    checkUniqueness("username", e.target.value.trim(), "username-status");
}));

matricInput.addEventListener('input', debounce((e) => {
    checkUniqueness("matricNo", e.target.value.trim(), "matric-status");
}));


// --- Feature: Customer Signup ---
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Prevent submission if validation failed
    if (!isUsernameValid || !isMatricValid) {
        alert("Please fix the errors (Username or Matric Number already in use).");
        return;
    }

    const submitBtn = signupForm.querySelector('button');
    const fullName = inputs[0].value;
    const username = inputs[1].value.trim().toLowerCase();
    const email = inputs[2].value.trim();
    const level = inputs[3].value;
    const matricNo = inputs[4].value.trim();
    const phone = inputs[5].value;
    
    const gender = document.getElementById("gender").value;
    const hostel = document.getElementById("hostel").value;
    const block = document.getElementById("block").value;
    const room = document.getElementById("room").value;
    
    const hostelLocation = `Block ${block}, Room ${room}, ${hostel}`;
    
    const bankName = inputs[6].value;
    const accName = inputs[7].value;
    const accNo = inputs[8].value;
    
    const password = inputs[9].value;
    const confirmPass = inputs[10].value;

    if (password !== confirmPass) return alert("Passwords do not match!");
    if (password.length < 6) return alert("Password must be at least 6 characters.");

    submitBtn.disabled = true;
    submitBtn.innerText = "Verifying Details...";

    try {
        // Blacklist Check
        const blacklistRef = doc(db, "blacklist", email.toLowerCase());
        const blacklistSnap = await getDoc(blacklistRef);
        if (blacklistSnap.exists()) throw new Error("This email is blacklisted.");

        // Auth Creation
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Save Profile
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            fullName,
            username,
            email,
            gender,
            level,
            matricNo,
            phoneNumber: phone,
            hostelLocation,
            bankDetails: { bankName, accName, accNo },
            role: "customer",
            status: "Active",
            createdAt: new Date().toISOString()
        });

        alert("Account created successfully!");
        window.location.href = "./home.html"; 

    } catch (error) {
        alert("Signup failed: " + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Create Account";
    }
});

// --- Feature: Customer Login ---
const loginForm = document.getElementById('customer-login');
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = loginForm.querySelectorAll('input')[0].value.trim(); 
    const password = loginForm.querySelectorAll('input')[1].value;
    const submitBtn = loginForm.querySelector('button');

    submitBtn.disabled = true;
    submitBtn.innerText = "Authenticating...";

    try {
        let email = identifier;

        if (!identifier.includes('@')) {
            const q = query(collection(db, "users"), where("username", "==", identifier.toLowerCase()));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) throw new Error("Username not found.");
            email = querySnapshot.docs[0].data().email;
        }

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.status === "Locked") {
                await signOut(auth);
                throw new Error("Your account has been BLOCKED.");
            }
            if (userData.role === "customer") {
                window.location.href = "./home.html";
            } else {
                await signOut(auth);
                throw new Error("Not a customer account.");
            }
        }
    } catch (error) {
        alert("Login failed: " + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Sign In to Hub";
    }
});

document.getElementById('year').textContent = new Date().getFullYear();
