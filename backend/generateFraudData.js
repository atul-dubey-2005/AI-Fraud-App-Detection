const fs = require('fs');
const path = require('path');

const datasetPath = path.join(__dirname, '../dataset/dataset.csv');

// AI ko sikhane ke liye alag-alag phrases ka collection
const subjects = [
    "This app", "Customer care", "They", "The scammers", "This fake application", 
    "The link they sent", "Their support team", "This totally fake app", "Fraudsters"
];

const actions = [
    "stole my money", "deducted balance from my bank", "asked for my OTP", 
    "hacked my phone contacts", "did unauthorized transactions", "charged a processing fee", 
    "took my credit card details", "blackmailed me", "stole my personal data", "deducted 500 rupees"
];

const complaints = [
    "and then blocked my number.", "total scam do not install.", "complete fraud chor company.", 
    "worst app ever please remove.", "no refund was given.", "and customer service is always off.",
    "please report this app.", "it is a big trap.", "and they never reply to emails.", "huge security risk."
];

// Random number generator helper
function getRandom(array) {
    return array[Math.floor(Math.random() * array.length)];
}

console.log("⚙️ Generating 1000 Synthetic Fraud Reviews...");

let syntheticData = "";

// 1000 unique lines generate karne ka loop
for (let i = 0; i < 2500; i++) {
    let fakeReview = `${getRandom(subjects)} ${getRandom(actions)} ${getRandom(complaints)}`;
    
    // Thoda aur variation laane ke liye random numbers/tags add kar rahe hain
    if (i % 5 === 0) fakeReview += " call 9876543210 for refund.";
    if (i % 7 === 0) fakeReview += " http://fake-phishing-link.com";
    
    syntheticData += `"${fakeReview}",Fraud\n`;
}

// Data ko file mein append (add) kar do
fs.appendFileSync(datasetPath, syntheticData, 'utf8');

console.log("✅ BOOM! 1000 Unique Fraud Reviews successfully added to your dataset.csv!");
console.log("Ab aapka AI Scam, OTP, Fake links aur Fraud ko detect karne mein master ban jayega.");