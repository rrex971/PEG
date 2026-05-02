// PEG Mappool Overlay Script

// Helper function for element selection
const $ = (id) => document.getElementById(id);

// Global state
let currentMappool = null;
let lastMappoolHash = '';

// Mappool loading and rendering
async function loadMappool() {
    const mapsContainer = $('maps');
    const roundDisplay = $('round');
    
    try {
        const response = await fetch('mappool_full.json');
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        const mappool = await response.json();
        
        // Check if mappool has changed
        const mappoolHash = JSON.stringify(mappool);
        if (mappoolHash === lastMappoolHash) {
            return; // No changes
        }
        lastMappoolHash = mappoolHash;
        currentMappool = mappool;
        
        // Update round name
        if (mappool.round) {
            roundDisplay.textContent = mappool.round;
        }
        
        // Clear and rebuild maps container
        mapsContainer.innerHTML = '';
        
        // Get all beatmap IDs except 'round'
        const beatmapIds = Object.keys(mappool).filter(id => id !== 'round');
        
        // Group maps by mod category
        const modOrder = ['NM', 'HD', 'HR', 'DT', 'FM', 'TB'];
        const mapsByMod = {};
        modOrder.forEach(mod => {
            mapsByMod[mod] = [];
        });
        
        beatmapIds.forEach(beatmapId => {
            const mapData = mappool[beatmapId];
            if (mapData && mapData.pick) {
                const pick = mapData.pick.toUpperCase();
                const mod = modOrder.find(m => pick.startsWith(m));
                if (mod) {
                    mapsByMod[mod].push({ beatmapId, mapData });
                }
            }
        });
        
        // Sort maps within each mod category
        modOrder.forEach(mod => {
            mapsByMod[mod].sort((a, b) => {
                const pickA = a.mapData.pick.toUpperCase();
                const pickB = b.mapData.pick.toUpperCase();
                const numA = parseInt(pickA.replace(/\D/g, '')) || 0;
                const numB = parseInt(pickB.replace(/\D/g, '')) || 0;
                return numA - numB;
            });
        });
        
        // Create mod rows
        modOrder.forEach(mod => {
            if (mapsByMod[mod].length > 0) {
                // Create mod row container
                const modRow = document.createElement('div');
                modRow.classList.add('mod-row');
                
                // Create map cards for this mod
                mapsByMod[mod].forEach(({ beatmapId, mapData }) => {
                    const mapElement = createMapCard(beatmapId, mapData);
                    modRow.appendChild(mapElement);
                });
                
                mapsContainer.appendChild(modRow);
            }
        });
        
        // Update map card statuses after mappool loads
        setTimeout(() => {
            updateMapCardStatuses();
        }, 500);
        
    } catch (error) {
        console.error('Error fetching or processing mappool:', error);
        mapsContainer.textContent = 'Error loading mappool. Check console for details.';
    }
}

// Load mappool on page load
loadMappool();

// Poll for mappool changes every 5 seconds
setInterval(() => {
    loadMappool();
}, 5000);

