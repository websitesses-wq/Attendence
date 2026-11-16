// Zudent Attendance Analyzer Frontend Engine

let currentAttendanceData = null;
let statusInterval = null;

// ── Dark Mode Toggle ──────────────────────────────────────────────────────────
(function initDarkMode() {
  const toggle = document.getElementById('themeToggle');
  const body   = document.body;

  // Restore saved preference
  if (localStorage.getItem('theme') === 'dark') body.classList.add('dark');

  toggle.addEventListener('click', () => {
    body.classList.toggle('dark');
    localStorage.setItem('theme', body.classList.contains('dark') ? 'dark' : 'light');
  });
})();

// DOM Elements
const form = document.getElementById('attendanceForm');
const emailInput = document.getElementById('studentEmail');
const passwordInput = document.getElementById('studentPassword');
const togglePasswordBtn = document.getElementById('togglePassword');
const targetPercentSelect = document.getElementById('targetPercent');
const submitBtn = document.getElementById('submitBtn');
const demoBtn = document.getElementById('demoBtn');

const statusContainer = document.getElementById('statusContainer');
const statusMessage = document.getElementById('statusMessage');
const statusTimer = document.getElementById('statusTimer');
const progressBar = document.getElementById('progressBar');
const errorAlert = document.getElementById('errorAlert');
const errorMessage = document.getElementById('errorMessage');

const emptyState = document.getElementById('emptyState');
const resultsSection = document.getElementById('resultsSection');

// Table & Profile Elements
const studentName = document.getElementById('studentName');
const studentAvatar = document.getElementById('studentAvatar');
const studentUsn = document.getElementById('studentUsn');
const studentInstitution = document.getElementById('studentInstitution');
const studentProgram = document.getElementById('studentProgram');
const studentTerm = document.getElementById('studentTerm');
const printBtn = document.getElementById('printBtn');

// KPI Elements
const overallPercentage = document.getElementById('overallPercentage');
const overallProgressBar = document.getElementById('overallProgressBar');
const overallStatusBadge = document.getElementById('overallStatusBadge');
const overallFractionText = document.getElementById('overallFractionText');
const totalAttendedCount = document.getElementById('totalAttendedCount');
const totalHeldCount = document.getElementById('totalHeldCount');
const totalMissedText = document.getElementById('totalMissedText');
const bunkAllowedCount = document.getElementById('bunkAllowedCount');
const bunkAdviceMessage = document.getElementById('bunkAdviceMessage');
const riskCount = document.getElementById('riskCount');
const totalCoursesBadge = document.getElementById('totalCoursesBadge');
const coursesTableBody = document.getElementById('coursesTableBody');
const mobileCoursesBody = document.getElementById('mobileCoursesBody');
const courseSearchInput = document.getElementById('courseSearchInput');

// Simulator Elements
const simCourseSelect = document.getElementById('simCourseSelect');
const simTargetPercent = document.getElementById('simTargetPercent');
const simUpcomingHeld = document.getElementById('simUpcomingHeld');
const simUpcomingAttended = document.getElementById('simUpcomingAttended');
const simHeldVal = document.getElementById('simHeldVal');
const simAttVal = document.getElementById('simAttVal');
const simCurrentPct = document.getElementById('simCurrentPct');
const simProjectedPct = document.getElementById('simProjectedPct');
const simChangePct = document.getElementById('simChangePct');
const simStatusPill = document.getElementById('simStatusPill');
const simAdviceText = document.getElementById('simAdviceText');

// ── Unified Dynamic Status Resolver (Changes with Selected Target %) ──────────
function getAttendanceStatus(percentage, target) {
  if (percentage >= target) {
    return {
      label: `Healthy (≥${target}%)`,
      shortLabel: "Healthy",
      color: "emerald",
      badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
      textClass: "text-emerald-600",
      barClass: "bg-emerald-500",
      pillClass: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30"
    };
  }
  const warnThreshold = Math.max(0, target - 10);
  if (percentage >= warnThreshold) {
    return {
      label: `Moderate (<${target}%)`,
      shortLabel: "Moderate",
      color: "amber",
      badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
      textClass: "text-amber-600",
      barClass: "bg-amber-500",
      pillClass: "bg-amber-500/20 text-amber-300 border-amber-400/30"
    };
  }
  return {
    label: `Critical (<${warnThreshold}%)`,
    shortLabel: "Critical",
    color: "rose",
    badgeClass: "bg-rose-100 text-rose-800 border-rose-200",
    textClass: "text-rose-600",
    barClass: "bg-rose-500",
    pillClass: "bg-rose-500/20 text-rose-300 border-rose-400/30"
  };
}

