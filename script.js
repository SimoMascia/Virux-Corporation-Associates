// ========================
// PROPDA INSPECTION ASSISTANT - SESSION BASED
// One log per session (multiple terminals)
// ========================

let appState = {
    session: {
        zone: null,
        terminalsInspected: 0,
        pendingTerminals: [],
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

let lastScanData = null;
let scanInProgress = false;

// ========== RENDER FUNCTIONS ==========
function renderPendingTerminals() {
    if (!sessionTerminalsList) return;
    if (appState.session.pendingTerminals.length === 0) {
        sessionTerminalsList.innerHTML = '<div class="empty-queue">Nessun terminale aggiunto.</div>';
        saveSessionBtn.style.display = 'none';
        return;
    }
    saveSessionBtn.style.display = 'block';
    saveSessionBtn.innerHTML = `💾 Salva sessione (${appState.session.pendingTerminals.length} terminale${appState.session.pendingTerminals.length !== 1 ? 'i' : ''})`;
    sessionTerminalsList.innerHTML = appState.session.pendingTerminals.map((term, idx) => {
        return `<div class="queue-item">
            <span><strong>${term.scpId}</strong> | ${term.terminalId} | ${term.scanResult === 'CLEAR' ? '✅ Pulito' : '⚠️ Anomalia'}</span>
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
        logListDiv.innerHTML = '<div class="empty-log">Nessun log ancora.</div>';
        return;
    }
    logListDiv.innerHTML = appState.logs.slice().reverse().map(log => {
        let terminalsHtml = log.terminals.map(t => 
            `<li>${t.scpId} | ${t.terminalId} | ${t.scanResult === 'CLEAR' ? '✅ Pulito' : '⚠️ Anomalia'}${t.anomalyNote ? ` (${t.anomalyNote})` : ''}</li>`
        ).join('');
        return `<div class="log-item">
            <strong>${new Date(log.timestamp).toLocaleString()}</strong> | ${log.zone} | Agente: ${log.agent}<br>
            Supervisore: ${log.supervisor} | Autorizzazione: ${log.authOfficer || 'N/A'}<br>
            Terminali (${log.terminals.length}):<ul style="margin:4px 0 0 20px">${terminalsHtml}</ul>
        </div>`;
    }).join('');
}

// ========== LOG STORAGE (localStorage) ==========
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

// ========== JSONBin.IO SYNC ==========
async function syncWithJsonBin() {
    const { binId, accessKey } = appState.jsonBinConfig;
    if (!binId || !accessKey) {
        jsonBinStatusSpan.innerText = "non configurato";
        jsonBinStatusSpan.className = "status-offline";
        alert("Configura prima Bin ID e Access Key nel pannello JSONBin.");
        return;
    }
    jsonBinStatusSpan.innerText = "sincronizzazione...";
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
            jsonBinStatusSpan.innerText = "connesso ✅";
            jsonBinStatusSpan.className = "status-online";
            alert("Log sincronizzati con JSONBin.");
        } else {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
    } catch (err) {
        console.error("Errore sync:", err);
        jsonBinStatusSpan.innerText = "errore sync";
        jsonBinStatusSpan.className = "status-offline";
        alert("Errore di sincronizzazione: " + err.message);
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
                jsonBinStatusSpan.innerText = "connesso ✅";
                jsonBinStatusSpan.className = "status-online";
            } else {
                // Bin vuoto o struttura diversa: inizializza array vuoto
                appState.logs = [];
                saveLogsToLocalStorage();
                renderLogs();
                jsonBinStatusSpan.innerText = "connesso (vuoto)";
            }
        } else if (response.status === 404) {
            // Bin non trovato (forse cancellato)
            jsonBinStatusSpan.innerText = "bin non trovato";
            jsonBinStatusSpan.className = "status-offline";
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch(e) {
        console.warn("Caricamento da JSONBin fallito:", e);
        jsonBinStatusSpan.innerText = "errore caricamento";
        jsonBinStatusSpan.className = "status-offline";
    }
}

// ========== EXPORT LOGS AS JSON FILE ==========
function exportLogsAsJson() {
    if (appState.logs.length === 0) {
        alert("Nessun log da esportare.");
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
    alert("File JSON esportato con successo.");
}

// ========== CLEAR LOCAL LOGS ==========
function clearLocalLogs() {
    if (confirm("Cancellare tutti i log locali? (I dati su JSONBin.io rimarranno)")) {
        appState.logs = [];
        saveLogsToLocalStorage();
        renderLogs();
        alert("Log locali cancellati.");
    }
}

// ========== JSONBin CONFIGURATION MODAL ==========
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
        alert("Inserisci sia Bin ID che Access Key");
        return;
    }
    appState.jsonBinConfig = { binId, accessKey };
    localStorage.setItem('propda_jsonbin_config', JSON.stringify(appState.jsonBinConfig));
    document.getElementById('configModal').style.display = "none";
    // Prova a caricare dal bin appena configurato
    loadFromJsonBin().then(() => {
        // Dopo caricamento, sincronizza eventuali log locali non presenti
        syncWithJsonBin();
    });
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
                jsonBinStatusSpan.innerText = "configurato, caricamento...";
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
        alert("Contatore terminali resettato per questo accesso.");
    } else {
        appState.session.terminalsInspected = 0;
        updateTerminalCounterDisplay();
    }
}

function updateSessionZone() {
    const newZone = zoneSelect.value;
    if (newZone === "") return;
    appState.session.zone = newZone;
    currentZoneSpan.innerText = newZone;
    appState.session.terminalsInspected = 0;
    appState.session.pendingTerminals = [];
    renderPendingTerminals();
    updateTerminalCounterDisplay();
}

function addCurrentTerminalToSession() {
    if (!lastScanData) { alert("Esegui prima una scansione."); return; }
    const zone = appState.session.zone;
    const pendingCount = appState.session.pendingTerminals.length;
    const savedCount = appState.session.terminalsInspected;
    if ((zone === 'MCZ' || zone === 'HCZ') && (savedCount + pendingCount) >= 2) {
        alert("Non puoi aggiungere più di 2 terminali in MCZ/HCZ per questa sessione. Salva la sessione corrente o resetta l'accesso.");
        return;
    }
    const selectedResult = document.querySelector('input[name="scanResult"]:checked');
    if (!selectedResult) { alert("Seleziona l'esito della scansione (Pulito/Anomalia)."); return; }
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
    scpInput.value = '';
    terminalInput.value = '';
    resultsArea.style.display = 'none';
    postScanActions.style.display = 'none';
    lastScanData = null;
}

function saveSingleTerminal() {
    if (!lastScanData) { alert("Esegui prima una scansione."); return; }
    const zone = appState.session.zone;
    if ((zone === 'MCZ' || zone === 'HCZ') && appState.session.terminalsInspected >= 2) {
        alert("Limite terminali raggiunto per questo accesso. Richiedi una nuova autorizzazione.");
        return;
    }
    const selectedResult = document.querySelector('input[name="scanResult"]:checked');
    if (!selectedResult) { alert("Seleziona l'esito della scansione."); return; }
    const scanResult = selectedResult.value;
    const anomalyText = (scanResult === 'ANOMALY') ? anomalyNote.value.trim() : null;
    const terminalData = {
        scpId: scpInput.value.trim(),
        terminalId: terminalInput.value.trim(),
        scanResult: scanResult,
        anomalyNote: anomalyText,
        timestamp: new Date().toISOString()
    };
    const logEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        agent: prompt("Nome agente PROPDA:") || "Anonimo",
        zone: appState.session.zone,
        supervisor: supervisorInput.value.trim(),
        authOfficer: authOfficerInput.value.trim() || null,
        terminals: [terminalData],
        sessionTerminalCount: 1
    };
    appState.logs.push(logEntry);
    saveLogsToLocalStorage();
    renderLogs();
    if (appState.session.zone === 'MCZ' || appState.session.zone === 'HCZ') {
        appState.session.terminalsInspected++;
        updateTerminalCounterDisplay();
    }
    scpInput.value = '';
    terminalInput.value = '';
    resultsArea.style.display = 'none';
    postScanActions.style.display = 'none';
    lastScanData = null;
    alert("Terminale salvato come log singolo.");
    // Opzionale: sincronizza subito
    syncWithJsonBin();
}

function saveSession() {
    if (appState.session.pendingTerminals.length === 0) {
        alert("Nessun terminale in sessione.");
        return;
    }
    const zone = appState.session.zone;
    const totalTerminals = appState.session.terminalsInspected + appState.session.pendingTerminals.length;
    if ((zone === 'MCZ' || zone === 'HCZ') && totalTerminals > 2) {
        alert(`Non puoi salvare ${appState.session.pendingTerminals.length} terminale(i). Hai già ${appState.session.terminalsInspected} salvati in questo accesso. Massimo 2.`);
        return;
    }
    const logEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        agent: prompt("Nome agente PROPDA per questa sessione:") || "Anonimo",
        zone: zone,
        supervisor: supervisorInput.value.trim(),
        authOfficer: authOfficerInput.value.trim() || null,
        terminals: [...appState.session.pendingTerminals],
        sessionTerminalCount: appState.session.pendingTerminals.length
    };
    appState.logs.push(logEntry);
    saveLogsToLocalStorage();
    renderLogs();
    if (zone === 'MCZ' || zone === 'HCZ') {
        appState.session.terminalsInspected += appState.session.pendingTerminals.length;
        updateTerminalCounterDisplay();
    }
    appState.session.pendingTerminals = [];
    renderPendingTerminals();
    alert(`Sessione salvata con ${logEntry.terminals.length} terminale(i).`);
    syncWithJsonBin();
}

function clearSession() {
    if (confirm("Svuotare tutti i terminali in sospeso da questa sessione?")) {
        appState.session.pendingTerminals = [];
        renderPendingTerminals();
        scpInput.value = '';
        terminalInput.value = '';
        resultsArea.style.display = 'none';
        postScanActions.style.display = 'none';
        lastScanData = null;
    }
}

// Scan simulation
function startScan() {
    if (!zoneSelect.value) { alert("Seleziona una zona."); return; }
    if (!scpInput.value.trim()) { alert("Inserisci SCP ID."); return; }
    if (!terminalInput.value.trim()) { alert("Inserisci Terminal ID."); return; }
    if (!supervisorInput.value.trim()) { alert("Inserisci il nome del supervisore Foundation."); return; }
    if ((appState.session.zone === 'MCZ' || appState.session.zone === 'HCZ') && 
        (appState.session.terminalsInspected + appState.session.pendingTerminals.length) >= 2) {
        alert("Limite terminali raggiunto. Salva o resetta l'accesso.");
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
        progressText.innerText = `Scansione in corso... ${progress}%`;
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

// Radio change
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
}
init();
