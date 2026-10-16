var vars = {};
var output_player = document.getElementById('output_player');
var time_player = document.getElementById('time_player');
var countdown_player = document.getElementById('countdown_player');
var title_player = document.getElementById('title_player');
var warning = document.getElementById('warning');
var loop_player = document.getElementById('loop_player');
var DivCache = false;
// Extraire les paramètres de l'URL
var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function (m, key, value) {
    vars[key] = value;
});

var vMixSettings = {
    IP: "127.0.0.1",
    port: "8088",
    mix: 1,
    refreshInterval: 100,
};

if (vars["mix"]) {
    vMixSettings.mix = parseFloat(vars["mix"]);
}

if (vars["interval"]) {
    vMixSettings.refreshInterval = parseFloat(vars["interval"]);
}

if (vars["visible"]) {
    DivCache = true;
}
// Update vMix data every x milliseconds
setInterval(() => {
    fetch('http://' + vMixSettings.IP + ':' + vMixSettings.port + '/api')
        .then(response => response.text())
        .then(str => (new window.DOMParser()).parseFromString(str, "text/xml"))
        .then(data => vMixRefresh(data))
        .catch(error => {
            // If an error occurs when connecting to vMix, display a warning message
            warning.textContent = "Error connecting to vMix.";
            warning.style.display = "block";
        });
}, vMixSettings.refreshInterval);

var vMixInputs = [];

function vMixRefresh(data) {
    warning.style.display = "none";  // Hide the warning message if no error occurs

    if (vMixSettings.mix === 1) {
        output_player.textContent = "vMix - PGM"
        vMixSettings.programNumber = parseFloat(data.getElementsByTagName("active")[0].innerHTML);
    } else if (typeof vMixSettings.mix === 'number' && vMixSettings.mix > 1) {
        // Récupérer le mix en fonction de vMixSettings.mix
        var mix = data.querySelector(`mix[number="${vMixSettings.mix}"]`);
        if (mix) {
            output_player.textContent = `vMix - Mix ${vMixSettings.mix}`;
            vMixSettings.programNumber = parseFloat(mix.getElementsByTagName("active")[0].innerHTML);
        } else {
            warning.textContent = "vMix - Mix ${vMixSettings.mix} not found"; // Message si mix est <= 1
            warning.style.display = "block";
        }
    } else {
        warning.textContent = "The selected mix does not number."; // Message si mix est <= 1
        warning.style.display = "block";
    }

    // Check if the selected input exists
    var inputPGM = data.querySelector(`[number="${vMixSettings.programNumber}"]`);
    if (!inputPGM) {
        warning.textContent = "The selected input does not exist.";
        warning.style.display = "block";
        return;
    }
    var input = inputPGM;
    if (inputPGM.getAttribute("type") === "Virtual") {
        var shortTitle = inputPGM.getAttribute("shortTitle");
        if (shortTitle) {
            var matchingInput = Array.from(data.querySelectorAll('input'))
                .find(el => el.getAttribute('shortTitle') === shortTitle && el.getAttribute('type') !== 'Virtual');
            if (matchingInput) {
                input = matchingInput;
            }
        }
    }
    if (DivCache) { 
        if (input.getAttribute("type") === "Video" || input.getAttribute("type") === "Audio" || input.getAttribute("type") === "Image" || input.getAttribute("type") === "VideoList") {
            // Show the player container if the input is a video, audio, or image
            document.getElementById("outerContainer_player").style.opacity = "1";
        } else {
            // Hide the player container if the input is not a video, audio, or image
            document.getElementById("outerContainer_player").style.opacity = "0";
        }
    }
    // Get the title of the active program
    var inputPGMTitle = inputPGM.getAttribute("title");
    title_player.textContent = inputPGMTitle ? inputPGMTitle : "Untitled";  // Update title

    // Check if the input is a video (has duration and position)
    var duration = parseFloat(input.getAttribute("duration"));
    var position = parseFloat(input.getAttribute("position"));
    if (isNaN(duration) || isNaN(position)) {
        warning.textContent = "The selected input is not a video.";
        warning.style.display = "block";
        return;
    }

    if(input.getAttribute("loop") === "True"){
        loop_player.style.display = "block";
    }else{
        loop_player.style.display = "none";
    }

    // Update the countdown and elapsed time
    updateCountdown(duration - position);
    updateTime(position);
    updateVU(input);
}

// Convert time (ms) to hh:mm:ss.ms format
function msToTime(s) {
    var ms = s % 1000; // millisecondes
    s = (s - ms) / 1000; // secondes totales
    var secs = s % 60;
    s = (s - secs) / 60;
    var mins = s % 60;
    var hrs = (s - mins) / 60;

    // On arrondit les millisecondes à 2 chiffres (centièmes de seconde)
    var centis = Math.floor(ms / 10); // 0–99

    // Format hh:mm:ss.cc
    return (
        hrs.toString().padStart(2, '0') + ':' +
        mins.toString().padStart(2, '0') + ':' +
        secs.toString().padStart(2, '0') + '.' +
        centis.toString().padStart(2, '0')
    );
}

