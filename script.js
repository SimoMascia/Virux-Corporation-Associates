// ==================== CONFIGURATION ====================
const JSONBIN_BIN_ID = "69df665d36566621a8b694e5";          // Replace with your bin ID
const JSONBIN_API_KEY = "$2a$10$RvtAYcVttTgFZj1lk9gy7uG4jjzKPztlQOwZ10zcS1eKOb0fACdO2"; // Replace with your API key

const BASE_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

// Global state
let appData = { zones: [] };
let inspectionLogs = []; // each log: { timestamp, zone, room, computer, port, status, notes, inspector }

// Helper: fetch data from JSONbin
async function fetchData() {
    try {
        const res = await fetch(BASE_URL, {
            headers: { "X-Master-Key": JSONBIN_API_KEY }
        });
        const json = await res.json();
        appData = json.record || { zones: [] };
        if (!appData.zones) appData.zones = [];
        // Ensure each zone has rooms array etc.
        renderAll();
    } catch (err) {
        console.error("Fetch error:", err);
        alert("Failed to sync with JSONbin. Check API key/bin ID.");
    }
}

// Helper: save data to JSONbin
async function saveData() {
    try {
        await fetch(BASE_URL, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-Master-Key": JSONBIN_API_KEY
            },
            body: JSON.stringify(appData)
        });
        console.log("Data saved to JSONbin");
    } catch (err) {
        console.error("Save error:", err);
        alert("Failed to save to JSONbin.");
    }
}

// ==================== RENDER FUNCTIONS ====================
function renderAll() {
    renderZoneSelect();
    renderAdminPanel("zones");
    renderLogs();
    // If inspector view has selections, re-render ports
    const selectedZoneId = document.getElementById("zoneSelect")?.value;
    const selectedRoomId = document.getElementById("roomSelect")?.value;
    const selectedCompId = document.getElementById("computerSelect")?.value;
    if (selectedZoneId && selectedRoomId && selectedCompId) {
        renderPorts(selectedZoneId, selectedRoomId, selectedCompId);
    }
}

function renderZoneSelect() {
    const zoneSelect = document.getElementById("zoneSelect");
    if (!zoneSelect) return;
    zoneSelect.innerHTML = '<option value="">-- Select Zone --</option>';
    appData.zones.forEach(zone => {
        const opt = document.createElement("option");
        opt.value = zone.id;
        opt.textContent = `${zone.name} (${zone.id})`;
        zoneSelect.appendChild(opt);
    });
    zoneSelect.onchange = () => {
        const zoneId = zoneSelect.value;
        const roomSelect = document.getElementById("roomSelect");
        if (!zoneId) {
            roomSelect.disabled = true;
            roomSelect.innerHTML = '<option>-- First select zone --</option>';
            document.getElementById("computerSelect").disabled = true;
            return;
        }
        const zone = appData.zones.find(z => z.id === zoneId);
        if (zone) {
            roomSelect.disabled = false;
            roomSelect.innerHTML = '<option value="">-- Select Room --</option>';
            zone.rooms.forEach(room => {
                const opt = document.createElement("option");
                opt.value = room.id;
                opt.textContent = room.name;
                roomSelect.appendChild(opt);
            });
        }
    };
    const roomSelect = document.getElementById("roomSelect");
    roomSelect.onchange = () => {
        const zoneId = zoneSelect.value;
        const roomId = roomSelect.value;
        const computerSelect = document.getElementById("computerSelect");
        if (!zoneId || !roomId) {
            computerSelect.disabled = true;
            return;
        }
        const zone = appData.zones.find(z => z.id === zoneId);
        const room = zone?.rooms.find(r => r.id === roomId);
        if (room) {
            computerSelect.disabled = false;
            computerSelect.innerHTML = '<option value="">-- Select Computer --</option>';
            room.computers.forEach(comp => {
                const opt = document.createElement("option");
                opt.value = comp.id;
                opt.textContent = comp.name;
                computerSelect.appendChild(opt);
            });
        }
    };
    computerSelect.onchange = () => {
        const zoneId = zoneSelect.value;
        const roomId = roomSelect.value;
        const compId = computerSelect.value;
        if (zoneId && roomId && compId) {
            renderPorts(zoneId, roomId, compId);
            // Check MCZ/HCZ warning (clause 10.A)
            const zone = appData.zones.find(z => z.id === zoneId);
            if (zone && (zone.name.includes("MCZ") || zone.name.includes("HCZ"))) {
                document.getElementById("hczWarning").style.display = "block";
                // optional: count inspections per session (simplified reminder)
            } else {
                document.getElementById("hczWarning").style.display = "none";
            }
        }
    };
}

