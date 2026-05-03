const HOST = '127.0.0.1:24050';
let socket;
let songArtist;
let songTitle;

// Truncate team name to max length with ellipsis
function truncateName(name, maxLen = 32) {
    if (!name) return '';
    return name.length > maxLen ? name.substring(0, maxLen) + '…' : name;
}

// Configuration
let CONFIG = {};
fetch('../config.json')
    .then(r => r.json())
    .then(data => { CONFIG = data; })
    .catch(() => {
        CONFIG = { maxPoints: 4 };
    });

const setBubbleText = (element, text) => {
    const value = text || "";
    element.textContent = value;
    element.dataset.text = value;
};

const updateOverflowAnimation = (element) => {
    element.classList.remove('overflow-animate');
    element.style.setProperty('--overflow-distance', '0px');

    const distance = element.parentElement.clientWidth - element.scrollWidth;
    if (distance < 0) {
        element.style.setProperty('--overflow-distance', `${distance}px`);
        element.classList.add('overflow-animate');
    }
};

// Load schedule data from Google Sheets API
let scheduleData = null;
let teamLogoMap = {};

// Initialize PEGSheets and fetch schedule
async function initSchedule() {
    try {
        // Load teams data for logos
        try {
            const teamsResponse = await fetch('../data/teams.json');
            const teamsData = await teamsResponse.json();
            
            // Create team logo map
            teamLogoMap = {};
            teamsData.teams.forEach(team => {
                teamLogoMap[team.name] = `../data/logos/${team.teamId}.png`;
            });
        } catch (teamsError) {
            console.error('Error loading teams data:', teamsError);
        }
        
        // Try to fetch schedule from Google Sheets API
        let data;
        try {
            data = await PEGSheets.fetchSchedule();
            
            // If no matches found in sheets, fall back to local file
            if (!data || !data.matches || data.matches.length === 0) {
                console.log('No matches from Sheets, falling back to local file...');
                const response = await fetch('../data/schedule.json');
                data = await response.json();
            }
        } catch (sheetsError) {
            console.error('Error fetching from Sheets, falling back to local file:', sheetsError);
            const response = await fetch('../data/schedule.json');
            data = await response.json();
        }
        
        scheduleData = data;
        console.log('Loaded schedule data:', scheduleData);
        renderNextMatch();
    } catch (error) {
        console.error('Error loading schedule:', error);
    }
}

// Parse date and time strings into a Date object (UTC+8 Singapore Time)
function parseMatchDateTime(dateStr, timeStr) {
    const now = new Date();
    const year = now.getFullYear();
    
    // Parse date like "(Sat) May 2" or "May 2"
    const dateClean = dateStr.replace(/\(.*?\)\s*/g, '').trim();
    const parts = dateClean.split(/\s+/);
    
    if (parts.length < 2) return null;
    
    const monthName = parts[0];
    const day = parseInt(parts[1]);
    
    // Month mapping
    const monthMap = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    
    let month = monthMap[monthName];
    if (month === undefined) {
        // Try full month name
        const fullMonthMap = {
            'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
            'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
        };
        month = fullMonthMap[monthName];
    }
    
    if (month === undefined) return null;
    
    let hours = 0, minutes = 0;
    
    if (timeStr.includes('AM') || timeStr.includes('PM')) {
        const timeClean = timeStr.replace(/[AP]M/i, '').trim();
        const timeParts = timeClean.split(':');
        hours = parseInt(timeParts[0]) || 0;
        minutes = parseInt(timeParts[1]) || 0;
        
        if (timeStr.toUpperCase().includes('PM') && hours !== 12) {
            hours += 12;
        } else if (timeStr.toUpperCase().includes('AM') && hours === 12) {
            hours = 0;
        }
    } else {
        const timeParts = timeStr.split(':');
        hours = parseInt(timeParts[0]) || 0;
        minutes = parseInt(timeParts[1]) || 0;
    }
    
    // Create date object in UTC+8 (Singapore Time)
    // Use Date.UTC to create a UTC timestamp, then subtract 8 hours to convert from UTC+8 to UTC
    const utcTimestamp = Date.UTC(year, month, day, hours, minutes);
    const matchDate = new Date(utcTimestamp - (8 * 60 * 60 * 1000));
    
    // If the date is in the past, assume it's for next year
    if (matchDate < now) {
        matchDate.setFullYear(year + 1);
    }
    
    return matchDate;
}

// Get match status based on current time
function getMatchStatus(matchDate, matchTime) {
    const now = new Date();
    const matchDateTime = parseMatchDateTime(matchDate, matchTime);
    
    if (!matchDateTime) return 'upcoming';
    
    const diffMs = matchDateTime - now;
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffHours > 1) return 'upcoming';
    if (diffHours >= -1) return 'ongoing';
    return 'finished';
}

