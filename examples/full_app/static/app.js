// pydantic-deep Demo Frontend with WebSocket Streaming

// WebSocket connection
let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Session management
let sessionId = localStorage.getItem('sessionId') || null;

// State
let currentTab = 'uploads';

// DOM Elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const fileInput = document.getElementById('file-input');
const uploadArea = document.getElementById('upload-area');
const uploadStatus = document.getElementById('upload-status');
const filesList = document.getElementById('files-list');
const todosList = document.getElementById('todos-list');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupResizer();
    connectWebSocket();
    refreshFiles();
    refreshTodos();
});

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/chat`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
        updateConnectionStatus(true);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateConnectionStatus(false);

        // Try to reconnect
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            setTimeout(connectWebSocket, 2000 * reconnectAttempts);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onmessage = handleWebSocketMessage;
}

function updateConnectionStatus(connected) {
    sendBtn.disabled = !connected;
}

// Current message state for streaming
let currentMessageEl = null;
let currentToolsEl = null;
let streamedText = '';  // Accumulated streamed text

function handleWebSocketMessage(event) {
    const data = JSON.parse(event.data);

    switch (data.type) {
        case 'session_created':
            sessionId = data.session_id;
            localStorage.setItem('sessionId', sessionId);
            console.log('New session created:', sessionId);
            break;

        case 'start':
            currentMessageEl = createMessageContainer('assistant');
            currentToolsEl = null;
            streamedText = '';
            break;

        case 'status':
            updateStatus(data.content);
            break;

        case 'tool_call_start':
            startToolCallStreaming(data.tool_name, data.tool_call_id);
            break;

        case 'tool_args_delta':
            appendToolArgsDelta(data.tool_name, data.args_delta);
            break;

        case 'tool_start':
            addToolEvent(data.tool_name, data.args);
            break;

        case 'tool_output':
            updateToolOutput(data.tool_name, data.output);
            break;

        case 'text_delta':
            appendTextChunk(data.content);
            break;

        case 'thinking_delta':
            appendThinkingChunk(data.content);
            break;

        case 'response':
            if (currentMessageEl) {
                const contentEl = currentMessageEl.querySelector('.message-content');
                if (contentEl) {
                    contentEl.innerHTML = formatMessage(data.content);
                }
            }
            break;

        case 'done':
            finishMessage();
            refreshFiles();
            refreshTodos();
            break;

        case 'error':
            showError(data.content);
            break;

        case 'approval_required':
            showApprovalDialog(data.requests);
            break;
    }
}

function createMessageContainer(type) {
    const id = 'msg-' + Date.now();
    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}`;
    messageEl.id = id;

    const labelMap = {
        'user': {text: 'You', icon: 'icon-user', i: 'ri-user-smile-line'},
        'assistant': {text: 'Deep Agent', icon: 'icon-ai', i: 'ri-robot-2-fill'},
        'system': {text: 'System', icon: 'icon-system', i: 'ri-error-warning-fill'}
    };

    const info = labelMap[type] || labelMap['system'];

    messageEl.innerHTML = `
        <div class="message-header ${info.icon}">
            <i class="${info.i}"></i> <span>${info.text}</span>
        </div>
        <div class="message-tools"></div>
        <div class="message-content"></div>
    `;

    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return messageEl;
}

function updateStatus(status) {
    if (!currentMessageEl) return;

    let statusEl = currentMessageEl.querySelector('.message-status-line');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.className = 'message-status-line';
        statusEl.style.cssText = "font-size: 11px; color: #666; font-family: monospace; margin-top: 4px; padding-left: 1rem;";
        currentMessageEl.appendChild(statusEl);
    }
    statusEl.innerHTML = `<i class="ri-loader-4-line"></i> ${escapeHtml(status)}`;
}

// Streaming tool args accumulator
let streamingToolArgs = '';

