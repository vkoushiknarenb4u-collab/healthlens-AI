const $ = (selector) => document.querySelector(selector);
const pdfInput = $('#pdf-input');
const dropZone = $('#drop-zone');
const analyzeButton = $('#analyze-button');
const selectedFileBox = $('#selected-file');
const uploadProgress = $('#upload-progress');
const uploadError = $('#upload-error');
const setupHint = $('#setup-hint');
const dashboard = $('#dashboard');
const sideNav = $('.side-nav');

function setActiveNavLink(link) {
  sideNav?.querySelectorAll('a').forEach((item) => item.classList.toggle('active', item === link));
}

sideNav?.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (link) setActiveNavLink(link);
});

$('#reports-link')?.addEventListener('click', (event) => {
  if (dashboard.hidden) {
    event.preventDefault();
    setActiveNavLink(sideNav?.querySelector('a[href="#upload"]'));
    $('#upload').scrollIntoView({ behavior: 'smooth', block: 'center' });
    dropZone.focus({ preventScroll: true });
  }
});

$('#health-insights-link')?.addEventListener('click', (event) => {
  event.preventDefault();
  const destination = dashboard.hidden ? $('#health-insights-preview') : $('#health-insights-results');
  destination?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
let selectedFile = null;
let currentReport = null;
let currentSessionId = null;
let chatHistory = [];
let currentFilter = 'all';
let chatBusy = false;
let analyzing = false;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setUploadError(message = '') {
  uploadError.textContent = message;
  uploadError.hidden = !message;
}

function selectFile(file) {
  if (analyzing) return;
  setUploadError('');
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && !['application/pdf', 'application/octet-stream'].includes(file.type))) {
    selectedFile = null;
    selectedFileBox.hidden = true;
    analyzeButton.disabled = true;
    setUploadError('Please choose a PDF blood report.');
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    selectedFile = null;
    selectedFileBox.hidden = true;
    analyzeButton.disabled = true;
    setUploadError('This file is larger than 15 MB. Choose a smaller PDF.');
    return;
  }
  selectedFile = file;
  $('#file-name').textContent = file.name;
  $('#file-size').textContent = formatSize(file.size);
  selectedFileBox.hidden = false;
  uploadProgress.hidden = true;
  analyzeButton.disabled = false;
}

pdfInput.addEventListener('change', () => selectFile(pdfInput.files?.[0]));
$('#remove-file').addEventListener('click', () => {
  selectedFile = null;
  pdfInput.value = '';
  selectedFileBox.hidden = true;
  analyzeButton.disabled = true;
  setUploadError('');
});

dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    pdfInput.click();
  }
});
for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragging');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragging');
  });
}
dropZone.addEventListener('drop', (event) => selectFile(event.dataTransfer?.files?.[0]));

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

fetch('/api/status').then(readJson).then((status) => {
  setupHint.hidden = Boolean(status.ready);
}).catch(() => {
  setupHint.hidden = false;
  setupHint.textContent = 'The server could not be reached. Start the app with npm start and try again.';
});

function updateProgress(percent, message) {
  $('#progress-number').textContent = `${percent}%`;
  $('#progress-message').textContent = message;
  $('#progress-fill').style.width = `${percent}%`;
}

