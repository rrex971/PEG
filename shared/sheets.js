
const SHEETS_API_KEY = 'AIzaSyDyGykbUrhCxV4ZDCtDyWk4Wg0xzzcHzTo';
const SPREADSHEET_ID = '1LmmhkHvVtr1aI6cgC8U3IvfIz4QvJBaqxzlcJSbO1to';

const PEGSheets = {
    SHEETS_API_KEY: 'AIzaSyDyGykbUrhCxV4ZDCtDyWk4Wg0xzzcHzTo',
    SPREADSHEET_ID: '1LmmhkHvVtr1aI6cgC8U3IvfIz4QvJBaqxzlcJSbO1to',
    schedule: null,
    teams: null,
    
    async fetchSchedule() {
        // Fetch from "schedules" sheet, range H54:AR69 (schedule data)
        const range = 'schedules!H54:AR69';
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.SPREADSHEET_ID}/values/${range}?key=${this.SHEETS_API_KEY}`;
        
        try {
            const res = await fetch(url);
            const data = await res.json();
            
            if (!data || !Array.isArray(data.values)) {
                console.error('No schedule data found in API response');
                throw new Error('No schedule data available');
            }
            
            const rows = data.values;
            console.log(`Total rows in API response: ${rows.length}`);
            
            const scheduleData = {
                round: 'ROUND OF 16',
                matches: []
            };
            
            // Try to find round name
            for (const row of rows) {
                for (const cell of row) {
                    const cellStr = String(cell).trim();
                    if (cellStr && (
                        cellStr.toUpperCase().includes('ROUND OF') ||
                        cellStr.toUpperCase().includes('QUARTERFINALS') ||
                        cellStr.toUpperCase().includes('SEMIFINALS') ||
                        cellStr.toUpperCase().includes('FINALS')
                    )) {
                        scheduleData.round = cellStr;
                        break;
                    }
                }
            }
            
            let matchesFound = 0;
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                
                // Skip empty rows
                if (!row || row.every(cell => String(cell).trim() === '')) {
                    continue;
                }
                
                // Try to find match data in this row
                // Look for combined date+time in column 3 (K) as an indicator
                const dateTimeCell = row.length > 3 ? String(row[3]).trim() : '';
                
                // Only process rows that have a combined DATE @ TIME cell
                if (dateTimeCell && dateTimeCell.includes('@')) {
                    // Match ID is in column 0 (H)
                    const matchId = row.length > 0 ? String(row[0]).trim() : '';
                    
                    // Split combined date+time on @
                    const parts = dateTimeCell.split('@');
                    const date = parts[0] ? parts[0].trim() : '';
                    const time = parts[1] ? parts[1].trim() : '';
                    
                    // Extract team names from columns 19 (AA) and last column (AR)
                    // Team 1 is in column 19 (AA)
                    const team1 = row.length > 19 ? String(row[19]).trim() : '';
                    
                    // Team 2 is in the last column (AR)
                    const team2 = row.length > 0 ? String(row[row.length - 1]).trim() : '';
                    
                    // Only add if we have valid team names
                    // Bracket-style references like "W17", "W18" (winner of match X)
                    // and sub-match IDs like "21P1", "21P2" are kept as-is
                    if (team1 && team2 && team1.length > 2 && team2.length > 2) {
                        scheduleData.matches.push({
                            matchId: matchId,
                            team1: team1,
                            team2: team2,
                            time: time,
                            date: date,
                            stream: '',
                            status: 'upcoming'
                        });
                        
                        matchesFound++;
                    }
                }
            }
            
            console.log(`Total matches found: ${matchesFound}`);
            
            // If no matches found, return empty matches array
            if (scheduleData.matches.length === 0) {
                console.warn('No matches found in schedule data');
            }
            
            this.schedule = scheduleData;
            return scheduleData;
            
        } catch (error) {
            console.error('Error fetching schedule data:', error);
            // Return empty schedule object on API failure
            return { round: '', matches: [] };
        }
    },
    
    async fetchTeams() {
        // Fetch from "teams" sheet, range H11:DL72
        const range = 'teams!H11:DL72';
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.SPREADSHEET_ID}/values/${range}?key=${this.SHEETS_API_KEY}`;
        
        try {
            const res = await fetch(url);
            const data = await res.json();
            
            if (!data || !Array.isArray(data.values)) {
                console.error('No teams data found in API response');
                return { teams: [] };
            }
            
            const rows = data.values;
            const teamsData = { teams: [] };
            
            const teams = [];
            let currentTeam = null;
            let teamIdCounter = 1;
            
            // Header patterns to skip
            const headerPatterns = ['Teams List', 'NAME ::', '⬤', 'PLAYERS /'];
            
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                
                // Skip empty rows
                if (!row || row.every(cell => String(cell).trim() === '')) {
                    continue;
                }
                
                // Skip header rows
                const rowStr = row.map(cell => String(cell)).join(' ');
                if (headerPatterns.some(pattern => rowStr.includes(pattern))) {
                    continue;
                }
                
                // Extract non-empty cells
                const nonEmptyCells = row.filter(cell => String(cell).trim() !== '').map(cell => String(cell).trim());
                
                // Skip rows that are just handles (contain @)
                if (nonEmptyCells.some(cell => cell.includes('@'))) {
                    continue;
                }
                
                // If we have multiple non-empty cells, this might be a team row
                if (nonEmptyCells.length >= 2) {
                    // The first cell is likely the team name
                    const teamName = nonEmptyCells[0];
                    
                    // Check if it looks like a valid team name
                    const isTeamName = (
                        teamName.startsWith('Team') ||
                        (teamName.length > 3 && !teamName.includes('@') && !teamName.includes(' ')) ||
                        ['ngentot is calling', 'Do not Abbreviate CopyPasted', 'Beat Airplane', 'mga lalaking itim'].includes(teamName)
                    );
                    
                    if (isTeamName) {
                        // Save previous team if exists
                        if (currentTeam) {
                            teams.push(currentTeam);
                            teamIdCounter++;
                        }
                        
                        // Start new team
                        // Extract player names (skip the team name)
                        const playerNames = nonEmptyCells.slice(1); // All cells except team name
                        
                        // Filter out any empty or very short names
                        const filteredPlayers = playerNames.filter(p => p.length > 2);
                        
                        currentTeam = {
                            teamId: teamIdCounter,
                            name: teamName,
                            logo: `../data/logos/${teamIdCounter}.png`,
                            captain: filteredPlayers.length > 0 ? filteredPlayers[0] : '',
                            players: filteredPlayers
                        };
                    }
                }
            }
            
            // Add the last team
            if (currentTeam) {
                teams.push(currentTeam);
            }
            
            teamsData.teams = teams;
            
            // If no teams found, return empty teams array
            if (teamsData.teams.length === 0) {
                console.warn('No teams found in API response');
            }
            
            this.teams = teamsData;
            return teamsData;
            
        } catch (error) {
            console.error('Error fetching teams data:', error);
            // Return empty teams object on API failure
            return { teams: [] };
        }
    }
};

// Make PEGSheets available globally
window.PEGSheets = PEGSheets;
