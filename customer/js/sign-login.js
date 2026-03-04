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

async function checkAvailability(field, value) {
    if (!value) return true;
    const q = query(collection(db, "users"), where(field, "==", value.toLowerCase()));
    const querySnapshot = await getDocs(q);
    return querySnapshot.empty; 
}

function debounce(func, timeout = 500) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

const signupForm = document.getElementById('customer-signup');
const usernameInput = signupForm.querySelectorAll('input')[1];
const matricInput = signupForm.querySelectorAll('input')[4];

usernameInput.addEventListener('input', debounce(async (e) => {
    const isAvailable = await checkAvailability("username", e.target.value.trim());
    e.target.style.borderColor = isAvailable ? "#34c759" : "#ff3b30";
}));

matricInput.addEventListener('input', debounce(async (e) => {
    const isAvailable = await checkAvailability("matricNo", e.target.value.trim());
    e.target.style.borderColor = isAvailable ? "#34c759" : "#ff3b30";
}));


// --- Feature: Customer Signup (WITH BLACKLIST CHECK) ---
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = signupForm.querySelector('button');
    
    const inputs = signupForm.querySelectorAll('input');
    const fullName = inputs[0].value;
    const username = inputs[1].value.trim().toLowerCase();
    const email = inputs[2].value.trim();
    const level = inputs[3].value;
    const matricNo = inputs[4].value.trim();
    const phone = inputs[5].value;
    const location = inputs[6].value;
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
        // 1. SECURITY CHECK: Check if email is blacklisted
        const blacklistRef = doc(db, "blacklist", email.toLowerCase());
        const blacklistSnap = await getDoc(blacklistRef);
        
        if (blacklistSnap.exists()) {
            throw new Error("This email has been blacklisted and cannot be used for registration.");
        }

        // 2. Final Uniqueness Check
        const [isUserFree, isMatricFree] = await Promise.all([
            checkAvailability("username", username),
            checkAvailability("matricNo", matricNo)
        ]);

        if (!isUserFree) throw new Error("Username is already taken.");
        if (!isMatricFree) throw new Error("Matric number is already registered.");

        // 3. Firebase Auth Creation
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 4. Save Profile
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            fullName,
            username,
            email,
            level,
            matricNo,
            phoneNumber: phone,
            location,
            bankDetails: { bankName, accName, accNo },
            role: "customer",
            status: "Active", // Default status
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



// --- Feature: Customer Login (WITH STATUS CHECK) ---
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

        // Support Username Login
        if (!identifier.includes('@')) {
            const q = query(collection(db, "users"), where("username", "==", identifier.toLowerCase()));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) throw new Error("Username not found.");
            email = querySnapshot.docs[0].data().email;
        }

        // 1. Attempt Firebase Login
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Fetch user data to verify Status and Role
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (userDoc.exists()) {
            const userData = userDoc.data();

            // CHECK: Is the account blocked?
            if (userData.status === "Locked") {
                await signOut(auth); // Force sign out
                throw new Error("Your account has been BLOCKED. Please contact support.");
            }

            // CHECK: Is the role correct?
            if (userData.role === "customer") {
                window.location.href = "./home.html";
            } else {
                await signOut(auth);
                throw new Error("This account is not registered as a Customer.");
            }
        } else {
            // Document missing (Likely deleted by admin)
            await signOut(auth);
            throw new Error("Account data not found. It may have been deleted.");
        }

    } catch (error) {
        alert("Login failed: " + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Sign In to Hub";
    }
});

document.getElementById('year').textContent = new Date().getFullYear();
