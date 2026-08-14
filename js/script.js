// ==========================================
// 0. SUPABASE DATABASE CONNECTION
// ==========================================
const supabaseUrl = 'https://snobxnunspafeflfzkrt.supabase.co';
const supabaseKey = 'sb_publishable_sj1haa7S9JQrrPYySeu3ow_aXxyVzzP'; 

// Initialize Supabase (Window object se kyuki hum CDN use kar rahe hain)
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Test Connection
console.log("Supabase Connected:", supabase);
// ==========================================
// 1. NEWS FETCHING & RENDERING LOGIC
// ==========================================
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
            renderNews();
        } else {
             newsContainer.innerHTML = '<div class="p-5 text-center text-red-500 text-sm">No news articles found right now.</div>';
        }
    } catch (error) {
        console.error('Error fetching news:', error);
        newsContainer.innerHTML = '<div class="p-5 text-center text-red-500 text-sm">Failed to load real-time news. Check your connection.</div>';
    }
}

function renderNews() {
    const newsContainer = document.getElementById('news-container');
    const viewToggleText = document.getElementById('view-toggle-text');
    const viewToggleIcon = document.getElementById('view-toggle-icon');

    if (!newsContainer) return; 

    newsContainer.innerHTML = ''; 
    
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

    if (viewToggleText && viewToggleIcon) {
        if (isExpanded) {
            viewToggleText.textContent = 'VIEW LESS';
            viewToggleIcon.classList.add('rotate-180'); 
        } else {
            viewToggleText.textContent = 'VIEW MORE';
            viewToggleIcon.classList.remove('rotate-180'); 
        }
    }
}

// ==========================================
// 2. PAGE LOAD EVENTS (News, Login, Register)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    
    // --- NEWS SETUP ---
    fetchLatestNews(); 
    const viewToggleBtn = document.getElementById('view-toggle-btn');
    if (viewToggleBtn) {
        viewToggleBtn.addEventListener('click', (e) => {
            e.preventDefault(); 
            isExpanded = !isExpanded; 
            renderNews(); 
        });
    }

// ==========================================
// LOGIN & FORGOT PASSWORD LOGIC
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const loginView = document.getElementById('login-view');
    const forgotOtpView = document.getElementById('forgot-otp-view');
    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    const backToLoginBtn = document.getElementById('backToLoginBtn');
    const forgotEmailForm = document.getElementById('forgotEmailForm');
    const forgotOtpForm = document.getElementById('forgotOtpForm');
    const forgotEmailInput = document.getElementById('forgot-email');
    const otpTargetEmail = document.getElementById('otp-target-email');
    const resetOtpInput = document.getElementById('reset_otp_input');

    // 1. Forgot? click karne par Login view chhupao aur OTP view dikhao
    if (forgotPasswordBtn && loginView && forgotOtpView) {
        forgotPasswordBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loginView.style.display = 'none';
            forgotOtpView.style.display = 'flex';
        });
    }

    // 2. Back to login click karne par wapas normal login lao
    if (backToLoginBtn && loginView && forgotOtpView) {
        backToLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            forgotOtpView.style.display = 'none';
            loginView.style.display = 'block';
            
            // Sub-forms reset karein
            if (forgotEmailForm) forgotEmailForm.style.display = 'block';
            if (forgotOtpForm) forgotOtpForm.style.display = 'none';
        });
    }

    // 3. Email enter karke OTP bhejne ka step
    if (forgotEmailForm && forgotOtpForm) {
        forgotEmailForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (forgotEmailInput && otpTargetEmail) {
                otpTargetEmail.textContent = forgotEmailInput.value;
            }
            forgotEmailForm.style.display = 'none';
            forgotOtpForm.style.display = 'block';
        });
    }

    // 4. OTP input mein sirf numbers allow karo
    if (resetOtpInput) {
        resetOtpInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
    }
});

    // --- REGISTRATION PAGE OTP & VALIDATION LOGIC ---
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        const regStep1 = document.getElementById('step-1');
        const regStep2 = document.getElementById('step-2');
        const nameInput = document.getElementById('name');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirm_password');
        const passwordError = document.getElementById('password-error');
        const regDisplayEmail = document.getElementById('display-user-email');
        const regOtpInput = document.getElementById('otp_input');

        if (nameInput) {
            nameInput.addEventListener('input', function(e) {
                e.target.value = e.target.value.replace(/[^A-Za-z\s]/g, '');
            });
        }

        if (regOtpInput) {
            regOtpInput.addEventListener('input', function(e) {
                e.target.value = e.target.value.replace(/[^0-9]/g, '');
            });
        }

        registerForm.addEventListener('submit', function(event) {
            event.preventDefault(); 
            
            if (passwordInput.value.length < 6) {
                passwordError.textContent = 'Password must be at least 6 characters long.';
                passwordError.classList.remove('hidden');
                passwordInput.classList.remove('border-gray-800', 'focus:border-primary/50', 'focus:ring-primary/50');
                passwordInput.classList.add('border-red-500', 'focus:border-red-500', 'focus:ring-red-500');
                return; 
            }

            if (passwordInput.value !== confirmPasswordInput.value) {
                passwordError.textContent = 'Passwords do not match.';
                passwordError.classList.remove('hidden');
                confirmPasswordInput.classList.remove('border-gray-800', 'focus:border-primary/50', 'focus:ring-primary/50');
                confirmPasswordInput.classList.add('border-red-500', 'focus:border-red-500', 'focus:ring-red-500');
                return;
            }

            regDisplayEmail.textContent = emailInput.value;
            regStep1.classList.add('hidden');
            regStep2.classList.remove('hidden');
            regStep2.classList.add('flex');
        });

        const clearErrors = () => {
            passwordError.classList.add('hidden');
            
            passwordInput.classList.remove('border-red-500', 'focus:border-red-500', 'focus:ring-red-500');
            passwordInput.classList.add('border-gray-800', 'focus:border-primary/50', 'focus:ring-primary/50');
            
            confirmPasswordInput.classList.remove('border-red-500', 'focus:border-red-500', 'focus:ring-red-500');
            confirmPasswordInput.classList.add('border-gray-800', 'focus:border-primary/50', 'focus:ring-primary/50');
        };

        passwordInput.addEventListener('input', clearErrors);
        confirmPasswordInput.addEventListener('input', clearErrors);
    }
});

