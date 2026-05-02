/* PEG Gameplay Overlay Script - Horizontal Layout with Progressive Scorebar */

const HOST = '127.0.0.1:24050';
const socket = new ReconnectingWebSocket(`ws://${HOST}/websocket/v2`);

// Debug flag
const DEBUG = false;

// Configuration object for easy customization
let CONFIG = {};
fetch('../config.json')
    .then(r => r.json())
    .then(data => { CONFIG = data; })
    .catch(() => {
        // Fallback defaults
        CONFIG = {
            bestOf: 9,
            maxBans: 2,
            maxProtects: 1,
            maxPoints: 4,
            team1Index: 0,
            team2Index: 1,
            maxPicks: 5,
            pickTimer: 30,
            banTimer: 30
        };
    });

// Helper function to get elements by ID
const $ = (id) => document.getElementById(id);

// Cache all DOM elements
const els = {
    // Header
    logo: $('logo'),
    round: $('round'),

    // Gameplay area
    gameplay: $('gameplay'),
    gameplayBg: $('gameplay-bg'),

    // Team info
    teamLeftName: $('team-left-name'),
    teamRightName: $('team-right-name'),
    teamLeftLogo: document.querySelector('#team-left-side .team-logo'),
    teamRightLogo: document.querySelector('#team-right-side .team-logo'),
    teamLeftPicks: $('team-left-picks'),
    teamRightPicks: $('team-right-picks'),
    playersLeft: $('players-left'),
    playersRight: $('players-right'),
    overflowLeft: $('overflow-left'),
    overflowRight: $('overflow-right'),

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
    scoreLeft: 0,
    scoreRight: 0,
    playerLeft: '/ / /',
    playerRight: '\\ \\ \\',
    starsLeft: 0,
    starsRight: 0,
    chatMessages: [],
    lastChatHash: '',
    teams: null,
    activePlayers: [],
    pickBanLog: []
};

