// Zudent Attendance Analyzer Frontend Engine

let currentAttendanceData = null;
let statusInterval = null;

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
const courseSearchInput = document.getElementById('courseSearchInput');

// Simulator Elements
const simCourseSelect = document.getElementById('simCourseSelect');
const simUpcomingHeld = document.getElementById('simUpcomingHeld');
const simUpcomingAttended = document.getElementById('simUpcomingAttended');
const simHeldVal = document.getElementById('simHeldVal');
const simAttVal = document.getElementById('simAttVal');
const simCurrentPct = document.getElementById('simCurrentPct');
const simProjectedPct = document.getElementById('simProjectedPct');
const simChangePct = document.getElementById('simChangePct');
const simStatusPill = document.getElementById('simStatusPill');
const simAdviceText = document.getElementById('simAdviceText');

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
  const target = parseFloat(targetPercentSelect.value);
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

  // Profile
  studentName.textContent = profile.name || 'Student';
  studentAvatar.textContent = (profile.name || 'S').charAt(0).toUpperCase();
  studentUsn.textContent = profile.usn || 'N/A';
  studentInstitution.textContent = profile.institution || 'RoveLabs Institution';
  studentProgram.textContent = profile.program || 'Engineering';
  studentTerm.textContent = `Term ${profile.current_term || 1}`;

  // Summary KPIs
  const overallPct = summary.overall_percentage || 0.0;
  overallPercentage.textContent = `${overallPct.toFixed(2)}%`;
  overallProgressBar.style.width = `${Math.min(100, overallPct)}%`;
  overallFractionText.textContent = `Attended ${summary.total_attended || 0} of ${summary.total_held || 0} classes`;

  // Status Badge
  overallStatusBadge.className = 'px-2.5 py-0.5 text-xs font-bold rounded-full';
  if (overallPct >= 85) {
    overallStatusBadge.classList.add('bg-emerald-100', 'text-emerald-800');
    overallStatusBadge.textContent = 'Healthy (≥85%)';
    overallProgressBar.className = 'h-2 rounded-full bg-emerald-500 transition-all duration-500';
  } else if (overallPct >= 75) {
    overallStatusBadge.classList.add('bg-amber-100', 'text-amber-800');
    overallStatusBadge.textContent = 'Moderate (75-84%)';
    overallProgressBar.className = 'h-2 rounded-full bg-amber-500 transition-all duration-500';
  } else {
    overallStatusBadge.classList.add('bg-rose-100', 'text-rose-800');
    overallStatusBadge.textContent = 'Critical (<75%)';
    overallProgressBar.className = 'h-2 rounded-full bg-rose-500 transition-all duration-500';
  }

  // Classes numbers
  totalAttendedCount.textContent = summary.total_attended || 0;
  totalHeldCount.textContent = summary.total_held || 0;
  totalMissedText.textContent = `Missed: ${summary.total_missed || 0} classes total`;

  // Target metrics for overall
  const targetKey = String(target) in (summary.metrics?.targets || {}) ? String(target) : 'custom';
  const overallTargetInfo = summary.metrics?.targets?.[targetKey] || summary.metrics?.targets?.['75'] || {};
  
  if (overallTargetInfo.achieved) {
    bunkAllowedCount.textContent = overallTargetInfo.bunks_allowed ?? 0;
    bunkAllowedCount.className = 'text-4xl font-extrabold text-emerald-600';
    bunkAdviceMessage.innerHTML = `<span class="text-emerald-700 font-semibold">Safe!</span> You can miss up to <strong>${overallTargetInfo.bunks_allowed}</strong> class(es) overall and remain above ${target}%.`;
  } else {
    bunkAllowedCount.textContent = overallTargetInfo.classes_needed ?? 0;
    bunkAllowedCount.className = 'text-4xl font-extrabold text-rose-600';
    bunkAdviceMessage.innerHTML = `<span class="text-rose-700 font-semibold">Attention!</span> You must attend <strong>${overallTargetInfo.classes_needed}</strong> consecutive classes without missing to reach ${target}%.`;
  }

  // Risk count
  const atRisk = courses.filter(c => c.exact_percentage < target && c.classes_held > 0).length;
  riskCount.textContent = atRisk;
  riskCount.className = atRisk > 0 ? 'text-4xl font-extrabold text-rose-600' : 'text-4xl font-extrabold text-emerald-600';
  totalCoursesBadge.textContent = `Total: ${courses.length} Courses`;

  // Render Courses Table
  renderCoursesTable(courses, target);

  // Initialize Simulator Dropdown
  initSimulator(courses, summary, target);
}

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
    const isHealthy = pct >= 85;
    const isSafe = pct >= 75;

    let statusBadge = '';
    let pctColor = 'text-slate-900';
    let progressBg = 'bg-slate-200';

    if (pct >= 85) {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Healthy</span>`;
      pctColor = 'text-emerald-600';
      progressBg = 'bg-emerald-500';
    } else if (pct >= 75) {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">Moderate</span>`;
      pctColor = 'text-amber-600';
      progressBg = 'bg-amber-500';
    } else {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">Critical</span>`;
      pctColor = 'text-rose-600';
      progressBg = 'bg-rose-500';
    }

    // Target advice
    const targetKey = String(target) in (c.metrics?.targets || {}) ? String(target) : 'custom';
    const targetInfo = c.metrics?.targets?.[targetKey] || c.metrics?.targets?.['75'] || {};
    let adviceHtml = '';

    if (c.classes_held === 0) {
      adviceHtml = '<span class="text-xs text-slate-400 italic">No classes conducted</span>';
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
      <td class="py-4 px-6">
        <div class="font-bold text-slate-900">${escapeHtml(c.course_name || c.course_code)}</div>
        <div class="text-xs text-slate-400 font-mono mt-0.5">${escapeHtml(c.course_code)}</div>
      </td>
      <td class="py-4 px-4 text-xs text-slate-600 font-medium">
        ${escapeHtml(c.faculty_name || 'N/A')}
      </td>
      <td class="py-4 px-4 text-center">
        ${typeIcon}
      </td>
      <td class="py-4 px-6 text-center">
        <div class="inline-flex items-center space-x-1.5 font-mono text-sm bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
          <span class="font-bold text-blue-600">${c.classes_attended}</span>
          <span class="text-slate-400">/</span>
          <span class="font-bold text-slate-700">${c.classes_held}</span>
        </div>
      </td>
      <td class="py-4 px-6 text-right">
        <div class="font-extrabold text-base ${pctColor}">${pct.toFixed(2)}%</div>
        <div class="w-20 bg-slate-100 rounded-full h-1.5 ml-auto mt-1 overflow-hidden">
          <div class="h-1.5 rounded-full ${progressBg}" style="width: ${Math.min(100, pct)}%"></div>
        </div>
      </td>
      <td class="py-4 px-6 text-center">
        ${statusBadge}
      </td>
      <td class="py-4 px-6">
        ${adviceHtml}
      </td>
    `;
    coursesTableBody.appendChild(tr);
  });
}

// Course Filter Search
courseSearchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  const rows = coursesTableBody.querySelectorAll('tr');
  rows.forEach(row => {
    const text = row.innerText.toLowerCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });
});

// Simulator Initializer
function initSimulator(courses, summary, target) {
  simCourseSelect.innerHTML = '<option value="overall">Overall (All Subjects Combined)</option>';
  courses.forEach((c, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = `${c.course_code} - ${c.course_name}`;
    simCourseSelect.appendChild(opt);
  });

  simUpcomingHeld.addEventListener('input', () => {
    simUpcomingAttended.max = simUpcomingHeld.value;
    if (parseInt(simUpcomingAttended.value) > parseInt(simUpcomingHeld.value)) {
      simUpcomingAttended.value = simUpcomingHeld.value;
    }
    updateSimulator();
  });

  simUpcomingAttended.addEventListener('input', updateSimulator);
  simCourseSelect.addEventListener('change', updateSimulator);

  updateSimulator();
}

function updateSimulator() {
  if (!currentAttendanceData) return;

  const target = parseFloat(targetPercentSelect.value) || 75.0;
  const selVal = simCourseSelect.value;
  const upcomingHeld = parseInt(simUpcomingHeld.value);
  const upcomingAtt = parseInt(simUpcomingAttended.value);

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
  simChangePct.className = diff >= 0 ? 'text-2xl font-bold text-emerald-400' : 'text-2xl font-bold text-rose-400';

  if (newPct >= 85) {
    simStatusPill.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30';
    simStatusPill.textContent = 'Healthy (≥85%)';
  } else if (newPct >= 75) {
    simStatusPill.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30';
    simStatusPill.textContent = 'Moderate (75-84%)';
  } else {
    simStatusPill.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-400/30';
    simStatusPill.textContent = 'Critical (<75%)';
  }

  const courseLabel = selVal === 'overall' ? 'overall attendance' : 'attendance for this course';
  if (newPct >= target) {
    simAdviceText.innerHTML = `If you attend <strong>${upcomingAtt}</strong> of the next <strong>${upcomingHeld}</strong> classes, your ${courseLabel} will be <strong>${newPct.toFixed(2)}%</strong>, safely meeting your target of ${target}%.`;
  } else {
    simAdviceText.innerHTML = `Warning: Attending <strong>${upcomingAtt}</strong> of the next <strong>${upcomingHeld}</strong> classes will keep your ${courseLabel} at <strong>${newPct.toFixed(2)}%</strong>, which is <span class="text-rose-400 font-bold">below</span> your ${target}% target.`;
  }
}

// Demo Data Generator
function loadDemoData() {
  const demoCourses = [
    {
      course_code: "21CS61",
      course_name: "Software Engineering & Project Management",
      faculty_name: "Dr. Ananya Sharma",
      course_type: "theory",
      classes_attended: 28,
      classes_held: 32,
      exact_percentage: 87.50,
      metrics: {
        targets: {
          "75": { achieved: true, bunks_allowed: 5, classes_needed: 0 },
          "85": { achieved: true, bunks_allowed: 0, classes_needed: 0 }
        }
      }
    },
    {
      course_code: "21CS62",
      course_name: "Full Stack Web Development",
      faculty_name: "Prof. Rajesh Kumar",
      course_type: "theory",
      classes_attended: 31,
      classes_held: 34,
      exact_percentage: 91.18,
      metrics: {
        targets: {
          "75": { achieved: true, bunks_allowed: 7, classes_needed: 0 },
          "85": { achieved: true, bunks_allowed: 2, classes_needed: 0 }
        }
      }
    },
    {
      course_code: "21CS63",
      course_name: "Machine Learning & AI",
      faculty_name: "Dr. Sandeep Rao",
      course_type: "theory",
      classes_attended: 22,
      classes_held: 30,
      exact_percentage: 73.33,
      metrics: {
        targets: {
          "75": { achieved: false, bunks_allowed: 0, classes_needed: 2 },
          "85": { achieved: false, bunks_allowed: 0, classes_needed: 26 }
        }
      }
    },
    {
      course_code: "21CSL66",
      course_name: "Full Stack Development Laboratory",
      faculty_name: "Prof. Rajesh Kumar",
      course_type: "lab",
      classes_attended: 14,
      classes_held: 14,
      exact_percentage: 100.0,
      metrics: {
        targets: {
          "75": { achieved: true, bunks_allowed: 4, classes_needed: 0 },
          "85": { achieved: true, bunks_allowed: 2, classes_needed: 0 }
        }
      }
    },
    {
      course_code: "21CSL67",
      course_name: "Machine Learning Laboratory",
      faculty_name: "Dr. Sandeep Rao",
      course_type: "lab",
      classes_attended: 11,
      classes_held: 13,
      exact_percentage: 84.62,
      metrics: {
        targets: {
          "75": { achieved: true, bunks_allowed: 1, classes_needed: 0 },
          "85": { achieved: false, bunks_allowed: 0, classes_needed: 1 }
        }
      }
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
      overall_percentage: overallPct,
      metrics: {
        targets: {
          "75": { achieved: true, bunks_allowed: 14, classes_needed: 0 },
          "85": { achieved: true, bunks_allowed: 0, classes_needed: 0 }
        }
      }
    },
    courses: demoCourses
  };

  renderAttendanceData(demoData, 75.0);
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