function renderPorts(zoneId, roomId, computerId) {
    const zone = appData.zones.find(z => z.id === zoneId);
    const room = zone?.rooms.find(r => r.id === roomId);
    const computer = room?.computers.find(c => c.id === computerId);
    const container = document.getElementById("portsContainer");
    if (!computer || !computer.ports.length) {
        container.innerHTML = '<p class="placeholder">No ports defined for this terminal. Use Admin view to add ports.</p>';
        return;
    }
    const inspector = document.getElementById("inspectorName").value || "Unknown";
    container.innerHTML = computer.ports.map(port => `
        <div class="port-item" data-port-id="${port.id}">
            <div class="port-header">
                <span class="port-name">🔌 ${port.name}</span>
                <span class="status-badge status-${port.status || 'pending'}">${(port.status || 'PENDING').toUpperCase()}</span>
            </div>
            <div class="port-details">
                <div>Last check: ${port.lastCheck ? new Date(port.lastCheck).toLocaleString() : 'Never'}</div>
                <div>Inspector: ${port.inspector || '-'}</div>
                <div>Notes: ${port.notes || '-'}</div>
            </div>
            <div class="port-actions">
                <select id="statusSelect-${port.id}" class="status-select">
                    <option value="pending" ${port.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="clean" ${port.status === 'clean' ? 'selected' : ''}>Clean</option>
                    <option value="anomalous" ${port.status === 'anomalous' ? 'selected' : ''}>Anomalous</option>
                </select>
                <input type="text" id="notesInput-${port.id}" placeholder="Add notes" value="${port.notes || ''}">
                <button class="btn-small update-port" data-zone="${zoneId}" data-room="${roomId}" data-computer="${computerId}" data-port="${port.id}">✓ Update Checkup</button>
            </div>
        </div>
    `).join('');
    
    // Attach event listeners to update buttons
    document.querySelectorAll('.update-port').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const zoneId = btn.dataset.zone;
            const roomId = btn.dataset.room;
            const computerId = btn.dataset.computer;
            const portId = btn.dataset.port;
            const portElem = document.querySelector(`.port-item[data-port-id="${portId}"]`);
            const newStatus = portElem.querySelector('.status-select').value;
            const newNotes = portElem.querySelector('input[type="text"]').value;
            
            const zone = appData.zones.find(z => z.id === zoneId);
            const room = zone.rooms.find(r => r.id === roomId);
            const computer = room.computers.find(c => c.id === computerId);
            const port = computer.ports.find(p => p.id === portId);
            port.status = newStatus;
            port.notes = newNotes;
            port.lastCheck = new Date().toISOString();
            port.inspector = document.getElementById("inspectorName").value || "Unknown";
            
            // Log inspection
            inspectionLogs.unshift({
                timestamp: new Date().toISOString(),
                zone: zone.name,
                room: room.name,
                computer: computer.name,
                port: port.name,
                status: newStatus,
                notes: newNotes,
                inspector: port.inspector
            });
            // Keep logs limited
            if (inspectionLogs.length > 200) inspectionLogs.pop();
            
            await saveData();
            renderPorts(zoneId, roomId, computerId);
            renderLogs();
        });
    });
}

