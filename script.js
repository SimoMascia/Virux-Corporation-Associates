// ========================
// PROPDA INSPECTION ASSISTANT
// Compliant with contract FAD-VC&A-C-220326
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
        anomalyText: ""
    },
    logs: [],
    jsonBinConfig: {
        binId: "",
        apiKey: ""
    }
};

// DOM elements
const zoneSelect = document.getElementById('zoneSelect');
const scpInput = document.getElementById('scpId');
const terminalInput = document.getElementById('terminalId');
const supervisorInput = document.getElementById('supervisor');
const authOfficerInput = document.getElementById('authOfficer');
const scanBtn = document.getElementById('scanBtn');
const saveBtn = document.getElementById('saveInspectionBtn');
const resetAccessBtn = document.getElementById('requestNewAccessBtn');
const accessResetArea = document.getElementById('accessResetArea');
const currentZoneSpan = document.getElementById('currentZone');
const terminalCountSpan = document.getElementById('terminalCount');
const scanProgressDiv = document.getElementById('scanProgress');
const resultsArea = document.getElementById('resultsArea');
const anomalyNoteGroup = document.getElementById('anomalyNoteGroup');
const anomalyNote = document.getElementById('anomalyNote');
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

// Add inspection to logs
function addInspectionLog(inspectionData) {
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
        sessionTerminalCount: appState.session.terminalsInspected
    };
    appState.logs.push(newLog);
    saveLogsToLocalStorage();
    renderLogs();
    syncWithJsonBinBackground();
    return newLog;
}

// Sync with JSONBin.io
async function syncWithJsonBinBackground() {
    const { binId, apiKey } = appState.jsonBinConfig;
    if (!binId || !apiKey) {
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
                'X-Master-Key': apiKey
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
    const { binId, apiKey } = appState.jsonBinConfig;
    if (!binId || !apiKey) return;
    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
            headers: { 'X-Master-Key': apiKey }
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

// Zone change handler (Clause 10.A)
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
        saveBtn.disabled = true;
    } else {
        scanBtn.disabled = false;
        saveBtn.disabled = true;
    }
}

// Request new access: prompt for authorization officer name, store in field, reset counter
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
    // Set the auth officer field
    authOfficerInput.value = officerName;
    // Reset terminal counter
    appState.session.terminalsInspected = 0;
    terminalCountSpan.innerText = "0";
    scanBtn.disabled = false;
    saveBtn.disabled = true;
    alert(`New access authorized by ${officerName}. You may inspect up to 2 terminals in this zone.`);
}

// 10-second scan simulation
let scanTimer = null;
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
    saveBtn.disabled = true;
    
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
            document.querySelectorAll('input[name="scanResult"]').forEach(radio => radio.checked = false);
            anomalyNoteGroup.style.display = "none";
            anomalyNote.value = "";
            saveBtn.disabled = false;
            scanBtn.disabled = false;
        }
    }, 1000);
}

// Radio change for anomaly
document.querySelectorAll('input[name="scanResult"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.value === 'ANOMALY') {
            anomalyNoteGroup.style.display = "block";
        } else {
            anomalyNoteGroup.style.display = "none";
        }
    });
});

// Save inspection
function saveInspection() {
    if (!zoneSelect.value || !scpInput.value || !terminalInput.value || !supervisorInput.value) {
        alert("Fill all mandatory fields.");
        return;
    }
    const scanResultElem = document.querySelector('input[name="scanResult"]:checked');
    if (!scanResultElem) {
        alert("Select scan result (Clear / Anomaly).");
        return;
    }
    const hardwareChecked = Array.from(document.querySelectorAll('.hw-check:checked')).map(cb => cb.value);
    const inspection = {
        zone: zoneSelect.value,
        scpId: scpInput.value.trim(),
        terminalId: terminalInput.value.trim(),
        supervisor: supervisorInput.value.trim(),
        authOfficer: authOfficerInput.value.trim() || null,
        hardwareChecked: hardwareChecked,
        scanResult: scanResultElem.value,
        anomalyNote: (scanResultElem.value === 'ANOMALY') ? anomalyNote.value.trim() : null
    };
    addInspectionLog(inspection);
    
    if (appState.session.zone === 'MCZ' || appState.session.zone === 'HCZ') {
        appState.session.terminalsInspected++;
        terminalCountSpan.innerText = appState.session.terminalsInspected;
        if (appState.session.terminalsInspected >= 2) {
            alert("Limit of 2 terminals for this access reached. To inspect more, request new access with authorization officer.");
            scanBtn.disabled = true;
            saveBtn.disabled = true;
        }
    }
    resultsArea.style.display = "none";
    saveBtn.disabled = true;
}

// PROP Emergency (Clause 11)
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

// JSONBin configuration modal
function showConfigModal() {
    const modal = document.getElementById('configModal');
    modal.style.display = "flex";
    document.getElementById('binIdInput').value = appState.jsonBinConfig.binId || "";
    document.getElementById('apiKeyInput').value = appState.jsonBinConfig.apiKey || "";
}
function saveJsonBinConfig() {
    const binId = document.getElementById('binIdInput').value.trim();
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    if (!binId || !apiKey) {
        alert("Enter both Bin ID and API Key");
        return;
    }
    appState.jsonBinConfig = { binId, apiKey };
    localStorage.setItem('propda_jsonbin_config', JSON.stringify(appState.jsonBinConfig));
    document.getElementById('configModal').style.display = "none";
    loadFromJsonBin();
    syncWithJsonBinBackground();
}

function loadJsonBinConfig() {
    const stored = localStorage.getItem('propda_jsonbin_config');
    if (stored) {
        try {
            appState.jsonBinConfig = JSON.parse(stored);
            if (appState.jsonBinConfig.binId && appState.jsonBinConfig.apiKey) {
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
saveBtn.addEventListener('click', saveInspection);
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
}
init();