// Create a map card element
function createMapCard(beatmapId, mapData) {
    const mapElement = document.createElement('div');
    mapElement.classList.add('map');
    mapElement.dataset.beatmapId = beatmapId;
    mapElement.mapData = mapData;
    
    // Add mod-specific class for color coding
    const pick = (mapData.pick || '').toUpperCase();
    const modClass = pick.startsWith('NM') ? 'nm' :
                     pick.startsWith('HD') ? 'hd' :
                     pick.startsWith('HR') ? 'hr' :
                     pick.startsWith('DT') ? 'dt' :
                     pick.startsWith('FM') ? 'fm' :
                     pick.startsWith('TB') ? 'tb' : '';
    if (modClass) {
        mapElement.classList.add(modClass);
    }
    
    // Set background image
    const bgUrl = mapData.bg || '';
    mapElement.style.backgroundImage = `url(${bgUrl})`;
    
    // Add pick ID on the left
    const pickIdElement = document.createElement('div');
    pickIdElement.classList.add('pick-id');
    pickIdElement.textContent = mapData.pick;
    mapElement.appendChild(pickIdElement);
    
    // Create map details container
    const mapDetailsElement = document.createElement('div');
    mapDetailsElement.classList.add('map-details');
    
    const mapTitleElement = document.createElement('div');
    mapTitleElement.classList.add('map-title');
    mapTitleElement.textContent = mapData.title || 'Unknown Title';
    
    const mapArtistElement = document.createElement('div');
    mapArtistElement.classList.add('map-artist');
    mapArtistElement.textContent = mapData.artist || 'Unknown Artist';
    
    const mapVersionElement = document.createElement('div');
    mapVersionElement.classList.add('map-version');
    mapVersionElement.textContent = `[${mapData.version || 'Unknown'}]`;
    
    const mapMapperElement = document.createElement('div');
    mapMapperElement.classList.add('map-mapper');
    mapMapperElement.textContent = `mapped by ${mapData.creator || 'Unknown'}`;
    
    mapDetailsElement.appendChild(mapTitleElement);
    mapDetailsElement.appendChild(mapArtistElement);
    mapDetailsElement.appendChild(mapVersionElement);
    mapDetailsElement.appendChild(mapMapperElement);
    
    

    
    // Assemble the card
    mapElement.appendChild(mapDetailsElement);

        // Add custom indicator for custom maps (small label)
    if (mapData.custom) {
        const customLabel = document.createElement('div');
        customLabel.classList.add('custom-label');
        customLabel.textContent = 'CUSTOM';
        mapElement.appendChild(customLabel);
    }
    
    // Add click event listeners for map interactions
    mapElement.addEventListener('click', (e) => {
        e.preventDefault();
        handleMapClick(mapElement, e);
    });
    
    mapElement.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        handleMapClick(mapElement, e);
    });
    
    return mapElement;
}

// Handle map click interactions
function handleMapClick(mapElement, event) {
    event.preventDefault();
    const isShift = event.shiftKey;
    const isRightClick = event.type === 'contextmenu' || event.button === 2;
    const isCtrl = event.ctrlKey || event.metaKey;
    
    // Get map data from the element
    const beatmapId = mapElement.dataset.beatmapId;
    const pickId = mapElement.dataset.pickId;
    const mapData = mapElement.mapData;
    
    // Ctrl+click = clear any pick/ban/protect on this map
    if (isCtrl) {
        clearMapAction(mapElement, pickId, beatmapId);
        return;
    }
    
    // Determine action and player based on click type
    let action = '';
    let player = 0;
    
    if (isShift) {
        // Shift+click = ban
        action = 'banned';
        player = isRightClick ? 2 : 1;
    } else {
        // Normal click = pick
        action = 'picked';
        player = isRightClick ? 2 : 1;
    }
    
    // Apply the map action
    applyMapAction(mapElement, action, player, pickId, beatmapId);
}

function clearMapAction(card, pickId, beatmapId) {
    // Remove visual states
    card.classList.remove('picked-by-1', 'picked-by-2', 'banned-by-1', 'banned-by-2', 'protected', 'flash');
    const label = card.querySelector('.map-status-label');
    if (label) label.remove();
    
    // Remove from localStorage
    const key = 'peg-tournament-picks';
    let picks = JSON.parse(localStorage.getItem(key) || '[]');
    picks = picks.filter(p => p.pick !== pickId && p.beatmapId !== beatmapId);
    localStorage.setItem(key, JSON.stringify(picks));
}