// ==========================================
// 1. FETCH REAL-TIME STATS (Apps Scanned, Users, etc.)
// ==========================================
async function fetchWebsiteLiveStats() {
    // Ye aapke backend ka URL hoga jahan scan counts save ho rahe hain
    const statsApiUrl = '/api/live-stats'; 

    try {
        const response = await fetch(statsApiUrl);
        
        // Agar backend abhi ready nahi hai, toh ye error dega aur hum ruk jayenge
        if (!response.ok) throw new Error('Backend API not ready yet');
        
        const data = await response.json();

        // Aapke HTML elements ko update karna
        document.getElementById('stat-apps').innerText = data.totalAppsScanned;
        document.getElementById('stat-fraud').innerText = data.totalFraudDetected;
        document.getElementById('stat-safe').innerText = data.totalSafeApps;
        document.getElementById('stat-users').innerText = data.totalProtectedUsers;

    } catch (error) {
        console.log("Stats API Note: Backend is not connected yet. Showing default HTML values.");
    }
}

// ==========================================
// 2. FETCH RECENTLY ANALYZED APPS (From Your Website)
// ==========================================
async function fetchOurRecentApps() {
    const container = document.getElementById('recent-apps-container');
    if (!container) return;

    // Ye URL aapke database se wo apps layega jo abhi-abhi kisi user ne scan ki hain
    const recentAppsApiUrl = '/api/recent-apps';

    try {
        const response = await fetch(recentAppsApiUrl);
        
        if (!response.ok) throw new Error('Backend API not ready yet');
        
        const appsData = await response.json();
        
        container.innerHTML = ''; // Loading text hatao

        // Loop chalakar har app ka card banao
        appsData.forEach(app => {
            const isSafe = app.status === 'Safe';
            
            const statusColor = isSafe ? 'text-primary' : 'text-[#ff4444]';
            const statusBorder = isSafe 
                ? 'border-primary/40 shadow-[0_0_10px_rgba(0,255,102,0.1)]' 
                : 'border-[#ff4444]/40 shadow-[0_0_10px_rgba(255,68,68,0.15)]';
            const statusLetter = isSafe ? 'S' : 'F';

            const cardHTML = `
                <div class="bg-surface border border-gray-800 rounded-2xl p-5 flex items-center justify-between hover:border-gray-700 hover:bg-gray-800/30 transition-all cursor-pointer">
                    <div class="flex items-center space-x-4">
                        <div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center shrink-0 overflow-hidden shadow-inner p-1">
                            <img src="${app.iconUrl}" alt="${app.appName}" class="w-full h-full object-contain">
                        </div>
                        <div>
                            <h3 class="text-white font-bold text-sm tracking-wide truncate max-w-[150px]">${app.appName}</h3>
                            <p class="text-gray-500 text-[11px] mt-0.5 tracking-wide truncate max-w-[150px]">Scanned by User</p>
                        </div>
                    </div>
                    <!-- Status Badge -->
                    <div class="w-7 h-7 rounded-full border ${statusBorder} flex items-center justify-center bg-background shrink-0" title="Status: ${app.status}">
                        <span class="text-[10px] font-bold ${statusColor}">${statusLetter}</span>
                    </div>
                </div>
            `;
            
            container.insertAdjacentHTML('beforeend', cardHTML);
        });

    } catch (error) {
        console.log("Recent Apps API Note: Backend is not connected yet.");
        // Jab tak backend nahi lagta, HTML mein jo default code likha hai, wahi dikhta rahega
    }
}

