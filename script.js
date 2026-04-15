// ========================
// PROPDA INSPECTION ASSISTANT
// Compliant with contract FAD-VC&A-C-220326
// With queue system for multiple terminals per access
// ========================

// App state
let appState = {
    session: {
        zone: null,
        terminalsInspected: 0
    },
    currentScan: {
        inProgress: false,
        result: null,
        anomalyText: "",
        lastScanData: null   // stores the last completed scan data (before queue/save)
    },
    pendingQueue: [],        // array of inspection objects ready to be saved
    logs: [],
    jsonBinConfig: {
        binId: "",
        accessKey: ""
    }
};

// DOM elements
const zoneSelect = document.getElementById('zoneSelect');
const scpInput = document.getElementById('scpId');
const terminalInput = document.getElementById('terminalId');
const supervisorInput = document.getElementById('supervisor');
const authOfficerInput = document.getElementById('authOfficer');
const scanBtn = document.getElementById('scanBtn');
const saveSingleBtn = document.getElementById('saveSingleBtn');
const addToQueueBtn = document.getElementById('addToQueueBtn');
const saveBatchBtn = document.getElementById('saveBatchBtn');
const clearQueueBtn = document.getElementById('clearQueueBtn');
const resetAccessBtn = document.getElementById('requestNewAccessBtn');
const accessResetArea = document.getElementById('accessResetArea');
const currentZoneSpan = document.getElementById('currentZone');
const terminalCountSpan = document.getElementById('terminalCount');
const scanProgressDiv = document.getElementById('scanProgress');
const resultsArea = document.getElementById('resultsArea');
const anomalyNoteGroup = document.getElementById('anomalyNoteGroup');
const anomalyNote = document.getElementById('anomalyNote');
const postScanActions = document.getElementById('postScanActions');
const queueListDiv = document.getElementById('queueList');
const logListDiv = document.getElementById('logList');
const exportLogsBtn = document.getElementById('exportLogsBtn');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const syncJsonBinBtn = document.getElementById('syncWithJsonBin');
const configJsonBinBtn = document.getElementById('configJsonBinBtn');
const jsonBinStatusSpan = document.getElementById('jsonBinStatus');
const emergencyBtn = document.getElementById('reportEmergencyBtn');
const emergencySupervisor = document.getElementById('emergencySupervisor');
const propClassSelect = document.getElementById('propClass');
const emergencyProtocolDiv = document.getElementById('emergencyProtocol');
const protocolTextDiv = document.getElementById('protocolText');

// Helper: save logs to localStorage
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

// Render log list
function renderLogs() {
    if (!logListDiv) return;
    if (appState.logs.length === 0) {
        logListDiv.innerHTML = '<div class="empty-log">No inspections recorded. Complete and save an inspection.</div>';
        return;
    }
    logListDiv.innerHTML = appState.logs.slice().reverse().map(log => {
        return `<div class="log-item">
            <strong>${new Date(log.timestamp).toLocaleString()}</strong> | ${log.zone} | ${log.scpId} | Term:${log.terminalId}<br>
            Result: ${log.scanResult} | Supervisor: ${log.supervisor} | Agent: ${log.agent || 'N/A'}
            ${log.authOfficer ? ` | Auth Officer: ${log.authOfficer}` : ''}
            ${log.anomalyNote ? `<br><span style="color:#f4a261;">⚠️ Anomaly: ${log.anomalyNote.substring(0, 80)}</span>` : ''}
        </div>`;
    }).join('');
}

// Render queue list
function renderQueue() {
    if (!queueListDiv) return;
    if (appState.pendingQueue.length === 0) {
        queueListDiv.innerHTML = '<div class="empty-queue">No pending inspections. Add terminals after scan.</div>';
        saveBatchBtn.style.display = 'none';
        return;
    }
    saveBatchBtn.style.display = 'block';
    saveBatchBtn.innerHTML = `💾 Save all logs (${appState.pendingQueue.length} in queue)`;
    queueListDiv.innerHTML = appState.pendingQueue.map((item, idx) => {
        return `<div class="queue-item">
            <span><strong>${item.scpId}</strong> | ${item.terminalId} | ${item.scanResult}</span>
            <button class="remove-queue-item" data-index="${idx}">✖</button>
        </div>`;
    }).join('');
    // Add event listeners to remove buttons
    document.querySelectorAll('.remove-queue-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(btn.getAttribute('data-index'));
            if (!isNaN(index)) {
                appState.pendingQueue.splice(index, 1);
                renderQueue();
                // Also reset terminal counter display? No, we only count when saved.
                // But we need to update the terminal count display to reflect remaining potential?
                // Actually, the counter increments only on final save. So no change here.
            }
        });
    });
}

