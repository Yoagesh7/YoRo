// === GLOBAL STATE MANAGEMENT ===

const DEFAULT_TASKS = [
    { id: "1", tag: "DAILY", tagColor: "#10b981", title: "Morning Meditation", desc: "Clear your mind for 10 minutes to restore mana.", time: "10m", xp: 100, xpMultiplier: "x2.5", completed: false },
    { id: "2", tag: "WORK", tagColor: "#3b82f6", title: "Clear Email Inbox", desc: "Archive old scrolls and respond to urgent missives.", time: "15m", xp: 100, xpMultiplier: "x2.5", completed: false },
    { id: "3", tag: "FITNESS", tagColor: "#a855f7", title: "Gym Session: Legs", desc: "Complete the leg day routine without skipping squats.", time: "60m", xp: 250, xpMultiplier: "x2.5", completed: false },
    { id: "4", tag: "PROJECT", tagColor: "#eab308", title: "Design System Audit", desc: "Review all component tokens for consistency.", time: "45m", xp: 250, xpMultiplier: "x2.5", completed: false },
    { id: "5", tag: "BOSS RAID", tagColor: "#ef4444", title: "Quarterly Review Presentation", desc: "Prepare slides, gather metrics, and rehearse for stakeholders.", time: "2h", xp: 500, xpMultiplier: "x2.5", completed: false }
];

let state = {
    tasks: [...DEFAULT_TASKS],
    totalXp: 0,
    coins: 0,
    currentLevel: 1,
    dailyStreak: 0,
    lastActiveDate: new Date().toISOString().split("T")[0],
    weeklyHistory: [],
    userName: "Productivity Master",
    ownedItems: [],
    selectedAvatar: null
};

const XP_PER_LEVEL = 100;

function loadState() {
    const loggedIn = localStorage.getItem('yoroutine-loggedin');
    if (loggedIn) {
        const savedReq = localStorage.getItem('yoroutine-state-' + loggedIn);
        if (savedReq) {
            state = JSON.parse(savedReq);
            if (!state.tasks) state.tasks = [];

            // Migration: Reset coins to 0 for all users once
            if (!state.coinsResetV2) {
                state.coins = 0;
                state.coinsResetV2 = true;
                saveState();
            }

            if (!state.ownedItems) state.ownedItems = [];
        }
    } else {
        // Legacy: try old storage key
        const savedReq = localStorage.getItem('yoRoutineState');
        if (savedReq) {
            state = JSON.parse(savedReq);
            if (!state.tasks) state.tasks = [];
        }
    }
}

function saveState() {
    const loggedIn = localStorage.getItem('yoroutine-loggedin');
    if (loggedIn) {
        localStorage.setItem('yoroutine-state-' + loggedIn, JSON.stringify(state));
    }
    // Also save to legacy key for backward compat
    localStorage.setItem('yoRoutineState', JSON.stringify(state));
}

function getTodayString() {
    return formatLocalDate(new Date());
}

function formatLocalDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function checkMidnightReset() {
    const today = getTodayString();

    if (state.lastActiveDate !== today) {
        const lastDate = new Date(state.lastActiveDate);
        const currentDate = new Date(today);
        const diffTime = Math.abs(currentDate - lastDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Save yesterday's activity to weekly history
        const yesterdayXp = state.tasks.filter(t => t.completed).reduce((sum, t) => sum + t.xp, 0);

        state.weeklyHistory.push({
            date: state.lastActiveDate,
            xpEarned: yesterdayXp,
            tasksCompleted: state.tasks.filter(t => t.completed).length,
            totalTasks: state.tasks.length,
        });

        // Keep only last 365 days for the Consistency Graph
        if (state.weeklyHistory.length > 365) {
            state.weeklyHistory.shift();
        }

        // Reset tasks to uncompleted (totalXp is NOT reset!)
        state.tasks = state.tasks.map(t => ({ ...t, completed: false }));

        // Check Streak
        if (diffDays === 1) {
            // Maintained streak (assuming they did at least 1 task yesterday, otherwise we could break it)
            if (yesterdayXp > 0) {
                state.dailyStreak += 1;
            } else {
                state.dailyStreak = 0;
            }
        } else {
            // Broke streak
            state.dailyStreak = 0;
        }

        state.lastActiveDate = today;
        saveState();
    }
}


// === DOM MANIPULATION & RENDERING ===

function init() {
    loadState();
    checkMidnightReset();
    applySavedTheme();

    // Generate referral code if not set
    if (!state.referralCode) {
        state.referralCode = generateReferralCode();
        saveState();
    }

    // Check if logged in
    if (!localStorage.getItem('yoroutine-loggedin')) {
        document.getElementById('onboarding-screen').classList.remove('hidden');
        document.querySelector('.header').style.display = 'none';
        document.querySelector('.layout-container').style.display = 'none';
        document.querySelector('.mobile-nav').style.display = 'none';
    } else {
        // Already logged in — ask for name if not set
        setTimeout(() => showNamePromptIfNeeded(), 500);
    }

    refreshIcons();
    updateUI();

    // Check for PWA install eligibility
    setTimeout(checkPwaAffordance, 2000);
}

function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'YO-';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function switchAuthTab(tab) {
    document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('form-signup').classList.toggle('hidden', tab !== 'signup');
    document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
    // Clear errors
    document.getElementById('signup-error').classList.add('hidden');
    document.getElementById('login-error').classList.add('hidden');
}

function showAuthError(id, msg) {
    const el = document.getElementById(id);
    el.innerText = msg;
    el.classList.remove('hidden');
}

function handleSignup() {
    const username = document.getElementById('signup-username').value.trim();
    const password = document.getElementById('signup-password').value;
    const referral = document.getElementById('signup-referral').value.trim().toUpperCase();

    if (!username || username.length < 2) {
        showAuthError('signup-error', 'Username must be at least 2 characters.');
        return;
    }
    if (!password || password.length < 4) {
        showAuthError('signup-error', 'Password must be at least 4 characters.');
        return;
    }

    // Check if username already exists
    const users = JSON.parse(localStorage.getItem('yoroutine-users') || '{}');
    if (users[username.toLowerCase()]) {
        showAuthError('signup-error', 'Username already taken. Try logging in.');
        return;
    }

    // Save user credentials (with case-preserved display name)
    users[username.toLowerCase()] = { password, displayName: username, createdAt: new Date().toISOString() };
    localStorage.setItem('yoroutine-users', JSON.stringify(users));

    // Reset full state for new user
    state = {
        tasks: [],
        totalXp: 0,
        coins: 0,
        coinsResetV2: true, // Mark already reset for new users
        currentLevel: 1,
        dailyStreak: 0,
        lastActiveDate: new Date().toISOString().split("T")[0],
        weeklyHistory: [],
        userName: username,
        referralCode: generateReferralCode(),
        ownedItems: [],
        selectedAvatar: null
    };

    // Process referral code
    let hasReferral = false;
    if (referral && referral.startsWith('YO-') && referral.length >= 6) {
        state.totalXp += 100;
        state.currentLevel = Math.floor(state.totalXp / XP_PER_LEVEL) + 1;
        state.referredBy = referral;
        hasReferral = true;

        // Also reward the referrer with +100 XP
        for (const uKey of Object.keys(users)) {
            if (uKey === username.toLowerCase()) continue;
            const referrerState = localStorage.getItem('yoroutine-state-' + uKey);
            if (referrerState) {
                const rState = JSON.parse(referrerState);
                if (rState.referralCode === referral) {
                    rState.totalXp += 100;
                    rState.currentLevel = Math.floor(rState.totalXp / XP_PER_LEVEL) + 1;
                    localStorage.setItem('yoroutine-state-' + uKey, JSON.stringify(rState));
                    break;
                }
            }
        }
    }

    saveState();
    localStorage.setItem('yoroutine-loggedin', username.toLowerCase());

    showApp();
    if (hasReferral) {
        setTimeout(() => showCelebration(), 500);
    } else {
        setTimeout(() => showNamePromptIfNeeded(), 300);
    }
}

function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
        showAuthError('login-error', 'Please enter username and password.');
        return;
    }

    const users = JSON.parse(localStorage.getItem('yoroutine-users') || '{}');
    const user = users[username.toLowerCase()];

    if (!user) {
        showAuthError('login-error', 'Account not found. Sign up first.');
        return;
    }

    if (user.password !== password) {
        showAuthError('login-error', 'Incorrect password.');
        return;
    }

    // Load user-specific state
    const savedState = localStorage.getItem('yoroutine-state-' + username.toLowerCase());
    if (savedState) {
        state = JSON.parse(savedState);
        if (!state.tasks) state.tasks = [];
    }

    // Always set username — prefer stored display name (case-preserved)
    state.userName = user.displayName || username;

    localStorage.setItem('yoroutine-loggedin', username.toLowerCase());
    saveState();
    showApp();
    setTimeout(() => showNamePromptIfNeeded(), 300);
}

function showApp() {
    document.getElementById('onboarding-screen').classList.add('hidden');
    document.querySelector('.header').style.display = '';
    document.querySelector('.layout-container').style.display = '';
    document.querySelector('.mobile-nav').style.display = '';
    lucide.createIcons();
    updateUI();
}

function logout() {
    localStorage.removeItem('yoroutine-loggedin');
    // Show auth screen, hide app
    document.getElementById('onboarding-screen').classList.remove('hidden');
    document.querySelector('.header').style.display = 'none';
    document.querySelector('.layout-container').style.display = 'none';
    document.querySelector('.mobile-nav').style.display = 'none';
    switchAuthTab('login');
    lucide.createIcons();
}

function showCelebration() {
    const modal = document.getElementById('celebration-modal');
    modal.classList.remove('hidden');

    // Create confetti particles
    const burst = document.getElementById('confetti-burst');
    burst.innerHTML = '';
    const colors = ['#0ce473', '#f97316', '#3b82f6', '#eab308', '#ec4899', '#8b5cf6'];
    for (let i = 0; i < 60; i++) {
        const particle = document.createElement('div');
        particle.className = 'confetti-particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        particle.style.animationDelay = Math.random() * 0.5 + 's';
        particle.style.animationDuration = (1.5 + Math.random() * 2) + 's';
        burst.appendChild(particle);
    }
}

function closeCelebration() {
    document.getElementById('celebration-modal').classList.add('hidden');
    // After celebration, ask for name if not set
    setTimeout(() => showNamePromptIfNeeded(), 300);
}

function showNamePromptIfNeeded() {
    if (!state.hasSetName) {
        const modal = document.getElementById('name-prompt-modal');
        if (modal) {
            modal.classList.remove('hidden');
            lucide.createIcons();
            // Pre-fill with current username
            const input = document.getElementById('name-prompt-input');
            if (input) input.focus();
        }
    }
}

function saveNamePrompt() {
    const input = document.getElementById('name-prompt-input');
    const name = input ? input.value.trim() : '';

    if (!name || name.length < 1) {
        input.style.borderColor = '#ef4444';
        input.placeholder = 'Please enter your name!';
        return;
    }

    // Save display name to state
    state.userName = name;
    state.hasSetName = true;
    saveState();

    // Also update the users record with the display name
    const loggedIn = localStorage.getItem('yoroutine-loggedin');
    if (loggedIn) {
        const users = JSON.parse(localStorage.getItem('yoroutine-users') || '{}');
        if (users[loggedIn]) {
            users[loggedIn].displayName = name;
            localStorage.setItem('yoroutine-users', JSON.stringify(users));
        }
    }

    // Hide modal and update UI
    document.getElementById('name-prompt-modal').classList.add('hidden');
    updateUI();
}