function applyMapAction(card, action, player, pickId, beatmapId) {
    // Get team name from localStorage
    const currentMatch = JSON.parse(localStorage.getItem('peg-current-match') || 'null');
    const teamName = player === 1 ? (currentMatch?.team1Name || 'Team 1') : (currentMatch?.team2Name || 'Team 2');
    
    // Flash animation
    card.classList.remove('flash');
    void card.offsetWidth; // Force reflow
    card.classList.add('flash');
    
    // Remove old status classes
    card.classList.remove('picked-by-1', 'picked-by-2', 'banned-by-1', 'banned-by-2', 'protected');
    const oldLabel = card.querySelector('.map-status-label');
    if (oldLabel) oldLabel.remove();
    
    // Apply new status
    if (action === 'picked') {
        card.classList.add(`picked-by-${player}`);
    } else if (action === 'banned') {
        card.classList.add(`banned-by-${player}`);
    } else if (action === 'protected') {
        card.classList.add('protected');
    }
    
    // Add status label
    const label = document.createElement('div');
    let labelClass = 'map-status-label';
    if (action === 'picked') {
        labelClass += ` picked-by-${player}`;
    } else if (action === 'banned') {
        labelClass += ' banned';
    } else if (action === 'protected') {
        labelClass += ' protected';
    }
    label.className = labelClass;
    label.textContent = `${action === 'picked' ? 'PICKED' : action === 'banned' ? 'BANNED' : 'PROTECTED'} BY ${teamName}`;
    card.appendChild(label);
    
    // Save to localStorage
    savePickToStorage(action, player, pickId, beatmapId);
}

function savePickToStorage(action, player, pickId, beatmapId) {
    const key = 'peg-tournament-picks';
    const picks = JSON.parse(localStorage.getItem(key) || '[]');
    picks.push({
        action: action,
        player: player,
        pick: pickId,
        beatmapId: beatmapId,
        timestamp: Date.now()
    });
    localStorage.setItem(key, JSON.stringify(picks));
}

// WebSocket connection for current map highlighting
const HOST = '127.0.0.1:24050';
const socket = new ReconnectingWebSocket(`ws://${HOST}/websocket/v2`);

let currentMapId = null;

socket.onopen = () => {
    console.log('Successfully connected to tosu WebSocket');
};

socket.onclose = (event) => {
    console.log('Socket closed connection:', event);
};

socket.onerror = (error) => {
    console.log('Socket error:', error);
};

socket.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);
        
        // Check if beatmap changed
        if (data.beatmap && data.beatmap.id !== currentMapId) {
            currentMapId = data.beatmap.id;
            
            // Remove active class from all maps
            document.querySelectorAll('.map.active').forEach(map => {
                map.classList.remove('active');
            });
            
            // Add active class to current map
            const currentMap = document.querySelector(`.map[data-beatmap-id="${currentMapId}"]`);
            if (currentMap) {
                currentMap.classList.add('active');
            }
    
            // Update map background in info panel
            const bgPath = data.directPath?.beatmapBackground;
            if (bgPath) {
                const mapInfoBg = document.getElementById('map-info-bg');
                if (mapInfoBg) {
                    mapInfoBg.src = `/files/beatmap/${encodeURIComponent(bgPath)}`;
                }
            }
        }
    } catch (error) {
        console.error('Error parsing WebSocket message:', error);
    }
    };


// Prevent default browser behaviors
document.addEventListener('contextmenu', function (event) {
    event.preventDefault();
});

document.addEventListener('click', function (event) {
    // Allow clicks on map cards but prevent default on others
    if (!event.target.closest('.map')) {
        event.preventDefault();
    }
});

// Picks/Bans Log from localStorage
const picksQueue = document.getElementById('picks-queue');
const PICKS_STORAGE_KEY = 'peg-tournament-picks';
let lastPicksHash = '';
let lastPickLogCount = 0;

function getPicks() {
    try {
        const picks = localStorage.getItem(PICKS_STORAGE_KEY);
        return picks ? JSON.parse(picks) : [];
    } catch (error) {
        console.error('Error reading picks:', error);
        return [];
    }
}

