// ========================
// PROPDA INSPECTION ASSISTANT
// Conforme al contratto FAD-VC&A-C-220326
// ========================

// Stato dell'applicazione
let appState = {
    session: {
        zone: null,
        terminalsInspected: 0,
    },
    currentScan: {
        inProgress: false,
        result: null,
        anomalyText: ""
    },
    logs: [],          // array di oggetti ispezione
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
const scanBtn = document.getElementById('scanBtn');
const saveBtn = document.getElementById('saveInspectionBtn');
const resetAccessBtn = document.getElementById('resetAccessBtn');
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

// Helper: salva logs in localStorage e tenta sync con JSONBin
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

// Render della lista log
function renderLogs() {
    if (!logListDiv) return;
    if (appState.logs.length === 0) {
        logListDiv.innerHTML = '<div class="empty-log">Nessuna ispezione registrata. Completa e salva una ispezione.</div>';
        return;
    }
    logListDiv.innerHTML = appState.logs.slice().reverse().map(log => {
        return `<div class="log-item">
            <strong>${new Date(log.timestamp).toLocaleString()}</strong> | ${log.zone} | ${log.scpId} | Term:${log.terminalId}<br>
            Esito: ${log.scanResult} | Supervisore: ${log.supervisor} | Agente: ${log.agent || 'N/D'}
            ${log.anomalyNote ? `<br><span style="color:#f4a261;">⚠️ Anomalia: ${log.anomalyNote.substring(0, 80)}</span>` : ''}
        </div>`;
    }).join('');
}

// Aggiunge un'ispezione ai log
function addInspectionLog(inspectionData) {
    const newLog = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        agent: prompt("Inserisci il tuo nome/codice agente PROPDA (per logging RAISA):", "Agente") || "Anonimo",
        zone: inspectionData.zone,
        scpId: inspectionData.scpId,
        terminalId: inspectionData.terminalId,
        supervisor: inspectionData.supervisor,
        hardwareChecked: inspectionData.hardwareChecked,
        scanResult: inspectionData.scanResult,
        anomalyNote: inspectionData.anomalyNote || null,
        sessionTerminalCount: appState.session.terminalsInspected
    };
    appState.logs.push(newLog);
    saveLogsToLocalStorage();
    renderLogs();
    // Tentativo di sincronizzazione con JSONBin se configurato
    syncWithJsonBinBackground();
    return newLog;
}

// Sincronizzazione con JSONBin.io (push di tutti i log)
async function syncWithJsonBinBackground() {
    const { binId, apiKey } = appState.jsonBinConfig;
    if (!binId || !apiKey) {
        jsonBinStatusSpan.innerText = "non configurato";
        jsonBinStatusSpan.className = "status-offline";
        return;
    }
    try {
        jsonBinStatusSpan.innerText = "sincronizzazione...";
        const response = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': apiKey
            },
            body: JSON.stringify({ logs: appState.logs, lastUpdate: new Date().toISOString() })
        });
        if (response.ok) {
            jsonBinStatusSpan.innerText = "connesso ✅";
            jsonBinStatusSpan.className = "status-online";
        } else {
            throw new Error("Errore API");
        }
    } catch (err) {
        console.error("Sync JSONBin fallita", err);
        jsonBinStatusSpan.innerText = "errore sync";
        jsonBinStatusSpan.className = "status-offline";
    }
}

// Carica i log da JSONBin (all'avvio se configurato)
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
                jsonBinStatusSpan.innerText = "connesso ✅";
                jsonBinStatusSpan.className = "status-online";
            }
        }
    } catch(e) { console.warn("Caricamento JSONBin fallito", e); }
}

