/**
 * BugFinder Web Application Client
 * Complete state, animation, and API controller
 */

(function () {
  'use strict';

  // --- STATE ---
  const state = {
    user: {
      id: '',
      name: 'Guest',
      email: 'Not signed in',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=guest'
    },
    currentTab: 'debugger', // 'debugger' | 'result' | 'errorLog' | 'projects'
    code: '',
    language: 'auto',
    files: [], // Array of { name, content, size }
    activeFileIndex: -1,
    sampleInput: '',
    sampleOutput: '',
    rightTab: 'input', // 'input' | 'output'
    scopeMode: 'entire', // 'entire' | 'file' | 'lines'
    targetFile: 'main',
    lineFrom: '',
    lineTo: '',
    currentResult: null,
    recents: [],
    errorLogs: [],
    selectedErrorLog: null,
    isProcessing: false,
    diffViewOpen: false
  };

  // --- DOM ELEMENT REFERENCES ---
  const el = {
    introOverlay: document.getElementById('introOverlay'),
    introTitle: document.getElementById('introTitle'),
    bugTriggerBtn: document.getElementById('bugTriggerBtn'),
    bugHintText: document.getElementById('bugHintText'),
    appRoot: document.getElementById('appRoot'),

    sidebar: document.getElementById('sidebar'),
    mobileMenuToggle: document.getElementById('mobileMenuToggle'),
    btnNewSession: document.getElementById('btnNewSession'),
    navDebugger: document.getElementById('navDebugger'),
    navErrorLog: document.getElementById('navErrorLog'),
    navProjects: document.getElementById('navProjects'),
    navSystem: document.getElementById('navSystem'),
    recentItemsList: document.getElementById('recentItemsList'),
    userAvatarImg: document.getElementById('userAvatarImg'),
    userNameTxt: document.getElementById('userNameTxt'),
    userEmailTxt: document.getElementById('userEmailTxt'),
    btnLogout: document.getElementById('btnLogout'),

    // Views
    viewDebugger: document.getElementById('viewDebugger'),
    viewResult: document.getElementById('viewResult'),
    viewErrorLog: document.getElementById('viewErrorLog'),
    viewProjects: document.getElementById('viewProjects'),

    // Box 1 (Code)
    codeLanguageSelect: document.getElementById('codeLanguageSelect'),
    attachedFilesChips: document.getElementById('attachedFilesChips'),
    codeGutter: document.getElementById('codeGutter'),
    codeInput: document.getElementById('codeInput'),
    btnAttachCode: document.getElementById('btnAttachCode'),
    fileInputCode: document.getElementById('fileInputCode'),
    charCountLabel: document.getElementById('charCountLabel'),

    // Box 2 (Sample I/O)
    tabSampleInput: document.getElementById('tabSampleInput'),
    tabSampleOutput: document.getElementById('tabSampleOutput'),
    containerSampleInput: document.getElementById('containerSampleInput'),
    containerSampleOutput: document.getElementById('containerSampleOutput'),
    sampleInputText: document.getElementById('sampleInputText'),
    sampleOutputText: document.getElementById('sampleOutputText'),
    btnAttachIo: document.getElementById('btnAttachIo'),
    fileInputIo: document.getElementById('fileInputIo'),

    btnProceed: document.getElementById('btnProceed'),

    // Scope Modal
    scopeModal: document.getElementById('scopeModal'),
    scopeBtnSpecific: document.getElementById('scopeBtnSpecific'),
    scopeBtnRange: document.getElementById('scopeBtnRange'),
    scopeBtnWhole: document.getElementById('scopeBtnWhole'),
    scopeSpecificSubpanel: document.getElementById('scopeSpecificSubpanel'),
    scopeTargetFileSelect: document.getElementById('scopeTargetFileSelect'),
    scopeRangeSubpanel: document.getElementById('scopeRangeSubpanel'),
    scopeLineFrom: document.getElementById('scopeLineFrom'),
    scopeLineTo: document.getElementById('scopeLineTo'),
    btnCancelScope: document.getElementById('btnCancelScope'),
    btnExecuteScope: document.getElementById('btnExecuteScope'),
    btnExecuteText: document.getElementById('btnExecuteText'),

    // Result View
    btnBackToEditor: document.getElementById('btnBackToEditor'),
    resultEngineBadge: document.getElementById('resultEngineBadge'),
    resTargetFile: document.getElementById('resTargetFile'),
    resLineNumbers: document.getElementById('resLineNumbers'),
    resIssueCountBadge: document.getElementById('resIssueCountBadge'),
    resSummaryText: document.getElementById('resSummaryText'),
    resErrorItemsContainer: document.getElementById('resErrorItemsContainer'),
    fixedCodePre: document.getElementById('fixedCodePre'),
    btnCopyFixedCode: document.getElementById('btnCopyFixedCode'),
    btnDownloadFixedCode: document.getElementById('btnDownloadFixedCode'),
    btnToggleDiffView: document.getElementById('btnToggleDiffView'),
    diffViewContainer: document.getElementById('diffViewContainer'),
    diffOriginalPre: document.getElementById('diffOriginalPre'),
    diffFixedPre: document.getElementById('diffFixedPre'),

    // Error Log View
    logSearchInput: document.getElementById('logSearchInput'),
    previousErrorsList: document.getElementById('previousErrorsList'),
    previousSolutionContainer: document.getElementById('previousSolutionContainer'),

    // Past Projects View
    btnReloadProjects: document.getElementById('btnReloadProjects'),
    projectsGrid: document.getElementById('projectsGrid'),

    // Auth Modal
    authModal: document.getElementById('authModal'),
    btnGoogleSignIn: document.getElementById('btnGoogleSignIn'),
    btnSkipAuth: document.getElementById('btnSkipAuth'),

    // System Modal
    systemModal: document.getElementById('systemModal'),
    systemDbDetails: document.getElementById('systemDbDetails'),
    systemModelName: document.getElementById('systemModelName'),
    btnCloseSystemModal: document.getElementById('btnCloseSystemModal'),

    toastContainer: document.getElementById('toastContainer')
  };

  // --- SUPABASE CLIENT (lazy, loaded from server config) ---
  let _supabase = null;
  async function getSupabase() {
    if (_supabase) return _supabase;
    try {
      const res = await fetch('/api/auth/config');
      const { url, key } = await res.json();
      if (url && key) {
        _supabase = window.supabase.createClient(url, key);
      }
    } catch (e) {
      console.warn('[auth] Could not load Supabase config', e);
    }
    return _supabase;
  }

  // --- INITIALIZATION ---
  async function init() {
    loadUserFromStorage();
    bindEvents();
    updateLineNumbers();
    fetchRecents();
    fetchErrorLogs();

    // Handle OAuth redirect callback (Google redirects back here with a session)
    await handleOAuthCallback();

    // Check if intro has already been experienced in this session
    if (sessionStorage.getItem('bf_intro_seen') === '1') {
      fastForwardIntro();
    }
  }

  // Handle Supabase OAuth redirect (called once on page load)
  async function handleOAuthCallback() {
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token')) return;
    try {
      const sb = await getSupabase();
      if (!sb) return;
      const { data, error } = await sb.auth.getSession();
      if (error || !data.session) return;
      const profile = data.session.user;
      const user = {
        id: profile.id,
        email: profile.email,
        name: profile.user_metadata?.full_name || profile.email.split('@')[0],
        avatar: profile.user_metadata?.avatar_url ||
          `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(profile.email)}`
      };
      // Persist to our backend
      try {
        await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(user)
        });
      } catch {}
      state.user = user;
      localStorage.setItem('bf_user', JSON.stringify(user));
      localStorage.setItem('bf_user_logged', '1');
      renderUserProfile();
      // Clean up hash from URL
      history.replaceState(null, '', window.location.pathname + window.location.search);
      showToast(`Signed in as ${user.name}`, 'success');
      fetchRecents();
      fetchErrorLogs();
    } catch (e) {
      console.warn('[auth] OAuth callback error', e);
    }
  }

  // --- EVENT BINDING ---
  function bindEvents() {
    // 1. Intro Bug Tap
    el.bugTriggerBtn.addEventListener('click', handleBugTap);

    // 2. Mobile Menu
    el.mobileMenuToggle.addEventListener('click', () => {
      el.sidebar.classList.toggle('open');
    });

    // 3. Sidebar Nav
    el.btnNewSession.addEventListener('click', startNewSession);
    el.navDebugger.addEventListener('click', () => switchTab('debugger'));
    el.navErrorLog.addEventListener('click', () => {
      switchTab('errorLog');
      fetchErrorLogs();
    });
    el.navProjects.addEventListener('click', () => {
      switchTab('projects');
      fetchProjects();
    });
    el.navSystem.addEventListener('click', openSystemModal);

    // 4. User Profile / Logout
    el.btnLogout.addEventListener('click', openAuthModal);

    // 5. Code Input & Line Numbers
    el.codeInput.addEventListener('input', () => {
      updateLineNumbers();
      validateProceedState();
    });
    el.codeInput.addEventListener('keydown', handleEditorKeydown);
    el.codeLanguageSelect.addEventListener('change', (e) => {
      state.language = e.target.value;
    });

    // 6. Code File Attachment
    el.btnAttachCode.addEventListener('click', () => el.fileInputCode.click());
    el.fileInputCode.addEventListener('change', handleCodeFileSelect);

    // 7. Sample I/O Tabs
    el.tabSampleInput.addEventListener('click', () => switchRightTab('input'));
    el.tabSampleOutput.addEventListener('click', () => switchRightTab('output'));
    el.btnAttachIo.addEventListener('click', () => el.fileInputIo.click());
    el.fileInputIo.addEventListener('change', handleIoFileSelect);

    // 8. Proceed Button
    el.btnProceed.addEventListener('click', openScopeModal);

    // 9. Scope Modal Controls
    el.scopeBtnSpecific.addEventListener('click', () => setScopeMode('file'));
    el.scopeBtnRange.addEventListener('click', () => setScopeMode('lines'));
    el.scopeBtnWhole.addEventListener('click', () => setScopeMode('entire'));
    el.btnCancelScope.addEventListener('click', closeScopeModal);
    el.btnExecuteScope.addEventListener('click', executeDebuggingAgent);

    // 10. Result Page Actions
    el.btnBackToEditor.addEventListener('click', () => switchTab('debugger'));
    el.btnCopyFixedCode.addEventListener('click', copyFixedCode);
    el.btnDownloadFixedCode.addEventListener('click', downloadFixedCode);
    el.btnToggleDiffView.addEventListener('click', toggleDiffView);

    // 11. Error Log Search
    let searchDebounce = null;
    el.logSearchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        fetchErrorLogs(e.target.value);
      }, 250);
    });

    // 12. Past Projects Actions
    el.btnReloadProjects.addEventListener('click', fetchProjects);

    // 13. Auth Modal Actions
    el.btnGoogleSignIn.addEventListener('click', handleGoogleLogin);
    el.btnSkipAuth.addEventListener('click', closeAuthModal);

    // 14. System Modal
    el.btnCloseSystemModal.addEventListener('click', closeSystemModal);
  }

  // --- INTRO BUG ANIMATION (Matches Video Demo) ---
  function handleBugTap() {
    if (el.bugTriggerBtn.classList.contains('bug-animating')) return;

    // Start Bug animation
    el.bugTriggerBtn.classList.add('bug-animating');
    el.bugHintText.style.opacity = '0';

    // Reveal title after 300ms
    setTimeout(() => {
      el.introTitle.classList.add('revealed');
    }, 300);

    // Complete transition to main website
    setTimeout(() => {
      el.introOverlay.classList.add('finished');
      el.appRoot.classList.add('visible');
      sessionStorage.setItem('bf_intro_seen', '1');

      // Prompt login if new visitor
      if (!localStorage.getItem('bf_user_logged')) {
        setTimeout(openAuthModal, 600);
      }
    }, 1400);
  }

  function fastForwardIntro() {
    el.introOverlay.classList.add('finished');
    el.appRoot.classList.add('visible');
  }

  // --- USER AUTHENTICATION ---
  function loadUserFromStorage() {
    try {
      const stored = localStorage.getItem('bf_user');
      if (stored) {
        state.user = JSON.parse(stored);
      }
    } catch {}
    renderUserProfile();
  }

  function renderUserProfile() {
    el.userNameTxt.textContent = state.user.name || 'Guest';
    el.userEmailTxt.textContent = state.user.email || 'Not signed in';
    el.userAvatarImg.src = state.user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=guest`;
  }

  function openAuthModal() {
    el.authModal.classList.add('open');
  }

  function closeAuthModal() {
    el.authModal.classList.remove('open');
  }

  async function handleGoogleLogin() {
    el.btnGoogleSignIn.disabled = true;
    el.btnGoogleSignIn.querySelector('span').textContent = 'Redirecting to Google…';
    try {
      const sb = await getSupabase();
      if (!sb) throw new Error('Supabase not available');
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/bugfinder/index.html'
        }
      });
      if (error) throw error;
    } catch (e) {
      console.error('[auth] Google login error', e);
      showToast('Google sign-in unavailable. Please try again later.', 'error');
      el.btnGoogleSignIn.disabled = false;
      el.btnGoogleSignIn.querySelector('span').textContent = 'Continue with Google Account';
    }
  }

  // --- CODE EDITOR & GUTTER ---
  function updateLineNumbers() {
    const text = el.codeInput.value || '';
    const lines = text.split('\n').length;
    const gutterHtml = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
    el.codeGutter.innerHTML = gutterHtml;
    el.charCountLabel.textContent = `${lines} line${lines === 1 ? '' : 's'}`;
  }

  function handleEditorKeydown(e) {
    // Support Tab key indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = el.codeInput.selectionStart;
      const end = el.codeInput.selectionEnd;
      el.codeInput.value = el.codeInput.value.substring(0, start) + '  ' + el.codeInput.value.substring(end);
      el.codeInput.selectionStart = el.codeInput.selectionEnd = start + 2;
      updateLineNumbers();
    }
  }

  function validateProceedState() {
    const hasCode = el.codeInput.value.trim().length > 0;
    const hasFiles = state.files.length > 0;
    el.btnProceed.disabled = !hasCode && !hasFiles;
  }

  // --- FILE ATTACHMENTS (Box 1) ---
  function handleCodeFileSelect(e) {
    const fileList = Array.from(e.target.files);
    if (!fileList.length) return;

    let loadedCount = 0;
    fileList.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target.result;
        // Avoid duplicate by name
        state.files = state.files.filter(f => f.name !== file.name);
        state.files.push({
          name: file.name,
          content,
          size: file.size
        });

        loadedCount++;
        if (loadedCount === fileList.length) {
          // If first file, load it into the editor textarea
          if (!el.codeInput.value.trim()) {
            el.codeInput.value = state.files[0].content;
            state.targetFile = state.files[0].name;
            detectAndSetLanguage(state.files[0].name);
            updateLineNumbers();
          }
          renderAttachedFileChips();
          validateProceedState();
          showToast(`Attached ${loadedCount} file(s)`, 'success');
        }
      };
      reader.readAsText(file);
    });

    e.target.value = null;
  }

  function renderAttachedFileChips() {
    if (state.files.length === 0) {
      el.attachedFilesChips.style.display = 'none';
      el.attachedFilesChips.innerHTML = '';
      return;
    }

    el.attachedFilesChips.style.display = 'flex';
    el.attachedFilesChips.innerHTML = state.files.map((f, i) => `
      <span class="file-chip" title="Click to view in editor">
        <span onclick="window.BugFinder.selectFile(${i})" style="cursor:pointer;">${escapeHtml(f.name)}</span>
        <button onclick="window.BugFinder.removeFile(${i})" title="Remove file">&times;</button>
      </span>
    `).join('');
  }

  window.BugFinder = {
    selectFile: (index) => {
      const f = state.files[index];
      if (!f) return;
      el.codeInput.value = f.content;
      state.targetFile = f.name;
      detectAndSetLanguage(f.name);
      updateLineNumbers();
      validateProceedState();
      showToast(`Loaded ${f.name} in editor`, 'info');
    },
    removeFile: (index) => {
      state.files.splice(index, 1);
      renderAttachedFileChips();
      validateProceedState();
    }
  };

  function detectAndSetLanguage(fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'py') el.codeLanguageSelect.value = 'python';
    else if (['js', 'mjs'].includes(ext)) el.codeLanguageSelect.value = 'javascript';
    else if (['ts', 'tsx'].includes(ext)) el.codeLanguageSelect.value = 'typescript';
    else if (['cpp', 'cc'].includes(ext)) el.codeLanguageSelect.value = 'cpp';
    else if (ext === 'java') el.codeLanguageSelect.value = 'java';
    else if (ext === 'go') el.codeLanguageSelect.value = 'go';
    else el.codeLanguageSelect.value = 'auto';
  }

  // --- SAMPLE I/O (Box 2) ---
  function switchRightTab(tab) {
    state.rightTab = tab;
    if (tab === 'input') {
      el.tabSampleInput.classList.add('active');
      el.tabSampleOutput.classList.remove('active');
      el.containerSampleInput.style.display = 'flex';
      el.containerSampleOutput.style.display = 'none';
    } else {
      el.tabSampleInput.classList.remove('active');
      el.tabSampleOutput.classList.add('active');
      el.containerSampleInput.style.display = 'none';
      el.containerSampleOutput.style.display = 'flex';
    }
  }

  function handleIoFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      if (state.rightTab === 'input') {
        el.sampleInputText.value = text;
        showToast(`Loaded test input from ${file.name}`, 'success');
      } else {
        el.sampleOutputText.value = text;
        showToast(`Loaded test output from ${file.name}`, 'success');
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  }

  // --- SCOPE MODAL (Screenshot 819852912_...) ---
  function openScopeModal() {
    // Populate target file selector
    el.scopeTargetFileSelect.innerHTML = '';
    const optionMain = document.createElement('option');
    optionMain.value = 'main';
    optionMain.textContent = 'Main Editor Source Code';
    el.scopeTargetFileSelect.appendChild(optionMain);

    state.files.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.name;
      opt.textContent = `${f.name} (${f.size} bytes)`;
      el.scopeTargetFileSelect.appendChild(opt);
    });

    if (state.files.length > 0) {
      el.scopeTargetFileSelect.value = state.files[0].name;
    }

    setScopeMode('entire');
    el.scopeModal.classList.add('open');
  }

  function closeScopeModal() {
    el.scopeModal.classList.remove('open');
  }

  function setScopeMode(mode) {
    state.scopeMode = mode;
    el.scopeBtnSpecific.classList.toggle('selected', mode === 'file');
    el.scopeBtnRange.classList.toggle('selected', mode === 'lines');
    el.scopeBtnWhole.classList.toggle('selected', mode === 'entire');

    el.scopeSpecificSubpanel.style.display = mode === 'file' ? 'block' : 'none';
    el.scopeRangeSubpanel.style.display = mode === 'lines' ? 'block' : 'none';
  }

  // --- EXECUTE DEBUGGING AGENT ---
  async function executeDebuggingAgent() {
    if (state.isProcessing) return;

    let targetCode = el.codeInput.value;
    let targetFileName = 'main';

    if (state.scopeMode === 'file') {
      targetFileName = el.scopeTargetFileSelect.value;
      const fileObj = state.files.find(f => f.name === targetFileName);
      if (fileObj) {
        targetCode = fileObj.content;
      }
    }

    if (!targetCode.trim()) {
      showToast('Please provide code to debug.', 'error');
      return;
    }

    state.isProcessing = true;
    el.btnExecuteScope.disabled = true;
    el.btnExecuteText.textContent = 'Agent Analyzing...';

    const payload = {
      code: targetCode,
      fileName: targetFileName,
      sampleInput: el.sampleInputText.value.trim(),
      sampleOutput: el.sampleOutputText.value.trim(),
      scopeMode: state.scopeMode,
      lineFrom: state.scopeMode === 'lines' ? el.scopeLineFrom.value : null,
      lineTo: state.scopeMode === 'lines' ? el.scopeLineTo.value : null,
      userId: state.user.id
    };

    try {
      const response = await fetch('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || 'Agent execution failed');
      }

      const result = await response.json();
      state.currentResult = result;
      closeScopeModal();
      renderDebuggingResult(result);
      switchTab('result');
      showToast('Autonomous debugging completed!', 'success');
      fetchRecents();
    } catch (err) {
      console.error('[Client] Debug error:', err);
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      state.isProcessing = false;
      el.btnExecuteScope.disabled = false;
      el.btnExecuteText.textContent = 'Process & Execute';
    }
  }

  // --- RENDER DEBUGGING RESULT (Screenshot 788961493_...) ---
  function renderDebuggingResult(data) {
    const { targetFile = 'main', fixes = [], summary, fixedCode, engine } = data;

    el.resTargetFile.textContent = targetFile;
    
    // Calculate affected lines string
    if (fixes.length > 0) {
      const lines = fixes.map(f => f.lineNumber || f.line).filter(Boolean);
      el.resLineNumbers.textContent = lines.join(', ') || '1';
      el.resIssueCountBadge.textContent = `${fixes.length} Issue${fixes.length === 1 ? '' : 's'} Resolved`;
    } else {
      el.resLineNumbers.textContent = 'None';
      el.resIssueCountBadge.textContent = 'Code Clean & Validated';
    }

    el.resSummaryText.textContent = summary || 'Agent completed logic and boundary verification.';
    el.resultEngineBadge.textContent = `✓ Saved to PostgreSQL Error Log (${engine || 'PostgreSQL'})`;

    // Render each error item
    if (fixes.length === 0) {
      el.resErrorItemsContainer.innerHTML = `
        <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:1.25rem; color:#6ee7b7; font-size:0.85rem;">
          ✓ No bugs or boundary violations detected. Code is fully valid!
        </div>
      `;
    } else {
      el.resErrorItemsContainer.innerHTML = fixes.map(f => `
        <div class="error-item-box">
          <div class="error-item-top">
            <span class="line-badge">Line ${f.lineNumber || f.line}</span>
            <span class="error-type-tag">${escapeHtml(f.errorType || f.type || 'Logic Error')}</span>
          </div>
          <div style="font-size:0.85rem; color:#e2e8f0; margin-bottom:0.6rem;">${escapeHtml(f.description || f.desc || '')}</div>
          
          <div class="diff-grid">
            <div class="diff-original" title="Original Erroneous Line">${escapeHtml(f.originalLine || f.original || '(omitted)')}</div>
            <div class="diff-fixed" title="Corrected Line">${escapeHtml(f.fixedLine || f.fixed || '(corrected)')}</div>
          </div>

          <div class="error-why-text">
            <strong>Change Detail:</strong> ${escapeHtml(f.why || 'Fixed boundary and variable scoping.')}
          </div>
        </div>
      `).join('');
    }

    // Render fixed code with line numbers
    el.fixedCodePre.textContent = fixedCode || '';

    // Prepare diff view
    const originalCode = data.session?.original_code || el.codeInput.value;
    el.diffOriginalPre.textContent = originalCode;
    el.diffFixedPre.textContent = fixedCode;
  }

  function copyFixedCode() {
    const code = el.fixedCodePre.textContent;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      showToast('Fixed code copied to clipboard!', 'success');
    });
  }

  function downloadFixedCode() {
    const code = el.fixedCodePre.textContent;
    if (!code) return;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fixed_${state.currentResult?.targetFile || 'code'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Download started', 'info');
  }

  function toggleDiffView() {
    state.diffViewOpen = !state.diffViewOpen;
    el.diffViewContainer.style.display = state.diffViewOpen ? 'block' : 'none';
    el.btnToggleDiffView.textContent = state.diffViewOpen ? 'Hide Diff' : 'Side-by-Side Diff';
    if (state.diffViewOpen) {
      el.diffViewContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // --- ERROR LOG DATABASE (Video Demo 00:09-00:18) ---
  async function fetchErrorLogs(searchQuery = '') {
    try {
      const url = `/api/logs?userId=${encodeURIComponent(state.user.id)}&q=${encodeURIComponent(searchQuery)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.logs) {
        state.errorLogs = data.logs;
        renderErrorLogs();
      }
    } catch (err) {
      console.warn('[Client] Could not fetch error logs:', err);
    }
  }

  function renderErrorLogs() {
    if (state.errorLogs.length === 0) {
      el.previousErrorsList.innerHTML = `
        <li style="color:rgba(255,255,255,0.4); font-size:0.8rem; list-style:none; padding:1rem 0;">
          No error records found matching query.
        </li>
      `;
      el.previousSolutionContainer.innerHTML = `
        <p style="color:rgba(255,255,255,0.4); font-size:0.8rem; font-style:italic;">
          No solution to display.
        </p>
      `;
      return;
    }

    el.previousErrorsList.innerHTML = state.errorLogs.map((log, idx) => `
      <li class="previous-error-item ${state.selectedErrorLog?.id === log.id ? 'selected' : ''}" 
          onclick="window.BugFinder.selectErrorLog(${idx})">
        <span style="font-weight:700;">${escapeHtml(log.error_type || 'Error')}</span>
        <span style="color:rgba(255,255,255,0.6); font-size:0.75rem;"> — ${escapeHtml(log.target_file || 'file')}, line ${log.line_number || '1'}</span>
      </li>
    `).join('');

    // Select first error if none selected
    if (!state.selectedErrorLog && state.errorLogs.length > 0) {
      selectErrorLog(0);
    } else if (state.selectedErrorLog) {
      renderErrorLogSolution(state.selectedErrorLog);
    }
  }

  function selectErrorLog(index) {
    const log = state.errorLogs[index];
    if (!log) return;
    state.selectedErrorLog = log;

    // Highlight selected in DOM
    const items = el.previousErrorsList.querySelectorAll('.previous-error-item');
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === index);
    });

    renderErrorLogSolution(log);
  }

  window.BugFinder.selectErrorLog = selectErrorLog;

  function renderErrorLogSolution(log) {
    el.previousSolutionContainer.innerHTML = `
      <div style="font-size:0.85rem; font-weight:700; color:var(--electric-cyan); margin-bottom:0.25rem;">
        ${escapeHtml(log.error_type || 'Error')} (Line ${log.line_number || '1'})
      </div>
      <div style="font-size:0.78rem; color:rgba(255,255,255,0.8); line-height:1.4;">
        ${escapeHtml(log.description || '')}
      </div>

      <div class="diff-grid" style="margin:0.75rem 0;">
        <div class="diff-original">${escapeHtml(log.original_line || '(original line)')}</div>
        <div class="diff-fixed">${escapeHtml(log.fixed_line || '(fixed line)')}</div>
      </div>

      <div style="font-size:0.78rem; color:#94a3b8; background:rgba(0,0,0,0.3); padding:0.6rem; border-radius:6px;">
        <strong style="color:#ffffff;">Why & Where Changed:</strong> ${escapeHtml(log.why || 'Logic fix applied.')}
      </div>

      <div style="font-size:0.7rem; color:rgba(255,255,255,0.4); text-align:right;">
        Saved in PostgreSQL: ${new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    `;
  }

  // --- PAST PROJECTS VIEW ---
  async function fetchProjects() {
    try {
      const res = await fetch(`/api/projects?userId=${encodeURIComponent(state.user.id)}`);
      const data = await res.json();
      if (data.success && data.projects) {
        renderProjects(data.projects);
      }
    } catch (err) {
      console.warn('[Client] Could not fetch projects:', err);
    }
  }

  function renderProjects(projects) {
    if (!projects || projects.length === 0) {
      el.projectsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding:3rem; text-align:center; color:#64748b; background:#ffffff; border-radius:18px; border:1px solid #e2e8f0;">
          <p style="font-size:1rem; font-weight:600; margin-bottom:0.5rem;">No past projects found</p>
          <p style="font-size:0.85rem;">Run your first debug session to store projects in PostgreSQL.</p>
        </div>
      `;
      return;
    }

    el.projectsGrid.innerHTML = projects.map(p => `
      <div class="project-card">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem;">
            <span style="font-family:var(--font-mono); font-size:0.7rem; background:#eff6ff; color:#2563eb; padding:2px 8px; border-radius:4px; font-weight:600; border:1px solid #bfdbfe;">
              ${escapeHtml(p.language || 'code')}
            </span>
            <span style="font-size:0.72rem; color:#94a3b8;">
              ${new Date(p.created_at).toLocaleDateString()}
            </span>
          </div>

          <h3 style="font-family:var(--font-display); font-size:1.1rem; font-weight:700; color:#0c213b; margin-bottom:0.5rem;">
            ${escapeHtml(p.title || 'Untitled Session')}
          </h3>
          <p style="font-size:0.8rem; color:#64748b; line-height:1.4; margin-bottom:1rem; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
            ${escapeHtml(p.summary || 'Completed debugging analysis.')}
          </p>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:0.75rem;">
          <span style="font-size:0.75rem; font-weight:600; color:${p.issue_count > 0 ? '#f59e0b' : '#10b981'};">
            ${p.issue_count} bug${p.issue_count === 1 ? '' : 's'} fixed
          </span>
          <button onclick="window.BugFinder.openProject('${p.id}')" class="btn-proceed" style="padding:0.4rem 1rem; font-size:0.75rem;">
            Inspect
          </button>
        </div>
      </div>
    `).join('');
  }

  window.BugFinder.openProject = async (id) => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      const data = await res.json();
      if (data.success && data.project) {
        const p = data.project;
        state.currentResult = {
          targetFile: p.target_file || 'main',
          summary: p.summary,
          fixedCode: p.fixed_code,
          fixes: p.fixes || [],
          session: p,
          engine: 'PostgreSQL Archive'
        };
        renderDebuggingResult(state.currentResult);
        switchTab('result');
        showToast(`Loaded ${p.title}`, 'info');
      }
    } catch (err) {
      showToast('Failed to load project session', 'error');
    }
  };

  // --- SIDEBAR RECENTS LIST ---
  async function fetchRecents() {
    try {
      const res = await fetch(`/api/projects?userId=${encodeURIComponent(state.user.id)}&limit=15`);
      const data = await res.json();
      if (data.success && data.projects) {
        state.recents = data.projects;
        renderRecents();
      }
    } catch {}
  }

  function renderRecents() {
    if (state.recents.length === 0) {
      el.recentItemsList.innerHTML = `
        <div style="font-size:0.75rem; color:#64748b; padding:0.5rem;">No recent sessions yet.</div>
      `;
      return;
    }

    el.recentItemsList.innerHTML = state.recents.map(r => `
      <div class="recent-item" onclick="window.BugFinder.openProject('${r.id}')" title="${escapeHtml(r.title)}">
        <span class="recent-title">${escapeHtml(r.title)}</span>
        <span class="recent-badge">${r.issue_count} err</span>
      </div>
    `).join('');
  }

  // --- NAVIGATION / VIEW SWITCHER ---
  function switchTab(tab) {
    state.currentTab = tab;

    el.navDebugger.classList.toggle('active', tab === 'debugger');
    el.navErrorLog.classList.toggle('active', tab === 'errorLog');
    el.navProjects.classList.toggle('active', tab === 'projects');

    el.viewDebugger.style.display = tab === 'debugger' ? 'block' : 'none';
    el.viewResult.style.display = tab === 'result' ? 'block' : 'none';
    el.viewErrorLog.style.display = tab === 'errorLog' ? 'block' : 'none';
    el.viewProjects.style.display = tab === 'projects' ? 'block' : 'none';

    // Close mobile drawer if open
    el.sidebar.classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startNewSession() {
    el.codeInput.value = '';
    state.files = [];
    renderAttachedFileChips();
    el.sampleInputText.value = '';
    el.sampleOutputText.value = '';
    updateLineNumbers();
    validateProceedState();
    switchTab('debugger');
    showToast('New debug workspace initialized', 'info');
  }

  // --- SYSTEM & DIAGNOSTICS MODAL ---
  async function openSystemModal() {
    el.systemModal.classList.add('open');
    try {
      const res = await fetch(`/api/system/status?userId=${encodeURIComponent(state.user.id)}`);
      const data = await res.json();
      if (data.success) {
        const db = data.database;
        el.systemDbDetails.innerHTML = `
          Type: <strong>${escapeHtml(db.type.toUpperCase())}</strong><br>
          Connected: <strong>${db.connected ? 'YES' : 'NO (Using persistent storage)'}</strong><br>
          Host: <code>${escapeHtml(db.host)}</code><br>
          Database: <code>${escapeHtml(db.database)}</code><br>
          Total Sessions Logged: <strong>${data.stats?.totalSessions || 0}</strong><br>
          Total Bugs Resolved: <strong>${data.stats?.totalBugsFixed || 0}</strong>
        `;
        el.systemModelName.textContent = data.agent?.model || 'nex-agi/nex-n2.5-mini:free';
      }
    } catch {
      el.systemDbDetails.textContent = 'Could not fetch diagnostics.';
    }
  }

  function closeSystemModal() {
    el.systemModal.classList.remove('open');
  }

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span style="font-weight:bold;">${icon}</span> <span>${escapeHtml(message)}</span>`;
    el.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // --- UTILS ---
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Boot on DOM ready
  document.addEventListener('DOMContentLoaded', init);

})();