// Update pick/ban log from localStorage (copied from gameplay)
function updatePicksDisplay() {
    const picks = getPicks();
    const container = picksQueue;
    if (!container) return;
    
    const currentCount = picks.length;
    const isNewPick = currentCount > lastPickLogCount;
    
    console.log('[Mappool] Picks count:', picks.length, 'Last count:', lastPickLogCount);
    
    if (isNewPick) {
        // Only add new entries (newest first)
        const newPicks = picks.slice(0, currentCount - lastPickLogCount);
        
        newPicks.forEach((pick, index) => {
            const item = document.createElement('div');
            // Map action values to CSS class names
            const actionClass = pick.action === 'picked' ? 'pick' :
                               pick.action === 'banned' ? 'ban' :
                               pick.action === 'protected' ? 'protect' : pick.action;
            // Map player to team class
            const teamClass = pick.player === 1 ? 'team-left' : 'team-right';
            
            // Check if this is a tiebreaker
            const isTiebreaker = (pick.pickId || '').startsWith('TB');
            
            item.className = `pick-log-item ${actionClass} ${teamClass}`;
            if (isTiebreaker) {
                item.classList.add('tiebreaker');
            }
            
            let prefix = '';
            if (pick.action === 'picked') prefix = 'PICK:';
            else if (pick.action === 'banned') prefix = 'BAN:';
            else if (pick.action === 'protected') prefix = 'PROT:';
            
            item.textContent = `${prefix} ${pick.pick}`;
            container.appendChild(item);
        });
        
        // Keep only last 20 entries visible
        while (container.children.length > 20) {
            container.removeChild(container.firstChild);
        }
        
        // Scroll to latest entry (right side)
        container.scrollLeft = container.scrollWidth;
        
        // Check if overflow exists and toggle the fade class
        if (container.scrollWidth > container.clientWidth) {
            container.classList.add('has-overflow');
        } else {
            container.classList.remove('has-overflow');
        }
    } else if (currentCount < lastPickLogCount) {
        // Log was cleared - rebuild
        container.innerHTML = '';
        
        // Show newest first, limit to last 20
        picks.slice(0, 20).forEach(pick => {
            const item = document.createElement('div');
            // Map action values to CSS class names
            const actionClass = pick.action === 'picked' ? 'pick' :
                               pick.action === 'banned' ? 'ban' :
                               pick.action === 'protected' ? 'protect' : pick.action;
            // Map player to team class
            const teamClass = pick.player === 1 ? 'team-left' : 'team-right';
            
            // Check if this is a tiebreaker
            const isTiebreaker = (pick.pickId || '').startsWith('TB');
            
            item.className = `pick-log-item ${actionClass} ${teamClass}`;
            if (isTiebreaker) {
                item.classList.add('tiebreaker');
            }
            
            let prefix = '';
            if (pick.action === 'picked') prefix = 'PICK:';
            else if (pick.action === 'banned') prefix = 'BAN:';
            else if (pick.action === 'protected') prefix = 'PROT:';
            
            item.textContent = `${prefix} ${pick.pick}`;
            container.appendChild(item);
        });
        
        // Scroll to latest entry (right side)
        container.scrollLeft = container.scrollWidth;
        
        // Check if overflow exists and toggle the fade class
        if (container.scrollWidth > container.clientWidth) {
            container.classList.add('has-overflow');
        } else {
            container.classList.remove('has-overflow');
        }
    }
    
    lastPickLogCount = currentCount;
    
    // Update ban/protect display after picks update
    updateBanProtectDisplay();
    
    // Update pick indicators
    updatePickIndicators();
}

