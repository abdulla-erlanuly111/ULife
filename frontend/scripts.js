const BASE_URL = "";

function getToken() {
  return localStorage.getItem("ulifeToken");
}

function getCurrentUserId() {
  const token = getToken();
  if (!token) return "guest";

  try {
    return JSON.parse(atob(token.split(".")[1])).id || "guest";
  } catch {
    return "guest";
  }
}

function getUserStorageKey(key) {
  return `${key}:${getCurrentUserId()}`;
}

function clearLegacySharedLocalData() {
  [
    "ulifeCalendarEvents",
    "ulifeGpaTracker",
    "ulifeNotificationsReadAt"
  ].forEach(key => localStorage.removeItem(key));
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function getStoredProfile(email) {
  const normalizedEmail = (email || "").toLowerCase();
  const profiles = readJson("ulifeStudentProfiles", {});
  const legacyProfile = readJson("ulifeStudentProfile", null);

  if (profiles[normalizedEmail]) return profiles[normalizedEmail];
  if (legacyProfile?.email?.toLowerCase() === normalizedEmail) return legacyProfile;

  return {};
}

function saveStoredProfile(profile) {
  if (!profile.email) return;

  const normalizedEmail = profile.email.toLowerCase();
  const profiles = readJson("ulifeStudentProfiles", {});
  profiles[normalizedEmail] = {
    ...profiles[normalizedEmail],
    ...profile,
    email: normalizedEmail
  };

  localStorage.setItem("ulifeStudentProfiles", JSON.stringify(profiles));
  localStorage.setItem("ulifeStudentProfile", JSON.stringify(profiles[normalizedEmail]));
}

// ================= API WRAPPER =================
async function api(url, options = {}) {
  const token = getToken();

  const res = await fetch(BASE_URL + url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(options.headers || {})
    }
  });

  let data = null;

  try {
    data = await res.json();
  } catch (e) {}

  if (!res.ok) {
    console.log("API ERROR:", url, data);
    if (res.status === 401) {
      localStorage.removeItem("ulifeToken");
      if (!location.pathname.includes("index.html") && location.pathname !== "/") {
        location.href = "index.html";
      }
    }
    throw new Error(data?.detail || "Request failed");
  }

  return data;
}

console.log("JS LOADED");

// ================= SAFE RUN =================
function safe(fn) {
  fn().catch(err => console.log("ERROR:", err.message));
}

// ================= INIT =================
document.addEventListener("DOMContentLoaded", async () => {
  const token = getToken();

  const isLoginPage =
    location.pathname.includes("index.html") ||
    location.pathname === "/" ||
    location.pathname === "";

  // redirect if not logged in
  if (!isLoginPage && !token) {
    location.href = "index.html";
    return;
  }

  if (isLoginPage && token) {
    try {
      await api("/profile");
      location.href = "dashboard.html";
      return;
    } catch {
      localStorage.removeItem("ulifeToken");
    }
  }

  if (window.lucide) lucide.createIcons();

  setupAuth();

  if (isLoginPage) return;

  // core (always)
  safe(loadProfile);
  safe(loadEvents);
  safe(loadFinance);
  safe(loadDashboardGpa);
  safe(loadAssignments);
  safe(loadStudyPlanner);
  safe(loadNotifications);
  safe(loadNotificationBell);
  safe(loadCourses);
  safe(loadMood);

  // admin only safe loaders
  safe(loadAdminData);

  setInterval(() => safe(loadFinance), 10000);
  setupLogout();
  safe(setupSettingsProfile);
  setupCalendar();
  setupFinancePage();
  safe(setupGpaTracker);
  setupStudyPlannerPage();
  setupWellbeingPage();
  setupNotificationsPage();
});

// ================= ROLE CHECK =================
function getRole() {
  const token = getToken();
  if (!token) return null;

  try {
    return JSON.parse(atob(token.split(".")[1])).role;
  } catch {
    return null;
  }
}

// ================= ADMIN LOAD =================
async function loadAdminData() {
  const role = getRole();

  if (role?.toLowerCase() !== "admin") return;

  try {
    const [users, logs, zones] = await Promise.all([
      api("/users"),
      api("/audit-logs"),
      api("/analytics/zones")
    ]);

    console.log("USERS:", users);
    console.log("AUDIT:", logs);
    console.log("ZONES:", zones);
  } catch (e) {
    console.log("ADMIN ERROR:", e.message);
  }
}