// Add current inspection to queue (after scan)
function addCurrentToQueue() {
    if (!appState.currentScan.lastScanData) {
        alert("No scan data available. Please run a scan first.");
        return;
    }
    const scanData = appState.currentScan.lastScanData;
    // Check if adding would exceed MCZ/HCZ limit (but we check only on final save)
    // However, we can warn if queue length + existing terminals already saved >= 2 in MCZ/HCZ?
    // Better to allow queue but block save if limit exceeded.
    appState.pendingQueue.push({ ...scanData });
    renderQueue();
    // Reset scan UI to allow new terminal
    resetAfterAddToQueue();
}

function resetAfterAddToQueue() {
    // Clear terminal-specific fields
    scpInput.value = '';
    terminalInput.value = '';
    // Uncheck hardware checkboxes
    document.querySelectorAll('.hw-check').forEach(cb => cb.checked = false);
    // Hide results area and post-scan buttons
    resultsArea.style.display = 'none';
    postScanActions.style.display = 'none';
    // Reset scan result radios
    document.querySelectorAll('input[name="scanResult"]').forEach(radio => radio.checked = false);
    anomalyNoteGroup.style.display = 'none';
    anomalyNote.value = '';
    // Enable scan button
    scanBtn.disabled = false;
    appState.currentScan.lastScanData = null;
}

// Save a single inspection immediately (bypass queue)
function saveSingleInspection() {
    if (!appState.currentScan.lastScanData) {
        alert("No scan data available. Run a scan first.");
        return;
    }
    const inspection = appState.currentScan.lastScanData;
    // Check limit for MCZ/HCZ
    if ((appState.session.zone === 'MCZ' || appState.session.zone === 'HCZ') && appState.session.terminalsInspected >= 2) {
        alert("Terminal limit reached for this access. Cannot save more terminals. Request new access.");
        return;
    }
    performSaveInspection(inspection);
    // Increment counter after successful save
    if (appState.session.zone === 'MCZ' || appState.session.zone === 'HCZ') {
        appState.session.terminalsInspected++;
        terminalCountSpan.innerText = appState.session.terminalsInspected;
        if (appState.session.terminalsInspected >= 2) {
            scanBtn.disabled = true;
            alert("Limit of 2 terminals for this access reached. To inspect more, request new access with authorization officer.");
        }
    }
    // Reset UI for next inspection
    resetAfterAddToQueue();
}

// Save all items in queue (batch)
function saveBatchInspections() {
    if (appState.pendingQueue.length === 0) {
        alert("No pending inspections in queue.");
        return;
    }
    const zone = appState.session.zone;
    const isMczHcz = (zone === 'MCZ' || zone === 'HCZ');
    const currentCount = appState.session.terminalsInspected;
    const queueCount = appState.pendingQueue.length;
    if (isMczHcz && (currentCount + queueCount) > 2) {
        alert(`Cannot save ${queueCount} terminal(s). You have already inspected ${currentCount} terminal(s) in this access, and the maximum is 2. Please remove some items from queue or request a new access.`);
        return;
    }
    // Save each item in queue
    for (const inspection of appState.pendingQueue) {
        performSaveInspection(inspection);
    }
    // Update terminal counter
    if (isMczHcz) {
        appState.session.terminalsInspected += queueCount;
        terminalCountSpan.innerText = appState.session.terminalsInspected;
        if (appState.session.terminalsInspected >= 2) {
            scanBtn.disabled = true;
            alert("Limit of 2 terminals for this access reached. To inspect more, request new access with authorization officer.");
        }
    }
    // Clear queue
    appState.pendingQueue = [];
    renderQueue();
    // Reset UI
    resetAfterAddToQueue();
}

// Core save function (adds log to storage)
function performSaveInspection(inspectionData) {
    const newLog = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        agent: prompt("Enter your PROPDA agent name/code (for RAISA logging):", "Agent") || "Anonymous",
        zone: inspectionData.zone,
        scpId: inspectionData.scpId,
        terminalId: inspectionData.terminalId,
        supervisor: inspectionData.supervisor,
        authOfficer: inspectionData.authOfficer || null,
        hardwareChecked: inspectionData.hardwareChecked,
        scanResult: inspectionData.scanResult,
        anomalyNote: inspectionData.anomalyNote || null,
        sessionTerminalCount: appState.session.terminalsInspected + 1 // will be updated after
    };
    appState.logs.push(newLog);
    saveLogsToLocalStorage();
    renderLogs();
    syncWithJsonBinBackground();
}