function copyReferralCode() {
    const code = state.referralCode;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.querySelector('.referral-copy-btn');
        btn.innerHTML = '<i data-lucide="check"></i> Copied!';
        lucide.createIcons();
        setTimeout(() => {
            btn.innerHTML = '<i data-lucide="copy"></i> Copy';
            lucide.createIcons();
        }, 2000);
    });
}

function shareReferralCode() {
    const code = state.referralCode;
    const text = `Join me on YoRoutine! Use my referral code ${code} to earn +100 XP bonus! 🔥`;
    if (navigator.share) {
        navigator.share({ title: 'YoRoutine', text });
    } else {
        navigator.clipboard.writeText(text);
        alert('Invite message copied to clipboard!');
    }
}

function applySavedTheme() {
    const saved = localStorage.getItem('yoroutine-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('yoroutine-theme', next);
    updateThemeIcon(next);
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
        lucide.createIcons();
    }
}

function updateUI() {
    renderHeaderStats();
    renderSidebarStats();
    renderTasks();
    renderWeeklyChart();
    renderAchievements();
    renderProfileView();
    renderShop();
    updateNavState();
}

// Stats & Progress Bars
const MOTIVATIONAL_QUOTES = [
    "Discipline is the bridge between goals and results.",
    "Small daily improvements lead to stunning results.",
    "Your only limit is the one you set for yourself.",
    "Consistency beats intensity every single time.",
    "One step at a time, one quest at a time. 🔥",
    "You don't have to be extreme, just consistent.",
    "Today's effort is tomorrow's reward.",
    "Progress, not perfection.",
    "The secret of getting ahead is getting started.",
    "Champions are made when nobody is watching.",
    "Don't count the days, make the days count.",
    "Dream big. Start small. Act now.",
];

function renderHeaderStats() {
    document.getElementById("header-streak").innerText = state.dailyStreak;
    const coinsEl = document.getElementById("header-coins");
    if (coinsEl) coinsEl.innerText = state.coins || 0;
    const greeting = document.getElementById("mobile-greeting");
    if (greeting) greeting.innerText = `Hi, ${state.userName} 👋`;
    const quoteEl = document.getElementById("daily-quote");
    if (quoteEl) {
        const dayIdx = new Date().getDate() % MOTIVATIONAL_QUOTES.length;
        quoteEl.innerText = MOTIVATIONAL_QUOTES[dayIdx];
    }
}

function renderSidebarStats() {
    state.currentLevel = Math.floor(state.totalXp / XP_PER_LEVEL) + 1;
    const currentLevelXp = state.totalXp % XP_PER_LEVEL;
    const progressPercent = Math.min(100, (currentLevelXp / XP_PER_LEVEL) * 100);

    // Sidebar
    const sbLevel = document.getElementById("sidebar-level");
    const sbName = document.getElementById("sidebar-name");
    const sbXp = document.getElementById("sidebar-xp");
    const sbProgFill = document.getElementById("sidebar-progress-fill");
    const sbStreakLg = document.getElementById("sidebar-streak-lg");

    if (sbLevel) sbLevel.innerText = `Lvl ${state.currentLevel}`;
    if (sbName) sbName.innerText = state.userName;
    if (sbXp) sbXp.innerText = currentLevelXp;
    if (sbProgFill) sbProgFill.style.width = `${progressPercent}%`;
    if (sbStreakLg) sbStreakLg.innerText = state.dailyStreak;
}

// Main Task List
function sortTasks(tasks) {
    return [...tasks].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return a.time.localeCompare(b.time);
    });
}

// Format time to 12h AM/PM
function formatTime12h(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return timeStr; // For "Anytime" or "10m"
    let [hours, minutes] = timeStr.split(':');
    hours = parseInt(hours);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    return `${hours}:${minutes} ${ampm}`;
}