function updatePickIndicators() {
    const picks = getPicks();
    const pick1Element = document.getElementById('pick1');
    const pick2Element = document.getElementById('pick2');
    
    // Always clear existing show classes first
    if (pick1Element) pick1Element.classList.remove('show');
    if (pick2Element) pick2Element.classList.remove('show');
    
    // Find the latest pick action (any pick, including TB)
    const latestPick = picks.find(pick => pick.action === 'picked');
    
    // If the latest pick is TB or has no player, hide all indicators
    if (latestPick && (latestPick.player === 0 || !latestPick.player ||
        (latestPick.pick && latestPick.pick.toUpperCase() === 'TB'))) {
        // Explicitly hide indicators for TB picks
        if (pick1Element) {
            pick1Element.style.display = 'none';
        }
        if (pick2Element) {
            pick2Element.style.display = 'none';
        }
        return;
    }
    
    // For non-TB picks, show indicators and restore display
    if (pick1Element) {
        pick1Element.style.display = 'flex';
    }
    if (pick2Element) {
        pick2Element.style.display = 'flex';
    }
    
    // Show the appropriate indicator for regular picks
    if (latestPick && latestPick.player === 1 && pick1Element) {
        pick1Element.classList.add('show');
    } else if (latestPick && latestPick.player === 2 && pick2Element) {
        pick2Element.classList.add('show');
    }
}

function updateBanProtectDisplay() {
    const picks = getPicks();
    
    // Get ban and protect elements
    const p1ban0 = document.getElementById('p1ban_0');
    const p1ban1 = document.getElementById('p1ban_1');
    const p2ban0 = document.getElementById('p2ban_0');
    const p2ban1 = document.getElementById('p2ban_1');
    const p1prot0 = document.getElementById('p1prot_0');
    const p2prot0 = document.getElementById('p2prot_0');
    
    // Clear all slots
    const allSlots = [p1ban0, p1ban1, p2ban0, p2ban1, p1prot0, p2prot0];
    allSlots.forEach(slot => {
        if (slot) {
            slot.textContent = '';
            slot.classList.remove('filled');
        }
    });
    
    // Get bans and protects for each player
    const p1Bans = picks.filter(p => p.action === 'banned' && p.player === 1);
    const p2Bans = picks.filter(p => p.action === 'banned' && p.player === 2);
    const p1Protects = picks.filter(p => p.action === 'protected' && p.player === 1);
    const p2Protects = picks.filter(p => p.action === 'protected' && p.player === 2);
    
    // Fill ban slots
    if (p1ban0 && p1Bans[0]) {
        p1ban0.textContent = p1Bans[0].pick;
        p1ban0.classList.add('filled');
    }
    if (p1ban1 && p1Bans[1]) {
        p1ban1.textContent = p1Bans[1].pick;
        p1ban1.classList.add('filled');
    }
    if (p2ban0 && p2Bans[0]) {
        p2ban0.textContent = p2Bans[0].pick;
        p2ban0.classList.add('filled');
    }
    if (p2ban1 && p2Bans[1]) {
        p2ban1.textContent = p2Bans[1].pick;
        p2ban1.classList.add('filled');
    }
    
    // Fill protect slots
    if (p1prot0 && p1Protects[0]) {
        p1prot0.textContent = p1Protects[0].pick;
        p1prot0.classList.add('filled');
    }
    if (p2prot0 && p2Protects[0]) {
        p2prot0.textContent = p2Protects[0].pick;
        p2prot0.classList.add('filled');
    }
}

// Poll for changes to localStorage picks
function checkPicksChanged() {
    try {
        const currentHash = localStorage.getItem(PICKS_STORAGE_KEY) || '';
        if (currentHash !== lastPicksHash) {
            lastPicksHash = currentHash;
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error checking picks:', error);
        return false;
    }
}

// Poll for pick/ban log changes every 500ms (same as gameplay)
setInterval(() => {
    if (checkPicksChanged()) {
        updatePicksDisplay();
        updateMapCardStatuses(); // Also update map card visual states
    }
}, 500);
updatePicksDisplay(); // Initial call

// Initialize picks display on page load
document.addEventListener('DOMContentLoaded', () => {
    // Display initial picks
    updatePicksDisplay();
    
    // Initialize hash for polling
    lastPicksHash = localStorage.getItem(PICKS_STORAGE_KEY) || '';
    
    // Update map card statuses after mappool loads
    setTimeout(() => {
        updateMapCardStatuses();
    }, 1000);
    
    // Add right-click clear functionality to picks title
    const picksTitle = document.getElementById('picks-title');
    if (picksTitle) {
        picksTitle.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            clearAllPicks();
        });
    }
});