// Format countdown time
function formatCountdown(matchDate, matchTime) {
    const matchDateTime = parseMatchDateTime(matchDate, matchTime);
    if (!matchDateTime) return '';
    
    const now = new Date();
    const diffMs = matchDateTime - now;
    
    if (diffMs <= 0) return 'now';
    
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffMinutes = diffMs / (1000 * 60);
    
    if (diffMinutes < 60) {
        const minutes = Math.round(diffMinutes);
        return `in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    } else if (diffHours < 1.5) {
        return 'in about 1 hour';
    } else {
        const hours = Math.round(diffHours);
        return `in about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }
}

// Render the next match
function renderNextMatch() {
    if (!scheduleData || !scheduleData.matches || scheduleData.matches.length === 0) {
        document.getElementById('nextmatch').innerHTML = '<div style="padding: 20px; text-align: center; color: var(--peg-ink);">No upcoming matches</div>';
        return;
    }
    
    // Find the next upcoming match
    const now = new Date();
    let nextMatch = null;
    let minDiff = Infinity;
    
    for (const match of scheduleData.matches) {
        const matchDateTime = parseMatchDateTime(match.date, match.time);
        if (!matchDateTime) continue;
        
        const diffMs = matchDateTime - now;
        if (diffMs > 0 && diffMs < minDiff) {
            minDiff = diffMs;
            nextMatch = match;
        }
    }
    
    // If no future match, just take the first one
    if (!nextMatch && scheduleData.matches.length > 0) {
        nextMatch = scheduleData.matches[0];
    }
    
    if (!nextMatch) {
        document.getElementById('nextmatch').innerHTML = '<div style="padding: 20px; text-align: center; color: var(--peg-ink);">No upcoming matches</div>';
        return;
    }
    
    const countdown = formatCountdown(nextMatch.date, nextMatch.time);
    
    // Get team names (handle different formats)
    const team1 = nextMatch.team1 || 'Team 1';
    const team2 = truncateName(nextMatch.team2 || 'Team 2');
    
    // Get team logos
    const logo1 = teamLogoMap[team1] || '';
    const logo2 = teamLogoMap[nextMatch.team2] || '';
    
    // Format date for display
    const dateDisplay = nextMatch.date ? nextMatch.date.replace(/\(.*?\)\s*/g, '').trim() : '';
    const timeDisplay = nextMatch.time || '';
    
    const nextMatchDiv = document.getElementById('nextmatch');
    nextMatchDiv.innerHTML = `
        <div class="matchheader">
            <div class="timing">
                <span class="date">${escapeHtml(dateDisplay)}</span>
                <span class="time">${escapeHtml(timeDisplay)}</span> UTC+8
            </div>
            <div class="intime">${escapeHtml(countdown)}</div>
        </div>
        <div class="players">
            <div class="player" id="player1">
                <img class="team-logo" src="${logo1}" alt="" />
                <span class="playername">${escapeHtml(truncateName(team1))}</span>
            </div>
            <div class="player" id="player2">
                <img class="team-logo" src="${logo2}" alt="" />
                <span class="playername">${escapeHtml(truncateName(team2))}</span>
            </div>
        </div>
    `;
}

// Helper function to escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Truncate team names to 32 characters
function truncateName(name, maxLen = 32) {
    if (!name) return '';
    return name.length > maxLen ? name.substring(0, maxLen) + '...' : name;
}

let tempSong;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Initialize socket and DOM elements after DOM is loaded
    socket = new ReconnectingWebSocket(`ws://${HOST}/websocket/v2`);
    songArtist = document.getElementById("songartist");
    songTitle = document.getElementById("songtitle");
    
    // Setup socket event handlers
    socket.onopen = () => {
        console.log("Successfully Connected");
    };

    socket.onclose = event => {
        console.log("Socket Closed Connection: ", event);
        socket.send("Client Closed!")
    };

    socket.onerror = error => {
        console.log("Socket Error: ", error);
    };

    socket.onmessage = event => {
        let data = JSON.parse(event.data);
        const beatmap = data.beatmap || {};
        const newArtist = beatmap.artist || "";
        const newTitle = beatmap.title || "";
        const combinedSong = `${newArtist}\n${newTitle}`;

        if (tempSong !== combinedSong) {
            tempSong = combinedSong;
            setBubbleText(songArtist, newArtist);
            setBubbleText(songTitle, newTitle);

            setTimeout(() => {
                updateOverflowAnimation(songArtist);
                updateOverflowAnimation(songTitle);
            }, 0);
        }
    }
    
    initSchedule();
});