// Admin panel rendering (CRUD)
let currentAdminLevel = "zones";
function renderAdminPanel(level) {
    currentAdminLevel = level;
    const panel = document.getElementById("adminPanel");
    if (!panel) return;
    if (level === "zones") {
        panel.innerHTML = `
            <h3>Manage Zones</h3>
            <div class="form-group"><input type="text" id="newZoneName" placeholder="Zone name (e.g., LCZ)"><input type="text" id="newZoneId" placeholder="Unique ID (e.g., lcz_01)"></div>
            <button id="addZoneBtn">+ Add Zone</button>
            <ul>${appData.zones.map(z => `<li>${z.name} (${z.id}) <button class="delete-zone" data-id="${z.id}">❌</button></li>`).join('')}</ul>
        `;
        document.getElementById("addZoneBtn")?.addEventListener("click", async () => {
            const name = document.getElementById("newZoneName").value;
            const id = document.getElementById("newZoneId").value;
            if (!name || !id) return alert("Name and ID required");
            appData.zones.push({ id, name, rooms: [] });
            await saveData();
            renderAdminPanel(currentAdminLevel);
            renderZoneSelect();
        });
        document.querySelectorAll(".delete-zone").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const id = btn.dataset.id;
                appData.zones = appData.zones.filter(z => z.id !== id);
                await saveData();
                renderAdminPanel(currentAdminLevel);
                renderZoneSelect();
            });
        });
    } 
    else if (level === "rooms") {
        const zoneSelectHtml = `<select id="roomZoneSelect">${appData.zones.map(z => `<option value="${z.id}">${z.name}</option>`).join('')}</select>`;
        panel.innerHTML = `
            <h3>Manage Rooms</h3>
            <div>Zone: ${zoneSelectHtml}</div>
            <div class="form-group"><input type="text" id="newRoomName" placeholder="Room name"><input type="text" id="newRoomId" placeholder="Room ID"></div>
            <button id="addRoomBtn">+ Add Room</button>
            <div id="roomsList"></div>
        `;
        function refreshRoomsList() {
            const zoneId = document.getElementById("roomZoneSelect").value;
            const zone = appData.zones.find(z => z.id === zoneId);
            const listDiv = document.getElementById("roomsList");
            if (zone) {
                listDiv.innerHTML = `<ul>${zone.rooms.map(r => `<li>${r.name} (${r.id}) <button class="delete-room" data-roomid="${r.id}">❌</button></li>`).join('')}</ul>`;
                document.querySelectorAll(".delete-room").forEach(btn => {
                    btn.addEventListener("click", async (e) => {
                        const roomId = btn.dataset.roomid;
                        zone.rooms = zone.rooms.filter(r => r.id !== roomId);
                        await saveData();
                        refreshRoomsList();
                        renderZoneSelect();
                    });
                });
            }
        }
        document.getElementById("addRoomBtn")?.addEventListener("click", async () => {
            const zoneId = document.getElementById("roomZoneSelect").value;
            const name = document.getElementById("newRoomName").value;
            const id = document.getElementById("newRoomId").value;
            if (!zoneId || !name || !id) return alert("Fill all fields");
            const zone = appData.zones.find(z => z.id === zoneId);
            if (zone) {
                zone.rooms.push({ id, name, computers: [] });
                await saveData();
                refreshRoomsList();
                renderZoneSelect();
            }
        });
        document.getElementById("roomZoneSelect")?.addEventListener("change", refreshRoomsList);
        refreshRoomsList();
    }
    else if (level === "computers") {
        panel.innerHTML = `<h3>Manage Computers</h3><div class="form-group"><select id="compZoneSelect"></select><select id="compRoomSelect"></select></div>
        <div><input id="compName" placeholder="Computer name"><input id="compId" placeholder="Computer ID"></div>
        <button id="addCompBtn">+ Add Computer</button><div id="compList"></div>`;
        function populateZonesAndRooms() {
            const zoneSelect = document.getElementById("compZoneSelect");
            zoneSelect.innerHTML = appData.zones.map(z => `<option value="${z.id}">${z.name}</option>`).join('');
            zoneSelect.onchange = () => updateRooms();
            function updateRooms() {
                const zoneId = zoneSelect.value;
                const zone = appData.zones.find(z => z.id === zoneId);
                const roomSelect = document.getElementById("compRoomSelect");
                if (zone) roomSelect.innerHTML = zone.rooms.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
            }
            updateRooms();
        }
        populateZonesAndRooms();
        document.getElementById("addCompBtn")?.addEventListener("click", async () => {
            const zoneId = document.getElementById("compZoneSelect").value;
            const roomId = document.getElementById("compRoomSelect").value;
            const name = document.getElementById("compName").value;
            const id = document.getElementById("compId").value;
            if (!zoneId || !roomId || !name || !id) return alert("All fields required");
            const zone = appData.zones.find(z => z.id === zoneId);
            const room = zone?.rooms.find(r => r.id === roomId);
            if (room) {
                room.computers.push({ id, name, ports: [] });
                await saveData();
                renderAdminPanel(currentAdminLevel);
                renderZoneSelect();
            }
        });
        function refreshCompList() {
            const zoneId = document.getElementById("compZoneSelect").value;
            const roomId = document.getElementById("compRoomSelect").value;
            const zone = appData.zones.find(z => z.id === zoneId);
            const room = zone?.rooms.find(r => r.id === roomId);
            const listDiv = document.getElementById("compList");
            if (room) {
                listDiv.innerHTML = `<ul>${room.computers.map(c => `<li>${c.name} (${c.id}) <button class="delete-comp" data-compid="${c.id}">❌</button></li>`).join('')}</ul>`;
                document.querySelectorAll(".delete-comp").forEach(btn => {
                    btn.addEventListener("click", async (e) => {
                        const compId = btn.dataset.compid;
                        room.computers = room.computers.filter(c => c.id !== compId);
                        await saveData();
                        refreshCompList();
                        renderZoneSelect();
                    });
                });
            }
        }
        document.getElementById("compZoneSelect")?.addEventListener("change", refreshCompList);
        document.getElementById("compRoomSelect")?.addEventListener("change", refreshCompList);
        refreshCompList();
    }
    else if (level === "ports") {
        panel.innerHTML = `<h3>Manage Ports</h3>
        <div><select id="portZoneSelect"></select><select id="portRoomSelect"></select><select id="portCompSelect"></select></div>
        <div><input id="portName" placeholder="Port name (e.g., USB1)"><input id="portId" placeholder="Port ID"></div>
        <button id="addPortBtn">+ Add Port</button><div id="portList"></div>`;
        function populate() {
            const zoneSelect = document.getElementById("portZoneSelect");
            zoneSelect.innerHTML = appData.zones.map(z => `<option value="${z.id}">${z.name}</option>`).join('');
            zoneSelect.onchange = () => updateRooms();
            function updateRooms() {
                const zoneId = zoneSelect.value;
                const zone = appData.zones.find(z => z.id === zoneId);
                const roomSelect = document.getElementById("portRoomSelect");
                roomSelect.innerHTML = zone ? zone.rooms.map(r => `<option value="${r.id}">${r.name}</option>`).join('') : '';
                roomSelect.onchange = () => updateComputers();
            }
            function updateComputers() {
                const zoneId = zoneSelect.value;
                const roomId = document.getElementById("portRoomSelect").value;
                const zone = appData.zones.find(z => z.id === zoneId);
                const room = zone?.rooms.find(r => r.id === roomId);
                const compSelect = document.getElementById("portCompSelect");
                compSelect.innerHTML = room ? room.computers.map(c => `<option value="${c.id}">${c.name}</option>`).join('') : '';
            }
            updateRooms();
        }
        populate();
        document.getElementById("addPortBtn")?.addEventListener("click", async () => {
            const zoneId = document.getElementById("portZoneSelect").value;
            const roomId = document.getElementById("portRoomSelect").value;
            const compId = document.getElementById("portCompSelect").value;
            const name = document.getElementById("portName").value;
            const id = document.getElementById("portId").value;
            if (!zoneId || !roomId || !compId || !name || !id) return alert("All fields required");
            const zone = appData.zones.find(z => z.id === zoneId);
            const room = zone?.rooms.find(r => r.id === roomId);
            const computer = room?.computers.find(c => c.id === compId);
            if (computer) {
                computer.ports.push({ id, name, status: "pending", notes: "", lastCheck: null, inspector: "" });
                await saveData();
                renderAdminPanel(currentAdminLevel);
                renderZoneSelect();
            }
        });
        function refreshPortList() {
            const zoneId = document.getElementById("portZoneSelect").value;
            const roomId = document.getElementById("portRoomSelect").value;
            const compId = document.getElementById("portCompSelect").value;
            const zone = appData.zones.find(z => z.id === zoneId);
            const room = zone?.rooms.find(r => r.id === roomId);
            const computer = room?.computers.find(c => c.id === compId);
            const listDiv = document.getElementById("portList");
            if (computer) {
                listDiv.innerHTML = `<ul>${computer.ports.map(p => `<li>${p.name} (${p.id}) <button class="delete-port" data-portid="${p.id}">❌</button></li>`).join('')}</ul>`;
                document.querySelectorAll(".delete-port").forEach(btn => {
                    btn.addEventListener("click", async (e) => {
                        const portId = btn.dataset.portid;
                        computer.ports = computer.ports.filter(p => p.id !== portId);
                        await saveData();
                        refreshPortList();
                        renderZoneSelect();
                    });
                });
            }
        }
        document.getElementById("portZoneSelect")?.addEventListener("change", refreshPortList);
        document.getElementById("portRoomSelect")?.addEventListener("change", refreshPortList);
        document.getElementById("portCompSelect")?.addEventListener("change", refreshPortList);
        refreshPortList();
    }
}

