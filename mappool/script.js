// PEG Mappool Overlay Script

// Configuration object for easy customization
let CONFIG = {};
fetch('../config.json')
    .then(r => r.json())
    .then(cfg => {
        Object.assign(CONFIG, cfg);
        renderPointsDots();
    })
    .catch(err => {
        console.warn('Config load failed, using defaults:', err);
        CONFIG = {
            bestOf: 9,
            maxBans: 2,
            maxPoints: 4,
            team1Index: 0,
            team2Index: 1,
            maxPicks: 5,
            pickTimer: 30,
            banTimer: 30
        };
        renderPointsDots();
    });

// Truncate team name to max length with ellipsis
function truncateName(name, maxLen = 32) {
    if (!name) return '';
    return name.length > maxLen ? name.substring(0, maxLen) + '…' : name;
}

// Normalize team name for comparison (handles smart quotes, zero-width chars, etc.)
function normalizeTeamName(name) {
    if (!name) return '';
    return name
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')  // smart double quotes → straight
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // smart single quotes → straight
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')   // zero-width chars → remove
        .trim();
}

// Helper function for element selection
const $ = (id) => document.getElementById(id);

// Cache all DOM elements
const els = {
    // Header
    logo: $('logo'),
    round: $('round'),

    // Maps container
    maps: $('maps'),

    // Team info
    teamLeftName: $('team-left-name'),
    teamRightName: $('team-right-name'),
    teamLeftLogo: document.querySelector('#team-left-side .team-logo'),
    teamRightLogo: document.querySelector('#team-right-side .team-logo'),
    teamLeftPicks: $('team-left-picks'),
    teamRightPicks: $('team-right-picks'),

    // Score bar elements
    scoreBarLeft: $('score-bar-left'),
    scoreBarRight: $('score-bar-right'),

    // Map info panel
    pickBadge: $('pick-badge'),
    title: $('title'),
    artist: $('artist'),
    difficulty: $('difficulty'),
    mapper: $('mapper'),

    // Stats
    sr: $('sr'),
    bpm: $('bpm'),
    length: $('length'),
    csval: $('csval'),
    arval: $('arval'),
    odval: $('odval'),
    hpval: $('hpval'),

    // Score display
    scoreLeft: $('score-left'),
    scoreRight: $('score-right'),
    scoreDiff: $('score-diff'),

    // Points (match points)
    pointsLeftDots: $('points-left-dots'),
    pointsRightDots: $('points-right-dots'),
    pointsNumberLeft: $('points-number-left'),
    pointsNumberRight: $('points-number-right'),
    vsPill: $('vs-pill'),

    // Team blocks
    teamLeftSide: $('team-left-side'),
    teamRightSide: $('team-right-side'),

    // Pick/Ban log
    pickLogItems: $('pick-log-items'),

    // Chat
    chatMessages: $('chat-messages'),
    castersList: $('casters-list')
};

// State management
const state = {
    beatmapId: -1,
    lastMods: '',
    scoreLeft: 0,
    scoreRight: 0,
    starsLeft: 0,
    starsRight: 0,
    chatMessages: [],
    lastChatHash: '',
    teams: null,
    pickBanLog: [],
    currentMatch: null
};

