const natural = require('natural');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const classifier = new natural.BayesClassifier();
const tokenizer = new natural.WordTokenizer();

console.log("🚀 Initializing FraudShield Sentiment Analysis Training Pipeline...");

function preprocessForSentiment(text) {
    if (!text) return "";
    let processed = text.toLowerCase();

    const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;
    if (urlRegex.test(processed)) processed += " __HAS_LINK__ ";
    processed = processed.replace(urlRegex, ''); 

    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?(\d{10})/g;
    if (phoneRegex.test(processed)) processed += " __HAS_PHONE__ ";
    processed = processed.replace(phoneRegex, '');

    const panicKeywords = ['otp', 'stole', 'fraud', 'scam', 'deducted', 'bank', 'unauthorized', 'chor', 'loot'];
    let panicScore = 0;
    panicKeywords.forEach(kw => {
        if (processed.includes(kw)) panicScore++;
    });
    
    if (panicScore >= 2) {
        processed += " __HIGH_PANIC_SENTIMENT__ ";
    }

    let cleaned = processed.replace(/[^a-z0-9_\s]/gi, ' ').replace(/\s+/g, ' ').trim();
    return cleaned;
}

async function trainPipeline() {
    let allTrainingData = [];
    const datasetPath = path.join(__dirname, '../dataset/dataset.csv');
    const customJsonPath = path.join(__dirname, 'custom_dataset.json');
    
    // Check uploaded files (can be .json or .csv)
    const uploadedJsonPath = path.join(__dirname, 'uploads/latest_uploaded.json');
    const uploadedCsvpath = path.join(__dirname, 'uploads/latest_uploaded.csv');

    // 1. Load base CSV dataset
    if (fs.existsSync(datasetPath)) {
        await new Promise((resolve) => {
            let count = 0;
            fs.createReadStream(datasetPath)
              .pipe(csv({ headers: ['review', 'label'] }))
              .on('data', (row) => {
                  if (row.review && row.label && row.review !== 'review') {
                      allTrainingData.push({ text: row.review, label: row.label });
                      count++;
                  }
              })
              .on('end', () => {
                  console.log(`✅ Loaded ${count} records from base dataset.csv`);
                  resolve();
              });
        });
    }

    // 2. Load persistent custom JSON database
    if (fs.existsSync(customJsonPath)) {
        try {
            const existingCustom = JSON.parse(fs.readFileSync(customJsonPath, 'utf8'));
            if (Array.isArray(existingCustom)) {
                allTrainingData = allTrainingData.concat(existingCustom);
            }
        } catch (e) {
            console.error('Error reading custom_dataset.json:', e);
        }
    }

    // 3. Handle Newly Uploaded JSON File
    if (fs.existsSync(uploadedJsonPath)) {
        try {
            const newData = JSON.parse(fs.readFileSync(uploadedJsonPath, 'utf8'));
            if (Array.isArray(newData)) {
                allTrainingData = allTrainingData.concat(newData);
                console.log(`📥 Merged ${newData.length} records from uploaded JSON.`);
            }
            fs.unlinkSync(uploadedJsonPath);
        } catch (e) {
            console.error('Error reading uploaded JSON:', e);
        }
    }

    // 4. Handle Newly Uploaded CSV File
    if (fs.existsSync(uploadedCsvpath)) {
        await new Promise((resolve) => {
            let newCsvCount = 0;
            fs.createReadStream(uploadedCsvpath)
              .pipe(csv({ headers: ['review', 'label'] }))
              .on('data', (row) => {
                  if (row.review && row.label && row.review !== 'review') {
                      allTrainingData.push({ text: row.review, label: row.label });
                      newCsvCount++;
                  }
              })
              .on('end', () => {
                  console.log(`📥 Merged ${newCsvCount} records from uploaded CSV.`);
                  fs.unlinkSync(uploadedCsvpath);
                  resolve();
              });
        });
    }

    // Save updated cumulative corpus back to persistent JSON storage
    fs.writeFileSync(customJsonPath, JSON.stringify(allTrainingData, null, 2), 'utf8');

    if (allTrainingData.length === 0) {
        console.error("❌ ERROR: No training data found!");
        process.exit(1);
    }

    // 5. Train Classifier
    let documentsAdded = 0;
    allTrainingData.forEach(item => {
        if (item.text && item.label) {
            let smartText = preprocessForSentiment(item.text);
            let tokens = tokenizer.tokenize(smartText);
            classifier.addDocument(tokens, item.label);
            documentsAdded++;
        }
    });

    console.log(`\n🧠 Training Sentiment Analysis Model with total ${documentsAdded} documents...`);
    classifier.train();

    const modelPath = path.join(__dirname, 'fraud_model.json');
    classifier.save(modelPath, function(err) {
        if (err) {
            console.error("❌ Failed to save model:", err);
        } else {
            console.log(`🛡️ SUCCESS! Model updated & saved. Total active corpus: ${documentsAdded} entries.`);
        }
    });
}

trainPipeline();