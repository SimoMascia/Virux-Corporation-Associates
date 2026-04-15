// ========================
// PROPDA INSPECTION ASSISTANT - SESSION BASED (FIXED)
// Fixed renderLogs for old logs and missing 'terminals'
// ========================

let appState = {
    session: {
        zoneCode: null,
        zoneDisplay: null,
        terminalsInspected: 0,
        pendingTerminals: [],
        authOfficer: "",
        supervisor: "",
    },
    logs: [],
    jsonBinConfig: { binId: "", accessKey: "" }
};

// DOM elements
const zoneSelect = document.getElementById('zoneSelect');
const otherZoneGroup = document.getElementById('otherZoneGroup');
const otherZoneDesc = document.getElementById('otherZoneDesc');
const scpInput = document.getElementById('scpId');
const terminalInput = document.getElementById('terminalId');
const supervisorInput = document.getElementById('supervisor');
const authOfficerInput = document.getElementById('authOfficer');
const resetCounterBtn = document.getElementById('resetCounterBtn');
const scanBtn = document.getElementById('scanBtn');
const addTerminalBtn = document.getElementById('addTerminalBtn');
const saveSingleTerminalBtn = document.getElementById('saveSingleTerminalBtn');
const saveSessionBtn = document.getElementById('saveSessionBtn');
const clearSessionBtn = document.getElementById('clearSessionBtn');
const sessionTerminalsList = document.getElementById('sessionTerminalsList');
const currentZoneSpan = document.getElementById('currentZone');
const terminalCountSpan = document.getElementById('terminalCount');
const scanProgressDiv = document.getElementById('scanProgress');
const resultsArea = document.getElementById('resultsArea');
const anomalyNoteGroup = document.getElementById('anomalyNoteGroup');
const anomalyNote = document.getElementById('anomalyNote');
const postScanActions = document.getElementById('postScanActions');
const logListDiv = document.getElementById('logList');
const exportLogsBtn = document.getElementById('exportLogsBtn');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const syncJsonBinBtn = document.getElementById('syncJsonBin');
const configJsonBinBtn = document.getElementById('configJsonBinBtn');
const jsonBinStatusSpan = document.getElementById('jsonBinStatus');

let lastScanData = null;
let scanInProgress = false;

// Helper: escape HTML
function escapeHtml(str) { 
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Helper: get current zone display name
function getZoneDisplay() {
    const zoneCode = zoneSelect.value;
    if (zoneCode === 'OTHER') {
        const custom = otherZoneDesc.value.trim();
        return custom ? `OTHER (${custom})` : 'OTHER';
    }
    const zoneNames = {
        'LCZ': 'LCZ - Light Containment Zone',
        'MCZ': 'MCZ - Medium Containment Zone',
        'HCZ': 'HCZ - Heavy Containment Zone',
        'RC': 'RC - Research Complex',
        'CR': 'CR - Control Room',
        'MD': 'MD - Medical Department',
        'BHZ': 'BHZ - Biohazard Zone'
    };
    return zoneNames[zoneCode] || zoneCode;
}

// Update session zone when dropdown changes
function updateSessionZone() {
    const zoneCode = zoneSelect.value;
    if (!zoneCode) return;
    appState.session.zoneCode = zoneCode;
    appState.session.zoneDisplay = getZoneDisplay();
    currentZoneSpan.innerText = appState.session.zoneDisplay;
    // Reset counter and pending terminals on zone change
    appState.session.terminalsInspected = 0;
    appState.session.pendingTerminals = [];
    renderPendingTerminals();
    updateTerminalCounterDisplay();
}

// Show/hide custom zone field
function toggleOtherZone() {
    otherZoneGroup.style.display = zoneSelect.value === 'OTHER' ? 'block' : 'none';
}
zoneSelect.addEventListener('change', updateSessionZone);
zoneSelect.addEventListener('change', toggleOtherZone);
toggleOtherZone();

// Render pending terminals list
function renderPendingTerminals() {
    if (!sessionTerminalsList) return;
    const pending = appState.session.pendingTerminals;
    if (pending.length === 0) {
        sessionTerminalsList.innerHTML = '<div class="empty-queue">No terminals added yet.</div>';
        saveSessionBtn.style.display = 'none';
        return;
    }
    saveSessionBtn.style.display = 'block';
    saveSessionBtn.innerHTML = `💾 Save session (${pending.length} terminal${pending.length !== 1 ? 's' : ''})`;
    sessionTerminalsList.innerHTML = pending.map((term, idx) => `
        <div class="queue-item">
            <span><strong>${escapeHtml(term.scpId)}</strong> | ${escapeHtml(term.terminalId)} | ${term.scanResult === 'CLEAR' ? '✅ Clear' : '⚠️ Anomaly'}</span>
            <button class="remove-terminal" data-index="${idx}">✖</button>
        </div>
    `).join('');
    document.querySelectorAll('.remove-terminal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.dataset.index);
            appState.session.pendingTerminals.splice(idx, 1);
            renderPendingTerminals();
        });
    });
}

