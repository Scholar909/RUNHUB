import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// This utility is used by the Customer to alert the Merchant
export async function sendWhatsAppAlert(merchantId, message) {
    try {
        // CHANGE THIS: Look in merchant_alerts, not alertSettings
        const snap = await getDoc(doc(db, "merchant_alerts", merchantId)); 
        
        if (!snap.exists()) {
            console.log("Merchant has not enabled alerts in merchant_alerts collection");
            return;
        }

        const { phone, api, enabled } = snap.data();
        
        if (!enabled) {
            console.log("Alerts disabled for this merchant");
            return;
        }

        const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=${api}`;
        
        await new Promise(res => setTimeout(res, 1000));
        
        await fetch(url, { 
            mode: 'no-cors',
            method: 'GET'
        });

        console.log("Merchant alert dispatched for:", merchantId);

    } catch (err) {
        console.error("Alert Error:", err);
    }
}