// ================= AUTH =================
function setupAuth() {
  const loginForm = document.querySelector("#loginForm");
  const registerForm = document.querySelector("#registerForm");
  const authTabs = document.querySelectorAll("[data-auth-tab]");
  const loginEmail = document.querySelector("#loginEmail");
  const rememberEmail = document.querySelector("#rememberEmail");
  const savedEmail = localStorage.getItem("ulifeRememberedEmail");
  const forgotPasswordLink = document.querySelector("#forgotPasswordLink");
  const forgotPasswordBox = document.querySelector("#forgotPasswordBox");
  const forgotPasswordEmail = document.querySelector("#forgotPasswordEmail");
  const forgotPasswordMessage = document.querySelector("#forgotPasswordMessage");
  const sendResetLink = document.querySelector("#sendResetLink");

  if (loginEmail && rememberEmail && savedEmail) {
    loginEmail.value = savedEmail;
    rememberEmail.checked = true;
  }

  function setAuthMode(mode) {
    if (loginForm) loginForm.classList.toggle("hidden", mode !== "login");
    if (registerForm) registerForm.classList.toggle("hidden", mode !== "register");
    authTabs.forEach(tab => tab.classList.toggle("active", tab.dataset.authTab === mode));
  }

  function isSduEmail(email) {
    return email.toLowerCase().endsWith("@sdu.edu.kz");
  }

  function validateSduEmail(input) {
    const email = input.value.trim();
    if (!isSduEmail(email)) {
      input.setCustomValidity("Please use your SDU email ending with @sdu.edu.kz");
      input.reportValidity();
      return false;
    }
    input.setCustomValidity("");
    return true;
  }

  function validateStudentId(input) {
    const studentId = input.value.trim();
    if (!/^\d{9}$/.test(studentId)) {
      input.setCustomValidity("Student ID must contain exactly 9 digits");
      input.reportValidity();
      return false;
    }

    input.setCustomValidity("");
    return true;
  }

  function validatePasswordStrength(input) {
    const password = input.value;
    const isStrong =
      password.length >= 8 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /\d/.test(password) &&
      /[^A-Za-z0-9]/.test(password);

    if (!isStrong) {
      input.setCustomValidity("Password must be at least 8 characters and include uppercase, lowercase, number, and special character");
      input.reportValidity();
      return false;
    }

    input.setCustomValidity("");
    return true;
  }

  authTabs.forEach(tab => {
    tab.addEventListener("click", () => setAuthMode(tab.dataset.authTab));
  });

  if (forgotPasswordLink && forgotPasswordBox) {
    forgotPasswordLink.addEventListener("click", () => {
      forgotPasswordBox.classList.toggle("hidden");
      if (forgotPasswordEmail && loginEmail?.value) forgotPasswordEmail.value = loginEmail.value.trim();
      if (!forgotPasswordBox.classList.contains("hidden")) forgotPasswordEmail?.focus();
    });
  }

  if (sendResetLink && forgotPasswordEmail && forgotPasswordMessage) {
    sendResetLink.addEventListener("click", () => {
      const email = forgotPasswordEmail.value.trim();
      if (!isSduEmail(email)) {
        forgotPasswordEmail.setCustomValidity("Please use your SDU email ending with @sdu.edu.kz");
        forgotPasswordEmail.reportValidity();
        return;
      }

      forgotPasswordEmail.setCustomValidity("");
      forgotPasswordMessage.textContent = "If this SDU account exists, password reset instructions will be sent by the administrator.";
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const emailInput = document.querySelector("#loginEmail");
      if (!validateSduEmail(emailInput)) return;

      const email = emailInput.value.trim();
      const password = document.querySelector("#loginPassword").value.trim();

      try {
        const data = await api("/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });

        localStorage.setItem("ulifeToken", data.access_token);
        clearLegacySharedLocalData();
        if (rememberEmail?.checked) {
          localStorage.setItem("ulifeRememberedEmail", email);
        } else {
          localStorage.removeItem("ulifeRememberedEmail");
        }
        saveStoredProfile({
          ...getStoredProfile(data.user?.email || email),
          email: data.user?.email || email,
          role: data.user?.role || "Student"
        });
        location.href = "dashboard.html";
      } catch (err) {
        alert(err.message);
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const emailInput = document.querySelector("#registerEmail");
      if (!validateSduEmail(emailInput)) return;

      const studentIdInput = document.querySelector("#registerStudentId");
      const passwordInput = document.querySelector("#registerPassword");
      if (!validateStudentId(studentIdInput)) return;
      if (!validatePasswordStrength(passwordInput)) return;

      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();
      const studentId = studentIdInput.value.trim();
      const fullName = document.querySelector("#registerName").value.trim();
      const university = document.querySelector("#registerUniversity").value.trim();

      try {
        const data = await api("/register", {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            full_name: fullName,
            student_id: studentId,
            university,
            lat: 0,
            lng: 0
          })
        });

        if (data.access_token) {
          localStorage.setItem("ulifeToken", data.access_token);
          clearLegacySharedLocalData();
        }
        saveStoredProfile({
          email,
          fullName,
          studentId,
          university,
          role: data.role || "Student"
        });

        location.href = "dashboard.html";
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

function setupLogout() {
  const logoutBtn = document.querySelector("#logoutBtn");
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("ulifeToken");
    location.href = "index.html";
  });
}

async function setupSettingsProfile() {
  const profileEmail = document.querySelector("#profileEmail");
  if (!profileEmail) return;

  const firstName = document.querySelector("#profileFirstName");
  const lastName = document.querySelector("#profileLastName");
  const university = document.querySelector("#profileUniversity");
  const studentId = document.querySelector("#profileStudentId");
  const role = document.querySelector("#profileRole");
  const saveBtn = document.querySelector("#saveProfile");
  const cancelBtn = document.querySelector("#cancelProfile");
  const avatar = document.querySelector("#profileAvatar");
  const photoInput = document.querySelector("#profilePhotoInput");
  const changePhotoBtn = document.querySelector("#changePhotoBtn");

  const account = await api("/profile");
  const storedProfile = getStoredProfile(account.email);
  let savedProfileState = buildProfileState(account, storedProfile);

  function buildProfileState(accountData, localProfile = {}) {
    const fullName = accountData.full_name || localProfile.fullName || "";
    const [storedFirstName = "", ...storedLastNameParts] = fullName.split(" ").filter(Boolean);

    return {
      email: accountData.email,
      firstName: localProfile.firstName || storedFirstName || "",
      lastName: localProfile.lastName || storedLastNameParts.join(" ") || "",
      university: accountData.university || localProfile.university || "SDU University",
      studentId: accountData.student_id || localProfile.studentId || "",
      role: accountData.role || localProfile.role || "Student",
      avatarUrl: accountData.avatar_url || ""
    };
  }

  function fillProfileForm(profile) {
    profileEmail.value = profile.email || "";
    if (firstName) firstName.value = profile.firstName || "";
    if (lastName) lastName.value = profile.lastName || "";
    if (university) university.value = profile.university || "";
    if (studentId) studentId.value = profile.studentId || "";
    if (role) role.value = profile.role || "Student";
    setAvatarImage(avatar, profile.avatarUrl);
  }

  fillProfileForm(savedProfileState);

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const nextProfile = {
        email: account.email,
        firstName: firstName?.value.trim() || "",
        lastName: lastName?.value.trim() || "",
        fullName: [firstName?.value.trim(), lastName?.value.trim()].filter(Boolean).join(" "),
        university: university?.value.trim() || "",
        studentId: studentId?.value.trim() || "",
        role: account.role || "Student"
      };

      const updatedAccount = await api("/profile", {
        method: "PUT",
        body: JSON.stringify({
          full_name: nextProfile.fullName,
          student_id: nextProfile.studentId,
          university: nextProfile.university
        })
      });

      nextProfile.role = updatedAccount.role || nextProfile.role;
      saveStoredProfile(nextProfile);
      savedProfileState = buildProfileState(updatedAccount, nextProfile);
      alert("Profile saved");
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      fillProfileForm(savedProfileState);
    });
  }

  if (changePhotoBtn && photoInput) {
    changePhotoBtn.addEventListener("click", () => photoInput.click());
    photoInput.addEventListener("change", async () => {
      const file = photoInput.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        alert("Please choose an image file");
        photoInput.value = "";
        return;
      }
      if (file.size > 1_500_000) {
        alert("Please choose an image under 1.5 MB");
        photoInput.value = "";
        return;
      }

      try {
        const avatarUrl = await readFileAsDataUrl(file);
        const updatedAccount = await api("/profile", {
          method: "PUT",
          body: JSON.stringify({ avatar_url: avatarUrl })
        });
        setAvatarImage(avatar, updatedAccount.avatar_url);
        setTopbarAvatar(updatedAccount.avatar_url);
      } catch (err) {
        alert(err.message);
      } finally {
        photoInput.value = "";
      }
    });
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("Photo upload failed")));
    reader.readAsDataURL(file);
  });
}

function setAvatarImage(avatar, avatarUrl) {
  if (!avatar || !avatarUrl) return;
  avatar.innerHTML = `<img alt="Profile photo" src="${avatarUrl}">`;
}

function setTopbarAvatar(avatarUrl) {
  if (!avatarUrl) return;

  document.querySelectorAll(".topbar .avatar").forEach(avatar => {
    setAvatarImage(avatar, avatarUrl);
  });
}

// ================= LOADERS =================
async function loadProfile() {
  const data = await api("/profile");

  const el = document.querySelector("#userEmail");
  if (el) el.textContent = data.email;
  setTopbarAvatar(data.avatar_url);
}

async function loadEvents() {
  const data = await api("/events");

  const box = document.querySelector("#eventsBox");
  if (!box) return;

  const todayKey = toIsoDate(new Date());
  const todayEvents = data
    .map(normalizeDashboardEvent)
    .filter(event => event.date === todayKey)
    .sort((a, b) => a.time.localeCompare(b.time));

  box.innerHTML = todayEvents.length ? todayEvents.map(event => `
    <div class="dashboard-schedule-row">
      <span class="dashboard-schedule-time"><i data-lucide="clock"></i>${formatDashboardTime(event.time)}</span>
      <b class="${event.colorClass}">${escapeHtml(event.title)}</b>
    </div>
  `).join("") : `<p class="subtitle">No events scheduled for today</p>`;

  if (window.lucide) lucide.createIcons();
}

async function loadFinance() {
  const [data, profile] = await Promise.all([
    api("/transactions"),
    api("/profile")
  ]);

  const box = document.querySelector("#financeBox");
  const total = data.reduce((s, t) => s + Number(t.amount), 0);

  if (box) {
    box.innerHTML = `
      <div><b>Net: ${formatMoney(total)}</b></div>
    `;
  }

  const monthlyBudget = Number(profile.monthly_budget) || 0;
  renderFinanceData(data, monthlyBudget);
  renderDashboardBudget(data, monthlyBudget);
}

