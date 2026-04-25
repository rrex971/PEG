const API_URL = 'https://purlextragaza-api.vercel.app/api/draft';
const PROXY_URL = 'https://corsproxy.io/?';

const ACCENT_COLORS = ['#5a9cb5', '#face68', '#faac68', '#fa6868'];

async function updateOverview() {
    try {
        // Add timestamp to bypass proxy cache
        const response = await fetch(`${PROXY_URL}${encodeURIComponent(API_URL)}?t=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        if (!data || !data.draft) return;
        
        const grid = document.getElementById('teams-grid');
        const indicator = document.getElementById('picking-indicator');
        
        // Clear existing rows but keep the indicator
        const rows = grid.querySelectorAll('.team-row');
        rows.forEach(r => r.remove());

        const currentPickIndex = data.draft.picks.length;
        const currentTeamIndex = data.draft.snakeOrder[currentPickIndex];

        data.draft.teams.forEach((team, index) => {
            const teamColor = ACCENT_COLORS[index % ACCENT_COLORS.length];
            const row = document.createElement('div');
            row.className = 'team-row';
            if (index === currentTeamIndex) {
                row.classList.add('picking');
                // Position indicator
                indicator.classList.add('visible');
                indicator.style.top = `${index * (48 + 6)}px`; // height + gap
            }
            row.style.setProperty('--team-color', teamColor);

            // Captain Cell
            let rowHTML = `
                <div class="captain-cell">
                    <img src="${team.captain.avatarUrl}" class="captain-avatar">
                    <span>${team.captain.username}</span>
                </div>
            `;

            // Player Cells (8 slots total)
            for (let i = 0; i < 8; i++) {
                const player = team.players[i];
                if (player) {
                    rowHTML += `
                        <div class="player-cell filled">
                            <img src="${player.avatarUrl}" class="player-avatar">
                            <span>${player.username}</span>
                        </div>
                    `;
                } else {
                    rowHTML += `<div class="player-cell"></div>`;
                }
            }

            row.innerHTML = rowHTML;
            grid.appendChild(row);
        });
    } catch (error) {
        console.error('Error fetching draft data:', error);
    }
}

setInterval(updateOverview, 2000);
updateOverview();