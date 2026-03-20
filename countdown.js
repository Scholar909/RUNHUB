const startOrderBtn = document.getElementById("startOrderBtn");
const modal = document.getElementById("countdownModal");
const closeModal = document.getElementById("closeModal");
const countdownEl = document.getElementById("countdownTimer");

// 🔥 Set launch time (8AM tomorrow)
const launchDate = new Date();
launchDate.setDate(launchDate.getDate() + 1);
launchDate.setHours(8, 0, 0, 0);

function updateCountdown() {
  const now = new Date().getTime();
  const distance = launchDate.getTime() - now;

  if (distance <= 0) {
    countdownEl.textContent = "00:00:00";
    
    // Redirect automatically when time is reached
    window.location.href = "customer/sign-login.html";
    return;
  }

  const hours = Math.floor((distance / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((distance / (1000 * 60)) % 60);
  const seconds = Math.floor((distance / 1000) % 60);

  countdownEl.textContent =
    `${String(hours).padStart(2, '0')}:` +
    `${String(minutes).padStart(2, '0')}:` +
    `${String(seconds).padStart(2, '0')}`;
}

// Open modal
if (startOrderBtn) {
  startOrderBtn.addEventListener("click", (e) => {
    e.preventDefault();
    modal.style.display = "flex";
    updateCountdown();
  });
}

// Close modal
closeModal.addEventListener("click", () => {
  modal.style.display = "none";
});

// Run countdown every second
setInterval(updateCountdown, 1000);