const FINANCE_CATEGORIES = [
  ["Food & Dining", "var(--blue)"],
  ["Transportation", "var(--purple)"],
  ["Entertainment", "var(--pink)"],
  ["Books & Supplies", "var(--green)"],
  ["Utilities", "var(--orange)"],
];

const GPA_GRADE_POINTS = {
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.3,
  C: 2.0,
  "C-": 1.7,
  "D+": 1.3,
  D: 1.0,
  F: 0
};

function formatMoney(value) {
  return `${value.toFixed(value % 1 ? 2 : 0)} ₸`;
}

function renderFinanceData(transactions, monthlyBudget = 0) {
  const transactionList = document.querySelector("#transactionList");
  const catBox = document.querySelector("#categories");
  const pie = document.querySelector("#spendingPie");
  const monthlyBudgetValue = document.querySelector("#monthlyBudgetValue");
  const monthlyBudgetInput = document.querySelector("#monthlyBudgetInput");

  if (!transactionList && !catBox && !pie && !monthlyBudgetValue) return;

  const normalized = transactions.map(transaction => ({
    ...transaction,
    amount: Number(transaction.amount) || 0
  }));
  const totalIncome = normalized
    .filter(transaction => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalSpent = normalized
    .filter(transaction => transaction.amount < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const remaining = monthlyBudget - totalSpent;
  const spentPercent = monthlyBudget ? (totalSpent / monthlyBudget) * 100 : 0;
  const remainingPercent = monthlyBudget ? (remaining / monthlyBudget) * 100 : 0;
  const categoryRows = FINANCE_CATEGORIES.map(([name, color]) => {
    const value = normalized
      .filter(transaction => transaction.amount < 0 && transaction.category === name)
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    return [name, value, color];
  });

  setText("#monthlyBudgetValue", `${monthlyBudget} ₸`);
  if (monthlyBudgetInput && document.activeElement !== monthlyBudgetInput) monthlyBudgetInput.value = monthlyBudget;
  setText("#totalIncomeValue", formatMoney(totalIncome));
  setText("#totalSpentValue", formatMoney(totalSpent));
  setText("#spentPercentValue", monthlyBudget ? `${spentPercent.toFixed(1)}% of budget` : "Set a budget to track spending");
  setText("#remainingValue", formatMoney(remaining));
  setText("#remainingPercentValue", monthlyBudget ? `${remainingPercent.toFixed(1)}% left` : "No budget set");

  const remainingPercentValue = document.querySelector("#remainingPercentValue");
  if (remainingPercentValue) {
    remainingPercentValue.classList.toggle("red-text", remaining < 0);
    remainingPercentValue.classList.toggle("green-text", remaining >= 0);
  }

  if (catBox) {
    const maxCategory = Math.max(...categoryRows.map(([, value]) => value), 1);
    catBox.innerHTML = categoryRows.map(([name, value, color]) => `
      <div class="money-row"><span>${name}</span><b>${formatMoney(value)}</b></div>
      <div class="progress"><span style="width:${Math.max((value / maxCategory) * 100, value > 0 ? 3 : 0)}%;background:${color}"></span></div>
    `).join("");
  }

  if (pie) {
    const totalByCategory = categoryRows.reduce((sum, [, value]) => sum + value, 0);
    if (!totalByCategory) {
      pie.style.background = "#f1f5f9";
    } else {
      let start = 0;
      const gradient = categoryRows.map(([, value, color]) => {
        const end = start + (value / totalByCategory) * 100;
        const slice = `${color} ${start}% ${end}%`;
        start = end;
        return slice;
      }).join(",");
      pie.style.background = `conic-gradient(${gradient})`;
    }
  }

  if (transactionList) {
    const rows = [...normalized].sort((a, b) => {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0) || Number(b.id || 0) - Number(a.id || 0);
    });

    transactionList.innerHTML = rows.length ? rows.map(transaction => {
      const isIncome = transaction.amount > 0;
      const sign = isIncome ? "+" : "-";
      return `<div class="transaction"><b>${escapeHtml(transaction.title)}</b><span class="${isIncome ? "green-text" : ""}">${sign}${Math.abs(transaction.amount).toFixed(2)} ₸</span></div>`;
    }).join("") : `<p class="subtitle">No transactions yet</p>`;
  }
}

function renderDashboardBudget(transactions, monthlyBudget = 0) {
  const spentValue = document.querySelector("#dashboardSpentValue");
  const budgetText = document.querySelector("#dashboardBudgetText");
  const progress = document.querySelector("#dashboardBudgetProgress");

  if (!spentValue && !budgetText && !progress) return;

  const totalSpent = transactions
    .map(transaction => Number(transaction.amount) || 0)
    .filter(amount => amount < 0)
    .reduce((sum, amount) => sum + Math.abs(amount), 0);
  const spentPercent = monthlyBudget ? (totalSpent / monthlyBudget) * 100 : 0;

  if (spentValue) spentValue.textContent = formatMoney(totalSpent);
  if (budgetText) budgetText.textContent = monthlyBudget
    ? `of ${formatMoney(monthlyBudget)} spent this month`
    : "No monthly budget set";
  if (progress) progress.style.width = `${Math.min(spentPercent, 100)}%`;
}

function normalizeDashboardEvent(event) {
  const rawDate = event.event_date || `${event.date || ""} ${event.time || "00:00"}`;
  const [date = "", time = "00:00"] = rawDate.replace("T", " ").split(" ");
  const type = (event.description || event.type || "course").toLowerCase();
  const colorClass = type.includes("personal")
    ? "dashboard-schedule-purple"
    : type.includes("deadline")
      ? "dashboard-schedule-red"
      : "dashboard-schedule-blue";

  return {
    title: event.title,
    date,
    time: time.slice(0, 5),
    colorClass
  };
}

function formatDashboardTime(time) {
  const [hourText, minuteText = "00"] = time.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${minuteText} ${suffix}`;
}

async function loadDashboardGpa() {
  const gpaValue = document.querySelector("#dashboardGpaValue");
  if (!gpaValue) return;

  const data = await api("/gpa");
  const stats = calculateGpaStats({
    previousCredits: Number(data.previous_credits) || 0,
    previousGpa: Number(data.previous_gpa) || 0,
    courses: data.courses || []
  });

  setText("#dashboardGpaValue", stats.cumulativeGpa.toFixed(2));
  setText("#dashboardGpaText", "Cumulative GPA");
  setText("#dashboardSpaText", `SPA: ${stats.spa.toFixed(2)} • ${stats.semesterCredits.toFixed(0)} credits`);
}

function calculateGpaStats(state) {
  const previousCredits = Number(state.previousCredits) || 0;
  const previousGpa = Number(state.previousGpa) || 0;
  const semesterCredits = state.courses.reduce((sum, course) => sum + (Number(course.credits) || 0), 0);
  const semesterQualityPoints = state.courses.reduce((sum, course) => {
    return sum + ((Number(course.credits) || 0) * (GPA_GRADE_POINTS[course.grade] ?? 0));
  }, 0);
  const spa = semesterCredits ? semesterQualityPoints / semesterCredits : 0;
  const totalCredits = previousCredits + semesterCredits;
  const cumulativeGpa = totalCredits ? ((previousCredits * previousGpa) + semesterQualityPoints) / totalCredits : 0;

  return {
    spa,
    cumulativeGpa,
    semesterCredits,
    totalCredits
  };
}

async function loadAssignments() {
  const data = await api("/assignments");
  renderDashboardDeadlines(data);

  const box = document.querySelector("#assignmentsBox");
  if (!box) return;

  box.innerHTML = data.map(a => `<div>${escapeHtml(a.title || "Untitled task")}</div>`).join("");
}

function renderDashboardDeadlines(assignments) {
  const box = document.querySelector("#dashboardDeadlines");
  if (!box) return;

  const today = startOfDay(new Date());
  const upcoming = assignments
    .map(assignment => ({
      ...assignment,
      deadlineDate: assignment.deadline ? new Date(assignment.deadline) : null
    }))
    .filter(assignment => {
      if (!assignment.deadlineDate || Number.isNaN(assignment.deadlineDate.getTime())) return false;
      if (assignment.status === "Completed") return false;
      return startOfDay(assignment.deadlineDate) >= today;
    })
    .sort((a, b) => a.deadlineDate - b.deadlineDate)
    .slice(0, 3);

  if (!upcoming.length) {
    box.innerHTML = `<p class="subtitle">No upcoming deadlines</p>`;
    return;
  }

  box.innerHTML = upcoming.map(assignment => {
    const days = Math.round((startOfDay(assignment.deadlineDate) - today) / 86400000);
    const label = formatDashboardDeadlineLabel(days);
    const isUrgent = days <= 2;

    return `
      <div class="deadline">
        <div>
          <b>${escapeHtml(assignment.title || "Untitled task")}</b>
          <p>${escapeHtml(assignment.course_name || "No course")}</p>
        </div>
        <span class="${isUrgent ? "danger" : ""}">${label}</span>
      </div>
    `;
  }).join("");
}

function formatDashboardDeadlineLabel(days) {
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  if (days < 7) return `${days} days`;
  if (days === 7) return "1 week";
  return `${Math.ceil(days / 7)} weeks`;
}

let studyPlannerTasks = [];
const STUDY_STATUSES = ["To Do", "In Progress", "Submitted", "Completed"];

async function loadStudyPlanner() {
  if (!document.querySelector("#studyPlannerBoard")) return;

  studyPlannerTasks = await api("/assignments");
  renderStudyPlanner();
}

function renderStudyPlanner() {
  const board = document.querySelector("#studyPlannerBoard");
  if (!board) return;

  STUDY_STATUSES.forEach(status => {
    const column = document.querySelector(`[data-study-column="${status}"]`);
    const count = document.querySelector(`[data-study-count="${status}"]`);
    const tasks = studyPlannerTasks.filter(task => (task.status || "To Do") === status);

    if (count) count.textContent = tasks.length;
    if (!column) return;

    column.innerHTML = tasks.length
      ? tasks.map(renderTaskCard).join("")
      : `<div class="empty-study-column">No tasks</div>`;
  });

  const activeTasks = studyPlannerTasks.filter(task => task.status !== "Completed");
  const dueThisWeek = activeTasks.filter(task => getDeadlineStatus(task.deadline).state === "week");
  const overdue = activeTasks.filter(task => getDeadlineStatus(task.deadline).state === "overdue");
  const completionRate = studyPlannerTasks.length
    ? Math.round((studyPlannerTasks.filter(task => task.status === "Completed").length / studyPlannerTasks.length) * 100)
    : 0;

  setText("#plannerActiveTasks", activeTasks.length);
  setText("#plannerDueThisWeek", dueThisWeek.length);
  setText("#plannerOverdue", overdue.length);
  setText("#plannerCompletionRate", `${completionRate}%`);

  document.querySelectorAll("[data-task-status]").forEach(select => {
    select.addEventListener("change", () => updateTaskStatus(select.dataset.taskStatus, select.value));
  });

  document.querySelectorAll("[data-edit-task]").forEach(button => {
    button.addEventListener("click", () => {
      const task = studyPlannerTasks.find(item => String(item.id) === button.dataset.editTask);
      openTaskModal(task);
    });
  });

  document.querySelectorAll("[data-delete-task]").forEach(button => {
    button.addEventListener("click", () => deleteTask(button.dataset.deleteTask));
  });

  if (window.lucide) lucide.createIcons();
}

function setupStudyPlannerPage() {
  const form = document.querySelector("#taskForm");
  if (!form) return;

  document.querySelector("#openTaskModal")?.addEventListener("click", () => openTaskModal());
  document.querySelector("#closeTaskModal")?.addEventListener("click", closeTaskModal);
  document.querySelector("#cancelTaskModal")?.addEventListener("click", closeTaskModal);
  document.querySelector("#taskModal")?.addEventListener("click", event => {
    if (event.target.id === "taskModal") closeTaskModal();
  });
  form.addEventListener("submit", createTask);
}

async function createTask(event) {
  event.preventDefault();

  const taskId = document.querySelector("#taskId").value;
  const payload = {
    title: document.querySelector("#taskTitle").value.trim(),
    course_name: document.querySelector("#taskCourseName").value.trim(),
    task_type: document.querySelector("#taskType").value,
    deadline: document.querySelector("#taskDeadline").value,
    priority: document.querySelector("#taskPriority").value,
    status: document.querySelector("#taskStatus").value,
    progress: Number(document.querySelector("#taskProgress").value) || 0,
    notes: document.querySelector("#taskNotes").value.trim()
  };

  if (!payload.title) return;

  if (taskId) {
    await api(`/assignments/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  } else {
    await api("/assignments", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  closeTaskModal();
  await loadStudyPlanner();
  await loadNotificationBell();
}

async function updateTaskStatus(taskId, status) {
  const task = studyPlannerTasks.find(item => String(item.id) === String(taskId));
  if (!task) return;

  await api(`/assignments/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({
      status,
      progress: status === "Completed" ? 100 : task.progress
    })
  });

  await loadStudyPlanner();
}

async function deleteTask(taskId) {
  await api(`/assignments/${taskId}`, { method: "DELETE" });
  await loadStudyPlanner();
}

function getDeadlineStatus(deadline) {
  if (!deadline) return { label: "No deadline", className: "neutral", state: "none" };

  const date = startOfDay(new Date(deadline));
  if (Number.isNaN(date.getTime())) return { label: "No deadline", className: "neutral", state: "none" };

  const today = startOfDay(new Date());
  const diffDays = Math.round((date - today) / 86400000);

  if (diffDays < 0) return { label: "Overdue", className: "overdue", state: "overdue" };
  if (diffDays === 0) return { label: "Due today", className: "today", state: "week" };
  if (diffDays <= 7) return { label: `Due in ${diffDays} days`, className: "week", state: "week" };
  return { label: formatStudyDate(deadline), className: "upcoming", state: "upcoming" };
}

function renderTaskCard(task) {
  const deadline = getDeadlineStatus(task.deadline);
  const progress = Math.min(Math.max(Number(task.progress) || 0, 0), 100);
  const priority = task.priority || "Medium";
  const status = task.status || "To Do";

  return `
    <article class="task-card">
      <div class="task-card-top">
        <span class="task-priority ${priority.toLowerCase()}">${escapeHtml(priority)}</span>
        <span class="task-deadline ${deadline.className}">${escapeHtml(deadline.label)}</span>
      </div>
      <h4>${escapeHtml(task.title || "Untitled task")}</h4>
      <p>${escapeHtml(task.course_name || "No course")}${task.task_type ? ` • ${escapeHtml(task.task_type)}` : ""}</p>
      ${task.notes ? `<small>${escapeHtml(task.notes)}</small>` : ""}
      <div class="task-progress">
        <div><span style="width:${progress}%"></span></div>
        <b>${progress}%</b>
      </div>
      <select data-task-status="${task.id}">
        ${STUDY_STATUSES.map(item => `<option ${item === status ? "selected" : ""}>${item}</option>`).join("")}
      </select>
      <div class="task-actions">
        <button class="secondary" type="button" data-edit-task="${task.id}">Edit</button>
        <button class="danger-btn" type="button" data-delete-task="${task.id}">Delete</button>
      </div>
    </article>
  `;
}

function openTaskModal(task = null) {
  const modal = document.querySelector("#taskModal");
  const form = document.querySelector("#taskForm");
  if (!modal || !form) return;

  form.reset();
  document.querySelector("#taskModalTitle").textContent = task ? "Edit Task" : "Add Task";
  document.querySelector("#taskId").value = task?.id || "";
  document.querySelector("#taskTitle").value = task?.title || "";
  document.querySelector("#taskCourseName").value = task?.course_name || "";
  document.querySelector("#taskType").value = task?.task_type || "Assignment";
  document.querySelector("#taskDeadline").value = toDateTimeInputValue(task?.deadline);
  document.querySelector("#taskPriority").value = task?.priority || "Medium";
  document.querySelector("#taskStatus").value = task?.status || "To Do";
  document.querySelector("#taskProgress").value = task?.progress ?? 0;
  document.querySelector("#taskNotes").value = task?.notes || "";

  modal.classList.add("show");
  document.querySelector("#taskTitle").focus();
}

function closeTaskModal() {
  document.querySelector("#taskModal")?.classList.remove("show");
}

function toDateTimeInputValue(value) {
  if (!value) return "";
  return String(value).slice(0, 16);
}

function formatStudyDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No deadline";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function loadNotifications() {
  const eventBox = document.querySelector("#notificationEvents");
  if (eventBox) {
    const events = await api("/events");
    renderNotificationEvents(events);
    return;
  }

  const data = await api("/notifications");

  const box = document.querySelector("#notificationsBox");
  if (!box) return;

  box.innerHTML = data.map(n => `
    <div>${escapeHtml(n.message)}</div>
  `).join("");
}

let notificationEvents = [];
let activeNotificationTab = "all";

function renderNotificationEvents(events) {
  const box = document.querySelector("#notificationEvents");
  if (!box) return;

  const today = startOfDay(new Date());
  const readAt = getNotificationsReadAt();
  if (Array.isArray(events)) {
    notificationEvents = events
      .map(normalizeNotificationEvent)
      .filter(event => event.date >= today)
      .sort((a, b) => a.date - b.date);
  }

  const visibleEvents = notificationEvents.filter(event => {
    if (activeNotificationTab === "academic") return event.category === "academic";
    if (activeNotificationTab === "personal") return event.category === "personal";
    return true;
  });

  const unreadCount = notificationEvents.filter(event => event.createdAt > readAt).length;
  setText("#unreadCount", `${unreadCount} unread ${unreadCount === 1 ? "notification" : "notifications"}`);
  updateNotificationBell(unreadCount);

  if (!visibleEvents.length) {
    box.innerHTML = `<div class="empty-notifications"><b>No upcoming events</b><p>Events from Calendar and Study Planner will appear here.</p></div>`;
    return;
  }

  box.innerHTML = visibleEvents.map(event => `
    <div class="${event.createdAt > readAt ? "unread" : "read"} notification-event" data-notification-category="${event.category}">
      <b>${escapeHtml(event.heading)}</b>
      <p>${escapeHtml(event.message)}</p>
      <small>${escapeHtml(event.when)}</small>
    </div>
  `).join("");
}

function normalizeNotificationEvent(event) {
  const rawDate = event.event_date || "";
  const date = new Date(rawDate.replace(" ", "T"));
  const description = (event.description || "").toLowerCase();
  const isPersonal = description.includes("personal");
  const isDeadline = description.includes("deadline");
  const isCourse = description.includes("course");
  const category = isPersonal ? "personal" : "academic";
  const heading = isDeadline ? "Upcoming Deadline" : isCourse ? "Course Event" : isPersonal ? "Personal Event" : "Upcoming Event";
  const courseOrType = isDeadline ? event.location || "Deadline" : event.description || "Event";

  return {
    date: Number.isNaN(date.getTime()) ? new Date(8640000000000000) : date,
    createdAt: parseNotificationCreatedAt(event.created_at || event.createdAt) || date,
    category,
    heading,
    message: `${event.title} • ${courseOrType}`,
    when: formatNotificationDate(date)
  };
}

async function loadNotificationBell() {
  const bellDot = document.querySelector(".bell b");
  if (!bellDot) return;

  const events = await api("/events");
  const today = startOfDay(new Date());
  const readAt = getNotificationsReadAt();
  const unreadCount = events
    .map(normalizeNotificationEvent)
    .filter(event => event.date >= today && event.createdAt > readAt)
    .length;

  updateNotificationBell(unreadCount);
}

function updateNotificationBell(unreadCount) {
  document.querySelectorAll(".bell b").forEach(dot => {
    dot.classList.toggle("hidden", unreadCount <= 0);
  });
}

function getNotificationsReadAt() {
  const value = localStorage.getItem(getUserStorageKey("ulifeNotificationsReadAt"));
  const date = value ? new Date(value) : new Date(0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function markNotificationsReadNow() {
  localStorage.setItem(getUserStorageKey("ulifeNotificationsReadAt"), new Date().toISOString());
  updateNotificationBell(0);
}

function parseNotificationCreatedAt(value) {
  if (!value) return null;

  const text = String(value).replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text);
  const date = new Date(hasTimezone ? text : `${text}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatNotificationDate(date) {
  if (Number.isNaN(date.getTime())) return "No date";
  const now = startOfDay(new Date());
  const day = startOfDay(date);
  const diffDays = Math.round((day - now) / 86400000);
  const time = formatDashboardTime(`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`);

  if (diffDays === 0) return `Today at ${time}`;
  if (diffDays === 1) return `Tomorrow at ${time}`;
  if (diffDays < 7) return `In ${diffDays} days at ${time}`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + ` at ${time}`;
}

async function loadCourses() {
  const data = await api("/courses");

  const box = document.querySelector("#coursesBox");
  if (!box) return;

  box.innerHTML = data.map(c => `
    <div>${escapeHtml(c.title)}</div>
  `).join("");
}

async function loadMood() {
  const data = await api("/mood");
  renderMoodStats(data);
}

// ================= PAGE INTERACTIONS =================
function setupCalendar() {
  const calendarGrid = document.querySelector("#calendarGrid");
  const calendarRange = document.querySelector("#calendarRange");
  if (!calendarGrid || !calendarRange) return;

  const filterInputs = document.querySelectorAll("[data-calendar-filter]");
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hours = Array.from({ length: 24 }, (_, hour) => {
    return [String(hour).padStart(2, "0"), formatTime(`${String(hour).padStart(2, "0")}:00`)];
  });
  const defaultEvents = [];
  const calendarEventsKey = getUserStorageKey("ulifeCalendarEvents");
  const savedEvents = JSON.parse(localStorage.getItem(calendarEventsKey) || "[]").filter(event => event.date);
  let events = [...defaultEvents, ...savedEvents];

  function formatDate(date) {
    return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  function formatTime(time) {
    const [hourText, minuteText] = time.split(":");
    const hour = Number(hourText);
    const suffix = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minuteText} ${suffix}`;
  }

  function getEventHour(time) {
    return time.slice(0, 2);
  }

  function getMonday(date) {
    const monday = new Date(date);
    const day = monday.getDay() || 7;
    monday.setDate(monday.getDate() - day + 1);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  function activeFilters() {
    return Array.from(filterInputs).filter(input => input.checked).map(input => input.dataset.calendarFilter);
  }

  function enableFilter(type) {
    const input = document.querySelector(`[data-calendar-filter="${type}"]`);
    if (input) input.checked = true;
  }

  function eventMatchesDay(event, date) {
    if (event.date) return event.date === toIsoDate(date);
    return false;
  }

  function normalizeCalendarEvent(event) {
    const rawDate = event.event_date || `${event.date || ""} ${event.time || "00:00"}`;
    const [date = "", time = "00:00"] = rawDate.replace("T", " ").split(" ");
    const type = (event.description || event.type || "course").toLowerCase();
    const normalizedType = type.includes("deadline") ? "deadline" : type.includes("personal") ? "personal" : "course";
    const color = normalizedType === "deadline" ? "red" : normalizedType === "personal" ? "green" : "blue";

    return {
      id: event.id,
      title: event.title,
      date,
      time: time.slice(0, 5) || "00:00",
      type: normalizedType,
      color,
      note: formatTime(time.slice(0, 5) || "00:00"),
      alert: `${event.title} opened`
    };
  }

  async function loadCalendarEventsFromDb() {
    const data = await api("/events");
    const dbEvents = data.map(normalizeCalendarEvent);
    const localEvents = savedEvents.filter(event => !event.id);
    events = [...localEvents, ...dbEvents];
    renderMiniCalendar();
    renderCalendar();
  }

  let weekStart = getMonday(new Date());
  let weekDays = getWeekDays(weekStart);
  let selectedDateText = toIsoDate(new Date());
  let miniMonthDate = new Date();
  miniMonthDate.setDate(1);

  function getWeekDays(startDate) {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      return date;
    });
  }

  function showWeekForDate(dateText) {
    if (!dateText) return;
    selectedDateText = dateText;
    weekStart = getMonday(new Date(`${dateText}T00:00:00`));
    weekDays = getWeekDays(weekStart);
  }

  function renderMiniCalendar() {
    const miniMonthLabel = document.querySelector("#miniMonthLabel");
    const miniCalendarDays = document.querySelector("#miniCalendarDays");
    if (!miniMonthLabel || !miniCalendarDays) return;

    const year = miniMonthDate.getFullYear();
    const month = miniMonthDate.getMonth();
    miniMonthLabel.textContent = `${monthNames[month]} ${year}`;
    miniCalendarDays.innerHTML = "";

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const totalCells = 42;

    for (let index = 0; index < totalCells; index++) {
      const button = document.createElement("button");
      button.type = "button";
      let dayNumber;
      let cellDate;

      if (index < firstDay) {
        dayNumber = prevMonthDays - firstDay + index + 1;
        cellDate = new Date(year, month - 1, dayNumber);
        button.classList.add("muted-day");
      } else if (index >= firstDay + daysInMonth) {
        dayNumber = index - firstDay - daysInMonth + 1;
        cellDate = new Date(year, month + 1, dayNumber);
        button.classList.add("muted-day");
      } else {
        dayNumber = index - firstDay + 1;
        cellDate = new Date(year, month, dayNumber);
      }

      const isoDate = toIsoDate(cellDate);
      button.textContent = dayNumber;
      button.classList.toggle("selected-day", isoDate === selectedDateText);
      button.classList.toggle("today-day", isoDate === toIsoDate(new Date()));
      button.addEventListener("click", () => {
        miniMonthDate = new Date(cellDate);
        miniMonthDate.setDate(1);
        showWeekForDate(isoDate);
        renderMiniCalendar();
        renderCalendar();
      });
      miniCalendarDays.append(button);
    }
  }

  function renderCalendar() {
    const filters = activeFilters();
    calendarRange.textContent = `${formatDate(weekDays[0])} - ${formatDate(weekDays[6])}`;
    calendarGrid.innerHTML = "";
    calendarGrid.append(document.createElement("div"));

    weekDays.forEach((date, index) => {
      const header = document.createElement("b");
      header.className = toIsoDate(date) === toIsoDate(new Date()) ? "today" : "";
      header.innerHTML = `${dayNames[index]}<br><small>${monthNames[date.getMonth()]} ${date.getDate()}</small>`;
      calendarGrid.append(header);
    });

    hours.forEach(([hourValue, hourLabel]) => {
      const hourCell = document.createElement("span");
      hourCell.textContent = hourLabel;
      calendarGrid.append(hourCell);

      weekDays.forEach((date) => {
        const cell = document.createElement("div");
        const matchingEvents = events.filter(item => getEventHour(item.time) === hourValue && eventMatchesDay(item, date) && filters.includes(item.type));

        matchingEvents.forEach(event => {
          cell.classList.add("event");
          const eventCard = document.createElement("div");
          eventCard.className = `calendar-event-card ${event.color}-card`;
          eventCard.textContent = event.title;
          eventCard.append(document.createElement("br"), event.note || formatTime(event.time));
          eventCard.addEventListener("click", () => alert(event.alert));
          cell.append(eventCard);
        });

        calendarGrid.append(cell);
      });
    });
  }

  function scrollToEventHour(time) {
    const hour = Number(getEventHour(time));
    const scrollBox = document.querySelector(".calendar-scroll");
    if (!scrollBox) return;
    scrollBox.scrollTop = Math.max(0, hour * 76);
  }

  filterInputs.forEach(input => input.addEventListener("change", renderCalendar));
  document.querySelector("#prevMonth")?.addEventListener("click", () => {
    miniMonthDate.setMonth(miniMonthDate.getMonth() - 1);
    renderMiniCalendar();
  });
  document.querySelector("#nextMonth")?.addEventListener("click", () => {
    miniMonthDate.setMonth(miniMonthDate.getMonth() + 1);
    renderMiniCalendar();
  });
  document.querySelector("#todayBtn")?.addEventListener("click", () => {
    const today = new Date();
    miniMonthDate = new Date(today);
    miniMonthDate.setDate(1);
    showWeekForDate(toIsoDate(today));
    renderMiniCalendar();
    renderCalendar();
  });
  renderMiniCalendar();
  renderCalendar();
  safe(loadCalendarEventsFromDb);

  const addEventBtn = document.querySelector("#addEventBtn");
  const eventModal = document.querySelector("#eventModal");
  const eventForm = document.querySelector("#eventForm");
  const eventDate = document.querySelector("#eventDate");

  if (addEventBtn && eventModal) {
    addEventBtn.addEventListener("click", () => {
      if (eventForm) eventForm.reset();
      if (eventDate) eventDate.value = toIsoDate(new Date());
      eventModal.classList.add("show");
    });

    const closeBtn = eventModal.querySelector(".close-modal");
    if (closeBtn) closeBtn.addEventListener("click", () => eventModal.classList.remove("show"));

    eventModal.addEventListener("click", (event) => {
      if (event.target === eventModal) eventModal.classList.remove("show");
    });
  }

  if (eventForm) {
    eventForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const typeLabel = document.querySelector("#eventType").value;
      const type = typeLabel.toLowerCase();
      const color = type === "deadline" ? "red" : type === "personal" ? "green" : "blue";
      const time = document.querySelector("#eventTime").value;
      const title = document.querySelector("#eventTitle").value.trim();

      const selectedDate = document.querySelector("#eventDate").value;

      const newEvent = {
        title,
        date: selectedDate,
        time,
        type,
        color,
        note: formatTime(time),
        alert: `${title} opened`
      };

      events.push(newEvent);
      const existingSavedEvents = JSON.parse(localStorage.getItem(calendarEventsKey) || "[]");
      localStorage.setItem(calendarEventsKey, JSON.stringify([...existingSavedEvents, newEvent]));

      safe(async () => {
        await api("/events", {
          method: "POST",
          body: JSON.stringify({
            title,
            event_date: `${document.querySelector("#eventDate").value} ${time}`,
            description: typeLabel
          })
        });
      });

      showWeekForDate(selectedDate);
      miniMonthDate = new Date(`${selectedDate}T00:00:00`);
      miniMonthDate.setDate(1);
      enableFilter(type);
      eventModal.classList.remove("show");
      renderMiniCalendar();
      renderCalendar();
      scrollToEventHour(time);
    });
  }
}

function setupFinancePage() {
  const transactionBtn = document.querySelector("#addTransaction");
  const transactionModal = document.querySelector("#transactionModal");
  const transactionForm = document.querySelector("#transactionForm");
  const categoryField = document.querySelector("#transactionCategoryField");
  const categorySelect = document.querySelector("#transactionCategory");
  const titleInput = document.querySelector("#transactionTitle");
  const saveBudgetBtn = document.querySelector("#saveBudgetBtn");
  const monthlyBudgetInput = document.querySelector("#monthlyBudgetInput");
  let transactionType = "expense";

  function setTransactionType(type) {
    transactionType = type;
    document.querySelectorAll(".transaction-type button").forEach(btn => {
      btn.classList.toggle("selected", btn.dataset.type === type);
    });
    const isIncome = type === "income";
    if (categoryField) categoryField.classList.toggle("hidden", isIncome);
    if (categorySelect) {
      categorySelect.disabled = isIncome;
      categorySelect.required = !isIncome;
    }
    if (titleInput) {
      titleInput.placeholder = isIncome ? "Example: Part-time Job Payment" : "Example: Grocery Shopping";
    }
  }

  if (transactionBtn && transactionModal) {
    transactionBtn.addEventListener("click", () => {
      if (transactionForm) transactionForm.reset();
      const dateInput = document.querySelector("#transactionDate");
      if (dateInput) dateInput.valueAsDate = new Date();
      setTransactionType("expense");
      transactionModal.classList.add("show");
    });

    const closeBtn = document.querySelector(".close-transaction-modal");
    if (closeBtn) closeBtn.addEventListener("click", () => transactionModal.classList.remove("show"));

    transactionModal.addEventListener("click", (event) => {
      if (event.target === transactionModal) transactionModal.classList.remove("show");
    });

    document.querySelectorAll(".transaction-type button").forEach(btn => {
      btn.addEventListener("click", () => setTransactionType(btn.dataset.type));
    });
  }

  if (transactionForm) {
    transactionForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.querySelector("#transactionTitle").value.trim();
      const amount = Number(document.querySelector("#transactionAmount").value);
      const signedAmount = transactionType === "income" ? amount : -amount;

      try {
        await api("/transactions", {
          method: "POST",
          body: JSON.stringify({
            title,
            amount: signedAmount,
            category: transactionType === "income" ? null : categorySelect.value
          })
        });

        await loadFinance();
        transactionForm.reset();
        transactionModal.classList.remove("show");
      } catch (err) {
        alert(err.message);
      }
    });
  }

  if (saveBudgetBtn && monthlyBudgetInput) {
    saveBudgetBtn.addEventListener("click", async () => {
      const monthlyBudget = Number(monthlyBudgetInput.value);
      if (!monthlyBudget || monthlyBudget <= 0) {
        alert("Monthly budget must be greater than 0");
        return;
      }

      try {
        await api("/profile", {
          method: "PUT",
          body: JSON.stringify({ monthly_budget: monthlyBudget })
        });
        await loadFinance();
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

async function setupGpaTracker() {
  const rowsBox = document.querySelector("#gpaCourseRows");
  if (!rowsBox) return;

  const defaultState = {
    semester: "Spring 2026",
    previousCredits: 0,
    previousGpa: 0,
    courses: []
  };
  let saveTimer = null;
  const data = await api("/gpa");
  const localGpaState = readJson(getUserStorageKey("ulifeGpaTracker"), null);
  let state = localGpaState || {
    semester: data.semester || defaultState.semester,
    previousCredits: Number(data.previous_credits) || 0,
    previousGpa: Number(data.previous_gpa) || 0,
    courses: data.courses?.length ? data.courses.map(course => ({
      code: course.code || "",
      name: course.name || "",
      credits: Number(course.credits) || 0,
      grade: course.grade || "A"
    })) : defaultState.courses
  };

  const semesterInput = document.querySelector("#gpaSemesterInput");
  const previousCreditsInput = document.querySelector("#previousCreditsInput");
  const previousGpaInput = document.querySelector("#previousGpaInput");
  const addCourseBtn = document.querySelector("#addGpaCourseBtn");

  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await api("/gpa", {
          method: "PUT",
          body: JSON.stringify({
            semester: state.semester,
            previous_credits: Number(state.previousCredits) || 0,
            previous_gpa: Number(state.previousGpa) || 0,
            courses: state.courses.map(course => ({
              code: course.code,
              name: course.name,
              credits: Number(course.credits) || 0,
              grade: course.grade
            }))
          })
        });
      } catch (err) {
        alert(err.message);
      }
    }, 350);
  }

  if (localGpaState) {
    localStorage.removeItem(getUserStorageKey("ulifeGpaTracker"));
    saveState();
  }

  function renderRows() {
    rowsBox.innerHTML = state.courses.map((course, index) => {
      const points = GPA_GRADE_POINTS[course.grade] ?? 0;
      return `
        <tr>
          <td><input class="gpa-input" data-gpa-field="code" data-index="${index}" value="${escapeHtml(course.code)}"></td>
          <td><input class="gpa-input" data-gpa-field="name" data-index="${index}" value="${escapeHtml(course.name)}"></td>
          <td><input class="gpa-input" data-gpa-field="credits" data-index="${index}" type="number" min="0" step="1" value="${course.credits}"></td>
          <td>
            <select class="gpa-grade-select" data-gpa-field="grade" data-index="${index}">
              ${Object.keys(GPA_GRADE_POINTS).map(grade => `<option ${grade === course.grade ? "selected" : ""}>${grade}</option>`).join("")}
            </select>
          </td>
          <td>${points.toFixed(1)} <button class="delete-gpa-row" type="button" data-delete-gpa="${index}">Delete</button></td>
        </tr>
      `;
    }).join("");
  }

  function calculateGpa() {
    const { spa, cumulativeGpa, semesterCredits, totalCredits } = calculateGpaStats(state);

    setText("#currentSpaValue", spa.toFixed(2));
    setText("#currentSemesterLabel", state.semester);
    setText("#cumulativeGpaValue", cumulativeGpa.toFixed(2));
    setText("#totalCreditsValue", totalCredits.toFixed(0));
    setText("#currentCreditsText", `${semesterCredits.toFixed(0)} credits in progress`);
    setText("#semesterCreditsTotal", semesterCredits.toFixed(0));
    setText("#semesterSpaTotal", spa.toFixed(2));
  }

  function render() {
    if (semesterInput) semesterInput.value = state.semester;
    if (previousCreditsInput) previousCreditsInput.value = state.previousCredits;
    if (previousGpaInput) previousGpaInput.value = state.previousGpa;
    renderRows();
    calculateGpa();
  }

  [semesterInput, previousCreditsInput, previousGpaInput].forEach(input => {
    if (!input) return;
    input.addEventListener("input", () => {
      state.semester = semesterInput?.value || "";
      state.previousCredits = Number(previousCreditsInput?.value) || 0;
      state.previousGpa = Number(previousGpaInput?.value) || 0;
      saveState();
      calculateGpa();
    });
  });

  rowsBox.addEventListener("input", event => {
    const field = event.target.dataset.gpaField;
    const index = Number(event.target.dataset.index);
    if (!field || Number.isNaN(index) || !state.courses[index]) return;

    state.courses[index][field] = field === "credits" ? Number(event.target.value) || 0 : event.target.value;
    saveState();
    calculateGpa();
  });

  rowsBox.addEventListener("change", event => {
    if (event.target.dataset.gpaField !== "grade") return;
    renderRows();
    calculateGpa();
  });

  rowsBox.addEventListener("click", event => {
    const index = Number(event.target.dataset.deleteGpa);
    if (Number.isNaN(index)) return;
    state.courses.splice(index, 1);
    saveState();
    render();
  });

  if (addCourseBtn) {
    addCourseBtn.addEventListener("click", () => {
      state.courses.push({ code: "", name: "", credits: 3, grade: "A" });
      saveState();
      render();
    });
  }

  render();
}

function setupWellbeingPage() {
  const moodMap = {
    "Very Bad": 1,
    Bad: 2,
    Okay: 3,
    Good: 4,
    Amazing: 5
  };

  document.querySelectorAll(".mood-choice").forEach(choice => {
    choice.addEventListener("click", async () => {
      const mood = choice.dataset.mood;
      setText("#moodSaveStatus", "Saving...");

      try {
        await api("/mood", {
          method: "POST",
          body: JSON.stringify({ mood, score: moodMap[mood] || 3, note: "Mood saved from Ulife" })
        });

        await loadMood();
        setText("#moodSaveStatus", "Saved to database");
      } catch (err) {
        setText("#moodSaveStatus", "");
        alert(err.message);
      }
    });
  });
}

function renderMoodStats(entries) {
  const box = document.querySelector("#moodBox");
  if (!box) return;

  const moodDetails = {
    "Very Bad": { emoji: "😔", score: 1 },
    Bad: { emoji: "😐", score: 2 },
    Okay: { emoji: "🙂", score: 3 },
    Good: { emoji: "😊", score: 4 },
    Amazing: { emoji: "🤩", score: 5 }
  };
  const dayMs = 24 * 60 * 60 * 1000;
  const now = new Date();
  const todayKey = toDateKey(now);
  const sevenDaysAgo = startOfDay(new Date(now.getTime() - 6 * dayMs));
  const normalizedEntries = entries
    .map(entry => ({
      ...entry,
      score: clampMoodScore(Number(entry.score) || moodDetails[entry.mood]?.score || 0),
      createdAt: entry.created_at ? new Date(entry.created_at) : new Date()
    }))
    .filter(entry => !Number.isNaN(entry.createdAt.getTime()))
    .sort((a, b) => a.createdAt - b.createdAt);

  const latestToday = [...normalizedEntries]
    .reverse()
    .find(entry => toDateKey(entry.createdAt) === todayKey);
  const recentEntries = normalizedEntries.filter(entry => startOfDay(entry.createdAt) >= sevenDaysAgo);
  const average = recentEntries.length
    ? recentEntries.reduce((sum, entry) => sum + entry.score, 0) / recentEntries.length
    : 0;
  const latestForEachDay = getLatestMoodByDay(normalizedEntries);
  const streak = countMoodStreak(latestForEachDay, todayKey);

  setText("#todayMoodLabel", latestToday?.mood || "No mood yet");
  setText("#todayMoodEmoji", moodDetails[latestToday?.mood]?.emoji || "🙂");
  setText("#averageMoodValue", `${average.toFixed(1)} / 5.0`);
  setText("#averageMoodEmoji", getAverageMoodEmoji(average, moodDetails));
  setText("#moodStreakValue", `${streak} ${streak === 1 ? "day" : "days"}`);
  setText("#moodStreakText", streak ? "Keep it up!" : "Start today");

  document.querySelectorAll(".mood-choice").forEach(choice => {
    choice.classList.toggle("selected-mood", choice.dataset.mood === latestToday?.mood);
  });

  renderMoodHistory(box, latestForEachDay, moodDetails);
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function clampMoodScore(score) {
  return Math.min(Math.max(score, 1), 5);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateKey(date) {
  const day = startOfDay(date);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

function getLatestMoodByDay(entries) {
  return entries.reduce((days, entry) => {
    days[toDateKey(entry.createdAt)] = entry;
    return days;
  }, {});
}

function countMoodStreak(entriesByDay, todayKey) {
  let streak = 0;
  let cursor = new Date(`${todayKey}T00:00:00`);

  while (entriesByDay[toDateKey(cursor)]) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }

  return streak;
}

function getAverageMoodEmoji(average, moodDetails) {
  if (average >= 4.5) return moodDetails.Amazing.emoji;
  if (average >= 3.5) return moodDetails.Good.emoji;
  if (average >= 2.5) return moodDetails.Okay.emoji;
  if (average >= 1.5) return moodDetails.Bad.emoji;
  return average ? moodDetails["Very Bad"].emoji : "🙂";
}

function renderMoodHistory(box, entriesByDay, moodDetails) {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = startOfDay(new Date());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getTime() - (6 - index) * dayMs);
    const key = toDateKey(date);
    return {
      date,
      entry: entriesByDay[key]
    };
  });
  const points = days
    .map((day, index) => {
      if (!day.entry) return null;
      const x = ((index + 0.5) / 7) * 100;
      const y = 76 - ((day.entry.score - 1) / 4) * 56;
      return { x, y, entry: day.entry };
    })
    .filter(Boolean);
  const labels = days.map(day => day.date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }));

  if (!points.length) {
    box.innerHTML = `<div class="empty-mood-history">Choose a mood to start your history</div>`;
    return;
  }

  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const markers = points.map(point => `
    <span class="mood-history-point" style="left:${point.x}%;top:${point.y}%">
      <b>${moodDetails[point.entry.mood]?.emoji || "🙂"}</b>
      <i></i>
    </span>
  `).join("");

  box.innerHTML = `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Mood history chart">
      <polyline points="7,76 93,76" fill="none" stroke="#cbd5e1" stroke-width="1" vector-effect="non-scaling-stroke"></polyline>
      <path d="${path}" fill="none" stroke="#ec4899" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>
    </svg>
    ${markers}
    <div class="mood-history-labels">${labels.map(label => `<span>${label}</span>`).join("")}</div>
  `;
}

function setupNotificationsPage() {
  const eventBox = document.querySelector("#notificationEvents");
  const markAll = document.querySelector("#markAll");
  if (markAll) {
    markAll.addEventListener("click", () => {
      document.querySelectorAll(".list div.unread").forEach(item => item.classList.remove("unread"));
      document.querySelectorAll(".list .notification-event").forEach(item => item.classList.add("read"));
      const unreadCount = document.querySelector("#unreadCount");
      if (unreadCount) unreadCount.textContent = "0 unread notifications";
      markNotificationsReadNow();
      safe(async () => api("/notifications/read", { method: "PUT" }));
    });
  }

  if (!eventBox) {
    document.querySelectorAll(".list > div:not(.tabs)").forEach(item => {
      item.addEventListener("click", () => {
        item.classList.remove("unread");
        const unread = document.querySelectorAll(".list div.unread").length;
        const unreadCount = document.querySelector("#unreadCount");
        if (unreadCount) unreadCount.textContent = `${unread} unread notifications`;
      });
    });
  }

  document.querySelectorAll(".tabs button").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach(btn => btn.classList.remove("active-tab"));
      tab.classList.add("active-tab");
      activeNotificationTab = tab.dataset.notificationTab || "all";
      if (eventBox) renderNotificationEvents();
    });
  });
}