// ── Mathematical Metric Calculation (Client-Side Instant Engine) ──────────────
function calcMetrics(attended, held, target) {
  if (held === 0) {
    return {
      status: "No Classes",
      status_color: "gray",
      target_percent: target,
      achieved: false,
      bunks_allowed: 0,
      classes_needed: 0,
      message: "No classes conducted yet."
    };
  }

  const curr = (attended / held) * 100;
  const t = target / 100.0;
  const statusInfo = getAttendanceStatus(curr, target);

  if (curr >= target) {
    const bunks = t > 0 ? Math.max(0, Math.floor((attended - t * held) / t)) : 0;
    return {
      status: statusInfo.shortLabel,
      status_color: statusInfo.color,
      target_percent: target,
      achieved: true,
      bunks_allowed: bunks,
      classes_needed: 0,
      message: `Safe! You can miss ${bunks} more class(es) and remain above ${target}%.`
    };
  } else {
    const need = t < 1.0 ? Math.ceil(((t * held) - attended) / (1.0 - t)) : 9999;
    const classesNeeded = Math.max(1, need);
    return {
      status: statusInfo.shortLabel,
      status_color: statusInfo.color,
      target_percent: target,
      achieved: false,
      bunks_allowed: 0,
      classes_needed: classesNeeded,
      message: `Attend ${classesNeeded} consecutive class(es) without missing to reach ${target}%.`
    };
  }
}

// ── Unified Live Target Controller (Synchronizes Top & Simulator Selectors) ───
function setTargetPercentage(val) {
  const newTarget = parseFloat(val) || 85.0;
  if (targetPercentSelect && targetPercentSelect.value !== String(newTarget)) {
    targetPercentSelect.value = String(newTarget);
  }
  if (simTargetPercent && simTargetPercent.value !== String(newTarget)) {
    simTargetPercent.value = String(newTarget);
  }
  if (currentAttendanceData) {
    renderAttendanceData(currentAttendanceData, newTarget);
    alignAttendedToTarget();
    updateSimulator();
  }
}

if (targetPercentSelect) {
  targetPercentSelect.addEventListener('change', (e) => {
    setTargetPercentage(e.target.value);
  });
}

if (simTargetPercent) {
  simTargetPercent.addEventListener('change', (e) => {
    setTargetPercentage(e.target.value);
  });
}

// Toggle Password Visibility
togglePasswordBtn.addEventListener('click', () => {
  const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
  passwordInput.setAttribute('type', type);
  togglePasswordBtn.innerHTML = type === 'password' 
    ? '<i class="fa-regular fa-eye"></i>' 
    : '<i class="fa-regular fa-eye-slash"></i>';
});

// Print Button
printBtn.addEventListener('click', () => {
  window.print();
});

// Demo Data Loader
demoBtn.addEventListener('click', () => {
  emailInput.value = "demo.student@university.edu";
  passwordInput.value = "••••••••••••";
  loadDemoData();
});

// Form Submission
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const target = parseFloat(targetPercentSelect.value) || 85.0;
  const mode = document.querySelector('input[name="fetchMode"]:checked').value;

  if (!email || !password) return;

  startLoading(mode);

  try {
    const response = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, mode, target })
    });

    let result;
    const rawText = await response.text();
    try {
      result = JSON.parse(rawText);
    } catch (parseErr) {
      throw new Error(`Server response error (${response.status}): ${rawText.substring(0, 150) || 'Invalid server response'}`);
    }

    if (!response.ok || !result.success) {
      const err = result.detail || result.message || 'Failed to fetch attendance.';
      throw new Error(err);
    }

    stopLoading();
    renderAttendanceData(result.data, target);
  } catch (err) {
    stopLoading();
    showError(err.message);
  }
});