function startToolCallStreaming(toolName, toolCallId) {
    if (!currentMessageEl) return;

    const toolsEl = currentMessageEl.querySelector('.message-tools');
    if (!toolsEl) return;

    streamingToolArgs = '';

    const toolEl = document.createElement('div');
    toolEl.className = 'tool-call streaming';
    toolEl.dataset.toolCallId = toolCallId || '';

    toolEl.innerHTML = `
        <div class="tool-header">
            <span class="tool-name">./${escapeHtml(toolName)}</span>
            <span class="tool-status streaming">STREAMING</span>
        </div>
        <div class="tool-args streaming-args"><code></code></div>
        <div class="tool-output"></div>
    `;

    toolsEl.appendChild(toolEl);
    currentToolsEl = toolEl;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendToolArgsDelta(toolName, argsDelta) {
    if (!currentToolsEl) return;

    streamingToolArgs += argsDelta;

    const argsEl = currentToolsEl.querySelector('.tool-args code');
    if (argsEl) {
        argsEl.textContent = streamingToolArgs;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function addToolEvent(toolName, args) {
    if (!currentMessageEl) return;

    const toolsEl = currentMessageEl.querySelector('.message-tools');
    if (!toolsEl) return;

    const existingStreamingTool = toolsEl.querySelector('.tool-call.streaming');
    if (existingStreamingTool) {
        existingStreamingTool.classList.remove('streaming');
        const statusEl = existingStreamingTool.querySelector('.tool-status');
        if (statusEl) {
            statusEl.className = 'tool-status running';
            statusEl.textContent = 'running';
        }
        const argsEl = existingStreamingTool.querySelector('.tool-args');
        if (argsEl) {
            argsEl.className = 'tool-args';
            argsEl.innerHTML = formatToolArgs(args);
        }
        currentToolsEl = existingStreamingTool;
        return;
    }

    const toolEl = document.createElement('div');
    toolEl.className = 'tool-call';
    toolEl.innerHTML = `
        <div class="tool-header">
            <span class="tool-name">./${escapeHtml(toolName)}</span>
            <span class="tool-status running">RUNNING...</span>
        </div>
        <div class="tool-args">${formatToolArgs(args)}</div>
        <div class="tool-output"></div>
    `;

    toolsEl.appendChild(toolEl);
    currentToolsEl = toolEl;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function formatToolArgs(args) {
    if (typeof args === 'string') {
        try {
            args = JSON.parse(args);
        } catch {
            return `<code>${escapeHtml(args)}</code>`;
        }
    }

    if (typeof args === 'object') {
        const parts = [];
        for (const [key, value] of Object.entries(args)) {
            const displayValue = typeof value === 'string' && value.length > 100
                ? value.substring(0, 100) + '...'
                : JSON.stringify(value);
            parts.push(`<span class="arg-key">${escapeHtml(key)}:</span> <span class="arg-value">${escapeHtml(displayValue)}</span>`);
        }
        return parts.join('<br>');
    }

    return '';
}

function updateToolOutput(toolName, output) {
    if (!currentToolsEl) return;

    const outputEl = currentToolsEl.querySelector('.tool-output');
    const statusEl = currentToolsEl.querySelector('.tool-status');

    if (outputEl) {
        outputEl.innerHTML = `<pre>${escapeHtml(output)}</pre>`;
    }

    if (statusEl) {
        statusEl.className = 'tool-status done';
        statusEl.textContent = 'done';
    }
}

function appendTextChunk(chunk) {
    if (!currentMessageEl) return;

    streamedText += chunk;

    const contentEl = currentMessageEl.querySelector('.message-content');
    if (contentEl) {
        contentEl.textContent = streamedText;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function appendThinkingChunk(chunk) {
    if (!currentMessageEl) return;

    let thinkingEl = currentMessageEl.querySelector('.message-thinking');
    if (!thinkingEl) {
        thinkingEl = document.createElement('div');
        thinkingEl.className = 'message-thinking';
        thinkingEl.innerHTML = '<span class="thinking-label"><i class="ri-brain-line"></i> Thinking...</span><div class="thinking-content"></div>';
        const contentEl = currentMessageEl.querySelector('.message-content');
        currentMessageEl.insertBefore(thinkingEl, contentEl);
    }

    const thinkingContent = thinkingEl.querySelector('.thinking-content');
    if (thinkingContent) {
        thinkingContent.textContent += chunk;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function finishMessage() {
    if (currentMessageEl) {
        const statusEl = currentMessageEl.querySelector('.message-status');
        if (statusEl) statusEl.remove();

        const toolStatuses = currentMessageEl.querySelectorAll('.tool-status.running');
        toolStatuses.forEach(el => {
            el.className = 'tool-status done';
            el.textContent = 'done';
        });
    }

    currentMessageEl = null;
    currentToolsEl = null;
    sendBtn.disabled = false;
}

function showError(message) {
    if (currentMessageEl) {
        const contentEl = currentMessageEl.querySelector('.message-content');
        if (contentEl) {
            contentEl.innerHTML = `<span class="error"><i class="ri-error-warning-line"></i> Error: ${escapeHtml(message)}</span>`;
        }
    } else {
        addMessage(`Error: ${message}`, 'system');
    }

    finishMessage();
}

// Pending approval requests
let pendingApprovals = [];

function showApprovalDialog(requests) {
    pendingApprovals = requests;

    if (!currentMessageEl) {
        currentMessageEl = createMessageContainer('assistant');
    }

    const contentEl = currentMessageEl.querySelector('.message-content');
    if (!contentEl) return;

    let html = '<div class="approval-dialog">';
    html += '<h4><i class="ri-alert-line"></i> Approval Required</h4>';
    html += '<p>The following operations require your approval:</p>';

    for (const req of requests) {
        html += `
            <div class="approval-item" data-id="${req.tool_call_id}">
                <div class="approval-tool">
                    <span class="tool-icon"><i class="ri-settings-5-line"></i></span>
                    <strong>${escapeHtml(req.tool_name)}</strong>
                </div>
                <div class="approval-args">${formatToolArgs(req.args)}</div>
            </div>
        `;
    }

    html += `
        <div class="approval-buttons">
            <button class="approve-btn" onclick="handleApprovalResponse(true)">Approve All</button>
            <button class="deny-btn" onclick="handleApprovalResponse(false)">Deny All</button>
        </div>
    </div>`;

    contentEl.innerHTML = html;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function handleApprovalResponse(approved) {
    if (!pendingApprovals.length) return;

    const approvalResponse = {};
    for (const req of pendingApprovals) {
        approvalResponse[req.tool_call_id] = approved;
    }

    pendingApprovals = [];

    if (currentMessageEl) {
        const contentEl = currentMessageEl.querySelector('.message-content');
        if (contentEl) {
            contentEl.innerHTML = `<p>${approved ? '<i class="ri-check-line"></i> Approved' : '<i class="ri-close-line"></i> Denied'} - continuing...</p>`;
        }
    }

    ws.send(JSON.stringify({approval: approvalResponse}));
}

function setupEventListeners() {
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
    });

    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', handleFileSelect);

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFile(files[0]);
        }
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.dataset.tab;
            refreshFiles();
        });
    });
}

function setupResizer() {
    const resizer = document.getElementById('drag-handle');
    const root = document.documentElement;
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none'; // Prevent text selection
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        // Calculate new width (constrain between 200px and 600px)
        let newWidth = e.clientX;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > 600) newWidth = 600;

        root.style.setProperty('--sidebar-width', `${newWidth}px`);
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// Chat Functions
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addMessage('Not connected to server. Reconnecting...', 'system');
        connectWebSocket();
        return;
    }

    messageInput.value = '';
    messageInput.style.height = 'auto';

    addMessage(message, 'user');
    sendBtn.disabled = true;

    const payload = {message};
    if (sessionId) {
        payload.session_id = sessionId;
    }
    ws.send(JSON.stringify(payload));
}

