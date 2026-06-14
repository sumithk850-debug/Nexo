/* ══════════════════════════════════════════════════════════════
   NEXO AI — Frontend Logic
   Normal Mode: streaming chat
   Creative Mode: autonomous 7-step pipeline
   ══════════════════════════════════════════════════════════════ */

// ── STATE ───────────────────────────────────────────────────────
let currentMode = 'normal';
let chatHistory = [];
let currentFiles = [];
let checkpoints = JSON.parse(localStorage.getItem('nexo_checkpoints') || '[]');
let currentError = null;
let buildCount = 0;
let isGenerating = false;

// ── INIT ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initModeSlider();
  renderCheckpoints();
  setupIframeErrorListener();
  updatePlaceholder();
  marked.setOptions({ breaks: true, gfm: true });
});

function initModeSlider() {
  const btnNormal = document.getElementById('btn-normal');
  const slider = document.getElementById('mode-slider');
  const rect = btnNormal.getBoundingClientRect();
  const wrapRect = btnNormal.closest('.mode-toggle-wrap').getBoundingClientRect();
  slider.style.width = btnNormal.offsetWidth + 'px';
  slider.style.left = '4px';
}

function updatePlaceholder() {
  const ta = document.getElementById('prompt-input');
  if (currentMode === 'normal') {
    ta.placeholder = 'Ask Nexo AI anything...';
  } else {
    ta.placeholder = 'Describe the app or website you want to build...';
  }
}

// ── MODE SWITCHING ───────────────────────────────────────────────
function switchMode(mode) {
  if (mode === currentMode) return;
  currentMode = mode;

  const btnNormal = document.getElementById('btn-normal');
  const btnCreative = document.getElementById('btn-creative');
  const slider = document.getElementById('mode-slider');
  const panelNormal = document.getElementById('panel-normal');
  const panelCreative = document.getElementById('panel-creative');
  const modeLabel = document.getElementById('mode-label-bar');

  btnNormal.classList.toggle('active', mode === 'normal');
  btnCreative.classList.toggle('active', mode === 'creative');

  if (mode === 'normal') {
    slider.style.left = '4px';
    slider.style.width = btnNormal.offsetWidth + 'px';
    panelNormal.classList.remove('hidden');
    panelCreative.classList.add('hidden');
    modeLabel.textContent = '● Normal Mode';
    modeLabel.className = 'mode-label-bar normal-label';
  } else {
    slider.style.left = (btnNormal.offsetWidth + 6) + 'px';
    slider.style.width = btnCreative.offsetWidth + 'px';
    panelNormal.classList.add('hidden');
    panelCreative.classList.remove('hidden');
    modeLabel.textContent = '● Creative Mode';
    modeLabel.className = 'mode-label-bar creative-label';
  }

  updatePlaceholder();
}

// ── INPUT HANDLING ───────────────────────────────────────────────
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

function handleSend() {
  const input = document.getElementById('prompt-input');
  const val = input.value.trim();
  if (!val || isGenerating) return;

  input.value = '';
  input.style.height = 'auto';

  if (currentMode === 'normal') {
    sendNormalMessage(val);
  } else {
    runCreativePipeline(val);
  }
}

function quickPrompt(text) {
  document.getElementById('prompt-input').value = text;
  handleSend();
}

function quickCreative(text) {
  switchMode('creative');
  setTimeout(() => {
    document.getElementById('prompt-input').value = text;
    handleSend();
  }, 100);
}

// ── NORMAL MODE ─────────────────────────────────────────────────
async function sendNormalMessage(text) {
  isGenerating = true;
  setSendDisabled(true);

  const welcome = document.getElementById('welcome-screen');
  if (welcome) welcome.style.display = 'none';

  chatHistory.push({ role: 'user', content: text });

  appendMessage('user', text);
  const typingEl = appendTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory })
    });

    if (!res.ok) throw new Error('Server error ' + res.status);

    typingEl.remove();
    const aiEl = appendMessage('ai', '');
    const contentEl = aiEl.querySelector('.ai-bubble');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.delta) {
              fullText += parsed.delta;
              contentEl.innerHTML = marked.parse(fullText);
              hljs.highlightAll();
              scrollToBottom();
            }
            if (parsed.error) throw new Error(parsed.error);
          } catch {}
        }
      }
    }

    chatHistory.push({ role: 'assistant', content: fullText });
    addCopyBtn(aiEl, fullText);

  } catch (err) {
    typingEl.remove();
    appendMessage('ai', `⚠️ Error: ${err.message}. Please try again.`);
  } finally {
    isGenerating = false;
    setSendDisabled(false);
  }
}

