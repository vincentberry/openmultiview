var mySettingMask = [];
var sourceParameters = MultiviewModel.urlParameters(window.location.href);

function escapeHTML(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function(c) { return {"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]; });
}
var localNetwork = typeof MultiviewConnection === 'undefined' ? null : MultiviewConnection.createAccess({href: window.location.href,
    navigator: typeof navigator === 'undefined' ? null : navigator,
    changed: function() { if(window.dispatchEvent && typeof CustomEvent !== 'undefined') window.dispatchEvent(new CustomEvent('openmultiview-network')); }});
async function fetchWithTimeout(url, options = {}, timeout = 5000) {
    if(localNetwork) { await localNetwork.ready; localNetwork.assertAllowed(url); }
    var controller = new AbortController();
    var timer = setTimeout(function(){ controller.abort(); }, timeout);
    return fetch(url, Object.assign({}, localNetwork ? localNetwork.options(url) : {}, options, {signal: controller.signal})).finally(function(){ clearTimeout(timer); });
}

var vMixSettings = {
    IP: "127.0.0.1",
    port: "8088",
    multiViewInput: 0,
    multiViewInputs: [0],
    managedLayers: {},
    layerLayout: [],
    generatedInputs: [],
    layerSources: [],
    hideOutputAudioByDefault: false,
    lastApiSuccess: 0,
    selectedInputKey: "",
    contextMenuLayerKey: "",
    layerSelectionVisible: false,
    previousProgram: -1,
    preivousPreview: -1,
    refreshInterval: 100,
}

var layerSelectionIdleTimer;

function search(key, keyValue, Array){
    for (var i=0; i < Array.length; i++) {
        if (Array[i][key] === keyValue) {
            return Array[i];
        }
    }
}

function toTitleCase(str) {
    return str.replace(/(?:^|\s)\w/g, function(match) {
        return match.toUpperCase();
    });
}

var saveSettings = [
    "zoomY",
    "zoomX",
    "panX",
    "panY",
    "color",
    "enabled",
    "fontSize",
    "mask",
]

var extras = [
    {
        name: "clock",
        zoomY: 50,
        zoomX: 50,
        panX: 0,
        panY: 0,
        color: "#ffffff",
        enabled: false,
        fontSize: 70,
        template: function(obj){
            var templateString = `
            <div class="multiViewBox" style="
                height: ${obj.zoomY}%;
                width:  ${obj.zoomX}%;
                left:   ${((obj.panX)/2) + 50}%;
                top:    ${((obj.panY*-1)/2) + 50}%;
            ">
            <div id="clock" style="color: ${obj.color}; font-size: ${obj.fontSize}px"></div>
            <div class="inputTitle">${toTitleCase(obj.name)}</div>
            </div>
            `
            return templateString
        },
    },
    {
        name: "countdown",
        zoomY: 50,
        zoomX: 50,
        panX: 0,
        panY: 0,
        color: "#ffffff",
        enabled: false,
        fontSize: 70,
        template: function(obj){
            var templateString = `
            <div class="multiViewBox" style="
                height: ${obj.zoomY}%;
                width:  ${obj.zoomX}%;
                left:   ${((obj.panX)/2) + 50}%;
                top:    ${((obj.panY*-1)/2) + 50}%;
            ">
            <div id="countdown" style="color: ${obj.color}; font-size: ${obj.fontSize}px"></div>
            <div class="inputTitle">${toTitleCase(obj.name)}</div>
            </div>
            `
            return templateString
        },
    },
    {
        name: "status",
        color: "#ffffff",
        zoomY: 50,
        zoomX: 50,
        panX: 0,
        panY: 0,
        enabled: false,
        fontSize: 36,
        template: function(obj){
            var templateString = `
            <div class="multiViewBox" style="
                height: ${obj.zoomY}%;
                width:  ${obj.zoomX}%;
                left:   ${((obj.panX)/2) + 50}%;
                top:    ${((obj.panY*-1)/2) + 50}%;
            ">
                <div class="vMixStatuses" style="font-size: ${obj.fontSize}px; color: ${obj.color}">
                    <div class="column">
            `;
            vMixStatuses.forEach((status, i) => {
                if(i == 3){
                    templateString += `</div><div class="column">`
                }
                if(vMixSettings[status]){
                    templateString += `<div class="vMixStatus vMixStatusEnabled ${status}  ">${status.toUpperCase()}: </div>`
                }
                else{
                    templateString += `<div class="vMixStatus ${status}  ">${status.toUpperCase()}: </div>`
                }
            });
            templateString += `
                </div>
            </div>
            <div class="inputTitle">${toTitleCase(obj.name)}</div>
            </div>
            `
            return templateString
        },
    },
]


if(sourceParameters.has("Inputs")){
    vMixSettings.multiViewInputs = sourceParameters.get("Inputs").split(",").map(MultiviewModel.parseSourceReference).filter(function(ref){ return ref !== undefined; });
}
else if(sourceParameters.has("Input")){
    var firstInput = MultiviewModel.parseSourceReference(sourceParameters.get("Input"));
    if(firstInput !== undefined) vMixSettings.multiViewInputs = [firstInput];
}
if(sourceParameters.has("Input2")){
    var secondInput = MultiviewModel.parseSourceReference(sourceParameters.get("Input2"));
    if(secondInput !== undefined && vMixSettings.multiViewInputs.indexOf(secondInput) === -1) vMixSettings.multiViewInputs.push(secondInput);
}
vMixSettings.multiViewInput = vMixSettings.multiViewInputs[0];

if(vMixSettings.multiViewInputs.length == 0){
    vMixSettings.multiViewInputs = [0];
}

 try {
 if(sourceParameters.has("Settings")){
    var parsedSettings = JSON.parse(sourceParameters.get("Settings"));
    if(!Array.isArray(parsedSettings)) throw new Error("Settings doit être une liste");
    parsedSettings.forEach((extra, i) => {
        if(!extras[i] || !extra || typeof extra !== "object") return;
        saveSettings.forEach(property => {
            if(extra[property] !== undefined) extras[i][property] = extra[property];
        });
    });
 }
 } catch(error) { console.warn("Paramètre Settings invalide", error); }
 try {
 if(sourceParameters.has("MaskSettings")){
    var parsedMasks = JSON.parse(sourceParameters.get("MaskSettings"));
    if(!Array.isArray(parsedMasks)) throw new Error("MaskSettings doit être une liste");
    mySettingMask = parsedMasks.filter(entry => entry && typeof entry.key === "string" && (typeof entry.value === "string" || entry.value && typeof entry.value === "object"));
 }
 } catch(error) { console.warn("Paramètre MaskSettings invalide", error); }

if(sourceParameters.has("IP")) vMixSettings.IP = sourceParameters.get("IP");
if(sourceParameters.has("Port")) vMixSettings.port = sourceParameters.get("Port");
var pollPending = false;
var vmixConnection = {state: 'checking', message: '', nextAttempt: 0, failures: 0};
function connectionChanged() { if(window.dispatchEvent && typeof CustomEvent !== 'undefined') window.dispatchEvent(new CustomEvent('openmultiview-connection')); }
async function pollVmix(force = false) {
    if(pollPending || !force && Date.now() < vmixConnection.nextAttempt) return;
    pollPending = true;
    try {
        const response = await fetchWithTimeout('http://' + vMixSettings.IP + ':' + vMixSettings.port + '/api', {}, 3000);
        if(!response.ok) throw new Error('API vMix : HTTP ' + response.status);
        const data = new window.DOMParser().parseFromString(await response.text(), 'text/xml');
        if(!data.querySelector('vmix') || data.querySelector('parsererror')) throw new Error('La réponse reçue n’est pas une API vMix.');
        vMixRefresh(data);
        Object.assign(vmixConnection, {state: 'connected', message: 'vMix connecté', nextAttempt: 0, failures: 0});
    } catch(error) {
        vMixSettings.lastApiSuccess = 0;
        vmixConnection.failures++;
        vmixConnection.state = error.code === 'LOCAL_NETWORK_ACCESS' ? error.permission === 'denied' ? 'denied' : 'permission' : 'unreachable';
        vmixConnection.message = error.code === 'LOCAL_NETWORK_ACCESS' ? error.message : location.protocol === 'https:' ?
            'vMix est inaccessible depuis cette page. Vérifiez son API et l’autorisation d’accès aux applications de cet appareil dans les paramètres du site. Vous pouvez aussi ouvrir la configuration locale du compagnon.' :
            'Connexion vMix indisponible. Vérifiez l’adresse et le port API dans Configuration.';
        vmixConnection.nextAttempt = Date.now() + (error.code === 'LOCAL_NETWORK_ACCESS' ? 30000 : Math.min(30000, vmixConnection.failures * 3000));
        $(".warning").text(vmixConnection.message);
        $(".warning").css("display", "flex");
    } finally { pollPending = false; connectionChanged(); }
}
setInterval(pollVmix, vMixSettings.refreshInterval);

var overlayArray = [];
var multiViewOverlays = [];
var lastResponse;
var vMixInputs = []

var vMixStatuses = [
    "recording",
    "external",
    "streaming",
    "playList",
    "multiCorder",
    "fullscreen",
]

function getInputStateBySourceReference(ref){
    return MultiviewModel.resolveSource(vMixInputs, ref);
}

function sourceInputsQuery(){
    return vMixSettings.multiViewInputs.map(function(ref){
        var input = getInputStateBySourceReference(ref);
        return input ? "key:" + input.key : typeof ref === "string" ? "key:" + ref : ref + 1;
    }).join(",");
}

function getSourceInputLabel(ref){
    var input = getInputStateBySourceReference(ref);
    return input ? "Entrée " + input.number + " · " + (input.title || input.key) : "Entrée " + (typeof ref === "number" ? ref + 1 : ref) + " (introuvable)";
}

function getDefaultTileSettings(inputKey, hideOutputAudio = vMixSettings.hideOutputAudioByDefault){
    var defaultSettings = MultiviewModel.tileDefaultsFor(vMixSettings.theme, vMixSettings.textStyle, vMixSettings.roleBadges);

    var input = getInputStateByKey(inputKey);
    if(hideOutputAudio && input && (/^Output$/i.test(input.type || "") || MultiviewModel.role(input) === "PGM")){
        defaultSettings.vu = false;
    }
    if(isWebInput(input)){
        defaultSettings.tally = false;
        defaultSettings.name = false;
        defaultSettings.vu = false;
        defaultSettings.timer = false;
        defaultSettings.frame = false;
    }

    return defaultSettings;
}

function normalizeTileSettings(entry, defaultSettings){
    var settings = Object.assign({}, defaultSettings || getDefaultTileSettings());

    if(!entry){
        return settings;
    }

    if(typeof entry.value == "object"){
        return Object.assign(settings, entry.value);
    }

    if(typeof entry.value == "string"){
        if(entry.value.indexOf("multiViewBoxMask") != -1){
            settings.frame = false;
            settings.vu = false;
        }
        if(entry.value.indexOf("NameMask") != -1){
            settings.name = false;
        }
    }

    return settings;
}

function getTileSettings(layerKey, fallbackInputKey){
    var defaultSettings = getDefaultTileSettings(fallbackInputKey);

    if(isWebInput(getInputStateByKey(fallbackInputKey))){
        return defaultSettings;
    }

    var layerEntry = mySettingMask.find(function(entry){
        return entry.key === layerKey;
    });

    if(layerEntry){
        return normalizeTileSettings(layerEntry, defaultSettings);
    }

    var overlay = getOverlayByLayerKey(layerKey);
    var legacy = overlay && mySettingMask.find(function(entry){ return entry.key === overlay.legacyLayerKey; });
    if(legacy) return normalizeTileSettings(legacy, defaultSettings);

    return normalizeTileSettings(mySettingMask.find(function(entry){
        return entry.key === fallbackInputKey;
    }), defaultSettings);
}

function saveTileSettings(layerKey, settings){
    var selectedOverlay = multiViewOverlays.find(function(overlay){
        return overlay.layerKey === layerKey;
    });

    if(isLayerConfigIgnored(selectedOverlay)){
        return;
    }

    var fallbackInputKey = selectedOverlay ? selectedOverlay.inputKey : undefined;

    saveOrUpdateEntry(mySettingMask, layerKey, Object.assign(getTileSettings(layerKey, fallbackInputKey), settings));
}

function getOverlayByLayerKey(layerKey){
    return multiViewOverlays.find(function(overlay){
        return overlay.layerKey === layerKey;
    });
}

function getLayerMenuItems(){
    return [
        { setting: "enabled", label: "View" },
        { setting: "tally", label: "Tally" },
        { setting: "name", label: "Name" },
        { setting: "roleBadge", label: "PROGRAM / PREVIEW" },
        { setting: "vu", label: "VU" },
        { setting: "timer", label: "Timer" },
        { setting: "frame", label: "Frame" },
    ];
}

function getLayerStyleControls(){
    return [
        { setting: "borderWidth", label: "Trait", type: "number", min: 0, max: 20, step: 1 },
        { setting: "borderColor", label: "Couleur", type: "color" },
        { setting: "previewColor", label: "Preview", type: "color" },
        { setting: "programColor", label: "Program", type: "color" },
    ];
}

function getLayerStyleVariables(overlay){
    var settings = getTileSettings(overlay.layerKey, overlay.inputKey);
    var borderWidth = parseFloat(settings.borderWidth);

    if(isNaN(borderWidth)){
        borderWidth = 3;
    }

    return [
        "--title-font-size: " + Math.max(8, Math.min(100, Number(settings.titleFontSize) || 22)) + "px",
        "--layer-border-width: " + Math.max(0, Math.min(20, borderWidth)) + "px",
        "--layer-border-color: " + settings.borderColor,
        "--layer-preview-color: " + settings.previewColor,
        "--layer-program-color: " + settings.programColor,
    ].join("; ") + ";";
}

function tileSettingsClasses(overlay){
    var settings = getTileSettings(overlay.layerKey, overlay.inputKey);
    var classes = [];

    if(isLayerConfigIgnored(overlay)){
        classes.push("configIgnored");
    }
    if(!settings.enabled){
        classes.push("viewOff");
    }
    if(!settings.tally){
        classes.push("tallyOff");
    }
    if(!settings.name){
        classes.push("NameMask");
    }
    if(!settings.roleBadge) classes.push("roleBadgeOff");
    if(!settings.vu){
        classes.push("vuOff");
    }
    if(!settings.frame){
        classes.push("multiViewBoxMask");
    }
    if(settings.timer && getLayerTimerInfo(getInputStateByKey(overlay.inputKey))) classes.push("hasLayerTimer");

    if(["overlay-bottom", "overlay-top", "below", "above"].indexOf(settings.titlePosition) !== -1) classes.push("title-" + settings.titlePosition);
    if(!settings.titleBackground) classes.push("title-transparent");
    if(["inside-left", "inside-right", "outside-left", "outside-right"].indexOf(settings.vuPosition) !== -1) classes.push("vu-" + settings.vuPosition);
    return classes.join(" ");
}

function vMixRefresh(data){
    lastResponse = data;
    var temporaryMultiViewOverlays = []
    vMixSettings.previewNumber = parseFloat(data.getElementsByTagName("preview")[0].innerHTML)
    vMixSettings.programNumber = parseFloat(data.getElementsByTagName("active")[0].innerHTML)
    var previewInput = data.querySelector(`input[number="${vMixSettings.previewNumber}"]`);
    var programInput = data.querySelector(`input[number="${vMixSettings.programNumber}"]`);
    vMixSettings.previewKey = previewInput ? previewInput.getAttribute("key") : "";
    vMixSettings.programKey = programInput ? programInput.getAttribute("key") : "";
    var audioBuses = {};
    var audio = data.getElementsByTagName("audio")[0];
    if(audio) Array.from(audio.children).forEach(function(bus){
        audioBuses[bus.tagName] = {meterF1: bus.getAttribute("meterF1"), meterF2: bus.getAttribute("meterF2"), muted: bus.getAttribute("muted")};
    });
    vMixInputs = [];
    Array.prototype.slice.call(data.getElementsByTagName("input"), 0 ).forEach(function(input, i){
        vMixInputs[i] = {}
        vMixInputs[i].title = input.getAttribute("title");
        vMixInputs[i].key = input.getAttribute("key");
        vMixInputs[i].number = parseFloat(input.getAttribute("number"));
        vMixInputs[i].type = input.getAttribute("type");
        vMixInputs[i].shortTitle = input.getAttribute("shortTitle");
        vMixInputs[i].loop = input.getAttribute("loop") === "True";
        vMixInputs[i].layers = Array.from(input.getElementsByTagName("overlay")).map(function(overlay, ordinal){
            var position = overlay.getElementsByTagName("position")[0];
            var geometry = {};
            if(position) ["zoomX", "zoomY", "panX", "panY"].forEach(function(name){
                var value = Number(position.getAttribute(name));
                if(position.hasAttribute(name) && Number.isFinite(value)) geometry[name] = value * 100;
            });
            return {index: overlay.hasAttribute("index") ? Number(overlay.getAttribute("index")) : ordinal, inputKey: overlay.getAttribute("key"), position: geometry};
        });
        Object.assign(vMixInputs[i], MultiviewModel.audioLevels({...vMixInputs[i], muted: input.getAttribute("muted"),
            meterF1: input.getAttribute("meterF1"), meterF2: input.getAttribute("meterF2")}, audioBuses));
        if(input.getAttribute("duration")){
            vMixInputs[i].video = true
            vMixInputs[i].duration = input.getAttribute("duration")
            vMixInputs[i].position = input.getAttribute("position")
        }
        else{
            vMixInputs[i].video = false
        }
    })
    
    // Bind numeric legacy URLs to stable vMix IDs as soon as the XML is available.
    vMixSettings.multiViewInputs = vMixSettings.multiViewInputs.map(function(ref){
        var input = getInputStateBySourceReference(ref);
        return input ? input.key : ref;
    });
    vMixSettings.multiViewInput = vMixSettings.multiViewInputs[0];
    var activeLayers = MultiviewModel.activeLayersFor({managed: {active: vMixSettings.managedLayers}, layerSources: vMixSettings.layerSources}, vMixInputs);
    var collected = MultiviewModel.collectLayers(vMixInputs, vMixSettings.multiViewInputs, activeLayers, vMixSettings.layerLayout);
    temporaryMultiViewOverlays = collected.layers;
    mySettingMask = MultiviewModel.migrateTileSettings(mySettingMask, collected.layers);
    overlayArray = collected.layers;
    var sourceWarnings = collected.warnings;
    if(sourceWarnings.length || !temporaryMultiViewOverlays.length){
        if(!sourceWarnings.length) sourceWarnings.push("Aucun layer vidéo dans les sources sélectionnées.");
        $(".warning").text(sourceWarnings.join(" · ")).css("display", "flex");
    } else $(".warning").hide();

    var forceRefresh = false
    vMixStatuses.forEach(status => {
        var enabled = !!(data.getElementsByTagName(status)[0] && data.getElementsByTagName(status)[0].textContent == "True");
        if(vMixSettings[status] != enabled){
            vMixSettings[status] = enabled;
            forceRefresh = true
        }
    })
    if(JSON.stringify(temporaryMultiViewOverlays) != JSON.stringify(multiViewOverlays) || forceRefresh){
        multiViewOverlays = JSON.parse(JSON.stringify(temporaryMultiViewOverlays))
        refresh();
        updateTally(true);
        
    }
    updateTally();
    updateLayerLabels();
    updateVU();
    updateLayerTimers();
    vMixSettings.lastApiSuccess = Date.now();
    if(typeof vmixConnection !== 'undefined') {
        Object.assign(vmixConnection, {state: 'connected', message: 'vMix connecté', nextAttempt: 0, failures: 0});
        connectionChanged();
    }
}

function updateVU(){
    multiViewOverlays.forEach((overlay, i) => {
        var inputIndex = vMixInputs.findIndex(vMixInput => vMixInput.key === overlay.inputKey);
        if(inputIndex == -1){
            return;
        }

        if(vMixInputs[inputIndex].audio){
            $($(".outerContainer").children()[i]).find(".actualMeterL").css("clip-path", "inset(" + (100 - vMixInputs[inputIndex].audioL) + "% 0% 0% 0%)");
            $($(".outerContainer").children()[i]).find(".actualMeterR").css("clip-path", "inset(" + (100 - vMixInputs[inputIndex].audioR) + "% 0% 0% 0%)");
            if(vMixInputs[inputIndex].muted){
                $($(".outerContainer").children()[i]).find(".actualMeterR").css("filter", "grayscale(100%)");
                $($(".outerContainer").children()[i]).find(".actualMeterL").css("filter", "grayscale(100%)");
            }
            else{
                $($(".outerContainer").children()[i]).find(".actualMeterR").css("filter", "grayscale(0%)");
                $($(".outerContainer").children()[i]).find(".actualMeterL").css("filter", "grayscale(0%)");

            }
        }
    });
}

function generateVU(bool, overlay){
    if(bool){
        var audioSource = (vMixInputs.find(input => input.key === overlay.inputKey) || {}).audioSource || 'input';
        return(`
        <div class="leftAlignContainer">
        <div class="audioMeterContainer" data-audio-source="${audioSource}">
            <div class="VUlabels" aria-label="Échelle audio en dBFS">
                ${[0, -6, -12, -18, -24, -30, -40, -50, -60].map(db => `<div class="VUlabel" data-db="${db}" style="top: ${-db / 60 * 100}%">${db}</div>`).join('')}
            </div>
            <div class="audioMeter">
                <div class="meterOutline"></div>
                <div class="actualMeter actualMeterL"></div>
            </div>
            <div class="audioMeter">
                <div class="meterOutline"></div>
                <div class="actualMeter actualMeterR"></div>
            </div>
        </div>
        <div class="LRlabels">
            <div class="LRlabel">
                L
            </div>
            <div class="LRlabel">
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

function getPlayerTimerInput(inputState){
    if(!inputState){
        return undefined;
    }

    if(inputState.type === "Virtual" && inputState.shortTitle){
        var matchingInput = vMixInputs.find(function(vMixInput){
            return vMixInput.shortTitle === inputState.shortTitle && vMixInput.type !== "Virtual";
        });

        if(matchingInput){
            return matchingInput;
        }
    }

    return inputState;
}

function getInputStateByNumber(inputNumber){
    var inputState = vMixInputs.find(function(vMixInput){
        return vMixInput.number === inputNumber;
    });

    return inputState || vMixInputs[inputNumber - 1];
}

function getInputStateByKey(inputKey){
    return vMixInputs.find(function(vMixInput){
        return vMixInput.key === inputKey;
    });
}

function getInputLabel(inputState){
    if(!inputState){
        return "";
    }

    return [inputState.title, inputState.shortTitle, inputState.type].join(" ").toLowerCase();
}

function isWebInput(inputState){
    var label = getInputLabel(inputState);
    return /https?:\/\/|\bbrowser\b|\bweb\s*browser\b|\bwebpage\b|\bweb\s*page\b|\bpage\s*web\b|\bwebsite\b|\burl\b/.test(label);
}

function isLayerConfigIgnored(overlay){
    return overlay && isWebInput(getInputStateByKey(overlay.inputKey));
}

function getMixNumber(inputState){
    if(!inputState){
        return undefined;
    }

    var label = getInputLabel(inputState);
    var mixMatch = label.match(/\bmix\s*(\d+)\b/);

    if(mixMatch){
        return parseFloat(mixMatch[1]);
    }

    return /\bmix\b/.test(label) ? 1 : undefined;
}

function isOutputInput(inputState){
    if(!inputState){
        return false;
    }

    var label = getInputLabel(inputState);
    return label.indexOf("output") != -1 || inputState.title === "PGM" || inputState.title === "PGM+A";
}

function getMixActiveInput(mixNumber){
    if(!lastResponse || isNaN(mixNumber)){
        return undefined;
    }

    if(mixNumber === 1){
        return getInputStateByNumber(vMixSettings.programNumber);
    }

    var mix = lastResponse.querySelector(`mix[number="${mixNumber}"]`);
    if(!mix || !mix.getElementsByTagName("active")[0]){
        return undefined;
    }

    return getInputStateByNumber(parseFloat(mix.getElementsByTagName("active")[0].innerHTML));
}

function getLayerMonitorRole(inputState){
    var media = getPlayerTimerInput(inputState);
    if(!inputState || media && /^(Video|VideoList|Audio|Image|Photos)$/i.test(media.type || "")) return "";
    return MultiviewModel.role(inputState) || (/^Preview$/i.test(inputState.type || "") ? "PVW" : /^(Output|Mix)$/i.test(inputState.type || "") || getMixNumber(inputState) ? "PGM" : "");
}

function getLayerDisplayInput(inputState){
    var role = getLayerMonitorRole(inputState);
    if(!role) return inputState;
    var mixNumber = getMixNumber(inputState);
    if(role === "PGM") return (mixNumber ? getMixActiveInput(mixNumber) : getInputStateByNumber(vMixSettings.programNumber)) || inputState;
    if(!mixNumber || mixNumber === 1) return getInputStateByNumber(vMixSettings.previewNumber) || inputState;
    var mix = lastResponse && lastResponse.querySelector(`mix[number="${mixNumber}"]`);
    var preview = mix && mix.getElementsByTagName("preview")[0];
    return (preview && getInputStateByNumber(Number(preview.textContent || preview.innerHTML))) || inputState;
}

function getLayerDisplayName(overlay){
    var input = getLayerDisplayInput(getInputStateByKey(overlay.inputKey));
    return input && (input.title || input.shortTitle) || overlay.inputName;
}

function updateLayerLabels(){
    multiViewOverlays.forEach(function(overlay){
        var label = getLayerDisplayName(overlay);
        var title = $(document.getElementById(overlay.layerKey)).find(".inputTitle");
        if(title.text() !== label) title.text(label).attr("title", label);
    });
}

function getTimerInputForLayer(inputState){
    if(!inputState){
        return undefined;
    }

    var mediaInput = getPlayerTimerInput(inputState);
    if(mediaInput && /^(Video|VideoList|Audio)$/i.test(mediaInput.type || "")){
        return mediaInput;
    }

    var mixNumber = getMixNumber(inputState);
    if(mixNumber){
        return getPlayerTimerInput(getMixActiveInput(mixNumber));
    }

    if(isOutputInput(inputState)){
        return getPlayerTimerInput(getInputStateByNumber(vMixSettings.programNumber));
    }

    return getPlayerTimerInput(inputState);
}

function hasMediaTimer(inputState){
    if(!inputState || !inputState.video){
        return false;
    }

    var duration = parseFloat(inputState.duration);
    var position = parseFloat(inputState.position);

    return Number.isFinite(duration) && Number.isFinite(position) && duration > 0;
}

function getLayerTimerInfo(inputState){
    var timerInput = getTimerInputForLayer(inputState);
    var isOutputOrMix = timerInput !== getPlayerTimerInput(inputState) && (isOutputInput(inputState) || getMixNumber(inputState) != undefined);

    if(!hasMediaTimer(timerInput)){
        return undefined;
    }

    var elapsed = Math.max(parseFloat(timerInput.position), 0);
    var timeLeft = Math.max(parseFloat(timerInput.duration) - elapsed, 0);
    var isVideoList = timerInput.type === "VideoList";

    return {
        className: getLayerTimerClass(timeLeft) + (isOutputOrMix ? " timerOutputMix" : " timerMediaPlayer") + (isVideoList ? " timerVideoList" : ""),
        timeLeft,
        elapsed,
        isVideoList,
        mediaTitle: isVideoList ? timerInput.title || timerInput.shortTitle || "Sans titre" : "",
        loop: timerInput.loop === true,
    };
}

function getLayerTimerClass(timeLeft){
    if(timeLeft <= 0){
        return "";
    }

    if(timeLeft <= 5000){
        return "timerDanger";
    }

    if(timeLeft <= 10000){
        return "timerWarning";
    }

    return "";
}

function generateLayerTimer(inputState, overlay){
    if(!getTileSettings(overlay.layerKey, overlay.inputKey).timer){
        return "";
    }

    var timerInfo = getLayerTimerInfo(inputState);
    var timerClass = timerInfo ? timerInfo.className : "";
    var timerDisplay = timerInfo ? "" : "display: none;";
    var timerText = timerInfo ? msToTime(timerInfo.timeLeft) : "";
    var listVisible = timerInfo && timerInfo.isVideoList;
    var mediaTitle = escapeHTML(listVisible ? timerInfo.mediaTitle : "");

    return `<div class="layerTimer ${timerClass}" style="${timerDisplay}">
        <div class="layerMediaTitle" title="${mediaTitle}"${listVisible ? "" : " hidden"}>${mediaTitle}</div>
        <div class="layerTimerTimes">
            <div class="layerElapsed"${listVisible ? "" : " hidden"}><span class="layerTimeLabel">Écoulé</span><span class="layerElapsedValue">${listVisible ? msToTime(timerInfo.elapsed) : ""}</span></div>
            <div class="layerRemaining"><span class="layerTimeLabel">Restant</span><div class="layerRemainingValue"><img class="layerLoop" src="assets/loop.png" alt="Lecture en boucle" title="Lecture en boucle"${timerInfo && timerInfo.loop ? "" : " hidden"}><span class="layerTimerValue">${timerText}</span></div></div>
        </div>
    </div>`;
}

function updateLayerTimers(){
    multiViewOverlays.forEach(function(overlay){
        var tile = $(document.getElementById(overlay.layerKey));
        var timer = tile.find(".layerTimer");

        if(timer.length == 0){
            return;
        }

        var inputState = vMixInputs.find(function(vMixInput){
            return vMixInput.key === overlay.inputKey;
        });
        var timerInfo = getLayerTimerInfo(inputState);
        var listVisible = !!timerInfo && timerInfo.isVideoList;
        tile.toggleClass("hasLayerTimer", !!timerInfo);
        tile.toggleClass("hasListPlayer", listVisible);

        timer
            .removeClass("timerWarning timerDanger timerOutputMix timerMediaPlayer timerVideoList")
            .addClass(timerInfo ? timerInfo.className : "")
            .css("display", timerInfo ? "" : "none");
        timer.find(".layerLoop").prop("hidden", !timerInfo || !timerInfo.loop);
        timer.find(".layerTimerValue").text(timerInfo ? msToTime(timerInfo.timeLeft) : "");
        timer.find(".layerMediaTitle").prop("hidden", !listVisible).attr("title", listVisible ? timerInfo.mediaTitle : "").text(listVisible ? timerInfo.mediaTitle : "");
        timer.find(".layerElapsed").prop("hidden", !listVisible);
        timer.find(".layerElapsedValue").text(listVisible ? msToTime(timerInfo.elapsed) : "");
    });
}

function refresh(){
    var saveArray = []
    extras.forEach((extra, i) => {
        if(saveArray[i] == undefined){
            saveArray[i] = {}
        }
        saveSettings.forEach(setting =>{
            saveArray[i][setting] = extra[setting]
        })
    });
    $("#saveURL").val(MultiviewModel.safeURL(window.location.origin + window.location.pathname +"?Inputs="+ sourceInputsQuery() + "&Settings=" + encodeURIComponent(JSON.stringify(saveArray)) + "&MaskSettings=" + encodeURIComponent(JSON.stringify(mySettingMask))))
    renderSourceInputs();
   
    $(".outerContainer").attr("data-theme", vMixSettings.theme || "classic").html("")
    multiViewOverlays.forEach(overlay => {
        var inputIndex = vMixInputs.findIndex(vMixInput => vMixInput.key === overlay.inputKey);
        var layerConfigHandlers = isLayerConfigIgnored(overlay) ? "" : 'data-configurable="true"';
        $(".outerContainer").append(`
        <div class="multiViewBox layerBox ${tileSettingsClasses(overlay)}" ${layerConfigHandlers} id="${overlay.layerKey}" data-input-key="${overlay.inputKey}" style="
            height: ${overlay.zoomY}%;
            width:  ${overlay.zoomX}%;
            left:   ${((overlay.panX)/2) + 50}%;
            top:    ${((overlay.panY*-1)/2) + 50}%;
            ${getLayerStyleVariables(overlay)}
        ">
        <div class="inputTitle" title="${escapeHTML(getLayerDisplayName(overlay))}">${escapeHTML(getLayerDisplayName(overlay))}</div>
        ${getLayerMonitorRole(vMixInputs[inputIndex]) ? '<span class="layerRoleBadge">' + (getLayerMonitorRole(vMixInputs[inputIndex]) === 'PGM' ? 'PROGRAM' : 'PREVIEW') + '</span>' : ''}
        ${generateVU(inputIndex != -1 && vMixInputs[inputIndex].audio && getTileSettings(overlay.layerKey, overlay.inputKey).vu, overlay)}
        ${generateLayerTimer(inputIndex != -1 ? vMixInputs[inputIndex] : undefined, overlay)}
        </div>
        `)
    });
    extras.forEach(extra => {
    
        if(extra.enabled == true){
            $(".outerContainer").append(extra.template(extra))
        }
    });
    renderSelectedInputPanel();
    
}

function updateTally(force){
    $(".layerBox").removeClass("preview program");

    multiViewOverlays.forEach(function(overlay){
        var settings = getTileSettings(overlay.layerKey, overlay.inputKey);
        var tile = $(document.getElementById(overlay.layerKey));

        var tally = MultiviewModel.tallyState(settings, overlay.inputKey, vMixSettings.previewKey, vMixSettings.programKey);
        if(tally) tile.addClass(tally);
    });

    vMixSettings.previousPreviewKey = vMixSettings.previewKey
    vMixSettings.previousProgramKey = vMixSettings.programKey
}

let clockTick = () => {
    let date = new Date();
    let hrs = date.getHours();
    let mins = date.getMinutes();
    let secs = date.getSeconds();
    hrs = hrs < 10 ? "0" + hrs : hrs;
    mins = mins < 10 ? "0" + mins : mins;
    secs = secs < 10 ? "0" + secs : secs;

    let time = `${hrs}:${mins}:${secs}`;
    if(search("name", "clock", extras).enabled){
        $("#clock").html(time)
    };
    setTimeout(clockTick, 1000);
}
clockTick();

function msToTime(s) {
    var ms = s % 1000;
    s = (s - ms) / 1000;
    var secs = s % 60;
    s = (s - secs) / 60;
    var mins = s % 60;
    var hrs = (s - mins) / 60;

    var centis = Math.floor(ms / 10);

    return (
        hrs.toString().padStart(2, '0') + ':' +
        mins.toString().padStart(2, '0') + ':' +
        secs.toString().padStart(2, '0') + '.' +
        centis.toString().padStart(2, '0')
    );
  }
    
function updateCountdown(){
    var programInput = getPlayerTimerInput(vMixInputs[vMixSettings.programNumber - 1]);

    if(!programInput){
        return;
    }

    if(programInput.video){
        var timeLeft = parseFloat(programInput.duration) - parseFloat(programInput.position)
        if(timeLeft > 0){
            if(timeLeft < 10000){
                $("#countdown").parent().addClass("program")
                $("#countdown").parent().removeClass("preview")
            }
            else if(timeLeft < 60000){
                $("#countdown").parent().addClass("preview")
                $("#countdown").parent().removeClass("program")
            }
            else{
                $("#countdown").parent().removeClass("program")
                $("#countdown").parent().removeClass("preview")
            }
            $("#countdown").html(msToTime(timeLeft))
        }
        else{
            $("#countdown").html("00:00:00.00");
            $("#countdown").parent().removeClass("program")
            $("#countdown").parent().removeClass("preview")
        }
    }
    else{
        $("#countdown").html("00:00:00");
        $("#countdown").parent().removeClass("program")
        $("#countdown").parent().removeClass("preview")
    }
    
}

setInterval(() => {
    updateCountdown()
}, 200);

extras.forEach(extra => {
    $(`#${extra.name}ZoomNumber`).val(extra.zoomX/100)
    $(`#${extra.name}ZoomSlider`).val(extra.zoomX/100)
    $(`#${extra.name}ZoomSlider`).on('input',function(e){
        extra.zoomX = e.target.value * 100;
        extra.zoomY = e.target.value * 100;
        $(`#${extra.name}ZoomNumber`).val(e.target.value)
        refresh();

    });
    $(`#${extra.name}ZoomNumber`).on('input',function(e){
        extra.zoomX = e.target.value * 100;
        extra.zoomY = e.target.value * 100;
        $(`#${extra.name}ZoomSlider`).val(e.target.value)
        refresh();

    });

    $(`#${extra.name}PanYNumber`).val(extra.panY/100)
    $(`#${extra.name}PanYSlider`).val(extra.panY/100)
    $(`#${extra.name}PanYSlider`).on('input',function(e){
        extra.panY = e.target.value * 100;
        $(`#${extra.name}PanYNumber`).val(e.target.value)
        refresh();

    });
    $(`#${extra.name}PanYNumber`).on('input',function(e){
        extra.panY = e.target.value * 100;
        $(`#${extra.name}PanYSlider`).val(e.target.value)
        refresh();

    });

    $(`#${extra.name}PanXNumber`).val(extra.panX/100)
    $(`#${extra.name}PanXSlider`).val(extra.panX/100)
    $(`#${extra.name}PanXSlider`).on('input',function(e){
        extra.panX = e.target.value * 100;
        $(`#${extra.name}PanXNumber`).val(e.target.value)
        refresh();
    });
    $(`#${extra.name}PanXNumber`).on('input',function(e){
        extra.panX = e.target.value * 100;
        $(`#${extra.name}PanXSlider`).val(e.target.value)
        refresh();
    });

    $(`#${extra.name}Enable`).attr("checked", extra.enabled)
    $(`#${extra.name}Enable`).on('input',function(e){
        extra.enabled = e.target.checked;
        refresh();
    });

    $(`#${extra.name}FontSize`).val(extra.fontSize)
    $(`#${extra.name}FontSize`).on('input',function(e){
        extra.fontSize = e.target.value;
        refresh();
    });

    $(`#${extra.name}Color`).val(extra.color)
    $(`#${extra.name}Color`).on('input',function(e){
        extra.color = e.target.value;
        refresh();
    });
})

function renderSourceInputs(){
    var list = $("#sourceInputsList").empty();
    vMixSettings.multiViewInputs.forEach(function(ref, i){
        var row = $("<div class='sourceInputRow'>");
        $("<label>").attr("for", "sourceInput" + i).text("Source " + (i + 1)).appendTo(row);
        var select = $("<select>").attr({id: "sourceInput" + i, "data-source-index": i, "aria-label": "Source " + (i + 1)}).appendTo(row);
        var selected = getInputStateBySourceReference(ref);
        if(!selected) select.append(new Option(getSourceInputLabel(ref), typeof ref === "string" ? "key:" + ref : String(ref + 1), true, true));
        vMixInputs.filter(function(input){ return !isWebInput(input) && ((input.layers && input.layers.length) || input === selected || vMixSettings.generatedInputs.includes(input.key)); }).forEach(function(input){
            select.append(new Option(getSourceInputLabel(input.key), "key:" + input.key, false, selected && input.key === selected.key));
        });
        $("<button type='button' class='removeSourceInput'>").attr({"data-source-index": i, "aria-label": "Retirer source " + (i + 1)}).text("×").prop("disabled", vMixSettings.multiViewInputs.length === 1).appendTo(row);
        row.appendTo(list);
    });
}

function closeLayerContextMenu(){
    $("#layerContextMenu").removeClass("isOpen").html("");
    vMixSettings.contextMenuLayerKey = "";
}

function clearLayerFocus(){
    clearTimeout(layerSelectionIdleTimer);
    vMixSettings.layerSelectionVisible = false;
    closeLayerContextMenu();
    $(".multiViewBox").removeClass("selected");
}

function scheduleLayerFocusIdleClose(){
    clearTimeout(layerSelectionIdleTimer);

    if(!vMixSettings.layerSelectionVisible && !vMixSettings.contextMenuLayerKey){
        return;
    }

    layerSelectionIdleTimer = setTimeout(function(){
        clearLayerFocus();
    }, 2500);
}

function positionLayerContextMenu(x, y){
    var menu = $("#layerContextMenu");
    var menuElement = menu[0];
    var menuWidth = menuElement.offsetWidth;
    var menuHeight = menuElement.offsetHeight;
    var left = Math.min(x, window.innerWidth - menuWidth - 8);
    var top = Math.min(y, window.innerHeight - menuHeight - 8);

    menu.css({
        left: Math.max(left, 8) + "px",
        top: Math.max(top, 8) + "px",
    });
}

function openLayerContextMenu(event, element){
    event.preventDefault();
    event.stopPropagation();

    var overlay = getOverlayByLayerKey(element.id);
    if(!overlay || isLayerConfigIgnored(overlay)){
        closeLayerContextMenu();
        return false;
    }

    vMixSettings.contextMenuLayerKey = overlay.layerKey;
    vMixSettings.selectedInputKey = overlay.layerKey;
    vMixSettings.layerSelectionVisible = true;
    renderSelectedInputPanel();

    var settings = getTileSettings(overlay.layerKey, overlay.inputKey);
    var menuContent = `
        <div class="layerContextTitle">${escapeHTML(overlay.layerName)}</div>
        <div class="layerContextSubtitle">${escapeHTML(overlay.inputName)}</div>
    `;

    getLayerMenuItems().forEach(function(item){
        menuContent += `
            <label class="layerContextItem">
                <input type="checkbox" data-layer-setting="${item.setting}" ${settings[item.setting] ? "checked" : ""}>
                <span>${item.label}</span>
            </label>
        `;
    });

    menuContent += `<div class="layerContextDivider"></div>`;

    getLayerStyleControls().forEach(function(item){
        menuContent += `
            <label class="layerContextItem layerContextControl">
                <span>${item.label}</span>
                <input type="${item.type}" data-layer-setting="${item.setting}" value="${settings[item.setting]}" ${item.min != undefined ? `min="${item.min}"` : ""} ${item.max != undefined ? `max="${item.max}"` : ""} ${item.step != undefined ? `step="${item.step}"` : ""}>
            </label>
        `;
    });

    $("#layerContextMenu").html(menuContent).addClass("isOpen");
    positionLayerContextMenu(event.clientX, event.clientY);
    scheduleLayerFocusIdleClose();
    return false;
}

function renderSelectedInputPanel(){
    var selectedKey = vMixSettings.selectedInputKey;
    var configurableOverlays = multiViewOverlays.filter(function(overlay){
        return !isLayerConfigIgnored(overlay);
    });
    var selectedOverlay = multiViewOverlays.find(function(overlay){
        return overlay.layerKey === selectedKey && !isLayerConfigIgnored(overlay);
    });

    if(!selectedOverlay && configurableOverlays.length > 0){
        selectedOverlay = configurableOverlays[0];
        vMixSettings.selectedInputKey = selectedOverlay ? selectedOverlay.layerKey : "";
    }

    $(".multiViewBox").removeClass("selected");
    if(selectedOverlay){
        if(vMixSettings.layerSelectionVisible){
            $(document.getElementById(selectedOverlay.layerKey)).addClass("selected");
        }
        $("#selectedInputPanel").removeClass("empty");

        var layerSelect = $("#tileLayerSelect").html("").prop("disabled", false);
        configurableOverlays.forEach(function(overlay){
            var overlaySettings = getTileSettings(overlay.layerKey, overlay.inputKey);
            var label = overlay.layerName + " - " + overlay.inputName + (overlaySettings.enabled ? "" : " (masque)");
            layerSelect.append(new Option(label, overlay.layerKey, false, overlay.layerKey === selectedOverlay.layerKey));
        });

        var settings = getTileSettings(selectedOverlay.layerKey, selectedOverlay.inputKey);
        $("#tileEnabled").prop("checked", settings.enabled);
        $("#tileTally").prop("checked", settings.tally);
        $("#tileName").prop("checked", settings.name);
        $("#tileRoleBadge").prop("checked", settings.roleBadge);
        $("#tileVU").prop("checked", settings.vu);
        $("#tileTimer").prop("checked", settings.timer);
        $("#tileFrame").prop("checked", settings.frame);
    }
    else{
        $("#selectedInputPanel").addClass("empty");
        $("#tileLayerSelect").html("").append(new Option("No configurable layer", "")).prop("disabled", true);
        $("#selectedInputPanel input").prop("checked", false);
    }
}

function updateSelectedTileSetting(setting, value){
    if(!vMixSettings.selectedInputKey){
        return;
    }
    var selectedOverlay = getOverlayByLayerKey(vMixSettings.selectedInputKey);
    if(isLayerConfigIgnored(selectedOverlay)){
        return;
    }
    var settings = {};
    settings[setting] = value;
    saveTileSettings(vMixSettings.selectedInputKey, settings);
    refresh();
    updateTally(true);
}

function updateLayerContextSetting(setting, value){
    if(!vMixSettings.contextMenuLayerKey){
        return;
    }
    var contextOverlay = getOverlayByLayerKey(vMixSettings.contextMenuLayerKey);
    if(isLayerConfigIgnored(contextOverlay)){
        closeLayerContextMenu();
        return;
    }

    var settings = {};
    settings[setting] = value;
    saveTileSettings(vMixSettings.contextMenuLayerKey, settings);
    refresh();
    updateTally(true);

    var overlay = getOverlayByLayerKey(vMixSettings.contextMenuLayerKey);
    if(overlay){
        openLayerContextMenu({
            preventDefault: function(){},
            stopPropagation: function(){},
            clientX: parseFloat($("#layerContextMenu").css("left")),
            clientY: parseFloat($("#layerContextMenu").css("top")),
        }, document.getElementById(overlay.layerKey));
    }
}

function selectTile(element) {
    if(isLayerConfigIgnored(getOverlayByLayerKey(element.id))){
        return;
    }
    vMixSettings.selectedInputKey = element.id;
    vMixSettings.layerSelectionVisible = true;
    renderSelectedInputPanel();
    scheduleLayerFocusIdleClose();
}

function Mask(element) {
    if(element.id){
        selectTile(element);
    }
}

function copy(that){
    var inputField = document.getElementById("saveURL");
    inputField.select();
    document.execCommand('copy',false);
    window.getSelection().removeAllRanges();
}

$(document).on('click', '#saveURL', copy);
$(document).on('click', '.outerContainer .layerBox[data-configurable]', function(event) { return openLayerContextMenu(event, this); });
$(document).on('click', '.outerContainer .multiViewBox:not(.layerBox)', function() { Mask(this); });

function saveOrUpdateEntry(array, key, value) {
    // Vérifier si la clé existe déjà dans le tableau
    const existingIndex = array.findIndex(entry => entry.key === key);

    // Si la clé existe, mettre à jour la valeur
    if (existingIndex !== -1) {
        array[existingIndex].value = value;
    } else {
        // Sinon, ajouter une nouvelle entrée
        array.push({ key: key, value: value });
    }
}

$(document).on("change", "#sourceInputsList select", function(e){
    var sourceIndex = Number(e.target.dataset.sourceIndex);
    var input = MultiviewModel.parseSourceReference(e.target.value);
    if(input === undefined) return;
    vMixSettings.multiViewInputs[sourceIndex] = input;
    vMixSettings.multiViewInput = vMixSettings.multiViewInputs[0];
    if(lastResponse) vMixRefresh(lastResponse);
    refresh();
});

$(document).on("click", ".removeSourceInput", function(e){
    var sourceIndex = parseFloat(e.target.getAttribute("data-source-index"));

    if(vMixSettings.multiViewInputs.length > 1 && !isNaN(sourceIndex)){
        vMixSettings.multiViewInputs.splice(sourceIndex, 1);
        vMixSettings.multiViewInput = vMixSettings.multiViewInputs[0];
        if(lastResponse) vMixRefresh(lastResponse);
        refresh();
    }
});

$("#addSourceInput").on("click", function(){
    var next = vMixInputs.find(function(input){
        return !isWebInput(input) && input.layers && input.layers.length && !vMixSettings.multiViewInputs.some(function(ref){ return getInputStateBySourceReference(ref) === input; });
    });
    if(!next) return;
    vMixSettings.multiViewInputs.push(next.key);
    if(lastResponse) vMixRefresh(lastResponse);
    refresh();
});

$("#settingsHandle").on("click", function(e){
    e.stopPropagation();
    $(".hideContainer").toggleClass("isOpen");
});

setTimeout(function(){
    $(".hideContainer").addClass("handleHidden");
}, 10000);

$(".hideContainer").on("mouseenter focusin", function(){
    $(this).removeClass("handleHidden");
});

$(".hideContainer").on("mouseleave focusout", function(){
    var hideContainer = $(this);

    setTimeout(function(){
        if(!hideContainer.is(":hover") && !hideContainer.is(":focus-within") && !hideContainer.hasClass("isOpen")){
            hideContainer.addClass("handleHidden");
        }
    }, 10000);
});

$(document).on("mousemove", function(e){
    if(e.clientY >= window.innerHeight - 8){
        $(".hideContainer").removeClass("handleHidden");
    }
    scheduleLayerFocusIdleClose();
});

$("#tileEnabled").on("input", function(e){
    updateSelectedTileSetting("enabled", e.target.checked);
});

$("#tileLayerSelect").on("change", function(e){
    vMixSettings.selectedInputKey = e.target.value;
    vMixSettings.layerSelectionVisible = true;
    renderSelectedInputPanel();
    scheduleLayerFocusIdleClose();
});

$("#tileTally").on("input", function(e){
    updateSelectedTileSetting("tally", e.target.checked);
});

$("#tileName").on("input", function(e){
    updateSelectedTileSetting("name", e.target.checked);
});

$("#tileRoleBadge").on("input", function(e){
    updateSelectedTileSetting("roleBadge", e.target.checked);
});

$("#tileVU").on("input", function(e){
    updateSelectedTileSetting("vu", e.target.checked);
});

$("#tileTimer").on("input", function(e){
    updateSelectedTileSetting("timer", e.target.checked);
});

$("#tileFrame").on("input", function(e){
    updateSelectedTileSetting("frame", e.target.checked);
});

$(document).on("change", "#layerContextMenu input", function(e){
    var value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    updateLayerContextSetting(e.target.getAttribute("data-layer-setting"), value);
});

$(document).on("click", "#layerContextMenu", function(e){
    e.stopPropagation();
});

$(document).on("click", function(){
    clearLayerFocus();
});

$(document).on("keydown", function(e){
    if(e.key === "Escape"){
        clearLayerFocus();
        $(".hideContainer").removeClass("isOpen");
    }
});

renderSourceInputs();
renderSelectedInputPanel();
