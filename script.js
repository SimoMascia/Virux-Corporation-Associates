// ======================== CONFIGURATION ========================
const BIN_ID = "69de7e0daaba882197fba9e4";               // Your Bin ID
const MASTER_KEY = "$2a$10$/R1.Rr0GXwjCPn3Ezv0eMOQ4oEOWoPU0sa.k7F8tztcQp9U9tbhgS";          // Your public Master Key
const SECRET_KEY = "$2a$10$LaJi7JsnCwrNqg7YOfeW0eVbgLPgrhCLZsIir84Irs5LoLAvYbGUi";   // Your Secret Key (write access)
const READ_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}/latest`;
const UPDATE_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
// ===============================================================

// Data structure:
// zones: [
//   {
//     name: "Zone A",
//     rooms: [
//       {
//         name: "Room 1",
//         doors: [{ id: "D1", locked: false }],
//         computers: [{ id: "PC1", anomalous: false }]
//       }
//     ]
//   }
// ]

const AppState = {
    zones: [],
    isAdmin: false,
    currentView: 'zones',      // 'zones', 'rooms', 'doors', 'computers'
    currentZoneIndex: -1,
    currentRoomIndex: -1,
    navigationStack: []
};

// DOM Elements
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

document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);
    loadDataFromAPI();
    setupEventListeners();
});

function updateClock() {
    const now = new Date();
    document.getElementById('system-time').textContent = now.toLocaleTimeString('en-GB');
}

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

// ======================== API ========================
async function loadDataFromAPI() {
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

async function saveDataToAPI() {
    if (!AppState.isAdmin) { alert("Insufficient permissions."); return; }
    try {
        statusMsg.innerHTML = '● SAVING...';
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
        if (!response.ok) throw new Error('Save failed');
        statusMsg.innerHTML = '● DATA SAVED';
        await loadDataFromAPI();
    } catch (error) {
        console.error(error);
        statusMsg.innerHTML = '● SAVE ERROR';
        alert('Unable to save data. Check console.');
    }
}

// ======================== RENDERING ========================
function renderCurrentView() {
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
        breadcrumbSpan.textContent = `${zone.name} / ${room.name} · DOORS`;
        backBtn.disabled = false;
    } else if (AppState.currentView === 'computers' && AppState.currentZoneIndex !== -1 && AppState.currentRoomIndex !== -1) {
        renderComputersView();
        const zone = AppState.zones[AppState.currentZoneIndex];
        const room = zone.rooms[AppState.currentRoomIndex];
        breadcrumbSpan.textContent = `${zone.name} / ${room.name} · COMPUTERS`;
        backBtn.disabled = false;
    }
    updateAdminPanel();
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
        html += `
            <div class="zone-card ${anomalyClass}" data-zone-index="${index}">
                <h3>${zone.name}</h3>
                <div class="zone-stats">
                    🚪 ${totalDoors} &nbsp;|&nbsp; 💻 ${totalComputers} &nbsp;|&nbsp; 📁 ${totalRooms} rooms
                    ${hasAnomaly ? '<br><span style="color:#e74c3c;">⚠️ ANOMALY DETECTED</span>' : ''}
                </div>
            </div>
        `;
    });
    html += '</div>';
    if (AppState.isAdmin) {
        html += `<div style="margin-top:20px; text-align:center;"><button id="add-zone-btn" class="btn">➕ ADD ZONE</button></div>`;
    }
    contentArea.innerHTML = html;
    
    document.querySelectorAll('.zone-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const idx = card.dataset.zoneIndex;
            if (idx !== undefined) openZone(parseInt(idx));
        });
    });
    if (AppState.isAdmin) {
        document.getElementById('add-zone-btn')?.addEventListener('click', () => openAddModal('zone'));
    }
}

function renderRoomsView() {
    const zone = AppState.zones[AppState.currentZoneIndex];
    let html = `<div style="margin-bottom:15px;"><h2 style="color:#d4ede8;">Rooms in ${zone.name}</h2></div>`;
    html += '<div class="zone-grid">';
    zone.rooms.forEach((room, idx) => {
        const hasAnomaly = room.computers.some(c => c.anomalous);
        html += `
            <div class="zone-card ${hasAnomaly ? 'anomaly-warning' : ''}" data-room-index="${idx}">
                <h3>${room.name}</h3>
                <div class="zone-stats">
                    🚪 ${room.doors.length} doors &nbsp;|&nbsp; 💻 ${room.computers.length} computers
                </div>
            </div>
        `;
    });
    html += '</div>';
    if (AppState.isAdmin) {
        html += `<div style="margin-top:20px; text-align:center;"><button id="add-room-btn" class="btn">➕ ADD ROOM</button></div>`;
    }
    contentArea.innerHTML = html;
    
    document.querySelectorAll('.zone-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const idx = card.dataset.roomIndex;
            if (idx !== undefined) openRoom(parseInt(idx));
        });
    });
    if (AppState.isAdmin) {
        document.getElementById('add-room-btn')?.addEventListener('click', () => openAddModal('room'));
    }
}

function renderDoorsView() {
    const zone = AppState.zones[AppState.currentZoneIndex];
    const room = zone.rooms[AppState.currentRoomIndex];
    let html = `<ul class="items-list">`;
    room.doors.forEach((door, idx) => {
        html += `
            <li class="item-row door">
                <span class="item-icon">🚪</span>
                <div class="item-info">
                    <div class="item-id">${door.id}</div>
                    <div class="item-status ${door.locked ? 'status-locked' : 'status-unlocked'}">
                        ${door.locked ? 'LOCKED' : 'UNLOCKED'}
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
        html += `<div style="margin-top:20px;"><button id="add-door-btn" class="btn">➕ ADD DOOR</button></div>`;
    }
    contentArea.innerHTML = html;
    attachDoorEvents();
}