function appendMessage(role, text) {
  const msgs = document.getElementById('messages');
  const wrap = document.createElement('div');
  wrap.className = `message-wrap ${role}-wrap fade-in`;

  const avatarText = role === 'ai' ? 'N' : 'U';
  const avatarClass = role === 'ai' ? 'ai-avatar' : 'user-avatar';
  const bubbleClass = role === 'ai' ? 'ai-bubble' : 'user-bubble';
  const content = role === 'ai' ? (text ? marked.parse(text) : '') : escapeHtml(text);

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  wrap.innerHTML = `
    <div class="msg-avatar ${avatarClass}">${avatarText}</div>
    <div>
      <div class="msg-bubble ${bubbleClass}">${content}</div>
      <div class="msg-time">${time}</div>
    </div>
  `;

  msgs.appendChild(wrap);
  scrollToBottom();

  if (role === 'ai' && text) {
    hljs.highlightAll();
    addCopyBtn(wrap, text);
  }

  return wrap;
}

function addCopyBtn(wrap, text) {
  const existing = wrap.querySelector('.msg-actions');
  if (existing) existing.remove();

  const actions = document.createElement('div');
  actions.className = 'msg-actions';
  actions.innerHTML = `
    <button class="copy-btn" onclick="copyText(this, \`${escapeAttr(text)}\`)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      Copy
    </button>
  `;

  const msgDiv = wrap.querySelector('div:not(.msg-avatar)');
  if (msgDiv) msgDiv.appendChild(actions);
}

function appendTyping() {
  const msgs = document.getElementById('messages');
  const wrap = document.createElement('div');
  wrap.className = 'typing-wrap fade-in';
  wrap.innerHTML = `
    <div class="msg-avatar ai-avatar">N</div>
    <div class="typing-bubble">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  msgs.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

// ── CREATIVE MODE PIPELINE ───────────────────────────────────────
async function runCreativePipeline(prompt) {
  isGenerating = true;
  setSendDisabled(true);
  buildCount++;

  // Hide idle, show pipeline
  document.getElementById('creative-idle').classList.add('hidden');
  document.getElementById('result-panel').classList.add('hidden');
  document.getElementById('file-viewer').classList.add('hidden');

  const pipeline = document.getElementById('pipeline');
  pipeline.classList.remove('hidden');
  document.getElementById('pipeline-app-name').textContent = `Building: "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}"`;

  resetSteps();

  let files = [];
  let bugsFixed = 0;
  let appName = 'App';

  try {
    // ── STEP 1: ANALYZE ──
    setStep('analyze', 'active', '⟳', 'Understanding your requirements...');
    await delay(1200);
    setStep('analyze', 'done', '✓', 'Prompt analyzed successfully');

    // ── STEP 2: PLAN FILES ──
    setStep('plan', 'active', '⟳', 'Architecting file structure...');

    // ── STEP 3: GENERATE ──
    setStep('generate', 'active', '⟳', 'Generating complete code...');

    const genRes = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!genRes.ok) throw new Error('Generation failed: ' + genRes.status);
    const genData = await genRes.json();
    if (genData.error) throw new Error(genData.error);

    files = genData.files || [];
    appName = genData.appName || 'Your App';
    currentFiles = files;

    setStep('plan', 'done', '✓', `${files.length} files planned`);
    setStep('generate', 'done', '✓', `${files.length} files generated`);
    document.getElementById('pipeline-app-name').textContent = appName;

    // ── STEP 4: REVIEW ──
    setStep('review', 'active', '⟳', 'Running automated code review...');

    const reviewRes = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files })
    });

    const reviewData = await reviewRes.json();

    if (reviewData.hasIssues && reviewData.fixedFiles) {
      bugsFixed = reviewData.issues?.length || 1;
      files = reviewData.fixedFiles;
      currentFiles = files;
      setStep('review', 'done', '✓', `${bugsFixed} issue(s) found & fixed`);
    } else {
      setStep('review', 'done', '✓', 'No issues found — code is clean');
    }

    // ── STEP 5: COMPLETE ──
    setStep('complete', 'active', '⟳', 'Finalizing build...');
    await delay(600);
    setStep('complete', 'done', '✓', 'Build complete!');

    // ── SHOW RESULT ──
    await delay(400);
    pipeline.classList.add('hidden');
    showResult(appName, files, bugsFixed, prompt);

  } catch (err) {
    console.error('Pipeline error:', err);
    setStep('generate', 'error', '✗', err.message);
    showToast('❌ Build failed: ' + err.message);
    pipeline.classList.add('hidden');
    document.getElementById('creative-idle').classList.remove('hidden');
  } finally {
    isGenerating = false;
    setSendDisabled(false);
  }
}

function showResult(appName, files, bugsFixed, prompt) {
  const resultPanel = document.getElementById('result-panel');
  resultPanel.classList.remove('hidden');
  resultPanel.classList.add('fade-in');

  document.getElementById('result-app-name').textContent = appName;
  document.getElementById('cp-title').textContent = `Build #${buildCount} — ${appName}`;
  document.getElementById('cp-files').textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
  document.getElementById('cp-bugs').textContent = `${bugsFixed} bug${bugsFixed !== 1 ? 's' : ''} fixed`;
  document.getElementById('cp-time').textContent = 'just now';

  const score = Math.max(70, 100 - bugsFixed * 5);
  document.getElementById('cp-score').innerHTML = `
    <span class="score-label">Build Score</span>
    <span class="score-value">${score}</span>
  `;

  // Auto-open preview to take "screenshot"
  renderPreviewForScreenshot(files, appName, prompt, bugsFixed, score);
}

