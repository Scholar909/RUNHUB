import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    collection, query, where, getDocs, doc, getDoc, 
    addDoc, updateDoc, serverTimestamp, orderBy 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

let selectedMerchantUid = null;
let currentCustomerData = null;

const reviewsFeed = document.getElementById('reviewsFeed');
const ratingPortal = document.getElementById('ratingPortal');
const searchInput = document.getElementById('merchantSearch');
const suggestionBox = document.getElementById('suggestions');

// --- Helper: Format Date ---
function formatDate(timestamp) {
    if (!timestamp) return "Recently";
    const date = timestamp.toDate();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// --- 1. Load Initial Feed on Page Load ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Fetch current user details for review submission
        const docSnap = await getDoc(doc(db, "users", user.uid));
        if (docSnap.exists()) currentCustomerData = docSnap.data();
        
        // LOAD FEED IMMEDIATELY
        loadReviews(); 
    } else {
        window.location.href = "./sign-login.html";
    }
});

// --- 2. Fetch and Render Reviews (Global, Filtered, or Specific) ---
async function loadReviews(merchantUid = null, searchTerm = "") {
    reviewsFeed.innerHTML = '<p style="text-align:center; font-size:0.8rem; color:var(--text-dim);">Updating feed...</p>';
    
    try {
        let q;
        const reviewsRef = collection(db, "ratings");

        if (merchantUid) {
            // Case A: Specific merchant selected from suggestions
            q = query(reviewsRef, 
                where("merchantUid", "==", merchantUid), 
                orderBy("timestamp", "desc")
            );
        } else if (searchTerm) {
            // Case B: Live filtering feed based on search input
            q = query(reviewsRef, 
                where("merchantUsername", ">=", searchTerm), 
                where("merchantUsername", "<=", searchTerm + '\uf8ff'),
                orderBy("merchantUsername"),
                orderBy("timestamp", "desc")
            );
        } else {
            // Case C: Global Feed (Default Load)
            q = query(reviewsRef, orderBy("timestamp", "desc"));
        }

        const querySnapshot = await getDocs(q);
        reviewsFeed.innerHTML = '';

        if (querySnapshot.empty) {
            reviewsFeed.innerHTML = `<p style="text-align:center; padding:20px; color:var(--text-dim);">No reviews found ${searchTerm ? 'for "@' + searchTerm + '"' : 'yet'}.</p>`;
            return;
        }

        querySnapshot.forEach((res) => {
            const data = res.data();
            const stars = '★'.repeat(data.stars) + '☆'.repeat(5 - data.stars);
            const formattedDate = formatDate(data.timestamp);
            
            const card = document.createElement('div');
            card.className = 'public-review-card';
            card.innerHTML = `
                <div class="review-header">
                    <span class="reviewer-name">${data.customerName || 'Anonymous'}</span>
                    <span class="merchant-tag">@${data.merchantUsername || 'Merchant'}</span>
                </div>
                <div class="review-stars">${stars}</div>
                <div class="review-comment">${data.review || 'No comment provided.'}</div>
                <span class="review-date">${formattedDate}</span>
            `;
            reviewsFeed.appendChild(card);
        });
    } catch (e) {
        console.error("Feed Error:", e);
        reviewsFeed.innerHTML = '<p style="text-align:center; color:red;">Error loading feed. If this persists, a Firestore index may be building.</p>';
    }
}

// --- 3. Search & Live Filter Logic ---
searchInput.addEventListener('input', async (e) => {
    const term = e.target.value.trim().toLowerCase().replace('@', '');
    
    // Reset if search is empty
    if (term.length === 0) {
        suggestionBox.style.display = 'none';
        ratingPortal.style.display = 'none';
        loadReviews(); // Back to global feed
        return;
    }

    // UPDATE FEED LIVE AS USER TYPES
    loadReviews(null, term);

    // Fetch Merchant Suggestions for the dropdown (min 2 chars)
    if (term.length >= 2) {
        const q = query(collection(db, "users"), 
                        where("role", "==", "merchant"), 
                        where("username", ">=", term), 
                        where("username", "<=", term + '\uf8ff'));
        
        const snap = await getDocs(q);
        suggestionBox.innerHTML = '';
        
        if (snap.empty) { 
            suggestionBox.style.display = 'none'; 
        } else {
            snap.forEach(doc => {
                const data = doc.data();
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerText = `@${data.username}`;
                div.onclick = () => selectMerchant(doc.id, data.username);
                suggestionBox.appendChild(div);
            });
            suggestionBox.style.display = 'block';
        }
    } else {
        suggestionBox.style.display = 'none';
    }
});

function selectMerchant(uid, username) {
    selectedMerchantUid = uid;
    document.getElementById('selectedMerchant').innerText = `@${username}`;
    suggestionBox.style.display = 'none';
    searchInput.value = `@${username}`;
    
    ratingPortal.style.display = 'block'; 
    loadReviews(uid); // Lock feed to this specific merchant
}

// --- 4. Submit Review ---
window.submitReview = async () => {
    const starInput = document.querySelector('input[name="stars"]:checked');
    const reviewText = document.getElementById('reviewText').value.trim();
    const submitBtn = document.querySelector('.rating-portal .btn-filled');
    const merchantUsername = document.getElementById('selectedMerchant').innerText.replace('@', '');

    if (!starInput) return alert("Please select a star rating!");
    if (!selectedMerchantUid) return alert("Please select a valid merchant from the list.");

    submitBtn.disabled = true;
    submitBtn.innerText = "Posting...";

    try {
        // Add review to 'ratings' collection
        await addDoc(collection(db, "ratings"), {
            merchantUid: selectedMerchantUid,
            merchantUsername: merchantUsername,
            customerUid: auth.currentUser.uid,
            customerName: currentCustomerData.fullName || "Anonymous",
            stars: parseInt(starInput.value),
            review: reviewText,
            timestamp: serverTimestamp()
        });

        // Update merchant stats (Atomic updates recommended for production)
        const mRef = doc(db, "users", selectedMerchantUid);
        const mSnap = await getDoc(mRef);
        const mData = mSnap.data();
        
        const newCount = (mData.ratingCount || 0) + 1;
        const newSum = (mData.totalRatingSum || 0) + parseInt(starInput.value);
        
        await updateDoc(mRef, {
            rating: newSum / newCount,
            totalRatingSum: newSum,
            ratingCount: newCount
        });

        alert("Review Posted!");
        location.reload(); 
    } catch (e) { 
        console.error("Submission Error:", e);
        alert("Failed to post review.");
        submitBtn.disabled = false;
        submitBtn.innerText = "Post Review";
    }
};

// --- UI Controls ---
window.toggleDrawer = () => document.getElementById('navDrawer').classList.toggle('active');
window.handleLogout = async () => { await signOut(auth); window.location.href = "./sign-login.html"; };

// Ensure the submit button is wired up
const postBtn = document.querySelector('.rating-portal .btn-filled');
if (postBtn) postBtn.onclick = submitReview;
