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
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";

const rtdb = getDatabase();

/** * 1. AUTH GUARD
 * Kicks unauthorized users back to login page immediately
 */
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "./admin-login.html";
        return;
    }

    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        const role = userSnap.data().role;

        if (role !== "admin") {
            alert("Access denied: You are not an admin.");
            await signOut(auth);
            return;
        }

        // User is admin, continue
        initDashboard();

    } catch (err) {
        console.error("Auth check failed:", err);
    }
});

/**
 * 2. UI UTILITIES
 */
window.toggleDrawer = () => {
    const drawer = document.getElementById('navDrawer');
    drawer.classList.toggle('active');
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

/**
 * 3. CORE DASHBOARD LOGIC
 */
const userTableBody = document.querySelector('.admin-table tbody');
const searchInput = document.querySelector('.admin-search');
const customerCountEl = document.querySelectorAll('.stat-value')[0];
const merchantCountEl = document.querySelectorAll('.stat-value')[1];

let allUsers = []; // Source of truth for filtering

function initDashboard() {
    const usersRef = collection(db, "users");
    const q = query(usersRef, orderBy("fullName", "asc"));

    onSnapshot(q, (snapshot) => {
        allUsers = [];
        let customerCount = 0;
        let merchantCount = 0;

        snapshot.forEach(doc => {
            const userData = { id: doc.id, ...doc.data() };
            allUsers.push(userData);

            const role = (userData.role || "").toLowerCase();
            if (role === 'customer') customerCount++;
            if (role === 'merchant') merchantCount++;
        });

        customerCountEl.textContent = customerCount.toLocaleString();
        merchantCountEl.textContent = merchantCount.toLocaleString();

        if (!searchInput.value.trim()) {
            renderUserTable(allUsers);
        } else {
            triggerSearch();
        }
    });
}

/**
 * 4. TABLE RENDERING
 */

function renderUserTable(users) {
    userTableBody.innerHTML = '';

    if (users.length === 0) {
        userTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: #86868b;">No users found matching your criteria.</td></tr>';
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');
        
        // Data mapping with fallbacks
        const role = (user.role || "User").toLowerCase();
        const status = user.status || "Active";
        const phone = user.phoneNumber || "N/A";
        
        const statusClass = status.toLowerCase() === 'locked' ? 'locked' : 'active';
        const badgeClass = role;
        
        const lockIcon = status.toLowerCase() === 'locked' ? 'fi-unlock' : 'fi-lock';
        const lockTitle = status.toLowerCase() === 'locked' ? 'Unlock Account' : 'Lock Account';

        // Set a unique ID for the location button to update it live
        const locBtnId = `loc-btn-${user.id}`;

        tr.innerHTML = `
            <td>${user.fullName || 'Unknown'}</td>
            <td><span class="badge ${badgeClass}">${role.toUpperCase()}</span></td>
            <td>${phone}</td>
            <td><span class="status-pill ${statusClass}">${status}</span></td>
            <td class="action-cell">
                ${role === 'merchant' ? `
                    <a href="location.html?id=${user.id}" id="${locBtnId}" class="action-btn loc-btn" title="Checking status...">
                        <i class="fi-marker"></i>
                    </a>
                    <a href="kyc.html?id=${user.id}" class="action-btn kyc-btn" title="View KYC">
                          <i class="fi-credit-card"></i>
                    </a>
                ` : ''}
                <a href="view.html?id=${user.id}" class="action-btn view-btn" title="View Profile">
                    <i class="fi-eye"></i>
                </a>
                <button class="action-btn lock-btn" title="${lockTitle}" onclick="toggleUserLock('${user.id}', '${status}')">
                    <i class="${lockIcon}"></i>
                </button>
                <button class="action-btn delete-btn" title="Delete User" onclick="deleteUser('${user.id}')">
                    <i class="fi-trash"></i>
                </button>
            </td>
        `;
        userTableBody.appendChild(tr);

        // --- REAL-TIME LOCATION MONITORING FOR MERCHANTS ---
        if (role === 'merchant') {
            const merchantLocRef = ref(rtdb, `merchants/${user.id}/location`);
            
            // Listen for changes in the merchant's GPS status
            onValue(merchantLocRef, (snapshot) => {
                const locData = snapshot.val();
                const btn = document.getElementById(locBtnId);
                
                if (btn && locData) {
                    const now = Date.now();
                    const lastSeen = locData.lastSeen || 0;
                    // Logic: Online if status is 'online' AND last update was less than 2 minutes ago
                    const isOnline = locData.status === "online" && (now - lastSeen < 120000);

                    if (isOnline) {
                        btn.style.color = "var(--success)";
                        btn.style.borderColor = "var(--success)";
                        btn.style.background = "rgba(52, 199, 89, 0.1)";
                        btn.title = "Merchant is Online";
                    } else {
                        btn.style.color = "var(--error)";
                        btn.style.borderColor = "var(--error)";
                        btn.style.background = "rgba(255, 59, 48, 0.1)";
                        btn.title = "Merchant is Offline (GPS Inactive)";
                    }
                } else if (btn) {
                    // No data at all in RTDB
                    btn.style.color = "var(--text-dim)";
                    btn.title = "No Location Data Available";
                }
            });
        }
    });
}


