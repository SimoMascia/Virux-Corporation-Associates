// ========================
// PROPDA INSPECTION ASSISTANT - SESSION BASED
// With extended zones and "Other" description
// ========================

let appState = {
    session: {
        zone: null,
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
const syncJsonBinBtn = document.getElementById('syncWithJsonBin');
const configJsonBinBtn = document.getElementById('configJsonBinBtn');
const jsonBinStatusSpan = document.getElementById('jsonBinStatus');

let lastScanData = null;
let scanInProgress = false;

// Helper: get selected zone (with custom description if OTHER)
function getSelectedZone() {
    const zone = zoneSelect.value;
    if (zone === 'OTHER') {
        const custom = otherZoneDesc.value.trim();
        return custom ? `OTHER (${custom})` : 'OTHER';
    }
    return zone;
}

// Show/hide custom zone field
function toggleOtherZone() {
    if (zoneSelect.value === 'OTHER') {
        otherZoneGroup.style.display = 'block';
    } else {
        otherZoneGroup.style.display = 'none';
    }
}
zoneSelect.addEventListener('change', toggleOtherZone);

// Render pending terminals
function renderPendingTerminals() {
    if (!sessionTerminalsList) return;
    if (appState.session.pendingTerminals.length === 0) {
        sessionTerminalsList.innerHTML = '<div class="empty-queue">No terminals added yet.</div>';
        saveSessionBtn.style.display = 'none';
        return;
    }
    saveSessionBtn.style.display = 'block';
    saveSessionBtn.innerHTML = `💾 Save session (${appState.session.pendingTerminals.length} terminal${appState.session.pendingTerminals.length !== 1 ? 's' : ''})`;
    sessionTerminalsList.innerHTML = appState.session.pendingTerminals.map((term, idx) => {
        return `<div class="queue-item">
            <span><strong>${term.scpId}</strong> | ${term.terminalId} | ${term.scanResult === 'CLEAR' ? '✅ Clear' : '⚠️ Anomaly'}</span>
            <button class="remove-terminal" data-index="${idx}">✖</button>
        </div>`;
    }).join('');
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

function renderLogs() {
    if (!logListDiv) return;
    if (appState.logs.length === 0) {
        logListDiv.innerHTML = '<div class="empty-log">No logs yet.</div>';
        return;
    }
    logListDiv.innerHTML = appState.logs.slice().reverse().map(log => {
        let terminalsHtml = log.terminals.map(t => 
            `<li>${t.scpId} | ${t.terminalId} | ${t.scanResult === 'CLEAR' ? '✅ Clear' : '⚠️ Anomaly'}${t.anomalyNote ? ` (${t.anomalyNote})` : ''}</li>`
        ).join('');
        return `<div class="log-item">
            <strong>${new Date(log.timestamp).toLocaleString()}</strong> | ${log.zone} | Agent: ${log.agent}<br>
            Supervisor: ${log.supervisor} | Auth Officer: ${log.authOfficer || 'N/A'}<br>
            Terminals (${log.terminals.length}):<ul style="margin:4px 0 0 20px">${terminalsHtml}</ul>
        </div>`;
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
        } catch(e) { appState.logs = []; }
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
    const timestamp = new Date().toISOString().slice(0,19).replace(/:/g, '-');
    a.download = `propda_logs_${timestamp}.json`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
    alert("JSON file exported.");
}

function clearLocalLogs() {
    if (confirm("Clear all local logs? (Data on JSONBin.io will remain)")) {
        appState.logs = [];
        saveLogsToLocalStorage();
        renderLogs();
        alert("Local logs cleared.");
    }
}

// ========== JSONBin CONFIG ==========
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
            if (config.apiKey && !config.accessKey) {
                appState.jsonBinConfig = { binId: config.binId, accessKey: config.apiKey };
            } else {
                appState.jsonBinConfig = config;
            }
            if (appState.jsonBinConfig.binId && appState.jsonBinConfig.accessKey) {
                jsonBinStatusSpan.innerText = "configured, loading...";
                loadFromJsonBin();
            }
        } catch(e) {}
    }
}

// ========== SESSION LOGIC ==========
function resetTerminalCounter() {
    if (appState.session.zone === 'MCZ' || appState.session.zone === 'HCZ') {
        appState.session.terminalsInspected = 0;
        updateTerminalCounterDisplay();
        alert("Terminal counter reset for this access.");
    } else {
        appState.session.terminalsInspected = 0;
        updateTerminalCounterDisplay();
    }
}

function updateSessionZone() {
    const newZone = zoneSelect.value;
    if (newZone === "") return;
    // Store the raw zone value (we'll resolve the display name when saving)
    appState.session.zone = newZone;
    // For display, show the friendly name
    let displayZone = newZone;
    if (newZone === 'OTHER') {
        const custom = otherZoneDesc.value.trim();
        displayZone = custom ? `OTHER (${custom})` : 'OTHER';
    } else {
        const zoneNames = {
            'LCZ': 'LCZ - Light Containment Zone',
            'MCZ': 'MCZ - Medium Containment Zone',
            'HCZ': 'HCZ - Heavy Containment Zone',
            'RC': 'RC - Research Complex',
            'CR': 'CR - Control Room',
            'MD': 'MD - Medical Department',
            'BHZ': 'BHZ - Biohazard Zone'
        };
        displayZone = zoneNames[newZone] || newZone;
    }
    currentZoneSpan.innerText = displayZone;
    // Reset counter and pending terminals when zone changes
    appState.session.terminalsInspected = 0;
    appState.session.pendingTerminals = [];
    renderPendingTerminals();
    updateTerminalCounterDisplay();
}

function addCurrentTerminalToSession() {
    if (!lastScanData) { alert("Run a scan first."); return; }
    const zoneCode = appState.session.zone;
    const pendingCount = appState.session.pendingTerminals.length;
    const savedCount = appState.session.terminalsInspected;
    if ((zoneCode === 'MCZ' || zoneCode === 'HCZ') && (savedCount + pendingCount) >= 2) {
        alert("Cannot add more than 2 terminals in MCZ/HCZ for this session. Save current session or reset access.");
        return;
    }
    const selectedResult = document.querySelector('input[name="scanResult"]:checked');
    if (!selectedResult) { alert("Select scan result (Clear/Anomaly)."); return; }
    const scanResult = selectedResult.value;
    const anomalyText = (scanResult === 'ANOMALY') ? anomalyNote.value.trim() : null;
    const terminalData = {
        scpId: scpInput.value.trim(),
        terminalId: terminalInput.value.trim(),
        scanResult: scanResult,
        anomalyNote: anomalyText,
        timestamp: new Date().toISOString()
    };
    appState.session.pendingTerminals.push(terminalData);
    renderPendingTerminals();
    // Reset form
    scpInput.value = '';
    terminalInput.value = '';
    resultsArea.style.display = 'none';
    postScanActions.style.display = 'none';
    lastScanData = null;
}

function saveSingleTerminal() {
    if (!lastScanData) { alert("Run a scan first."); return; }
    const zoneCode = appState.session.zone;
    if ((zoneCode === 'MCZ' || zoneCode === 'HCZ') && appState.session.terminalsInspected >= 2) {
        alert("Terminal limit reached for this access. Request new authorization.");
        return;
    }
    const selectedResult = document.querySelector('input[name="scanResult"]:checked');
    if (!selectedResult) { alert("Select scan result."); return; }
    const scanResult = selectedResult.value;
    const anomalyText = (scanResult === 'ANOMALY') ? anomalyNote.value.trim() : null;
    const terminalData = {
        scpId: scpInput.value.trim(),
        terminalId: terminalInput.value.trim(),
        scanResult: scanResult,
        anomalyNote: anomalyText,
        timestamp: new Date().toISOString()
    };
    // Resolve zone display name
    let zoneDisplay = zoneCode;
    if (zoneCode === 'OTHER') {
        const custom = otherZoneDesc.value.trim();
        zoneDisplay = custom ? `OTHER (${custom})` : 'OTHER';
    } else {
        const zoneNames = {
            'LCZ': 'LCZ - Light Containment Zone',
            'MCZ': 'MCZ - Medium Containment Zone',
            'HCZ': 'HCZ - Heavy Containment Zone',
            'RC': 'RC - Research Complex',
            'CR': 'CR - Control Room',
            'MD': 'MD - Medical Department',
            'BHZ': 'BHZ - Biohazard Zone'
        };
        zoneDisplay = zoneNames[zoneCode] || zoneCode;
    }
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
    if (zoneCode === 'MCZ' || zoneCode === 'HCZ') {
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

function saveSession() {
    if (appState.session.pendingTerminals.length === 0) {
        alert("No terminals in session.");
        return;
    }
    const zoneCode = appState.session.zone;
    const totalTerminals = appState.session.terminalsInspected + appState.session.pendingTerminals.length;
    if ((zoneCode === 'MCZ' || zoneCode === 'HCZ') && totalTerminals > 2) {
        alert(`Cannot save ${appState.session.pendingTerminals.length} terminal(s). You already have ${appState.session.terminalsInspected} saved in this access. Max 2.`);
        return;
    }
    let zoneDisplay = zoneCode;
    if (zoneCode === 'OTHER') {
        const custom = otherZoneDesc.value.trim();
        zoneDisplay = custom ? `OTHER (${custom})` : 'OTHER';
    } else {
        const zoneNames = {
            'LCZ': 'LCZ - Light Containment Zone',
            'MCZ': 'MCZ - Medium Containment Zone',
            'HCZ': 'HCZ - Heavy Containment Zone',
            'RC': 'RC - Research Complex',
            'CR': 'CR - Control Room',
            'MD': 'MD - Medical Department',
            'BHZ': 'BHZ - Biohazard Zone'
        };
        zoneDisplay = zoneNames[zoneCode] || zoneCode;
    }
    const logEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        agent: prompt("Enter your PROPDA agent name for this session:") || "Anonymous",
        zone: zoneDisplay,
        supervisor: supervisorInput.value.trim(),
        authOfficer: authOfficerInput.value.trim() || null,
        terminals: [...appState.session.pendingTerminals],
        sessionTerminalCount: appState.session.pendingTerminals.length
    };
    appState.logs.push(logEntry);
    saveLogsToLocalStorage();
    renderLogs();
    if (zoneCode === 'MCZ' || zoneCode === 'HCZ') {
        appState.session.terminalsInspected += appState.session.pendingTerminals.length;
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

// Scan simulation (10 seconds)
function startScan() {
    if (!zoneSelect.value) { alert("Select a zone."); return; }
    if (zoneSelect.value === 'OTHER' && !otherZoneDesc.value.trim()) {
        alert("Please specify a custom zone description.");
        return;
    }
    if (!scpInput.value.trim()) { alert("Enter SCP ID."); return; }
    if (!terminalInput.value.trim()) { alert("Enter Terminal ID."); return; }
    if (!supervisorInput.value.trim()) { alert("Enter Foundation supervisor name."); return; }
    const zoneCode = zoneSelect.value;
    if ((zoneCode === 'MCZ' || zoneCode === 'HCZ') && 
        (appState.session.terminalsInspected + appState.session.pendingTerminals.length) >= 2) {
        alert("Terminal limit reached. Save or reset access.");
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

// Radio change handler
document.querySelectorAll('input[name="scanResult"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.value === 'ANOMALY') {
            anomalyNoteGroup.style.display = "block";
        } else {
            anomalyNoteGroup.style.display = "none";
        }
    });
});

// ========== EVENT LISTENERS ==========
zoneSelect.addEventListener('change', updateSessionZone);
resetCounterBtn.addEventListener('click', resetTerminalCounter);
scanBtn.addEventListener('click', startScan);
addTerminalBtn.addEventListener('click', addCurrentTerminalToSession);
saveSingleTerminalBtn.addEventListener('click', saveSingleTerminal);
saveSessionBtn.addEventListener('click', saveSession);
clearSessionBtn.addEventListener('click', clearSession);
exportLogsBtn.addEventListener('click', exportLogsAsJson);
clearLogsBtn.addEventListener('click', clearLocalLogs);
syncJsonBinBtn.addEventListener('click', syncWithJsonBin);
configJsonBinBtn.addEventListener('click', showConfigModal);
document.querySelector('#configModal .close')?.addEventListener('click', () => {
    document.getElementById('configModal').style.display = 'none';
});
document.getElementById('saveJsonBinConfig')?.addEventListener('click', saveJsonBinConfig);

// ========== INIT ==========
function init() {
    loadLogsFromLocalStorage();
    loadJsonBinConfig();
    updateSessionZone();
    renderPendingTerminals();
    toggleOtherZone(); // initial hide
}
init();
