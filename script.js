// ========================
// PROPDA INSPECTION ASSISTANT - SESSION BASED
// One log per session (multiple terminals)
// ========================

let appState = {
    session: {
        zone: null,
        terminalsInspected: 0,     // counter for this session (saved terminals)
        pendingTerminals: [],      // array of terminal objects (not yet saved)
        authOfficer: "",
        supervisor: "",
        sessionId: Date.now()
    },
    logs: [],
    jsonBinConfig: { binId: "", accessKey: "" }
};

// DOM elements
const zoneSelect = document.getElementById('zoneSelect');
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
const emergencyBtn = document.getElementById('reportEmergencyBtn');
const emergencySupervisor = document.getElementById('emergencySupervisor');
const propClassSelect = document.getElementById('propClass');
const emergencyProtocolDiv = document.getElementById('emergencyProtocol');

// Last scan data (temporary)
let lastScanData = null;
let scanInProgress = false;

// Helper: render pending terminals list
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
            <span><strong>${term.scpId}</strong> | ${term.terminalId} | ${term.scanResult}</span>
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

// Update terminal counter display
function updateTerminalCounterDisplay() {
    terminalCountSpan.innerText = appState.session.terminalsInspected;
}

// Reset terminal counter (when auth officer changes or reset button)
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

// Zone change handler
function updateSessionZone() {
    const newZone = zoneSelect.value;
    if (newZone === "") return;
    appState.session.zone = newZone;
    currentZoneSpan.innerText = newZone;
    // Reset counter and pending terminals on zone change (new session)
    appState.session.terminalsInspected = 0;
    appState.session.pendingTerminals = [];
    renderPendingTerminals();
    updateTerminalCounterDisplay();
    if (newZone === 'MCZ' || newZone === 'HCZ') {
        // Show hint
    }
}

// Add current terminal to session (pending)
function addCurrentTerminalToSession() {
    if (!lastScanData) { alert("Run a scan first."); return; }
    const zone = appState.session.zone;
    const pendingCount = appState.session.pendingTerminals.length;
    const savedCount = appState.session.terminalsInspected;
    if ((zone === 'MCZ' || zone === 'HCZ') && (savedCount + pendingCount) >= 2) {
        alert("Cannot add more than 2 terminals in MCZ/HCZ for this session. Save current session first or reset access.");
        return;
    }
    // Get current scan result from radios
    const selectedResult = document.querySelector('input[name="scanResult"]:checked');
    if (!selectedResult) { alert("Select scan result (Clear/Anomaly)."); return; }
    const scanResult = selectedResult.value;
    const anomalyText = (scanResult === 'ANOMALY') ? anomalyNote.value.trim() : null;
    const hardwareChecked = Array.from(document.querySelectorAll('.hw-check:checked')).map(cb => cb.value);
    const terminalData = {
        scpId: scpInput.value.trim(),
        terminalId: terminalInput.value.trim(),
        hardwareChecked: hardwareChecked,
        scanResult: scanResult,
        anomalyNote: anomalyText,
        timestamp: new Date().toISOString()
    };
    appState.session.pendingTerminals.push(terminalData);
    renderPendingTerminals();
    // Reset form for next terminal
    scpInput.value = '';
    terminalInput.value = '';
    document.querySelectorAll('.hw-check').forEach(cb => cb.checked = false);
    resultsArea.style.display = 'none';
    postScanActions.style.display = 'none';
    lastScanData = null;
}