function analyzeSelectedFile() {
  if (!selectedFile || analyzeButton.disabled || analyzing) return;
  analyzing = true;
  dropZone.style.pointerEvents = 'none';
  setUploadError('');
  uploadProgress.hidden = false;
  selectedFileBox.hidden = true;
  analyzeButton.disabled = true;
  analyzeButton.querySelector('span:first-child').textContent = 'Analyzing report…';
  updateProgress(0, 'Sending your report securely…');

  const data = new FormData();
  data.append('report', selectedFile);
  const request = new XMLHttpRequest();
  let progressTimer;
  request.open('POST', '/api/analyze');
  request.timeout = 180000;
  request.upload.addEventListener('progress', (event) => {
    if (event.lengthComputable) {
      const percentage = Math.min(69, Math.round((event.loaded / event.total) * 69));
      updateProgress(percentage, 'Sending your report securely…');
    }
  });
  request.upload.addEventListener('load', () => {
    updateProgress(72, 'Reading test values and reference ranges…');
    let percentage = 72;
    progressTimer = window.setInterval(() => {
      percentage = Math.min(94, percentage + 1);
      updateProgress(percentage, percentage < 86 ? 'Reading test values and reference ranges…' : 'Preparing your report insights…');
    }, 1000);
  });
  request.addEventListener('load', () => {
    window.clearInterval(progressTimer);
    let payload = {};
    try { payload = JSON.parse(request.responseText); } catch { /* handled by the friendly fallback below */ }
    if (request.status < 200 || request.status >= 300) {
      restoreUpload(payload.error || 'The report could not be analyzed. Please try again.');
      return;
    }
    if (!payload.report) {
      restoreUpload('The report could not be analyzed. Please try again.');
      return;
    }
    updateProgress(100, 'Your report is ready.');
    currentReport = payload.report;
    currentSessionId = payload.sessionId;
    chatHistory = [];
    renderReport(currentReport);
    window.setTimeout(() => {
      document.body.classList.add('has-report');
      dashboard.hidden = false;
      setActiveNavLink($('#reports-link'));
      dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      resetChat();
      analyzeButton.querySelector('span:first-child').textContent = 'Analyze my report';
      analyzing = false;
      dropZone.style.pointerEvents = '';
    }, 220);
  });
  request.addEventListener('error', () => {
    window.clearInterval(progressTimer);
    restoreUpload('Could not connect to the analysis service. Check your connection and try again.');
  });
  request.addEventListener('timeout', () => {
    window.clearInterval(progressTimer);
    restoreUpload('Analysis took too long. Please try again with a smaller or clearer PDF.');
  });
  request.send(data);
}

function restoreUpload(message) {
  analyzing = false;
  dropZone.style.pointerEvents = '';
  uploadProgress.hidden = true;
  selectedFileBox.hidden = !selectedFile;
  analyzeButton.disabled = !selectedFile;
  analyzeButton.querySelector('span:first-child').textContent = 'Analyze my report';
  setUploadError(message);
}

analyzeButton.addEventListener('click', analyzeSelectedFile);

function statusLabel(status) {
  return ({ NORMAL: 'Normal', HIGH: 'High', LOW: 'Low', BORDERLINE: 'Attention', UNAVAILABLE: 'Unavailable', INSUFFICIENT_DATA: 'Insufficient data' })[status] || 'Unavailable';
}

function testValue(test) {
  if (test.value === null || test.value === undefined) return test.qualitative_value && test.qualitative_value !== 'Unavailable' ? test.qualitative_value : 'Unavailable';
  return Number.isInteger(test.value) ? String(test.value) : String(Number(test.value.toFixed(3)));
}

function riskSymbol(name) {
  if (/anemia/i.test(name)) return '◉';
  if (/diabetes/i.test(name)) return '✳';
  if (/cardio/i.test(name)) return '♥';
  if (/kidney/i.test(name)) return '⌁';
  if (/liver/i.test(name)) return '◒';
  return '✳';
}

function isAbnormal(test) {
  return ['LOW', 'HIGH', 'BORDERLINE'].includes(test.status);
}

