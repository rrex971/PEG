const HOST = '127.0.0.1:24050';
const socket = new ReconnectingWebSocket(`ws://${HOST}/websocket/v2`);

const songArtist = document.getElementById("songartist");
const songTitle = document.getElementById("songtitle");

const setBubbleText = (element, text) => {
    const value = text || "";
    element.textContent = value;
    element.dataset.text = value;
};

const timeFormatter = (value) => {
  const seconds = Math.round(value);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(remainingSeconds).padStart(2, '0');

  return `${paddedMinutes}<span class="colon">:</span>${paddedSeconds}`;
};

const duration = 0.5;
let timerVal = 300;
const timer = new CountUp("timer", 0, 0, 0, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: timeFormatter, decimal: '.', suffix: '' });
const timerO = new CountUp("timerO", 0, 0, 0, duration, { useEasing: true, useGrouping: false, separator: '', formattingFn: timeFormatter, decimal: '.', suffix: '' });

let tempSong;

const updateOverflowAnimation = (element) => {
    element.classList.remove('overflow-animate');
    element.style.setProperty('--overflow-distance', '0px');

    // Compute overflow distance per line so marquee stays inside its own container.
    const distance = element.parentElement.clientWidth - element.scrollWidth;
    if (distance < 0) {
        element.style.setProperty('--overflow-distance', `${distance}px`);
        element.classList.add('overflow-animate');
    }
};

setInterval(() => {
    if (timerVal > 0) {
        timerVal -= 1;
        timer.update(timerVal);
        timerO.update(timerVal);
    }
}, 1000);

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