/**
 * 5. INSTANT SEARCH LOGIC
 */
const triggerSearch = () => {
    const term = searchInput.value.toLowerCase().trim();
    
    const filtered = allUsers.filter(user => {
        // Safe string conversions
        const name = (user.fullName || "").toLowerCase();
        const phone = (user.phoneNumber || user.phone || "").toLowerCase();
        const email = (user.email || "").toLowerCase();
        const userId = (user.id || "").toLowerCase();

        return name.includes(term) || 
               phone.includes(term) || 
               email.includes(term) || 
               userId.includes(term);
    });
    
    renderUserTable(filtered);
};

// Event listener for instant filtering as you type
searchInput.addEventListener('input', triggerSearch);

async function deactivateActiveSession(uid) {
    try {
        // 1. Turn off public visibility
        await updateDoc(doc(db, "users", uid), { isActive: false });
        
        // 2. Find and turn off the active session in sub-collection
        const q = query(collection(db, "merchants", uid, "sessions"), where("isActive", "==", true));
        const snap = await getDocs(q);
        const batch = [];
        snap.forEach(d => {
            batch.push(updateDoc(d.ref, { 
                isActive: false, 
                lastTurnedOff: Date.now() 
            }));
        });
        await Promise.all(batch);
    } catch (e) {
        console.error("Cleanup failed:", e);
    }
}

// --- UPDATED ADMIN ACTIONS ---

window.toggleUserLock = async (userId, currentStatus) => {
    const isLocking = currentStatus.toLowerCase() !== 'locked'; // true if blocking
    const newStatus = isLocking ? "Locked" : "Active";

    if (!confirm(`Are you sure you want to ${isLocking ? 'BLOCK' : 'UNBLOCK'} this user?`)) return;

    try {
        const userRef = doc(db, "users", userId);

        // 1️⃣ Update status and isActive
        await updateDoc(userRef, {
            status: newStatus,
            isActive: !isLocking, // false if blocking, true if unblocking
            lastStatusUpdate: new Date().toISOString()
        });

        // 2️⃣ If blocking, shut down all active sessions
        if (isLocking) {
            await deactivateActiveSession(userId); // re-use your helper
        }

        alert(`User has been successfully ${isLocking ? 'BLOCKED' : 'UNBLOCKED'}.`);

    } catch (error) {
        console.error("Error toggling lock:", error);
        alert("Failed to update user status: " + error.message);
    }
};

window.deleteUser = async (userId) => {
    const confirmation = confirm("PERMANENT ACTION: This user will be blacklisted and deleted. They will not be able to sign up again with the same credentials. Continue?");
    
    if (confirmation) {
        try {
            // 1. Fetch the user's data before deleting so we know what to blacklist
            const userRef = doc(db, "users", userId);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                alert("Error: User document not found.");
                return;
            }

            const userData = userSnap.data();
            const userEmail = userData.email;
            const userMatric = userData.matricNumber; // Matches your signup field

            // 2. Add to Blacklist Collection
            // We use the email as the Document ID for easy lookups during future Signups
            await setDoc(doc(db, "blacklist", userEmail), {
                email: userEmail,
                matricNumber: userMatric || "N/A",
                name: userData.fullName || "Unknown",
                reason: "Account deleted by administrator",
                deletedAt: new Date().toISOString()
            });

            // 3. Physically delete the document from the 'users' collection
            // Your global security listener will detect this and log them out
            await deleteDoc(userRef);

            alert("User has been successfully blacklisted and deleted.");
        } catch (error) {
            console.error("Deletion/Blacklist Error:", error);
            alert("Action failed: " + error.message);
        }
    }
};