function updateTerminalCounterDisplay() {
    terminalCountSpan.innerText = appState.session.terminalsInspected;
}

// ========== RENDER LOGS (FIXED) ==========
function renderLogs() {
    if (!logListDiv) return;
    if (appState.logs.length === 0) {
        logListDiv.innerHTML = '<div class="empty-log">No logs yet.</div>';
        return;
    }
    logListDiv.innerHTML = appState.logs.slice().reverse().map(log => {
        // Check if it's a session log (has terminals array)
        if (log.terminals && Array.isArray(log.terminals)) {
            let terminalsHtml = log.terminals.map(t => 
                `<li>${escapeHtml(t.scpId)} | ${escapeHtml(t.terminalId)} | ${t.scanResult === 'CLEAR' ? '✅ Clear' : '⚠️ Anomaly'}${t.anomalyNote ? ` (${escapeHtml(t.anomalyNote)})` : ''}</li>`
            ).join('');
            return `<div class="log-item">
                <strong>${new Date(log.timestamp).toLocaleString()}</strong> | ${escapeHtml(log.zone)} | Agent: ${escapeHtml(log.agent)}<br>
                Supervisor: ${escapeHtml(log.supervisor)} | Auth Officer: ${escapeHtml(log.authOfficer || 'N/A')}<br>
                Terminals (${log.terminals.length}):<ul style="margin:4px 0 0 20px">${terminalsHtml}</ul>
            </div>`;
        } 
        // Check if it's an emergency log (old format without terminals)
        else if (log.type === 'EMERGENCY_PROP') {
            return `<div class="log-item">
                <strong>${new Date(log.timestamp).toLocaleString()}</strong> | ${log.type} | ${log.propClass}<br>
                Agent: ${escapeHtml(log.agent)} | RAISA: ${escapeHtml(log.supervisorRAISA)}<br>
                Protocol: ${escapeHtml(log.protocolAdvised)}
            </div>`;
        }
        // Unknown format: display as raw JSON (fallback)
        else {
            return `<div class="log-item" style="border-left-color: #e76f51;">
                <strong>${new Date(log.timestamp).toLocaleString()}</strong> | Legacy log (incomplete)<br>
                <pre style="font-size: 0.7rem; margin-top: 4px; overflow-x: auto;">${escapeHtml(JSON.stringify(log, null, 2))}</pre>
            </div>`;
        }
    }).join('');
}

// ========== LOCAL STORAGE ==========
function saveLogsToLocalStorage() {
    localStorage.setItem('propda_inspection_logs', JSON.stringify(appState.logs));
}

function loadLogsFromLocalStorage() {
    const stored = localStorage.getItem('propda_inspection_logs');
    if (stored) {
        try {
            appState.logs = JSON.parse(stored);
        } catch(e) {
            appState.logs = [];
        }
    } else {
        appState.logs = [];
    }
    renderLogs();
}