// CountUp formatters
const timeFormatter = (value) => {
    const seconds = Math.round(value);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

const smartDecimalFormatter = (value) => {
    return value.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
};

// CountUp instances
const duration = 0.5;
const lengthAni = new CountUp("length", 0, 0, 0, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: timeFormatter });
const cs = new CountUp("csval", 0, 0, 2, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const ar = new CountUp("arval", 0, 0, 2, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const od = new CountUp("odval", 0, 0, 2, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const hp = new CountUp("hpval", 0, 0, 2, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const bpmAni = new CountUp("bpm", 0, 0, 2, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const srAni = new CountUp("sr", 0, 0, 2, 0.3, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const scoreLeftCountUp = new CountUp("score-left", 0, 0, 0, 0.5, { useEasing: true, useGrouping: true, separator: ',', decimal: '.', suffix: '' });
const scoreRightCountUp = new CountUp("score-right", 0, 0, 0, 0.5, { useEasing: true, useGrouping: true, separator: ',', decimal: '.', suffix: '' });
const scoreDiffCountUp = new CountUp("score-diff", 0, 0, 0, 0.5, { useEasing: true, useGrouping: true, separator: ',', decimal: '.', suffix: '' });

// Global state for mappool
let currentMappool = null;
let lastMappoolHash = '';
let lastPicksState = {};
let customEntries = [];

// Mappool loading and rendering
async function loadMappool() {
    const mapsContainer = $('maps');
    const roundDisplay = $('round');
    
    try {
        const response = await fetch('../data/mappool_full.json');
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

        // Extract custom entries for title-based matching
        customEntries = Object.entries(mappool)
            .filter(([, v]) => v && typeof v === 'object' && v.custom)
            .map(([k, v]) => ({ key: k, pick: v.pick }));
        
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
    mapElement.dataset.pickId = mapData.pick;
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
    
    // Ctrl+click = clear any pick/ban on this map
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
    card.classList.remove('picked-by-1', 'picked-by-2', 'banned-by-1', 'banned-by-2', 'flash');
    const label = card.querySelector('.map-status-label');
    if (label) label.remove();
    
    // Remove from localStorage
    const key = 'peg-tournament-picks';
    let picks = JSON.parse(localStorage.getItem(key) || '[]');
    picks = picks.filter(p => p.pick !== pickId && p.beatmapId !== beatmapId);
    localStorage.setItem(key, JSON.stringify(picks));
}

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

function applyMapAction(card, action, player, pickId, beatmapId) {
    // Get team name from localStorage
    const currentMatch = JSON.parse(localStorage.getItem('peg-current-match') || 'null');
    const teamName = player === 1 ? (currentMatch?.team1Name || 'Team 1') : truncateName(currentMatch?.team2Name || 'Team 2');
    
    // Flash animation
    card.classList.remove('flash');
    void card.offsetWidth; // Force reflow
    card.classList.add('flash');
    
    // Strobe flash for picks
    if (action === 'picked') {
        triggerStrobeFlash(card, player);
    }
    
    // Remove old status classes
    card.classList.remove('picked-by-1', 'picked-by-2', 'banned-by-1', 'banned-by-2');
    const oldLabel = card.querySelector('.map-status-label');
    if (oldLabel) oldLabel.remove();
    
    // Apply new status
    if (action === 'picked') {
        card.classList.add(`picked-by-${player}`);
    } else if (action === 'banned') {
        card.classList.add(`banned-by-${player}`);
    }
    
    // Add status label
    const label = document.createElement('div');
    let labelClass = 'map-status-label';
    if (action === 'picked') {
        labelClass += ` picked-by-${player}`;
    } else if (action === 'banned') {
        labelClass += ' banned';
    }
    label.className = labelClass;
    label.textContent = `${action === 'picked' ? 'PICKED' : 'BANNED'} BY ${teamName}`;
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
let lastMods = '';

// Fetch team data from draft API
const PROXY_URL = 'https://corsproxy.io/?';
const DRAFT_API = 'https://purlextragaza-api.vercel.app/api/draft';

async function fetchTeams() {
    // First check if admin has set a match
    const currentMatch = JSON.parse(localStorage.getItem('peg-current-match') || 'null');
    
    try {
        const draftResponse = await fetch(`${PROXY_URL}${encodeURIComponent(DRAFT_API)}`);
        const draftData = await draftResponse.json();
        if (draftData.draft && draftData.draft.teams) {
            state.teams = draftData.draft.teams;
        }
    } catch (e) {
        console.error('Error fetching draft API:', e);
    }
    
    if (currentMatch) {
        // Load teams.json to get logos and player lists
        try {
            const teamsResponse = await fetch('../data/teams.json');
            const teamsData = await teamsResponse.json();
            
            // Find matching teams in teams.json
            const normalizedTeam1Name = normalizeTeamName(currentMatch.team1Name);
            const normalizedTeam2Name = normalizeTeamName(currentMatch.team2Name);
            const team1 = teamsData.teams.find(t => normalizeTeamName(t.name) === normalizedTeam1Name);
            const team2 = teamsData.teams.find(t => normalizeTeamName(t.name) === normalizedTeam2Name);
            
            if (team1) {
                els.teamLeftName.textContent = truncateName(team1.name);
                if (els.teamLeftLogo && team1.teamId) {
                    els.teamLeftLogo.src = `../data/logos/${team1.teamId}.png`;
                }
            } else {
                els.teamLeftName.textContent = truncateName(currentMatch.team1Name || 'TEAM LEFT');
            }
            if (team2) {
                els.teamRightName.textContent = truncateName(team2.name);
                if (els.teamRightLogo && team2.teamId) {
                    els.teamRightLogo.src = `../data/logos/${team2.teamId}.png`;
                }
            } else {
                els.teamRightName.textContent = truncateName(currentMatch.team2Name);
            }
        } catch (error) {
            console.error('Error loading teams.json:', error);
            els.teamLeftName.textContent = truncateName(currentMatch.team1Name || 'TEAM LEFT');
            els.teamRightName.textContent = truncateName(currentMatch.team2Name);
        }
    } else if (state.teams && state.teams.length > 0) {
        // No admin match set — use draft API teams directly
        const urlParams = new URLSearchParams(window.location.search);
        const team1Index = parseInt(urlParams.get('team1')) || CONFIG.team1Index;
        const team2Index = parseInt(urlParams.get('team2')) || CONFIG.team2Index;

        if (state.teams[team1Index]) {
            els.teamLeftName.textContent = truncateName(state.teams[team1Index].name || 'TEAM LEFT');
            updateTeamLogo('left', state.teams[team1Index]);
        }
        if (state.teams[team2Index]) {
            els.teamRightName.textContent = truncateName(state.teams[team2Index].name);
            updateTeamLogo('right', state.teams[team2Index]);
        }
    }
    
}

// Update team logo
function updateTeamLogo(side, team) {
    const logoEl = side === 'left' ? els.teamLeftLogo : els.teamRightLogo;
    if (!logoEl) return;
    
    const teamId = team.teamId || team.id || team.team_id;
    
    if (teamId) {
        logoEl.src = `../data/logos/${teamId}.png`;
        logoEl.alt = team.name || '';
    } else {
        logoEl.src = '';
        logoEl.alt = '';
    }
}

// Update active player highlighting
// Update scorebar with progressive fill from center
function updateScorebar() {
    const leftRaw = state.scoreLeft || 0;
    const rightRaw = state.scoreRight || 0;
    const differ = leftRaw - rightRaw;
    const absDiffer = Math.abs(differ);
    const lowerRaw = Math.min(leftRaw, rightRaw);
    
    let percent;
    if (lowerRaw === 0) {
        percent = absDiffer === 0 ? 0 : 100;
    } else {
        percent = Math.min((absDiffer / lowerRaw) * 100, 100);
    }
    
    if (differ > 0) {
        els.scoreBarLeft.style.width = percent + '%';
        els.scoreBarRight.style.width = '0%';
    } else if (differ < 0) {
        els.scoreBarRight.style.width = percent + '%';
        els.scoreBarLeft.style.width = '0%';
    } else {
        els.scoreBarLeft.style.width = '0%';
        els.scoreBarRight.style.width = '0%';
    }
}

// Update gradient pill based on points
function updatePill() {
    const leftPoints = state.starsLeft || 0;
    const rightPoints = state.starsRight || 0;
    const total = leftPoints + rightPoints;
    
    let midpoint;
    if (total === 0) {
        midpoint = 50;
    } else {
        midpoint = (leftPoints / total) * 100;
    }
    
    // Smooth gradient with shifted midpoint
    const transitionWidth = 20;
    const start = Math.max(0, midpoint - transitionWidth / 2);
    const end = Math.min(100, midpoint + transitionWidth / 2);
    
    els.vsPill.style.background = `linear-gradient(to right, #face68 ${start}%, #fa6868 ${end}%)`;
}

// Update points dots and numbers
function updatePoints() {
    const leftPoints = state.starsLeft || 0;
    const rightPoints = state.starsRight || 0;
    const maxPoints = CONFIG.maxPoints || (Math.floor((CONFIG.bestOf || 9) / 2) + 1);
    
    // Update left dots
    for (let i = 0; i < maxPoints; i++) {
        const dot = document.getElementById(`point-left-${i}`);
        if (dot) {
            if (i < leftPoints) {
                dot.classList.add('filled');
            } else {
                dot.classList.remove('filled');
            }
        }
    }
    
    // Update right dots
    for (let i = 0; i < maxPoints; i++) {
        const dot = document.getElementById(`point-right-${i}`);
        if (dot) {
            if (i < rightPoints) {
                dot.classList.add('filled');
            } else {
                dot.classList.remove('filled');
            }
        }
    }
    
    // Update numeric points
    els.pointsNumberLeft.textContent = leftPoints;
    els.pointsNumberRight.textContent = rightPoints;
    
    // Update pill gradient
    updatePill();
}

// Render points dots dynamically based on CONFIG.bestOf
function renderPointsDots() {
    const maxPoints = CONFIG.maxPoints || (Math.floor((CONFIG.bestOf || 9) / 2) + 1);
    
    // Clear existing dots
    els.pointsLeftDots.innerHTML = '';
    els.pointsRightDots.innerHTML = '';
    
    // Create dots
    for (let i = 0; i < maxPoints; i++) {
        const leftDot = document.createElement('div');
        leftDot.className = 'match-point';
        leftDot.id = `point-left-${maxPoints - i - 1}`;
        els.pointsLeftDots.appendChild(leftDot);
        
        const rightDot = document.createElement('div');
        rightDot.className = 'match-point';
        rightDot.id = `point-right-${i}`;
        els.pointsRightDots.appendChild(rightDot);
    }
}

// Update team picks/bans display below team name (from pick log)
function updateTeamPicks(side) {
    const picksEl = side === 'left' ? els.teamLeftPicks : els.teamRightPicks;
    if (!picksEl) return;
    
    picksEl.innerHTML = '';
    
    const bans = state.pickBanLog.filter(p => p.action === 'banned' && p.player === (side === 'left' ? 1 : 2));
    
    const isLeft = side === 'left';
    
    // Bans row
    if (CONFIG.maxBans > 0) {
        const banRow = document.createElement('div');
        banRow.className = 'picks-row';
        
        const banLabel = document.createElement('span');
        banLabel.className = 'picks-label';
        banLabel.textContent = 'BANS';
        
        const banSlots = document.createElement('div');
        banSlots.className = 'picks-slots';
        
        const banSlotsArray = [];
        for (let i = 0; i < CONFIG.maxBans; i++) {
            const tag = document.createElement('span');
            tag.className = `pick-tag ban team-${side}`;
            const banIndex = isLeft ? i : (CONFIG.maxBans - 1 - i);
            if (bans[banIndex]) {
                tag.textContent = bans[banIndex].map || bans[banIndex].pick || '';
            } else {
                tag.textContent = '—';
                tag.classList.add('empty');
            }
            banSlotsArray.push(tag);
        }
        
        if (!isLeft) banSlotsArray.reverse();
        banSlotsArray.forEach(tag => banSlots.appendChild(tag));
        
        if (isLeft) {
            banRow.appendChild(banLabel);
            banRow.appendChild(banSlots);
        } else {
            banRow.appendChild(banSlots);
            banRow.appendChild(banLabel);
        }
        picksEl.appendChild(banRow);
    }
    
}

// WebSocket event handlers
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
        const beatmap = data.beatmap;
        
        // === Mappool-specific: current map highlighting ===
        
        // Check if beatmap or mods changed
        if (data.beatmap && (data.beatmap.id !== currentMapId || data.play?.mods?.checksum !== lastMods)) {
            currentMapId = data.beatmap.id;
            lastMods = data.play?.mods?.checksum;
            
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
            
            // Update map info panel (title, artist, difficulty, mapper, pick badge, stats)
            
            // Update basic map info
            const titleEl = document.getElementById('title');
            const artistEl = document.getElementById('artist');
            const difficultyEl = document.getElementById('difficulty');
            const mapperEl = document.getElementById('mapper');
            const pickBadgeEl = document.getElementById('pick-badge');
            
            if (titleEl) {
                titleEl.textContent = beatmap.title || 'Unknown Title';
                // Handle Title Overflow
                titleEl.classList.remove('overflow-animate');
                setTimeout(() => {
                    if (titleEl.scrollWidth > titleEl.clientWidth) {
                        titleEl.classList.add('overflow-animate');
                    }
                }, 0);
            }
            if (artistEl) artistEl.textContent = beatmap.artist || 'Unknown Artist';
            if (difficultyEl) difficultyEl.textContent = `[${beatmap.version || 'Unknown'}]`;
            if (mapperEl) mapperEl.textContent = `Mapped by ${beatmap.mapper || 'Unknown'}`;
            
            // Update pick badge from mappool with custom entry fallback
            if (currentMappool && beatmap.id) {
                const mapEntry = currentMappool[beatmap.id];
                if (mapEntry) {
                    if (typeof mapEntry === 'string') {
                        if (pickBadgeEl) pickBadgeEl.textContent = mapEntry;
                    } else {
                        if (pickBadgeEl) pickBadgeEl.textContent = mapEntry.pick || 'N/A';
                    }
                } else {
                    const customMatch = customEntries.find(entry => beatmap.title && beatmap.title.includes(entry.key));
                    if (customMatch) {
                        if (pickBadgeEl) pickBadgeEl.textContent = customMatch.pick;
                    } else {
                        if (pickBadgeEl) pickBadgeEl.textContent = 'N/A';
                    }
                }
            }
            
            // Update stats using tourney client data
            const tourneyStats = data.tourney?.clients?.[0]?.beatmap?.stats;
            const beatmapStats = beatmap.stats;
            
            // Stars
            const stars = tourneyStats?.stars?.total ?? beatmapStats?.stars?.total ?? 0;
            srAni.update(stars);
            
            // BPM
            const bpmVal = tourneyStats?.bpm?.common ?? beatmapStats?.bpm?.common ?? 0;
            bpmAni.update(bpmVal);
            
            // Length
            const lengthMs = beatmap.time?.mp3Length ?? 0;
            lengthAni.update(lengthMs / 1000);
            
            // CS, AR, OD, HP
            const csVal = tourneyStats?.cs?.converted ?? beatmapStats?.cs?.converted ?? 0;
            const arVal = tourneyStats?.ar?.converted ?? beatmapStats?.ar?.converted ?? 0;
            const odVal = tourneyStats?.od?.converted ?? beatmapStats?.od?.converted ?? 0;
            const hpVal = tourneyStats?.hp?.converted ?? beatmapStats?.hp?.converted ?? 0;
            
            cs.update(csVal);
            ar.update(arVal);
            od.update(odVal);
            hp.update(hpVal);
        }
        
        // === Team/Points updates (same as gameplay) ===
        
        // Update scores
        if (data.tourney?.totalScore) {
            const newScoreLeft = data.tourney.totalScore.left || 0;
            const newScoreRight = data.tourney.totalScore.right || 0;

            if (state.scoreLeft !== newScoreLeft || state.scoreRight !== newScoreRight) {
                state.scoreLeft = newScoreLeft;
                state.scoreRight = newScoreRight;

                scoreLeftCountUp.update(newScoreLeft);
                scoreRightCountUp.update(newScoreRight);

                const differ = newScoreLeft - newScoreRight;
                const absDiffer = Math.abs(differ);
                scoreDiffCountUp.update(absDiffer);

                updateScorebar();

                if (newScoreLeft > newScoreRight) {
                    els.scoreLeft.classList.add('leading');
                    els.scoreRight.classList.remove('leading');
                } else if (newScoreRight > newScoreLeft) {
                    els.scoreRight.classList.add('leading');
                    els.scoreLeft.classList.remove('leading');
                } else {
                    els.scoreLeft.classList.remove('leading');
                    els.scoreRight.classList.remove('leading');
                }
            }
        }

        // Update match points
        if (data.tourney?.points) {
            const newStarsLeft = data.tourney.points.left || 0;
            const newStarsRight = data.tourney.points.right || 0;

            if (state.starsLeft !== newStarsLeft || state.starsRight !== newStarsRight) {
                state.starsLeft = newStarsLeft;
                state.starsRight = newStarsRight;
                updatePoints();
            }
        }

        // Update ingame chat
        updateChat(data);

    } catch (error) {
        console.error('Error parsing WebSocket message:', error);
    }
};


// Update chat messages from tosu WebSocket
function updateChat(data) {
    const messages = data.tourney?.chat || data.tourney?.manager?.chat || [];

    if (messages.length === 0) return;

    const chatHash = JSON.stringify(messages.slice(-8));

    if (chatHash !== state.lastChatHash) {
        state.lastChatHash = chatHash;

        els.chatMessages.innerHTML = '';

        const recentMessages = messages.slice(-8);

        recentMessages.forEach((msg) => {
            const messageEl = document.createElement('div');
            messageEl.classList.add('chat-message');

            let teamClass = 'unknown';
            if (msg.team === 'left') {
                teamClass = 'left';
            } else if (msg.team === 'right') {
                teamClass = 'right';
            } else if (msg.team === 'bot') {
                teamClass = 'bot';
            }

            const nameEl = document.createElement('span');
            nameEl.classList.add('chat-name', teamClass);
            nameEl.textContent = msg.name + ':';

            const textEl = document.createElement('span');
            textEl.classList.add('chat-text');
            textEl.textContent = msg.message;

            messageEl.appendChild(nameEl);
            messageEl.appendChild(textEl);
            els.chatMessages.appendChild(messageEl);
        });

        els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    }
}

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
const picksQueue = document.getElementById('pick-log-items');
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
                               pick.action === 'banned' ? 'ban' : pick.action;
            
            // Check if this is a tiebreaker
            const isTiebreaker = (pick.pick || '').startsWith('TB');
            
            // Build class list - don't add team classes for TB picks
            let className = `pick-log-item ${actionClass}`;
            if (!isTiebreaker) {
                // Map player to team class (only for non-TB picks)
                const teamClass = pick.player === 1 ? 'team-left' : 'team-right';
                className += ` ${teamClass}`;
            } else {
                className += ' tiebreaker';
            }
            item.className = className;
            
            let prefix = '';
            if (pick.action === 'picked') prefix = 'PICK:';
            else if (pick.action === 'banned') prefix = 'BAN:';
            
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
                               pick.action === 'banned' ? 'ban' : pick.action;
            
            // Check if this is a tiebreaker
            const isTiebreaker = (pick.pick || '').startsWith('TB');
            
            // Build class list - don't add team classes for TB picks
            let className = `pick-log-item ${actionClass}`;
            if (!isTiebreaker) {
                // Map player to team class (only for non-TB picks)
                const teamClass = pick.player === 1 ? 'team-left' : 'team-right';
                className += ` ${teamClass}`;
            } else {
                className += ' tiebreaker';
            }
            item.className = className;
            
            let prefix = '';
            if (pick.action === 'picked') prefix = 'PICK:';
            else if (pick.action === 'banned') prefix = 'BAN:';
            
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
    
    // Update pick indicators
    updatePickIndicators();
    
    // Update state pickBanLog for team picks display
    state.pickBanLog = picks;
    updateTeamPicks('left');
    updateTeamPicks('right');
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
    
    // Get ban elements
    const p1ban0 = document.getElementById('p1ban_0');
    const p1ban1 = document.getElementById('p1ban_1');
    const p2ban0 = document.getElementById('p2ban_0');
    const p2ban1 = document.getElementById('p2ban_1');
    
    // Clear all slots
    const allSlots = [p1ban0, p1ban1, p2ban0, p2ban1];
    allSlots.forEach(slot => {
        if (slot) {
            slot.textContent = '';
            slot.classList.remove('filled');
        }
    });
    
    // Get bans for each player
    const p1Bans = picks.filter(p => p.action === 'banned' && p.player === 1);
    const p2Bans = picks.filter(p => p.action === 'banned' && p.player === 2);
    
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
    
    // === Team/points initialization ===
    // Fetch team data on load
    fetchTeams().then(() => {
    });

    // Poll for match changes every 2 seconds
    setInterval(async () => {
        const currentMatch = JSON.parse(localStorage.getItem('peg-current-match') || 'null');
        if (currentMatch &&
            (currentMatch.team1Name !== state.currentMatch?.team1Name ||
             currentMatch.team2Name !== state.currentMatch?.team2Name)) {
            state.currentMatch = currentMatch;
            els.teamLeftName.textContent = truncateName(currentMatch.team1Name || 'TEAM LEFT');
            els.teamRightName.textContent = truncateName(currentMatch.team2Name);
            
            try {
                const teamsResponse = await fetch('../data/teams.json');
                const teamsData = await teamsResponse.json();
                
                const normalizedTeam1Name = normalizeTeamName(currentMatch.team1Name);
                const normalizedTeam2Name = normalizeTeamName(currentMatch.team2Name);
                const team1 = teamsData.teams.find(t => normalizeTeamName(t.name) === normalizedTeam1Name);
                const team2 = teamsData.teams.find(t => normalizeTeamName(t.name) === normalizedTeam2Name);
                
                if (team1) {
                    els.teamLeftName.textContent = truncateName(team1.name);
                    if (els.teamLeftLogo && team1.teamId) {
                        els.teamLeftLogo.src = `../data/logos/${team1.teamId}.png`;
                    }
                }
                if (team2) {
                    els.teamRightName.textContent = truncateName(team2.name);
                    if (els.teamRightLogo && team2.teamId) {
                        els.teamRightLogo.src = `../data/logos/${team2.teamId}.png`;
                    }
                    
                }
                
            } catch (error) {
                console.error('Error loading teams.json during poll:', error);
            }
        }
    }, 2000);
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
    const currentState = {};
    
    // Build current state from picks (newest first, so first action per beatmap wins)
    const appliedBeatmaps = new Set();
    picks.forEach(pick => {
        const key = pick.beatmapId || pick.pick;
        if (!appliedBeatmaps.has(key)) {
            appliedBeatmaps.add(key);
            currentState[key] = `${pick.action}-${pick.player}`;
        }
    });
    
    // Only update cards that changed
    const stateHash = JSON.stringify(currentState);
    if (stateHash === JSON.stringify(lastPicksState)) return; // No changes
    lastPicksState = currentState;
    
    // Find which cards changed and update only those
    document.querySelectorAll('.map').forEach(card => {
        const beatmapId = card.dataset.beatmapId;
        const newState = currentState[beatmapId];
        const oldState = card.dataset.currentState;
        
        if (newState === oldState) return; // No change for this card
        
        card.dataset.currentState = newState || '';
        
        // Remove old states
        card.classList.remove('picked-by-1', 'picked-by-2', 'banned-by-1', 'banned-by-2');
        const oldLabel = card.querySelector('.map-status-label');
        if (oldLabel) oldLabel.remove();
        
        if (!newState) return; // No state for this card
        
        const [action, player] = newState.split('-');
        
        // Apply new state
        if (action === 'picked') {
            card.classList.add(`picked-by-${player}`);
            triggerStrobeFlash(card, parseInt(player));
        } else if (action === 'banned') {
            card.classList.add(`banned-by-${player}`);
        }
        
        // Add label
        addStatusLabel(card, action, parseInt(player), beatmapId);
    });
}

// Helper function to add status label to a card
function addStatusLabel(card, action, player, beatmapId) {
    // Get team name from localStorage
    const currentMatch = JSON.parse(localStorage.getItem('peg-current-match') || 'null');
    const teamName = player === 1 ? (currentMatch?.team1Name || 'Team 1') :
                    player === 2 ? truncateName(currentMatch?.team2Name || 'Team 2') : 'TB';
    
    // Determine status text and styling
    let statusText = '';
    let statusClass = '';
    
    if (action === 'picked') {
        // Check if this is a TB map
        const pickId = card.dataset.pickId;
        const isTB = pickId && pickId.toUpperCase().startsWith('TB');
        if (isTB) {
            statusText = 'TB HYPE';
            statusClass = 'tb-hype';
        } else {
            statusText = `PICKED BY ${teamName}`;
            statusClass = `picked-by-${player}`;
        }
    } else if (action === 'banned') {
        statusText = `BANNED BY ${teamName}`;
        statusClass = 'banned';
    }
    
    if (statusText) {
        const statusLabel = document.createElement('div');
        statusLabel.classList.add('map-status-label', statusClass);
        statusLabel.textContent = statusText;
        card.appendChild(statusLabel);
    }
}

// Twitch chat connection
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
    name.textContent = tags['display-name'] || tags.username;
    
    const text = document.createElement('span');
    text.className = 'twitch-text';
    text.textContent = message;
    
    msg.appendChild(name);
    msg.appendChild(text);
    container.appendChild(msg);
    
    // Keep only last 20 messages
    while (container.children.length > 20) {
        container.removeChild(container.firstChild);
    }
    
    container.scrollTop = container.scrollHeight;
});