function startLoading(mode) {
  errorAlert.classList.add('hidden');
  statusContainer.classList.remove('hidden');
  submitBtn.disabled = true;

  let elapsed = 0;
  statusTimer.textContent = '0.0s';
  progressBar.style.width = '20%';

  const steps = mode === 'browser' ? [
    { at: 0.5, msg: "Launching Playwright browser engine...", width: "25%" },
    { at: 2.0, msg: "Navigating to https://zudent.rovelabs.com/login...", width: "45%" },
    { at: 4.5, msg: "Submitting student credentials...", width: "65%" },
    { at: 7.0, msg: "Navigating to Courses section (/app/admin/academics)...", width: "85%" },
    { at: 9.0, msg: "Inspecting attendance cards and calculating exact percentages...", width: "95%" }
  ] : [
    { at: 0.2, msg: "Authenticating with Zudent AWS Cognito...", width: "30%" },
    { at: 0.6, msg: "Querying student profile and semester registration...", width: "55%" },
    { at: 1.0, msg: "Fetching enrolled courses from AppSync GraphQL...", width: "80%" },
    { at: 1.3, msg: "Computing exact xx/xx attendance percentages & bunks...", width: "95%" }
  ];

  statusInterval = setInterval(() => {
    elapsed += 0.1;
    statusTimer.textContent = elapsed.toFixed(1) + 's';

    for (let i = steps.length - 1; i >= 0; i--) {
      if (elapsed >= steps[i].at) {
        statusMessage.textContent = steps[i].msg;
        progressBar.style.width = steps[i].width;
        break;
      }
    }
  }, 100);
}

function stopLoading() {
  clearInterval(statusInterval);
  statusContainer.classList.add('hidden');
  submitBtn.disabled = false;
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorAlert.classList.remove('hidden');
}

function renderAttendanceData(data, target) {
  currentAttendanceData = data;
  emptyState.classList.add('hidden');
  resultsSection.classList.remove('hidden');

  const profile = data.student_profile || {};
  const summary = data.overall_summary || {};
  const courses = data.courses || [];

  // Profile Info
  if (studentName) studentName.textContent = profile.name || 'Student';
  if (studentAvatar) studentAvatar.textContent = (profile.name || 'S').charAt(0).toUpperCase();
  if (studentUsn) studentUsn.textContent = profile.usn || 'N/A';
  if (studentInstitution) studentInstitution.textContent = profile.institution || 'RoveLabs Institution';
  if (studentProgram) studentProgram.textContent = profile.program || 'Engineering';
  if (studentTerm) studentTerm.textContent = `Term ${profile.current_term || 1}`;

  // Overall Attendance KPI
  const totalAtt = summary.total_attended || 0;
  const totalHeld = summary.total_held || 0;
  const overallPct = totalHeld > 0 ? (totalAtt / totalHeld * 100) : 0.0;
  
  overallPercentage.textContent = `${overallPct.toFixed(2)}%`;
  overallProgressBar.style.width = `${Math.min(100, overallPct)}%`;
  overallFractionText.textContent = `Attended ${totalAtt} of ${totalHeld} classes`;

  // Status Badge for Overall (Dynamically Evaluated Against Chosen Target)
  const overallStatus = getAttendanceStatus(overallPct, target);
  overallStatusBadge.className = `px-2 py-0.5 text-[10px] sm:text-xs font-bold rounded-full ${overallStatus.badgeClass}`;
  overallStatusBadge.textContent = overallStatus.label;
  overallProgressBar.className = `h-1.5 rounded-full ${overallStatus.barClass} transition-all duration-500`;

  // Classes Numbers
  totalAttendedCount.textContent = totalAtt;
  totalHeldCount.textContent = totalHeld;
  totalMissedText.textContent = `Missed: ${Math.max(0, totalHeld - totalAtt)} total`;

  // Dynamic Bunk / Advice for Overall (Instant Recomputation)
  const overallTargetInfo = calcMetrics(totalAtt, totalHeld, target);
  if (overallTargetInfo.achieved) {
    bunkAllowedCount.textContent = overallTargetInfo.bunks_allowed;
    bunkAllowedCount.className = 'text-2xl sm:text-4xl font-extrabold text-emerald-600';
    bunkAdviceMessage.innerHTML = `<span class="text-emerald-700 font-semibold">Safe!</span> Can miss <strong>${overallTargetInfo.bunks_allowed}</strong> class(es) above ${target}%.`;
  } else {
    bunkAllowedCount.textContent = overallTargetInfo.classes_needed;
    bunkAllowedCount.className = 'text-2xl sm:text-4xl font-extrabold text-rose-600';
    bunkAdviceMessage.innerHTML = `<span class="text-rose-700 font-semibold">Need:</span> Attend <strong>${overallTargetInfo.classes_needed}</strong> classes for ${target}%.`;
  }

  // Dynamic Risk Count for Chosen Target
  const atRisk = courses.filter(c => (c.exact_percentage ?? 0) < target && (c.classes_held ?? 0) > 0).length;
  riskCount.textContent = atRisk;
  riskCount.className = atRisk > 0 ? 'text-2xl sm:text-4xl font-extrabold text-rose-600' : 'text-2xl sm:text-4xl font-extrabold text-emerald-600';
  totalCoursesBadge.textContent = `Total: ${courses.length} Courses`;

  // Render Both Desktop Table & Mobile Cards
  renderCoursesTable(courses, target);
  renderMobileCards(courses, target);

  // Initialize Simulator Dropdown
  initSimulator(courses, summary, target);
}