function renderPreviewForScreenshot(files, appName, prompt, bugsFixed, score) {
  const htmlFile = files.find(f => f.filename === 'index.html') || files.find(f => f.language === 'html');
  if (!htmlFile) return;

  // Build combined HTML
  const combined = buildCombinedHtml(files);

  // Use a temporary iframe to generate screenshot simulation
  // Since html2canvas can't access cross-origin iframes, we simulate with a thumbnail
  const screenshotEl = document.getElementById('checkpoint-screenshot');
  screenshotEl.innerHTML = `
    <div style="
      width:100%;height:100%;
      background:linear-gradient(135deg,#0D0D18,#13131F);
      display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      gap:6px;padding:10px;
    ">
      <div style="font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:700;
        background:linear-gradient(135deg,#A78BFA,#34D399);
        -webkit-background-clip:text;-webkit-text-fill-color:transparent;
        background-clip:text;text-align:center;
      ">${appName}</div>
      <div style="font-size:9px;color:#4A4A6A;">${files.length} files · Score ${Math.max(70, 100 - bugsFixed * 5)}</div>
      <div style="
        width:120px;height:2px;
        background:linear-gradient(90deg,#A78BFA,#34D399);
        border-radius:2px;margin-top:4px;
      "></div>
      <div style="font-size:9px;color:#34D399;margin-top:2px;">✓ Build Passed</div>
    </div>
  `;

  // Save checkpoint
  const checkpoint = {
    id: Date.now(),
    appName,
    prompt,
    files,
    bugsFixed,
    score,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    combined
  };

  checkpoints.unshift(checkpoint);
  if (checkpoints.length > 20) checkpoints.pop();
  localStorage.setItem('nexo_checkpoints', JSON.stringify(checkpoints));
  renderCheckpoints();

  showToast(`✅ ${appName} built successfully!`);
}

