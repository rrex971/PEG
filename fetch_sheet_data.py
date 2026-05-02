#!/usr/bin/env python3
"""
Fetch schedule and team data from Google Sheets spreadsheet using Google Sheets API v4.
"""

import requests
import json
import os
from typing import List, Dict, Any

# Spreadsheet ID from the URL
SPREADSHEET_ID = "1LmmhkHvVtr1aI6cgC8U3IvfIz4QvJBaqxzlcJSbO1to"

# API Key from SAT5/thanksforwatching/script.js
API_KEY = "AIzaSyDyGykbUrhCxV4ZDCtDyWk4Wg0xzzcHzTo"

# Known sheet GIDs (from URL parameters)
SCHEDULE_GID = "312897722"  # schedules tab
TEAMS_GID = "1842602427"  # teams tab

def fetch_sheet_data(sheet_name: str, range_notation: str) -> Dict[str, Any]:
    """
    Fetch data from Google Sheets using the Sheets API v4.
    
    Args:
        sheet_name: Name of the sheet/tab (e.g., "schedules", "teams")
        range_notation: Range notation (e.g., "A1:Z100")
    
    Returns:
        Dict with 'values' key containing the data
    """
    # Construct the range in the format "sheet_name!range"
    data_range = f"{sheet_name}!{range_notation}"
    
    # Use the Sheets API v4 endpoint
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/{data_range}"
    
    # Add API key as query parameter
    params = {"key": API_KEY}
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data from Google Sheets API: {e}")
        raise

def parse_schedule(api_data: Dict[str, Any]) -> Dict[str, Any]:
    """Parse the schedule data from the API response."""
    schedule_data = {
        "round": "ROUND OF 16",
        "matches": []
    }
    
    if not api_data or "values" not in api_data or not api_data["values"]:
        print("No schedule data found in API response")
        return schedule_data
    
    rows = api_data["values"]
    print(f"Total rows in API response: {len(rows)}")
    
    # Try to find round name - look for "Round of 16", "Quarterfinals", etc.
    for row in rows:
        for cell in row:
            cell_str = str(cell).strip()
            if cell_str and ("ROUND OF" in cell_str.upper() or
                           "QUARTERFINALS" in cell_str.upper() or
                           "SEMIFINALS" in cell_str.upper() or
                           "FINALS" in cell_str.upper()):
                schedule_data["round"] = cell_str
                break
    
    # Parse matches - look for rows with match data
    # Based on the API response, the data structure is:
    # Column 7: Match ID
    # Column 10: Date/Time
    # Column 26: Team 1
    # Column 37: Team 2 (last column)
    matches_found = 0
    for i, row in enumerate(rows):
        # Skip empty rows
        if not row or all(str(cell).strip() == "" for cell in row):
            continue
        
        # Check if this row has match data (has match ID in column 7)
        if len(row) >= 8 and row[7] and str(row[7]).strip():
            match_id = str(row[7]).strip()
            
            # Check if it's a valid match ID (numeric)
            if match_id.isdigit():
                # Extract date/time from column 10
                date_time = str(row[10]).strip() if len(row) > 10 else ""
                
                # Extract team names from columns 26 and 37 (last column)
                # Based on the row data, team2 is at the last column
                team1 = str(row[26]).strip() if len(row) > 26 else ""
                team2 = str(row[-1]).strip() if len(row) > 0 else ""
                
                # Debug: Print the actual row data to see where team2 is
                if i >= 96 and i <= 103:
                    print(f"Row {i} data: {row}")
                    print(f"Row {i}: length={len(row)}, Match ID={match_id}")
                    print(f"Row {i}: col26={row[26] if len(row) > 26 else 'N/A'}, last_col={row[-1] if len(row) > 0 else 'N/A'}")
                
                print(f"Row {i}: Match ID={match_id}, Team1={team1}, Team2={team2}, DateTime={date_time}")
                
                # Only add if we have valid team names
                if team1 and team2 and len(team1) > 2 and len(team2) > 2:
                    # Parse date and time from the date_time string
                    # Format: "(Sat) May 2 @ 11:00PM"
                    time = ""
                    date = ""
                    
                    if "@" in date_time:
                        parts = date_time.split("@")
                        if len(parts) >= 2:
                            date = parts[0].strip()
                            time = parts[1].strip()
                    
                    match = {
                        "team1": team1,
                        "team2": team2,
                        "time": time,
                        "date": date,
                        "stream": "",
                        "status": "upcoming"
                    }
                    
                    schedule_data["matches"].append(match)
                    matches_found += 1
    
    print(f"Total matches found: {matches_found}")
    
    # If no matches found, create placeholder data
    if not schedule_data["matches"]:
        schedule_data["matches"] = [
            {
                "team1": "Team Alpha",
                "team2": "Team Beta",
                "time": "3:00 PM",
                "date": "",
                "stream": "Main Stream",
                "status": "upcoming"
            },
            {
                "team1": "Team Gamma",
                "team2": "Team Delta",
                "time": "4:30 PM",
                "date": "",
                "stream": "Main Stream",
                "status": "upcoming"
            }
        ]
    
    return schedule_data