function renderComputersView() {
    const zone = AppState.zones[AppState.currentZoneIndex];
    const room = zone.rooms[AppState.currentRoomIndex];
    let html = `<ul class="items-list">`;
    room.computers.forEach((comp, idx) => {
        html += `
            <li class="item-row computer ${comp.anomalous ? 'anomalous' : ''}">
                <span class="item-icon">💻</span>
                <div class="item-info">
                    <div class="item-id">${comp.id}</div>
                    <div class="item-status ${comp.anomalous ? 'status-anomalous' : 'status-clean'}">
                        ${comp.anomalous ? 'ANOMALOUS' : 'CLEAN'}
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
        html += `<div style="margin-top:20px;"><button id="add-computer-btn" class="btn">➕ ADD COMPUTER</button></div>`;
    }
    contentArea.innerHTML = html;
    attachComputerEvents();
}

// ======================== NAVIGATION ========================
function openZone(index) {
    AppState.currentZoneIndex = index;
    AppState.currentRoomIndex = -1;
    AppState.currentView = 'rooms';
    renderCurrentView();
}

function openRoom(index) {
    AppState.currentRoomIndex = index;
    AppState.currentView = 'doors'; // default shows doors
    renderCurrentView();
}

function switchRoomView(view) {
    if (AppState.currentRoomIndex !== -1) {
        AppState.currentView = view;
        renderCurrentView();
    }
}

function handleBack() {
    if (AppState.currentView === 'doors' || AppState.currentView === 'computers') {
        // Back to room list of current zone
        AppState.currentView = 'rooms';
        AppState.currentRoomIndex = -1;
    } else if (AppState.currentView === 'rooms') {
        // Back to zone list
        AppState.currentView = 'zones';
        AppState.currentZoneIndex = -1;
    }
    renderCurrentView();
}

// ======================== ADMIN EVENTS ========================
function attachDoorEvents() {
    if (!AppState.isAdmin) return;
    const room = AppState.zones[AppState.currentZoneIndex].rooms[AppState.currentRoomIndex];
    document.querySelectorAll('.toggle-lock').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = btn.dataset.idx;
            room.doors[idx].locked = !room.doors[idx].locked;
            saveDataToAPI();
            renderCurrentView();
        });
    });
    document.querySelectorAll('.delete-door').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm('Delete this door?')) return;
            const idx = btn.dataset.idx;
            room.doors.splice(idx, 1);
            saveDataToAPI();
            renderCurrentView();
        });
    });
    document.getElementById('add-door-btn')?.addEventListener('click', () => openAddModal('door'));
}

function attachComputerEvents() {
    if (!AppState.isAdmin) return;
    const room = AppState.zones[AppState.currentZoneIndex].rooms[AppState.currentRoomIndex];
    document.querySelectorAll('.toggle-anomaly').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = btn.dataset.idx;
            room.computers[idx].anomalous = !room.computers[idx].anomalous;
            saveDataToAPI();
            renderCurrentView();
        });
    });
    document.querySelectorAll('.delete-comp').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm('Delete this computer?')) return;
            const idx = btn.dataset.idx;
            room.computers.splice(idx, 1);
            saveDataToAPI();
            renderCurrentView();
        });
    });
    document.getElementById('add-computer-btn')?.addEventListener('click', () => openAddModal('computer'));
}

// ======================== LOGIN / LOGOUT ========================
function openLoginModal() {
    loginModal.classList.remove('hidden');
    passwordInput.value = '';
    loginError.textContent = '';
    passwordInput.focus();
}
function closeLoginModal() { loginModal.classList.add('hidden'); }
function handleLogin() {
    if (passwordInput.value.trim() === 'VC&A-ANTIVIRUS-416') {
        AppState.isAdmin = true;
        closeLoginModal();
        updateAdminPanel();
        renderCurrentView();
        statusMsg.innerHTML = '● ADMINISTRATOR MODE ACTIVE';
    } else {
        loginError.textContent = 'ACCESS DENIED: INVALID CREDENTIALS';
    }
}
function logoutAdmin() {
    AppState.isAdmin = false;
    updateAdminPanel();
    renderCurrentView();
    statusMsg.innerHTML = '● CONNECTED';
}

// ======================== ADMIN PANEL ========================
function updateAdminPanel() {
    if (!AppState.isAdmin) {
        adminPanel.classList.add('hidden');
        return;
    }
    adminPanel.classList.remove('hidden');
    let actionsHtml = '';
    
    if (AppState.currentView === 'zones') {
        actionsHtml = `<button id="admin-add-zone" class="btn">➕ NEW ZONE</button>`;
    } else if (AppState.currentView === 'rooms') {
        actionsHtml = `
            <button id="admin-add-room" class="btn">➕ NEW ROOM</button>
            <button id="admin-delete-zone" class="btn btn-danger">🗑️ DELETE ZONE</button>
        `;
    } else if (AppState.currentView === 'doors' || AppState.currentView === 'computers') {
        actionsHtml = `
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <button id="view-doors-btn" class="btn" ${AppState.currentView === 'doors' ? 'style="background:#2a4a4a;"' : ''}>🚪 DOORS</button>
                <button id="view-computers-btn" class="btn" ${AppState.currentView === 'computers' ? 'style="background:#2a4a4a;"' : ''}>💻 COMPUTERS</button>
            </div>
        `;
        if (AppState.currentView === 'doors') {
            actionsHtml += `<button id="admin-add-door" class="btn">➕ NEW DOOR</button>`;
        } else {
            actionsHtml += `<button id="admin-add-computer" class="btn">➕ NEW COMPUTER</button>`;
        }
        actionsHtml += `<button id="admin-delete-room" class="btn btn-danger" style="margin-left:10px;">🗑️ DELETE ROOM</button>`;
    }
    
    adminActions.innerHTML = actionsHtml;
    
    // Attach events
    document.getElementById('admin-add-zone')?.addEventListener('click', ()=>openAddModal('zone'));
    document.getElementById('admin-add-room')?.addEventListener('click', ()=>openAddModal('room'));
    document.getElementById('admin-add-door')?.addEventListener('click', ()=>openAddModal('door'));
    document.getElementById('admin-add-computer')?.addEventListener('click', ()=>openAddModal('computer'));
    document.getElementById('view-doors-btn')?.addEventListener('click', ()=>switchRoomView('doors'));
    document.getElementById('view-computers-btn')?.addEventListener('click', ()=>switchRoomView('computers'));
    
    document.getElementById('admin-delete-zone')?.addEventListener('click', ()=>{
        if (confirm(`Delete zone "${AppState.zones[AppState.currentZoneIndex].name}"?`)) {
            AppState.zones.splice(AppState.currentZoneIndex, 1);
            AppState.currentZoneIndex = -1;
            AppState.currentView = 'zones';
            saveDataToAPI();
            renderCurrentView();
        }
    });
    document.getElementById('admin-delete-room')?.addEventListener('click', ()=>{
        const zone = AppState.zones[AppState.currentZoneIndex];
        const room = zone.rooms[AppState.currentRoomIndex];
        if (confirm(`Delete room "${room.name}"?`)) {
            zone.rooms.splice(AppState.currentRoomIndex, 1);
            AppState.currentRoomIndex = -1;
            AppState.currentView = 'rooms';
            saveDataToAPI();
            renderCurrentView();
        }
    });
}

// ======================== ADD MODAL ========================
let currentAddType = null;

function openAddModal(type) {
    currentAddType = type;
    const title = document.getElementById('modal-title');
    const fieldsDiv = document.getElementById('modal-fields');
    
    if (type === 'zone') {
        title.textContent = 'ADD NEW ZONE';
        fieldsDiv.innerHTML = `<input type="text" id="name-input" class="modal-field" placeholder="Zone Name" autocomplete="off">`;
    } else if (type === 'room') {
        title.textContent = 'ADD NEW ROOM';
        fieldsDiv.innerHTML = `<input type="text" id="name-input" class="modal-field" placeholder="Room Name" autocomplete="off">`;
    } else if (type === 'door') {
        title.textContent = 'ADD NEW DOOR';
        fieldsDiv.innerHTML = `
            <input type="text" id="door-id-input" class="modal-field" placeholder="Door ID" autocomplete="off">
            <label style="display:flex; align-items:center; gap:10px; margin:10px 0;">
                <input type="checkbox" id="door-locked-input"> Locked?
            </label>
        `;
    } else if (type === 'computer') {
        title.textContent = 'ADD NEW COMPUTER';
        fieldsDiv.innerHTML = `
            <input type="text" id="comp-id-input" class="modal-field" placeholder="Computer ID" autocomplete="off">
            <label style="display:flex; align-items:center; gap:10px; margin:10px 0;">
                <input type="checkbox" id="comp-anomalous-input"> Anomalous?
            </label>
        `;
    }
    addModal.classList.remove('hidden');
    setTimeout(() => fieldsDiv.querySelector('input')?.focus(), 100);
}

function closeAddModal() {
    addModal.classList.add('hidden');
    currentAddType = null;
}

function handleAddConfirm() {
    if (!AppState.isAdmin) return;
    
    if (currentAddType === 'zone') {
        const name = document.getElementById('name-input')?.value.trim();
        if (!name) { alert('Name is required'); return; }
        AppState.zones.push({ name, rooms: [] });
        saveDataToAPI();
        closeAddModal();
        renderCurrentView();
    } else if (currentAddType === 'room' && AppState.currentZoneIndex !== -1) {
        const name = document.getElementById('name-input')?.value.trim();
        if (!name) { alert('Name is required'); return; }
        AppState.zones[AppState.currentZoneIndex].rooms.push({ name, doors: [], computers: [] });
        saveDataToAPI();
        closeAddModal();
        renderCurrentView();
    } else if (currentAddType === 'door' && AppState.currentRoomIndex !== -1) {
        const id = document.getElementById('door-id-input')?.value.trim();
        if (!id) { alert('ID is required'); return; }
        const locked = document.getElementById('door-locked-input')?.checked || false;
        const room = AppState.zones[AppState.currentZoneIndex].rooms[AppState.currentRoomIndex];
        room.doors.push({ id, locked });
        saveDataToAPI();
        closeAddModal();
        renderCurrentView();
    } else if (currentAddType === 'computer' && AppState.currentRoomIndex !== -1) {
        const id = document.getElementById('comp-id-input')?.value.trim();
        if (!id) { alert('ID is required'); return; }
        const anomalous = document.getElementById('comp-anomalous-input')?.checked || false;
        const room = AppState.zones[AppState.currentZoneIndex].rooms[AppState.currentRoomIndex];
        room.computers.push({ id, anomalous });
        saveDataToAPI();
        closeAddModal();
        renderCurrentView();
    }
}