// Sync with JSONBin.io
async function syncWithJsonBinBackground() {
    const { binId, accessKey } = appState.jsonBinConfig;
    if (!binId || !accessKey) {
        jsonBinStatusSpan.innerText = "not configured";
        jsonBinStatusSpan.className = "status-offline";
        return;
    }
    try {
        jsonBinStatusSpan.innerText = "syncing...";
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
        } else {
            throw new Error("API error");
        }
    } catch (err) {
        console.error("JSONBin sync failed", err);
        jsonBinStatusSpan.innerText = "sync error";
        jsonBinStatusSpan.className = "status-offline";
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
            }
        }
    } catch(e) { console.warn("JSONBin load failed", e); }
}

// Zone change handler
function updateSessionZone() {
    const newZone = zoneSelect.value;
    if (newZone === "") return;
    
    const oldZone = appState.session.zone;
    if (oldZone !== newZone) {
        if (newZone === 'MCZ' || newZone === 'HCZ') {
            appState.session.terminalsInspected = 0;
            accessResetArea.style.display = "flex";
        } else {
            appState.session.terminalsInspected = 0;
            accessResetArea.style.display = "none";
        }
        appState.session.zone = newZone;
        // Clear pending queue when zone changes (safety)
        appState.pendingQueue = [];
        renderQueue();
    } else if (!appState.session.zone) {
        appState.session.zone = newZone;
        if (newZone === 'MCZ' || newZone === 'HCZ') {
            accessResetArea.style.display = "flex";
        } else {
            accessResetArea.style.display = "none";
        }
    }
    
    currentZoneSpan.innerText = newZone;
    terminalCountSpan.innerText = appState.session.terminalsInspected;
    
    if ((newZone === 'MCZ' || newZone === 'HCZ') && appState.session.terminalsInspected >= 2) {
        alert("WARNING: You have reached the limit of 2 terminals inspected in this zone. Request new access with authorization officer (Clause 10.A).");
        scanBtn.disabled = true;
    } else {
        scanBtn.disabled = false;
    }
}

// Request new access: prompt for authorization officer
function requestNewAccess() {
    if (appState.session.zone !== 'MCZ' && appState.session.zone !== 'HCZ') {
        alert("This function is only for MCZ/HCZ.");
        return;
    }
    const officerName = prompt("Enter the Authorization Officer name who approved this new access:");
    if (!officerName) {
        alert("Authorization Officer name is required to request new access (per contract).");
        return;
    }
    authOfficerInput.value = officerName;
    appState.session.terminalsInspected = 0;
    terminalCountSpan.innerText = "0";
    scanBtn.disabled = false;
    alert(`New access authorized by ${officerName}. You may inspect up to 2 terminals in this zone.`);
}

// 10-second scan simulation
let scanInterval = null;
function startScan() {
    if (!zoneSelect.value) { alert("Select an inspection zone."); return; }
    if (!scpInput.value.trim()) { alert("Enter SCP / Room ID."); return; }
    if (!terminalInput.value.trim()) { alert("Enter Terminal ID."); return; }
    if (!supervisorInput.value.trim()) { alert("Enter Foundation supervisor name (Clause 10.B)."); return; }
    if ((appState.session.zone === 'MCZ' || appState.session.zone === 'HCZ') && appState.session.terminalsInspected >= 2) {
        alert("Terminal limit reached. Request new access with authorization officer.");
        return;
    }
    if (appState.currentScan.inProgress) return;
    
    appState.currentScan.inProgress = true;
    scanBtn.disabled = true;
    scanProgressDiv.style.display = "flex";
    resultsArea.style.display = "none";
    postScanActions.style.display = "none";
    
    let progress = 0;
    const progressBar = document.querySelector('.progress-bar');
    const progressText = document.querySelector('.progress-text');
    const interval = setInterval(() => {
        progress += 10;
        if (progressBar) progressBar.style.width = `${progress}%`;
        if (progressText) progressText.innerText = `Scanning... ${progress}%`;
        if (progress >= 100) {
            clearInterval(interval);
            appState.currentScan.inProgress = false;
            scanProgressDiv.style.display = "none";
            resultsArea.style.display = "block";
            postScanActions.style.display = "flex";
            document.querySelectorAll('input[name="scanResult"]').forEach(radio => radio.checked = false);
            anomalyNoteGroup.style.display = "none";
            anomalyNote.value = "";
            scanBtn.disabled = false;
            // Store current inspection data (without saving yet)
            const hardwareChecked = Array.from(document.querySelectorAll('.hw-check:checked')).map(cb => cb.value);
            appState.currentScan.lastScanData = {
                zone: zoneSelect.value,
                scpId: scpInput.value.trim(),
                terminalId: terminalInput.value.trim(),
                supervisor: supervisorInput.value.trim(),
                authOfficer: authOfficerInput.value.trim() || null,
                hardwareChecked: hardwareChecked,
                scanResult: null, // will be set when user selects
                anomalyNote: null
            };
            // Add listener to update lastScanData when result changes
            const radios = document.querySelectorAll('input[name="scanResult"]');
            const updateResult = () => {
                const selected = document.querySelector('input[name="scanResult"]:checked');
                if (selected && appState.currentScan.lastScanData) {
                    appState.currentScan.lastScanData.scanResult = selected.value;
                    appState.currentScan.lastScanData.anomalyNote = (selected.value === 'ANOMALY') ? anomalyNote.value.trim() : null;
                }
            };
            radios.forEach(r => r.removeEventListener('change', updateResult));
            radios.forEach(r => r.addEventListener('change', updateResult));
            anomalyNote.addEventListener('input', () => {
                if (appState.currentScan.lastScanData && appState.currentScan.lastScanData.scanResult === 'ANOMALY') {
                    appState.currentScan.lastScanData.anomalyNote = anomalyNote.value.trim();
                }
            });
        }
    }, 1000);
}

