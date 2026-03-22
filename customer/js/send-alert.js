import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

export async function sendWhatsAppAlert(userId, message) {
    try {
        const snap = await getDoc(doc(db, "alertSettings", userId));
        if (!snap.exists()) {
            console.log("User has not enabled alerts");
            return;
        }

        const { phone, api, enabled } = snap.data();
        
        if (!enabled) {
            console.log("Alerts disabled for user");
            return;
        }

        const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=${api}`;
        
        // small delay to make alerts feel natural (and avoid API bursts)
        await new Promise(res => setTimeout(res, 1000));
        
        await fetch(url);

    } catch (err) {
        console.error("Alert Error:", err);
    }
}