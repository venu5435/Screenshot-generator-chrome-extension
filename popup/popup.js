/**
 * Website Screenshots Generator - Popup UI Controller
 * Manages form interactions, active tab URL detection, live background state sync, and real-time logs.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements - Panels
  const setupPanel = document.getElementById('setupPanel');
  const progressPanel = document.getElementById('progressPanel');
  const completionPanel = document.getElementById('completionPanel');
  const errorPanel = document.getElementById('errorPanel');

  // DOM Elements - Status Badge
  const statusBadge = document.getElementById('statusBadge');
  const statusBadgeText = document.getElementById('statusBadgeText');

  // DOM Elements - Inputs
  const targetUrlInput = document.getElementById('targetUrl');
  const urlErrorHint = document.getElementById('urlErrorHint');
  const maxPagesInput = document.getElementById('maxPages');
  const crawlDepthInput = document.getElementById('crawlDepth');
  const btnUseCurrentTab = document.getElementById('btnUseCurrentTab');
  const btnSelectAllVp = document.getElementById('btnSelectAllVp');
  const btnDeselectAllVp = document.getElementById('btnDeselectAllVp');
  const vpCheckboxes = Array.from(document.querySelectorAll('.viewport-grid input[type="checkbox"]'));

  // DOM Elements - Actions
  const btnStartCapture = document.getElementById('btnStartCapture');
  const btnCancelCapture = document.getElementById('btnCancelCapture');
  const btnStartNewJob = document.getElementById('btnStartNewJob');
  const btnDismissError = document.getElementById('btnDismissError');

  // DOM Elements - Progress & Metrics
  const progressPhaseLabel = document.getElementById('progressPhaseLabel');
  const progressPercentValue = document.getElementById('progressPercentValue');
  const progressBarFill = document.getElementById('progressBarFill');
  const statPages = document.getElementById('statPages');
  const statViewport = document.getElementById('statViewport');
  const statScreenshots = document.getElementById('statScreenshots');
  const currentActionText = document.getElementById('currentActionText');
  const logList = document.getElementById('logList');
  const logCountBadge = document.getElementById('logCountBadge');

  // DOM Elements - Completion & Error
  const zipFilenameText = document.getElementById('zipFilenameText');
  const errorMessageText = document.getElementById('errorMessageText');

  /**
   * Switches visible panel with proper transitions.
   */
  function showPanel(panelToShow) {
    [setupPanel, progressPanel, completionPanel, errorPanel].forEach(panel => {
      if (panel === panelToShow) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    });
  }

  /**
   * Updates status badge in header.
   */
  function setStatusBadge(status) {
    statusBadge.className = `status-badge ${status}`;
    const statusMap = {
      idle: 'Ready',
      crawling: 'Crawling',
      capturing: 'Capturing',
      zipping: 'Packaging',
      completed: 'Done',
      cancelled: 'Cancelled',
      error: 'Error'
    };
    statusBadgeText.textContent = statusMap[status] || status;
  }

  /**
   * Appends or re-renders activity log items.
   */
  function renderLogs(logs = []) {
    logList.innerHTML = '';
    logs.forEach(log => {
      const item = document.createElement('div');
      item.className = `log-item ${log.level || 'info'}`;
      
      const timeSpan = document.createElement('span');
      timeSpan.className = 'log-time';
      timeSpan.textContent = `[${log.time}]`;

      const textSpan = document.createElement('span');
      textSpan.className = 'log-text';
      textSpan.textContent = log.text;

      item.appendChild(timeSpan);
      item.appendChild(textSpan);
      logList.appendChild(item);
    });

    logCountBadge.textContent = `${logs.length} entries`;
    // Auto-scroll to bottom of logs
    logList.scrollTop = logList.scrollHeight;
  }

  /**
   * Renders UI based on entire job state.
   */
  function renderState(state) {
    if (!state) return;

    setStatusBadge(state.status);

    if (state.status === 'idle') {
      showPanel(setupPanel);
      return;
    }

    if (state.status === 'crawling' || state.status === 'capturing' || state.status === 'zipping') {
      showPanel(progressPanel);

      const percent = state.progressPercent || 0;
      progressBarFill.style.width = `${percent}%`;
      progressPercentValue.textContent = `${percent}%`;

      if (state.status === 'crawling') {
        progressPhaseLabel.textContent = 'Discovering internal pages...';
        statPages.textContent = `${state.totalDiscoveredPages || 0} found`;
        statViewport.textContent = 'Analyzing DOM';
        statScreenshots.textContent = 'Pending';
      } else if (state.status === 'capturing') {
        progressPhaseLabel.textContent = `Capturing Page ${state.currentPageIndex || 1} of ${state.totalDiscoveredPages || 1}`;
        statPages.textContent = `${state.currentPageIndex || 1} / ${state.totalDiscoveredPages || 1}`;
        statViewport.textContent = state.currentViewportName || '-';
        statScreenshots.textContent = `${state.completedCapturesCount || 0} / ${state.totalCapturesCount || 0}`;
      } else if (state.status === 'zipping') {
        progressPhaseLabel.textContent = 'Building ZIP Archive...';
        statViewport.textContent = 'Packaging';
      }

      if (state.logs && state.logs.length > 0) {
        const lastLog = state.logs[state.logs.length - 1];
        currentActionText.textContent = lastLog.text;
        renderLogs(state.logs);
      }
      return;
    }

    if (state.status === 'completed') {
      showPanel(completionPanel);
      zipFilenameText.textContent = state.zipFilename || 'website-screenshots.zip';
      return;
    }

    if (state.status === 'error') {
      showPanel(errorPanel);
      errorMessageText.textContent = state.error || 'An unknown error occurred during capture.';
      return;
    }

    if (state.status === 'cancelled') {
      showPanel(setupPanel);
      setStatusBadge('cancelled');
    }
  }

  /**
   * Auto-detect and pre-fill active tab URL if available.
   */
  async function detectActiveTabUrl() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        targetUrlInput.value = tab.url;
        urlErrorHint.classList.add('hidden');
      }
    } catch {
      // Ignored
    }
  }

  // --- EVENT LISTENERS ---

  // Use Current Tab Button
  btnUseCurrentTab.addEventListener('click', async () => {
    await detectActiveTabUrl();
  });

  // Select All / None Viewports
  btnSelectAllVp.addEventListener('click', () => {
    vpCheckboxes.forEach(cb => cb.checked = true);
  });

  btnDeselectAllVp.addEventListener('click', () => {
    vpCheckboxes.forEach(cb => cb.checked = false);
  });

  // Real-time URL validation on input
  targetUrlInput.addEventListener('input', () => {
    urlErrorHint.classList.add('hidden');
  });

  // Start Capture Button
  btnStartCapture.addEventListener('click', async () => {
    let rawUrl = targetUrlInput.value.trim();
    if (!rawUrl) {
      urlErrorHint.textContent = 'Please enter a target website URL.';
      urlErrorHint.classList.remove('hidden');
      targetUrlInput.focus();
      return;
    }

    // Auto prepend https if omitted
    if (!/^https?:\/\//i.test(rawUrl)) {
      rawUrl = 'https://' + rawUrl;
      targetUrlInput.value = rawUrl;
    }

    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only HTTP and HTTPS protocols are supported.');
      }
    } catch {
      urlErrorHint.textContent = 'Please enter a valid website URL (e.g. https://example.com).';
      urlErrorHint.classList.remove('hidden');
      targetUrlInput.focus();
      return;
    }

    const selectedViewportIds = vpCheckboxes
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    if (selectedViewportIds.length === 0) {
      alert('Please select at least one device viewport to capture.');
      return;
    }

    const maxPages = Math.min(Math.max(parseInt(maxPagesInput.value, 10) || 5, 1), 20);
    const maxDepth = Math.min(Math.max(parseInt(crawlDepthInput.value, 10) || 1, 0), 3);

    const config = {
      targetUrl: rawUrl,
      maxPages,
      maxDepth,
      selectedViewportIds
    };

    // Transition to progress view immediately
    showPanel(progressPanel);
    setStatusBadge('crawling');
    progressBarFill.style.width = '5%';
    progressPercentValue.textContent = '5%';
    progressPhaseLabel.textContent = 'Starting crawler...';
    currentActionText.textContent = `Connecting to ${rawUrl}...`;
    renderLogs([{ time: new Date().toLocaleTimeString('en-US', { hour12: false }), text: `Initiating crawl on ${rawUrl}`, level: 'info' }]);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'START_JOB',
        config
      });

      if (response && !response.success) {
        showPanel(errorPanel);
        errorMessageText.textContent = response.error || 'Failed to start capture job.';
      }
    } catch (err) {
      showPanel(errorPanel);
      errorMessageText.textContent = err.message || 'Failed to communicate with service worker.';
    }
  });

  // Cancel Button
  btnCancelCapture.addEventListener('click', async () => {
    btnCancelCapture.textContent = 'Cancelling...';
    btnCancelCapture.disabled = true;
    try {
      await chrome.runtime.sendMessage({ type: 'CANCEL_JOB' });
    } catch {
      // Ignored
    } finally {
      setTimeout(() => {
        btnCancelCapture.textContent = 'Cancel Job';
        btnCancelCapture.disabled = false;
        showPanel(setupPanel);
        setStatusBadge('idle');
      }, 800);
    }
  });

  // Start New Job Button (from completion screen)
  btnStartNewJob.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'RESET_STATE' });
    } catch {
      // Ignored
    }
    showPanel(setupPanel);
    setStatusBadge('idle');
  });

  // Dismiss Error Button
  btnDismissError.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'RESET_STATE' });
    } catch {
      // Ignored
    }
    showPanel(setupPanel);
    setStatusBadge('idle');
  });

  // Listen for broadcast state updates from Background Service Worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_UPDATED') {
      renderState(message.state);
    }
  });

  // Fetch initial state on popup load
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (res && res.state) {
      if (res.state.status === 'idle') {
        await detectActiveTabUrl();
      }
      renderState(res.state);
    } else {
      await detectActiveTabUrl();
    }
  } catch {
    await detectActiveTabUrl();
  }
});
