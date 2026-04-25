const API_URL = 'https://purlextragaza-api.vercel.app/api/draft';
const STATS_URL = 'https://purlextragaza-api.vercel.app/api/qualifier-stats';
const PROXY_URL = 'https://corsproxy.io/?';

const ACCENT_COLORS = ['#5a9cb5', '#face68', '#faac68', '#fa6868'];
let lastPickCount = -1;
let qualifiedPlayers = [];
let scrollDirection = 1;
let autoScrollInterval = null;

async function fetchQualifiedPlayers() {
    try {
        const response = await fetch(`${PROXY_URL}${encodeURIComponent(STATS_URL)}`);
        const data = await response.json();
        // Sort players by total score descending to determine seeds
        qualifiedPlayers = data.players.sort((a, b) => b.total - a.total).map((p, i) => ({
            ...p,
            seed: i + 1
        }));
    } catch (error) {
        console.error('Error fetching qualifier stats:', error);
    }
}

function startAutoScroll() {
    const container = document.getElementById('available-players');
    if (autoScrollInterval) clearInterval(autoScrollInterval);
    
    autoScrollInterval = setInterval(() => {
        const maxScroll = container.scrollHeight - container.clientHeight;
        if (maxScroll <= 0) return;

        if (container.scrollTop >= maxScroll - 1) {
            scrollDirection = -1;
        } else if (container.scrollTop <= 1) {
            scrollDirection = 1;
        }

        container.scrollBy({
            top: scrollDirection * 0.5,
            behavior: 'auto'
        });
    }, 30);
}

async function updatePick() {
    try {
        if (qualifiedPlayers.length === 0) {
            await fetchQualifiedPlayers();
        }

        const response = await fetch(`${PROXY_URL}${encodeURIComponent(API_URL)}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        if (!data || !data.draft) return;
        
        const picks = data.draft.picks || [];
        const currentPickIndex = picks.length;
        const currentTeamIndex = data.draft.snakeOrder[currentPickIndex];
        const team = data.draft.teams[currentTeamIndex];
        const teamColor = ACCENT_COLORS[currentTeamIndex % ACCENT_COLORS.length];

        // Update Captain Focus
        const captainFocus = document.getElementById('captain-focus');
        captainFocus.style.setProperty('--team-color', teamColor);
        captainFocus.innerHTML = `
            <div class="team-number">TEAM ${currentTeamIndex + 1}</div>
            <img src="${team.captain.avatarUrl}" class="focus-avatar">
            <div class="focus-name">${team.captain.username}</div>
        `;

        // Update Team Members (7 slots)
        const teamMembers = document.getElementById('team-members');
        let membersHTML = '';
        for (let i = 0; i < 7; i++) {
            const player = team.players[i];
            if (player) {
                membersHTML += `
                    <div class="member-slot filled">
                        <img src="${player.avatarUrl}" class="member-avatar">
                        <span class="member-name">${player.username}</span>
                    </div>
                `;
            } else {
                membersHTML += `<div class="member-slot">${i + 1}</div>`;
            }
        }
        teamMembers.innerHTML = membersHTML;

        // Update Available Players
        const availableContainer = document.getElementById('available-players');
        const pickedUserIds = new Set(data.draft.teams.flatMap(t => t.players.map(p => p.userId)));
        const captainIds = new Set(data.draft.teams.map(t => parseInt(t.captain.osuId)));
        
        // Filter out captains first, then take the top 112
        const eligiblePool = qualifiedPlayers
            .filter(player => !captainIds.has(player.userId))
            .slice(0, 112);
        
        let availableHTML = '';
        eligiblePool.forEach(player => {
            const isPicked = pickedUserIds.has(player.userId);
            if (!isPicked) {
                availableHTML += `
                    <div class="available-card" id="player-${player.userId}">
                        <img src="${player.avatarUrl}" class="available-avatar">
                        <div class="player-info">
                            <div class="player-name">${player.username}</div>
                        </div>
                        <div class="player-seed-badge">#${player.seed}</div>
                    </div>
                `;
            }
        });
        availableContainer.innerHTML = availableHTML;

        // Flash highlight if a new pick happened
        if (lastPickCount !== -1 && currentPickIndex > lastPickCount) {
            const lastPicked = picks[picks.length - 1];
            // Since the player is removed from the available list, we can't scroll to them there.
            // However, we can scroll to the team member slot that was just filled.
            const filledSlots = document.querySelectorAll('.member-slot.filled');
            const lastSlot = filledSlots[filledSlots.length - 1];
            if (lastSlot) {
                lastSlot.scrollIntoView({ behavior: 'smooth', block: 'center' });
                lastSlot.classList.add('flash-highlight');
            }
        }
        lastPickCount = currentPickIndex;

    } catch (error) {
        console.error('Error fetching draft data:', error);
    }
}

setInterval(updatePick, 2000);
updatePick();