// Gestione zona e limite terminali (Clausola 10.A)
function updateSessionZone() {
    const newZone = zoneSelect.value;
    if (newZone === "") return;
    // Se cambio zona rispetto alla precedente, reset del contatore se la nuova zona è MCZ/HCZ o se si passa da MCZ/HCZ a LCZ?
    // Secondo clausola: il limite si applica per singolo accesso in MCZ/HCZ. Se cambio zona, consideriamo nuovo accesso.
    const oldZone = appState.session.zone;
    if (oldZone !== newZone) {
        // Reset contatore se la nuova zona è MCZ o HCZ oppure se si esce da MCZ/HCZ (per sicurezza)
        if (newZone === 'MCZ' || newZone === 'HCZ') {
            appState.session.terminalsInspected = 0;
        } else if (oldZone === 'MCZ' || oldZone === 'HCZ') {
            // Lasciamo contatore a 0 per LCZ (non vincolante)
            appState.session.terminalsInspected = 0;
        }
        appState.session.zone = newZone;
    } else if (!appState.session.zone) {
        appState.session.zone = newZone;
    }
    currentZoneSpan.innerText = newZone;
    terminalCountSpan.innerText = appState.session.terminalsInspected;
    // Abilita/disabilita pulsante reset accesso
    if (newZone === 'MCZ' || newZone === 'HCZ') {
        resetAccessBtn.disabled = false;
    } else {
        resetAccessBtn.disabled = true;
    }
    // Verifica limite
    if ((newZone === 'MCZ' || newZone === 'HCZ') && appState.session.terminalsInspected >= 2) {
        alert("ATTENZIONE: hai raggiunto il limite di 2 terminali ispezionati in questa zona. Richiedi nuovo accesso (Clausola 10.A).");
        scanBtn.disabled = true;
        saveBtn.disabled = true;
    } else {
        scanBtn.disabled = false;
        saveBtn.disabled = true; // si abilita solo dopo scan
    }
}

function resetAccess() {
    if (appState.session.zone === 'MCZ' || appState.session.zone === 'HCZ') {
        appState.session.terminalsInspected = 0;
        terminalCountSpan.innerText = "0";
        alert("Accesso resettato. Puoi ispezionare fino a 2 nuovi terminali in questa zona.");
        scanBtn.disabled = false;
        if (!appState.currentScan.inProgress) saveBtn.disabled = true;
    }
}

// Timer scan di 10 secondi (simulazione)
let scanTimer = null;
function startScan() {
    // Validazioni preliminari
    if (!zoneSelect.value) { alert("Seleziona una zona di ispezione."); return; }
    if (!scpInput.value.trim()) { alert("Inserisci SCP / Room ID."); return; }
    if (!terminalInput.value.trim()) { alert("Inserisci Terminale ID."); return; }
    if (!supervisorInput.value.trim()) { alert("Inserisci il nome del supervisore Foundation presente (Clausola 10.B)."); return; }
    if ((appState.session.zone === 'MCZ' || appState.session.zone === 'HCZ') && appState.session.terminalsInspected >= 2) {
        alert("Limite terminali raggiunto. Richiedi nuovo accesso con il pulsante apposito.");
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
        if (progressText) progressText.innerText = `Scansione in corso... ${progress}%`;
        if (progress >= 100) {
            clearInterval(interval);
            // Scan completato
            appState.currentScan.inProgress = false;
            scanProgressDiv.style.display = "none";
            resultsArea.style.display = "block";
            // Reset radio
            document.querySelectorAll('input[name="scanResult"]').forEach(radio => radio.checked = false);
            anomalyNoteGroup.style.display = "none";
            anomalyNote.value = "";
            saveBtn.disabled = false;
            scanBtn.disabled = false;
            // Effetto sonoro? solo RP
        }
    }, 1000); // 10 secondi totali, 10 step da 1 secondo
}

// Gestione cambio radio anomalia
document.querySelectorAll('input[name="scanResult"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.value === 'ANOMALIA') {
            anomalyNoteGroup.style.display = "block";
        } else {
            anomalyNoteGroup.style.display = "none";
        }
    });
});