// Update the elapsed time (current position in the video)
function updateTime(currentTime) {
    if(currentTime > 0) {
        time_player.textContent = msToTime(currentTime);  // Update time with ms
    } else {
        time_player.textContent = "00:00:00.00";  // No elapsed time
    }
}

// Update the countdown and change the color based on the remaining time
function updateCountdown(timeLeft) {
    if(timeLeft > 0) {
        countdown_player.textContent = msToTime(timeLeft);  // Update countdown with ms

        // Change the color based on the remaining time
        if(timeLeft <= 5000) {  // Less than 5 seconds
            countdown_player.style.color = "red";
        } else if(timeLeft <= 10000) {  // Less than 10 seconds
            countdown_player.style.color = "orange";
        } else {
            countdown_player.style.color = "white";  // Default color
        }
    } else {
        countdown_player.textContent = "00:00:00.00";  // No time remaining
        countdown_player.style.color = "white";  // Reset color
    }
}

function updateVU(input) {
    var muted = input.getAttribute("muted");
    var meterF1 = parseFloat(input.getAttribute("meterF1")) || 0;
    var meterF2 = parseFloat(input.getAttribute("meterF2")) || 0;
    var meterF3 = parseFloat(input.getAttribute("meterF3")) || 0;
    var meterF4 = parseFloat(input.getAttribute("meterF4")) || 0;

    function toDbFS(value) {
        if (value <= 0.0001) return -60; // plancher à -60 dBFS
        return 20 * Math.log10(value);
    }

    function normalizeDb(db) {
        let percent = (db + 60) / 60 * 100;
        return Math.max(0, Math.min(100, percent)); // clamp 0–100
    }

    var normalizedF1 = 100 - normalizeDb(toDbFS(meterF1));
    var normalizedF2 = 100 - normalizeDb(toDbFS(meterF2));
    var normalizedF3 = 100 - normalizeDb(toDbFS(meterF3));
    var normalizedF4 = 100 - normalizeDb(toDbFS(meterF4));

    if (muted === "False" || muted === false) {
        ["1", "2", "3", "4"].forEach(i => {
            document.getElementById("actualMeter" + i).style.filter = "grayscale(0%)";
        });
        document.getElementById("actualMeter1").style.clipPath = `inset(${normalizedF1}% 0% 0% 0%)`;
        document.getElementById("actualMeter2").style.clipPath = `inset(${normalizedF2}% 0% 0% 0%)`;
        document.getElementById("actualMeter3").style.clipPath = `inset(${normalizedF3}% 0% 0% 0%)`;
        document.getElementById("actualMeter4").style.clipPath = `inset(${normalizedF4}% 0% 0% 0%)`;
    } else {
        ["1", "2", "3", "4"].forEach(i => {
            document.getElementById("actualMeter" + i).style.filter = "grayscale(100%)";
        });
    }
}


function log10(x) {
    if(Math.log(x)*20 == -Infinity){
        return 0;
    }
    else{
        return Math.log(x)*21.5;
    }
}

function generateVU(bool, overlay){
    if(bool){
        return(`
        <div class="leftAlignContainer">
        <div class="audioMeterContainer">
            <div class="audioMeter">
                <div class="meterOutline"></div>
                <div class="actualMeter actualMeterL"></div>
            </div>
            <div class="audioMeter">
                <div class="meterOutline"></div>
                <div class="actualMeter actualMeterR"></div>
            </div>
            <div class="VUlabels">
                <div class="VUlabel" style="transform: scale(${overlay.zoomY / 100})">0</div>
                <div class="VUlabel" style="transform: scale(${overlay.zoomY / 100})">-6</div>
                <div class="VUlabel" style="transform: scale(${overlay.zoomY / 100})">-12</div>
                <div class="VUlabel" style="transform: scale(${overlay.zoomY / 100})">-18</div>
                <div class="VUlabel" style="transform: scale(${overlay.zoomY / 100})">-24</div>
                <div class="VUlabel" style="transform: scale(${overlay.zoomY / 100})">-30</div>
                <div class="VUlabel" style="transform: scale(${overlay.zoomY / 100})">-40</div>
                <div class="VUlabel" style="transform: scale(${overlay.zoomY / 100})">-50</div>
                <div class="VUlabel" style="transform: scale(${overlay.zoomY / 100})">-60</div>
            </div>
        </div>
        <div class="LRlabels">
            <div class="LRlabel" style="transform: scale(${overlay.zoomY / 100})">
                L
            </div>
            <div class="LRlabel" style="transform: scale(${overlay.zoomY / 100})">
                R
            </div>
        </div>
    </div>
        `)
    }
    else{
        return ""
    }
}

function positionVUlabels() {
  const labels = document.querySelectorAll('.VUlabel');
  labels.forEach(label => {
    const db = parseFloat(label.dataset.db);
    // On mappe -60 dB → 100% (bas), 0 dB → 0% (haut)
    const percent = 100 - ((db + 60) / 60) * 100;
    label.style.top = `${percent}%`;
  });
}

// Appeler une fois au chargement :
positionVUlabels();