def parse_teams(api_data: Dict[str, Any]) -> Dict[str, Any]:
    """Parse the teams data from the API response."""
    teams_data = {"teams": []}
    
    if not api_data or "values" not in api_data or not api_data["values"]:
        print("No teams data found in API response")
        return teams_data
    
    rows = api_data["values"]
    
    # Parse team data from rows
    # The teams.csv structure has:
    # - Header rows (1-10) with "Teams List", "NAME ::", decorative characters
    # - Team rows with team name followed by player names
    # - Player handle rows with @ symbols
    # - Empty rows separating teams
    
    # Skip header rows and identify team rows
    # Team rows contain team names like "Team 15", "Team 14", "ngentot is calling", etc.
    # and are followed by player names in the same row
    
    teams = []
    current_team = None
    
    # Header rows to skip (0-9, 0-indexed)
    header_patterns = ["Teams List", "NAME ::", "⬤", "PLAYERS /"]
    
    for i, row in enumerate(rows):
        # Skip empty rows
        if not row or all(str(cell).strip() == "" for cell in row):
            continue
        
        # Skip header rows
        row_str = " ".join(str(cell) for cell in row)
        if any(pattern in row_str for pattern in header_patterns):
            continue
        
        # Check if this is a team row (contains a team name)
        # Team rows have team name followed by player names
        # We can identify them by checking if they have multiple non-empty cells
        # and don't contain @ symbols (those are handle rows)
        
        # Extract non-empty cells
        non_empty_cells = [str(cell).strip() for cell in row if str(cell).strip()]
        
        # Skip rows that are just handles (contain @)
        if any("@" in cell for cell in non_empty_cells):
            continue
        
        # If we have multiple non-empty cells, this might be a team row
        if len(non_empty_cells) >= 2:
            # The first cell is likely the team name
            team_name = non_empty_cells[0]
            
            # Check if it looks like a valid team name (not just a player name)
            # Team names often start with "Team" or are unique identifiers
            is_team_name = (
                team_name.startswith("Team") or
                len(team_name) > 3 and not any(c in team_name for c in ["@", " "]) or
                team_name in ["ngentot is calling", "Do not Abbreviate CopyPasted",
                             "Beat Airplane", "mga lalaking itim"]
            )
            
            if is_team_name:
                # Save previous team if exists
                if current_team:
                    teams.append(current_team)
                
                # Start new team
                # Extract player names (skip the team name)
                player_names = non_empty_cells[1:]  # All cells except team name
                
                # Filter out any empty or very short names
                player_names = [p for p in player_names if len(p) > 2]
                
                current_team = {
                    "name": team_name,
                    "logo": "",
                    "players": player_names
                }
    
    # Add the last team
    if current_team:
        teams.append(current_team)
    
    teams_data["teams"] = teams
    
    # If no teams found, create placeholder data
    if not teams_data["teams"]:
        teams_data["teams"] = [
            {
                "name": "Team Alpha",
                "logo": "",
                "players": ["Player1", "Player2", "Player3", "Player4", "Player5"]
            },
            {
                "name": "Team Beta",
                "logo": "",
                "players": ["Player6", "Player7", "Player8", "Player9", "Player10"]
            }
        ]
    
    return teams_data

