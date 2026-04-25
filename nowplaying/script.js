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

let tempTrack;

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
    const combinedTrack = `${newArtist}\n${newTitle}`;

    if (tempTrack !== combinedTrack) {
        tempTrack = combinedTrack;
        setBubbleText(songArtist, newArtist);
        setBubbleText(songTitle, newTitle);

        setTimeout(() => {
            updateOverflowAnimation(songArtist);
            updateOverflowAnimation(songTitle);
        }, 0);
    }
}

