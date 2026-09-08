// ==========================================
// 1. NEWS FETCHING & RENDERING LOGIC
// ==========================================
let allFetchedArticles = []; 
let isExpanded = false; 
const collapsedCount = 5; 
const expandedCount = 12; 

const menuBtn = document.getElementById('menu-btn');
const mobileMenu = document.getElementById('mobile-menu');

if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.getElementById('menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');

    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            mobileMenu.classList.toggle('hidden');
        });
    }
});

async function fetchLatestNews() {
    const newsContainer = document.getElementById('news-container');
    
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
            <a href="${article.link}" target="_blank" rel="noopener noreferrer" class="flex flex-col sm:flex-row sm:items-center justify-between p-4 md:p-5 border-b border-gray-800 hover:bg-gray-800/30 transition block gap-3 sm:gap-4">
                <div class="flex items-start sm:items-center space-x-4 overflow-hidden">
                    <span class="px-3 py-1 border border-primary/50 text-primary text-xs font-mono rounded bg-primary/5 whitespace-nowrap shrink-0 mt-0.5 sm:mt-0">${formattedDate}</span>
                    <p class="text-sm font-medium text-gray-200 leading-snug break-words pr-2">${article.title}</p>
                </div>
                <div class="flex items-center justify-between sm:justify-end space-x-4 text-gray-500 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-800/60">
                    <span class="text-xs font-semibold">${article.sourceName}</span>
                    <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
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
    const loginView = document.getElementById('login-view');
    const forgotOtpView = document.getElementById('forgot-otp-view');
    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    const backToLoginBtn = document.getElementById('backToLoginBtn');
    const forgotEmailForm = document.getElementById('forgotEmailForm');
    const forgotOtpForm = document.getElementById('forgotOtpForm');
    const forgotEmailInput = document.getElementById('forgot-email');
    const otpTargetEmail = document.getElementById('otp-target-email');
    const resetOtpInput = document.getElementById('reset_otp_input');

    if (forgotPasswordBtn && loginView && forgotOtpView) {
        forgotPasswordBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loginView.style.display = 'none';
            forgotOtpView.style.display = 'flex';
        });
    }

    if (backToLoginBtn && loginView && forgotOtpView) {
        backToLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            forgotOtpView.style.display = 'none';
            loginView.style.display = 'block';
            
            if (forgotEmailForm) forgotEmailForm.style.display = 'block';
            if (forgotOtpForm) forgotOtpForm.style.display = 'none';
        });
    }

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

    if (resetOtpInput) {
        resetOtpInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
    }

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
// 3. FETCH REAL-TIME STATS (Apps Scanned, Users, etc.)
// ==========================================
async function fetchWebsiteLiveStats() {
    const statsApiUrl = '/api/live-stats'; 
    try {
        const response = await fetch(statsApiUrl);
        if (!response.ok) throw new Error('Backend API not ready yet');
        const data = await response.json();

        document.getElementById('stat-apps').innerText = data.totalAppsScanned;
        document.getElementById('stat-fraud').innerText = data.totalFraudDetected;
        document.getElementById('stat-safe').innerText = data.totalSafeApps;
        document.getElementById('stat-users').innerText = data.totalProtectedUsers;
    } catch (error) {
        console.log("Stats API Note: Backend is not connected yet. Showing default HTML values.");
    }
}

