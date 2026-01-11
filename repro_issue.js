
// Mock logic from monitor.js
function checkEmergency(text) {
    if (!text) return false;
    text = text.toLowerCase();

    console.log("Testing text:", text.substring(0, 100) + "...");

    // 1. Якщо написано "скасовано" або "відновлено" - це не аварія
    if (text.includes("скасовано") || text.includes("відновлено") || text.includes("повертаємось до графіків")) {
        console.log("Filtered by cancellation keywords");
        return false;
    }

    // 2. Чи є взагалі слова про відключення?
    const hasKeywords = text.includes("екстрені") || text.includes("аварійні");
    if (!hasKeywords) {
        console.log("No emergency keywords found");
        return false;
    }

    // 3. ФІЛЬТР: Чи це ГЛОБАЛЬНА аварія?
    if (text.includes("укренерго")) return true;

    // Якщо згадуються локальні маркери - це ЛОКАЛЬНА аварія, ігноруємо її.
    // BUG IS HERE: "в Одеському районі" triggers this.
    if (text.includes("районі") || text.includes("громаді") || text.includes("частині") || text.includes("населеному пункті")) {
        // ⚠️ ВИНЯТОК: Якщо при цьому згадується саме обласний центр - це все ж таки важливо!
        // Наприклад: "в Одеському районі, зокрема в Одесі"
        const mentionsMajorCity = text.includes("київ") || text.includes("києв") ||
            text.includes("одес") || text.includes("дніпр");

        if (!mentionsMajorCity) {
            console.log("Filtered by local markers (районі/громаді etc)");
            return false;
        }
        console.log("Allowed text because it mentions a major city:", text.substring(0, 50));
    }

    return true;
}

const userText = `Через ворожі атаки в Одеському районі, зокрема в Одесі, можливі мережеві обмеження - це вимушені аварійні відключення, щоб не допустити масштабних аварій через перевантаження мережі. На жаль, їх неможливо спрогнозувати. Вони застосовуються при різкому збільшенні споживання та скасовуються після стабілізації ситуації.`;

const result = checkEmergency(userText);
console.log("Is Emergency:", result);

if (result === false) {
    console.log("TEST PASSED: Reproduction successful (Emergency NOT detected)");
} else {
    console.log("TEST FAILED: Emergency DETECTED (Logic might be different or issue is elsewhere)");
}