function clearAllPicks() {
    try {
        localStorage.removeItem(PICKS_STORAGE_KEY);
        updatePicksDisplay();
        updateMapCardStatuses();
    } catch (error) {
        console.error('Error clearing picks:', error);
    }
}

// Update map card status labels from localStorage picks
function updateMapCardStatuses() {
    const picks = getPicks();
    
    // Clear all existing status labels from map cards
    document.querySelectorAll('.map .map-status-label').forEach(el => el.remove());
    
    // Remove all visual state classes from map cards
    document.querySelectorAll('.map').forEach(card => {
        card.classList.remove('picked-by-1', 'picked-by-2', 'banned-by-1', 'banned-by-2', 'protected', 'flash');
    });
    
    // Apply status labels to map cards (newest pick first = most recent action wins)
    // picks array is newest-first, so iterate and only apply the FIRST action per beatmapId
    const appliedBeatmaps = new Set();
    
    picks.forEach(pickData => {
        if (appliedBeatmaps.has(pickData.beatmapId)) return;
        appliedBeatmaps.add(pickData.beatmapId);
        
        const mapCard = document.querySelector(`.map[data-beatmap-id="${pickData.beatmapId}"]`);
        if (!mapCard) return;
        
        // Get team name from localStorage
        const currentMatch = JSON.parse(localStorage.getItem('peg-current-match') || 'null');
        const teamName = pickData.player === 1 ? (currentMatch?.team1Name || 'Team 1') :
                        pickData.player === 2 ? (currentMatch?.team2Name || 'Team 2') : 'TB';
        
        // Determine status text and styling
        let statusText = '';
        let statusClass = '';
        
        if (pickData.action === 'picked') {
            statusText = `PICKED BY ${teamName}`;
            statusClass = `picked-by-${pickData.player}`;
            mapCard.classList.add(`picked-by-${pickData.player}`);
        } else if (pickData.action === 'banned') {
            statusText = `BANNED BY ${teamName}`;
            statusClass = 'banned';
            mapCard.classList.add(`banned-by-${pickData.player}`);
        } else if (pickData.action === 'protected') {
            statusText = `PROTECTED BY ${teamName}`;
            statusClass = 'protected';
            mapCard.classList.add('protected');
        }
        
        if (statusText) {
            const statusLabel = document.createElement('div');
            statusLabel.classList.add('map-status-label', statusClass);
            statusLabel.textContent = statusText;
            mapCard.appendChild(statusLabel);
        }
    });
}

// Twitch chat connection
document.addEventListener('DOMContentLoaded', () => {
    if (typeof tmi !== 'undefined') {
        const twitchClient = new tmi.Client({
            channels: ['purlstournaments']
        });

        twitchClient.connect().catch(console.error);

        twitchClient.on('message', (channel, tags, message, self) => {
            if (self) return;
            const container = document.getElementById('twitch-messages');
            if (!container) return;
            const msg = document.createElement('div');
            msg.className = 'twitch-message';
            const name = document.createElement('span');
            name.className = 'twitch-name';
            name.textContent = (tags['display-name'] || tags.username) + ': ';
            const text = document.createElement('span');
            text.className = 'twitch-text';
            text.textContent = message;
            msg.appendChild(name);
            msg.appendChild(text);
            container.appendChild(msg);
            while (container.children.length > 20) container.removeChild(container.firstChild);
            container.scrollTop = container.scrollHeight;
        });
    }
});