// Salvataggio ispezione
function saveInspection() {
    if (!zoneSelect.value || !scpInput.value || !terminalInput.value || !supervisorInput.value) {
        alert("Compilare tutti i campi obbligatori.");
        return;
    }
    const scanResultElem = document.querySelector('input[name="scanResult"]:checked');
    if (!scanResultElem) {
        alert("Seleziona l'esito della scansione (Nominale / Anomalia).");
        return;
    }
    const hardwareChecked = Array.from(document.querySelectorAll('.hw-check:checked')).map(cb => cb.value);
    const inspection = {
        zone: zoneSelect.value,
        scpId: scpInput.value.trim(),
        terminalId: terminalInput.value.trim(),
        supervisor: supervisorInput.value.trim(),
        hardwareChecked: hardwareChecked,
        scanResult: scanResultElem.value,
        anomalyNote: (scanResultElem.value === 'ANOMALIA') ? anomalyNote.value.trim() : null
    };
    addInspectionLog(inspection);
    // Incrementa contatore terminali ispezionati (Clausola 10.A)
    if (appState.session.zone === 'MCZ' || appState.session.zone === 'HCZ') {
        appState.session.terminalsInspected++;
        terminalCountSpan.innerText = appState.session.terminalsInspected;
        if (appState.session.terminalsInspected >= 2) {
            alert("Limite di 2 terminali per questo accesso raggiunto. Per ulteriori ispezioni, richiedi nuovo accesso.");
            scanBtn.disabled = true;
            saveBtn.disabled = true;
        }
    }
    // Reset form parziale? Manteniamo i dati ma puliamo i campi a piacere? Non necessario.
    // Resetta area risultati e pulsante
    resultsArea.style.display = "none";
    saveBtn.disabled = true;
    // Opzionale: pulire i checkbox hardware? Lasciamo all'utente.
}

// Emergenza PROP (Clausola 11)
function reportEmergency() {
    const supervisor = emergencySupervisor.value.trim();
    if (!supervisor) {
        alert("È obbligatoria la presenza di personale FBI/RAISA per attivare emergenza PROP (Clausola 11).");
        return;
    }
    const propClass = propClassSelect.value;
    let protocol = "";
    switch(propClass) {
        case 'PROP-E': case 'PROP-D': protocol = "Installare antivirus designato, eseguire scan completo. Monitorare per 48h."; break;
        case 'PROP-C': protocol = "Richiedere supporto CIF (First View/Dark Wolf). Isolare il sistema e installare strumenti di containment avanzati."; break;
        case 'PROP-B': protocol = "Isolare immediatamente il segmento di rete. Deploy antivirus su tutti i sistemi collegati. Monitoraggio settimanale."; break;
        case 'PROP-A': case 'PROP-X': protocol = "Contattare immediatamente The Representant o High Command. NON intervenire autonomamente. Evacuare l'area se necessario."; break;
        default: protocol = "Segui i protocolli interni di VC&A.";
    }
    protocolTextDiv.innerText = protocol;
    emergencyProtocolDiv.style.display = "block";
    // Logga evento emergenza nei log? Aggiungiamo un record speciale
    const emergencyLog = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        agent: prompt("Registra il tuo nome agente per il rapporto emergenza:") || "Agente",
        type: "EMERGENZA_PROP",
        propClass: propClass,
        supervisorRAISA: supervisor,
        protocolAdvised: protocol
    };
    appState.logs.push(emergencyLog);
    saveLogsToLocalStorage();
    renderLogs();
    syncWithJsonBinBackground();
    alert(`Emergenza PROP segnalata. Protocollo: ${protocol}`);
}

// Export logs come JSON
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
    if (confirm("Cancellare tutti i log locali? (I dati su JSONBin.io rimarranno se configurati)")) {
        appState.logs = [];
        saveLogsToLocalStorage();
        renderLogs();
        alert("Log locali cancellati.");
    }
}

// Configurazione JSONBin
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
        alert("Inserisci sia Bin ID che API Key");
        return;
    }
    appState.jsonBinConfig = { binId, apiKey };
    localStorage.setItem('propda_jsonbin_config', JSON.stringify(appState.jsonBinConfig));
    document.getElementById('configModal').style.display = "none";
    loadFromJsonBin(); // tenta di caricare
    syncWithJsonBinBackground();
}

// Carica config da localStorage
function loadJsonBinConfig() {
    const stored = localStorage.getItem('propda_jsonbin_config');
    if (stored) {
        try {
            appState.jsonBinConfig = JSON.parse(stored);
            if (appState.jsonBinConfig.binId && appState.jsonBinConfig.apiKey) {
                jsonBinStatusSpan.innerText = "configurato, sincronizzo...";
                loadFromJsonBin();
            }
        } catch(e) {}
    }
}

// Event listeners
zoneSelect.addEventListener('change', updateSessionZone);
resetAccessBtn.addEventListener('click', resetAccess);
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

// Inizializzazione
function init() {
    loadLogsFromLocalStorage();
    loadJsonBinConfig();
    updateSessionZone();
    // Eventuali altri setup
}

init();
