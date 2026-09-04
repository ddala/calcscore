// ========================================
// SHARED BY THE CALCULATOR AND THE SIMULATION
// ========================================

const ALERT_TIMEOUT_MS = 4000;

// Base scoring array - positions 1-100
const BASE_SCORES = [
    300, 280, 262, 244, 228, 213, 198, 185, 173, 161,
    150, 140, 131, 122, 114, 107, 99, 93, 87, 81,
    75, 70, 66, 61, 57, 54, 50, 47, 44, 41,
    38, 35, 33, 31, 29, 27, 25, 24, 22, 21,
    19, 18, 17, 16, 15, 14, 13, 12, 11, 11,
    10, 9, 9, 8, 8, 7, 7, 6, 6, 6,
    5, 5, 5, 4, 4, 4, 4, 3, 3, 3,
    3, 3, 3, 2, 2, 2, 2, 2, 2, 2,
    2, 2, 2, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1
];

// ========================================
// UTILITY FUNCTIONS
// ========================================

function showMessage(message, type = 'danger') {
    const alertBox = document.getElementById('errorAlert');
    if (!alertBox) return;

    alertBox.textContent = message;
    alertBox.className = `alert-${type}`;
    alertBox.classList.add('show');

    setTimeout(() => alertBox.classList.remove('show'), ALERT_TIMEOUT_MS);
}

function showError(message) {
    showMessage(message, 'danger');
}

function showSuccess(message) {
    showMessage(message, 'success');
}