function renderTasks() {
    const list = document.getElementById("task-list");
    if (!list) return;

    list.innerHTML = "";

    // Show empty state for new users with no quests
    if (state.tasks.length === 0) {
        list.innerHTML = `
            <div class="empty-quests">
                <div class="empty-quests-icon"><i data-lucide="scroll-text"></i></div>
                <h3>Your Quest Board is Empty!</h3>
                <p>Start building your daily routine in 3 easy steps:</p>
                <div class="onboarding-steps">
                    <div class="onboarding-step">
                        <div class="step-number">1</div>
                        <div class="step-text">Tap <strong>"New Quest"</strong> below to create a task</div>
                    </div>
                    <div class="onboarding-step">
                        <div class="step-number">2</div>
                        <div class="step-text">Set a <strong>title, category & time</strong> for your quest</div>
                    </div>
                    <div class="onboarding-step">
                        <div class="step-number">3</div>
                        <div class="step-text">Complete quests daily to <strong>earn XP & level up!</strong></div>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="openNewQuestModal()" style="padding: 0.85rem 2rem; font-size: 1rem;">
                    <i data-lucide="plus"></i> Create Your First Quest
                </button>
            </div>`;
        lucide.createIcons();
        return;
    }

    const sortedTasks = sortTasks(state.tasks);

    sortedTasks.forEach(task => {
        // Handle legacy tasks without tags
        const tag = task.tag || "DAILY";
        const tagColor = task.tagColor || "#10b981";
        const desc = task.desc || "A routine daily task to complete on your journey.";

        const div = document.createElement("div");
        div.className = `task-card ${task.completed ? "completed" : ""}`;

        // Let the whole card be clickable to toggle, EXCEPT the delete button
        div.onclick = (e) => {
            if (!e.target.closest('.delete-task-btn')) {
                toggleTask(task.id);
            }
        };

        // Top-Right Tag HTML with Dot
        let tagHtml = `
            <div class="task-tag" style="color: ${tagColor};">
                <span class="tag-dot" style="background-color: ${tagColor};"></span>
                ${tag}
            </div>
        `;

        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: flex-start;">
                ${tagHtml}
                <button class="btn-icon delete-task-btn" onclick="deleteTask('${task.id}')" title="Delete Quest"><i data-lucide="trash-2" style="width:16px; height:16px; color: var(--muted-text);"></i></button>
            </div>
            
            <h3 class="task-title">${task.title}</h3>
            <p class="task-desc">${desc}</p>
            
            <div class="task-meta">
                <span class="task-time"><i data-lucide="clock" style="width:14px; height:14px;"></i> ${formatTime12h(task.time)}</span>
                <span class="task-xp-row">
                    <span class="task-xp-val">${task.xp} XP</span>
                    ${task.xpMultiplier ? `<span class="task-xp-mult">${task.xpMultiplier}</span>` : '<span class="task-xp-mult">x1.0</span>'}
                </span>
            </div>
        `;
        list.appendChild(div);
    });

    // Re-initialize Lucide icons for the newly injected HTML
    lucide.createIcons();
}

function toggleTask(id) {
    const taskIndex = state.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return;

    const completed = !state.tasks[taskIndex].completed;
    state.tasks[taskIndex].completed = completed;

    if (completed) {
        state.totalXp += state.tasks[taskIndex].xp;
        state.coins = (state.coins || 0) + 10; // +10 coins per task
        if (state.dailyStreak === 0) state.dailyStreak = 1;
    } else {
        state.totalXp = Math.max(0, state.totalXp - state.tasks[taskIndex].xp);
        state.coins = Math.max(0, (state.coins || 0) - 10);
    }

    saveState();
    updateUI();
}

function deleteTask(id) {
    // Optional: If you want to refund/deduct XP when a completed task is deleted, do it here.
    // For now, we will just remove it.
    state.tasks = state.tasks.filter(t => t.id !== id);
    saveState();
    updateUI();
}

// Weekly Chart (Activity Log Grid)
function getTimePeriod(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return 'PM'; // default for durations like '10m'
    const hour = parseInt(timeStr.split(':')[0]);
    if (hour < 12) return 'AM';
    if (hour < 17) return 'PM';
    return 'Eve';
}

function renderWeeklyChart() {
    const chart = document.getElementById("weekly-chart");
    if (!chart) return;
    chart.innerHTML = "";

    const todayStr = getTodayString();
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const periods = ['AM', 'PM', 'Eve'];

    // Build 7 days of data
    const daysData = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const jsDay = d.getDay(); // 0=Sun
        // Convert to Mon=0 format for label mapping
        const labelIdx = jsDay === 0 ? 6 : jsDay - 1;

        let periodCounts = { AM: 0, PM: 0, Eve: 0 };

        if (dateStr === todayStr) {
            // Live data from current tasks
            state.tasks.forEach(t => {
                if (t.completed) {
                    const p = getTimePeriod(t.time);
                    periodCounts[p]++;
                }
            });
        } else {
            // From history — we don't have per-period data so distribute evenly
            const historyDay = state.weeklyHistory.find(h => h.date === dateStr);
            if (historyDay && historyDay.tasksCompleted > 0) {
                const total = historyDay.tasksCompleted;
                periodCounts.AM = Math.ceil(total / 3);
                periodCounts.PM = Math.ceil(total / 3);
                periodCounts.Eve = total - periodCounts.AM - periodCounts.PM;
            }
        }
        daysData.push({ dateStr, label: dayLabels[labelIdx], periodCounts });
    }

    // Build the grid table
    // Header row
    let headerHtml = '<div class="alog-cell alog-corner"></div>';
    daysData.forEach(d => {
        headerHtml += `<div class="alog-cell alog-day-label">${d.label}</div>`;
    });

    let gridHtml = `<div class="alog-row">${headerHtml}</div>`;

    // One row per period
    periods.forEach(period => {
        let rowHtml = `<div class="alog-cell alog-period-label">${period}</div>`;
        daysData.forEach(d => {
            const count = d.periodCounts[period];
            let lvl = 'lv-0';
            if (count >= 4) lvl = 'lv-4';
            else if (count >= 3) lvl = 'lv-3';
            else if (count >= 2) lvl = 'lv-2';
            else if (count >= 1) lvl = 'lv-1';

            rowHtml += `<div class="alog-cell"><div class="alog-box ${lvl}" title="${count} tasks (${period})"></div></div>`;
        });
        gridHtml += `<div class="alog-row">${rowHtml}</div>`;
    });

    chart.innerHTML = gridHtml;
}



// Achievements
const ACHIEVEMENT_DATA = [
    { id: "first", title: "Novice Initiated", desc: "Earn your first 100 XP", icon: "target", condition: () => state.totalXp >= 100 },
    { id: "xp500", title: "Rising Star", desc: "Earn 500 XP total", icon: "star", condition: () => state.totalXp >= 500 },
    { id: "xp1k", title: "XP Hoarder", desc: "Gather 1,000 Total XP", icon: "zap", condition: () => state.totalXp >= 1000 },
    { id: "xp5k", title: "XP Legend", desc: "Accumulate 5,000 XP", icon: "flame", condition: () => state.totalXp >= 5000 },
    { id: "streak3", title: "Consistency", desc: "Maintain a 3-day streak", icon: "activity", condition: () => state.dailyStreak >= 3 },
    { id: "streak7", title: "Flow State", desc: "Maintain a 7-day streak", icon: "trending-up", condition: () => state.dailyStreak >= 7 },
    { id: "streak14", title: "Unstoppable", desc: "Maintain a 14-day streak", icon: "shield", condition: () => state.dailyStreak >= 14 },
    { id: "streak30", title: "Iron Will", desc: "Maintain a 30-day streak", icon: "lock", condition: () => state.dailyStreak >= 30 },
    { id: "lvl5", title: "Adept", desc: "Reach Level 5", icon: "award", condition: () => state.currentLevel >= 5 },
    { id: "lvl10", title: "Master Wizard", desc: "Reach Level 10", icon: "crown", condition: () => state.currentLevel >= 10 },
    { id: "lvl20", title: "Grandmaster", desc: "Reach Level 20", icon: "gem", condition: () => state.currentLevel >= 20 },
    { id: "tasks10", title: "Quest Collector", desc: "Have 10+ quests on your board", icon: "list", condition: () => state.tasks.length >= 10 },
];

function renderAchievements() {
    const grid = document.getElementById("achievements-grid");
    if (!grid) return;
    grid.innerHTML = "";

    // Add level & XP header
    const header = document.createElement("div");
    header.className = "ach-stats-header";
    header.innerHTML = `
        <div class="ach-stat"><i data-lucide="trophy" style="width:18px; height:18px; color:var(--accent);"></i> Level ${state.currentLevel}</div>
        <div class="ach-stat"><i data-lucide="zap" style="width:18px; height:18px; color:#eab308;"></i> ${state.totalXp} XP</div>
    `;
    grid.appendChild(header);

    ACHIEVEMENT_DATA.forEach(ach => {
        const unlocked = ach.condition();

        const card = document.createElement("div");
        card.className = `ach-card-minimal ${unlocked ? "unlocked" : "locked"}`;

        let iconColor = unlocked ? "var(--accent)" : "var(--muted-text)";

        card.innerHTML = `
            <div class="ach-icon-min">
                <i data-lucide="${ach.icon}" style="width:24px; height:24px; color:${iconColor}"></i>
            </div>
            <div class="ach-info">
                <h3 class="ach-title-min">${ach.title}</h3>
                <p class="ach-desc-min">${ach.desc}</p>
            </div>
            ${unlocked ? '<div class="ach-check"><i data-lucide="check-circle" style="width:20px; height:20px; color:var(--accent)"></i></div>' : ''}
        `;
        grid.appendChild(card);
    });
    lucide.createIcons();
}

// Profile settings & Consistency
function renderProfileView() {
    const input = document.getElementById("nameInput");
    const lvl = document.getElementById("profile-level");
    const xp = document.getElementById("profile-total-xp");
    const profileProgress = document.getElementById("profile-progress-fill");
    const profileXpLabel = document.getElementById("profile-xp-label");

    if (input) input.value = state.userName;
    if (lvl) lvl.innerText = `Lvl ${state.currentLevel}`;
    if (xp) xp.innerText = state.totalXp;

    // Populate streak & today done
    const streakEl = document.getElementById("profile-streak-val");
    const doneEl = document.getElementById("profile-tasks-done");
    if (streakEl) streakEl.innerText = state.dailyStreak;
    if (doneEl) doneEl.innerText = state.tasks.filter(t => t.completed).length;

    // Update profile level progress bar
    const currentLevelXp = state.totalXp % XP_PER_LEVEL;
    const progressPercent = Math.min(100, (currentLevelXp / XP_PER_LEVEL) * 100);
    if (profileProgress) profileProgress.style.width = `${progressPercent}%`;
    if (profileXpLabel) profileXpLabel.innerText = `${currentLevelXp} / ${XP_PER_LEVEL} XP`;

    renderContributionGraph();

    // Show referral code
    const codeEl = document.getElementById('my-referral-code');
    if (codeEl) codeEl.innerText = state.referralCode || 'YO-XXXX';

    // Apply avatar ring based on selection
    applyAvatarRing();
}

function applyAvatarRing() {
    const wrapper = document.getElementById('profile-avatar-wrapper');
    const headerWrapper = document.querySelector('.profile-link');
    const sidebarWrapper = document.querySelector('.avatar-lg-wrapper');
    const ring = state.selectedRing || 'none';
    const allRings = ['ring-green', 'ring-purple', 'ring-gold', 'ring-fire', 'ring-heart', 'ring-butterfly', 'ring-star', 'ring-crown', 'ring-flame', 'ring-ocean', 'ring-galaxy', 'ring-rainbow', 'ring-neon', 'ring-thunder'];

    // Apply ring classes to all avatar wrappers (parent elements)
    [wrapper, headerWrapper, sidebarWrapper].forEach(el => {
        if (!el) return;
        allRings.forEach(r => el.classList.remove(r));
        if (ring !== 'none') el.classList.add(ring);
    });

    // Apply custom avatar icon/image
    const avatarSrc = state.selectedAvatar || null;
    const profileAvatarEl = document.querySelector('.avatar-xl');
    const headerAvatarEl = document.querySelector('#header-avatar');
    const sidebarAvatarEl = document.querySelector('.avatar-lg');
    [profileAvatarEl, headerAvatarEl, sidebarAvatarEl].forEach(el => {
        if (!el) return;
        if (avatarSrc) {
            const size = el.classList.contains('avatar-xl') ? '100%' : '100%';
            el.innerHTML = `<img src="${avatarSrc}" alt="Avatar" style="width:${size};height:${size};object-fit:cover;border-radius:50%;">`;
        } else {
            el.innerHTML = '<i data-lucide="user"></i>';
        }
    });
    lucide.createIcons();

    // Update ring picker unlocked/locked states
    updateRingPicker();
}

function updateRingPicker() {
    const options = document.querySelectorAll('.ring-picker-option[data-level]');
    options.forEach(opt => {
        const reqLevel = parseInt(opt.getAttribute('data-level'));
        if (state.currentLevel >= reqLevel) {
            opt.classList.remove('locked');
        } else {
            opt.classList.add('locked');
        }
    });

    // Highlight selected ring
    document.querySelectorAll('.ring-picker-option').forEach(opt => {
        const ringVal = opt.getAttribute('data-ring');
        opt.classList.toggle('selected', ringVal === (state.selectedRing || 'none'));
    });
}

function toggleRingPicker() {
    const picker = document.getElementById('ring-picker');
    picker.classList.toggle('hidden');
    if (!picker.classList.contains('hidden')) {
        updateRingPicker();
    }
}

function selectRing(ring) {
    // Check if locked
    if (ring !== 'none') {
        const reqLevels = { 'ring-green': 2, 'ring-purple': 3, 'ring-gold': 5, 'ring-fire': 10 };
        if (state.currentLevel < (reqLevels[ring] || 999)) {
            return; // Still locked
        }
    }
    state.selectedRing = ring;
    saveState();
    applyAvatarRing();
    document.getElementById('ring-picker').classList.add('hidden');
}

function renderContributionGraph() {
    const container = document.getElementById("contribution-grid");
    if (!container) return;

    container.innerHTML = "";

    const todayStr = getTodayString();
    const today = new Date();

    // Find start month: earliest history entry or current month
    let startDate;
    if (state.weeklyHistory.length > 0) {
        const earliest = state.weeklyHistory.reduce((a, b) => a.date < b.date ? a : b);
        startDate = new Date(earliest.date);
        startDate.setDate(1); // go to 1st of that month
    } else {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    // Build months from startDate to next month (next month is dimmed)
    const cursor = new Date(startDate);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    while (cursor <= nextMonth) {
        const year = cursor.getFullYear();
        const month = cursor.getMonth();
        const isFutureMonth = (year > today.getFullYear()) || (year === today.getFullYear() && month > today.getMonth());
        const monthName = cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Month wrapper (label + grid together)
        const monthBlock = document.createElement("div");
        monthBlock.className = `contrib-month-block${isFutureMonth ? ' dimmed' : ''}`;

        // Month label
        const label = document.createElement("div");
        label.className = "contrib-month-label";
        label.innerText = monthName;
        monthBlock.appendChild(label);

        // Grid of boxes for this month
        const monthGrid = document.createElement("div");
        monthGrid.className = "contrib-month-grid";

        // Add spacer boxes so day 1 aligns to the correct weekday column
        const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0=Sun
        const offset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; // Mon=0
        for (let s = 0; s < offset; s++) {
            const spacer = document.createElement("div");
            spacer.className = "contrib-box spacer";
            monthGrid.appendChild(spacer);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(year, month, day);
            if (d > today) {
                // Future day — render empty placeholder
                const emptyBox = document.createElement("div");
                emptyBox.className = "contrib-box future";
                monthGrid.appendChild(emptyBox);
                continue;
            }

            const dateStr = formatLocalDate(d);

            let completedCount = 0;
            let totalTasks = state.tasks.length;
            let tooltipText = "No activity";

            if (dateStr === todayStr) {
                completedCount = state.tasks.filter(t => t.completed).length;
            } else {
                const historyDay = state.weeklyHistory.find(h => h.date === dateStr);
                if (historyDay) {
                    completedCount = historyDay.tasksCompleted;
                    totalTasks = historyDay.totalTasks || totalTasks;
                }
            }

            if (completedCount > 0) tooltipText = `${completedCount}/${totalTasks} quests on ${dateStr}`;

            // Intensity based on completion ratio
            const ratio = totalTasks > 0 ? completedCount / totalTasks : 0;
            let intensityClass = "level-0";
            if (ratio >= 1) intensityClass = "level-4";
            else if (ratio >= 0.75) intensityClass = "level-3";
            else if (ratio >= 0.4) intensityClass = "level-2";
            else if (ratio > 0) intensityClass = "level-1";

            const box = document.createElement("div");
            box.className = `contrib-box ${intensityClass}`;
            box.title = tooltipText;
            monthGrid.appendChild(box);
        }

        monthBlock.appendChild(monthGrid);
        container.appendChild(monthBlock);

        // Move to next month
        cursor.setMonth(cursor.getMonth() + 1);
        cursor.setDate(1);

        // Stop after next month
        if (cursor > nextMonth) {
            break;
        }
    }

    // Scroll to the right to show recent month
    setTimeout(() => {
        const wrapper = document.querySelector('.contribution-wrapper');
        if (wrapper) wrapper.scrollLeft = wrapper.scrollWidth;
    }, 100);
}

function saveProfile() {
    const input = document.getElementById("nameInput");
    const btn = document.getElementById("saveProfileBtn");

    if (input) {
        state.userName = input.value || "Productivity Master";
        saveState();
        updateUI();

        // Button feedback
        btn.innerHTML = `<i data-lucide="check"></i> Saved Successfully!`;
        btn.style.backgroundColor = "#22c55e";
        lucide.createIcons();

        setTimeout(() => {
            btn.innerHTML = `<i data-lucide="save"></i> Save & Return`;
            btn.style.backgroundColor = "var(--accent)";
            lucide.createIcons();
            switchView('dashboard');
        }, 1500);
    }
}

// === NAVIGATION ===
function switchView(viewId) {
    // Check if Shop is locked
    if (viewId === 'shop' && state.currentLevel < 2) {
        showToast("Shop unlocks at Level 2! 🔒", "#ef4444");
        return;
    }

    // Hide all views
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

    // Show target view
    const target = document.getElementById(`view-${viewId}`);
    if (target) target.classList.remove('hidden');

    // Update Desktop Nav
    document.querySelectorAll('.desktop-nav .nav-link').forEach(el => el.classList.remove('active'));
    // Simple mapping for desktop nav matching
    if (viewId === 'dashboard' || viewId === 'achievements') {
        const idx = viewId === 'dashboard' ? 0 : 1;
        const links = document.querySelectorAll('.desktop-nav .nav-link');
        if (links[idx]) links[idx].classList.add('active');
    }

    // Update Mobile Nav
    document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));
    const mobileTab = document.getElementById(`nav-${viewId}`);
    if (mobileTab) mobileTab.classList.add('active');
}

// === MODALS ===
function openNewQuestModal() {
    document.getElementById("newQuestModal").classList.remove("hidden");
}

function closeNewQuestModal() {
    document.getElementById("newQuestModal").classList.add("hidden");
    document.getElementById("questTitle").value = "";
    document.getElementById("questTime").value = "";
}

function addNewQuest() {
    const title = document.getElementById("questTitle").value;
    const desc = document.getElementById("questDesc").value;
    const time = document.getElementById("questTime").value;
    const xp = Math.min(40, Math.max(5, parseInt(document.getElementById("questXp").value) || 25));

    const tagSelect = document.getElementById("questTag");
    const tag = tagSelect.value;
    // Get color from inline style
    const tagColor = tagSelect.options[tagSelect.selectedIndex].style.color;

    if (!title) {
        alert("Please enter a quest title.");
        return;
    }

    const newTask = {
        id: "custom-" + Date.now(),
        tag,
        tagColor,
        title,
        desc: desc || "Self-assigned growth quest.",
        time: time || "Anytime",
        xp,
        xpMultiplier: "x1.0",
        completed: false
    };

    state.tasks.push(newTask);
    saveState();
    updateUI();
    closeNewQuestModal();
}

// === SHOP SYSTEM ===
const SHOP_ITEMS = [
    // Rings with elements
    { id: 'ring-heart', type: 'ring', name: 'Heart Ring', icon: '💖', desc: 'Surrounded by love', price: 50, ringClass: 'ring-heart' },
    { id: 'ring-butterfly', type: 'ring', name: 'Butterfly Ring', icon: '🦋', desc: 'Graceful & elegant', price: 80, ringClass: 'ring-butterfly' },
    { id: 'ring-star', type: 'ring', name: 'Star Ring', icon: '⭐', desc: 'Shine like the stars', price: 100, ringClass: 'ring-star' },
    { id: 'ring-crown', type: 'ring', name: 'Crown Ring', icon: '👑', desc: 'Fit for royalty', price: 150, ringClass: 'ring-crown' },
    { id: 'ring-flame', type: 'ring', name: 'Flame Ring', icon: '\ud83d\udd25', desc: 'Unstoppable energy', price: 200, ringClass: 'ring-flame' },
    // Avatar Icons (image-based)
    { id: 'avatar-ninja', type: 'avatar', name: 'Ninja', img: 'avatars/ninja.png', desc: 'Silent & deadly', price: 30 },
    { id: 'avatar-wizard', type: 'avatar', name: 'Wizard', img: 'avatars/wizard.png', desc: 'Master of magic', price: 30 },
    { id: 'avatar-astronaut', type: 'avatar', name: 'Astronaut', img: 'avatars/astronaut.png', desc: 'Beyond the stars', price: 50 },
    { id: 'avatar-dragon', type: 'avatar', name: 'Dragon', img: 'avatars/dragon.png', desc: 'Legendary beast', price: 80 },
    { id: 'avatar-robot', type: 'avatar', name: 'Robot', img: 'avatars/robot.png', desc: 'Future warrior', price: 50 },
    { id: 'avatar-phoenix', type: 'avatar', name: 'Phoenix', img: 'avatars/phoenix.png', desc: 'Rise from ashes', price: 100 },
    { id: 'avatar-wolf', type: 'avatar', name: 'Wolf', img: 'avatars/wolf.png', desc: 'Lone hunter', price: 60 },
    { id: 'avatar-lion', type: 'avatar', name: 'Lion', img: 'avatars/lion.png', desc: 'King of the jungle', price: 70 },
];

// More shop items - appended dynamically
SHOP_ITEMS.push(
    { id: 'ring-ocean', type: 'ring', name: 'Ocean Ring', icon: '\ud83c\udf0a', desc: 'Deep sea power', price: 120, ringClass: 'ring-ocean' },
    { id: 'ring-galaxy', type: 'ring', name: 'Galaxy Ring', icon: '\ud83c\udf0c', desc: 'Cosmic aura', price: 250, ringClass: 'ring-galaxy' },
    { id: 'ring-rainbow', type: 'ring', name: 'Rainbow Ring', icon: '\ud83c\udf08', desc: 'All colors unite', price: 180, ringClass: 'ring-rainbow' },
    { id: 'ring-neon', type: 'ring', name: 'Neon Ring', icon: '\ud83d\udca0', desc: 'Electric vibes', price: 160, ringClass: 'ring-neon' },
    { id: 'ring-thunder', type: 'ring', name: 'Thunder Ring', icon: '\u26a1', desc: 'Charged with power', price: 220, ringClass: 'ring-thunder' },
    { id: 'avatar-cat', type: 'avatar', name: 'Cat', img: 'avatars/cat.png', desc: 'Cool & mysterious', price: 25 },
    { id: 'avatar-panda', type: 'avatar', name: 'Panda', img: 'avatars/panda.png', desc: 'Chill vibes only', price: 40 },
    { id: 'avatar-eagle', type: 'avatar', name: 'Eagle', img: 'avatars/eagle.png', desc: 'Soar above all', price: 90 },
    { id: 'avatar-ghost', type: 'avatar', name: 'Ghost', img: 'avatars/ghost.png', desc: 'Invisible mode', price: 35 },
    { id: 'avatar-alien', type: 'avatar', name: 'Alien', img: 'avatars/alien.png', desc: 'Out of this world', price: 55 }
);

function renderShop() {
    const container = document.getElementById('shop-items-container');
    if (!container) return;
    container.innerHTML = '';

    const balanceEl = document.getElementById('shop-coin-balance');
    if (balanceEl) balanceEl.innerText = state.coins || 0;

    const owned = state.ownedItems || [];
    const rings = SHOP_ITEMS.filter(i => i.type === 'ring');
    const avatars = SHOP_ITEMS.filter(i => i.type === 'avatar');

    function renderSection(title, items) {
        const section = document.createElement('div');
        section.className = 'shop-section';
        section.innerHTML = `<h3 class="shop-section-title">${title}</h3>`;

        const grid = document.createElement('div');
        grid.className = 'shop-grid';

        items.forEach(item => {
            const isOwned = owned.includes(item.id);
            const isEquipped = (item.type === 'ring' && state.selectedRing === item.ringClass) ||
                (item.type === 'avatar' && state.selectedAvatar === item.img);
            const canAfford = (state.coins || 0) >= item.price;

            const card = document.createElement('div');
            card.className = `shop-item-card ${isOwned ? 'owned' : ''} ${isEquipped ? 'equipped' : ''}`;

            let btnHtml = '';
            if (isEquipped) {
                btnHtml = `<button class="shop-btn equipped-btn" disabled><i data-lucide="check-circle" style="width:14px;height:14px;"></i> Equipped</button>`;
            } else if (isOwned) {
                btnHtml = `<button class="shop-btn equip-btn" onclick="equipShopItem('${item.id}')"><i data-lucide="shirt" style="width:14px;height:14px;"></i> Equip</button>`;
            } else {
                btnHtml = `<button class="shop-btn buy-btn ${!canAfford ? 'cant-afford' : ''}" onclick="buyShopItem('${item.id}')" ${!canAfford ? 'disabled' : ''}><i data-lucide="coins" style="width:14px;height:14px;"></i> ${item.price}</button>`;
            }

            const iconHtml = item.img ? `<img src="${item.img}" alt="${item.name}" class="shop-avatar-img">` : item.icon;
            card.innerHTML = `
                <div class="shop-item-icon">${iconHtml}</div>
                <div class="shop-item-name">${item.name}</div>
                <div class="shop-item-desc">${item.desc}</div>
                ${btnHtml}
            `;
            grid.appendChild(card);
        });

        section.appendChild(grid);
        container.appendChild(section);
    }

    renderSection('\ud83c\udf1f Profile Rings', rings);
    renderSection('\ud83c\udfad Avatar Icons', avatars);
    refreshIcons();
}

function buyShopItem(itemId) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;
    if (!state.ownedItems) state.ownedItems = [];
    if (state.ownedItems.includes(itemId)) return;

    const coins = state.coins || 0;
    if (coins < item.price) return;

    state.coins = coins - item.price;
    state.ownedItems.push(itemId);

    // Auto-equip on purchase
    if (item.type === 'ring') {
        state.selectedRing = item.ringClass;
    } else if (item.type === 'avatar') {
        state.selectedAvatar = item.img;
    }

    saveState();
    updateUI();
}

function equipShopItem(itemId) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;
    if (!state.ownedItems || !state.ownedItems.includes(itemId)) return;

    if (item.type === 'ring') {
        state.selectedRing = item.ringClass;
    } else if (item.type === 'avatar') {
        state.selectedAvatar = item.img;
    }

    saveState();
    updateUI();
}

function updateNavState() {
    const isLocked = state.currentLevel < 2;

    // Desktop Nav
    const shopNavLink = document.querySelector('.desktop-nav .nav-link[onclick*="shop"]');
    if (shopNavLink) {
        shopNavLink.classList.toggle('locked', isLocked);
        if (isLocked) {
            shopNavLink.title = "Unlocks at Level 2";
        } else {
            shopNavLink.title = "Visit the Shop";
        }
    }

    // Mobile Nav
    const shopMobileItem = document.getElementById('nav-shop');
    if (shopMobileItem) {
        shopMobileItem.classList.toggle('locked', isLocked);
    }
}

function showToast(message, color = "var(--accent)") {
    const toast = document.createElement("div");
    toast.className = "toast-notification";
    toast.style.backgroundColor = color;
    toast.innerHTML = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("show");
    }, 100);

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

function refreshIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

// === PWA INSTALL LOGIC ===
let deferredPrompt;
const pwaBanner = document.getElementById('pwa-install-banner');
const installBtn = document.getElementById('pwa-install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;

    // Show banner immediately when event fires
    showPwaBanner();
});

function checkPwaAffordance() {
    // If already in standalone mode, don't show anything
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        return;
    }

    // Always show sidebar link if not installed
    const sidebarInstallLink = document.getElementById('sidebar-install-link');
    if (sidebarInstallLink) sidebarInstallLink.style.display = 'flex';

    const isDismissed = localStorage.getItem('pwa-install-dismissed');
    const lastDismissed = localStorage.getItem('pwa-install-last-dismissed');
    const now = Date.now();

    // Show if not dismissed or if 24h passed
    if (!isDismissed || (lastDismissed && (now - parseInt(lastDismissed) > 86400000))) {
        showPwaBanner();
    }
}

function showPwaBanner() {
    if (!pwaBanner) return;
    pwaBanner.classList.remove('hidden');
    setTimeout(() => {
        pwaBanner.classList.add('show');
    }, 100);
}

function dismissInstallPrompt() {
    if (!pwaBanner) return;
    pwaBanner.classList.remove('show');
    localStorage.setItem('pwa-install-dismissed', 'true');
    localStorage.setItem('pwa-install-last-dismissed', Date.now().toString());
    setTimeout(() => {
        pwaBanner.classList.add('hidden');
    }, 500);
}

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) {
            // Fallback for when the event hasn't fired (or iOS)
            showToast("Open your browser menu and select 'Add to Home Screen'! 📲", "var(--accent)");
            return;
        }

        // Show the native install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);

        // We've used the prompt, and can't use it again, throw it away
        deferredPrompt = null;

        // Hide our banner
        dismissInstallPrompt();
    });
}

window.addEventListener('appinstalled', (event) => {
    console.log('👍', 'appinstalled', event);
    // Hide the banner if it was showing
    if (pwaBanner) {
        pwaBanner.classList.remove('show');
        setTimeout(() => {
            pwaBanner.classList.add('hidden');
        }, 500);
    }
    showToast("YoRoutine Installed! 🚀", "var(--accent)");
});

// Start application
document.addEventListener("DOMContentLoaded", init);