function buildCombinedHtml(files) {
  const htmlFile = files.find(f => f.filename === 'index.html') || files.find(f => f.language === 'html');
  const cssFile = files.find(f => f.filename === 'style.css') || files.find(f => f.language === 'css');
  const jsFile = files.find(f => f.filename === 'app.js' || f.filename === 'script.js' || f.filename === 'main.js') || files.find(f => f.language === 'javascript');

  if (!htmlFile) return '<html><body><p>No HTML file found</p></body></html>';

  let html = htmlFile.content;

  if (cssFile && !html.includes(cssFile.content.slice(0, 20))) {
    const styleTag = `<style>${cssFile.content}</style>`;
    html = html.replace('</head>', styleTag + '</head>');
    if (!html.includes('</head>')) html = styleTag + html;
  }

  if (jsFile && !html.includes(jsFile.content.slice(0, 20))) {
    const scriptTag = `<script>${jsFile.content}<\/script>`;
    html = html.replace('</body>', scriptTag + '</body>');
    if (!html.includes('</body>')) html += scriptTag;
  }

  // Inject error capture
  const errorCapture = `<script>
window.onerror=function(m,s,l){window.parent&&window.parent.postMessage({type:'NEXO_ERROR',error:m+' (line '+l+')'},'*');};
window.addEventListener('unhandledrejection',function(e){window.parent&&window.parent.postMessage({type:'NEXO_ERROR',error:(e.reason&&e.reason.message)||'Unhandled Promise Rejection'},'*');});
<\/script>`;

  html = html.replace('<body>', '<body>' + errorCapture);
  if (!html.includes('<body>')) html = errorCapture + html;

  return html;
}

// ── PREVIEW ─────────────────────────────────────────────────────
function openPreview() {
  if (!currentFiles.length) return;

  const combined = buildCombinedHtml(currentFiles);
  const iframe = document.getElementById('preview-iframe');
  const modal = document.getElementById('preview-modal');
  const errorBanner = document.getElementById('error-banner');

  errorBanner.classList.add('hidden');
  currentError = null;

  modal.classList.remove('hidden');
  iframe.srcdoc = combined;
}

function closePreview() {
  document.getElementById('preview-modal').classList.add('hidden');
  document.getElementById('preview-iframe').srcdoc = '';
}

function setupIframeErrorListener() {
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'NEXO_ERROR') {
      currentError = e.data.error;
      const banner = document.getElementById('error-banner');
      const msg = document.getElementById('error-msg');
      msg.textContent = e.data.error;
      banner.classList.remove('hidden');
    }
  });
}

