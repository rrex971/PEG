const HOST = '127.0.0.1:24050';
const socket = new ReconnectingWebSocket(`ws://${HOST}/websocket/v2`);

const title = document.getElementById("title");
const artist = document.getElementById("artist");
const mapper = document.getElementById("mapper");
const difficulty = document.getElementById("difficulty");
const mapBg = document.getElementById("map-bg");
const pickBadge = document.getElementById("pick-badge");
const roundEl = document.getElementById("round");

const timeFormatter = (value) => {
    const seconds = Math.round(value);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

const smartDecimalFormatter = (value) => {
    return value.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
};

const duration = 0.5;

const length = new CountUp("length", 0, 0, 0, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: timeFormatter });
const cs = new CountUp("csval", 0, 0, 2, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const ar = new CountUp("arval", 0, 0, 2, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const od = new CountUp("odval", 0, 0, 2, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const hp = new CountUp("hpval", 0, 0, 2, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const bpm = new CountUp("bpm", 0, 0, 2, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });
const sr = new CountUp("sr", 0, 0, 2, 0.3, { useEasing: true, useGrouping: false, separator: '', formattingFn: smartDecimalFormatter });

let tempId = -1;
let mappool = {};
let customEntries = [];

// Load mappool and separate custom entries (where value.custom === true)
fetch('mappool.json')
    .then(response => response.json())
    .then(data => {
        mappool = data;
        // Extract custom entries for later title‑based matching.
        // `key` is the unique word from the title (e.g., "Anemone"), `pick` is the display text (e.g., "HD2").
        customEntries = Object.entries(data)
            .filter(([, v]) => v && typeof v === 'object' && v.custom)
            .map(([k, v]) => ({ key: k, pick: v.pick }));
        roundEl.innerHTML = data.round || "QUALIFIERS";
    })
    .catch(error => console.error('Error loading mappool:', error));

socket.onmessage = event => {
    let data = JSON.parse(event.data);
    const beatmap = data.beatmap;

    if (tempId !== beatmap.id) {
        tempId = beatmap.id;
        
        // Update Text
        title.innerHTML = beatmap.title;
        artist.innerHTML = beatmap.artist;
        mapper.innerHTML = `Mapped by ${beatmap.mapper}`;
        difficulty.innerHTML = `[${beatmap.version}]`;
        
        // Update Background
        mapBg.src = `https://assets.ppy.sh/beatmaps/${beatmap.set}/covers/cover@2x.jpg`;
        
        // Update Pick Badge
        if (mappool[beatmap.id]) {
            // Standard map entry (numeric id)
            pickBadge.innerHTML = mappool[beatmap.id];
            pickBadge.style.display = "block";
        } else {
            // Try custom entries: match by title containing the custom pick string
            // Match custom entries by checking if the beatmap title contains the unique key word.
            const customMatch = customEntries.find(entry => beatmap.title && beatmap.title.includes(entry.key));
            if (customMatch) {
                pickBadge.innerHTML = customMatch.pick;
                pickBadge.style.display = "block";
            } else {
                pickBadge.innerHTML = "N/A";
            }
        }

        // Update Stats
        sr.update(beatmap.stats.stars?.total ?? 0);
        bpm.update(beatmap.stats.bpm?.common ?? 0);
        // Duration is provided under beatmap.time.mp3Length (milliseconds)
        const lengthMs = beatmap.time?.mp3Length ?? 0;
        length.update(lengthMs / 1000);
        // Debug: log stats object to see available fields
        console.log('beatmap stats:', beatmap.stats);
        // Some beatmap data may not have the "converted" field (e.g., older osu! versions).
        // Fallback to the raw value if "converted" is undefined.
        const csVal = beatmap.stats.cs?.converted ?? beatmap.stats.cs ?? 0;
        const arVal = beatmap.stats.ar?.converted ?? beatmap.stats.ar ?? 0;
        const odVal = beatmap.stats.od?.converted ?? beatmap.stats.od ?? 0;
        const hpVal = beatmap.stats.hp?.converted ?? beatmap.stats.hp ?? 0;
        cs.update(csVal);
        ar.update(arVal);
        od.update(odVal);
        hp.update(hpVal);

        // Handle Title Overflow
        title.classList.remove('overflow-animate');
        setTimeout(() => {
            if (title.scrollWidth > title.clientWidth) {
                title.classList.add('overflow-animate');
            }
        }, 0);
    }
};