// ======================== CONFIGURATION ========================
const BIN_ID = "69df665d36566621a8b694e5";               // Your Bin ID
const MASTER_KEY = "$2a$10$RvtAYcVttTgFZj1lk9gy7uG4jjzKPztlQOwZ10zcS1eKOb0fACdO2";          // Your public Master Key
const READ_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}/latest`;
// ===============================================================

// Access password
const VIEWER_PASSWORD = "VC&A-VIEWER";

// HCZ/MCZ zone keywords (case-insensitive)
const HCZ_MCZ_KEYWORDS = ["hcz", "mcz", "heavy containment", "medium containment"];

// Max computers to inspect per HCZ/MCZ entry
const MAX_COMPUTERS_PER_ENTRY = 2;

const AppState = {
    zones: [],
    isLoggedIn: false,
    currentView: 'zones',
    currentZoneIndex: -1,
    currentRoomIndex: -1,
    showComputersForViewer: false,
    
    // Contract compliance
    hczInspectedComputers: {},      // { zoneName: [computerIds] } per tracciare quali computer sono stati ispezionati in questo ingresso
    inspectionLog: [],
    currentSupervisor: null,        // Nome del supervisore attuale
    supervisionActive: false        // true se la supervisione è stata concessa per la sessione corrente
};

// DOM Elements
const initialOverlay = document.getElementById('initial-login-overlay');
const mainContainer = document.getElementById('main-container');
const initialPasswordInput = document.getElementById('initial-password-input');
const initialLoginBtn = document.getElementById('initial-login-btn');
const initialLoginError = document.getElementById('initial-login-error');
const contentArea = document.getElementById('content-area');
const breadcrumbSpan = document.getElementById('zone-title');
const backBtn = document.getElementById('back-btn');
const refreshBtn = document.getElementById('refresh-btn');
const loginBtn = document.getElementById('login-btn'); // Diventa "Request Supervision"
const logoutAdminBtn = document.getElementById('logout-admin');
const adminPanel = document.getElementById('admin-panel');
const adminActions = document.getElementById('admin-actions');
const statusMsg = document.getElementById('status-message');
const loginModal = document.getElementById('login-modal');
const addModal = document.getElementById('add-modal');
const passwordInput = document.getElementById('password-input');
const loginError = document.getElementById('login-error');

document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);
    setupEventListeners();
});

function updateClock() {
    const now = new Date();
    const timeElement = document.getElementById('system-time');
    if (timeElement) timeElement.textContent = now.toLocaleTimeString('en-GB');
}

function setupEventListeners() {
    initialLoginBtn.addEventListener('click', handleInitialLogin);
    initialPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleInitialLogin();
    });

    backBtn.addEventListener('click', handleBack);
    refreshBtn.addEventListener('click', () => loadDataFromAPI());
    
    // Repurpose login button for supervision request
    loginBtn.textContent = '📡 REQUEST SUPERVISION';
    loginBtn.addEventListener('click', openSupervisionModal);
    
    // Hide admin elements permanently
    adminPanel.classList.add('hidden');
    if (logoutAdminBtn) logoutAdminBtn.style.display = 'none';
    
    // Modal handlers
    document.getElementById('cancel-login').addEventListener('click', closeSupervisionModal);
    document.getElementById('confirm-login').addEventListener('click', handleSupervisionRequest);
    document.getElementById('cancel-add').addEventListener('click', closeAddModal);
    document.getElementById('confirm-add').addEventListener('click', handleAddConfirm);
    
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') handleSupervisionRequest(); });
    }
}

// ======================== INITIAL LOGIN ========================
function handleInitialLogin() {
    const pwd = initialPasswordInput.value.trim();
    if (pwd === VIEWER_PASSWORD) {
        AppState.isLoggedIn = true;
        initialOverlay.style.display = 'none';
        mainContainer.style.display = 'flex';
        loadDataFromAPI();
    } else {
        initialLoginError.textContent = 'ACCESS DENIED: INVALID CREDENTIALS';
    }
}

// ======================== API (READ ONLY) ========================
async function loadDataFromAPI() {
    if (!AppState.isLoggedIn) return;
    try {
        statusMsg.innerHTML = '● SYNCING...';
        const response = await fetch(READ_URL, { headers: { 'X-Master-Key': MASTER_KEY } });
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();
        AppState.zones = data.record.zones || [];
        statusMsg.innerHTML = '● CONNECTED';
        renderCurrentView();
    } catch (error) {
        console.error(error);
        statusMsg.innerHTML = '● CONNECTION ERROR';
        if (AppState.zones.length === 0) {
            AppState.zones = [{ name: "Test Zone", rooms: [] }];
            renderCurrentView();
        }
    }
}

// ======================== UTILITY ========================
function isHCZMCZZone(zoneName) {
    return HCZ_MCZ_KEYWORDS.some(kw => zoneName.toLowerCase().includes(kw.toLowerCase()));
}

function getInspectedComputersCount(zoneName) {
    const list = AppState.hczInspectedComputers[zoneName] || [];
    return list.length;
}

function canInspectComputer(zoneName, computerId) {
    if (!isHCZMCZZone(zoneName)) return true;
    const inspected = AppState.hczInspectedComputers[zoneName] || [];
    // Se il computer è già stato ispezionato in questo ingresso, non conta di nuovo
    if (inspected.includes(computerId)) return true;
    return inspected.length < MAX_COMPUTERS_PER_ENTRY;
}

function markComputerInspected(zoneName, computerId) {
    if (!isHCZMCZZone(zoneName)) return;
    if (!AppState.hczInspectedComputers[zoneName]) {
        AppState.hczInspectedComputers[zoneName] = [];
    }
    const list = AppState.hczInspectedComputers[zoneName];
    if (!list.includes(computerId) && list.length < MAX_COMPUTERS_PER_ENTRY) {
        list.push(computerId);
    }
}

function resetHCZEntry(zoneName) {
    if (isHCZMCZZone(zoneName)) {
        AppState.hczInspectedComputers[zoneName] = [];
        // Log the entry request
        const logEntry = {
            timestamp: new Date().toISOString(),
            zone: zoneName,
            action: 'New HCZ/MCZ entry requested',
            supervisor: AppState.currentSupervisor || 'Not supervised',
            inspector: 'VC&A Agent'
        };
        AppState.inspectionLog.push(logEntry);
        statusMsg.innerHTML = `● NEW ENTRY GRANTED FOR ${zoneName}`;
        setTimeout(() => statusMsg.innerHTML = '● CONNECTED', 2000);
    }
}

// ======================== RENDERING ========================
function renderCurrentView() {
    if (!AppState.isLoggedIn) return;
    if (AppState.currentView === 'zones') {
        renderZonesView();
        breadcrumbSpan.textContent = 'ALL ZONES';
        backBtn.disabled = true;
    } else if (AppState.currentView === 'rooms' && AppState.currentZoneIndex !== -1) {
        renderRoomsView();
        breadcrumbSpan.textContent = `${AppState.zones[AppState.currentZoneIndex].name} · ROOMS`;
        backBtn.disabled = false;
    } else if (AppState.currentView === 'doors' && AppState.currentZoneIndex !== -1 && AppState.currentRoomIndex !== -1) {
        renderDoorsView();
        const zone = AppState.zones[AppState.currentZoneIndex];
        const room = zone.rooms[AppState.currentRoomIndex];
        breadcrumbSpan.textContent = `${zone.name} / ${room.name} · ${AppState.showComputersForViewer ? 'COMPUTERS' : 'DOORS'}`;
        backBtn.disabled = false;
    }
    
    // Update supervision status in footer
    if (AppState.supervisionActive && AppState.currentSupervisor) {
        statusMsg.innerHTML = `● SUPERVISED BY ${AppState.currentSupervisor.toUpperCase()}`;
    } else if (AppState.currentView !== 'zones' && !AppState.supervisionActive) {
        statusMsg.innerHTML = '● SUPERVISION REQUIRED';
    } else {
        statusMsg.innerHTML = '● CONNECTED';
    }
}

function renderZonesView() {
    let html = '<div class="zone-grid">';
    AppState.zones.forEach((zone, index) => {
        const totalRooms = zone.rooms.length;
        let totalDoors = 0, totalComputers = 0, hasAnomaly = false;
        zone.rooms.forEach(room => {
            totalDoors += room.doors.length;
            totalComputers += room.computers.length;
            if (room.computers.some(c => c.anomalous)) hasAnomaly = true;
        });
        const anomalyClass = hasAnomaly ? 'anomaly-warning' : '';
        const isHCZ = isHCZMCZZone(zone.name);
        const inspectedCount = getInspectedComputersCount(zone.name);
        const limitReached = isHCZ && inspectedCount >= MAX_COMPUTERS_PER_ENTRY;
        
        html += `
            <div class="zone-card ${anomalyClass}" data-zone-index="${index}" style="position:relative;">
                <h3>${zone.name}</h3>
                <div class="zone-stats">
                    🚪 ${totalDoors} &nbsp;|&nbsp; 💻 ${totalComputers} &nbsp;|&nbsp; 📁 ${totalRooms} rooms
                    ${hasAnomaly ? '<br><span style="color:#e74c3c;">⚠️ ANOMALY DETECTED</span>' : ''}
                    ${isHCZ ? `<br><span style="color:#f1c40f;">🔒 HCZ/MCZ: ${inspectedCount}/${MAX_COMPUTERS_PER_ENTRY} terminals inspected</span>` : ''}
                </div>
                ${limitReached ? '<div style="position:absolute; top:5px; right:5px; color:#e74c3c;">⛔ LIMIT</div>' : ''}
                ${isHCZ ? `
                <div style="margin-top:10px;">
                    <button class="btn-small btn request-entry-btn" data-zone-name="${zone.name}">🔄 Request New Entry</button>
                </div>` : ''}
            </div>
        `;
    });
    html += '</div>';
    contentArea.innerHTML = html;
    
    document.querySelectorAll('.zone-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Ignore if clicking on the button inside
            if (e.target.classList.contains('request-entry-btn')) return;
            const idx = card.dataset.zoneIndex;
            if (idx !== undefined) {
                openZone(parseInt(idx));
            }
        });
    });
    
    document.querySelectorAll('.request-entry-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const zoneName = btn.dataset.zoneName;
            if (confirm(`Request new entry for ${zoneName}? This will reset the terminal inspection count.`)) {
                resetHCZEntry(zoneName);
                renderCurrentView();
            }
        });
    });
}

function renderRoomsView() {
    const zone = AppState.zones[AppState.currentZoneIndex];
    let html = `<div style="margin-bottom:15px;"><h2 style="color:#d4ede8;">Rooms in ${zone.name}</h2></div>`;
    
    // Show supervision request if not active
    if (!AppState.supervisionActive) {
        html += `<div style="margin-bottom:20px; padding:10px; background:rgba(192,57,43,0.2); border-left:4px solid #c0392b;">
            <strong>⚠️ Foundation supervision required to proceed.</strong> Click "REQUEST SUPERVISION" below.
        </div>`;
    } else {
        html += `<div style="margin-bottom:20px; padding:10px; background:rgba(29,116,131,0.2); border-left:4px solid #1D7483;">
            ✅ Supervised by: <strong>${AppState.currentSupervisor}</strong>
        </div>`;
    }
    
    html += '<div class="zone-grid">';
    zone.rooms.forEach((room, idx) => {
        const hasAnomaly = room.computers.some(c => c.anomalous);
        const anomalyClass = hasAnomaly ? 'anomaly-warning' : '';
        const doorsCount = room.doors.length;
        const computersCount = room.computers.length;
        
        html += `
            <div class="zone-card ${anomalyClass}" data-room-index="${idx}">
                <h3>${room.name}</h3>
                <div class="zone-stats">
                    🚪 ${doorsCount} door${doorsCount !== 1 ? 's' : ''} &nbsp;|&nbsp; 💻 ${computersCount} computer${computersCount !== 1 ? 's' : ''}
                    ${hasAnomaly ? '<br><span style="color:#e74c3c;">⚠️ ANOMALY DETECTED</span>' : ''}
                </div>
            </div>
        `;
    });
    html += '</div>';
    contentArea.innerHTML = html;
    
    document.querySelectorAll('.zone-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const idx = card.dataset.roomIndex;
            if (idx !== undefined) {
                if (!AppState.supervisionActive) {
                    openSupervisionModal();
                    return;
                }
                openRoom(parseInt(idx));
            }
        });
    });
}

function renderDoorsView() {
    const zone = AppState.zones[AppState.currentZoneIndex];
    const room = zone.rooms[AppState.currentRoomIndex];
    const isHCZ = isHCZMCZZone(zone.name);
    const inspectedCount = getInspectedComputersCount(zone.name);
    
    let html = '';
    
    // Supervision banner
    html += `<div style="margin-bottom:15px; padding:8px; background:rgba(29,116,131,0.2); border-left:4px solid #1D7483;">
        ✅ Supervised by: <strong>${AppState.currentSupervisor}</strong> | Zone: ${zone.name} ${isHCZ ? `(HCZ/MCZ - ${inspectedCount}/${MAX_COMPUTERS_PER_ENTRY} terminals inspected)` : ''}
    </div>`;
    
    // Toggle button for computers
    html += `
        <div style="margin-bottom:20px; display: flex; gap: 10px;">
            <button id="toggle-viewer-view" class="btn">
                ${AppState.showComputersForViewer ? '🚪 SHOW DOORS' : '💻 SHOW COMPUTERS'}
            </button>
            <button id="log-inspection-btn" class="btn" style="background: #1D7483;">📋 LOG INSPECTION</button>
        </div>
    `;
    
    if (AppState.showComputersForViewer) {
        // Computer list
        html += `<ul class="items-list">`;
        room.computers.forEach((comp) => {
            const canInspect = canInspectComputer(zone.name, comp.id);
            const alreadyInspected = AppState.hczInspectedComputers[zone.name]?.includes(comp.id) || false;
            
            html += `
                <li class="item-row computer ${comp.anomalous ? 'anomalous' : ''}" data-computer-id="${comp.id}">
                    <span class="item-icon">💻</span>
                    <div class="item-info">
                        <div class="item-id">${comp.id}</div>
                        <div class="item-status ${comp.anomalous ? 'status-anomalous' : 'status-clean'}">
                            ${comp.anomalous ? 'ANOMALOUS' : 'CLEAN'}
                        </div>
                    </div>
                    ${isHCZ && !canInspect && !alreadyInspected ? '<span style="color:#e74c3c; margin-right:10px;">⛔ LIMIT REACHED</span>' : ''}
                    <button class="btn-small btn inspect-comp-btn" data-computer-id="${comp.id}" ${!canInspect && !alreadyInspected ? 'disabled' : ''}>
                        🔍 INSPECT
                    </button>
                </li>
            `;
        });
        html += '</ul>';
    } else {
        // Doors list
        html += `<ul class="items-list">`;
        room.doors.forEach((door) => {
            html += `
                <li class="item-row door">
                    <span class="item-icon">🚪</span>
                    <div class="item-info">
                        <div class="item-id">${door.id}</div>
                        <div class="item-status ${door.locked ? 'status-locked' : 'status-unlocked'}">
                            ${door.locked ? 'LOCKED' : 'UNLOCKED'}
                        </div>
                    </div>
                </li>
            `;
        });
        html += '</ul>';
    }
    
    contentArea.innerHTML = html;
    
    document.getElementById('toggle-viewer-view')?.addEventListener('click', () => {
        AppState.showComputersForViewer = !AppState.showComputersForViewer;
        renderCurrentView();
    });
    
    document.getElementById('log-inspection-btn')?.addEventListener('click', () => {
        logCurrentInspection();
    });
    
    // Inspect computer buttons
    document.querySelectorAll('.inspect-comp-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const computerId = btn.dataset.computerId;
            if (!AppState.supervisionActive) {
                alert('Supervision required.');
                return;
            }
            const zoneName = AppState.zones[AppState.currentZoneIndex].name;
            if (!canInspectComputer(zoneName, computerId)) {
                alert(`Cannot inspect more than ${MAX_COMPUTERS_PER_ENTRY} terminals per HCZ/MCZ entry. Request new entry.`);
                return;
            }
            markComputerInspected(zoneName, computerId);
            
            // Log inspection
            const logEntry = {
                timestamp: new Date().toISOString(),
                zone: zoneName,
                room: room.name,
                computer: computerId,
                action: 'Inspected',
                supervisor: AppState.currentSupervisor,
                inspector: 'VC&A Agent'
            };
            AppState.inspectionLog.push(logEntry);
            
            alert(`Terminal ${computerId} inspected.`);
            renderCurrentView();
        });
    });
}

// ======================== SUPERVISION MODAL ========================
function openSupervisionModal() {
    loginModal.classList.remove('hidden');
    document.querySelector('#login-modal h2').textContent = 'REQUEST FOUNDATION SUPERVISION';
    document.querySelector('#login-modal p').textContent = 'Enter supervisor name (simulate radio request)';
    passwordInput.placeholder = 'Supervisor Name';
    passwordInput.value = '';
    loginError.textContent = '';
    passwordInput.focus();
}

function closeSupervisionModal() {
    loginModal.classList.add('hidden');
}

function handleSupervisionRequest() {
    const supervisorName = passwordInput.value.trim();
    if (!supervisorName) {
        loginError.textContent = 'Supervisor name required.';
        return;
    }
    AppState.supervisionActive = true;
    AppState.currentSupervisor = supervisorName;
    closeSupervisionModal();
    
    // Log supervision start
    const zone = AppState.currentZoneIndex !== -1 ? AppState.zones[AppState.currentZoneIndex] : null;
    const logEntry = {
        timestamp: new Date().toISOString(),
        zone: zone ? zone.name : 'N/A',
        supervisor: supervisorName,
        action: 'Supervision granted',
        inspector: 'VC&A Agent'
    };
    AppState.inspectionLog.push(logEntry);
    
    statusMsg.innerHTML = `● SUPERVISION ACTIVE: ${supervisorName.toUpperCase()}`;
    renderCurrentView();
}

function logCurrentInspection() {
    const zone = AppState.zones[AppState.currentZoneIndex];
    const room = zone.rooms[AppState.currentRoomIndex];
    const logEntry = {
        timestamp: new Date().toISOString(),
        zone: zone.name,
        room: room.name,
        doorsChecked: room.doors.length,
        computersChecked: room.computers.length,
        anomaliesFound: room.computers.filter(c => c.anomalous).length,
        supervisor: AppState.currentSupervisor || 'None',
        inspector: 'VC&A Agent'
    };
    AppState.inspectionLog.push(logEntry);
    
    const logText = JSON.stringify(AppState.inspectionLog, null, 2);
    const blob = new Blob([logText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inspection_log_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    statusMsg.innerHTML = '● INSPECTION LOGGED AND DOWNLOADED';
    setTimeout(() => statusMsg.innerHTML = `● SUPERVISED BY ${AppState.currentSupervisor?.toUpperCase() || 'NONE'}`, 2000);
}

// ======================== NAVIGATION ========================
function openZone(index) {
    AppState.currentZoneIndex = index;
    AppState.currentRoomIndex = -1;
    AppState.currentView = 'rooms';
    AppState.supervisionActive = false; // Reset supervision when changing zone
    AppState.currentSupervisor = null;
    AppState.showComputersForViewer = false;
    renderCurrentView();
}

function openRoom(index) {
    if (!AppState.supervisionActive) {
        openSupervisionModal();
        return;
    }
    AppState.currentRoomIndex = index;
    AppState.currentView = 'doors';
    AppState.showComputersForViewer = false;
    renderCurrentView();
}

function handleBack() {
    if (AppState.currentView === 'doors') {
        AppState.currentView = 'rooms';
        AppState.currentRoomIndex = -1;
        AppState.showComputersForViewer = false;
        // Supervision remains active for the zone
    } else if (AppState.currentView === 'rooms') {
        AppState.currentView = 'zones';
        AppState.currentZoneIndex = -1;
        AppState.supervisionActive = false;
        AppState.currentSupervisor = null;
    }
    renderCurrentView();
}

// ======================== STUB FUNCTIONS ========================
function openAddModal(type) {}
function closeAddModal() { addModal.classList.add('hidden'); }
function handleAddConfirm() {}