// Time formatter for CountUp
const timeFormatter = (value) => {
    const seconds = Math.round(value);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

// Smart decimal formatter for CountUp
const smartDecimalFormatter = (value) => {
    return value.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
};

// CountUp instances
const duration = 0.5;
const length = new CountUp("length", 0, 0, 0, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: timeFormatter });
const cs = new CountUp("csval", 0, 0, 2, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const ar = new CountUp("arval", 0, 0, 2, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const od = new CountUp("odval", 0, 0, 2, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const hp = new CountUp("hpval", 0, 0, 2, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const bpm = new CountUp("bpm", 0, 0, 2, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const sr = new CountUp("sr", 0, 0, 2, 0.3, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const scoreLeftCountUp = new CountUp("score-left", 0, 0, 0, 0.5, { useEasing: true, useGrouping: true, separator: ',', decimal: '.', suffix: '' });
const scoreRightCountUp = new CountUp("score-right", 0, 0, 0, 0.5, { useEasing: true, useGrouping: true, separator: ',', decimal: '.', suffix: '' });
const scoreDiffCountUp = new CountUp("score-diff", 0, 0, 0, 0.5, { useEasing: true, useGrouping: true, separator: ',', decimal: '.', suffix: '' });

// Mappool data
let mappool = {};
let customEntries = [];

// Load mappool and separate custom entries
fetch('../showcase/mappool.json')
    .then(response => response.json())
    .then(data => {
        mappool = data;
        // Extract custom entries for later title-based matching
        customEntries = Object.entries(data)
            .filter(([, v]) => v && typeof v === 'object' && v.custom)
            .map(([k, v]) => ({ key: k, pick: v.pick }));
        els.round.textContent = data.round || "QUALIFIERS";
    })
    .catch(error => console.error('Error loading mappool:', error));

// Fetch team data from draft API
const PROXY_URL = 'https://corsproxy.io/?';
const DRAFT_API = 'https://purlextragaza-api.vercel.app/api/draft';

async function fetchTeams() {
    // First check if admin has set a match
    const currentMatch = JSON.parse(localStorage.getItem('peg-current-match') || 'null');
    
    // Build a username → osuId lookup from the draft API
    let osuIdLookup = {};
    try {
        const draftResponse = await fetch(`${PROXY_URL}${encodeURIComponent(DRAFT_API)}`);
        const draftData = await draftResponse.json();
        if (draftData.draft && draftData.draft.teams) {
            state.teams = draftData.draft.teams;
            // Build lookup: username → { osuId, avatarUrl }
            draftData.draft.teams.forEach(team => {
                if (team.captain) {
                    const name = team.captain.username || team.captain.name || '';
                    if (name) osuIdLookup[name.toLowerCase()] = { osuId: team.captain.osuId || team.captain.id, avatarUrl: team.captain.avatarUrl };
                }
                if (team.players) {
                    team.players.forEach(p => {
                        const name = p.username || p.name || '';
                        if (name) osuIdLookup[name.toLowerCase()] = { osuId: p.osuId || p.id, avatarUrl: p.avatarUrl };
                    });
                }
            });
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
            const team1 = teamsData.teams.find(t => t.name === currentMatch.team1Name);
            const team2 = teamsData.teams.find(t => t.name === currentMatch.team2Name);
            
            if (team1) {
                els.teamLeftName.textContent = team1.name;
                if (els.teamLeftLogo && team1.teamId) {
                    els.teamLeftLogo.src = `../data/logos/${team1.teamId}.png`;
                }
                // Enrich team1 players with osuIds from draft API
                enrichTeamWithOsuIds(team1, osuIdLookup);
                renderTeamSlots('left', team1);
            } else {
                els.teamLeftName.textContent = currentMatch.team1Name || 'TEAM LEFT';
            }
            if (team2) {
                els.teamRightName.textContent = team2.name;
                if (els.teamRightLogo && team2.teamId) {
                    els.teamRightLogo.src = `../data/logos/${team2.teamId}.png`;
                }
                enrichTeamWithOsuIds(team2, osuIdLookup);
                renderTeamSlots('right', team2);
            } else {
                els.teamRightName.textContent = currentMatch.team2Name || 'TEAM RIGHT';
            }
        } catch (error) {
            console.error('Error loading teams.json:', error);
            els.teamLeftName.textContent = currentMatch.team1Name || 'TEAM LEFT';
            els.teamRightName.textContent = currentMatch.team2Name || 'TEAM RIGHT';
        }
    } else if (state.teams && state.teams.length > 0) {
        // No admin match set — use draft API teams directly
        const urlParams = new URLSearchParams(window.location.search);
        const team1Index = parseInt(urlParams.get('team1')) || CONFIG.team1Index;
        const team2Index = parseInt(urlParams.get('team2')) || CONFIG.team2Index;

        if (state.teams[team1Index]) {
            renderTeamSlots('left', state.teams[team1Index]);
            els.teamLeftName.textContent = state.teams[team1Index].name || 'TEAM LEFT';
            updateTeamLogo('left', state.teams[team1Index]);
        }
        if (state.teams[team2Index]) {
            renderTeamSlots('right', state.teams[team2Index]);
            els.teamRightName.textContent = state.teams[team2Index].name || 'TEAM RIGHT';
            updateTeamLogo('right', state.teams[team2Index]);
        }
    }
    
    // Process benched players after rendering slots
    updateActivePlayers();
}

// Enrich team players with osuIds from draft API lookup
function enrichTeamWithOsuIds(team, osuIdLookup) {
    if (!team.players || !Array.isArray(team.players)) return;
    
    team.players = team.players.map(p => {
        const name = typeof p === 'string' ? p : (p.username || p.name || '');
        const lookup = osuIdLookup[name.toLowerCase()];
        if (lookup) {
            return { name: name, osuId: lookup.osuId, avatarUrl: lookup.avatarUrl };
        }
        return typeof p === 'string' ? { name: p, osuId: '' } : p;
    });
}

// Render player slots for a team
function renderTeamSlots(side, team) {
    const container = side === 'left' ? els.playersLeft : els.playersRight;
    const slots = container.querySelectorAll('.player-slot');

    // Build player list from team data
    // teams.json has: captain (string), players (array of strings)
    // draft API has: captain (object), players (array of objects)
    const players = [];
    
    if (team.players && Array.isArray(team.players)) {
        // Use players array as the source of truth (includes captain)
        team.players.forEach(p => {
            if (typeof p === 'string') {
                // teams.json format: just a name string
                players.push({ name: p, osuId: '' });
            } else if (p && typeof p === 'object') {
                // draft API format: object with username/name and osuId
                players.push({
                    name: p.username || p.name || '',
                    osuId: p.osuId || p.id || ''
                });
            }
        });
    }
    
    // If no players array but captain exists, add captain
    if (players.length === 0 && team.captain) {
        if (typeof team.captain === 'string') {
            players.push({ name: team.captain, osuId: '' });
        } else if (team.captain.username || team.captain.name) {
            players.push({
                name: team.captain.username || team.captain.name,
                osuId: team.captain.osuId || team.captain.id || ''
            });
        }
    }

    // Fill slots with player names and avatars
    slots.forEach((slot, index) => {
        const avatarEl = slot.querySelector('.player-avatar');
        const nameEl = slot.querySelector('.player-name');
        
        if (players[index] && players[index].name) {
            const playerName = players[index].name;
            const osuId = players[index].osuId;
            
            slot.dataset.playerName = playerName;
            
            if (nameEl) {
                nameEl.textContent = playerName;
            }
            
            if (avatarEl && osuId) {
                avatarEl.src = `https://a.ppy.sh/${osuId}`;
                avatarEl.alt = playerName;
            } else if (avatarEl) {
                avatarEl.src = '';
                avatarEl.alt = '';
            }
        } else {
            slot.dataset.playerName = '';
            if (nameEl) {
                nameEl.textContent = '';
            }
            if (avatarEl) {
                avatarEl.src = '';
                avatarEl.alt = '';
            }
        }
    });
}

// Update team logo
function updateTeamLogo(side, team) {
    const logoEl = side === 'left' ? els.teamLeftLogo : els.teamRightLogo;
    if (!logoEl) return;
    
    // Try to get team ID from various possible properties
    const teamId = team.teamId || team.id || team.team_id;
    
    if (teamId) {
        logoEl.src = `../data/logos/${teamId}.png`;
        logoEl.alt = team.name || '';
    } else {
        // No fallback — clear the logo if no team ID
        logoEl.src = '';
        logoEl.alt = '';
    }
}

// Update active player highlighting
function updateActivePlayers() {
    const spectatedPlayers = state.activePlayers.map(p => p.toLowerCase());
    console.log('[Gameplay] Spectated players:', spectatedPlayers);

    // Process left team
    processBenchedPlayers(els.playersLeft, els.overflowLeft, spectatedPlayers);
    
    // Process right team
    processBenchedPlayers(els.playersRight, els.overflowRight, spectatedPlayers);
}

function processBenchedPlayers(container, overflowEl, spectatedPlayers) {
    const slots = container.querySelectorAll('.player-slot');
    console.log('[Gameplay] Container slots:', slots.length);
    
    let totalPlayers = 0;
    let activeCount = 0;
    
    slots.forEach(slot => {
        if (slot.dataset.playerName) {
            totalPlayers++;
            const name = slot.dataset.playerName.toLowerCase();
            if (spectatedPlayers.some(p => p.toLowerCase() === name)) {
                activeCount++;
                slot.classList.add('in-lobby');
                slot.classList.remove('overflow-hidden');
            } else {
                slot.classList.remove('in-lobby');
            }
        } else {
            slot.style.display = 'none';
        }
    });
    
    const benchedCount = totalPlayers - activeCount;
    
    // Show only first 4 benched, hide rest
    let visibleCount = 0;
    slots.forEach(slot => {
        if (slot.dataset.playerName && !slot.classList.contains('in-lobby')) {
            if (visibleCount < 4) {
                slot.classList.remove('overflow-hidden');
                visibleCount++;
            } else {
                slot.classList.add('overflow-hidden');
            }
        }
    });
    
    // Overflow
    const overflow = benchedCount - visibleCount;
    if (overflow > 0) {
        overflowEl.textContent = `+${overflow}`;
        overflowEl.style.display = 'inline-flex';
    } else {
        overflowEl.style.display = 'none';
    }
}

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
    
    // Smooth gradient with shifted midpoint — dominant color takes more space
    // Use a range around the midpoint for smooth transition
    const transitionWidth = 20; // % width of the smooth transition zone
    const start = Math.max(0, midpoint - transitionWidth / 2);
    const end = Math.min(100, midpoint + transitionWidth / 2);
    
    els.vsPill.style.background = `linear-gradient(to right, #face68 ${start}%, #fa6868 ${end}%)`;
}

// Update points dots and numbers
function updatePoints() {
    const leftPoints = state.starsLeft || 0;
    const rightPoints = state.starsRight || 0;
    const maxPoints = Math.floor((CONFIG.bestOf || 9) / 2) + 1;
    
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

// Render team block with name, avatars, bans, and protects
function renderTeamBlock(teamData, side) {
    const block = document.createElement('div');
    block.className = `team-block team-block-${side}`;
    
    // Team name
    const name = document.createElement('div');
    name.className = 'team-name';
    name.textContent = teamData.name || `Team ${side === 'left' ? '1' : '2'}`;
    block.appendChild(name);
    
    // Avatars
    const avatars = document.createElement('div');
    avatars.className = 'team-avatars';
    const allPlayers = [teamData.captain, ...(teamData.players || [])].slice(0, 8);
    allPlayers.forEach(player => {
        const slot = document.createElement('div');
        slot.className = 'player-slot';
        const img = document.createElement('img');
        img.className = 'player-avatar';
        img.src = `https://a.ppy.sh/${player.osuId}`;
        img.alt = '';
        img.loading = 'lazy';
        slot.appendChild(img);
        avatars.appendChild(slot);
    });
    block.appendChild(avatars);
    
    // Bans
    if (CONFIG.maxBans > 0) {
        const bans = document.createElement('div');
        bans.className = 'team-bans';
        for (let i = 0; i < CONFIG.maxBans; i++) {
            const badge = document.createElement('div');
            badge.className = 'ban-badge';
            badge.textContent = '—'; // placeholder, updated from localStorage
            bans.appendChild(badge);
        }
        block.appendChild(bans);
    }
    
    // Protects
    if (CONFIG.maxProtects > 0) {
        const protects = document.createElement('div');
        protects.className = 'team-protects';
        for (let i = 0; i < CONFIG.maxProtects; i++) {
            const badge = document.createElement('div');
            badge.className = 'protect-badge';
            badge.textContent = '—'; // placeholder
            protects.appendChild(badge);
        }
        block.appendChild(protects);
    }
    
    return block;
}

// Update pick/ban log from localStorage
let lastPickLogCount = 0;

function updatePickLog() {
    const picks = JSON.parse(localStorage.getItem('peg-tournament-picks') || '[]');
    const container = els.pickLogItems;
    if (!container) return;
    
    // Update state pickBanLog
    state.pickBanLog = picks;
    
    const currentCount = picks.length;
    const isNewPick = currentCount > lastPickLogCount;
    
    console.log('[Gameplay] Picks count:', picks.length, 'Last count:', lastPickLogCount);
    
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
    
    // Update team picks/bans display
    updateTeamPicks('left');
    updateTeamPicks('right');
}

// Update team picks/bans display below team name
function updateTeamPicks(side) {
    const picksEl = side === 'left' ? els.teamLeftPicks : els.teamRightPicks;
    if (!picksEl) return;
    
    picksEl.innerHTML = '';
    
    const bans = state.pickBanLog.filter(p => p.action === 'banned' && p.player === (side === 'left' ? 1 : 2));
    const protects = state.pickBanLog.filter(p => p.action === 'protected' && p.player === (side === 'left' ? 1 : 2));
    
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
            // For right team, bans fill from the end
            const banIndex = isLeft ? i : (CONFIG.maxBans - 1 - i);
            if (bans[banIndex]) {
                tag.textContent = bans[banIndex].map || bans[banIndex].pick || '';
            } else {
                tag.textContent = '—';
                tag.classList.add('empty');
            }
            banSlotsArray.push(tag);
        }
        
        // For right team, reverse so filled slots are on the right
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
    
    // Protects row
    if (CONFIG.maxProtects > 0) {
        const protRow = document.createElement('div');
        protRow.className = 'picks-row';
        
        const protLabel = document.createElement('span');
        protLabel.className = 'picks-label';
        protLabel.textContent = 'PROT';
        
        const protSlots = document.createElement('div');
        protSlots.className = 'picks-slots';
        
        const protSlotsArray = [];
        for (let i = 0; i < CONFIG.maxProtects; i++) {
            const tag = document.createElement('span');
            tag.className = `pick-tag protect team-${side}`;
            // For right team, protects fill from the end
            const protIndex = isLeft ? i : (CONFIG.maxProtects - 1 - i);
            if (protects[protIndex]) {
                tag.textContent = protects[protIndex].map || protects[protIndex].pick || '';
            } else {
                tag.textContent = '—';
                tag.classList.add('empty');
            }
            protSlotsArray.push(tag);
        }
        
        // For right team, reverse so filled slots are on the right
        if (!isLeft) protSlotsArray.reverse();
        protSlotsArray.forEach(tag => protSlots.appendChild(tag));
        
        if (isLeft) {
            protRow.appendChild(protLabel);
            protRow.appendChild(protSlots);
        } else {
            protRow.appendChild(protSlots);
            protRow.appendChild(protLabel);
        }
        picksEl.appendChild(protRow);
    }
}

// Render points dots dynamically based on CONFIG.bestOf
function renderPointsDots() {
    const maxPoints = Math.floor((CONFIG.bestOf || 9) / 2) + 1;
    
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

// WebSocket connection
socket.onopen = () => {
    if (DEBUG) console.log("Successfully Connected to tosu WebSocket");
};

socket.onclose = (event) => {
    if (DEBUG) console.log("Socket Closed Connection: ", event);
};

socket.onerror = (error) => {
    if (DEBUG) console.log("Socket Error: ", error);
};

socket.onmessage = (event) => {
    let data = JSON.parse(event.data);
    const beatmap = data.beatmap;
    
    // Debug logging
    if (DEBUG) console.log('[Gameplay] WebSocket data:', data);
    if (data.tourney?.clients) {
        console.log('[Gameplay] Tourney clients count:', data.tourney.clients.length);
        console.log('[Gameplay] Tourney clients:', data.tourney.clients.map(c => c.user?.name));
    }

    // Beatmap change detection
    if (state.beatmapId !== beatmap.id) {
        state.beatmapId = beatmap.id;

        // Update map info
        els.title.textContent = beatmap.title;
        els.artist.textContent = beatmap.artist;
        els.mapper.textContent = `Mapped by ${beatmap.mapper}`;
        els.difficulty.textContent = `[${beatmap.version}]`;

        // Update map background in info panel
        const bgPath = data.directPath?.beatmapBackground;
        if (bgPath) {
            const mapInfoBg = document.getElementById('map-info-bg');
            if (mapInfoBg) {
                mapInfoBg.src = `/files/beatmap/${encodeURIComponent(bgPath)}`;
            }
        }

        // Update Pick Badge
        if (mappool[beatmap.id]) {
            // Standard map entry (numeric id)
            if (mappool[beatmap.id].custom === undefined) {
                els.pickBadge.textContent = mappool[beatmap.id];
            } else {
                els.pickBadge.textContent = mappool[beatmap.id].pick;
            }
        } else {
            // Try custom entries: match by title containing the custom pick string
            const customMatch = customEntries.find(entry => beatmap.title && beatmap.title.includes(entry.key));
            if (customMatch) {
                els.pickBadge.textContent = customMatch.pick;
            } else {
                els.pickBadge.textContent = "N/A";
            }
        }

        // Update Stats using tourney client data (preferred for tournament mode)
        const tourneyStats = data.tourney?.clients?.[0]?.beatmap?.stats;
        const beatmapStats = beatmap.stats;

        // Stars
        const stars = tourneyStats?.stars?.total ?? beatmapStats?.stars?.total ?? 0;
        sr.update(stars);

        // BPM
        const bpmVal = tourneyStats?.bpm?.common ?? beatmapStats?.bpm?.common ?? 0;
        bpm.update(bpmVal);

        // Length (always use beatmap.time.mp3Length in milliseconds)
        const lengthMs = beatmap.time?.mp3Length ?? 0;
        length.update(lengthMs / 1000);

        // CS, AR, OD, HP with fallbacks
        const csVal = tourneyStats?.cs?.converted ?? beatmapStats?.cs?.converted ?? 0;
        const arVal = tourneyStats?.ar?.converted ?? beatmapStats?.ar?.converted ?? 0;
        const odVal = tourneyStats?.od?.converted ?? beatmapStats?.od?.converted ?? 0;
        const hpVal = tourneyStats?.hp?.converted ?? beatmapStats?.hp?.converted ?? 0;

        cs.update(csVal);
        ar.update(arVal);
        od.update(odVal);
        hp.update(hpVal);

        if (DEBUG) console.log('beatmap stats:', beatmap.stats);

        // Handle Title Overflow
        els.title.classList.remove('overflow-animate');
        setTimeout(() => {
            if (els.title.scrollWidth > els.title.clientWidth) {
                els.title.classList.add('overflow-animate');
            }
        }, 0);
    }

    // Update scores
    if (data.tourney?.totalScore) {
        const newScoreLeft = data.tourney.totalScore.left || 0;
        const newScoreRight = data.tourney.totalScore.right || 0;

        if (state.scoreLeft !== newScoreLeft || state.scoreRight !== newScoreRight) {
            state.scoreLeft = newScoreLeft;
            state.scoreRight = newScoreRight;

            // Update CountUp instances
            scoreLeftCountUp.update(newScoreLeft);
            scoreRightCountUp.update(newScoreRight);

            // Calculate score difference
            const differ = newScoreLeft - newScoreRight;
            const absDiffer = Math.abs(differ);
            scoreDiffCountUp.update(absDiffer);

            // Update progressive scorebar
            updateScorebar();

            // Leading score highlight
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

    // Update player names - check ALL clients, not just first 2
    if (data.tourney?.clients) {
        const clientNames = data.tourney.clients.map(c => c.user?.name).filter(Boolean);
        const newPlayerLeft = data.tourney.clients[0]?.user?.name;
        const newPlayerRight = data.tourney.clients[1]?.user?.name;
        
        if (state.playerLeft !== newPlayerLeft || state.playerRight !== newPlayerRight) {
            state.playerLeft = newPlayerLeft;
            state.playerRight = newPlayerRight;
            
            // Update active players list with ALL clients
            state.activePlayers = clientNames;
            console.log('[Gameplay] Active players (all clients):', state.activePlayers);
            updateActivePlayers();
        }
    }

    // Update match points (filled dots and numbers)
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
    
    // Always update benched players on every message
    console.log('[Gameplay] Active players (always update):', state.activePlayers);
    updateActivePlayers();
};

// Update chat messages from tosu WebSocket
function updateChat(data) {
    // Try to get chat messages from tourney data
    const messages = data.tourney?.chat || data.tourney?.manager?.chat || [];

    if (messages.length === 0) return;

    // Create a hash of the messages to detect changes
    const chatHash = JSON.stringify(messages.slice(-8));

    if (chatHash !== state.lastChatHash) {
        state.lastChatHash = chatHash;

        // Clear existing messages
        els.chatMessages.innerHTML = '';

        // Display last 8 messages
        const recentMessages = messages.slice(-8);

        recentMessages.forEach((msg) => {
            const messageEl = document.createElement('div');
            messageEl.classList.add('chat-message');

            // Determine team color
            let teamClass = 'unknown';
            if (msg.team === 'left') {
                teamClass = 'left';
            } else if (msg.team === 'right') {
                teamClass = 'right';
            } else if (msg.team === 'bot') {
                teamClass = 'bot';
            }

            // Create name element
            const nameEl = document.createElement('span');
            nameEl.classList.add('chat-name', teamClass);
            nameEl.textContent = msg.name + ':';

            // Create text element
            const textEl = document.createElement('span');
            textEl.classList.add('chat-text');
            textEl.textContent = msg.message;

            messageEl.appendChild(nameEl);
            messageEl.appendChild(textEl);
            els.chatMessages.appendChild(messageEl);
        });

        // Auto-scroll to bottom
        els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    if (DEBUG) console.log('PEG Gameplay Overlay loaded');

    // Render points dots based on CONFIG.maxPoints
    renderPointsDots();

    // Fetch team data on load
    fetchTeams().then(() => {
        // Process benched players after team data loads
        updateActivePlayers();
    });

    // Poll for pick/ban log changes every 500ms
    setInterval(updatePickLog, 500);
    updatePickLog(); // Initial call
    
    // Update team picks on initial load
    updateTeamPicks('left');
    updateTeamPicks('right');
    
    // Poll for match changes every 2 seconds
    setInterval(async () => {
        const currentMatch = JSON.parse(localStorage.getItem('peg-current-match') || 'null');
        if (currentMatch &&
            (currentMatch.team1Name !== state.currentMatch?.team1Name ||
             currentMatch.team2Name !== state.currentMatch?.team2Name)) {
            state.currentMatch = currentMatch;
            els.teamLeftName.textContent = currentMatch.team1Name || 'TEAM LEFT';
            els.teamRightName.textContent = currentMatch.team2Name || 'TEAM RIGHT';
            
            // Build osuId lookup from draft API
            let osuIdLookup = {};
            try {
                const draftResponse = await fetch(`${PROXY_URL}${encodeURIComponent(DRAFT_API)}`);
                const draftData = await draftResponse.json();
                if (draftData.draft && draftData.draft.teams) {
                    draftData.draft.teams.forEach(team => {
                        if (team.captain) {
                            const name = team.captain.username || team.captain.name || '';
                            if (name) osuIdLookup[name.toLowerCase()] = { osuId: team.captain.osuId || team.captain.id, avatarUrl: team.captain.avatarUrl };
                        }
                        if (team.players) {
                            team.players.forEach(p => {
                                const name = p.username || p.name || '';
                                if (name) osuIdLookup[name.toLowerCase()] = { osuId: p.osuId || p.id, avatarUrl: p.avatarUrl };
                            });
                        }
                    });
                }
            } catch (e) {
                console.error('Error fetching draft API:', e);
            }
            
            // Load teams.json to get logos and player lists
            try {
                const teamsResponse = await fetch('../data/teams.json');
                const teamsData = await teamsResponse.json();
                
                // Find matching teams in teams.json
                const team1 = teamsData.teams.find(t => t.name === currentMatch.team1Name);
                const team2 = teamsData.teams.find(t => t.name === currentMatch.team2Name);
                
                if (team1) {
                    els.teamLeftName.textContent = team1.name;
                    if (els.teamLeftLogo && team1.teamId) {
                        els.teamLeftLogo.src = `../data/logos/${team1.teamId}.png`;
                    }
                    enrichTeamWithOsuIds(team1, osuIdLookup);
                    renderTeamSlots('left', team1);
                }
                if (team2) {
                    els.teamRightName.textContent = team2.name;
                    if (els.teamRightLogo && team2.teamId) {
                        els.teamRightLogo.src = `../data/logos/${team2.teamId}.png`;
                    }
                    enrichTeamWithOsuIds(team2, osuIdLookup);
                    renderTeamSlots('right', team2);
                }
                
                // Update active players after team data loads
                updateActivePlayers();
            } catch (error) {
                console.error('Error loading teams.json during poll:', error);
            }
        }
    }, 2000);
});

// Twitch chat connection
const twitchClient = new tmi.Client({
    channels: ['purlstournaments']
});

twitchClient.connect().catch(console.error);

twitchClient.on('message', (channel, tags, message, self) => {
    if (self) return;
    const chatContainer = document.getElementById('twitch-messages');
    if (!chatContainer) return;
    
    const msgEl = document.createElement('div');
    msgEl.classList.add('twitch-message');
    
    const nameEl = document.createElement('span');
    nameEl.classList.add('twitch-name');
    nameEl.textContent = tags['display-name'] || tags.username;
    
    const textEl = document.createElement('span');
    textEl.classList.add('twitch-text');
    textEl.textContent = message;
    
    msgEl.appendChild(nameEl);
    msgEl.appendChild(textEl);
    chatContainer.appendChild(msgEl);
    
    // Keep only last 20 messages
    while (chatContainer.children.length > 20) {
        chatContainer.removeChild(chatContainer.firstChild);
    }
    
    chatContainer.scrollTop = chatContainer.scrollHeight;
});