// Save a single terminal as an individual log (bypass session)
function saveSingleTerminal() {
    if (!lastScanData) { alert("Run a scan first."); return; }
    const zone = appState.session.zone;
    if ((zone === 'MCZ' || zone === 'HCZ') && appState.session.terminalsInspected >= 2) {
        alert("Terminal limit reached for this access. Request new authorization.");
        return;
    }
    const selectedResult = document.querySelector('input[name="scanResult"]:checked');
    if (!selectedResult) { alert("Select scan result."); return; }
    const scanResult = selectedResult.value;
    const anomalyText = (scanResult === 'ANOMALY') ? anomalyNote.value.trim() : null;
    const hardwareChecked = Array.from(document.querySelectorAll('.hw-check:checked')).map(cb => cb.value);
    const terminalData = {
        scpId: scpInput.value.trim(),
        terminalId: terminalInput.value.trim(),
        hardwareChecked: hardwareChecked,
        scanResult: scanResult,
        anomalyNote: anomalyText,
        timestamp: new Date().toISOString()
    };
    // Create a log with a single terminal
    const logEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        agent: prompt("Agent name:") || "Anonymous",
        zone: appState.session.zone,
        supervisor: supervisorInput.value.trim(),
        authOfficer: authOfficerInput.value.trim() || null,
        terminals: [terminalData],
        sessionTerminalCount: 1
    };
    appState.logs.push(logEntry);
    saveLogsToLocalStorage();
    renderLogs();
    syncWithJsonBinBackground();
    // Increment counter
    if (appState.session.zone === 'MCZ' || appState.session.zone === 'HCZ') {
        appState.session.terminalsInspected++;
        updateTerminalCounterDisplay();
    }
    // Reset UI
    scpInput.value = '';
    terminalInput.value = '';
    document.querySelectorAll('.hw-check').forEach(cb => cb.checked = false);
    resultsArea.style.display = 'none';
    postScanActions.style.display = 'none';
    lastScanData = null;
    alert("Terminal saved as individual log.");
}

// Save the entire session (all pending terminals as one log)
function saveSession() {
    if (appState.session.pendingTerminals.length === 0) {
        alert("No terminals in session.");
        return;
    }
    const zone = appState.session.zone;
    const totalTerminals = appState.session.terminalsInspected + appState.session.pendingTerminals.length;
    if ((zone === 'MCZ' || zone === 'HCZ') && totalTerminals > 2) {
        alert(`Cannot save ${appState.session.pendingTerminals.length} terminal(s). You already have ${appState.session.terminalsInspected} saved in this access. Max 2.`);
        return;
    }
    const logEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        agent: prompt("Enter your PROPDA agent name for this session:") || "Anonymous",
        zone: zone,
        supervisor: supervisorInput.value.trim(),
        authOfficer: authOfficerInput.value.trim() || null,
        terminals: [...appState.session.pendingTerminals],
        sessionTerminalCount: appState.session.pendingTerminals.length
    };
    appState.logs.push(logEntry);
    saveLogsToLocalStorage();
    renderLogs();
    syncWithJsonBinBackground();
    // Update counter
    if (zone === 'MCZ' || zone === 'HCZ') {
        appState.session.terminalsInspected += appState.session.pendingTerminals.length;
        updateTerminalCounterDisplay();
    }
    // Clear pending
    appState.session.pendingTerminals = [];
    renderPendingTerminals();
    alert(`Session saved with ${logEntry.terminals.length} terminal(s).`);
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

