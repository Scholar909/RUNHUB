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
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- State Tracking ---
let isUsernameValid = false;
let isMatricValid = false;

// --- Generate Block and Room Dropdowns ---

const blockSelect = document.getElementById("block");
const roomSelect = document.getElementById("room");

// --- Referral Link Logic ---
const urlParams = new URLSearchParams(window.location.search);
const referrerFromURL = urlParams.get('ref'); // Looks for ?ref=name
const referrerInput = document.getElementById('referrerInput');

if (referrerFromURL) {
    referrerInput.value = referrerFromURL.toLowerCase();
}


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

// Add this immediately after debounce
// Keep your validation as-is
function isValidMatric(matric) {
    // Example pattern: RUN/CPE/23/14551
    const pattern = /^[A-Z]{2,5}\/[A-Z]{2,5}\/\d{2}\/\d{4,6}$/;
    return pattern.test(matric);
}

// Add this below isValidMatric
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
            : `${encodeMatric(value)}_customer`; // Appending role


        const collectionName =
            field === "username"
            ? "usernames"
            : "matricNumbers";

        const docSnap = await getDoc(doc(db, collectionName, id));

        if (!docSnap.exists()) {

            statusEl.innerText = "✓ Available";
            statusEl.style.color = "#34c759";

            if (field === "username") isUsernameValid = true;
            if (field === "matricNo") isMatricValid = true;
            
        } else {

            statusEl.innerText = "✕ Already Taken";
            statusEl.style.color = "#ff3b30";

            if (field === "username") isUsernameValid = false;
            if (field === "matricNo") isMatricValid = false;

        }

    } catch (err) {

        console.error(err);
        statusEl.innerText = "Network error";
        statusEl.style.color = "orange";

    }

};

const signupForm = document.getElementById('customer-signup');
const inputs = signupForm.querySelectorAll('input');
const usernameInput = inputs[1]; 
const matricInput = inputs[4]; 

// Attach listeners (Make sure IDs 'username-status' and 'matric-status' exist in HTML)
usernameInput.addEventListener('input', debounce((e) => {
    const val = e.target.value.trim();
    const statusEl = document.getElementById("username-status");

    if (!isValidUsername(val)) {
        statusEl.innerText = "✕ Only letters, numbers, and underscores allowed";
        statusEl.style.color = "#ff3b30";
        isUsernameValid = false;
        return;
    }

    checkUniqueness("username", val.toLowerCase(), "username-status");
}));


matricInput.addEventListener('input', debounce((e) => {
    const val = e.target.value.trim().toUpperCase();
    const statusEl = document.getElementById("matric-status");

    // Validate pattern first
    if (!isValidMatric(val)) {
        statusEl.innerText = "✕ Invalid format. Example: RUN/ABC/12/12345";
        statusEl.style.color = "#ff3b30";
        isMatricValid = false;  // mark invalid
        return;  // stop here
    }

    // If valid, proceed to uniqueness check
    checkUniqueness("matricNo", val, "matric-status");

}), 500);


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
    const rawUsername = inputs[1].value.trim();
    const username = rawUsername.toLowerCase();
    const email = inputs[2].value.trim().toLowerCase();
    const level = inputs[3].value;
    const matricNo = inputs[4].value.trim().toUpperCase();
    
    if (!isValidUsername(rawUsername)) {
        alert("Username can only contain letters, numbers, and underscores.");
        return;
    }
    
     // Check format
    if (!isValidMatric(matricNo)) {
        alert("Invalid Matric Number format. Example: RUN/ABC/12/12345");
        return;
    }
    
    const department = inputs[5].value;
    const phone = inputs[6].value;
    
    const referrerName = document.getElementById('referrerInput').value || "";
    const gender = document.getElementById("gender").value;
    const hostel = document.getElementById("hostel").value;
    const block = document.getElementById("block").value;
    const room = document.getElementById("room").value;
    
    const hostelLocation = `Block ${block}, Room ${room}, ${hostel}`;
    
    const bankName = inputs[7].value;
    const accName = inputs[8].value;
    const accNo = inputs[9].value;
    
    const password = inputs[10].value;
    const confirmPass = inputs[11].value;

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
        
        // Ensure the user is fully signed in
        await new Promise(resolve => setTimeout(resolve, 200)); // small delay
        
        const matricId = `${encodeMatric(matricNo)}_customer`;

        
        await Promise.all([
          setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            fullName,
            username,
            email,
            gender,
            level,
            matricNo,
            department,
            phoneNumber: phone,
            hostelLocation,
            bankDetails: { bankName, accName, accNo },
            role: "customer",
            status: "Active",
            referrerName: referrerName,
            createdAt: serverTimestamp()
          }),
          setDoc(doc(db, "usernames", username), { uid: user.uid }),
          setDoc(doc(db, "matricNumbers", matricId), { uid: user.uid })
        ]);

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
        let email = identifier.toLowerCase();

        if (!identifier.includes('@')) {
            const usernameDoc = await getDoc(doc(db, "usernames", identifier.toLowerCase()));
            
            if (!usernameDoc.exists()) throw new Error("Username not found.");
            
            const uid = usernameDoc.data().uid;
            const userDoc = await getDoc(doc(db, "users", uid));
            email = userDoc.data().email;
        }

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            
// --- ROLE CHECK: Only 'customer' allowed ---
            if (userData.role !== "customer") {
                await signOut(auth);
                throw new Error("ACCESS DENIED: Merchants and Admins must use their respective login pages.");
            }
            
            if (userData.status === "Locked") {
                await signOut(auth);
                throw new Error("Your account has been BLOCKED.");
            }
            if (userData.role === "customer") {
              const savedRedirect = sessionStorage.getItem("redirectAfterLogin");
              if (savedRedirect) {
                  sessionStorage.removeItem("redirectAfterLogin"); // Clear memory
                  window.location.href = savedRedirect; // Go back to the WhatsApp order link
              } else {
                  window.location.href = "./home.html"; // Standard site entry
              }
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
