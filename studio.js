/* Local PC control room, with an optional bridge across browser profiles. */
(function() {
    'use strict';
    const M = MultiviewModel;
    const B = MultiviewBuilder;
    const control = document.body.classList.contains('config-page');
    const query = M.urlParameters(location.href);
    let screenIndex = Math.min(M.MAX_SCREENS - 1, Math.max(0, Math.floor(Number(query.get('Screen')) || 1) - 1));
    let applying = false;
    let receiving = false;
    let building = false;
    let readingInputs = 0;
    let htmlRepairQueued = false;
    const htmlRepairAttempts = new Set();
    let state;
    let channel;
    let bridge = false;
    let displayBridgeLoaded = false;
    let bridgeBusy = false;
    let bridgeWriteTimer;
    let nextBridgeProbe = 0;
    const bridgeBases = M.syncBases(location.href);
    let bridgeBase = bridgeBases[0];
    const bridgeURL = () => new URL('control-api?PC=' + encodeURIComponent(state.pc), bridgeBase).href;
    const presenceURL = () => new URL('presence-api?PC=' + encodeURIComponent(state.pc), bridgeBase).href;
    const session = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2);
    const pageReports = new Map();
    const key = pc => 'multiview.pc.' + pc;
    const read = name => { try { return JSON.parse(localStorage.getItem(name)); } catch (_) { return null; } };
    const notice = message => { $('#studioNotice').text(message); };
    const snapshotScreen = () => {
        // A newly added screen may not exist in this browser's older PC cache.
        const previous = state && state.screens[screenIndex] || {};
        return {
            inputs: M.clone(vMixSettings.multiViewInputs),
            extras: extras.map(extra => Object.fromEntries(saveSettings.map(name => [name, extra[name]]).filter(pair => pair[1] !== undefined))),
            tiles: mySettingMask.map(entry => {
                const value = normalizeTileSettings(entry);
                // Missing legacy VU values inherit the source's default after XML arrives.
                if(vMixSettings.hideOutputAudioByDefault && !(entry.value && typeof entry.value === 'object' && Object.hasOwn(entry.value, 'vu')) &&
                    !(typeof entry.value === 'string' && entry.value.includes('multiViewBoxMask'))) delete value.vu;
                return {key: entry.key, value};
            }),
            layout: previous.layout || [],
            ...(vMixSettings.theme && vMixSettings.theme !== 'classic' || previous.theme ? {theme: vMixSettings.theme} : {}),
            ...(vMixSettings.hideOutputAudioByDefault ? {hideOutputAudioByDefault: true} : {}),
            ...(previous.spacing !== undefined ? {spacing: previous.spacing} : {}),
            ...(previous.managed ? {managed: previous.managed} : {}),
            ...(previous.layerSources && previous.layerSources.length ? {layerSources: previous.layerSources} : {}),
            ...(previous.videoInputs && previous.videoInputs.length ? {videoInputs: previous.videoInputs} : {})
        };
    };
    let fromURL;
    try { if(query.get('Config')) fromURL = M.unpack(JSON.parse(query.get('Config'))); }
    catch (_) { /* Legacy parameters remain available. */ }
    const hasLegacy = ['Input', 'Inputs', 'Input2', 'Settings', 'MaskSettings'].some(name => query.has(name));
    vMixSettings.theme = M.themes.some(t => t.id === query.get('Theme')) ? query.get('Theme') : hasLegacy ? 'classic' : 'openmultiview';
    const legacyOnly = hasLegacy && !fromURL && !query.get('PC');
    const legacyStandalone = legacyOnly && !control;
    vMixSettings.hideOutputAudioByDefault = legacyOnly;
    const pc = query.get('PC') || (legacyOnly ? M.legacyPC(query) : 'regie');
    let stored;
    try { const raw = read(key(pc)); if(raw) stored = M.validate(raw); } catch (_) {}
    const initialScreen = snapshotScreen();
    state = fromURL || stored || {version: 1, pc, host: vMixSettings.IP, port: vMixSettings.port, updated: 0, screens: [initialScreen]};
    if (fromURL && stored && stored.pc === fromURL.pc && stored.updated > fromURL.updated) state = stored;
    // Explicit old URLs still recall their original settings.
    if (!fromURL && hasLegacy && (legacyOnly || !stored || screenIndex >= stored.screens.length)) {
        state = {version: 1, pc, host: vMixSettings.IP, port: vMixSettings.port, updated: 0,
            screens: Array.from({length: screenIndex + 1}, (_, i) => i === screenIndex ? initialScreen : M.screen())};
    }
    if(control && screenIndex >= state.screens.length) screenIndex = 0;

    function url(index, config = false) {
        return M.recallURL(location.href, state, index, {configPage: config, inputs: vMixInputs, language: window.OpenMultiviewI18n?.language()});
    }
    async function browserURL(index) {
        if(!bridge) return url(index);
        // Save before navigating CEF. A short PC/screen link also keeps the
        // BrowserNavigate API command below vMix's request-size limit.
        clearTimeout(bridgeWriteTimer);
        const response = await fetchWithTimeout(bridgeURL(), {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(state)});
        if(!response.ok) throw new Error('La configuration locale n’a pas pu être enregistrée avant le chargement de la source HTML.');
        return M.recallURL(location.href, state, index, {linked: true, language: window.OpenMultiviewI18n?.language()});
    }
    function links() {
        const expanded = new Set($('#screenLinks details[open]').map(function() { return this.dataset.screen; }).get());
        const box = $('#screenLinks').empty();
        state.screens.forEach((s, i) => {
            const row = $('<div class="recall-row">');
            const heading = $('<div class="recall-heading">').append($('<strong>').text('Écran ' + (i + 1))).appendTo(row);
            const actions = $('<div class="recall-actions">').appendTo(heading);
            $('<a class="button-link" target="_blank" rel="noopener">').attr('href', url(i)).text('Ouvrir écran ' + (i + 1)).appendTo(actions);
            const details = $('<details>').attr('data-screen', i).prop('open', expanded.has(String(i))).append($('<summary>').text('Voir l’URL complète')).appendTo(row);
            $('<textarea readonly rows="3">').attr('aria-label', 'URL de rappel écran ' + (i + 1)).val(url(i)).appendTo(details);
            $('<button type="button">Copier l’URL</button>').on('click', async () => {
                try { await navigator.clipboard.writeText(url(i)); notice('URL copiée.'); }
                catch (_) { details.prop('open', true); row.find('textarea')[0].select(); document.execCommand('copy'); }
            }).appendTo(actions);
            row.appendTo(box);
        });
        // A fresh CEF profile may request screen 2 before the bridge has sent
        // that screen. Keep a valid configuration link during this first poll.
        const currentIndex = Math.min(screenIndex, state.screens.length - 1);
        $('#saveURL').val(url(currentIndex));
        $('#openCurrentScreen').attr('href', url(currentIndex));
        $('#configureLink').attr('href', url(currentIndex, true));
        if(control) history.replaceState(null, '', url(currentIndex, true));
    }
    window.addEventListener('openmultiview-language', links);
    function publish() {
        if(receiving || building || !control) return;
        const next = snapshotScreen();
        const changed = JSON.stringify(next) !== JSON.stringify(state.screens[screenIndex]);
        state.screens[screenIndex] = next;
        if(changed || !state.updated) {
            state.updated = M.nextUpdate(state.updated);
            persist();
        }
        links();
    }
    function persist() {
        try { localStorage.setItem(key(state.pc), JSON.stringify(state)); }
        catch (_) { notice('Stockage local indisponible : conservez les URL de rappel.'); }
        if(channel) channel.postMessage(state);
        if(bridge && control) {
            clearTimeout(bridgeWriteTimer);
            bridgeWriteTimer = setTimeout(async () => {
                try {
                    const response = await fetchWithTimeout(bridgeURL(), {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(state)});
                    if(!response.ok) throw new Error('Sauvegarde refusée');
                    receive(await response.json());
                } catch (_) { notice('Serveur local indisponible. Les URL conservent les réglages ; relancez node server.js.'); }
            }, 150);
        }
    }
    function syncExtras() {
        extras.forEach(e => {
            $('#' + e.name + 'Enable').prop('checked', e.enabled);
            $('#' + e.name + 'Color').val(e.color || '#ffffff');
            $('#' + e.name + 'FontSize').val(e.fontSize);
            ['Zoom', 'PanX', 'PanY'].forEach(prop => {
                const value = e[prop === 'Zoom' ? 'zoomX' : prop === 'PanX' ? 'panX' : 'panY'] / 100;
                $('#' + e.name + prop + 'Number, #' + e.name + prop + 'Slider').val(value);
            });
        });
    }
    function loadScreen() {
        receiving = true;
        if(screenIndex >= state.screens.length) {
            multiViewOverlays = [];
            vMixSettings.multiViewInputs = [];
            extras.forEach(e => e.enabled = false);
            refresh();
            $('.warning').text('Écran ' + (screenIndex + 1) + ' désactivé depuis la configuration').show();
            receiving = false;
            return;
        }
        const s = state.screens[screenIndex];
        vMixSettings.theme = M.themeFor(s);
        vMixSettings.textStyle = state.textStyle;
        vMixSettings.roleBadges = state.roleBadges;
        vMixSettings.IP = state.host;
        vMixSettings.port = state.port;
        vMixSettings.multiViewInputs = M.clone(s.inputs);
        vMixSettings.multiViewInput = s.inputs[0];
        vMixSettings.managedLayers = M.activeLayersFor(s, vMixInputs);
        vMixSettings.layerLayout = M.clone(M.layoutFor(s, vMixInputs));
        vMixSettings.generatedInputs = s.managed ? [s.managed.root, ...s.managed.parts].filter(Boolean) : [];
        vMixSettings.layerSources = M.clone(s.layerSources || []);
        vMixSettings.hideOutputAudioByDefault = s.hideOutputAudioByDefault === true;
        mySettingMask = M.clone(s.tiles);
        s.extras.forEach((e, i) => { if(extras[i]) saveSettings.forEach(k => { if(e[k] !== undefined) extras[i][k] = e[k]; }); });
        syncExtras();
        multiViewOverlays = [];
        if(lastResponse) {
            vMixRefresh(lastResponse);
            // An empty collection compares equal after the reset above, so the
            // renderer does not refresh by itself when the last layer is off.
            if(!multiViewOverlays.length) refresh();
        }
        else refresh();
        receiving = false;
        $('#pcName').val(state.pc);
        $('#vmixHost').val(state.host);
        $('#vmixPort').val(state.port);
        $('#screenCount').val(state.screens.length);
        $('#activeScreen').empty();
        state.screens.forEach((s, i) => $('#activeScreen').append(new Option('Écran ' + (i + 1), i, false, i === screenIndex)));
        links();
        if(control) { renderThemeControls(); renderBuilderSources(); renderConnections(); }
    }
    function receive(value, authoritative = false) {
        if(legacyStandalone) return;
        try {
            const incoming = M.validate(value);
            if(control && building) return;
            if(incoming.pc !== state.pc || !authoritative && incoming.updated <= state.updated) return;
            if(authoritative && JSON.stringify(incoming) === JSON.stringify(state)) return;
            state = incoming;
            try { localStorage.setItem(key(state.pc), JSON.stringify(state)); } catch (_) {}
            if(control && screenIndex >= state.screens.length) screenIndex = 0;
            loadScreen();
        } catch (_) { notice('Configuration reçue invalide.'); }
    }
    function connect() {
        if(channel) channel.close();
        if(legacyStandalone) return;
        if(typeof BroadcastChannel !== 'undefined') {
            channel = new BroadcastChannel(key(state.pc));
            channel.onmessage = event => event.data && event.data.type === 'multiview-presence' ? receiveReport(event.data) : receive(event.data);
        }
    }
    function receiveReport(report) {
        if(!control || report.pc !== state.pc || !report.session) return;
        if(report.closed) pageReports.delete(report.session);
        else pageReports.set(report.session, {...report, seenAt: Date.now()});
        renderConnections();
    }
    function renderConnections() {
        if(!control) return;
        const now = Date.now();
        const box = $('#displayConnections').empty();
        state.screens.forEach((s, i) => {
            const clients = [...pageReports.values()].filter(r => r.screen === i + 1 && r.enabled && now - r.seenAt < 12000);
            const ready = clients.filter(r => r.vmixConnected && r.hasLayers && r.configUpdated >= state.updated);
            const status = !clients.length ? 'waiting' : ready.length ? 'connected' : 'warning';
            const text = !clients.length ? 'Page non connectée' : ready.length ? 'Page connectée · vMix OK' : clients.some(r => !r.vmixConnected) ? 'Page connectée · vMix indisponible' : clients.some(r => !r.hasLayers) ? 'Page connectée · aucune vignette' : 'Page connectée · synchronisation en cours';
            $('<div class="display-connection">').attr('data-status', status).append($('<strong>').text('Écran ' + (i + 1)), $('<span>').text(text)).appendTo(box);
        });
    }
    function heartbeat(closed = false) {
        if(control || legacyStandalone) return;
        const report = {type: 'multiview-presence', pc: state.pc, session, screen: screenIndex + 1, configUpdated: state.updated,
            vmixConnected: Date.now() - vMixSettings.lastApiSuccess < 3500, hasLayers: multiViewOverlays.length > 0, enabled: screenIndex < state.screens.length, time: Date.now(), closed};
        if(channel) channel.postMessage(report);
        const storageKey = key(state.pc) + '.presence.' + session;
        try { if(closed) localStorage.removeItem(storageKey); else localStorage.setItem(storageKey, JSON.stringify(report)); } catch (_) {}
        if(bridge) {
            if(closed && navigator.sendBeacon) navigator.sendBeacon(presenceURL(), new Blob([JSON.stringify(report)], {type: 'application/json'}));
            else fetchWithTimeout(presenceURL(), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(report)}).catch(() => {});
        }
    }
    async function pollPresence() {
        if(!control) { heartbeat(); return; }
        if(bridge) {
            try {
                const response = await fetchWithTimeout(presenceURL(), {cache: 'no-store'}, 2500);
                if(response.ok) {
                    const reports = await response.json();
                    reports.forEach(r => pageReports.set(r.session, {...r, pc: state.pc}));
                }
            } catch (_) {}
        }
        renderConnections();
    }
    setInterval(pollPresence, 2000);
    window.addEventListener('pagehide', () => heartbeat(true));
    async function pollBridge() {
        if(bridgeBusy || legacyStandalone) return;
        bridgeBusy = true;
        try {
            let found;
            for(const base of bridge ? [bridgeBase] : bridgeBases) {
                try {
                    const response = await fetchWithTimeout(new URL('control-api?PC=' + encodeURIComponent(state.pc), base).href, {cache: 'no-store'}, 1500);
                    if(!response.ok) continue;
                    const remote = await response.json();
                    if(remote !== null) M.validate(remote);
                    found = {base, remote};
                    break;
                } catch (_) { /* Try the local bridge after a static server. */ }
            }
            if(!found) {
                if(control) {
                    $('.local-badge').text(bridge ? 'Synchronisation interrompue' : 'Serveur de synchronisation requis').removeClass('is-connected').addClass('is-warning');
                    $('#syncHelp').empty().append(document.createTextNode('Lancez le compagnon OpenMultiview sur ce PC (start-openmultiview.cmd ou node server.js). Les sites officiels et les pages locales détectent le port 8090. Autorisez l’accès au réseau local si votre navigateur le demande. '), $('<a>').attr('href', 'guide.html#installation').text('Guide d’installation'));
                }
                return;
            }
            const remote = found.remote;
            const firstConnection = !bridge;
            bridgeBase = found.base;
            bridge = true;
            if(remote && firstConnection && control && legacyOnly) {
                // Explicit import restores the old URL without replacing another PC.
                state.updated = M.nextUpdate(Math.max(state.updated, remote.updated));
            } else if(remote && firstConnection && control && !fromURL && !stored) {
                state = M.validate(remote);
                if(control && screenIndex >= state.screens.length) screenIndex = 0;
                loadScreen();
            } else if(remote) {
                receive(remote, !control && !displayBridgeLoaded);
                if(!control) displayBridgeLoaded = true;
            }
            if(control && (!remote || remote.updated < state.updated) && !firstConnection) persist();
            if(control) {
                $('.local-badge').text('Synchronisation locale active').removeClass('is-warning').addClass('is-connected');
                $('#syncHelp').text('Chrome et les navigateurs vMix se synchronisent via ' + bridgeBase + '. Les réglages sont conservés sur ce PC.');
                if(firstConnection) { htmlRepairAttempts.clear(); persist(); }
            }
            if(firstConnection) pollPresence();
        } catch (_) { /* Static hosting keeps same-profile synchronization. */ }
        finally { bridgeBusy = false; }
    }
    pollBridge();
    setInterval(() => { if(bridge || Date.now() >= nextBridgeProbe) { nextBridgeProbe = Date.now() + 5000; pollBridge(); } }, 1000);
    window.addEventListener('storage', event => {
        if(event.key && event.key.startsWith(key(state.pc) + '.presence.')) {
            if(event.newValue) { try { receiveReport(JSON.parse(event.newValue)); } catch (_) {} }
            else { pageReports.delete(event.key.slice((key(state.pc) + '.presence.').length)); renderConnections(); }
            return;
        }
        if(event.key === key(state.pc) && event.newValue) {
            try { receive(JSON.parse(event.newValue)); } catch (_) {}
        }
    });

    const oldRefresh = refresh;
    refresh = function() { oldRefresh(); if(control) { publish(); renderLayerFields(); drawPreview(); renderBuilderSources(); if(building) $('.config-page input, .config-page select, .config-page button').prop('disabled', true); } else links(); };
    const oldPanel = renderSelectedInputPanel;
    renderSelectedInputPanel = function() {
        const wanted = vMixSettings.selectedInputKey;
        oldPanel();
        if(control) {
            if(editableLayers().some(l => l.layerKey === wanted)) vMixSettings.selectedInputKey = wanted;
            renderLayerPicker(); renderLayerFields();
        }
    };
    const oldMenu = openLayerContextMenu;
    openLayerContextMenu = function(event, element) { if(control) return oldMenu(event, element); return false; };

    if(!control) {
        $('.hideContainer').html('<a id="configureLink" class="settingsHandle" target="_blank" rel="noopener">Configuration ↗</a>');
        connect();
        loadScreen();
        heartbeat();
        return;
    }

    $('.settingsHandle, .settingsURL').remove();
    const extraSettings = $('.settings').detach();
    const sources = extraSettings.find('.sources').detach();
    const sourceSettings = sources.find('.sourceSettings').detach();
    const panel = sources.find('#selectedInputPanel').detach().addClass('studio-card');
    $('.hideContainer').append(`
        <header class="studio-header"><div class="studio-heading"><a class="app-brand" href="home.html"><span class="app-brand-mark"><img src="assets/openmultiview-icon.png" alt="" width="48" height="48"></span>OpenMultiview</a><h1>Votre régie, à votre mesure.</h1></div><div class="studio-header-tools"><a href="guide.html" class="guide-link">Guide de démarrage ↗</a><span class="local-badge">Contrôle sur ce PC</span></div></header>
        <div class="screen-toolbar"><label class="field"><span>Écran</span><select id="activeScreen" aria-label="Écran à configurer"></select></label><span id="screenContext" class="screen-context"></span><a id="openCurrentScreen" class="button-link" target="_blank" rel="noopener" aria-label="Ouvrir cet écran"><span class="desktop-label">Ouvrir cet écran</span><span class="compact-label">Ouvrir</span> ↗</a></div>
        <nav class="studio-nav" role="tablist" aria-label="Configuration du multiview">
        <button type="button" role="tab" id="tab-layouts" data-view="layouts" aria-controls="view-layouts">Disposition</button>
        <button type="button" role="tab" id="tab-layers" data-view="layers" aria-controls="view-layers">Sources & layers</button>
        <button type="button" role="tab" id="tab-options" data-view="options" aria-controls="view-options">Horloge & infos</button>
        <button type="button" role="tab" id="tab-connection" data-view="connection" aria-controls="view-connection">Connexion</button>
        <button type="button" role="tab" id="tab-recall" data-view="recall" aria-controls="view-recall">Sauvegarde & URL</button></nav>
        <p id="studioNotice" role="status" aria-live="polite"></p>
        <div class="workspace"><main>
        <section class="studio-view" id="view-layouts" role="tabpanel" aria-labelledby="tab-layouts"><section class="studio-card theme-card" aria-labelledby="themeHeading"><div class="section-intro"><span class="section-kicker">01 / HABILLAGE</span><h2 id="themeHeading">Le style de cet écran</h2><p>Un thème par écran, conservé dans vos modèles et vos URL.</p></div><div id="themeChoices" class="theme-choices" role="group" aria-label="Thème du multiview"></div><p class="theme-help">Appliqué immédiatement aux pages connectées. Vos réglages de texte, d’audio et vos couleurs personnalisées sont conservés.</p>
        <label class="role-badge-control"><input type="checkbox" id="allRoleBadges"><span><strong>Afficher PROGRAM/PREVIEW en haut</strong><small>Applique ce choix à tous les écrans de ce PC. Chaque layer peut ensuite être réglé séparément.</small></span></label>
        <fieldset class="shared-text-settings"><legend>Texte de toutes les vignettes</legend><p>Réglages communs à tous les écrans de ce PC, en Classique comme en OpenMultiview.</p><div class="style-grid">
        <label class="style-field">Position du texte<select id="sharedTitlePosition"><option value="overlay-bottom">Sur l’image, en bas</option><option value="overlay-top">Sur l’image, en haut</option><option value="below">Sous la vignette</option><option value="above">Au-dessus</option></select></label>
        <label class="style-field">Fond du texte<select id="sharedTitleBackground"><option value="true">Avec fond</option><option value="false">Transparent</option></select></label>
        <label class="style-field">Taille du texte<input id="sharedTitleFontSize" type="number" min="8" max="100" step="1"></label></div>
        <small>Avec un fond transparent, le tally colore le texte.</small><div class="shared-text-actions"><button id="applySharedText" class="primary-button" type="button">Appliquer à tous les écrans</button><small>Remplace ces trois réglages sur toutes les vignettes. Vous pouvez ensuite ajuster chaque layer.</small></div></fieldset></section><div class="studio-card"><div class="section-intro"><span class="section-kicker">02 / DISPOSITION</span><h2>Modèles de disposition</h2><p>Vignettes 16:9. Choisissez un modèle pour créer les entrées nécessaires dans vMix.</p></div>
        <div class="spacing-controls"><label for="presetSpacing">Espacement entre les vignettes</label><div class="spacing-inputs"><input id="presetSpacingSlider" type="range" min="0" max="20" step="1" aria-label="Espacement des vignettes" aria-describedby="spacingHelp"><div class="spacing-number"><input id="presetSpacing" type="number" min="0" max="20" step="1" aria-label="Espacement en pourcentage" aria-describedby="spacingHelp"><span>%</span></div><button id="applySpacing" type="button">Appliquer l’espacement</button></div><small id="spacingHelp">0 % réduit les marges au minimum. Ajoutez de l’espace pour du texte ou des vumètres placés à l’extérieur.</small></div>
        <div class="layout-filters" role="group" aria-label="Filtrer les dispositions"><button type="button" data-layout-filter="all" aria-pressed="true">Tous</button><button type="button" data-layout-filter="production" aria-pressed="false">Avec PGM / PVW</button><button type="button" data-layout-filter="grid" aria-pressed="false">Grilles</button><button type="button" data-layout-filter="dual" aria-pressed="false">2 écrans</button></div><div id="layoutGallery" class="layout-gallery"></div></div>
        <section class="studio-card"><div class="builder-header"><div><span class="section-kicker">03 / SOURCES</span><h2>Sources du preset</h2><p>Sans sélection, les sources sont affectées automatiquement.</p></div><button id="autoAssignSources" type="button" class="subtle-button">Affectation automatique</button></div>
        <div class="builder-controls"><select id="buildSources" multiple hidden aria-label="Sources vidéo à utiliser"></select>
        <div class="source-search"><label class="field">Rechercher une source<input id="sourceSearch" type="search" placeholder="Nom ou numéro de l’entrée"></label><button id="selectAllSources" type="button">Tout sélectionner</button></div><div id="sourceChoices" class="source-choices" role="group" aria-label="Sources vidéo à utiliser"></div><p id="sourceSelectionCount"></p><small>Si le preset contient moins de vignettes que votre sélection, les premières sources sont utilisées et les layers en trop sont désactivés.</small></div></section></section>
        <section class="studio-view" id="view-layers" role="tabpanel" aria-labelledby="tab-layers" hidden><div class="section-intro"><h2>Sources & habillage des layers</h2><p>Choisissez une vignette pour changer sa source, son texte, son tally ou son vumètre.</p></div>
        <section class="studio-card html-source-card" id="htmlLayerCard" aria-labelledby="htmlSourceTitle"><div class="html-source-heading"><span class="layer-number">10</span><div><h3 id="htmlSourceTitle">Source HTML du multiview</h3><p id="htmlSourceParent"></p></div><span id="htmlSourceStatus" class="html-source-status"></span></div><div class="html-source-binding"><strong id="htmlSourceInput"></strong><code id="htmlSourceID"></code><p>Habillage en plein écran, au-dessus des vignettes. Ce layer reste réservé à la page web de cet écran.</p></div><div class="html-source-actions"><button id="repairHTML" type="button" class="primary-button" hidden>Créer la source HTML</button><button id="refreshHTMLPage" type="button" hidden>Actualiser dans vMix</button><a id="openHTMLSource" target="_blank" rel="noopener">Ouvrir la page HTML</a></div></section>
        <div class="layer-workspace"><section class="studio-card layers-card"><h2>Vignettes de cet écran</h2><div id="layerList" class="layer-list"></div><details id="inactiveLayers" class="inactive-layers" hidden><summary id="inactiveLayersSummary">Layers désactivés</summary><div id="inactiveLayerList" class="layer-list"></div></details></section><div id="layerEditor"></div></div><section class="studio-card" id="sourceStructure"><div class="section-intro"><h2>Entrées du multiview</h2><p>Les regroupements sont parcourus automatiquement. Les entrées navigateur sont exclues des vignettes.</p></div><div id="sourceSettingsSlot"></div><details class="managed-details"><summary>Identifiants vMix conservés</summary><p id="managedInputsInfo"></p></details></section></section>
        <section class="studio-view" id="view-options" role="tabpanel" aria-labelledby="tab-options" hidden><div class="section-intro"><h2>Horloge & informations</h2><p>Réglez les informations supplémentaires pour cet écran.</p></div><div id="extraSettingsSlot"></div></section>
        <section class="studio-view" id="view-connection" role="tabpanel" aria-labelledby="tab-connection" hidden><section class="studio-card connection"><div class="section-intro"><h2>Connexion & écrans</h2><p>Ces réglages sont associés au PC de la régie.</p></div><div class="field-grid">
        <label class="field">Identifiant de ce PC<input id="pcName" maxlength="80"><small>Un nom pour retrouver cette configuration.</small></label><label class="field">Adresse vMix<input id="vmixHost" placeholder="127.0.0.1"><small>127.0.0.1 si vMix fonctionne sur ce PC.</small></label>
        <label class="field">Port API<input id="vmixPort" type="number" min="1" max="65535"></label><label class="field">Nombre d’écrans<input id="screenCount" type="number" min="1" max="${M.MAX_SCREENS}" step="1"><small>Ouvrez une page web par écran.</small></label></div><button id="saveConnection" type="button" class="primary-button">Enregistrer la connexion</button>
        <details class="help-details"><summary>Démarrage et synchronisation</summary><p id="syncHelp">Lancez le compagnon OpenMultiview sur le PC vMix pour synchroniser les pages web. Sans compagnon, conservez les URL de rappel et utilisez le même profil navigateur.</p></details></section></section>
        <section class="studio-view" id="view-recall" role="tabpanel" aria-labelledby="tab-recall" hidden><section class="studio-card"><div class="section-intro"><h2>Modèles personnalisés</h2><p>Mémorisez la disposition, les sources et l’habillage de tous vos écrans.</p></div><div class="preset-actions"><label class="field">Nom du modèle<input id="presetName" placeholder="Ex. Régie conférence" aria-label="Nom du modèle"></label><button id="savePreset" type="button" class="primary-button">Mémoriser les écrans</button></div><div class="preset-actions preset-recall"><label class="field">Modèles enregistrés<select id="savedPresets" aria-label="Modèles enregistrés"></select></label><button id="recallPreset" type="button">Rappeler</button><button id="deletePreset" type="button" class="danger-button">Supprimer</button></div></section>
        <section class="studio-card"><div class="section-intro"><h2>Positions personnalisées</h2><p>Après un ajustement dans vMix, mémorisez les positions de l’écran sélectionné.</p></div><div class="position-actions"><button id="captureLayout" type="button">Mémoriser les positions vMix actuelles</button><button id="applyLayout" type="button">Appliquer les positions mémorisées dans vMix</button></div></section>
        <section class="studio-card"><div class="section-intro"><h2>URL de rappel</h2><p>Copiez chaque URL dans sa source HTML vMix, placée au layer 10 de l’entrée principale de cet écran. Enregistrez aussi le preset vMix pour conserver les vidéos et leurs IDs.</p></div><div id="screenLinks"></div></section></section>
        </main><aside class="workspace-aside"><section class="studio-card preview-card"><div><h2 id="previewHeading">Plan des layers</h2><p>Cliquez une vignette pour la configurer.</p></div><div id="layoutPreview"></div></section><section class="studio-card"><h2>Pages multiview</h2><p id="htmlLayerInfo" class="source-help"></p><div id="displayConnections" class="display-connections"></div></section></aside></div>
    `);
    extraSettings.appendTo('#extraSettingsSlot');
    sourceSettings.appendTo('#sourceSettingsSlot');
    panel.appendTo('#layerEditor');
    [['pcName', 'Identifiant de ce PC'], ['vmixHost', 'Adresse vMix'], ['screenCount', 'Nombre d’écrans']].forEach(([id, label]) => {
        $('#' + id).attr({'aria-label': label, 'aria-describedby': id + 'Help'}).parent().find('small').attr('id', id + 'Help');
    });
    extraSettings.find('.settingsHeader').each(function() {
        const labels = {Sources: 'Sources & layers', Clock: 'Horloge', Status: 'État vMix', 'Count-down': 'Décompte'};
        $(this).text(labels[$(this).text()] || $(this).text());
    });
    sourceSettings.append('<p class="source-help">Ajoutez seulement les entrées qui composent cet écran. Leurs IDs sont conservés.</p>');
    panel.find('#tileLayerSelect').attr({hidden: true, 'aria-hidden': 'true', tabindex: -1});
    panel.find('.tileSettingsTitle').append('<h2 id="layerEditorTitle">Layer à configurer</h2>');
    panel.find('.tileSettingsTitle').after('<div id="layerDetails" class="layer-details"></div>');
    const flags = $('<fieldset class="tile-fieldset"><legend>Affichage</legend><div class="tile-flags"></div></fieldset>');
    panel.children('label').appendTo(flags.find('.tile-flags'));
    flags.appendTo(panel);
    panel.find('.tileSettingsTitle').after('<label class="style-field layer-source-field">Source du layer<select id="layerSourceSelect" aria-label="Source du layer"></select><small>Choisir une source l’affecte directement dans vMix. « Aucune source » désactive le layer.</small></label>');
    const styleGroups = {};
    [['text', 'Texte de la vignette'], ['audio', 'Audio'], ['frame', 'Tally & cadre']].forEach(([id, title]) => {
        styleGroups[id] = $('<fieldset class="tile-fieldset">').append($('<legend>').text(title), $('<div class="style-grid">')).appendTo(panel).find('.style-grid');
    });
    const choice = (name, label, options, group = 'text') => {
        const row = $('<label class="style-field">').text(label);
        const select = $('<select>').attr('data-tile-style', name);
        options.forEach(([value, text]) => select.append(new Option(text, value)));
        row.append(select).appendTo(styleGroups[group]);
        if(group === 'audio') row.addClass('wide-field');
    };
    choice('titlePosition', 'Position du texte', [['overlay-bottom', 'Sur l’image, en bas'], ['overlay-top', 'Sur l’image, en haut'], ['below', 'Sous la vignette'], ['above', 'Au-dessus']]);
    choice('titleBackground', 'Fond du texte', [['true', 'Avec fond'], ['false', 'Transparent']]);
    choice('vuPosition', 'Position du vumètre', [['inside-left', 'Dans l’image, à gauche'], ['inside-right', 'Dans l’image, à droite'], ['outside-left', 'À gauche de la vignette'], ['outside-right', 'À droite de la vignette']], 'audio');
    const styleLabels = {borderWidth: 'Épaisseur du cadre', borderColor: 'Couleur du cadre', previewColor: 'Tally preview', programColor: 'Tally programme'};
    [{setting: 'titleFontSize', label: 'Taille du texte', type: 'number', min: 8, max: 100}, ...getLayerStyleControls()].forEach(item => {
        const row = $('<label class="style-field">').text(styleLabels[item.setting] || item.label);
        $('<input>').attr({type: item.type, min: item.min, max: item.max, 'data-tile-style': item.setting}).appendTo(row);
        row.appendTo(styleGroups[item.setting === 'titleFontSize' ? 'text' : 'frame']);
    });
    styleGroups.text.append('<small class="wide-field">Avec un fond transparent, le tally colore le texte.</small>');
    const viewNames = ['layouts', 'layers', 'options', 'connection', 'recall'];
    function renderThemeControls() {
        const theme = M.themeFor(state.screens[screenIndex]);
        $('#themeChoices button[data-theme]').each(function() { $(this).attr('aria-pressed', String(this.dataset.theme === theme)); });
        $('#layoutPreview').attr('data-theme', theme);
        $('#allRoleBadges').prop('checked', M.tileDefaultsFor(theme, state.textStyle, state.roleBadges).roleBadge);
        const text = M.textStyleFor(state);
        $('#sharedTitlePosition').val(text.titlePosition);
        $('#sharedTitleBackground').val(String(text.titleBackground));
        $('#sharedTitleFontSize').val(text.titleFontSize);
    }
    $('#allRoleBadges').on('change', function() {
        if(building || applying) return;
        publish();
        state = M.applyRoleBadges(state, this.checked, vMixInputs);
        state.updated = M.nextUpdate(state.updated);
        persist(); loadScreen();
        notice('Affichage des repères mis à jour sur tous les écrans de ce PC.');
    });
    $('#applySharedText').on('click', () => {
        if(building || applying) return;
        const style = {titlePosition: $('#sharedTitlePosition').val(), titleBackground: $('#sharedTitleBackground').val() === 'true', titleFontSize: Number($('#sharedTitleFontSize').val())};
        try {
            publish();
            state = M.applyTextStyle(state, style, vMixInputs);
            state.updated = M.nextUpdate(state.updated);
            persist(); loadScreen();
            notice('Réglages du texte appliqués à tous les écrans de ce PC.');
        } catch(error) { notice(error.message); }
    });
    M.themes.forEach(t => {
        $('<button type="button" class="theme-choice">').attr({'data-theme': t.id, 'aria-label': 'Thème ' + t.name, 'aria-pressed': 'false'})
            .append($('<span class="theme-sample" aria-hidden="true">').attr('data-theme', t.id).html('<i class="sample-preview"><span>PREVIEW</span></i><i class="sample-program"><span>PROGRAM</span></i>'),
                $('<span class="theme-caption">').append($('<strong>').text(t.name), $('<small>').text(t.description)), $('<span class="theme-check" aria-hidden="true">✓</span>'))
            .on('click', () => {
                if(building || applying) return;
                publish();
                const current = state.screens[screenIndex];
                if(M.themeFor(current) === t.id) return;
                mySettingMask = M.changeTheme(mySettingMask, M.themeFor(current), t.id);
                vMixSettings.theme = t.id;
                current.theme = t.id;
                current.tiles = M.clone(mySettingMask);
                // Theme-only changes must advance the bridge revision even if
                // the screen has no per-layer overrides yet.
                state.updated = M.nextUpdate(state.updated);
                persist(); loadScreen();
                notice('Thème ' + t.name + ' appliqué à l’écran ' + (screenIndex + 1) + '.');
            }).appendTo('#themeChoices');
    });
    $('.layout-filters').on('click', '[data-layout-filter]', function() {
        const filter = this.dataset.layoutFilter;
        $('.layout-filters [data-layout-filter]').each(function() { $(this).attr('aria-pressed', String(this.dataset.layoutFilter === filter)); });
        $('.layout-choice').each(function() { this.hidden = filter !== 'all' && this.dataset.category !== filter; });
    });
    function showView(name, focus = false, scrollToTop = false) {
        if(!viewNames.includes(name)) name = 'layouts';
        $('.studio-view').each(function() { this.hidden = this.id !== 'view-' + name; });
        $('.studio-nav [data-view]').each(function() { const active = this.dataset.view === name; $(this).attr({'aria-selected': String(active), tabindex: active ? 0 : -1}); if(active && focus) this.focus(); });
        if(scrollToTop) window.scrollTo(0, 0);
        try { localStorage.setItem(key(state.pc) + '.view', JSON.stringify(name)); } catch (_) {}
    }
    $('.studio-nav').on('click', '[data-view]', function() { showView(this.dataset.view, false, true); }).on('keydown', '[data-view]', function(event) {
        if(!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const n = viewNames.indexOf(this.dataset.view);
        showView(event.key === 'Home' ? viewNames[0] : event.key === 'End' ? viewNames.at(-1) : viewNames[(n + (event.key === 'ArrowRight' ? 1 : -1) + viewNames.length) % viewNames.length], true, true);
    });
    showView(read(key(state.pc) + '.view') || 'layouts');
    const oldSources = renderSourceInputs;
    renderSourceInputs = function() {
        oldSources();
        $('#sourceInputsList .sourceInputRow').each(function(n) {
            const input = M.resolveSource(vMixInputs, vMixSettings.multiViewInputs[n]);
            if(input) $('<div class="source-input-detail">').append($('<span>').text(input.title), $('<code>').text('ID vMix : ' + input.key)).appendTo(this);
        });
    };
    extraSettings.find('.settingGroup').each(function() {
        const prefix = $(this).find('input[id$="Enable"]').attr('id').replace(/Enable$/, '');
        ['Zoom', 'PanX', 'PanY'].forEach(prop => {
            $('#' + prefix + prop + 'Number').attr('aria-label', prefix + ' · ' + prop);
        });
    });
    const flagLabels = {tileEnabled: 'Habillage visible', tileTally: 'Couleurs tally', tileName: 'Nom de la source', tileRoleBadge: 'Repère PROGRAM/PREVIEW en haut', tileVU: 'Vumètre', tileTimer: 'Décompte vidéo / infos liste', tileFrame: 'Cadre'};
    Object.entries(flagLabels).forEach(([id, label]) => {
        $('#' + id).parent().contents().filter(function() { return this.nodeType === Node.TEXT_NODE; }).remove();
        $('#' + id).parent().append(document.createTextNode(label));
    });
    let layerListSignature;
    let sourceChoicesSignature;
    let controlLayersSignature;
    let gallerySpacing;
    function renderTemplatePreviews(spacing) {
        if(gallerySpacing === spacing) return;
        gallerySpacing = spacing;
        $('.layout-choice').each(function() {
            const template = M.templates.find(t => t.id === this.dataset.template);
            const slots = template.slots || M.templates.find(t => t.id === template.screens[0]).slots;
            const frames = M.templateFrames(slots, spacing);
            $(this).find('.layout-mini i').each(function(n) {
                const frame = frames[n];
                $(this).css({left: frame.x * 100 + '%', top: frame.y * 100 + '%', width: frame.w * 100 + '%', height: frame.h * 100 + '%'});
            });
        });
    }
    function selectLayer(layerKey) {
        vMixSettings.selectedInputKey = layerKey;
        showView('layers', false, $('#tab-layers').attr('aria-selected') !== 'true');
        renderSelectedInputPanel();
        drawPreview();
    }
    $('#layerList, #inactiveLayerList').on('click', '[data-layer-key]', function() { selectLayer(this.dataset.layerKey); });
    function editableLayers() {
        if(!state || screenIndex >= state.screens.length) return [];
        return M.configurableLayers(state.screens[screenIndex], vMixInputs);
    }
    function renderLayerPicker() {
        const layers = editableLayers();
        const select = $('#tileLayerSelect').empty().prop('disabled', !layers.length);
        const selected = layers.find(l => l.layerKey === vMixSettings.selectedInputKey) || layers.find(l => !l.disabled) || layers[0];
        vMixSettings.selectedInputKey = selected ? selected.layerKey : '';
        $('#layerEditorTitle').text(selected ? 'Layer ' + selected.layerNumber + ' · Entrée ' + selected.sourceNumber : 'Layer à configurer');
        const multipleParents = new Set(layers.map(l => l.sourceKey)).size > 1;
        layers.forEach(l => select.append(new Option((multipleParents ? 'Entrée ' + l.sourceNumber + ' · ' : '') + 'Layer ' + l.layerNumber + ' · ' + (l.disabled ? 'Désactivé' : l.inputName), l.layerKey, false, selected && l.layerKey === selected.layerKey)));
        if(!layers.length) select.append(new Option('Aucun layer configurable', ''));
        panel.toggleClass('empty', !selected);
        const disabled = layers.filter(l => l.disabled);
        $('#inactiveLayers').prop('hidden', !disabled.length);
        $('#inactiveLayersSummary').text('Layers désactivés (' + disabled.length + ')');
        const signature = JSON.stringify(layers.map(l => [l.layerKey, l.sourceNumber, l.layerNumber, l.inputName, !!l.disabled, !!l.pending]));
        const list = $('#layerList'), inactive = $('#inactiveLayerList');
        if(signature !== layerListSignature) {
            layerListSignature = signature;
            list.empty(); inactive.empty();
            layers.forEach((l, n) => {
                $('<button type="button" class="layer-row">').attr({'data-layer-key': l.layerKey, 'aria-label': 'Configurer layer ' + l.layerNumber + ' · ' + l.inputName})
                    .append($('<span class="layer-number">').text(String(n + 1).padStart(2, '0')),
                        $('<span class="layer-row-content">').append($('<strong>').attr('data-source-name', l.disabled ? null : '').text(l.disabled ? 'Layer ' + l.layerNumber + ' désactivé' : l.inputName), $('<small>').text('Entrée ' + l.sourceNumber + ' · Layer ' + l.layerNumber + (l.pending ? ' · En attente de vMix' : '')))).appendTo(l.disabled ? inactive : list);
            });
            if(!layers.length) list.append('<p class="empty-message">Appliquez un preset dans Disposition pour créer les vignettes.</p>');
        }
        $('#layerList, #inactiveLayerList').find('[data-layer-key]').each(function() { $(this).attr('aria-pressed', String(this.dataset.layerKey === vMixSettings.selectedInputKey)); });
    }
    function renderLayerFields() {
        const layer = editableLayers().find(l => l.layerKey === vMixSettings.selectedInputKey);
        $('[data-tile-style], .tile-flags input').prop('disabled', !layer || building);
        const source = $('#layerSourceSelect').empty().prop('disabled', !layer || building);
        source.append(new Option('Aucune source', ''));
        const details = $('#layerDetails').empty();
        if(!layer) { details.text('Appliquez un preset dans Disposition, ou choisissez une entrée multiview existante ci-dessous.'); return; }
        const s = state.screens[screenIndex];
        const blank = (s.layerSources || []).some(r => r.parent === layer.sourceKey && r.layer === layer.layerNumber && r.source === null);
        const parent = M.resolveSource(vMixInputs, layer.sourceKey);
        details.append($('<strong>').attr('data-source-name', blank ? null : '').text(blank ? 'Layer désactivé' : layer.inputName), $('<span>').text('Entrée ' + layer.sourceNumber + ' · Layer ' + layer.layerNumber + (parent ? ' — ' + parent.title : '')), $('<code>').text('ID de l’entrée : ' + layer.sourceKey));
        const audioInput = M.resolveSource(vMixInputs, layer.inputKey);
        if(audioInput && !blank) {
            const route = audioInput.audioSource || M.audioRoute(audioInput);
            details.append($('<span>').attr('data-audio-source', route).text('Vumètre : ' + (route === 'master' ? 'Master' : route === 'input' ? 'Audio de l’input' : 'BUS ' + route.slice(3)) +
                (audioInput.audioAvailable === false && route !== 'input' ? ' · indisponible dans vMix' : '')));
        }
        B.candidates(vMixInputs, s).filter(i => i.key !== layer.sourceKey).forEach(input => source.append(new Option('Entrée ' + input.number + ' · ' + (input.title || input.key), input.key, false, !blank && input.key === layer.inputKey)));
        if(blank) source.val('');
        const settings = getTileSettings(layer.layerKey, layer.inputKey);
        const checks = {tileEnabled: 'enabled', tileTally: 'tally', tileName: 'name', tileRoleBadge: 'roleBadge', tileVU: 'vu', tileTimer: 'timer', tileFrame: 'frame'};
        Object.entries(checks).forEach(([id, key]) => $('#' + id).prop('checked', settings[key]));
        $('[data-tile-style]').each(function() { $(this).val(String(settings[this.dataset.tileStyle])); });
    }
    panel.on('change', '#layerSourceSelect', async function() {
        if(building || applying) return;
        const layer = editableLayers().find(l => l.layerKey === vMixSettings.selectedInputKey);
        if(!layer) return;
        const sourceKey = this.value || null;
        publish(); building = true; receiving = true;
        $('.config-page input, .config-page select, .config-page button').prop('disabled', true);
        try {
            const updated = await B.assignLayer({screen: state.screens[screenIndex], layer, sourceKey, readInputs: readLiveInputs, command});
            saveOrUpdateEntry(updated.tiles, layer.layerKey, {...getTileSettings(layer.layerKey, layer.inputKey), enabled: sourceKey !== null});
            state.screens[screenIndex] = updated;
            state.updated = M.nextUpdate(state.updated); persist(); links();
            await readLiveInputs();
            notice(sourceKey ? 'Source du layer mise à jour dans vMix. Position et ID de l’entrée conservés.' : 'Layer désactivé dans vMix. Choisissez une source pour le réactiver.');
        } catch(error) { notice(error.message); }
        finally {
            building = false; receiving = false;
            $('.config-page input, .config-page select, .config-page button').prop('disabled', false);
            vMixSettings.selectedInputKey = layer.layerKey;
            loadScreen();
        }
    });
    panel.on('change', '[data-tile-style]', function() {
        const name = this.dataset.tileStyle;
        const value = name === 'titleBackground' ? this.value === 'true' : this.type === 'number' ? Number(this.value) : this.value;
        updateSelectedTileSetting(name, value);
    });
    function drawPreview() {
        const box = $('#layoutPreview').empty().attr('data-theme', M.themeFor(state.screens[screenIndex]));
        $('#previewHeading').text('Écran ' + (screenIndex + 1) + ' · Plan des layers');
        const layers = editableLayers();
        if(!layers.some(o => !o.disabled && !o.pending)) $('<p class="preview-empty">').text(vMixInputs.length ? 'Choisissez un modèle pour afficher le plan.' : 'Connectez vMix pour préparer votre écran.').appendTo(box);
        layers.forEach((o, n) => {
            if(o.disabled || o.pending) return;
            const settings = getTileSettings(o.layerKey, o.inputKey);
            const displayName = getLayerDisplayName(o);
            const monitorRole = getLayerMonitorRole(M.resolveSource(vMixInputs, o.inputKey));
            const tally = M.tallyState(settings, o.inputKey, vMixSettings.previewKey, vMixSettings.programKey);
            const frame = settings.enabled && settings.frame ? Math.max(0, Number(settings.borderWidth) || 0) : 0;
            const button = $('<button type="button" class="preview-layer">').addClass(tileSettingsClasses(o)).addClass(tally)
                .css({width: o.zoomX + '%', height: o.zoomY + '%', left: (o.panX / 2 + 50 - o.zoomX / 2) + '%', top: (-o.panY / 2 + 50 - o.zoomY / 2) + '%',
                    '--preview-title-size': Math.max(5, Math.min(32, settings.titleFontSize * .32)) + 'px',
                    '--preview-frame-width': (frame ? Math.max(.5, frame * .32) : 0) + 'px', '--preview-frame-color': settings.borderColor,
                    '--preview-tally-color': tally === 'program' ? settings.programColor : tally === 'preview' ? settings.previewColor : '#ffffff'})
                .append($('<span class="preview-label" data-source-name>').text(displayName).prop('hidden', !settings.enabled || !settings.name))
                .attr('data-role', o.role || '')
                .attr('data-input-key', o.inputKey)
                .attr({title: o.layerName + ' · ' + o.inputName + (displayName !== o.inputName ? ' → ' + displayName : ''), 'aria-label': 'Configurer la vignette ' + (n + 1) + ' · ' + displayName, 'aria-pressed': String(o.layerKey === vMixSettings.selectedInputKey)})
                .on('click', () => selectLayer(o.layerKey)).appendTo(box);
            if(settings.enabled && settings.roleBadge && monitorRole) button.append($('<i class="preview-role">').text(monitorRole === 'PGM' ? 'PROGRAM' : 'PREVIEW'));
        });
    }
    function renderBuilderSources() {
        if(!control || !$('#buildSources').length || screenIndex >= state.screens.length) return;
        const s = state.screens[screenIndex];
        const chosen = s.videoInputs || [];
        renderTemplatePreviews(M.spacingFor(s));
        if(!$('#presetSpacing, #presetSpacingSlider').is(':focus')) $('#presetSpacing, #presetSpacingSlider').val(M.spacingFor(s));
        $('#applySpacing').prop('disabled', !s.managed || !s.layout.length || building || applying);
        const select = $('#buildSources').empty();
        const candidates = B.candidates(vMixInputs, s);
        candidates.forEach(input => select.append(new Option('Entrée ' + input.number + ' · ' + (input.title || input.key), input.key, false, chosen.includes(input.key))));
        chosen.filter(k => !vMixInputs.some(i => i.key === k)).forEach(k => select.append(new Option('Source introuvable · ' + k, k, true, true)));
        $('#managedInputsInfo').text(s.managed ? 'ID du multiview : ' + s.managed.root + ' · ' + s.managed.sources.length + ' vignettes · Source HTML au layer 10 : ' + (s.managed.browser || 'À créer') : 'Les entrées nécessaires seront créées au choix d’un preset.');
        const htmlParent = s.managed && M.resolveSource(vMixInputs, s.managed.root);
        const htmlBrowser = s.managed && M.resolveSource(vMixInputs, s.managed.browser);
        const htmlReady = htmlParent && htmlBrowser && M.isBrowser(htmlBrowser) && !B.browserNeedsRepair(s, vMixInputs);
        const htmlMissing = !htmlBrowser || !M.isBrowser(htmlBrowser);
        $('#htmlLayerInfo').text(htmlReady ? 'Layer 10 de l’entrée ' + htmlParent.number + ' · Source HTML : entrée ' + htmlBrowser.number + '.' : s.managed ? 'Layer 10 · Source HTML à rétablir dans vMix.' : 'Le layer 10 de chaque écran est réservé à sa source HTML.');
        $('#htmlSourceParent').text(htmlParent ? 'Entrée ' + htmlParent.number + ' · ' + htmlParent.title : s.managed ? 'Entrée multiview introuvable dans vMix' : 'Écran ' + (screenIndex + 1) + ' · créé avec le preset');
        $('#htmlSourceInput').text(htmlMissing ? 'Source navigateur à créer pour cet écran' : 'Entrée ' + htmlBrowser.number + ' · ' + htmlBrowser.title);
        $('#htmlSourceID').text(htmlMissing ? '' : 'ID : ' + htmlBrowser.key).prop('hidden', htmlMissing);
        $('#htmlSourceStatus').attr('data-status', htmlReady ? 'connected' : s.managed ? 'warning' : 'waiting')
            .text(htmlReady ? 'Layer actif' : !s.managed ? 'À configurer' : !htmlParent ? 'Entrée absente' : htmlMissing ? 'Source manquante' : s.managed.htmlPending ? 'URL à charger' : 'Layer à rétablir');
        $('#openHTMLSource').attr('href', url(screenIndex)).prop('hidden', !s.managed);
        $('#repairHTML').text(htmlMissing ? 'Créer la source HTML' : s.managed && s.managed.htmlPending ? 'Recharger la source HTML' : 'Rétablir le layer 10')
            .prop('hidden', !s.managed || !!htmlReady).prop('disabled', !htmlParent || building || applying);
        $('#refreshHTMLPage').prop('hidden', !s.managed || htmlMissing).prop('disabled', !htmlParent || building || applying);
        $('#screenContext').text(state.pc + ' · ' + state.screens.length + (state.screens.length > 1 ? ' écrans' : ' écran') + (s.managed ? ' · ' + s.managed.sources.length + ' vignettes' : ' · À configurer'));
        $('.layout-choice').each(function() { $(this).attr('aria-pressed', String(!!s.managed && s.managed.template === this.dataset.template)); });
        const term = ($('#sourceSearch').val() || '').trim().toLocaleLowerCase();
        const signature = JSON.stringify([screenIndex, term, candidates.map(i => [i.key, i.number, i.title])]);
        if(signature !== sourceChoicesSignature) {
            sourceChoicesSignature = signature;
            const choices = $('#sourceChoices').empty();
            const visible = candidates.filter(i => (i.number + ' ' + i.title + ' ' + i.key).toLocaleLowerCase().includes(term));
            visible.forEach(input => $('<label class="source-choice">').append($('<input type="checkbox">').attr({'data-video-key': input.key, 'aria-label': 'Utiliser ' + input.title}), $('<span>').append($('<strong>').text(input.title || input.key), $('<small>').text('Entrée ' + input.number))).appendTo(choices));
            if(!visible.length) choices.append($('<p class="empty-message">').text(candidates.length ? 'Aucune source ne correspond à votre recherche.' : 'Connectez vMix pour afficher les sources vidéo.'));
        }
        $('#sourceChoices [data-video-key]').each(function() { this.checked = chosen.includes(this.dataset.videoKey); this.disabled = building; });
        const count = new Set(chosen).size;
        $('#sourceSelectionCount').text(count ? count + (count > 1 ? ' sources sélectionnées' : ' source sélectionnée') : 'Affectation automatique · ' + candidates.length + (candidates.length > 1 ? ' sources disponibles' : ' source disponible'));
        $('#selectAllSources').prop('disabled', !candidates.length || building);
    }
    $('#sourceSearch').on('input', renderBuilderSources);
    $('#sourceChoices').on('change', '[data-video-key]', function() {
        const chosen = new Set(state.screens[screenIndex].videoInputs || []);
        if(this.checked) chosen.add(this.dataset.videoKey); else chosen.delete(this.dataset.videoKey);
        $('#buildSources').val([...chosen]).trigger('change');
    });
    $('#selectAllSources').on('click', () => {
        const chosen = new Set(state.screens[screenIndex].videoInputs || []);
        $('#sourceChoices [data-video-key]').each(function() { chosen.add(this.dataset.videoKey); });
        $('#buildSources').val([...chosen]).trigger('change');
    });
    $('#buildSources').on('change', function() {
        state.screens[screenIndex].videoInputs = $(this).val() || [];
        state.updated = M.nextUpdate(state.updated); persist(); links(); renderBuilderSources();
    });
    $('#autoAssignSources').on('click', function() {
        delete state.screens[screenIndex].videoInputs;
        state.updated = M.nextUpdate(state.updated); persist(); links(); renderBuilderSources();
    });
    $('#presetSpacingSlider').on('input', function() { $('#presetSpacing').val(this.value); });
    $('#presetSpacing, #presetSpacingSlider').on('change', function() {
        const value = Number(this.value);
        if(this.value === '' || !Number.isFinite(value) || value < 0 || value > 20) {
            $('#presetSpacing, #presetSpacingSlider').val(M.spacingFor(state.screens[screenIndex]));
            notice('Choisissez un espacement entre 0 et 20 %.'); return;
        }
        state.screens[screenIndex].spacing = value;
        $('#presetSpacing, #presetSpacingSlider').val(value);
        state.updated = M.nextUpdate(state.updated); persist(); links();
    });
    $('#applySpacing').on('click', async () => {
        if(building || applying) return;
        publish();
        const index = screenIndex;
        const current = state.screens[index];
        if(!current.managed || !current.layout.length) { notice('Appliquez un modèle avant de régler son espacement.'); return; }
        const spacing = M.spacingFor(current);
        const next = M.clone(current);
        next.layout = M.resizeSpacing(current.layout, current.managed.spacing ?? M.LEGACY_SPACING, spacing);
        next.managed.spacing = spacing;
        try {
            M.validate({...state, screens: state.screens.map((s, n) => n === index ? next : s)});
            building = true; receiving = true;
            $('.config-page input, .config-page select, .config-page button').prop('disabled', true);
            await readLiveInputs();
            if(!await applyPositions({positions: next.layout, includeDisabled: true})) return;
            state.screens[index] = next;
            state.updated = M.nextUpdate(state.updated); persist(); links();
            await readLiveInputs();
            notice('Espacement de l’écran ' + (index + 1) + ' réglé à ' + spacing + ' %. Les sources et leurs IDs sont conservés.');
        } catch(error) { notice(error.message); }
        finally {
            building = false; receiving = false;
            $('.config-page input, .config-page select, .config-page button').prop('disabled', false);
            loadScreen();
        }
    });
    async function readLiveInputs() {
        readingInputs++;
        try {
            const response = await fetchWithTimeout('http://' + state.host + ':' + state.port + '/api');
            if(!response.ok) throw new Error('Connexion vMix indisponible.');
            const xml = new DOMParser().parseFromString(await response.text(), 'text/xml');
            if(xml.querySelector('parsererror') || !xml.querySelector('vmix')) throw new Error('Réponse vMix invalide.');
            vMixRefresh(xml);
            return M.clone(vMixInputs);
        } finally { readingInputs--; }
    }
    async function command(functionName, parameters) {
        const query = new URLSearchParams({Function: functionName, ...parameters});
        const response = await fetchWithTimeout('http://' + state.host + ':' + state.port + '/api/?' + query);
        if(!response.ok) throw new Error('vMix a refusé ' + functionName + ' (' + response.status + '). Relancez la construction après vérification.');
    }
    const htmlRepairKey = s => [state.pc, state.host, state.port, s.managed.root, s.managed.browser].join('|');
    async function repairHTML(indices, automatic = false) {
        if(building || applying) return;
        publish(); building = true; receiving = true;
        $('.config-page input, .config-page select, .config-page button').prop('disabled', true);
        try {
            const failures = [];
            for(const index of indices) {
                if(automatic) htmlRepairAttempts.add(htmlRepairKey(state.screens[index]));
                try {
                    state.screens[index] = await B.repairBrowser({screen: M.clone(state.screens[index]), pc: state.pc, index, readInputs: readLiveInputs, command,
                        displayURL: () => browserURL(index), save: async next => {
                            state.screens[index] = next;
                            if(automatic) htmlRepairAttempts.add(htmlRepairKey(next));
                            state.updated = M.nextUpdate(state.updated); persist(); links(); renderBuilderSources();
                        }});
                    if(!automatic) await command('BrowserReload', {Input: state.screens[index].managed.browser});
                    state.updated = M.nextUpdate(state.updated); persist(); links();
                } catch(error) { failures.push('Écran ' + (index + 1) + ' : ' + error.message); }
            }
            await readLiveInputs();
            notice(failures.length ? failures.join(' ') + ' Réessayez avec le bouton de la source HTML dans « Sources & layers ».' :
                'Source HTML rétablie au layer 10 ' + (indices.length > 1 ? 'de chaque écran concerné' : 'de l’écran ' + (indices[0] + 1)) + '. Les IDs et les positions vidéo sont conservés.');
        } catch(error) { notice(error.message + ' Réessayez avec le bouton de la source HTML dans « Sources & layers ».'); }
        finally {
            building = false; receiving = false;
            $('.config-page input, .config-page select, .config-page button').prop('disabled', false);
            loadScreen();
        }
    }
    $('#repairHTML').on('click', () => repairHTML([screenIndex]));
    $('#refreshHTMLPage').on('click', () => repairHTML([screenIndex]));
    async function buildTemplates(targets, restore = {}) {
        if(building || applying) return false;
        publish();
        // Verify source availability for every target before creating an input.
        try {
            const inputs = await readLiveInputs();
            targets.forEach(({index, template}) => B.selectSources(inputs, state.screens[index], template));
        } catch(error) { notice(error.message); return false; }
        building = true;
        receiving = true;
        $('.config-page input, .config-page select, .config-page button').prop('disabled', true);
        document.body.classList.add('is-building');
        let success = false;
        try {
            for(const {index, template} of targets) {
                notice('Construction du multiview de l’écran ' + (index + 1) + '…');
                const s = state.screens[index];
                const previousManaged = s.managed ? M.clone(s.managed) : null;
                const previousAssignments = M.clone(s.layerSources || []);
                const beforeLayers = M.collectLayers(vMixInputs, s.inputs, M.activeLayersFor(s, vMixInputs), s.layout).layers;
                const styles = new Map(beforeLayers.map(o => [o.inputKey, index === screenIndex ? getTileSettings(o.layerKey, o.inputKey) : normalizeTileSettings(s.tiles.find(t => t.key === o.layerKey || t.key === o.legacyLayerKey), getDefaultTileSettings(o.inputKey, s.hideOutputAudioByDefault === true))]));
                if(previousManaged) previousManaged.sources.forEach((key, n) => {
                    if(styles.has(key)) return;
                    const source = previousManaged.sources.length > 9 ? previousManaged.parts[Math.floor(n / 10)] : previousManaged.root;
                    const saved = s.tiles.find(t => t.key === M.layerKey(source, previousManaged.sources.length > 9 ? n % 10 : n));
                    if(saved) {
                        const value = normalizeTileSettings(saved, getDefaultTileSettings(key, s.hideOutputAudioByDefault === true));
                        if(!restore[index] && previousAssignments.some(r => r.parent === source && r.layer === (previousManaged.sources.length > 9 ? n % 10 + 1 : n + 1) && r.source === null)) value.enabled = true;
                        styles.set(key, value);
                    }
                });
                const candidate = s.inputs.length === 1 ? M.resolveSource(vMixInputs, s.inputs[0]) : null;
                const shared = candidate && state.screens.some((other, n) => n !== index && (other.inputs.some(ref => M.resolveSource(vMixInputs, ref) === candidate) || M.collectLayers(vMixInputs, other.inputs, M.activeLayersFor(other, vMixInputs)).layers.some(l => l.sourceKey === candidate.key)));
                const reusableRoot = candidate && !shared && candidate.layers.length && /^(Colour|Color)$/i.test(candidate.type) ? candidate.key : null;
                const result = await B.build({screen: M.clone(s), template, pc: state.pc, index, readInputs: readLiveInputs, command, reusableRoot,
                    displayURL: () => browserURL(index), save: async (managed, planned) => {
                        state.screens[index].managed = managed;
                        state.screens[index].inputs = [managed.root];
                        if(planned) {
                            state.screens[index].layout = restore[index] && previousManaged ? B.rebindLayout(restore[index], previousManaged, managed) : planned.layout;
                            if(restore[index] && previousManaged) state.screens[index].layerSources = B.rebindLayerSources(previousAssignments, previousManaged, managed);
                            else delete state.screens[index].layerSources;
                        }
                        state.updated = M.nextUpdate(state.updated); persist(); links();
                        loadScreen();
                    }});
                state.screens[index].inputs = result.inputs;
                state.screens[index].managed = result.managed;
                state.screens[index].layout = restore[index] && previousManaged ? B.rebindLayout(restore[index], previousManaged, result.managed) : result.layout;
                if(restore[index] && previousManaged) state.screens[index].managed.spacing = previousManaged.spacing ?? M.LEGACY_SPACING;
                if(restore[index] && previousManaged && previousAssignments.length) state.screens[index].layerSources = B.rebindLayerSources(previousAssignments, previousManaged, result.managed);
                else delete state.screens[index].layerSources;
                for(const layer of result.layers) if(styles.has(layer.inputKey)) {
                    const tileKey = M.layerKey(layer.sourceKey, layer.layerNumber - 1);
                    saveOrUpdateEntry(state.screens[index].tiles, tileKey, M.clone(styles.get(layer.inputKey)));
                }
                state.updated = M.nextUpdate(state.updated); persist(); links();
            }
            await readLiveInputs();
            success = true;
        } catch(error) { notice(error.message + ' Les IDs déjà créés sont conservés pour la prochaine tentative.'); }
        finally {
            building = false; receiving = false;
            document.body.classList.remove('is-building');
            $('.config-page input, .config-page select, .config-page button').prop('disabled', false);
            loadScreen();
        }
        if(success) notice('Disposition appliquée dans vMix. Enregistrez votre preset vMix pour conserver les entrées et leurs IDs.');
        return success;
    }
    async function applyLayerSources() {
        const previousBuilding = building, previousReceiving = receiving;
        building = true; receiving = true;
        $('.config-page input, .config-page select, .config-page button').prop('disabled', true);
        try {
            for(let index = 0; index < state.screens.length; index++) {
                for(const row of M.clone(state.screens[index].layerSources || [])) {
                    const position = state.screens[index].layout.find(p => p.source === row.parent && p.layer === row.layer);
                    state.screens[index] = await B.assignLayer({screen: state.screens[index], layer: {sourceKey: row.parent, layerNumber: row.layer, localPosition: position}, sourceKey: row.source, readInputs: readLiveInputs, command});
                }
            }
            state.updated = M.nextUpdate(state.updated); persist();
        } finally {
            building = previousBuilding; receiving = previousReceiving;
            if(!previousBuilding) $('.config-page input, .config-page select, .config-page button').prop('disabled', false);
            loadScreen();
        }
    }
    function layersFor(s) {
        if(!lastResponse) throw new Error('Connectez vMix avant de choisir une disposition.');
        const collected = M.collectLayers(vMixInputs, s.inputs, M.activeLayersFor(s, vMixInputs));
        if(collected.warnings.length) throw new Error(collected.warnings.join(' · '));
        return collected.layers;
    }
    async function applyPositions(options) {
        if(applying) return;
        const requested = options && Array.isArray(options.positions) ? options.positions : state.screens.flatMap(s => s.layout);
        const operations = requested.filter(p => {
            if(options && options.includeDisabled) return true;
            const source = M.resolveSource(vMixInputs, typeof p.source === 'number' ? p.source - 1 : p.source);
            return !state.screens.some(s => (s.layerSources || []).some(r => r.parent === (source ? source.key : p.source) && r.layer === p.layer && r.source === null));
        });
        if(!operations.length) { notice('Aucune position mémorisée. Choisissez un modèle ou mémorisez les positions actuelles.'); return false; }
        const assignments = new Map();
        try {
            M.validate(state);
            for(const p of operations) {
                const id = p.source + ':' + p.layer;
                if(assignments.has(id) && JSON.stringify(assignments.get(id)) !== JSON.stringify(p)) throw new Error('Plusieurs écrans demandent des positions différentes sur le même layer vMix. Affectez des entrées multiview distinctes aux écrans concernés.');
                assignments.set(id, p);
                if(Math.abs(p.zoomX - p.zoomY) > .01) throw new Error('Ce layer utilise un zoom X/Y différent. Le rappel automatique exige un zoom uniforme.');
                if(!lastResponse) throw new Error('Connectez vMix avant d’appliquer les positions.');
                const source = M.resolveSource(vMixInputs, typeof p.source === 'number' ? p.source - 1 : p.source);
                const slot = source && (source.layers || []).find((l, n) => M.layerNumber(l.index, n) === p.layer);
                const disabled = source && options && options.includeDisabled && !M.isBrowser(M.resolveSource(vMixInputs, slot && slot.inputKey)) && state.screens.some(s => (s.layerSources || []).some(r => r.parent === source.key && r.layer === p.layer && r.source === null));
                const valid = source && (disabled || state.screens.some(s => M.collectLayers(vMixInputs, s.inputs, M.activeLayersFor(s, vMixInputs)).layers.some(l => l.sourceKey === source.key && l.layerNumber === p.layer)));
                if(!valid) throw new Error('Layer vidéo introuvable : entrée ' + p.source + ', layer ' + p.layer);
            }
            applying = true;
            $('#applyLayout, .layout-choice, #recallPreset').prop('disabled', true);
            for(const p of assignments.values()) {
                for(const [suffix, value] of [['Zoom', p.zoomX / 100], ['PanX', p.panX / 100], ['PanY', p.panY / 100]]) {
                    const source = M.resolveSource(vMixInputs, typeof p.source === 'number' ? p.source - 1 : p.source);
                    const args = new URLSearchParams({Function: 'SetLayer' + p.layer + suffix, Input: source.key, Value: String(value)});
                    const response = await fetchWithTimeout('http://' + state.host + ':' + state.port + '/api/?' + args);
                    if(!response.ok) throw new Error('vMix a refusé une commande (' + response.status + '). Certaines positions peuvent déjà avoir changé.');
                }
            }
            notice('Positions appliquées dans vMix. Enregistrez aussi votre preset vMix.');
            return true;
        } catch(error) { notice(error.message); return false; }
        finally { applying = false; $('#applyLayout, .layout-choice, #recallPreset').prop('disabled', false); }
    }
    M.templates.forEach(t => {
        const category = t.screens ? 'dual' : t.id.startsWith('preset') || ['production', 'hero'].includes(t.id) ? 'production' : 'grid';
        const button = $('<button type="button" class="layout-choice">').attr({'aria-label': 'Appliquer ' + t.name, 'data-template': t.id, 'data-category': category, 'aria-pressed': 'false'});
        const mini = $('<span class="layout-mini" aria-hidden="true">');
        const slots = t.slots || M.templates.find(x => x.id === t.screens[0]).slots;
        M.templateFrames(slots).forEach(s => $('<i>').text(s.label || '').addClass(s.label === 'PGM' ? 'role-pgm' : s.label === 'PVW' ? 'role-pvw' : '').css({left: s.x * 100 + '%', top: s.y * 100 + '%', width: s.w * 100 + '%', height: s.h * 100 + '%'}).appendTo(mini));
        const [title, description] = t.name.split(' · ');
        const caption = $('<span class="preset-caption">').append($('<strong>').text(title), $('<small>').text(description || ''), $('<span class="preset-count">').text(t.slots ? t.slots.length + ' vignettes' : '2 écrans'), $('<span class="preset-apply">Appliquer ↗</span>'));
        button.append(mini, caption).on('click', async () => {
            try {
                if(t.screens && state.screens.length < 2) throw new Error('Activez au moins 2 écrans et choisissez des entrées multiview distinctes.');
                const targets = t.screens ? [0, 1] : [screenIndex];
                await buildTemplates(targets.map((index, i) => ({index, template: t.screens ? M.templates.find(x => x.id === t.screens[i]) : t})));
            } catch(error) { notice(error.message); }
        }).appendTo('#layoutGallery');
    });
    $('#captureLayout').on('click', () => {
        if(!lastResponse) { notice('Connectez vMix avant de mémoriser les positions.'); return; }
        state.screens[screenIndex].layout = editableLayers().map(o => {
            return {source: o.sourceKey, layer: o.layerNumber, ...o.localPosition};
        });
        state.updated = M.nextUpdate(state.updated); persist(); links(); notice('Positions de cet écran mémorisées. Vous pouvez enregistrer le modèle.');
    });
    $('#applyLayout').on('click', applyPositions);
    $('#activeScreen').on('change', function() { publish(); screenIndex = +this.value; loadScreen(); });
    function resizedScreens(count) {
        if(!Number.isInteger(count) || count < 1 || count > M.MAX_SCREENS) {
            throw new Error('Choisissez un nombre entier entre 1 et ' + M.MAX_SCREENS + ' écrans.');
        }
        const screens = M.clone(state.screens);
        const used = new Set(screens.flatMap(s => [...s.inputs.map(ref => M.resolveSource(vMixInputs, ref)?.key), ...(s.managed ? [s.managed.root, ...s.managed.parts] : [])]));
        while(screens.length < count) {
            const source = vMixInputs.find(input => !M.isBrowser(input) && input.layers.length && !used.has(input.key));
            const s = M.screen([source ? source.key : 0]);
            s.extras = M.clone(state.screens[0].extras);
            s.theme = M.themeFor(state.screens[screenIndex]);
            screens.push(s);
            if(source) used.add(source.key);
        }
        return screens.slice(0, count);
    }
    $('#screenCount').on('change', function() {
        try {
            publish();
            state.screens = resizedScreens(Number(this.value));
            screenIndex = Math.min(screenIndex, state.screens.length - 1);
            state.updated = M.nextUpdate(state.updated); persist(); loadScreen();
        } catch(error) { this.value = state.screens.length; notice(error.message); }
    });
    $('#saveConnection').on('click', () => {
        try {
            const next = M.validate({...state, pc: $('#pcName').val().trim(), host: $('#vmixHost').val().trim(), port: $('#vmixPort').val(), screens: resizedScreens(Number($('#screenCount').val()))});
            state = next; screenIndex = Math.min(screenIndex, state.screens.length - 1); state.updated = M.nextUpdate(state.updated); connect(); persist(); lastResponse = undefined; loadScreen(); renderPresets();
            history.replaceState(null, '', url(screenIndex, true));
            notice('Connexion enregistrée. Utilisez les nouvelles URL pour les pages d’affichage.');
        } catch(error) { notice(error.message); }
    });
    const presetKey = () => key(state.pc) + '.presets';
    function renderPresets() {
        $('#savedPresets').empty().append(new Option('Choisir un modèle enregistré', ''));
        (read(presetKey()) || []).forEach(p => $('#savedPresets').append(new Option(p.name, p.id)));
    }
    $('#savePreset').on('click', () => {
        const name = $('#presetName').val().trim();
        if(!name) { notice('Donnez un nom au modèle.'); return; }
        publish();
        const presets = read(presetKey()) || [];
        const existing = presets.find(p => p.name === name);
        if(existing) existing.config = M.clone(state);
        else presets.push({id: String(Date.now()), name, config: M.clone(state)});
        try { localStorage.setItem(presetKey(), JSON.stringify(presets)); renderPresets(); notice('Modèle « ' + name + ' » enregistré pour ce PC.'); }
        catch (_) { notice('Impossible de mémoriser le modèle : stockage local indisponible. Conservez les URL.'); }
    });
    $('#recallPreset').on('click', async () => {
        const preset = (read(presetKey()) || []).find(p => p.id === $('#savedPresets').val());
        if(!preset) return;
        try {
            state = M.validate(preset.config); state.updated = M.nextUpdate(state.updated); screenIndex = 0; connect(); persist(); loadScreen();
            await readLiveInputs();
            // Reattach the saved sources even when the same IDs are present:
            // another preset may have changed their layer assignments.
            const targets = state.screens.flatMap((s, index) => {
                if(!s.managed) return [];
                const template = M.templates.find(t => t.id === s.managed.template);
                if(!template) throw new Error('Le preset de construction est introuvable.');
                return [{index, template}];
            });
            if(targets.length) {
                const restore = Object.fromEntries(targets.map(({index}) => [index, M.clone(state.screens[index].layout)]));
                if(!await buildTemplates(targets, restore)) return;
            }
            if(state.screens.some(s => s.layerSources && s.layerSources.length)) await applyLayerSources();
            if(state.screens.some(s => s.layout.length)) await applyPositions();
            else notice('Habillage rappelé. Ce modèle ne contient pas de positions vMix.');
        } catch(error) { notice(error.message); }
    });
    $('#deletePreset').on('click', () => {
        try { localStorage.setItem(presetKey(), JSON.stringify((read(presetKey()) || []).filter(p => p.id !== $('#savedPresets').val()))); renderPresets(); notice('Modèle supprimé.'); }
        catch (_) { notice('Stockage local indisponible.'); }
    });
    // Keep the form readable even if the renderer's idle handler hides its handle.
    $('.hideContainer').addClass('isOpen');
    const oldVmixRefresh = vMixRefresh;
    vMixRefresh = function(data) {
        oldVmixRefresh(data);
        // New inputs must appear in the picker even when existing layers stay
        // unchanged. The picker keeps its DOM when its source list is stable.
        renderBuilderSources();
        const signature = JSON.stringify([screenIndex, vMixSettings.previewKey, vMixSettings.programKey, editableLayers(), vMixInputs.map(i => [i.key, i.number, i.title, i.type])]);
        if(signature !== controlLayersSignature) {
            controlLayersSignature = signature;
            renderSourceInputs(); renderLayerPicker(); renderLayerFields(); drawPreview();
            if(building) $('.config-page input, .config-page select, .config-page button').prop('disabled', true);
        }
        // Migrate existing screens once connected, without rebuilding videos or
        // interrupting an explicit build, recall or source assignment.
        if(!building && !applying && !receiving && !readingInputs && !htmlRepairQueued) {
            const indices = state.screens.flatMap((s, index) => s.managed && s.layout.length && B.browserNeedsRepair(s, vMixInputs) && !htmlRepairAttempts.has(htmlRepairKey(s)) ? [index] : []);
            if(indices.length) {
                htmlRepairQueued = true;
                queueMicrotask(() => { htmlRepairQueued = false; repairHTML(indices, true); });
            }
        }
    };
    connect(); loadScreen(); renderPresets(); publish();
})();
