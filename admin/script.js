// PEG Admin Panel Script

// Truncate team name to max length with ellipsis
function truncateName(name, maxLen = 32) {
    if (!name) return '';
    return name.length > maxLen ? name.substring(0, maxLen) + '…' : name;
}

// Global state
let scheduleData = null;
let teamsData = null;
let mappoolData = null;
let currentMatchIndex = 0;
let currentRound = 'ROUND OF 16';

// Storage keys
const PICKS_STORAGE_KEY = 'peg-tournament-picks';

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupEventListeners();
    setupPopupEventListeners();
    loadFromLocalStorage();
});

// Load all data files
async function loadData() {
    try {
        // Try to load from Google Sheets first
        if (window.PEGSheets) {
            console.log('Fetching data from Google Sheets...');
            
            // Fetch schedule data from Sheets
            const scheduleFromSheets = await window.PEGSheets.fetchSchedule();
            if (scheduleFromSheets && scheduleFromSheets.matches && scheduleFromSheets.matches.length > 0) {
                scheduleData = scheduleFromSheets;
                console.log('Schedule data loaded from Sheets:', scheduleData);
            } else {
                // Fallback to local file
                const scheduleResponse = await fetch('../data/schedule.json');
                scheduleData = await scheduleResponse.json();
                console.log('Schedule data loaded from local file:', scheduleData);
            }
            
            // Fetch teams data from Sheets
            const teamsFromSheets = await window.PEGSheets.fetchTeams();
            if (teamsFromSheets && teamsFromSheets.teams && teamsFromSheets.teams.length > 0) {
                teamsData = teamsFromSheets;
                console.log('Teams data loaded from Sheets:', teamsData);
            } else {
                // Fallback to local file
                const teamsResponse = await fetch('../data/teams.json');
                teamsData = await teamsResponse.json();
                console.log('Teams data loaded from local file:', teamsData);
            }
        } else {
            // Fallback to local files if sheets.js not loaded
            console.log('Sheets.js not loaded, using local files...');
            
            // Load schedule data
            const scheduleResponse = await fetch('../data/schedule.json');
            scheduleData = await scheduleResponse.json();
            console.log('Schedule data loaded:', scheduleData);

            // Load teams data
            const teamsResponse = await fetch('../data/teams.json');
            teamsData = await teamsResponse.json();
            console.log('Teams data loaded:', teamsData);
        }

        // Load mappool data
        const mappoolResponse = await fetch('../mappool/mappool_full.json');
        mappoolData = await mappoolResponse.json();
        console.log('Mappool data loaded:', mappoolData);

        // Populate UI
        populateRoundSelect();
        populateMatchSelect();
        populateMappoolGrid();
        updateTeamDisplay();
        updatePicksLog();

    } catch (error) {
        console.error('Error loading data:', error);
        alert('Error loading data. Make sure the data files exist.');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Round select
    document.getElementById('round-select').addEventListener('change', (e) => {
        currentRound = e.target.value;
        updateCurrentMatch();
    });

    // Match select
    document.getElementById('match-select').addEventListener('change', (e) => {
        currentMatchIndex = parseInt(e.target.value);
        updateTeamDisplay();
        updateCurrentMatch();
    });

    // Swap teams button
    document.getElementById('swap-teams-btn').addEventListener('click', swapTeams);

    // Set match button
    document.getElementById('set-match-btn').addEventListener('click', setMatch);

    // Undo button
    document.getElementById('undo-btn').addEventListener('click', undoLastAction);

    // Clear all button
    document.getElementById('clear-all-btn').addEventListener('click', clearAllActions);

}

// Populate round select dropdown
function populateRoundSelect() {
    const roundSelect = document.getElementById('round-select');
    const rounds = ['ROUND OF 16', 'QUARTERFINALS', 'SEMIFINALS', 'FINALS'];

    roundSelect.innerHTML = '';
    rounds.forEach(round => {
        const option = document.createElement('option');
        option.value = round;
        option.textContent = round;
        if (round === currentRound) {
            option.selected = true;
        }
        roundSelect.appendChild(option);
    });
}

// Populate match select dropdown
function populateMatchSelect() {
    const matchSelect = document.getElementById('match-select');
    matchSelect.innerHTML = '';

    if (scheduleData && scheduleData.matches) {
        scheduleData.matches.forEach((match, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `Match ${index + 1}: ${match.team1} vs ${truncateName(match.team2)}`;
            matchSelect.appendChild(option);
        });
    }

    // Set default selection
    matchSelect.value = currentMatchIndex;
}

// Sort mappool maps by mod category and number
function sortMappool(mappool) {
    const modOrder = { 'NM': 0, 'HD': 1, 'HR': 2, 'DT': 3, 'FM': 4, 'TB': 5 };
    
    return [...mappool].sort((a, b) => {
        const aMod = a.pick?.replace(/[0-9]/g, '') || '';
        const bMod = b.pick?.replace(/[0-9]/g, '') || '';
        const aNum = parseInt(a.pick?.replace(/[^0-9]/g, '') || '0');
        const bNum = parseInt(b.pick?.replace(/[^0-9]/g, '') || '0');
        
        const aOrder = modOrder[aMod] ?? 99;
        const bOrder = modOrder[bMod] ?? 99;
        
        if (aOrder !== bOrder) return aOrder - bOrder;
        return aNum - bNum;
    });
}

// Populate mappool grid
function populateMappoolGrid() {
    const grid = document.getElementById('mappool-grid');
    grid.innerHTML = '';

    if (!mappoolData) return;

    // Get all maps except the metadata keys
    const mapKeys = Object.keys(mappoolData).filter(key => key !== 'round');
    
    // Create array of map objects with their keys for sorting
    const mapObjects = mapKeys.map(key => ({
        key: key,
        pick: mappoolData[key].pick,
        artist: mappoolData[key].artist,
        title: mappoolData[key].title
    }));
    
    // Sort maps by mod category and number
    const sortedMaps = sortMappool(mapObjects);
    const sortedKeys = sortedMaps.map(map => map.key);

    sortedKeys.forEach(key => {
        const map = mappoolData[key];
        const card = document.createElement('div');
        card.className = 'map-card';
        card.dataset.mapId = key;
        card.dataset.pick = map.pick;

        card.innerHTML = `
            <div class="map-pick">${map.pick}</div>
            <div class="map-artist">${map.artist}</div>
            <div class="map-title">${map.title}</div>
        `;

        // Show popup on map card click
        card.addEventListener('click', (event) => {
            event.preventDefault();
            showMapActionPopup(card, key, map);
        });
        grid.appendChild(card);
    });
}

// Show map action popup
function showMapActionPopup(card, mapId, mapData) {
    const popup = document.getElementById('map-action-popup');
    if (!popup) return;
    
    const standardActions = document.getElementById('popup-actions-standard');
    const tbActions = document.getElementById('popup-actions-tb');
    
    // Check if this is a TB map
    const isTB = mapData.pick && mapData.pick.toUpperCase().startsWith('TB');
    
    // Show/hide appropriate action buttons
    if (standardActions) {
        standardActions.style.display = isTB ? 'none' : 'flex';
    }
    if (tbActions) {
        tbActions.style.display = isTB ? 'flex' : 'none';
    }
    
    // Get the clicked card's position
    const rect = card.getBoundingClientRect();
    
    // Position popup to the right of the card, or below if not enough space
    let left = rect.right + 8;
    let top = rect.top;
    
    // If popup would go off-screen right, position below
    if (left + 220 > window.innerWidth) {
        left = rect.left;
        top = rect.bottom + 8;
    }
    
    // If popup would go off-screen bottom, position above
    if (top + 200 > window.innerHeight) {
        top = rect.top - 200;
    }
    
    popup.style.position = 'fixed';
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    popup.style.display = 'block';
    popup.dataset.beatmapId = mapId;
    popup.dataset.mapPick = mapData.pick;
    popup.dataset.mapTitle = mapData.title;
    popup.dataset.mapArtist = mapData.artist;
}

// Trigger strobe flash animation for picks
function triggerStrobeFlash(card, player) {
    // Remove old flash
    card.classList.remove('strobe-flash');
    const oldOverlay = card.querySelector('.strobe-overlay');
    if (oldOverlay) oldOverlay.remove();
    
    // Create new overlay
    const overlay = document.createElement('div');
    overlay.className = `strobe-overlay team-${player}`;
    card.appendChild(overlay);
    
    // Force reflow and add flash class
    void card.offsetWidth;
    card.classList.add('strobe-flash');
    
    // Remove after animation
    setTimeout(() => {
        card.classList.remove('strobe-flash');
        overlay.remove();
    }, 2100);
}

// Handle popup button clicks
function handlePopupAction(action, player, beatmapId, pick, title, artist) {
    const popup = document.getElementById('map-action-popup');
    const card = document.querySelector(`[data-map-id="${beatmapId}"]`);
    
    if (!card) return;
    
    // Get player names from schedule
    const match = scheduleData.matches[currentMatchIndex];
    const playerLeft = match.team1;
    const playerRight = match.team2;
    
    let statusText = '';
    let borderColor = '';
    let filter = '';
    let flashClass = '';
    
    switch (action) {
        case 'picked':
            if (player === 1) {
                statusText = `Picked by ${playerLeft}`;
                borderColor = '#f6e49f';
                flashClass = 'flash-left';
            } else {
                statusText = `Picked by ${playerRight}`;
                borderColor = '#f7c9e2';
                flashClass = 'flash-right';
            }
            // Trigger strobe flash for picks
            triggerStrobeFlash(card, player);
            break;
        case 'banned':
            statusText = `Banned by ${player === 1 ? playerLeft : playerRight}`;
            borderColor = '#ff6464';
            filter = 'brightness(0.6) grayscale(30%)';
            break;
        case 'protected':
            statusText = `Protected by ${player === 1 ? playerLeft : playerRight}`;
            borderColor = '#64ff74';
            break;
    }
    
    // Update card styling
    card.style.borderColor = borderColor;
    card.style.filter = filter;
    
    if (flashClass) {
        setTimeout(() => {
            card.classList.add(flashClass);
        }, 100);
        setTimeout(() => {
            card.classList.remove(flashClass);
        }, 4000);
    }
    
    // Add pick to storage
    addPick(beatmapId, pick, title, artist, action, player);
    
    // Update status label
    const existingLabel = card.querySelector('.map-status');
    if (existingLabel) {
        existingLabel.remove();
    }
    createStatusLabel(card, statusText, player === 2 ? "right" : "left");
    
    // Update map card status classes
    updateMapCardStatus(beatmapId, action, player);
    
    // Close popup
    popup.style.display = 'none';
}

// Update map card visual status
function updateMapCardStatus(beatmapId, action, player) {
    const card = document.querySelector(`[data-map-id="${beatmapId}"]`);
    if (!card) return;
    
    // Remove old status classes
    card.classList.remove('picked', 'picked-by-1', 'picked-by-2', 'banned', 'protected');
    
    // Add new status class
    if (action === 'picked') {
        card.classList.add(`picked-by-${player}`);
    } else if (action === 'banned') {
        card.classList.add('banned');
    } else if (action === 'protected') {
        card.classList.add('protected');
    }
    
    // Add team indicator
    card.dataset.player = player;
}

// Create status label on map card
function createStatusLabel(card, statusText, player) {
    const statusLabel = document.createElement('div');
    statusLabel.classList.add('map-status');
    statusLabel.textContent = statusText;
    if (player === "right") {
        statusLabel.classList.add('right');
    } else {
        statusLabel.classList.add('left');
    }
    
    // Apply gradient background for TB HYPE labels
    if (statusText === 'TB HYPE') {
        statusLabel.style.background = 'linear-gradient(45deg, #f6e49f, #f7c9e2)';
    }
    
    card.appendChild(statusLabel);
    setTimeout(() => {
        statusLabel.classList.add('visible');
    }, 30);
}

// Add pick to localStorage and update picksLog
function addPick(beatmapId, pick, title, artist, action, player) {
    const picks = getPicks();
    const pickData = {
        id: Date.now(),
        beatmapId,
        pick,
        title,
        artist,
        action,
        player,
        timestamp: new Date().toISOString()
    };
    
    picks.unshift(pickData); // Add to beginning
    
    try {
        localStorage.setItem(PICKS_STORAGE_KEY, JSON.stringify(picks));
        console.log('Pick saved:', pickData);
        updatePicksLog();
    } catch (error) {
        console.error('Error saving pick:', error);
    }
}

// Remove pick by beatmapId
function removePickByBeatmapId(beatmapId) {
    const picks = getPicks();
    const pickIndex = picks.findIndex(pick => pick.beatmapId === beatmapId);
    
    if (pickIndex !== -1) {
        const filteredPicks = picks.filter((pick, index) => index !== pickIndex);
        try {
            localStorage.setItem(PICKS_STORAGE_KEY, JSON.stringify(filteredPicks));
        } catch (error) {
            console.error('Error removing pick:', error);
        }
    }
}

// Get picks from localStorage
function getPicks() {
    try {
        const picks = localStorage.getItem(PICKS_STORAGE_KEY);
        return picks ? JSON.parse(picks) : [];
    } catch (error) {
        console.error('Error reading picks:', error);
        return [];
    }
}

// Clear all picks
function clearAllPicks() {
    try {
        localStorage.removeItem(PICKS_STORAGE_KEY);
        updatePicksLog();
    } catch (error) {
        console.error('Error clearing picks:', error);
    }
}

// Update team display
function updateTeamDisplay() {
    const teamLeftName = document.getElementById('team-left-name');
    const teamRightName = document.getElementById('team-right-name');

    if (scheduleData && scheduleData.matches && scheduleData.matches[currentMatchIndex]) {
        const match = scheduleData.matches[currentMatchIndex];
        teamLeftName.textContent = truncateName(match.team1);
        teamRightName.textContent = truncateName(match.team2);
    } else {
        teamLeftName.textContent = 'No match selected';
        teamRightName.textContent = 'No match selected';
    }
}

// Swap teams
function swapTeams() {
    if (!scheduleData || !scheduleData.matches || !scheduleData.matches[currentMatchIndex]) {
        return;
    }

    const match = scheduleData.matches[currentMatchIndex];
    const temp = match.team1;
    match.team1 = match.team2;
    match.team2 = temp;

    updateTeamDisplay();
    updateCurrentMatch();
}

// Set current match
function setMatch() {
    updateCurrentMatch();
}

// Update current match in localStorage
function updateCurrentMatch() {
    if (!scheduleData || !scheduleData.matches || !scheduleData.matches[currentMatchIndex]) {
        return;
    }

    const match = scheduleData.matches[currentMatchIndex];
    const currentMatchData = {
        team1Index: currentMatchIndex,
        team2Index: currentMatchIndex,
        team1Name: match.team1,
        team2Name: match.team2,
        round: currentRound
    };

    localStorage.setItem('peg-current-match', JSON.stringify(currentMatchData));
    console.log('Current match saved:', currentMatchData);
}

// Undo last action
function undoLastAction() {
    const picks = getPicks();
    if (picks.length === 0) return;

    const lastAction = picks.shift(); // Remove first (most recent) entry
    
    try {
        localStorage.setItem(PICKS_STORAGE_KEY, JSON.stringify(picks));
        console.log('Undo last action:', lastAction);
    } catch (error) {
        console.error('Error undoing action:', error);
    }

    // Update UI
    const card = document.querySelector(`[data-map-id="${lastAction.beatmapId}"]`);
    if (card) {
        card.classList.remove('picked', 'picked-by-1', 'picked-by-2', 'banned', 'protected');
    }
    
    updatePicksLog();
}

// Clear all actions
function clearAllActions() {
    try {
        localStorage.removeItem(PICKS_STORAGE_KEY);
        console.log('Cleared all picks/bans');
    } catch (error) {
        console.error('Error clearing picks:', error);
    }

    // Remove all visual states from map cards
    document.querySelectorAll('.map-card').forEach(card => {
        card.classList.remove('picked', 'picked-by-1', 'picked-by-2', 'banned', 'protected');
        const label = card.querySelector('.map-status');
        if (label) label.remove();
    });

    // Clear the picks log
    const logContent = document.getElementById('picks-log-content');
    if (logContent) logContent.innerHTML = '';

    updatePicksLog();
}

// Update picks log display
function updatePicksLog() {
    const logContent = document.getElementById('picks-log-content');
    logContent.innerHTML = '';
    
    const picks = getPicks();

    if (picks.length === 0) {
        logContent.innerHTML = '<div class="log-entry">No picks/bans yet</div>';
        return;
    }

    picks.forEach((entry, index) => {
        const div = document.createElement('div');
        div.className = `log-entry ${index % 2 === 0 ? 'team1' : 'team2'}`;
        const teamName = entry.player === 1 ? 'Team 1' : entry.player === 2 ? 'Team 2' : 'Neutral';
        div.textContent = `${teamName}: ${entry.action} ${entry.pick} - ${entry.artist} - ${entry.title}`;
        logContent.appendChild(div);
    });

    // Scroll to bottom
    logContent.scrollTop = logContent.scrollHeight;
}

// Load from localStorage
function loadFromLocalStorage() {
    try {
        const savedPicks = localStorage.getItem(PICKS_STORAGE_KEY);
        if (savedPicks) {
            const picks = JSON.parse(savedPicks);
            console.log('Loaded picks from localStorage:', picks);

            // Apply saved states to map cards
            picks.forEach(entry => {
                const card = document.querySelector(`[data-map-id="${entry.beatmapId}"]`);
                if (card) {
                    card.classList.remove('picked', 'picked-by-1', 'picked-by-2', 'banned', 'protected');
                    if (entry.action === 'picked') {
                        card.classList.add(`picked-by-${entry.player}`);
                    } else if (entry.action === 'banned') {
                        card.classList.add('banned');
                    } else if (entry.action === 'protected') {
                        card.classList.add('protected');
                    }
                }
            });

            updatePicksLog();
        }

        const savedMatch = localStorage.getItem('peg-current-match');
        if (savedMatch) {
            const matchData = JSON.parse(savedMatch);
            currentMatchIndex = matchData.team1Index || 0;
            currentRound = matchData.round || 'ROUND OF 16';
            console.log('Loaded current match from localStorage:', matchData);
        }
    } catch (error) {
        console.error('Error loading from localStorage:', error);
    }
}

// Setup popup event listeners
function setupPopupEventListeners() {
    // Handle popup button clicks
    document.querySelectorAll('.popup-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const popup = document.getElementById('map-action-popup');
            const action = btn.dataset.action;
            const player = parseInt(btn.dataset.player);
            const beatmapId = popup.dataset.beatmapId;
            const pick = popup.dataset.mapPick;
            const title = popup.dataset.mapTitle;
            const artist = popup.dataset.mapArtist;
            
            handlePopupAction(action, player, beatmapId, pick, title, artist);
        });
    });
    
    // Close popup
    document.querySelector('.popup-close')?.addEventListener('click', () => {
        document.getElementById('map-action-popup').style.display = 'none';
    });
    
    // Close popup on outside click
    document.addEventListener('click', (e) => {
        const popup = document.getElementById('map-action-popup');
        if (popup && !popup.contains(e.target) && !e.target.closest('.map-card')) {
            popup.style.display = 'none';
        }
    });
}