// Scan simulation (10s)
function startScan() {
    if (!zoneSelect.value) { alert("Select zone."); return; }
    if (!scpInput.value.trim()) { alert("Enter SCP ID."); return; }
    if (!terminalInput.value.trim()) { alert("Enter Terminal ID."); return; }
    if (!supervisorInput.value.trim()) { alert("Enter Foundation supervisor."); return; }
    if ((appState.session.zone === 'MCZ' || appState.session.zone === 'HCZ') && 
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
            // Store scan data (without result yet)
            lastScanData = {
                scpId: scpInput.value.trim(),
                terminalId: terminalInput.value.trim(),
                hardwareChecked: Array.from(document.querySelectorAll('.hw-check:checked')).map(cb => cb.value)
            };
            // Reset radio and anomaly note
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

// Emergency
function reportEmergency() {
    const supervisor = emergencySupervisor.value.trim();
    if (!supervisor) { alert("FBI/RAISA supervisor required."); return; }
    const propClass = propClassSelect.value;
    let protocol = "";
    switch(propClass) {
        case 'PROP-E': case 'PROP-D': protocol = "Install antivirus, full scan. Monitor 48h."; break;
        case 'PROP-C': protocol = "Request CIF support, isolate system."; break;
        case 'PROP-B': protocol = "Isolate network segment, deploy advanced AV."; break;
        case 'PROP-A': case 'PROP-X': protocol = "Contact The Representant immediately."; break;
        default: protocol = "Follow VC&A protocols.";
    }
    emergencyProtocolDiv.innerHTML = `<strong>📖 Protocol:</strong> ${protocol}`;
    emergencyProtocolDiv.style.display = "block";
    const emergencyLog = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        agent: prompt("Agent name:") || "Agent",
        type: "EMERGENCY_PROP",
        propClass: propClass,
        supervisorRAISA: supervisor,
        protocolAdvised: protocol
    };
    appState.logs.push(emergencyLog);
    saveLogsToLocalStorage();
    renderLogs();
    syncWithJsonBinBackground();
    alert("Emergency reported.");
}

// Logs functions
function saveLogsToLocalStorage() {
    localStorage.setItem('propda_inspection_logs', JSON.stringify(appState.logs));
}
function loadLogsFromLocalStorage() {
    const stored = localStorage.getItem('propda_inspection_logs');
    if (stored) appState.logs = JSON.parse(stored);
    else appState.logs = [];
    renderLogs();
}
function renderLogs() {
    if (!logListDiv) return;
    if (appState.logs.length === 0) {
        logListDiv.innerHTML = '<div class="empty-log">No logs yet.</div>';
        return;
    }
    logListDiv.innerHTML = appState.logs.slice().reverse().map(log => {
        if (log.terminals) {
            // Session log with multiple terminals
            let terminalsHtml = log.terminals.map(t => `<li>${t.scpId} | ${t.terminalId} | ${t.scanResult}${t.anomalyNote ? ` (${t.anomalyNote})` : ''}</li>`).join('');
            return `<div class="log-item">
                <strong>${new Date(log.timestamp).toLocaleString()}</strong> | ${log.zone} | Agent: ${log.agent}<br>
                Supervisor: ${log.supervisor} | Auth: ${log.authOfficer || 'N/A'}<br>
                Terminals (${log.terminals.length}):<ul style="margin:4px 0 0 20px">${terminalsHtml}</ul>
            </div>`;
        } else {
            // Emergency log
            return `<div class="log-item"><strong>${new Date(log.timestamp).toLocaleString()}</strong> | ${log.type} | ${log.propClass}<br>Agent: ${log.agent} | RAISA: ${log.supervisorRAISA}</div>`;
        }
    }).join('');
}
async function syncWithJsonBinBackground() { /* same as before */ }
async function loadFromJsonBin() { /* same */ }
function exportLogs() { /* same */ }
function clearLocalLogs() { if(confirm("Clear all logs?")){ appState.logs=[]; saveLogsToLocalStorage(); renderLogs(); } }
function showConfigModal() { /* same */ }
function saveJsonBinConfig() { /* same */ }
function loadJsonBinConfig() { /* same */ }

// Event listeners
zoneSelect.addEventListener('change', updateSessionZone);
resetCounterBtn.addEventListener('click', resetTerminalCounter);
scanBtn.addEventListener('click', startScan);
addTerminalBtn.addEventListener('click', addCurrentTerminalToSession);
saveSingleTerminalBtn.addEventListener('click', saveSingleTerminal);
saveSessionBtn.addEventListener('click', saveSession);
clearSessionBtn.addEventListener('click', clearSession);
emergencyBtn.addEventListener('click', reportEmergency);
exportLogsBtn.addEventListener('click', exportLogs);
clearLogsBtn.addEventListener('click', clearLocalLogs);
syncJsonBinBtn.addEventListener('click', syncWithJsonBinBackground);
configJsonBinBtn.addEventListener('click', showConfigModal);
document.querySelector('#configModal .close')?.addEventListener('click', () => document.getElementById('configModal').style.display = 'none');
document.getElementById('saveJsonBinConfig')?.addEventListener('click', saveJsonBinConfig);

// Init
function init() {
    loadLogsFromLocalStorage();
    loadJsonBinConfig();
    updateSessionZone();
    renderPendingTerminals();
}
init();