// ==========================================
// PAGE LOAD HONE PAR FUNCTIONS KO CALL KAREIN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Pehli baar data lao
    fetchWebsiteLiveStats();
    fetchOurRecentApps();

    // Har 5 second mein database se naya data check karo (Live Feel ke liye)
    setInterval(() => {
        fetchWebsiteLiveStats();
        fetchOurRecentApps();
    }, 5000); 
});

// ==========================================
// DYNAMIC AUTHENTICATION (STAY ON INDEX.HTML)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    
    // Elements Get Karein
    const authBtn = document.getElementById('auth-btn');
    const analyzeLink = document.getElementById('analyze-link');
    const lockIcon = document.getElementById('lock-icon');

    // MOCK CHECK: Check if user is logged in (Local Storage se)
    let isUserLoggedIn = localStorage.getItem('userLoggedIn') === 'true';

    function updateUI() {
        if (isUserLoggedIn) {
            // ==========================================
            // 1. JAB USER LOGGED IN HO
            // ==========================================
            
            // Header Button ko 'Logout' bana do (Red style ke sath)
            if (authBtn) {
                // Text aur Icon update (Exit Icon)
                authBtn.innerHTML = `
                    <span>LOGOUT</span>
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                `;
                authBtn.href = "javascript:void(0)"; 
                
                // Green (Primary) classes hatao, Red classes lagao
                authBtn.classList.remove('border-primary', 'text-primary', 'hover:bg-primary', 'hover:text-black');
                authBtn.classList.add('border-red-500', 'text-red-500', 'hover:bg-red-500', 'hover:text-white', 'shadow-[0_0_15px_rgba(239,68,68,0.2)]');
                
                // Logout hone par wapas refresh ho aur logged out state mein aaye
                authBtn.onclick = () => {
                    localStorage.setItem('userLoggedIn', 'false');
                    window.location.reload(); 
                };
            }

            // Analyze App ka Lock hata do
            if (analyzeLink) {
                analyzeLink.classList.remove('text-gray-400');
                analyzeLink.classList.add('text-white'); 
                
                analyzeLink.onclick = (e) => {
                    e.preventDefault();
                    alert("✅ Analyze Feature Unlocked! You can now scan apps.");
                    // Yahan aap scan karne wala popup/div open karwa sakte hain
                };
            }

            // Lock icon (🔒) ko green arrow mein badal do
            if (lockIcon) {
                lockIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>';
                lockIcon.classList.remove('text-gray-500');
                lockIcon.classList.add('text-primary');
            }

        } else {
            // ==========================================
            // 2. JAB USER LOGGED OUT HO
            // ==========================================
            
            if (authBtn) {
                // Button click hone par dummy login logic (Abhi ke liye bina naye page gaye login dikhane ke liye)
                authBtn.onclick = (e) => {
                    e.preventDefault();
                    
                    // Asli app mein yahan ek Login Modal (Popup) khulega. 
                    // Demo ke liye hum isko direct login kara rahe hain:
                    let confirmLogin = confirm("Demo Login: Click OK to simulate logging into FraudShield.");
                    if(confirmLogin) {
                        localStorage.setItem('userLoggedIn', 'true');
                        window.location.reload(); // Refresh karke UI update hoga
                    }
                };
            }

            // Analyze App ko locked rakhein
            if (analyzeLink) {
                analyzeLink.onclick = (e) => {
                    e.preventDefault();
                    alert("🔒 Please Login first to use the Analyze feature.");
                };
            }
        }
    }

    // Har baar page load hone par check karo state
    updateUI();
});