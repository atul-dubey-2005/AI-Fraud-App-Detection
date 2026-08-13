// file: js/script.js

let allFetchedArticles = []; // Yahan saari news store hogi
let isExpanded = false; // Status check karne ke liye ki list khuli hai ya nahi
const collapsedCount = 5; // Band hone par 5 news dikhegi
const expandedCount = 12; // Khulne par 12 news dikhegi

async function fetchLatestNews() {
    const newsContainer = document.getElementById('news-container');
    
    // Multiple top cybersecurity websites ke RSS feeds
    const feeds = [
        { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews' },
        { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/' },
        { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml' },
        { name: 'Bleeping Computer', url: 'https://www.bleepingcomputer.com/feed/' },
        { name: 'SecurityWeek', url: 'https://www.securityweek.com/feed/' },
        { name: 'Help Net Security', url: 'https://www.helpnetsecurity.com/feed/' }
    ];

    try {
        await Promise.all(feeds.map(async (feed) => {
            const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`;
            try {
                const response = await fetch(apiUrl);
                const data = await response.json();
                
                if (data.status === 'ok') {
                    const itemsWithSource = data.items.map(item => ({
                        ...item,
                        sourceName: feed.name
                    }));
                    allFetchedArticles = allFetchedArticles.concat(itemsWithSource);
                }
            } catch (err) {
                console.error(`Error fetching feed from ${feed.name}:`, err);
            }
        }));

        if (allFetchedArticles.length > 0) {
            // Taza khabar sabse upar laane ke liye time ke hisaab se sort karein
            allFetchedArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
            
            // Screen par news render karne wala function call karein
            renderNews();
        } else {
             newsContainer.innerHTML = '<div class="p-5 text-center text-red-500 text-sm">No news articles found right now.</div>';
        }
    } catch (error) {
        console.error('Error fetching news:', error);
        newsContainer.innerHTML = '<div class="p-5 text-center text-red-500 text-sm">Failed to load real-time news. Check your connection.</div>';
    }
}

// Ye function decide karega ki kitni news dikhani hai (5 ya 12)
function renderNews() {
    const newsContainer = document.getElementById('news-container');
    const viewToggleText = document.getElementById('view-toggle-text');
    const viewToggleIcon = document.getElementById('view-toggle-icon');

    if (!newsContainer) return; // Agar container nahi mila toh ruk jao

    newsContainer.innerHTML = ''; // Pehle dabba khali karo
    
    // Decide karo ki 5 news dikhani hai ya 12
    const limit = isExpanded ? expandedCount : collapsedCount;
    const articlesToShow = allFetchedArticles.slice(0, limit);

    articlesToShow.forEach(article => {
        const dateObj = new Date(article.pubDate);
        const day = dateObj.getDate().toString().padStart(2, '0');
        const month = dateObj.toLocaleString('en-US', { month: 'short' }).toUpperCase();
        const year = dateObj.getFullYear();
        const formattedDate = `${day} ${month} ${year}`;

        const newsHTML = `
            <a href="${article.link}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-between p-5 border-b border-gray-800 hover:bg-gray-800/30 transition block">
                <div class="flex items-center space-x-6 overflow-hidden">
                    <span class="px-3 py-1 border border-primary/50 text-primary text-xs font-mono rounded bg-primary/5 whitespace-nowrap">${formattedDate}</span>
                    <p class="text-sm font-medium text-gray-200 truncate pr-4">${article.title}</p>
                </div>
                <div class="flex items-center space-x-4 text-gray-500 shrink-0">
                    <span class="text-xs hidden sm:block font-semibold">${article.sourceName}</span>
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                </div>
            </a>
        `;
        newsContainer.insertAdjacentHTML('beforeend', newsHTML);
    });

    // Button ka text aur arrow ka direction update karo
    if (viewToggleText && viewToggleIcon) {
        if (isExpanded) {
            viewToggleText.textContent = 'VIEW LESS';
            viewToggleIcon.classList.add('rotate-180'); // Arrow upar ki taraf ghum jayega
        } else {
            viewToggleText.textContent = 'VIEW MORE';
            viewToggleIcon.classList.remove('rotate-180'); // Arrow wapas neeche aa jayega
        }
    }
}

// Page load hone par events setup karna
document.addEventListener('DOMContentLoaded', () => {
    fetchLatestNews(); // News fetch karna shuru karo
    
    const viewToggleBtn = document.getElementById('view-toggle-btn');
    if (viewToggleBtn) {
        viewToggleBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Page ko upar jump hone se rokta hai
            isExpanded = !isExpanded; // Khula hai to band karo, band hai to kholo
            renderNews(); // List ko dubara update karo
        });
    }
});