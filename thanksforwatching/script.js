const HOST = '127.0.0.1:24050';
const socket = new ReconnectingWebSocket(`ws://${HOST}/websocket/v2`);

const songArtist = document.getElementById("songartist");
const songTitle = document.getElementById("songtitle");

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

gapi.load('client:auth2', () => {
    gapi.client.init({
        apiKey: 'AIzaSyDyGykbUrhCxV4ZDCtDyWk4Wg0xzzcHzTo', 
        scope: 'https://www.googleapis.com/auth/spreadsheets', 
        discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"]
    }).then(() => {
    });
});

let spreadsheetid = '18OIKzPcidAPFQbrGvmtO3ZpP3L2v7KDRbzOHFgcPA_8';
const dataRange = 'schedule!C9:L13';


fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetid}/values/${dataRange}?key=AIzaSyDyGykbUrhCxV4ZDCtDyWk4Wg0xzzcHzTo`)
.then(res => res.json())
.then(api => {
    if (!api || !Array.isArray(api.values)) return;
    const monthMap = {
        Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
        Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
    };
    const year = new Date().getFullYear();

    const transformed = api.values.map(row => {
        // row example: ["17","(Sun) Sep 28","22:30 ","",...,"Vasion",...,"kingoflim2401"]
        const rawDate = (row[1] || '').replace(/\(.*?\)\s*/g, '').trim(); // "Sep 28"
        const rawTime = (row[2] || '').trim(); // "22:30"
        const player1 = (row[6] || '').trim();
        const player2 = (row[9] || '').trim();

        let month = '';
        let day = '';
        const parts = rawDate.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            const mon = parts[0].replace(/[.,]/g, '');
            month = monthMap[mon] || parseInt(mon) || '';
            day = parseInt(parts[1]) || '';
        }

        // Format date as M/D/YYYY to match existing code expectations (split by '/')
        const date = month && day ? `${month}/${day}/${year}` : '';

        return {
            date,
            time: rawTime,
            player1,
            player2
        };
    }).filter(item => item.date && item.time && (item.player1 || item.player2));

    setTimeout(() => {
        try {
            schedule = transformed;
            console.log('Replaced schedule with transformed Sheets data', schedule);
        } catch (e) {
            window._transformedSheetsSchedule = transformed;
            console.log('Stored transformed schedule on window._transformedSheetsSchedule', transformed);
        }
    }, 0);
})
.catch(err => console.error('Error transforming Sheets data:', err));


let schedule = [];
let seeds = {};


fetch('../seeds.json')
    .then(response => response.json())
    .then(data => {
        seeds = data;
    });


const now = new Date();
const utc8Now = new Date(now.getTime() + 8 * 60 * 60 * 1000);
utc8Now.setHours(utc8Now.getHours());

function findNextMatch() {
    let nextmatch = [];
    let minTime = null;

    for (const match of schedule) {
        const [month, day, year] = match.date.split('/').map(Number);
        const [hour, minute] = match.time.split(':').map(Number);

        const matchTime = new Date(Date.UTC(year, month - 1, day, hour - 8, minute));
        matchTime.setHours(matchTime.getHours() + 8);

        if (matchTime > utc8Now) {
            if (minTime === null || matchTime < minTime) {
                minTime = matchTime;
                nextmatch = [match];
            } else if (matchTime.getTime() === minTime.getTime()) {
                nextmatch.push(match);
            }
        }
    }

    console.log(nextmatch);

    const nextMatchDiv = document.getElementById("nextmatch");
    if (nextmatch.length > 0) {
        nextMatchDiv.innerHTML = ""; 
        nextmatch.forEach((match, idx) => {
            const [month, day, year] = match.date.split('/').map(Number);
            const [hour, minute] = match.time.split(':').map(Number);

            const matchTime = new Date(Date.UTC(year, month - 1, day, hour - 8, minute));
            matchTime.setHours(matchTime.getHours() + 8);
            const matchDiv = document.createElement("div");
            matchDiv.id = `nextmatch-item-${idx}`;
            matchDiv.classList.add('upcoming-match');

            const msDiff = matchTime - utc8Now;
            let timeStr = "";
            if (msDiff <= 0) {
                timeStr = "now";
            } else {
                const hours = msDiff / 3600000;
                if (hours < 1) {
                    const minutes = Math.round(msDiff / 60000);
                    timeStr = `in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
                } else if (hours >= 1 && hours < 1.5) {
                    timeStr = "in about 1 hour";
                } else {
                    const hoursto = Math.round(hours);
                    timeStr = `in about ${hoursto} ${hoursto === 1 ? 'hour' : 'hours'}`;
                }
            }

            matchDiv.innerHTML = `
                <div class="matchheader">
                    <div class="timing">
                        <span class="date">${match.date}</span> <span class="time">${match.time}</span> UTC+8
                    </div>
                    <div class="intime">
                        ${timeStr}
                    </div>
                </div>
                <div class="players">
                    <div class="player" id="player1">
                        <span class="playername">${match.player1}</span>
                        <span class="seed">SEED ${seeds[match.player1]}</span>
                    </div>
                    <div class="player" id="player2">
                        <span class="playername">${match.player2}</span>
                        <span class="seed">SEED ${seeds[match.player2]}</span>
                    </div>
                </div>
            `;
            nextMatchDiv.appendChild(matchDiv);
        });
    } else {
        nextMatchDiv.innerHTML = "No upcoming matches";
    }
}

const scheduleInterval = setInterval(() => {
    if (schedule.length > 0) {
        findNextMatch();
        clearInterval(scheduleInterval);
    }
}, 100);

let tempSong;

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

