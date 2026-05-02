// Schedule Screen JavaScript

document.addEventListener('DOMContentLoaded', () => {
    loadSchedule();
});

// Team logo map
let teamLogoMap = {};

async function loadSchedule() {
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
        
        // Update round title
        document.getElementById('round-title').textContent = data.round || 'SCHEDULE';
        
        // Render match cards
        const matchesGrid = document.getElementById('matches-grid');
        matchesGrid.innerHTML = '';
        
        // Process matches with status and scores
        const processedMatches = await processMatchesWithScores(data.matches);
        
        processedMatches.forEach((match) => {
            const matchCard = createMatchCard(match);
            matchesGrid.appendChild(matchCard);
        });
    } catch (error) {
        console.error('Error loading schedule:', error);
        // Show error message instead of placeholder data
        const matchesGrid = document.getElementById('matches-grid');
        matchesGrid.innerHTML = '<div class="error-message">Schedule data not available</div>';
    }
}

// Process matches to add status and scores
async function processMatchesWithScores(matches) {
    const processed = [];
    
    for (const match of matches) {
        const status = getMatchStatus(match.date, match.time);
        const processedMatch = { ...match, status };
        
        // If match is finished, try to get scores
        if (status === 'finished') {
            const scores = await getMatchScores(match);
            if (scores) {
                processedMatch.score1 = scores.score1;
                processedMatch.score2 = scores.score2;
            }
        }
        
        processed.push(processedMatch);
    }
    
    return processed;
}

// Get match scores from Google Sheets
async function getMatchScores(match) {
    try {
        // Fetch scores from AH106:AK113 range
        const range = 'schedules!AH106:AK113';
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${PEGSheets.SPREADSHEET_ID}/values/${range}?key=${PEGSheets.SHEETS_API_KEY}`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data || !Array.isArray(data.values)) {
            return null;
        }
        
        // Parse scores from merged cells
        // AHxxx:AIxxx = team1 score, AJxxx:AKxxx = team2 score
        const rows = data.values;
        
        // Find the row that matches this match
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.length >= 4) {
                const team1Score = parseInt(row[0]) || 0; // AH column
                const team2Score = parseInt(row[2]) || 0; // AJ column
                
                // Check if this row has valid scores
                if (team1Score > 0 || team2Score > 0) {
                    return {
                        score1: team1Score,
                        score2: team2Score
                    };
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error fetching scores:', error);
        return null;
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
    
    // Parse time like "9:30PM" or "22:30"
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
    // Use Date.UTC to create a UTC timestamp, then add 8 hours
    const utcTimestamp = Date.UTC(year, month, day, hours, minutes);
    const matchDate = new Date(utcTimestamp + (8 * 60 * 60 * 1000));
    
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

// Parse date string to UTC+8 Date object
function parseToUTC8(dateStr) {
    // Expected format: "May 2 9:30PM" or "May 2, 2026 9:30PM"
    // Remove any timezone suffix
    const cleanStr = dateStr.replace(/\s*UTC[+-]\d+:?\d*/i, '').trim();
    
    // Parse as if it's UTC+8
    const parsed = new Date(cleanStr);
    if (isNaN(parsed.getTime())) return null;
    
    // The parsed date is in local time. We need to treat it as UTC+8.
    // Get the UTC timestamp, then adjust for UTC+8
    const utcMs = parsed.getTime() + (parsed.getTimezoneOffset() * 60000);
    // UTC+8 means the time is 8 hours ahead of UTC
    const sgtMs = utcMs - (8 * 3600000);
    return new Date(sgtMs);
}

// Get time until match (countdown)
function getTimeUntilMatch(dateStr) {
    const matchDate = parseToUTC8(dateStr);
    if (!matchDate) return '';
    
    const now = new Date();
    const diff = matchDate.getTime() - now.getTime();
    
    if (diff < 0) return 'LIVE / PASSED';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function createMatchCard(match) {
    const card = document.createElement('div');
    card.className = `match-card ${match.status || 'upcoming'}`;
    
    // Format date for display
    const dateDisplay = match.date ? match.date.replace(/\(.*?\)\s*/g, '').trim() : '';
    const timeDisplay = match.time || '';
    
    // Get team names
    const team1 = match.team1 || 'Team 1';
    const team2 = match.team2 || 'Team 2';
    
    // Get team logos
    const logo1 = teamLogoMap[team1] || '';
    const logo2 = teamLogoMap[team2] || '';
    
    // Build card content with time on top row
    const countdown = getTimeUntilMatch(match.date);
    let cardContent = `
        <div class="match-time-row">
            <span class="match-time">${escapeHtml(dateDisplay)} ${escapeHtml(timeDisplay)}</span>
            <span class="countdown">${escapeHtml(countdown)}</span>
        </div>
        <div class="teams">
            <img class="team-logo" src="${logo1}" alt="" />
            <span class="team-name">${escapeHtml(team1)}</span>
            <span class="vs-text">vs</span>
            <span class="team-name">${escapeHtml(team2)}</span>
            <img class="team-logo" src="${logo2}" alt="" />
        </div>
    `;
    
    // Add scores for finished matches
    if (match.status === 'finished' && (match.score1 !== undefined || match.score2 !== undefined)) {
        cardContent += `
            <div class="match-score">
                <span class="score team1">${match.score1 || 0}</span>
                <span class="score-separator">-</span>
                <span class="score team2">${match.score2 || 0}</span>
            </div>
        `;
    }
    
    card.innerHTML = cardContent;
    
    return card;
}

// Helper function to escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