// ── Desktop Table View ────────────────────────────────────────────────────────
function renderCoursesTable(courses, target) {
  coursesTableBody.innerHTML = '';

  if (courses.length === 0) {
    coursesTableBody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">No course attendance records found.</td></tr>`;
    return;
  }

  courses.forEach(c => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/80 transition-colors';

    const pct = c.exact_percentage ?? 0.0;
    const targetInfo = calcMetrics(c.classes_attended || 0, c.classes_held || 0, target);

    const statusInfo = getAttendanceStatus(pct, target);
    const statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusInfo.badgeClass} border">${statusInfo.shortLabel}</span>`;
    const pctColor = statusInfo.textClass;
    const progressBg = statusInfo.barClass;

    let adviceHtml = '';
    if (c.classes_held === 0) {
      adviceHtml = '<span class="text-xs text-slate-400 italic">No classes held</span>';
    } else if (targetInfo.achieved) {
      adviceHtml = `<div class="text-xs text-emerald-700 font-medium flex items-center space-x-1.5">
        <i class="fa-solid fa-circle-check text-emerald-500"></i>
        <span>Can bunk <strong>${targetInfo.bunks_allowed}</strong> class(es)</span>
      </div>`;
    } else {
      adviceHtml = `<div class="text-xs text-rose-700 font-medium flex items-center space-x-1.5">
        <i class="fa-solid fa-triangle-exclamation text-rose-500"></i>
        <span>Must attend <strong>${targetInfo.classes_needed}</strong> class(es)</span>
      </div>`;
    }

    const typeIcon = (c.course_type || '').toLowerCase() === 'lab' 
      ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 uppercase">Lab</span>'
      : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 uppercase">Theory</span>';

    tr.innerHTML = `
      <td class="py-3 px-5">
        <div class="font-bold text-slate-900">${escapeHtml(c.course_name || c.course_code)}</div>
        <div class="text-xs text-slate-400 font-mono mt-0.5">${escapeHtml(c.course_code)}</div>
      </td>
      <td class="py-3 px-3 text-xs text-slate-600 font-medium">
        ${escapeHtml(c.faculty_name || 'N/A')}
      </td>
      <td class="py-3 px-3 text-center">
        ${typeIcon}
      </td>
      <td class="py-3 px-4 text-center">
        <div class="inline-flex items-center space-x-1.5 font-mono text-sm bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
          <span class="font-bold text-blue-600">${c.classes_attended}</span>
          <span class="text-slate-400">/</span>
          <span class="font-bold text-slate-700">${c.classes_held}</span>
        </div>
      </td>
      <td class="py-3 px-4 text-right">
        <div class="font-extrabold text-base ${pctColor}">${pct.toFixed(2)}%</div>
        <div class="w-20 bg-slate-100 rounded-full h-1.5 ml-auto mt-1 overflow-hidden">
          <div class="h-1.5 rounded-full ${progressBg}" style="width: ${Math.min(100, pct)}%"></div>
        </div>
      </td>
      <td class="py-3 px-4 text-center">
        ${statusBadge}
      </td>
      <td class="py-3 px-5">
        ${adviceHtml}
      </td>
    `;
    coursesTableBody.appendChild(tr);
  });
}

