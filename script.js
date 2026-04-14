// ======================== CONFIGURAZIONE ========================
// Sostituisci con i tuoi dati da JSONbin.io
const BIN_ID = "IL_TUO_BIN_ID";                      // ID del Bin pubblico
const MASTER_KEY = "$2b$10$LA_TUA_MASTER_KEY";       // Chiave pubblica per lettura
const SECRET_KEY = "LA_TUA_CHIAVE_SEGRETA_SCRITTURA"; // Chiave segreta (solo admin)
const READ_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}/latest`;
const UPDATE_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
// ===============================================================

// Stato globale dell'applicazione
const AppState = {
    zones: [],                  // Array di Zone { name, doors, computers }
    isAdmin: false,            // Modalità admin attiva?
    currentView: 'zones',      // 'zones', 'doors', 'computers'
    currentZoneIndex: -1,      // Indice della zona selezionata
    navigationStack: []        // Per gestire il "back"
};

// Elementi DOM frequenti
const contentArea = document.getElementById('content-area');
const breadcrumbSpan = document.getElementById('zone-title');
const backBtn = document.getElementById('back-btn');
const refreshBtn = document.getElementById('refresh-btn');
const loginBtn = document.getElementById('login-btn');
const logoutAdminBtn = document.getElementById('logout-admin');
const adminPanel = document.getElementById('admin-panel');
const adminActions = document.getElementById('admin-actions');
const statusMsg = document.getElementById('status-message');
const loginModal = document.getElementById('login-modal');
const addModal = document.getElementById('add-modal');
const passwordInput = document.getElementById('password-input');
const loginError = document.getElementById('login-error');

// Inizializzazione
document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);
    loadDataFromAPI();
    setupEventListeners();
});

// Orologio
function updateClock() {
    const now = new Date();
    document.getElementById('system-time').textContent = now.toLocaleTimeString('it-IT');
}

// Event Listeners
function setupEventListeners() {
    backBtn.addEventListener('click', handleBack);
    refreshBtn.addEventListener('click', () => loadDataFromAPI());
    loginBtn.addEventListener('click', openLoginModal);
    logoutAdminBtn.addEventListener('click', logoutAdmin);
    
    document.getElementById('cancel-login').addEventListener('click', closeLoginModal);
    document.getElementById('confirm-login').addEventListener('click', handleLogin);
    document.getElementById('cancel-add').addEventListener('click', closeAddModal);
    document.getElementById('confirm-add').addEventListener('click', handleAddConfirm);
    
    passwordInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') handleLogin(); });
}

// ======================== API & DATA ========================
async function loadDataFromAPI() {
    try {
        statusMsg.innerHTML = '● SINCRONIZZAZIONE...';
        const response = await fetch(READ_URL, {
            headers: { 'X-Master-Key': MASTER_KEY }
        });
        if (!response.ok) throw new Error('Errore di rete');
        const data = await response.json();
        AppState.zones = data.record.zones || [];
        statusMsg.innerHTML = '● CONNESSO';
        renderCurrentView();
    } catch (error) {
        console.error(error);
        statusMsg.innerHTML = '● ERRORE CONNESSIONE';
        // Dati di fallback
        if (AppState.zones.length === 0) {
            AppState.zones = [{ name: "Zona di Test", doors: [], computers: [] }];
            renderCurrentView();
        }
    }
}

async function saveDataToAPI() {
    if (!AppState.isAdmin) {
        alert("Permessi insufficienti.");
        return;
    }
    try {
        statusMsg.innerHTML = '● SALVATAGGIO...';
        const response = await fetch(UPDATE_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': MASTER_KEY,
                'X-Access-Key': SECRET_KEY,
                'X-Bin-Private': 'false'
            },
            body: JSON.stringify({ zones: AppState.zones })
        });
        if (!response.ok) throw new Error('Salvataggio fallito');
        statusMsg.innerHTML = '● DATI SALVATI';
        await loadDataFromAPI(); // Ricarica per sicurezza
    } catch (error) {
        console.error(error);
        statusMsg.innerHTML = '● ERRORE SALVATAGGIO';
        alert('Impossibile salvare i dati. Controlla console.');
    }
}

// ======================== RENDERING ========================
function renderCurrentView() {
    if (AppState.currentView === 'zones') {
        renderZonesView();
        breadcrumbSpan.textContent = 'TUTTE LE ZONE';
        backBtn.disabled = true;
    } else if (AppState.currentView === 'doors' && AppState.currentZoneIndex !== -1) {
        renderDoorsView();
        breadcrumbSpan.textContent = `${AppState.zones[AppState.currentZoneIndex].name} · PORTE`;
        backBtn.disabled = false;
    } else if (AppState.currentView === 'computers' && AppState.currentZoneIndex !== -1) {
        renderComputersView();
        breadcrumbSpan.textContent = `${AppState.zones[AppState.currentZoneIndex].name} · COMPUTER`;
        backBtn.disabled = false;
    }
    updateAdminPanel();
}

function renderZonesView() {
    let html = '<div class="zone-grid">';
    AppState.zones.forEach((zone, index) => {
        const hasAnomaly = zone.computers.some(c => c.anomalous);
        const anomalyClass = hasAnomaly ? 'anomaly-warning' : '';
        html += `
            <div class="zone-card ${anomalyClass}" data-zone-index="${index}">
                <h3>${zone.name}</h3>
                <div class="zone-stats">
                    🚪 ${zone.doors.length} &nbsp;|&nbsp; 💻 ${zone.computers.length}
                    ${hasAnomaly ? '<br><span style="color:#e74c3c;">⚠️ ANOMALIA RILEVATA</span>' : ''}
                </div>
            </div>
        `;
    });
    html += '</div>';
    if (AppState.isAdmin) {
        html += `<div style="margin-top:20px; text-align:center;"><button id="add-zone-btn" class="btn">➕ AGGIUNGI ZONA</button></div>`;
    }
    contentArea.innerHTML = html;
    
    document.querySelectorAll('.zone-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const idx = card.dataset.zoneIndex;
            if (idx !== undefined) openZoneMenu(parseInt(idx));
        });
    });
    if (AppState.isAdmin) {
        const addZoneBtn = document.getElementById('add-zone-btn');
        if(addZoneBtn) addZoneBtn.addEventListener('click', () => openAddModal('zone'));
    }
}

function renderDoorsView() {
    const zone = AppState.zones[AppState.currentZoneIndex];
    let html = `<ul class="items-list">`;
    zone.doors.forEach((door, idx) => {
        html += `
            <li class="item-row door" data-door-index="${idx}">
                <span class="item-icon">🚪</span>
                <div class="item-info">
                    <div class="item-id">${door.id}</div>
                    <div class="item-status ${door.locked ? 'status-locked' : 'status-unlocked'}">
                        ${door.locked ? 'BLOCCATA' : 'SBLOCCATA'}
                    </div>
                </div>
                ${AppState.isAdmin ? `
                <div class="item-actions">
                    <button class="btn btn-small toggle-lock" data-idx="${idx}">🔓/🔒</button>
                    <button class="btn btn-small btn-danger delete-door" data-idx="${idx}">🗑️</button>
                </div>` : ''}
            </li>
        `;
    });
    html += '</ul>';
    if (AppState.isAdmin) {
        html += `<div style="margin-top:20px;"><button id="add-door-btn" class="btn">➕ AGGIUNGI PORTA</button></div>`;
    }
    contentArea.innerHTML = html;
    attachDoorEvents();
}

function renderComputersView() {
    const zone = AppState.zones[AppState.currentZoneIndex];
    let html = `<ul class="items-list">`;
    zone.computers.forEach((comp, idx) => {
        html += `
            <li class="item-row computer ${comp.anomalous ? 'anomalous' : ''}" data-comp-index="${idx}">
                <span class="item-icon">💻</span>
                <div class="item-info">
                    <div class="item-id">${comp.id}</div>
                    <div class="item-status ${comp.anomalous ? 'status-anomalous' : 'status-clean'}">
                        ${comp.anomalous ? 'ANOMALO' : 'PULITO'}
                    </div>
                </div>
                ${AppState.isAdmin ? `
                <div class="item-actions">
                    <button class="btn btn-small toggle-anomaly" data-idx="${idx}">⚠️/✅</button>
                    <button class="btn btn-small btn-danger delete-comp" data-idx="${idx}">🗑️</button>
                </div>` : ''}
            </li>
        `;
    });
    html += '</ul>';
    if (AppState.isAdmin) {
        html += `<div style="margin-top:20px;"><button id="add-computer-btn" class="btn">➕ AGGIUNGI COMPUTER</button></div>`;
    }
    contentArea.innerHTML = html;
    attachComputerEvents();
}

// ======================== INTERAZIONI ========================
function openZoneMenu(index) {
    AppState.currentZoneIndex = index;
    AppState.currentView = 'doors'; // Default mostriamo porte
    renderCurrentView();
}

function handleBack() {
    if (AppState.currentView !== 'zones') {
        AppState.currentView = 'zones';
        AppState.currentZoneIndex = -1;
        renderCurrentView();
    }
}

function attachDoorEvents() {
    if (!AppState.isAdmin) return;
    document.querySelectorAll('.toggle-lock').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = btn.dataset.idx;
            const zone = AppState.zones[AppState.currentZoneIndex];
            zone.doors[idx].locked = !zone.doors[idx].locked;
            saveDataToAPI();
            renderCurrentView();
        });
    });
    document.querySelectorAll('.delete-door').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm('Eliminare questa porta?')) return;
            const idx = btn.dataset.idx;
            AppState.zones[AppState.currentZoneIndex].doors.splice(idx, 1);
            saveDataToAPI();
            renderCurrentView();
        });
    });
    const addBtn = document.getElementById('add-door-btn');
    if(addBtn) addBtn.addEventListener('click', () => openAddModal('door'));
}

function attachComputerEvents() {
    if (!AppState.isAdmin) return;
    document.querySelectorAll('.toggle-anomaly').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = btn.dataset.idx;
            const zone = AppState.zones[AppState.currentZoneIndex];
            zone.computers[idx].anomalous = !zone.computers[idx].anomalous;
            saveDataToAPI();
            renderCurrentView();
        });
    });
    document.querySelectorAll('.delete-comp').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm('Eliminare questo computer?')) return;
            const idx = btn.dataset.idx;
            AppState.zones[AppState.currentZoneIndex].computers.splice(idx, 1);
            saveDataToAPI();
            renderCurrentView();
        });
    });
    const addBtn = document.getElementById('add-computer-btn');
    if(addBtn) addBtn.addEventListener('click', () => openAddModal('computer'));
}

// ======================== MODALITÀ ADMIN ========================
function openLoginModal() {
    loginModal.classList.remove('hidden');
    passwordInput.value = '';
    loginError.textContent = '';
    passwordInput.focus();
}

function closeLoginModal() {
    loginModal.classList.add('hidden');
}

function handleLogin() {
    const pwd = passwordInput.value.trim();
    // Password fissa come nel C++: "VC&A-LEVEL4"
    if (pwd === 'VC&A-LEVEL4') {
        AppState.isAdmin = true;
        closeLoginModal();
        updateAdminPanel();
        renderCurrentView(); // Ricarica per mostrare pulsanti admin
        statusMsg.innerHTML = '● MODALITÀ AMMINISTRATORE ATTIVA';
    } else {
        loginError.textContent = 'ACCESSO NEGATO: CREDENZIALI ERRATE';
    }
}

function logoutAdmin() {
    AppState.isAdmin = false;
    updateAdminPanel();
    if (AppState.currentView !== 'zones') {
        // Torna a zone per sicurezza
        AppState.currentView = 'zones';
        AppState.currentZoneIndex = -1;
    }
    renderCurrentView();
    statusMsg.innerHTML = '● CONNESSO';
}

function updateAdminPanel() {
    if (AppState.isAdmin) {
        adminPanel.classList.remove('hidden');
        let actionsHtml = '';
        if (AppState.currentView === 'zones') {
            actionsHtml = `<button id="admin-add-zone" class="btn">➕ NUOVA ZONA</button>`;
        } else if (AppState.currentView === 'doors') {
            actionsHtml = `<button id="admin-add-door" class="btn">➕ NUOVA PORTA</button>`;
        } else if (AppState.currentView === 'computers') {
            actionsHtml = `<button id="admin-add-computer" class="btn">➕ NUOVO COMPUTER</button>`;
        }
        // Aggiungi anche opzione per eliminare zona corrente
        if (AppState.currentZoneIndex !== -1) {
            actionsHtml += `<button id="admin-delete-zone" class="btn btn-danger">🗑️ ELIMINA ZONA</button>`;
        }
        adminActions.innerHTML = actionsHtml;
        // Attacca eventi
        document.getElementById('admin-add-zone')?.addEventListener('click', ()=>openAddModal('zone'));
        document.getElementById('admin-add-door')?.addEventListener('click', ()=>openAddModal('door'));
        document.getElementById('admin-add-computer')?.addEventListener('click', ()=>openAddModal('computer'));
        document.getElementById('admin-delete-zone')?.addEventListener('click', ()=>{
            if (confirm(`Eliminare la zona "${AppState.zones[AppState.currentZoneIndex].name}"?`)) {
                AppState.zones.splice(AppState.currentZoneIndex, 1);
                AppState.currentZoneIndex = -1;
                AppState.currentView = 'zones';
                saveDataToAPI();
                renderCurrentView();
            }
        });
    } else {
        adminPanel.classList.add('hidden');
    }
}

// ======================== MODALE AGGIUNTA ========================
let currentAddType = null; // 'zone', 'door', 'computer'

function openAddModal(type) {
    currentAddType = type;
    const title = document.getElementById('modal-title');
    const fieldsDiv = document.getElementById('modal-fields');
    
    if (type === 'zone') {
        title.textContent = 'AGGIUNGI NUOVA ZONA';
        fieldsDiv.innerHTML = `<input type="text" id="zone-name-input" class="modal-field" placeholder="Nome Zona" autocomplete="off">`;
    } else if (type === 'door') {
        title.textContent = 'AGGIUNGI NUOVA PORTA';
        fieldsDiv.innerHTML = `
            <input type="text" id="door-id-input" class="modal-field" placeholder="ID Porta (es. D-03)" autocomplete="off">
            <label style="display:flex; align-items:center; gap:10px; margin:10px 0;">
                <input type="checkbox" id="door-locked-input"> Bloccata?
            </label>
        `;
    } else if (type === 'computer') {
        title.textContent = 'AGGIUNGI NUOVO COMPUTER';
        fieldsDiv.innerHTML = `
            <input type="text" id="comp-id-input" class="modal-field" placeholder="ID Computer (es. TERM-08)" autocomplete="off">
            <label style="display:flex; align-items:center; gap:10px; margin:10px 0;">
                <input type="checkbox" id="comp-anomalous-input"> Anomalo?
            </label>
        `;
    }
    addModal.classList.remove('hidden');
    // Focus primo input
    setTimeout(() => fieldsDiv.querySelector('input')?.focus(), 100);
}

function closeAddModal() {
    addModal.classList.add('hidden');
    currentAddType = null;
}

function handleAddConfirm() {
    if (!AppState.isAdmin) return;
    
    if (currentAddType === 'zone') {
        const name = document.getElementById('zone-name-input')?.value.trim();
        if (!name) { alert('Nome obbligatorio'); return; }
        AppState.zones.push({ name, doors: [], computers: [] });
        saveDataToAPI();
        closeAddModal();
        if (AppState.currentView !== 'zones') {
            AppState.currentView = 'zones';
            AppState.currentZoneIndex = -1;
        }
        renderCurrentView();
    } else if (currentAddType === 'door' && AppState.currentZoneIndex !== -1) {
        const id = document.getElementById('door-id-input')?.value.trim();
        if (!id) { alert('ID obbligatorio'); return; }
        const locked = document.getElementById('door-locked-input')?.checked || false;
        AppState.zones[AppState.currentZoneIndex].doors.push({ id, locked });
        saveDataToAPI();
        closeAddModal();
        renderCurrentView();
    } else if (currentAddType === 'computer' && AppState.currentZoneIndex !== -1) {
        const id = document.getElementById('comp-id-input')?.value.trim();
        if (!id) { alert('ID obbligatorio'); return; }
        const anomalous = document.getElementById('comp-anomalous-input')?.checked || false;
        AppState.zones[AppState.currentZoneIndex].computers.push({ id, anomalous });
        saveDataToAPI();
        closeAddModal();
        renderCurrentView();
    }
}