function sendQuickMessage(message) {
    messageInput.value = message;
    sendMessage();
}

function addMessage(content, type) {
    const id = 'msg-' + Date.now();
    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}`;
    messageEl.id = id;

    const labelMap = {
        'user': {text: 'You', i: 'ri-user-smile-line'},
        'assistant': {text: 'Agent', i: 'ri-robot-2-fill'},
        'system': {text: 'System', i: 'ri-error-warning-fill'}
    };
    const info = labelMap[type];

    messageEl.innerHTML = `
        <span class="message-header"><i class="${info.i}"></i> ${info.text}</span>
        <div class="message-content">${formatMessage(content)}</div>
    `;

    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return id;
}

function formatMessage(content) {
    let html = escapeHtml(content);
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n/g, '<br>');
    html = linkifyFilePaths(html);
    return html;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// File Functions
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        uploadFile(file);
    }
}

async function uploadFile(file) {
    uploadStatus.innerHTML = `<i class="ri-loader-4-line spin"></i> Uploading ${file.name}...`;
    uploadStatus.className = '';

    const formData = new FormData();
    formData.append('file', file);

    let url = '/upload';
    if (sessionId) {
        url += `?session_id=${encodeURIComponent(sessionId)}`;
    }

    try {
        const response = await fetch(url, { method: 'POST', body: formData });
        const data = await response.json();

        if (response.ok) {
            uploadStatus.innerHTML = `<i class="ri-check-line"></i> Uploaded: ${data.filename}`;
            uploadStatus.className = 'success';
            refreshFiles();
            addMessage(`File uploaded: ${data.filename} (${formatBytes(data.size)})`, 'system');
        } else {
            uploadStatus.textContent = `Error: ${data.detail}`;
            uploadStatus.className = 'error';
        }
    } catch (error) {
        uploadStatus.textContent = `Error: ${error.message}`;
        uploadStatus.className = 'error';
    }

    fileInput.value = '';
    setTimeout(() => {
        uploadStatus.textContent = '';
        uploadStatus.className = '';
    }, 3000);
}

async function refreshFiles() {
    if (!sessionId) return;

    try {
        const response = await fetch(`/files?session_id=${encodeURIComponent(sessionId)}`);
        if (!response.ok) return;
        const data = await response.json();

        const files = currentTab === 'uploads' ? data.uploads : data.workspace;

        if (files.length === 0) {
            filesList.innerHTML = '<p class="empty-state">No files yet</p>';
            return;
        }

        filesList.innerHTML = files.map(file => {
            const name = typeof file === 'string' ? file.split('/').pop() : file;
            const fullPath = typeof file === 'string' ? file : `/${currentTab}/${file}`;
            const iconClass = getFileIconClass(name);
            return `
                <div class="file-item clickable" onclick="openFilePreview('${escapeHtml(fullPath)}')" title="Click to preview ${fullPath}">
                    <i class="${iconClass}"></i>
                    <span>${escapeHtml(name)}</span>
                </div>
            `;
        }).join('');
    } catch (error) {
        filesList.innerHTML = '<p class="empty-state">Error loading files</p>';
    }
}

async function refreshTodos() {
    if (!sessionId) return;

    try {
        const response = await fetch(`/todos?session_id=${encodeURIComponent(sessionId)}`);
        if (!response.ok) return;
        const data = await response.json();

        if (!data.todos || data.todos.length === 0) {
            todosList.innerHTML = '<p class="empty-state">No todos yet</p>';
            return;
        }

        todosList.innerHTML = data.todos.map(todo => `
            <div class="todo-item">
                <i class="ri-checkbox-circle-line" style="color:var(--success)"></i>
                <span>${escapeHtml(todo.content)}</span>
            </div>
        `).join('');
    } catch (error) {
        todosList.innerHTML = '<p class="empty-state">Error loading todos</p>';
    }
}

async function resetAgent() {
    if (!confirm('Are you sure you want to reset the agent? This will clear all files and history.')) {
        return;
    }

    try {
        if (sessionId) {
            await fetch(`/reset?session_id=${encodeURIComponent(sessionId)}`, {method: 'POST'});
        }
        sessionId = null;
        localStorage.removeItem('sessionId');

        messagesContainer.innerHTML = '';
        addMessage(`
            <p><strong>Agent Reset!</strong> Ready to start fresh.</p>
        `, 'system');

        refreshFiles();
        refreshTodos();

        if (ws) ws.close();
        connectWebSocket();
    } catch (error) {
        alert('Error resetting agent: ' + error.message);
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ============================================
// File Preview Panel & Viewers
// ============================================

let currentPreviewPath = null;
let currentPreviewContent = null;

const filePreviewPanel = document.getElementById('file-preview-panel');
const previewFilename = document.getElementById('preview-filename');
const previewContainer = document.getElementById('preview-container');
const previewIcon = document.getElementById('preview-icon');

async function openFilePreview(filePath) {
    if (!sessionId) return;

    try {
        // Prepare UI
        const filename = filePath.split('/').pop();
        previewFilename.textContent = filename;
        const iconClass = getFileIconClass(filename);
        previewIcon.innerHTML = `<i class="${iconClass}"></i>`;

        filePreviewPanel.classList.remove('hidden');
        previewContainer.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">Loading...</div>';

        // Fetch
        const response = await fetch(`/files/content/${encodeURIComponent(filePath)}?session_id=${encodeURIComponent(sessionId)}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to load file');
        }

        const data = await response.json();
        currentPreviewPath = filePath;
        currentPreviewContent = data.content;

        renderPreview(filename, data.content);

    } catch (error) {
        console.error('Error loading file:', error);
        previewContainer.innerHTML = `<div style="padding: 20px; color: var(--error);">Error loading file: ${escapeHtml(error.message)}</div>`;
    }
}

