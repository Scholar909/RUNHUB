export function showNotification({ title, message, action }) {
    const box = document.createElement("div");
    box.className = "nova-notification";

    box.innerHTML = `
        <div class="nova-content">
            <strong>${title}</strong>
            <p>${message}</p>
        </div>
        <span class="close-btn">&times;</span>
    `;

    // Click action
    box.onclick = () => {
        if (action) action();
    };

    // Close button
    box.querySelector(".close-btn").onclick = (e) => {
        e.stopPropagation();
        box.remove();
    };

    document.body.appendChild(box);
}