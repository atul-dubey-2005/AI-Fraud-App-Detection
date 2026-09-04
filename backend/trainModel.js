const natural = require('natural');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// 1. Initialize NLP Sentiment & Classification Engine
const classifier = new natural.BayesClassifier();
const tokenizer = new natural.WordTokenizer();

console.log("🚀 Initializing FraudShield Sentiment Analysis Training Pipeline...");

// ==========================================
// NLP FEATURE ENGINEERING & PREPROCESSING
// ==========================================
function preprocessForSentiment(text) {
    if (!text) return "";
    let processed = text.toLowerCase();

    // Hum URLs aur Phone numbers ko tag kar rahe hain kyunki fraud sentiment mein
    // users aksar in chizon ki complain karte hain (e.g., "fake number diya hai")
    
    // Tag Phishing Links
    const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;
    if (urlRegex.test(processed)) processed += " __HAS_LINK__ ";
    processed = processed.replace(urlRegex, ''); 

    // Tag Suspicious Contact Numbers
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?(\d{10})/g;
    if (phoneRegex.test(processed)) processed += " __HAS_PHONE__ ";
    processed = processed.replace(phoneRegex, '');

    // Tag Financial Panic Words (Boosts Fraudulent Sentiment)
    const panicKeywords = ['otp', 'stole', 'fraud', 'scam', 'deducted', 'bank', 'unauthorized', 'chor', 'loot'];
    let panicScore = 0;
    panicKeywords.forEach(kw => {
        if (processed.includes(kw)) panicScore++;
    });
    
    if (panicScore >= 2) {
        processed += " __HIGH_PANIC_SENTIMENT__ ";
    }

    // Clean special characters to help NLP Tokenizer focus on actual words
    let cleaned = processed.replace(/[^a-z0-9_\s]/gi, ' ').replace(/\s+/g, ' ').trim();
    return cleaned;
}

// ==========================================
// LOAD DATASET & TRAIN SENTIMENT MODEL
// ==========================================
let rowCount = 0;
const datasetPath = path.join(__dirname, '../dataset/dataset.csv');

// Check if dataset exists
if (!fs.existsSync(datasetPath)) {
    console.error(`❌ ERROR: Dataset not found at ${datasetPath}`);
    console.log("Please create a 'dataset.csv' inside the 'dataset' folder with 'review' and 'label' columns.");
    process.exit(1);
}

fs.createReadStream(datasetPath)
  .pipe(csv({ headers: ['review', 'label'] }))
  .on('data', (row) => {
      if (row.review && row.label) {
          let smartText = preprocessForSentiment(row.review);
          let tokens = tokenizer.tokenize(smartText);
          classifier.addDocument(tokens, row.label);
          rowCount++;
      }
  })
  .on('end', () => {
      console.log(`\n✅ Loaded ${rowCount} reviews from dataset.`);
      console.log("🧠 Training Sentiment Analysis Model... Please wait.");
      
      // Train the NLP Model
      classifier.train();

      // Save the trained brain to a JSON file
      const modelPath = path.join(__dirname, 'fraud_model.json');
      classifier.save(modelPath, function(err, classifier) {
          if (err) {
              console.error("❌ Failed to save model:", err);
          } else {
              console.log("🛡️ SUCCESS! Sentiment Model saved as 'fraud_model.json'.");
              console.log("Your AI is now ready to detect fraudulent sentiment in live Play Store reviews!");
          }
      });
  });