// ========== JSONBIN.IO ==========
async function syncWithJsonBin() {
    const { binId, accessKey } = appState.jsonBinConfig;
    if (!binId || !accessKey) {
        jsonBinStatusSpan.innerText = "not configured";
        jsonBinStatusSpan.className = "status-offline";
        alert("Configure Bin ID and Access Key first.");
        return;
    }
    jsonBinStatusSpan.innerText = "syncing...";
    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Access-Key': accessKey
            },
            body: JSON.stringify({ logs: appState.logs, lastUpdate: new Date().toISOString() })
        });
        if (response.ok) {
            jsonBinStatusSpan.innerText = "connected ✅";
            jsonBinStatusSpan.className = "status-online";
            alert("Logs synced with JSONBin.");
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (err) {
        console.error(err);
        jsonBinStatusSpan.innerText = "sync error";
        jsonBinStatusSpan.className = "status-offline";
        alert("Sync failed: " + err.message);
    }
}

async function loadFromJsonBin() {
    const { binId, accessKey } = appState.jsonBinConfig;
    if (!binId || !accessKey) return;
    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
            headers: { 'X-Access-Key': accessKey }
        });
        if (response.ok) {
            const data = await response.json();
            if (data.record && data.record.logs) {
                appState.logs = data.record.logs;
                saveLogsToLocalStorage();
                renderLogs();
                jsonBinStatusSpan.innerText = "connected ✅";
                jsonBinStatusSpan.className = "status-online";
            } else {
                // Bin exists but no logs array
                appState.logs = [];
                saveLogsToLocalStorage();
                renderLogs();
                jsonBinStatusSpan.innerText = "connected (empty)";
            }
        } else if (response.status === 404) {
            jsonBinStatusSpan.innerText = "bin not found";
            jsonBinStatusSpan.className = "status-offline";
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch(e) {
        console.warn(e);
        jsonBinStatusSpan.innerText = "load error";
        jsonBinStatusSpan.className = "status-offline";
    }
}