def main():
    """Main function to fetch and parse data."""
    print("Fetching Google Sheets data using Sheets API v4...")
    
    # Create data directory if it doesn't exist
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(data_dir, exist_ok=True)
    
    try:
        # Try to fetch schedule data - try different ranges
        print("Fetching schedule data...")
        
        # Try to get a range that might contain actual match data
        # Let's try to get data after the headers
        try:
            # Try to get data from row 10 onwards (after headers)
            schedule_api_data = fetch_sheet_data("schedules", "A10:BR200")
            print(f"Schedule API response (A10:BR200): {schedule_api_data}")
        except Exception as e:
            print(f"Error fetching A10:BR200: {e}")
            # Fallback to the full sheet
            schedule_api_data = fetch_sheet_data("schedules", "A1:BR119")
            print(f"Schedule API response (A1:BR119): {schedule_api_data}")
        
        schedule_data = parse_schedule(schedule_api_data)
        
        # Save schedule data
        schedule_path = os.path.join(data_dir, "schedule.json")
        with open(schedule_path, "w", encoding="utf-8") as f:
            json.dump(schedule_data, f, indent=2, ensure_ascii=False)
        print(f"Schedule data saved to {schedule_path}")
        
    except Exception as e:
        print(f"Error fetching schedule data: {e}")
        print("Creating placeholder schedule data...")
        
        # Create placeholder schedule data
        schedule_data = {
            "round": "ROUND OF 16",
            "matches": [
                {
                    "team1": "Team Alpha",
                    "team2": "Team Beta",
                    "time": "3:00 PM",
                    "date": "",
                    "stream": "Main Stream",
                    "status": "upcoming"
                },
                {
                    "team1": "Team Gamma",
                    "team2": "Team Delta",
                    "time": "4:30 PM",
                    "date": "",
                    "stream": "Main Stream",
                    "status": "upcoming"
                }
            ]
        }
        
        schedule_path = os.path.join(data_dir, "schedule.json")
        with open(schedule_path, "w", encoding="utf-8") as f:
            json.dump(schedule_data, f, indent=2, ensure_ascii=False)
        print(f"Placeholder schedule data saved to {schedule_path}")
    
    try:
        # Try to fetch teams data from teams.csv (cleaner source)
        print("Fetching teams data from teams.csv...")
        
        # Read teams.csv file
        teams_csv_path = os.path.join(os.path.dirname(__file__), "teams.csv")
        if os.path.exists(teams_csv_path):
            # Parse CSV manually
            import csv
            with open(teams_csv_path, 'r', encoding='utf-8') as f:
                reader = csv.reader(f)
                rows = list(reader)
            
            # Create API-like data structure
            teams_api_data = {"values": rows}
            teams_data = parse_teams(teams_api_data)
        else:
            # Fallback to API if CSV doesn't exist
            print("teams.csv not found, trying API...")
            teams_api_data = fetch_sheet_data("teams", "A1:Z100")
            print(f"Teams API response: {teams_api_data}")
            teams_data = parse_teams(teams_api_data)
        
        # Save teams data
        teams_path = os.path.join(data_dir, "teams.json")
        with open(teams_path, "w", encoding="utf-8") as f:
            json.dump(teams_data, f, indent=2, ensure_ascii=False)
        print(f"Teams data saved to {teams_path}")
        
    except Exception as e:
        print(f"Error fetching teams data: {e}")
        print("Creating placeholder teams data...")
        
        # Create placeholder teams data
        teams_data = {
            "teams": [
                {
                    "name": "Team Alpha",
                    "logo": "",
                    "players": ["Player1", "Player2", "Player3", "Player4", "Player5"]
                },
                {
                    "name": "Team Beta",
                    "logo": "",
                    "players": ["Player6", "Player7", "Player8", "Player9", "Player10"]
                }
            ]
        }
        
        teams_path = os.path.join(data_dir, "teams.json")
        with open(teams_path, "w", encoding="utf-8") as f:
            json.dump(teams_data, f, indent=2, ensure_ascii=False)
        print(f"Placeholder teams data saved to {teams_path}")
    
    print("Done!")

if __name__ == "__main__":
    main()
