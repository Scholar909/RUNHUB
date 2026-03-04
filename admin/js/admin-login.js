import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyC7onB0OptTyu-J6J1PwU6zX799tQIjh4k",
    authDomain: "affiliate-app-dab95.firebaseapp.com",
    databaseURL: "https://affiliate-app-dab95-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "affiliate-app-dab95",
    storageBucket: "affiliate-app-dab95.firebasestorage.app",
    messagingSenderId: "510180440268",
    appId: "1:510180440268:web:99be47162857f635d8ea69"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const loginForm = document.getElementById('admin-login-form');
const errorMsg = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // UI Feedback
    loginBtn.innerText = "Verifying...";
    loginBtn.disabled = true;
    errorMsg.style.display = 'none';

    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;

    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            // Success!
            console.log("Admin Logged In:", userCredential.user);
            window.location.href = "./dashboard.html"; // Redirect to admin dashboard
        })
        .catch((error) => {
            // Fail
            loginBtn.innerText = "Authorize Access";
            loginBtn.disabled = false;
            errorMsg.style.display = 'block';
            console.error("Login Error:", error.message);
        });
});