function renderLogs() {
    const container = document.getElementById("logsList");
    if (!container) return;
    if (inspectionLogs.length === 0) {
        container.innerHTML = "<p>No inspections performed yet.</p>";
        return;
    }
    container.innerHTML = inspectionLogs.map(log => `
        <div class="log-entry" style="border-left-color: ${log.status === 'anomalous' ? '#9e3b3b' : '#2a6b4e'}">
            <strong>${new Date(log.timestamp).toLocaleString()}</strong> | ${log.inspector}<br>
            📍 ${log.zone} / ${log.room} / ${log.computer}<br>
            🔌 ${log.port} → <strong>${log.status.toUpperCase()}</strong><br>
            📝 ${log.notes || 'No notes'}
        </div>
    `).join('');
}

// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`${view}View`).classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(navBtn => navBtn.classList.remove('active'));
        btn.classList.add('active');
        if (view === 'admin') renderAdminPanel(currentAdminLevel);
        if (view === 'logs') renderLogs();
    });
});

document.getElementById("syncDataBtn")?.addEventListener("click", fetchData);
document.getElementById("exportDataBtn")?.addEventListener("click", () => {
    const dataStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([dataStr], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vca_data_${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
});
document.getElementById("exportLogsBtn")?.addEventListener("click", () => {
    let csv = "Timestamp,Zone,Room,Computer,Port,Status,Inspector,Notes\n";
    inspectionLogs.forEach(log => {
        csv += `"${log.timestamp}","${log.zone}","${log.room}","${log.computer}","${log.port}","${log.status}","${log.inspector}","${log.notes.replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob([csv], {type: "text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vca_inspections_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
});

// Initialize
fetchData();
