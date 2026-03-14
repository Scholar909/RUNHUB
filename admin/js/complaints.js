import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { 
    collection, 
    query, 
    onSnapshot, 
    doc, 
    updateDoc, 
    deleteDoc, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- Auth Protection ---
onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "./admin-login.html";
    // In a real app, verify if user.uid is the admin UID here
});

// --- State Management ---
const tableBody = document.querySelector(".admin-table tbody");
const searchInput = document.querySelector(".admin-search");
let allComplaints = [];

// --- Real-time Listener for Complaints ---
// We combine both merchant and customer complaints into one view
function initComplaintsListener() {
    // 1. Listen to Merchant Complaints
    const merchQuery = query(collection(db, "complaints"), orderBy("timestamp", "desc"));
    onSnapshot(merchQuery, (snapshot) => {
        const merchData = snapshot.docs.map(d => ({ id: d.id, source: 'merch', ...d.data() }));
        renderCombinedTable(merchData, 'merch');
    });

    // 2. Listen to Customer Complaints
    const custQuery = query(collection(db, "customer_complaints"), orderBy("timestamp", "desc"));
    onSnapshot(custQuery, (snapshot) => {
        const custData = snapshot.docs.map(d => ({ id: d.id, source: 'cust', ...d.data() }));
        renderCombinedTable(custData, 'cust');
    });
}

// Helper to merge and render
function renderCombinedTable(data, type) {
    // Filter out existing entries of the same type to avoid duplicates on update
    allComplaints = allComplaints.filter(c => c.source !== type).concat(data);
    
    // Sort by timestamp
    allComplaints.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    
    displayRows(allComplaints);
}

function displayRows(complaints) {
    tableBody.innerHTML = "";
    
    complaints.forEach(complaint => {
        const tr = document.createElement("tr");
        const status = complaint.status || "pending";
        const isResolved = status === "settled" || status === "closed";

        tr.innerHTML = `
            <td>
                <div class="user-info">
                    <span class="u-name">${complaint.customerName || complaint.merchantName} (${complaint.source === 'cust' ? 'Cust' : 'Merch'})</span>
                    <span class="u-meta">${complaint.timestamp?.toDate().toLocaleTimeString() || 'Just now'}</span>
                </div>
            </td>
            <td>${complaint.orderId || complaint.ticketId}</td>
            <td>
                <p class="issue-preview" onclick="openComplaintModal('${complaint.customerName || complaint.merchantName}', '${complaint.orderId}', \`${complaint.message}\`)">
                    ${complaint.message.substring(0, 30)}...
                </p>
            </td>
            <td><span class="status-pill ${status}">${status}</span></td>
            <td class="action-cell">
                ${!isResolved ? `
                    <button class="action-btn settle-btn" onclick="updateStatus('${complaint.id}', '${complaint.source}', 'settled')" title="Mark Settled"><i class="fi-check"></i></button>
                    <button class="action-btn closed-btn" onclick="updateStatus('${complaint.id}', '${complaint.source}', 'closed')" title="Close Complaint"><i class="fi-x-circle"></i></button>
                ` : ''}
                <button class="action-btn delete-btn" onclick="deleteComplaint('${complaint.id}', '${complaint.source}')" title="Discard"><i class="fi-trash"></i></button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

// --- Actions ---

// Update Status (Settle or Close)
window.updateStatus = async (id, source, newStatus) => {
    const collectionName = source === 'cust' ? "customer_complaints" : "complaints";
    try {
        await updateDoc(doc(db, collectionName, id), {
            status: newStatus
        });
    } catch (error) {
        console.error("Error updating status:", error);
    }
};

// Delete Complaint
window.deleteComplaint = async (id, source) => {
    if (!confirm("Are you sure you want to delete this record?")) return;
    const collectionName = source === 'cust' ? "customer_complaints" : "complaints";
    try {
        await deleteDoc(doc(db, collectionName, id));
    } catch (error) {
        console.error("Error deleting:", error);
    }
};

// --- Modal Logic ---
window.openComplaintModal = (user, orderId, message) => {
    document.getElementById("modalUser").innerText = `${user} (Order: ${orderId})`;
    document.getElementById("modalDesc").innerText = message;
    document.getElementById("complaintModal").classList.add("active");
};

window.closeModal = () => {
    document.getElementById("complaintModal").classList.remove("active");
};

// --- Search Filter ---
searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allComplaints.filter(c => 
        (c.orderId && c.orderId.toLowerCase().includes(term)) || 
        (c.ticketId && c.ticketId.toLowerCase().includes(term))
    );
    displayRows(filtered);
});

// --- UI Helpers ---
window.toggleDrawer = () => document.getElementById('navDrawer').classList.toggle('active');

// Initialize
initComplaintsListener();