// Radio change for anomaly (visual only)
document.querySelectorAll('input[name="scanResult"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.value === 'ANOMALY') {
            anomalyNoteGroup.style.display = "block";
        } else {
            anomalyNoteGroup.style.display = "none";
        }
    });
});

// Emergency PROP
function reportEmergency() {
    const supervisor = emergencySupervisor.value.trim();
    if (!supervisor) {
        alert("FBI/RAISA supervising personnel is required (Clause 11).");
        return;
    }
    const propClass = propClassSelect.value;
    let protocol = "";
    switch(propClass) {
        case 'PROP-E': case 'PROP-D': protocol = "Install designated antivirus, run full scan. Monitor for 48h."; break;
        case 'PROP-C': protocol = "Request CIF support (First View/Dark Wolf). Isolate system and deploy advanced containment tools."; break;
        case 'PROP-B': protocol = "Immediately isolate network segment. Deploy antivirus on all connected systems. Weekly monitoring."; break;
        case 'PROP-A': case 'PROP-X': protocol = "Contact The Representant or High Command immediately. DO NOT intervene alone. Evacuate area if needed."; break;
        default: protocol = "Follow internal VC&A protocols.";
    }
    protocolTextDiv.innerText = protocol;
    emergencyProtocolDiv.style.display = "block";
    
    const emergencyLog = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        agent: prompt("Enter your agent name for emergency report:") || "Agent",
        type: "EMERGENCY_PROP",
        propClass: propClass,
        supervisorRAISA: supervisor,
        protocolAdvised: protocol
    };
    appState.logs.push(emergencyLog);
    saveLogsToLocalStorage();
    renderLogs();
    syncWithJsonBinBackground();
    alert(`PROP Emergency reported. Protocol: ${protocol}`);
}

// Export logs as JSON
function exportLogs() {
    const dataStr = JSON.stringify(appState.logs, null, 2);
    const blob = new Blob([dataStr], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `propda_logs_${new Date().toISOString().slice(0,19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function clearLocalLogs() {
    if (confirm("Clear all local logs? (Data on JSONBin.io will remain if configured)")) {
        appState.logs = [];
        saveLogsToLocalStorage();
        renderLogs();
        alert("Local logs cleared.");
    }
}

function clearQueue() {
    if (confirm("Clear all pending inspections from queue?")) {
        appState.pendingQueue = [];
        renderQueue();
        resetAfterAddToQueue();
    }
}

// JSONBin configuration
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
    loadFromJsonBin();
    syncWithJsonBinBackground();
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
                jsonBinStatusSpan.innerText = "configured, syncing...";
                loadFromJsonBin();
            }
        } catch(e) {}
    }
}

// Event listeners
zoneSelect.addEventListener('change', updateSessionZone);
resetAccessBtn.addEventListener('click', requestNewAccess);
scanBtn.addEventListener('click', startScan);
saveSingleBtn.addEventListener('click', saveSingleInspection);
addToQueueBtn.addEventListener('click', addCurrentToQueue);
saveBatchBtn.addEventListener('click', saveBatchInspections);
clearQueueBtn.addEventListener('click', clearQueue);
emergencyBtn.addEventListener('click', reportEmergency);
exportLogsBtn.addEventListener('click', exportLogs);
clearLogsBtn.addEventListener('click', clearLocalLogs);
syncJsonBinBtn.addEventListener('click', syncWithJsonBinBackground);
configJsonBinBtn.addEventListener('click', showConfigModal);
document.querySelector('#configModal .close')?.addEventListener('click', () => {
    document.getElementById('configModal').style.display = "none";
});
document.getElementById('saveJsonBinConfig')?.addEventListener('click', saveJsonBinConfig);

// Initialization
function init() {
    loadLogsFromLocalStorage();
    loadJsonBinConfig();
    updateSessionZone();
    renderQueue();
}
init();
