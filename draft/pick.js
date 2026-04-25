const API_URL = 'https://purlextragaza-api.vercel.app/api/draft';

async function updatePick() {
    const response = await fetch(API_URL);
    const data = await response.json();
    const currentTeamIndex = data.draft.snakeOrder[data.draft.picks.length];
    const team = data.draft.teams[currentTeamIndex];

    const captainFocus = document.getElementById('captain-focus');
    captainFocus.innerHTML = `
        <img src="${team.captain.avatarUrl}" class="captain-avatar">
        <h2>${team.captain.username}</h2>
    `;

    const teamMembers = document.getElementById('team-members');
    teamMembers.innerHTML = team.players.map(p => `<span>${p.username}</span>`).join('');
}

setInterval(updatePick, 2000);
updatePick();