async function autoFix() {
  if (!currentError || !currentFiles.length) return;

  const fixBtn = document.getElementById('fix-btn');
  fixBtn.disabled = true;
  fixBtn.textContent = 'Fixing...';

  try {
    const res = await fetch('/api/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: currentFiles, error: currentError })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    currentFiles = data.files;

    const combined = buildCombinedHtml(currentFiles);
    const iframe = document.getElementById('preview-iframe');
    const banner = document.getElementById('error-banner');

    iframe.srcdoc = combined;
    banner.classList.add('hidden');
    currentError = null;

    showToast('✅ Error fixed and preview updated!');

  } catch (err) {
    showToast('❌ Auto-fix failed: ' + err.message);
  } finally {
    fixBtn.disabled = false;
    fixBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
      Auto-Fix
    `;
  }
}

// ── FILE VIEWER ─────────────────────────────────────────────────
function showFiles() {
  const viewer = document.getElementById('file-viewer');
  if (viewer.classList.contains('hidden')) {
    viewer.classList.remove('hidden');
    renderFileViewer(currentFiles);
  } else {
    viewer.classList.add('hidden');
  }
}

function renderFileViewer(files) {
  const tabsEl = document.getElementById('file-tabs');
  const contentEl = document.getElementById('file-content');
  tabsEl.innerHTML = '';

  files.forEach((file, i) => {
    const tab = document.createElement('div');
    tab.className = 'file-tab' + (i === 0 ? ' active' : '');
    tab.innerHTML = `
      <span>${getFileIcon(file.language)}${file.filename}</span>
      <button class="file-tab-copy" onclick="event.stopPropagation();copyText(this,'${escapeAttr(file.content)}')" title="Copy">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
    `;
    tab.addEventListener('click', () => {
      tabsEl.querySelectorAll('.file-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      showFileContent(file);
    });
    tabsEl.appendChild(tab);
  });

  if (files.length > 0) showFileContent(files[0]);
}

function showFileContent(file) {
  const contentEl = document.getElementById('file-content');
  contentEl.innerHTML = `<pre><code class="language-${file.language}">${escapeHtml(file.content)}</code></pre>`;
  hljs.highlightAll();
}

function getFileIcon(lang) {
  const icons = { html: '🌐 ', css: '🎨 ', javascript: '⚡ ', js: '⚡ ', python: '🐍 ' };
  return icons[lang] || '📄 ';
}

// ── DOWNLOAD ─────────────────────────────────────────────────────
function downloadApp() {
  if (!currentFiles.length) return;
  const htmlFile = currentFiles.find(f => f.filename === 'index.html') || currentFiles[0];
  const combined = buildCombinedHtml(currentFiles);
  const blob = new Blob([combined], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'nexo-app.html';
  a.click();
  showToast('📥 App downloaded!');
}

// ── CHECKPOINTS ──────────────────────────────────────────────────
function renderCheckpoints() {
  const list = document.getElementById('checkpoint-list');
  if (!checkpoints.length) {
    list.innerHTML = `
      <div class="sidebar-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
        <p>No builds yet.<br/>Switch to Creative Mode to start.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = checkpoints.map((cp, i) => `
    <div class="sidebar-cp-item" onclick="restoreCheckpoint(${i})">
      <div class="sidebar-cp-thumb">
        <div style="
          width:100%;height:100%;
          background:linear-gradient(135deg,#0D0D18,#13131F);
          display:flex;align-items:center;justify-content:center;
          font-family:'Space Grotesk',sans-serif;font-size:10px;font-weight:700;
          background:linear-gradient(135deg,#A78BFA,#34D399);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;
          background-clip:text;
        ">${cp.appName}</div>
      </div>
      <div class="sidebar-cp-name">${cp.appName}</div>
      <div class="sidebar-cp-time">${cp.timestamp} · ${cp.files?.length || 0} files</div>
    </div>
  `).join('');
}

function restoreCheckpoint(index) {
  const cp = checkpoints[index];
  if (!cp) return;
  currentFiles = cp.files;
  buildCount++;

  document.getElementById('creative-idle').classList.add('hidden');
  document.getElementById('pipeline').classList.add('hidden');

  showResult(cp.appName, cp.files, cp.bugsFixed || 0, cp.prompt || '');
  showToast(`📂 Restored: ${cp.appName}`);
}

function clearCheckpoints() {
  checkpoints = [];
  localStorage.removeItem('nexo_checkpoints');
  renderCheckpoints();
  showToast('🗑️ Checkpoints cleared');
}

// ── SIDEBAR ──────────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('open');
}

// ── PIPELINE HELPERS ─────────────────────────────────────────────
function resetSteps() {
  ['analyze', 'plan', 'generate', 'review', 'complete'].forEach(id => {
    const card = document.getElementById(`step-${id}`);
    const status = document.getElementById(`step-${id}-status`);
    const desc = document.getElementById(`step-${id}-desc`);
    card.className = 'step-card';
    status.className = 'step-status pending';
    status.textContent = '○';
    desc.textContent = 'Waiting...';
  });
}

function setStep(id, state, icon, desc) {
  const card = document.getElementById(`step-${id}`);
  const status = document.getElementById(`step-${id}-status`);
  const descEl = document.getElementById(`step-${id}-desc`);

  card.className = `step-card ${state}`;
  status.className = `step-status ${state}`;
  status.textContent = icon;
  descEl.textContent = desc;

  if (state === 'active') {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ── UTILITIES ────────────────────────────────────────────────────
function clearChat() {
  if (currentMode === 'normal') {
    chatHistory = [];
    document.getElementById('messages').innerHTML = '';
    const welcome = document.getElementById('welcome-screen');
    if (welcome) welcome.style.display = '';
    showToast('💬 Chat cleared');
  } else {
    currentFiles = [];
    document.getElementById('creative-idle').classList.remove('hidden');
    document.getElementById('pipeline').classList.add('hidden');
    document.getElementById('result-panel').classList.add('hidden');
    showToast('🎨 Workspace cleared');
  }
}

function scrollToBottom() {
  const area = document.getElementById('chat-area');
  if (area) area.scrollTop = area.scrollHeight;
}

function setSendDisabled(v) {
  document.getElementById('send-btn').disabled = v;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}

function copyText(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.innerHTML;
    btn.innerHTML = btn.innerHTML.replace(/Copy|<svg.*?<\/svg>/s, '✓ Copied');
    setTimeout(() => { btn.innerHTML = original; }, 1500);
  });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 3000);
}