// ========== EXPORT JSON ==========
function exportLogsAsJson() {
    if (appState.logs.length === 0) {
        alert("No logs to export.");
        return;
    }
    const dataStr = JSON.stringify(appState.logs, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = `propda_logs_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.json`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
    alert("JSON file exported.");
}

function clearLocalLogs() {
    if (confirm("Clear all local logs? (Data on JSONBin.io will remain if configured)")) {
        appState.logs = [];
        saveLogsToLocalStorage();
        renderLogs();
        alert("Local logs cleared.");
    }
}

// ========== JSONBin CONFIG MODAL ==========
function showConfigModal() {
    const modal = document.getElementById('configModal');
    modal.style.display = "flex";
    document.getElementById('binIdInput').value = appState.jsonBinConfig.binId || "";
    document.getElementById('apiKeyInput').value = appState.jsonBinConfig.accessKey || "";
}

function saveJsonBinConfig() {
    const binId = document.getElementById('binIdInput').value.trim();
    const accessKey = document.getElementById('apiKeyInput').value.trim();
    if (!binId || !accessKey) {
        alert("Enter both Bin ID and Access Key");
        return;
    }
    appState.jsonBinConfig = { binId, accessKey };
    localStorage.setItem('propda_jsonbin_config', JSON.stringify(appState.jsonBinConfig));
    document.getElementById('configModal').style.display = "none";
    loadFromJsonBin().then(() => syncWithJsonBin());
}

function loadJsonBinConfig() {
    const stored = localStorage.getItem('propda_jsonbin_config');
    if (stored) {
        try {
            const config = JSON.parse(stored);
            appState.jsonBinConfig = { binId: config.binId, accessKey: config.accessKey || config.apiKey };
            if (appState.jsonBinConfig.binId && appState.jsonBinConfig.accessKey) {
                jsonBinStatusSpan.innerText = "configured, loading...";
                loadFromJsonBin();
            }
        } catch(e) {}
    }
}

// ========== SESSION ACTIONS ==========
function resetTerminalCounter() {
    appState.session.terminalsInspected = 0;
    updateTerminalCounterDisplay();
    alert("Terminal counter reset.");
}

// Start 10-second scan
function startScan() {
    if (!zoneSelect.value) { alert("Select a zone."); return; }
    if (zoneSelect.value === 'OTHER' && !otherZoneDesc.value.trim()) {
        alert("Please specify a custom zone description.");
        return;
    }
    if (!scpInput.value.trim()) { alert("Enter SCP / Room ID."); return; }
    if (!terminalInput.value.trim()) { alert("Enter Terminal ID."); return; }
    if (!supervisorInput.value.trim()) { alert("Enter Foundation supervisor name."); return; }
    const zoneCode = zoneSelect.value;
    const pendingCount = appState.session.pendingTerminals.length;
    const savedCount = appState.session.terminalsInspected;
    if ((zoneCode === 'MCZ' || zoneCode === 'HCZ') && (savedCount + pendingCount) >= 2) {
        alert("Terminal limit reached for MCZ/HCZ. Save current session or reset access.");
        return;
    }
    if (scanInProgress) return;
    scanInProgress = true;
    scanBtn.disabled = true;
    scanProgressDiv.style.display = "flex";
    resultsArea.style.display = "none";
    postScanActions.style.display = "none";
    let progress = 0;
    const progressBar = document.querySelector('.progress-bar');
    const progressText = document.querySelector('.progress-text');
    const interval = setInterval(() => {
        progress += 10;
        progressBar.style.width = `${progress}%`;
        progressText.innerText = `Scanning... ${progress}%`;
        if (progress >= 100) {
            clearInterval(interval);
            scanInProgress = false;
            scanProgressDiv.style.display = "none";
            resultsArea.style.display = "block";
            postScanActions.style.display = "flex";
            scanBtn.disabled = false;
            lastScanData = {
                scpId: scpInput.value.trim(),
                terminalId: terminalInput.value.trim()
            };
            document.querySelectorAll('input[name="scanResult"]').forEach(r => r.checked = false);
            anomalyNoteGroup.style.display = "none";
            anomalyNote.value = "";
        }
    }, 1000);
}

// Add current terminal to session (queue)
function addToSession() {
    if (!lastScanData) { alert("Run a scan first."); return; }
    const selectedResult = document.querySelector('input[name="scanResult"]:checked');
    if (!selectedResult) { alert("Select scan result (Clear / Anomaly)."); return; }
    const scanResult = selectedResult.value;
    const anomalyText = (scanResult === 'ANOMALY') ? anomalyNote.value.trim() : null;
    const terminalData = {
        scpId: lastScanData.scpId,
        terminalId: lastScanData.terminalId,
        scanResult: scanResult,
        anomalyNote: anomalyText,
        timestamp: new Date().toISOString()
    };
    appState.session.pendingTerminals.push(terminalData);
    renderPendingTerminals();
    // Clear form
    scpInput.value = '';
    terminalInput.value = '';
    resultsArea.style.display = 'none';
    postScanActions.style.display = 'none';
    lastScanData = null;
}

// Save single terminal as individual log
function saveSingle() {
    if (!lastScanData) { alert("Run a scan first."); return; }
    const selectedResult = document.querySelector('input[name="scanResult"]:checked');
    if (!selectedResult) { alert("Select scan result (Clear / Anomaly)."); return; }
    const scanResult = selectedResult.value;
    const anomalyText = (scanResult === 'ANOMALY') ? anomalyNote.value.trim() : null;
    const terminalData = {
        scpId: lastScanData.scpId,
        terminalId: lastScanData.terminalId,
        scanResult: scanResult,
        anomalyNote: anomalyText,
        timestamp: new Date().toISOString()
    };
    const zoneDisplay = getZoneDisplay();
    const logEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        agent: prompt("Enter your PROPDA agent name:") || "Anonymous",
        zone: zoneDisplay,
        supervisor: supervisorInput.value.trim(),
        authOfficer: authOfficerInput.value.trim() || null,
        terminals: [terminalData],
        sessionTerminalCount: 1
    };
    appState.logs.push(logEntry);
    saveLogsToLocalStorage();
    renderLogs();
    if (zoneSelect.value === 'MCZ' || zoneSelect.value === 'HCZ') {
        appState.session.terminalsInspected++;
        updateTerminalCounterDisplay();
    }
    // Reset UI
    scpInput.value = '';
    terminalInput.value = '';
    resultsArea.style.display = 'none';
    postScanActions.style.display = 'none';
    lastScanData = null;
    alert("Terminal saved as single log.");
    syncWithJsonBin();
}