function renderPreview(filename, content) {
    const ext = filename.split('.').pop().toLowerCase();

    // 1. Image Preview
    if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) {
        // Assuming the backend doesn't return Base64 in content, but we can display via URL?
        // Since the current backend returns "content", it works best for text files.
        // For now, let's treat images as a placeholder or check if content is base64.
        previewContainer.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; height:100%;">
            <p style="color:var(--text-muted)">Image preview requires binary endpoint</p>
        </div>`;
        return;
    }

    // 2. CSV Reader
    if (ext === 'csv') {
        const tableHtml = parseCSVtoTable(content);
        previewContainer.innerHTML = `<div class="csv-container">${tableHtml}</div>`;
        return;
    }

    // 3. PDF Reader (Simple Embed)
    if (ext === 'pdf') {
        // We attempt to construct a path. If the backend serves static files, this works.
        // Otherwise, we can't display it purely from the 'content' text string unless it's base64.
        // We will assume standard path access for the demo.
        // Hack: create a temporary blob if content implies binary, but usually content is just text here.
        previewContainer.innerHTML = `
            <embed class="embed-container" src="/files/download/${encodeURIComponent(currentPreviewPath)}?session_id=${sessionId}" type="application/pdf">
        `;
        return;
    }

    // 4. Code / Text (PrismJS)
    const languageMap = {
        'js': 'javascript', 'py': 'python', 'rs': 'rust', 'html': 'html',
        'css': 'css', 'json': 'json', 'md': 'markdown', 'sh': 'bash',
        'ts': 'typescript', 'go': 'go', 'java': 'java', 'cpp': 'cpp'
    };

    const lang = languageMap[ext] || 'none';

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = `language-${lang}`;
    code.textContent = content; // Safely sets text

    pre.appendChild(code);
    previewContainer.innerHTML = ''; // clear
    previewContainer.appendChild(pre);

    // Trigger highlighting
    if (window.Prism) {
        Prism.highlightElement(code);
    }
}

/**
 * Parse CSV line respecting quoted values (handles commas inside quotes)
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote ""
                current += '"';
                i++; // Skip next quote
            } else {
                // Toggle quote mode
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // End of field
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    // Don't forget last field
    result.push(current.trim());
    return result;
}

function parseCSVtoTable(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length === 0) return '<p>Empty CSV</p>';

    // Parse headers
    const headers = parseCSVLine(lines[0]);
    const numCols = headers.length;

    let html = '<table class="csv-table"><thead><tr>';
    html += `<th class="row-num">#</th>`; // Row number column
    headers.forEach(h => html += `<th>${escapeHtml(h)}</th>`);
    html += '</tr></thead><tbody>';

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue; // Skip empty lines

        const row = parseCSVLine(lines[i]);

        html += '<tr>';
        html += `<td class="row-num">${i}</td>`; // Row number
        for (let j = 0; j < numCols; j++) {
            const cell = row[j] || '';
            // Truncate very long cells for display
            const displayCell = cell.length > 100 ? cell.substring(0, 100) + '...' : cell;
            html += `<td title="${escapeHtml(cell)}">${escapeHtml(displayCell)}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';

    // Add row count info
    const rowCount = lines.length - 1;
    html = `<div class="csv-info">${rowCount} rows × ${numCols} columns</div>` + html;

    return html;
}

function closeFilePreview() {
    filePreviewPanel.classList.add('hidden');
    currentPreviewPath = null;
    currentPreviewContent = null;
}

async function copyFileContent() {
    if (!currentPreviewContent) return;
    try {
        await navigator.clipboard.writeText(currentPreviewContent);
        const btn = filePreviewPanel.querySelector('.preview-btn[onclick="copyFileContent()"]');
        const originalIcon = btn.innerHTML;
        btn.innerHTML = '<i class="ri-check-line" style="color: var(--success)"></i>';
        setTimeout(() => btn.innerHTML = originalIcon, 1000);
    } catch (error) {
        console.error('Failed to copy:', error);
    }
}

function downloadPreviewFile() {
    if (!currentPreviewPath || !currentPreviewContent) return;
    const filename = currentPreviewPath.split('/').pop();
    const blob = new Blob([currentPreviewContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function getFileIconClass(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'py': 'ri-code-s-slash-line',
        'js': 'ri-javascript-line',
        'ts': 'ri-braces-line',
        'json': 'ri-braces-line',
        'csv': 'ri-grid-line',
        'md': 'ri-markdown-line',
        'txt': 'ri-file-text-line',
        'html': 'ri-html5-line',
        'css': 'ri-css3-line',
        'pdf': 'ri-file-pdf-line',
        'zip': 'ri-file-zip-line',
        'png': 'ri-image-line',
        'jpg': 'ri-image-line'
    };
    return icons[ext] || 'ri-file-line';
}

function linkifyFilePaths(html) {
    const pathPattern = /(\/(?:workspace|uploads|app|home|tmp|var|etc)\/[^\s<>"'`,;()[\]{}]+\.[a-zA-Z0-9]+)/g;
    return html.replace(pathPattern, (match, path) => {
        const cleanPath = path.replace(/[.,;:!?)]+$/, '');
        const trailing = path.slice(cleanPath.length);
        return `<span class="file-link" onclick="openFilePreview('${cleanPath}')" title="Click to preview">${escapeHtml(cleanPath)}</span>${trailing}`;
    });
}