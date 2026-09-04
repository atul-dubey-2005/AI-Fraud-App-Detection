// collectData.js
let gplay = require('google-play-scraper');
const fs = require('fs');
const path = require('path');

// Agar package 'default' object ke andar load hua hai, toh usko fix karo
if (gplay.default) {
    gplay = gplay.default;
}

// ==========================================
// ⚙️ CONFIGURATION 
// ==========================================
const TARGET_APP_ID = 'com.zerodha.kite3'; 
const TARGET_LABEL = 'Safe'; 
const NUM_REVIEWS = 500; 

const datasetPath = path.join(__dirname, '../dataset/dataset.csv');

function cleanTextForTraining(text) {
    if (!text) return "";
    let processed = text.toLowerCase();
    
    processed = processed.replace(/(https?:\/\/[^\s]+)|(www\.[^\s]+)/g, ' __LINK__ ');
    processed = processed.replace(/(\+?\d{1,3}[-.\s]?)?(\d{10})/g, ' __PHONE__ ');
    
    processed = processed.replace(/[\r\n]+/g, ' ')
                         .replace(/"/g, '')
                         .replace(/[^a-z0-9_\s]/gi, ' ')
                         .replace(/\s+/g, ' ')
                         .trim();
    return processed;
}

async function buildDataset() {
    console.log(`📡 Fetching ${NUM_REVIEWS} reviews for [${TARGET_APP_ID}]...`);
    
    // Debugging ke liye check kar rahe hain ki gplay ke andar kya-kya hai
    if (typeof gplay.reviews !== 'function') {
        console.log("⚠️ DEBUG: gplay.reviews function nahi mila. Available functions hain:", Object.keys(gplay));
        return;
    }
    
    try {
        const reviewsData = await gplay.reviews({
            appId: TARGET_APP_ID,
            sort: 2, // 2 means NEWEST
            num: NUM_REVIEWS
        });

        if (!reviewsData.data || reviewsData.data.length === 0) {
            console.log("⚠️ No reviews found!");
            return;
        }

        let newRecords = "";

        if (!fs.existsSync(datasetPath)) {
            newRecords += "review,label\n";
        }

        let addedCount = 0;
        reviewsData.data.forEach(rev => {
            let cleanReview = cleanTextForTraining(rev.text);
            if (cleanReview.length > 10) {
                newRecords += `"${cleanReview}",${TARGET_LABEL}\n`;
                addedCount++;
            }
        });

        fs.appendFileSync(datasetPath, newRecords, 'utf8');
        
        console.log(`✅ Success! Cleaned and saved ${addedCount} reviews as '${TARGET_LABEL}'.`);
        console.log(`📂 Check your dataset at: ${datasetPath}`);

    } catch (error) {
        console.error("❌ Fetch failed:", error.message);
    }
}

buildDataset();