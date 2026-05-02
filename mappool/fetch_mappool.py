#!/usr/bin/env python3
"""
Script to fetch beatmap metadata from osu! API and populate mappool_full.json
"""

import json
import time
import sys
from osu import AuthHandler, Client, Scope

# Configuration
CLIENT_ID = 20810
CLIENT_SECRET = "tNVBdaVDZL3naL2fZDUFrRQOwhFo8aGgg9bLB0Es"
MAPPPOOL_JSON_PATH = "../showcase/mappool.json"
OUTPUT_PATH = "mappool_full.json"

# Rate limiting delay (seconds)
REQUEST_DELAY = 0.2

def authenticate():
    """Authenticate with osu! API"""
    print("Authenticating with osu! API...")
    auth = AuthHandler(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        redirect_url=None,
        scope=Scope("public")
    )
    auth.get_auth_token()
    client = Client(auth)
    print("Authentication successful!")
    return client

def fetch_beatmap(client, beatmap_id):
    """Fetch beatmap metadata from osu! API"""
    try:
        beatmap = client.get_beatmap(beatmap_id)
        return {
            "artist": beatmap.beatmapset.artist,
            "title": beatmap.beatmapset.title,
            "version": beatmap.version,
            "creator": beatmap.beatmapset.creator,
            "bg": f"https://assets.ppy.sh/beatmaps/{beatmap.beatmapset_id}/covers/cover@2x.jpg"
        }
    except Exception as e:
        print(f"  Warning: Failed to fetch beatmap {beatmap_id}: {e}")
        return None

def main():
    """Main function to fetch and populate mappool data"""
    print("=" * 60)
    print("osu! Mappool Data Fetcher")
    print("=" * 60)
    
    # Read existing mappool.json
    print(f"\nReading {MAPPPOOL_JSON_PATH}...")
    try:
        with open(MAPPPOOL_JSON_PATH, 'r') as f:
            mappool_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: {MAPPPOOL_JSON_PATH} not found!")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in {MAPPPOOL_JSON_PATH}: {e}")
        sys.exit(1)
    
    # Authenticate with osu! API
    try:
        client = authenticate()
    except Exception as e:
        print(f"Error: Failed to authenticate with osu! API: {e}")
        sys.exit(1)
    
    # Prepare output structure
    output = {
        "round": mappool_data.get("round", "ROUND OF 16")
    }
    
    # Process each entry in the mappool
    print(f"\nFetching beatmap data...")
    fetched_count = 0
    error_count = 0
    
    for key, value in mappool_data.items():
        if key == "round":
            continue
        
        print(f"\nProcessing: {key}")
        
        # Check if this is a numeric beatmap ID (even if marked custom)
        try:
            beatmap_id = int(key)
            print(f"  Fetching beatmap {beatmap_id}...")
            
            beatmap_data = fetch_beatmap(client, beatmap_id)
            
            if beatmap_data:
                # Get pick value - handle both string and dict formats
                pick_value = value if isinstance(value, str) else value.get("pick", "")
                is_custom = isinstance(value, dict) and value.get("custom", False)
                
                output[key] = {
                    "pick": pick_value,
                    **beatmap_data
                }
                if is_custom:
                    output[key]["custom"] = True
                fetched_count += 1
                print(f"  ✓ Success: {beatmap_data['title']} - {beatmap_data['version']}")
            else:
                error_count += 1
                # Still add entry with placeholder data
                pick_value = value if isinstance(value, str) else value.get("pick", "")
                is_custom = isinstance(value, dict) and value.get("custom", False)
                
                output[key] = {
                    "pick": pick_value,
                    "artist": "TBD",
                    "title": "TBD",
                    "version": "TBD",
                    "creator": "TBD",
                    "bg": ""
                }
                if is_custom:
                    output[key]["custom"] = True
        except ValueError:
            # Non-numeric key - check if it's a custom entry with data
            if isinstance(value, dict) and value.get("custom"):
                print(f"  Custom entry: {value['pick']}")
                output[key] = {
                    "pick": value["pick"],
                    "custom": True,
                    "artist": "TBD",
                    "title": "TBD",
                    "version": "TBD",
                    "creator": "TBD",
                    "bg": ""
                }
            else:
                print(f"  Warning: Invalid beatmap ID format: {key}")
                error_count += 1
        except Exception as e:
            print(f"  Error processing {key}: {e}")
            error_count += 1
        
        # Rate limiting delay
        time.sleep(REQUEST_DELAY)
    
    # Write output to file
    print(f"\nWriting output to {OUTPUT_PATH}...")
    try:
        with open(OUTPUT_PATH, 'w') as f:
            json.dump(output, f, indent=2)
        print(f"✓ Successfully wrote {OUTPUT_PATH}")
    except Exception as e:
        print(f"Error: Failed to write output file: {e}")
        sys.exit(1)
    
    # Print summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total entries processed: {len(output) - 1}")  # -1 for 'round' key
    print(f"Successfully fetched: {fetched_count}")
    print(f"Errors/missing: {error_count}")
    print(f"Output file: {OUTPUT_PATH}")
    print("=" * 60)
    
    return 0 if error_count == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
