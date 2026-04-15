// ======================== CONFIGURATION ========================
const BIN_ID = "69de75ce856a6821893343d9";               // Your Bin ID
const MASTER_KEY = "$2b$10$LA_TUA_MASTER_KEY";          // Your public Master Key
const READ_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}/latest`;
// ===============================================================

// Access password (single viewer level)
const VIEWER_PASSWORD = "VC&A-VIEWER";

// Inspection limits per zone type
const HCZ_MCZ_ZONES = ["HCZ", "MCZ", "Heavy Containment", "Medium Containment"]; // Names containing these keywords
const MAX_INSPECTIONS_PER_ZONE = 2;

const AppState = {
    zones: [],
    isLoggedIn: false,
    currentView: 'zones',
    currentZoneIndex: -1,
    currentRoomIndex: -1,
    showComputersForViewer: false,
    // Contract compliance
    inspectionCounts: {},        // { zoneName: count }
    inspectionLog: [],           // Array of log entries
    supervisionGranted: false,   // Simulated supervision request
    currentAccessRequest: null   // For HCZ/MCZ limit
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
const loginBtn = document.getElementById('login-btn'); // Will be repurposed
const logoutAdminBtn = document.getElementById('logout-admin');
const adminPanel = document.getElementById('admin-panel');
const adminActions = document.getElementById('admin-actions');
const statusMsg = document.getElementById('status-message');
const loginModal = document.getElementById('login-modal');
const addModal = document.getElementById('add-modal'); // Will be repurposed for supervision
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
    
    // Hide admin panel permanently (contract compliant)
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
        const inspectionCount = AppState.inspectionCounts[zone.name] || 0;
        const isHCZMCZ = HCZ_MCZ_ZONES.some(kw => zone.name.toLowerCase().includes(kw.toLowerCase()));
        const limitReached = isHCZMCZ && inspectionCount >= MAX_INSPECTIONS_PER_ZONE;
        
        html += `
            <div class="zone-card ${anomalyClass}" data-zone-index="${index}" style="position:relative;">
                <h3>${zone.name}</h3>
                <div class="zone-stats">
                    🚪 ${totalDoors} &nbsp;|&nbsp; 💻 ${totalComputers} &nbsp;|&nbsp; 📁 ${totalRooms} rooms
                    ${hasAnomaly ? '<br><span style="color:#e74c3c;">⚠️ ANOMALY DETECTED</span>' : ''}
                    ${isHCZMCZ ? `<br><span style="color:#f1c40f;">🔒 HCZ/MCZ: ${inspectionCount}/${MAX_INSPECTIONS_PER_ZONE} inspections used</span>` : ''}
                </div>
                ${limitReached ? '<div style="position:absolute; top:5px; right:5px; color:#e74c3c;">⛔ LIMIT REACHED</div>' : ''}
            </div>
        `;
    });
    html += '</div>';
    contentArea.innerHTML = html;
    
    document.querySelectorAll('.zone-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const idx = card.dataset.zoneIndex;
            if (idx !== undefined) {
                const zone = AppState.zones[idx];
                const isHCZMCZ = HCZ_MCZ_ZONES.some(kw => zone.name.toLowerCase().includes(kw.toLowerCase()));
                const count = AppState.inspectionCounts[zone.name] || 0;
                if (isHCZMCZ && count >= MAX_INSPECTIONS_PER_ZONE) {
                    alert(`Inspection limit reached for ${zone.name}. Request new access via radio.`);
                    return;
                }
                openZone(parseInt(idx));
            }
        });
    });
}

function renderRoomsView() {
    const zone = AppState.zones[AppState.currentZoneIndex];
    let html = `<div style="margin-bottom:15px;"><h2 style="color:#d4ede8;">Rooms in ${zone.name}</h2></div>`;
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
                // Request supervision before allowing inspection
                if (!AppState.supervisionGranted) {
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
    
    let html = '';
    
    // Toggle button for viewers
    html += `
        <div style="margin-bottom:20px; display: flex; gap: 10px;">
            <button id="toggle-viewer-view" class="btn">
                ${AppState.showComputersForViewer ? '🚪 SHOW DOORS' : '💻 SHOW COMPUTERS'}
            </button>
            <button id="log-inspection-btn" class="btn" style="background: #1D7483;">📋 LOG THIS INSPECTION</button>
        </div>
    `;
    
    if (AppState.showComputersForViewer) {
        html += `<ul class="items-list">`;
        room.computers.forEach((comp) => {
            html += `
                <li class="item-row computer ${comp.anomalous ? 'anomalous' : ''}">
                    <span class="item-icon">💻</span>
                    <div class="item-info">
                        <div class="item-id">${comp.id}</div>
                        <div class="item-status ${comp.anomalous ? 'status-anomalous' : 'status-clean'}">
                            ${comp.anomalous ? 'ANOMALOUS' : 'CLEAN'}
                        </div>
                    </div>
                </li>
            `;
        });
        html += '</ul>';
    } else {
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
}

// ======================== SUPERVISION MODAL (replaces admin login) ========================
function openSupervisionModal() {
    loginModal.classList.remove('hidden');
    document.querySelector('#login-modal h2').textContent = 'REQUEST SUPERVISION';
    document.querySelector('#login-modal p').textContent = 'Foundation personnel must be present during inspection. Simulate radio request.';
    passwordInput.value = '';
    loginError.textContent = '';
    passwordInput.focus();
}

function closeSupervisionModal() {
    loginModal.classList.add('hidden');
}

function handleSupervisionRequest() {
    // Simulate supervision granted (in RP, this would be a radio call)
    const supervisorName = passwordInput.value.trim() || "Unknown Supervisor";
    AppState.supervisionGranted = true;
    closeSupervisionModal();
    
    // Increment inspection count for HCZ/MCZ zones
    const zone = AppState.zones[AppState.currentZoneIndex];
    if (zone && HCZ_MCZ_ZONES.some(kw => zone.name.toLowerCase().includes(kw.toLowerCase()))) {
        AppState.inspectionCounts[zone.name] = (AppState.inspectionCounts[zone.name] || 0) + 1;
    }
    
    // Add log entry
    const logEntry = {
        timestamp: new Date().toISOString(),
        zone: zone ? zone.name : 'Unknown',
        supervisor: supervisorName,
        inspector: 'VC&A Agent',
        type: 'Supervision granted'
    };
    AppState.inspectionLog.push(logEntry);
    
    statusMsg.innerHTML = `● SUPERVISION GRANTED BY ${supervisorName.toUpperCase()}`;
    
    // If a room was pending, open it
    if (AppState.currentView === 'rooms' && AppState.currentRoomIndex === -1) {
        // User clicked a room, now supervision granted, we can open it
        // The click handler will call openRoom again; we just need to re-trigger
    }
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
        inspector: 'VC&A Agent'
    };
    AppState.inspectionLog.push(logEntry);
    
    // Generate downloadable log file
    const logText = JSON.stringify(AppState.inspectionLog, null, 2);
    const blob = new Blob([logText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inspection_log_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    statusMsg.innerHTML = '● INSPECTION LOGGED AND DOWNLOADED';
    setTimeout(() => statusMsg.innerHTML = '● CONNECTED', 2000);
}

// ======================== NAVIGATION ========================
function openZone(index) {
    AppState.currentZoneIndex = index;
    AppState.currentRoomIndex = -1;
    AppState.currentView = 'rooms';
    AppState.supervisionGranted = false; // Reset supervision for new zone
    renderCurrentView();
}

function openRoom(index) {
    if (!AppState.supervisionGranted) {
        openSupervisionModal();
        return;
    }
    AppState.currentRoomIndex = index;
    AppState.currentView = 'doors';
    AppState.showComputersForViewer = false;
    renderCurrentView();
}

function handleBack() {
    if (AppState.currentView === 'doors' || AppState.currentView === 'computers') {
        AppState.currentView = 'rooms';
        AppState.currentRoomIndex = -1;
        AppState.showComputersForViewer = false;
        AppState.supervisionGranted = false; // Reset supervision when leaving room
    } else if (AppState.currentView === 'rooms') {
        AppState.currentView = 'zones';
        AppState.currentZoneIndex = -1;
    }
    renderCurrentView();
}

// ======================== STUB FUNCTIONS (admin removed) ========================
function openAddModal(type) {} // Not used
function closeAddModal() { addModal.classList.add('hidden'); }
function handleAddConfirm() {} // Not used
function attachDoorEvents() {} // Not used
function attachComputerEvents() {} // Not used