// ==========================================
// 4. FETCH RECENTLY ANALYZED APPS (From Your Website)
// ==========================================
async function fetchOurRecentApps() {
    const container = document.getElementById('recent-apps-container');
    if (!container) return;

    try {
        const response = await fetch('http://localhost:3000/api/dashboard-stats'); 
        const data = await response.json();
        
        if (data.success && data.recentApps && data.recentApps.length > 0) {
            container.innerHTML = ''; // Dummy apps hatane ke liye

            data.recentApps.forEach(app => {
                const statusStr = (app.status || 'Safe').toLowerCase();
                const isSafe = !statusStr.includes('high') && !statusStr.includes('fraud');
                
                const statusColor = isSafe ? 'text-primary' : 'text-[#ff4444]';
                const statusBorder = isSafe 
                    ? 'border-primary/40 shadow-[0_0_10px_rgba(0,255,102,0.1)]' 
                    : 'border-[#ff4444]/40 shadow-[0_0_10px_rgba(255,68,68,0.15)]';
                const statusLetter = isSafe ? 'S' : 'F';

                const iconUrl = app.app_icon || 'https://cdn-icons-png.flaticon.com/512/888/888839.png';
                const appName = app.app_name || 'Unknown App';
                
                // 🟢 YAHAN SE NAAM HATA DIYA HAI AUR "Analyzed by AI" LIKH DIYA HAI
                const cardHTML = `
                    <div class="bg-surface border border-gray-800 rounded-2xl p-5 flex items-center justify-between hover:border-gray-700 hover:bg-gray-800/30 transition-all cursor-pointer">
                        <div class="flex items-center space-x-4">
                            <div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center shrink-0 overflow-hidden shadow-inner p-1.5">
                                <img src="${iconUrl}" alt="${appName}" class="w-full h-full object-contain" onerror="this.src='https://cdn-icons-png.flaticon.com/512/888/888839.png'">
                            </div>
                            <div>
                                <h3 class="text-white font-bold text-sm tracking-wide truncate max-w-[150px]">${appName}</h3>
                                <p class="text-gray-500 text-[11px] mt-0.5 tracking-wide truncate max-w-[150px]">Analyzed by AI</p>
                            </div>
                        </div>
                        <div class="w-7 h-7 rounded-full border ${statusBorder} flex items-center justify-center bg-background shrink-0" title="Status: ${app.status}">
                            <span class="text-[10px] font-bold ${statusColor}">${statusLetter}</span>
                        </div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', cardHTML);
            });
        }
    } catch (error) {
        console.error("Recent Apps fetch error:", error);
    }
}

// ==========================================
// 5. LOCALSTORAGE & ROLE-BASED AUTHENTICATION (INDEX.HTML)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    
    // Agar function available hain toh stats aur recent apps fetch karein
    if (typeof fetchWebsiteLiveStats === 'function') fetchWebsiteLiveStats();
    if (typeof fetchOurRecentApps === 'function') fetchOurRecentApps();

    const authBtn = document.getElementById('auth-btn');
    const analyzeLink = document.getElementById('analyze-link');
    const lockIcon = document.getElementById('lock-icon');

    // LocalStorage se check karein ki user logged in hai ya nahi
    const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
    const userRole = localStorage.getItem('userRole') || 'user';
    const userName = localStorage.getItem('userName') || 'User';

    function updateUI() {
        if (isLoggedIn) {
            
            // JAB USER LOGGED IN HO (Header Login Button -> Logout)
            if (authBtn) {
                authBtn.innerHTML = `
                    <span>LOGOUT (${userName})</span>
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                `;
                authBtn.href = "javascript:void(0)"; 
                authBtn.className = "px-6 py-2 rounded-full border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300 flex items-center space-x-2 text-sm font-bold tracking-wide cursor-pointer";
                
                authBtn.onclick = (e) => {
                    e.preventDefault();
                    localStorage.clear();
                    window.location.reload(); 
                };
            }

            // Sidebar Analyze Link -> Dashboard Redirection (Unlocked)
            if (analyzeLink) {
                const targetDashboard = (userRole === 'admin') ? "admin-dashboard.html" : "dashboard.html";
                analyzeLink.href = targetDashboard;
                
                analyzeLink.onclick = (e) => {
                    e.preventDefault();
                    window.location.href = targetDashboard;
                };
            }
            
    // Automatically highlight whichever nav item corresponds to the current page or anchor
    const currentPath = window.location.pathname.split('/').pop();
    const currentHash = window.location.hash;

    document.querySelectorAll('.nav-item').forEach(item => {
        const target = item.getAttribute('data-target');
        
        // Match either filename or hash
        if ((currentPath && target === currentPath) || (currentHash && target === currentHash)) {
            item.className = "nav-item flex items-center justify-between px-3 py-2.5 bg-primary/10 text-primary rounded-lg border border-primary/25 transition-colors font-medium text-sm";
        }

        // Add click listener so user sees immediate highlight selection
        item.addEventListener('click', function() {
            document.querySelectorAll('.nav-item').forEach(el => {
                el.className = "nav-item flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/40 font-medium text-sm transition-all group cursor-pointer";
            });
            this.className = "nav-item flex items-center justify-between px-3 py-2.5 bg-primary/10 text-primary rounded-lg border border-primary/25 transition-colors font-medium text-sm";
        });
    });
            // Remove lock icon state
            if (lockIcon) {
                lockIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>';
                lockIcon.classList.remove('text-gray-500');
                lockIcon.classList.add('text-primary');
            }

        } else {
            // JAB USER LOGGED OUT HO
            if (authBtn) {
                authBtn.href = "login.html";
                authBtn.onclick = null; 
            }

            if (analyzeLink) {
                analyzeLink.href = "login.html";
                analyzeLink.onclick = (e) => {
                    e.preventDefault();
                    window.location.href = "login.html"; 
                };
            }
        }
    }

    updateUI();
});
document.addEventListener('DOMContentLoaded', () => {
    const contactSubmitBtn = document.querySelector('#contact form button');
    
    if (contactSubmitBtn) {
        contactSubmitBtn.addEventListener('click', async (e) => {
            e.preventDefault();

            const name = document.getElementById('contact-name').value.trim();
            const email = document.getElementById('contact-email').value.trim();
            const subject = document.getElementById('contact-subject').value.trim();
            const message = document.getElementById('contact-message').value.trim();

            if (!name || !email || !subject || !message) {
                alert('Please fill in all fields before sending.');
                return;
            }

            contactSubmitBtn.disabled = true;
            contactSubmitBtn.textContent = 'SENDING...';

            try {
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, subject, message })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    alert('✅ Message sent successfully! We will get back to you soon.');
                    document.querySelector('#contact form').reset();
                } else {
                    throw new Error(data.message || 'Failed to send');
                }
            } catch (error) {
                alert('❌ Error: ' + error.message);
            } finally {
                contactSubmitBtn.disabled = false;
                contactSubmitBtn.innerHTML = `<span>SEND MESSAGE</span> <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`;
            }
        });
    }
});

// Example jab response save ho raha ho:
// Example jab response save ho raha ho (Moved inside function/scope where 'data' is defined or commented out):
/*const auditRecord = {
    target: data?.target, // Ye package ID ya name ho sakta hai
    appName: data?.appName || data?.target, // <-- Isko add karein
    riskScore: data?.riskScore,
    status: data?.status,
    colorClass: data?.colorClass,
    threats: data?.threats,
    date: new Date().toLocaleDateString()
};
*/

function openDemoModal() {
    const modal = document.getElementById('demoModal');
    const video = document.getElementById('demoVideoElement');
    modal.classList.remove('hidden');
    video.load(); // Ensures the video source is reloaded
    video.play().catch(error => {
        console.log("Playback error or missing file:", error);
    });
};

    function closeDemoModal() {
        const modal = document.getElementById('demoModal');
        const video = document.getElementById('demoVideoElement');
        modal.classList.add('hidden');
        video.pause();
        video.currentTime = 0; // Reset video position
    };

    