// ── Mobile Cards View (Phones & Small Screens) ───────────────────────────────
function renderMobileCards(courses, target) {
  if (!mobileCoursesBody) return;
  mobileCoursesBody.innerHTML = '';

  if (courses.length === 0) {
    mobileCoursesBody.innerHTML = `<div class="py-6 text-center text-slate-400 text-xs">No course attendance records found.</div>`;
    return;
  }

  courses.forEach(c => {
    const card = document.createElement('div');
    card.className = 'course-mobile-card bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-sm space-y-2.5';

    const pct = c.exact_percentage ?? 0.0;
    const targetInfo = calcMetrics(c.classes_attended || 0, c.classes_held || 0, target);

    const statusInfo = getAttendanceStatus(pct, target);
    const statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${statusInfo.badgeClass} border">${statusInfo.shortLabel}</span>`;
    const pctColor = statusInfo.textClass;
    const progressBg = statusInfo.barClass;

    let adviceBoxHtml = '';
    if (c.classes_held === 0) {
      adviceBoxHtml = `<div class="p-2 rounded-xl bg-slate-50 border border-slate-200 text-center text-[11px] text-slate-400 italic">No classes held yet</div>`;
    } else if (targetInfo.achieved) {
      adviceBoxHtml = `<div class="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200/60 flex items-center justify-between text-xs">
        <span class="text-[10.5px] font-medium text-emerald-800">Target ${target}%:</span>
        <span class="font-bold text-emerald-700 flex items-center gap-1">
          <i class="fa-solid fa-circle-check text-emerald-500"></i>
          <span>Can bunk <strong>${targetInfo.bunks_allowed}</strong> class(es)</span>
        </span>
      </div>`;
    } else {
      adviceBoxHtml = `<div class="p-2 rounded-xl bg-rose-50/70 border border-rose-200/60 flex items-center justify-between text-xs">
        <span class="text-[10.5px] font-medium text-rose-800">Target ${target}%:</span>
        <span class="font-bold text-rose-700 flex items-center gap-1">
          <i class="fa-solid fa-triangle-exclamation text-rose-500"></i>
          <span>Must attend <strong>${targetInfo.classes_needed}</strong> class(es)</span>
        </span>
      </div>`;
    }

    const typeIcon = (c.course_type || '').toLowerCase() === 'lab' 
      ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 uppercase">Lab</span>'
      : '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 uppercase">Theory</span>';

    const missed = Math.max(0, (c.classes_held || 0) - (c.classes_attended || 0));

    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <h4 class="font-bold text-slate-900 text-xs sm:text-sm leading-snug line-clamp-2">${escapeHtml(c.course_name || c.course_code)}</h4>
          <div class="text-[10.5px] text-slate-400 font-mono mt-0.5 truncate">${escapeHtml(c.course_code)} &bull; ${escapeHtml(c.faculty_name || 'N/A')}</div>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          ${typeIcon}
          ${statusBadge}
        </div>
      </div>

      <div class="flex items-end justify-between pt-0.5">
        <div>
          <span class="text-[9.5px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">Classes (Attended / Held)</span>
          <div class="inline-flex items-center gap-1 font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
            <span class="text-blue-600">${c.classes_attended}</span>
            <span class="text-slate-400">/</span>
            <span class="font-bold text-slate-700">${c.classes_held}</span>
            <span class="text-[10px] text-slate-400 font-normal ml-0.5">(${missed} missed)</span>
          </div>
        </div>

        <div class="text-right">
          <div class="font-black text-xl ${pctColor}">${pct.toFixed(2)}%</div>
        </div>
      </div>

      <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div class="h-1.5 rounded-full ${progressBg} transition-all duration-300" style="width: ${Math.min(100, pct)}%"></div>
      </div>

      ${adviceBoxHtml}
    `;

    mobileCoursesBody.appendChild(card);
  });
}

// ── Course Search / Filter (Filters both desktop table & mobile cards) ───────
courseSearchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();

  // Desktop table filter
  const rows = coursesTableBody.querySelectorAll('tr');
  rows.forEach(row => {
    const text = row.innerText.toLowerCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });

  // Mobile cards filter
  if (mobileCoursesBody) {
    const cards = mobileCoursesBody.querySelectorAll('.course-mobile-card');
    cards.forEach(card => {
      const text = card.innerText.toLowerCase();
      card.style.display = text.includes(query) ? '' : 'none';
    });
  }
});

// ── Align 'Classes to Attend' to Match Selected Target Percentage ──────────────
function alignAttendedToTarget() {
  if (!currentAttendanceData || !simUpcomingHeld || !simUpcomingAttended) return;

  const target = parseFloat(simTargetPercent?.value || targetPercentSelect?.value) || 85.0;
  const selVal = simCourseSelect.value;
  const upcomingHeld = parseInt(simUpcomingHeld.value) || 1;

  // Keep slider bounds synchronized
  simUpcomingAttended.max = upcomingHeld;

  let currentAtt = 0;
  let currentHeld = 0;

  if (selVal === 'overall') {
    currentAtt = currentAttendanceData.overall_summary.total_attended || 0;
    currentHeld = currentAttendanceData.overall_summary.total_held || 0;
  } else {
    const c = currentAttendanceData.courses[parseInt(selVal)];
    if (c) {
      currentAtt = c.classes_attended || 0;
      currentHeld = c.classes_held || 0;
    }
  }

  // Minimum required classes to attend out of upcoming to reach/maintain target:
  // (currentAtt + A) / (currentHeld + upcomingHeld) >= t
  const t = target / 100.0;
  const totalFutureHeld = currentHeld + upcomingHeld;
  let needed = Math.ceil(t * totalFutureHeld - currentAtt);

  // Clamp within bounds [0, upcomingHeld]
  if (needed < 0) needed = 0;
  if (needed > upcomingHeld) needed = upcomingHeld;

  simUpcomingAttended.value = needed;
}

// ── Simulator Initializer ─────────────────────────────────────────────────────
let simListenersAttached = false;

function initSimulator(courses, summary, target) {
  if (simTargetPercent && target) {
    simTargetPercent.value = String(target);
  }
  if (targetPercentSelect && target) {
    targetPercentSelect.value = String(target);
  }

  simCourseSelect.innerHTML = '<option value="overall">Overall (All Subjects Combined)</option>';
  courses.forEach((c, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = `${c.course_code} - ${c.course_name}`;
    simCourseSelect.appendChild(opt);
  });

  if (!simListenersAttached) {
    // When moving Upcoming Classes slider:
    // Automatically calculate and align the classes you will attend to match the selected target percentage!
    simUpcomingHeld.addEventListener('input', () => {
      alignAttendedToTarget();
      updateSimulator();
    });

    // When moving 'Classes You Will Attend' slider manually:
    // Upcoming classes STAY THE SAME; only recalculate the projection!
    simUpcomingAttended.addEventListener('input', () => {
      updateSimulator();
    });

    // When changing selected course:
    // Align to match the target percentage for that course!
    simCourseSelect.addEventListener('change', () => {
      alignAttendedToTarget();
      updateSimulator();
    });

    simListenersAttached = true;
  }

  alignAttendedToTarget();
  updateSimulator();
}

function updateSimulator() {
  if (!currentAttendanceData) return;

  const target = parseFloat(simTargetPercent?.value || targetPercentSelect?.value) || 85.0;
  const selVal = simCourseSelect.value;
  const upcomingHeld = parseInt(simUpcomingHeld.value) || 1;
  
  simUpcomingAttended.max = upcomingHeld;
  if (parseInt(simUpcomingAttended.value) > upcomingHeld) {
    simUpcomingAttended.value = upcomingHeld;
  }
  const upcomingAtt = parseInt(simUpcomingAttended.value) || 0;

  simHeldVal.textContent = `${upcomingHeld} classes`;
  simAttVal.textContent = `${upcomingAtt} classes`;

  let currentAtt = 0;
  let currentHeld = 0;

  if (selVal === 'overall') {
    currentAtt = currentAttendanceData.overall_summary.total_attended;
    currentHeld = currentAttendanceData.overall_summary.total_held;
  } else {
    const c = currentAttendanceData.courses[parseInt(selVal)];
    if (c) {
      currentAtt = c.classes_attended;
      currentHeld = c.classes_held;
    }
  }

  const currPct = currentHeld > 0 ? (currentAtt / currentHeld * 100) : 0.0;
  const newAtt = currentAtt + upcomingAtt;
  const newHeld = currentHeld + upcomingHeld;
  const newPct = newHeld > 0 ? (newAtt / newHeld * 100) : 0.0;
  const diff = newPct - currPct;

  simCurrentPct.textContent = `${currPct.toFixed(2)}%`;
  simProjectedPct.textContent = `${newPct.toFixed(2)}%`;
  simChangePct.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%`;
  simChangePct.className = diff >= 0 ? 'text-lg sm:text-2xl font-bold text-emerald-400' : 'text-lg sm:text-2xl font-bold text-rose-400';

  const simStatus = getAttendanceStatus(newPct, target);
  simStatusPill.className = `px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${simStatus.pillClass}`;
  simStatusPill.textContent = simStatus.label;

  const courseLabel = selVal === 'overall' ? 'overall attendance' : 'attendance for this course';
  if (newPct >= target) {
    simAdviceText.innerHTML = `If you attend <strong>${upcomingAtt}</strong> of the next <strong>${upcomingHeld}</strong> classes, your ${courseLabel} will be <strong>${newPct.toFixed(2)}%</strong>, safely above your ${target}% target.`;
  } else {
    simAdviceText.innerHTML = `Warning: Attending <strong>${upcomingAtt}</strong> of the next <strong>${upcomingHeld}</strong> classes will result in <strong>${newPct.toFixed(2)}%</strong>, which is <span class="text-rose-400 font-bold">below</span> your ${target}% target.`;
  }
}

// ── Demo Data Generator ───────────────────────────────────────────────────────
function loadDemoData() {
  const currentSelectedTarget = parseFloat(targetPercentSelect.value) || 85.0;

  const demoCourses = [
    {
      course_code: "21CS61",
      course_name: "Software Engineering & Project Management",
      faculty_name: "Dr. Ananya Sharma",
      course_type: "theory",
      classes_attended: 28,
      classes_held: 32,
      exact_percentage: 87.50
    },
    {
      course_code: "21CS62",
      course_name: "Full Stack Web Development",
      faculty_name: "Prof. Rajesh Kumar",
      course_type: "theory",
      classes_attended: 31,
      classes_held: 34,
      exact_percentage: 91.18
    },
    {
      course_code: "21CS63",
      course_name: "Machine Learning & AI",
      faculty_name: "Dr. Sandeep Rao",
      course_type: "theory",
      classes_attended: 22,
      classes_held: 30,
      exact_percentage: 73.33
    },
    {
      course_code: "21CSL66",
      course_name: "Full Stack Development Laboratory",
      faculty_name: "Prof. Rajesh Kumar",
      course_type: "lab",
      classes_attended: 14,
      classes_held: 14,
      exact_percentage: 100.0
    },
    {
      course_code: "21CSL67",
      course_name: "Machine Learning Laboratory",
      faculty_name: "Dr. Sandeep Rao",
      course_type: "lab",
      classes_attended: 11,
      classes_held: 13,
      exact_percentage: 84.62
    }
  ];

  let totalAtt = 0;
  let totalHeld = 0;
  demoCourses.forEach(c => {
    totalAtt += c.classes_attended;
    totalHeld += c.classes_held;
  });

  const overallPct = (totalAtt / totalHeld) * 100;

  const demoData = {
    student_profile: {
      name: "Aditya Verma",
      usn: "1MS21CS042",
      email: "aditya.cs21@college.edu",
      institution: "Ramaiah Institute of Technology (RIT)",
      program: "Computer Science & Engineering",
      current_term: 6
    },
    overall_summary: {
      total_attended: totalAtt,
      total_held: totalHeld,
      total_missed: totalHeld - totalAtt,
      overall_percentage: overallPct
    },
    courses: demoCourses
  };

  renderAttendanceData(demoData, currentSelectedTarget);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