function rangeBar(test) {
  if (typeof test.value !== 'number' || !test.reference_range) return '';
  const match = test.reference_range.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (!match) return '';
  const low = Number(match[1]);
  const high = Number(match[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return '';
  const marker = Math.max(2, Math.min(98, ((test.value - low) / (high - low)) * 100));
  return `<div class="explanation-item wide range-explanation"><b>Your value against this report's range</b><div class="range-labels"><span>${escapeHtml(low)}</span><span>Reported range</span><span>${escapeHtml(high)}</span></div><div class="range-track"><span class="range-marker" style="left:${marker}%"></span></div><p class="range-caption">The marker uses the reference range printed next to this test.</p></div>`;
}

function renderTestCard(test) {
  const value = testValue(test);
  const unit = test.unit === 'Unavailable' ? '' : ` <small>${escapeHtml(test.unit)}</small>`;
  const explanation = test.explanation || {};
  const factors = Array.isArray(explanation.common_factors) ? explanation.common_factors : [];
  return `<details class="test-card status-${escapeHtml(test.status)}" ${isAbnormal(test) ? 'open' : ''}>
    <summary><span class="test-indicator"></span><span class="test-name">${escapeHtml(test.name)}</span><span class="test-result">${escapeHtml(value)}${unit}</span><span class="test-range">Range <b>${escapeHtml(test.reference_range || 'Unavailable')}</b></span><span class="status-pill status-${escapeHtml(test.status)}">${escapeHtml(statusLabel(test.status))}</span><span class="test-chevron" aria-hidden="true">⌄</span></summary>
    <div class="test-explanation">
      <div class="explanation-item"><b>What it measures</b><p>${escapeHtml(explanation.what_it_measures || 'An explanation was not available in the report analysis.')}</p></div>
      <div class="explanation-item"><b>What this may mean</b><p>${escapeHtml(explanation.potential_meaning || 'This result should be considered alongside your other results and health history.')}</p></div>
      ${factors.length ? `<div class="explanation-item wide"><b>Common factors that can affect it</b><div class="factor-list">${factors.map((factor) => `<span>${escapeHtml(factor)}</span>`).join('')}</div></div>` : ''}
      ${explanation.discuss_with_doctor ? `<div class="explanation-item wide"><b>Worth discussing with your doctor</b><p>${escapeHtml(explanation.discuss_with_doctor)}</p></div>` : ''}
      ${rangeBar(test)}
      ${isAbnormal(test) ? '<div class="explanation-caution">An out-of-range result does not confirm a health condition. Your clinician can interpret it with your medical history.</div>' : ''}
    </div>
  </details>`;
}

function renderReport(report) {
  const tests = Array.isArray(report.tests) ? report.tests : [];
  const abnormal = tests.filter(isAbnormal);
  const normalCount = tests.filter((test) => test.status === 'NORMAL').length;
  const attentionCount = abnormal.length;
  const unavailableCount = Math.max(0, tests.length - normalCount - attentionCount);
  const patient = report.patient_information || {};
  const reportDate = patient.report_date && patient.report_date !== 'Unavailable' ? patient.report_date : 'Unavailable';
  const patientBits = [
    ['Patient', patient.name], ['Age', patient.age], ['Sex', patient.sex], ['Clinician', patient.clinician]
  ].filter(([, value]) => value && value !== 'Unavailable');

  $('#report-date').textContent = reportDate === 'Unavailable' ? 'DATE UNAVAILABLE' : reportDate.toUpperCase();
  $('#report-meta').textContent = `Analyzed ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}${selectedFile ? ` · ${selectedFile.name}` : ''}`;
  $('#summary-copy').textContent = report.summary || 'A summary was not available for this report.';
  const missingData = Array.isArray(report.missing_data) ? report.missing_data.filter(Boolean) : [];
  $('#missing-data-note').innerHTML = missingData.length
    ? `<strong>Not found or unclear in this report:</strong> ${missingData.map(escapeHtml).join(' · ')}`
    : '';
  $('#missing-data-note').hidden = missingData.length === 0;
  $('#patient-info').innerHTML = patientBits.map(([label, value]) => `<span><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</span>`).join('');
  $('#test-count').textContent = String(tests.length);
  const normalPercent = tests.length ? (normalCount / tests.length) * 100 : 0;
  const attentionPercent = tests.length ? (attentionCount / tests.length) * 100 : 0;
  $('#donut-chart').style.setProperty('--normal', `${normalPercent}%`);
  $('#donut-chart').style.setProperty('--attention', `${attentionPercent}%`);
  $('#distribution-legend').innerHTML = [
    ['Normal', normalCount, '#4ca68a'], ['Needs attention', attentionCount, '#d8a457'], ['Unavailable', unavailableCount, '#c8d5d0']
  ].map(([label, count, color]) => `<div class="legend-row"><span class="legend-dot" style="--legend-color:${color}"></span><span>${label}</span><b>${count}</b></div>`).join('');

  $('#finding-count').textContent = `${attentionCount} ${attentionCount === 1 ? 'finding' : 'findings'}`;
  $('#review-status').classList.toggle('attention', attentionCount > 0);
  $('#status-text').textContent = tests.length === 0 ? 'No results detected' : attentionCount ? 'Some values need attention' : 'No out-of-range values reported';
  const findingsGrid = $('#findings-grid');
  findingsGrid.innerHTML = attentionCount ? abnormal.slice(0, 6).map((test) => {
    const explainer = test.explanation?.potential_meaning || 'Discuss this result with your healthcare professional.';
    const unit = test.unit === 'Unavailable' ? '' : ` ${escapeHtml(test.unit)}`;
    return `<article class="finding-card status-${escapeHtml(test.status)}"><div class="finding-top"><strong>${escapeHtml(test.name)}</strong><span class="status-pill status-${escapeHtml(test.status)}">${escapeHtml(statusLabel(test.status))}</span></div><div class="finding-value">${escapeHtml(testValue(test))}<small>${unit}</small></div><p>${escapeHtml(explainer)}</p></article>`;
  }).join('') : `<div class="finding-empty">${tests.length ? 'No results were marked outside their printed reference ranges in this report.' : 'No test results could be identified. Please check that you selected a legible blood-test PDF.'}</div>`;

  const explanationList = $('#ai-explanation-list');
  explanationList.innerHTML = attentionCount ? abnormal.map((test) => {
    const explanation = test.explanation || {};
    return `<article class="ai-explanation-card"><div class="ai-explanation-mark">✳</div><div class="ai-explanation-content"><div class="ai-explanation-title"><h4>${escapeHtml(test.name)}</h4><span class="status-pill status-${escapeHtml(test.status)}">${escapeHtml(statusLabel(test.status))}</span></div><p>${escapeHtml(explanation.potential_meaning || 'This value may need context from your healthcare professional.')}</p>${explanation.discuss_with_doctor ? `<small>Consider asking: ${escapeHtml(explanation.discuss_with_doctor)}</small>` : ''}</div></article>`;
  }).join('') : `<div class="finding-empty">${tests.length ? 'There were no abnormal results to explain. All values marked in the report are within their stated ranges.' : 'An explanation will appear here when test values can be read from your report.'}</div>`;

  const risks = Array.isArray(report.possible_risks) ? report.possible_risks : [];
  $('#risk-grid').innerHTML = risks.map((risk) => {
    const details = risk.category === 'INSUFFICIENT_DATA' && risk.missing_data?.length
      ? `${risk.basis} Missing: ${risk.missing_data.slice(0, 4).join(', ')}${risk.missing_data.length > 4 ? '…' : ''}`
      : risk.basis;
    return `<article class="risk-card"><div class="risk-card-head"><span class="risk-symbol">${riskSymbol(risk.name)}</span><span class="status-pill status-${escapeHtml(risk.category)}">${escapeHtml(statusLabel(risk.category))}</span></div><h4>${escapeHtml(risk.name)} risk</h4><p class="risk-missing">${escapeHtml(details)}</p></article>`;
  }).join('');

  $('#all-count').textContent = String(tests.length);
  $('#attention-count').textContent = String(attentionCount);
  renderTestList(tests);
  currentFilter = 'all';
  document.querySelectorAll('.filter-tab').forEach((button) => button.classList.toggle('active', button.dataset.filter === 'all'));

  const suggestions = Array.isArray(report.suggestions) ? report.suggestions.filter(Boolean) : [];
  $('#suggestion-list').innerHTML = (suggestions.length ? suggestions : ['Ask your clinician how these results fit with your health history.', 'Follow any follow-up plan recommended by your healthcare professional.']).map((suggestion) => `<li>${escapeHtml(suggestion)}</li>`).join('');
  const questions = Array.isArray(report.questions_to_discuss_with_doctor) ? report.questions_to_discuss_with_doctor.filter(Boolean) : [];
  $('#question-list').innerHTML = (questions.length ? questions : ['Are any of these results important to follow up?', 'Do I need repeat testing or additional context?']).map((question) => `<li>${escapeHtml(question)}</li>`).join('');
}

function renderTestList(tests) {
  const shown = currentFilter === 'attention' ? tests.filter(isAbnormal) : tests;
  $('#test-list').innerHTML = shown.map(renderTestCard).join('');
  $('#empty-results').hidden = tests.length !== 0;
  if (currentFilter === 'attention' && shown.length === 0) {
    $('#test-list').innerHTML = '<div class="finding-empty">No results were marked as low, high, or needing attention in the report.</div>';
  }
}

document.querySelectorAll('.filter-tab').forEach((button) => button.addEventListener('click', () => {
  currentFilter = button.dataset.filter;
  document.querySelectorAll('.filter-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
  renderTestList(currentReport?.tests || []);
}));

function addChatMessage(role, text, options = {}) {
  const message = document.createElement('div');
  message.className = `chat-message ${role === 'assistant' ? 'assistant-message' : 'user-message'}${options.typing ? ' typing-message' : ''}`;
  if (role === 'assistant') {
    const avatar = document.createElement('span');
    avatar.className = 'message-avatar';
    avatar.textContent = '✳';
    message.append(avatar);
  }
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  message.append(paragraph);
  $('#chat-messages').append(message);
  $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
  return message;
}

function resetChat() {
  $('#chat-messages').replaceChildren();
  addChatMessage('assistant', 'I can help explain the values in your report. What would you like to understand?');
  $('#quick-prompts').hidden = false;
}

async function sendQuestion(question) {
  if (chatBusy || !currentReport || !question.trim()) return;
  const cleanQuestion = question.trim();
  $('#quick-prompts').hidden = true;
  addChatMessage('user', cleanQuestion);
  const pending = addChatMessage('assistant', 'Reviewing the report…', { typing: true });
  chatBusy = true;
  $('#chat-form button').disabled = true;
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentSessionId, question: cleanQuestion, history: chatHistory })
    });
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error || 'The question could not be answered. Try again.');
    pending.querySelector('p').textContent = result.answer;
    pending.classList.remove('typing-message');
    chatHistory.push({ role: 'user', text: cleanQuestion }, { role: 'assistant', text: result.answer });
  } catch (error) {
    pending.querySelector('p').textContent = error.message || 'Could not reach the assistant. Please try again.';
    pending.classList.remove('typing-message');
  } finally {
    chatBusy = false;
    $('#chat-form button').disabled = false;
    $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
  }
}

$('#chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#chat-input');
  const question = input.value;
  if (!question.trim()) return;
  input.value = '';
  sendQuestion(question);
});
document.querySelectorAll('[data-chat-prompt]').forEach((button) => button.addEventListener('click', () => sendQuestion(button.dataset.chatPrompt)));

$('#new-report-button').addEventListener('click', () => {
  if (currentSessionId) fetch(`/api/session/${encodeURIComponent(currentSessionId)}`, { method: 'DELETE' }).catch(() => {});
  document.body.classList.remove('has-report');
  dashboard.hidden = true;
  setActiveNavLink(sideNav?.querySelector('a[href="#top"]'));
  currentReport = null;
  currentSessionId = null;
  chatHistory = [];
  chatBusy = false;
  analyzing = false;
  dropZone.style.pointerEvents = '';
  selectedFile = null;
  pdfInput.value = '';
  selectedFileBox.hidden = true;
  uploadProgress.hidden = true;
  analyzeButton.disabled = true;
  analyzeButton.querySelector('span:first-child').textContent = 'Analyze my report';
  setUploadError('');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