// Save all pending terminals as one session log
function saveSessionLog() {
    if (appState.session.pendingTerminals.length === 0) {
        alert("No terminals in session.");
        return;
    }
    const zoneCode = zoneSelect.value;
    const totalNew = appState.session.pendingTerminals.length;
    const savedCount = appState.session.terminalsInspected;
    if ((zoneCode === 'MCZ' || zoneCode === 'HCZ') && (savedCount + totalNew) > 2) {
        alert(`Cannot save ${totalNew} terminal(s). You already have ${savedCount} saved in this access. Max 2.`);
        return;
    }
    const zoneDisplay = getZoneDisplay();
    const logEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        agent: prompt("Enter your PROPDA agent name for this session:") || "Anonymous",
        zone: zoneDisplay,
        supervisor: supervisorInput.value.trim(),
        authOfficer: authOfficerInput.value.trim() || null,
        terminals: [...appState.session.pendingTerminals],
        sessionTerminalCount: totalNew
    };
    appState.logs.push(logEntry);
    saveLogsToLocalStorage();
    renderLogs();
    if (zoneCode === 'MCZ' || zoneCode === 'HCZ') {
        appState.session.terminalsInspected += totalNew;
        updateTerminalCounterDisplay();
    }
    appState.session.pendingTerminals = [];
    renderPendingTerminals();
    alert(`Session saved with ${logEntry.terminals.length} terminal(s).`);
    syncWithJsonBin();
}

function clearSession() {
    if (confirm("Clear all pending terminals from this session?")) {
        appState.session.pendingTerminals = [];
        renderPendingTerminals();
        scpInput.value = '';
        terminalInput.value = '';
        resultsArea.style.display = 'none';
        postScanActions.style.display = 'none';
        lastScanData = null;
    }
}

// Radio change for anomaly description
document.querySelectorAll('input[name="scanResult"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        anomalyNoteGroup.style.display = e.target.value === 'ANOMALY' ? 'block' : 'none';
    });
});

// ========== EVENT LISTENERS ==========
resetCounterBtn.addEventListener('click', resetTerminalCounter);
scanBtn.addEventListener('click', startScan);
addTerminalBtn.addEventListener('click', addToSession);
saveSingleTerminalBtn.addEventListener('click', saveSingle);
saveSessionBtn.addEventListener('click', saveSessionLog);
clearSessionBtn.addEventListener('click', clearSession);
exportLogsBtn.addEventListener('click', exportLogsAsJson);
clearLogsBtn.addEventListener('click', clearLocalLogs);
syncJsonBinBtn.addEventListener('click', syncWithJsonBin);
configJsonBinBtn.addEventListener('click', showConfigModal);
document.querySelector('#configModal .close')?.addEventListener('click', () => {
    document.getElementById('configModal').style.display = 'none';
});
document.getElementById('saveJsonBinConfig')?.addEventListener('click', saveJsonBinConfig);

// ========== INITIALIZATION ==========
function init() {
    loadLogsFromLocalStorage();
    loadJsonBinConfig();
    updateSessionZone();
    renderPendingTerminals();
}
init();
