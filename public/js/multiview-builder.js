/* Creates and reuses a complete vMix multiview through an injected API. */
(function(root) {
    const M = typeof module !== 'undefined' ? require('./multiview-model') : root.MultiviewModel;
    const HTML_LAYER = M.HTML_LAYER;
    async function ensureInput({kind, label, current, record, pc, index, readInputs, command, remember}) {
        let inputs = await readInputs();
        const name = 'MV · ' + pc + ' · Écran ' + (index + 1) + ' · ' + label;
        let input = inputs.find(i => i.key === current) || inputs.find(i => i.title === name);
        if(!input) {
            const before = new Set(inputs.map(i => i.key));
            // Create the browser independently of the potentially long recall URL.
            const value = kind === 'browser' ? 'Browser|about:blank' : 'Colour|' + (kind === 'root' ? 'Black' : 'Transparent');
            let creationError;
            try { await command('AddInput', {Value: value}); } catch(error) { creationError = error; }
            let created = [];
            for(let attempt = 0; attempt < 8; attempt++) {
                inputs = await readInputs();
                created = inputs.filter(i => !before.has(i.key));
                if(created.length) break;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if(!created.length && creationError) throw creationError;
            if(created.length !== 1) throw new Error('Impossible d’identifier l’entrée créée. Vérifiez les entrées vMix avant de relancer.');
            input = created[0];
        }
        if(kind === 'browser' ? !M.isBrowser(input) : !/^(Colour|Color)$/i.test(input.type || '')) throw new Error('Le type de l’entrée ' + (input.title || input.key) + ' ne permet pas sa réutilisation.');
        record(input.key);
        await remember();
        if(input.title !== name) await command('SetInputName', {Input: input.key, Value: name});
        return input.key;
    }
    async function confirmLayers(expected, readInputs) {
        for(let attempt = 0; attempt < 20; attempt++) {
            const inputs = await readInputs();
            if(expected.every(l => {
                const parent = M.resolveSource(inputs, l.sourceKey);
                const current = parent && (parent.layers || []).find((s, n) => M.layerNumber(s.index, n) === l.layerNumber);
                return current && current.inputKey === l.inputKey && current.enabled !== false;
            })) return;
            if(attempt < 19) await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('vMix n’a pas encore confirmé les layers créés. Leurs IDs et affectations sont mémorisés ; les sources restent configurables. Relancez après vérification.');
    }
    function candidates(inputs, screen) {
        const owned = new Set(screen.managed ? [screen.managed.root, screen.managed.browser, ...screen.managed.parts] : []);
        const leaves = M.collectLayers(inputs, screen.inputs, M.activeLayersFor(screen, inputs), screen.layout).layers;
        const existing = [...(screen.managed ? screen.managed.sources : []), ...leaves.map(l => l.inputKey)].map(key => inputs.find(i => i.key === key)).filter(Boolean);
        const eligible = inputs.filter(i => !owned.has(i.key) && !M.isBrowser(i) && !M.isGeneratedMultiview(i) && (!(i.layers || []).length || M.role(i) || /^(Mix|Virtual)$/i.test(i.type || '')) && !/^(Audio|AudioFile|AudioInput|AudioCapture|WASAPI|ASIO)$/i.test(i.type || ''));
        return [...new Map([...existing, ...eligible].filter(i => !owned.has(i.key) && !M.isBrowser(i) && !M.isGeneratedMultiview(i)).map(i => [i.key, i])).values()];
    }
    function selectSources(inputs, screen, template) {
        const pool = candidates(inputs, screen);
        if(screen.videoInputs && screen.videoInputs.length) {
            const selected = screen.videoInputs.map(key => pool.find(i => i.key === key)).filter(Boolean);
            const reserved = template.slots.map(slot => ['PGM', 'PVW'].includes(slot.label) ? pool.find(i => M.role(i) === slot.label) || null : null);
            const regular = selected.filter(i => !reserved.includes(i));
            let n = 0;
            return template.slots.map((slot, index) => ['PGM', 'PVW'].includes(slot.label) ? reserved[index] : regular[n++] || null);
        }
        if(screen.managed && screen.managed.template === template.id && screen.managed.sources.length === template.slots.length) return screen.managed.sources.map((key, n) => pool.find(i => i.key === key) || (['PGM', 'PVW'].includes(template.slots[n].label) ? pool.find(i => M.role(i) === template.slots[n].label) : null) || null);
        const chosen = [];
        for(const slot of template.slots) {
            if(slot.label !== 'PGM' && slot.label !== 'PVW') { chosen.push(null); continue; }
            chosen.push(pool.find(i => M.role(i) === slot.label && !chosen.includes(i)) || null);
        }
        for(let n = 0; n < chosen.length; n++) {
            if(!chosen[n] && !['PGM', 'PVW'].includes(template.slots[n].label)) chosen[n] = pool.find(i => !chosen.includes(i)) || null;
        }
        return chosen;
    }
    async function build({screen, template, pc, index, readInputs, command, save, displayURL, reusableRoot}) {
        let inputs = await readInputs();
        const sources = selectSources(inputs, screen, template);
        // Persist IDs immediately: an interrupted build can continue using the
        // inputs already created, without making a second set on retry.
        let managed = screen.managed ? M.clone(screen.managed) : {root: reusableRoot || null, browser: null, parts: [], sources: [], active: {}};
        managed.spacing = M.spacingFor(screen);
        managed.template = template.id;
        managed.sources = sources.map(i => i ? i.key : null);
        let planned;
        const remember = async () => save(M.clone(managed), planned && M.clone(planned));
        const ensure = (kind, label, current, record) => ensureInput({kind, label, current, record, pc, index, readInputs, command, remember});
        const rootKey = await ensure('root', 'Multiview', managed.root, key => managed.root = key);
        const partCount = sources.length > 9 ? Math.ceil(sources.length / 10) : 0;
        for(let n = 0; n < partCount; n++) await ensure('part', 'Vignettes ' + (n + 1), managed.parts[n], key => managed.parts[n] = key);
        const usedParts = managed.parts.slice(0, partCount);
        inputs = await readInputs();
        const videoLayers = M.videoLayersFor(managed).map((l, n) => ({...l, role: sources[n] ? M.role(sources[n]) : template.slots[n].label}));
        const layout = M.positions(template.slots, videoLayers, managed.spacing);
        planned = {inputs: [rootKey], layout, layers: videoLayers};
        managed.active = Object.fromEntries([rootKey, ...managed.parts].map(key => [key, []]));
        for(const layer of videoLayers) if(layer.inputKey) managed.active[layer.sourceKey].push(layer.layerNumber);
        if(partCount) managed.active[rootKey] = usedParts.map((_, i) => i + 1);
        const browserSlot = HTML_LAYER;
        managed.active[rootKey].push(browserSlot);
        await remember();
        // Disable unused slots, while keeping their input IDs in vMix.
        for(const key of [rootKey, ...managed.parts].filter(key => inputs.some(i => i.key === key))) for(let n = 1; n <= 10; n++) {
            if(!managed.active[key].includes(n)) await command('LayerOff', {Input: key, Value: String(n)});
        }
        async function attach(parent, slot, child, geometry) {
            await command('SetLayer', {Input: parent, Value: slot + ',' + child});
            if(geometry) for(const [suffix, value] of [['Zoom', geometry.zoomX / 100], ['PanX', geometry.panX / 100], ['PanY', geometry.panY / 100]]) await command('SetLayer' + slot + suffix, {Input: parent, Value: String(value)});
            await command('LayerOn', {Input: parent, Value: String(slot)});
        }
        const full = {zoomX: 100, zoomY: 100, panX: 0, panY: 0};
        for(let n = 0; n < usedParts.length; n++) await attach(rootKey, n + 1, usedParts[n], full);
        for(const layer of videoLayers) {
            if(!layer.inputKey) continue;
            const position = layout.find(p => p.source === layer.sourceKey && p.layer === layer.layerNumber);
            await attach(layer.sourceKey, layer.layerNumber, layer.inputKey, position);
        }
        const expected = [...videoLayers.filter(l => l.inputKey), ...usedParts.map((inputKey, n) => ({sourceKey: rootKey, layerNumber: n + 1, inputKey}))];
        const result = await repairBrowser({screen: {...screen, managed, ...planned}, pc, index, readInputs, command, displayURL, expected,
            save: async next => { managed = next.managed; await remember(); }});
        return {managed: result.managed, ...planned};
    }
    function rebindLayout(layout, before, after) {
        const ids = new Map([[before.root, after.root], ...before.parts.map((key, i) => [key, after.parts[i]])]);
        return layout.map(p => ({...p, source: ids.get(p.source) || p.source}));
    }
    function rebindLayerSources(rows, before, after) {
        return rebindLayout(rows.map(r => ({...r, source: r.parent})), before, after).map((r, i) => ({parent: r.source, layer: r.layer, source: rows[i].source}));
    }
    function browserNeedsRepair(screen, inputs) {
        const managed = screen.managed;
        if(!managed) return false;
        const parent = M.resolveSource(inputs, managed.root);
        const browser = M.resolveSource(inputs, managed.browser);
        if(!parent) return false;
        if(!browser || !M.isBrowser(browser) || managed.htmlPending) return true;
        const active = managed.active[parent.key] || [];
        const layer = (parent.layers || []).find((l, n) => M.layerNumber(l.index, n) === HTML_LAYER);
        if(!active.includes(HTML_LAYER) || !layer || layer.inputKey !== browser.key || layer.enabled === false) return true;
        const full = {zoomX: 100, zoomY: 100, panX: 0, panY: 0};
        return Object.entries(full).some(([name, value]) => Math.abs((layer.position && layer.position[name] !== undefined ? layer.position[name] : value) - value) > .01) ||
            (parent.layers || []).some((l, n) => l.inputKey === browser.key && M.layerNumber(l.index, n) !== HTML_LAYER && active.includes(M.layerNumber(l.index, n)));
    }
    async function repairBrowser({screen, pc, index, readInputs, command, displayURL, save = async () => {}, expected = []}) {
        const inputs = await readInputs();
        const next = M.clone(screen);
        const managed = next.managed;
        const parent = managed && M.resolveSource(inputs, managed.root);
        let browser = managed && M.resolveSource(inputs, managed.browser);
        if(!parent) throw new Error('L’entrée multiview est introuvable. Réappliquez un modèle pour la reconstruire.');
        if(screen.layout.some(p => (p.source === parent.key || p.source === parent.number) && p.layer === HTML_LAYER)) throw new Error('Le layer 10 contient une position vidéo mémorisée. Réappliquez un modèle pour réserver ce layer à la source HTML.');
        const missing = !browser || !M.isBrowser(browser);
        if(missing && (!pc || !Number.isInteger(index) || typeof displayURL !== 'function')) throw new Error('L’URL de cet écran est nécessaire pour créer sa source HTML.');
        if(displayURL) managed.htmlPending = true;
        if(missing || pc && Number.isInteger(index)) {
            await ensureInput({kind: 'browser', label: 'Habillage', current: missing ? null : browser.key, pc, index, readInputs, command,
                record: key => managed.browser = key, remember: () => save(M.clone(next))});
            browser = M.resolveSource(await readInputs(), managed.browser);
        }
        const oldSlots = (parent.layers || []).flatMap((l, n) => l.inputKey === browser.key && M.layerNumber(l.index, n) !== HTML_LAYER ? [M.layerNumber(l.index, n)] : []);
        // Attach the HTML above the video first, then switch off older copies.
        await command('SetLayer', {Input: parent.key, Value: HTML_LAYER + ',' + browser.key});
        for(const [suffix, value] of [['Zoom', '1'], ['PanX', '0'], ['PanY', '0']]) await command('SetLayer' + HTML_LAYER + suffix, {Input: parent.key, Value: value});
        await command('LayerOn', {Input: parent.key, Value: String(HTML_LAYER)});
        for(const n of oldSlots) await command('LayerOff', {Input: parent.key, Value: String(n)});
        next.managed.active[parent.key] = [...new Set([...(next.managed.active[parent.key] || []).filter(n => n !== HTML_LAYER && !oldSlots.includes(n)), HTML_LAYER])];
        next.layerSources = (next.layerSources || []).filter(r => r.parent !== parent.key || (r.layer !== HTML_LAYER && !oldSlots.includes(r.layer)));
        if(!next.layerSources.length) delete next.layerSources;
        await save(M.clone(next));
        // Keep the browser attached even if navigation fails; a retry reuses its ID.
        if(displayURL) {
            await command('BrowserNavigate', {Input: browser.key, Value: await displayURL()});
            // Fragment-only changes do not restart the viewer by themselves.
            await command('BrowserReload', {Input: browser.key});
        }
        await confirmLayers([...expected, {sourceKey: parent.key, layerNumber: HTML_LAYER, inputKey: browser.key}], readInputs);
        delete managed.htmlPending;
        await save(M.clone(next));
        return next;
    }
    async function assignLayer({screen, layer, sourceKey, readInputs, command}) {
        if(!Number.isInteger(layer.layerNumber) || layer.layerNumber < 1 || layer.layerNumber > 10) throw new Error('Numéro de layer invalide.');
        const inputs = await readInputs();
        const parent = M.resolveSource(inputs, layer.sourceKey);
        if(!parent) throw new Error('L’entrée du layer est introuvable.');
        if(screen.managed && parent.key === screen.managed.root && layer.layerNumber === HTML_LAYER) throw new Error('Le layer 10 est réservé à la source HTML (navigateur).');
        const current = (parent.layers || []).find((l, i) => M.layerNumber(l.index, i) === layer.layerNumber);
        if(current && M.isBrowser(M.resolveSource(inputs, current.inputKey))) throw new Error('Le layer navigateur est réservé à l’habillage.');
        let slot = -1;
        if(screen.managed) {
            slot = screen.managed.sources.findIndex((_, n) => (screen.managed.sources.length > 9 ? screen.managed.parts[Math.floor(n / 10)] : screen.managed.root) === parent.key && (screen.managed.sources.length > 9 ? n % 10 + 1 : n + 1) === layer.layerNumber);
            if(slot === -1) throw new Error('Ce layer est réservé au regroupement ou à l’habillage.');
        }
        if(sourceKey !== null) {
            if(!candidates(inputs, screen).some(i => i.key === sourceKey) || sourceKey === parent.key) throw new Error('Cette source ne peut pas être affectée à une vignette.');
            const seen = new Set();
            function containsParent(key) {
                if(key === parent.key) return true;
                if(seen.has(key)) return false;
                seen.add(key);
                const input = M.resolveSource(inputs, key);
                return input && (input.layers || []).some(l => containsParent(l.inputKey));
            }
            if(containsParent(sourceKey)) throw new Error('Cette affectation créerait une boucle de layers.');
            const groupIndex = screen.managed ? screen.managed.parts.indexOf(parent.key) : -1;
            const root = groupIndex >= 0 && M.resolveSource(inputs, screen.managed.root);
            if(root) {
                const group = (root.layers || []).find((l, n) => M.layerNumber(l.index, n) === groupIndex + 1);
                if(!group || group.inputKey !== parent.key || group.enabled === false) {
                    await command('SetLayer', {Input: root.key, Value: (groupIndex + 1) + ',' + parent.key});
                    for(const [suffix, value] of [['Zoom', '1'], ['PanX', '0'], ['PanY', '0']]) await command('SetLayer' + (groupIndex + 1) + suffix, {Input: root.key, Value: value});
                    await command('LayerOn', {Input: root.key, Value: String(groupIndex + 1)});
                }
            }
            await command('SetLayer', {Input: parent.key, Value: layer.layerNumber + ',' + sourceKey});
            const blank = (screen.layerSources || []).some(r => r.parent === parent.key && r.layer === layer.layerNumber && r.source === null);
            const saved = screen.layout.find(p => (p.source === parent.key || p.source === parent.number) && p.layer === layer.layerNumber);
            const geometry = blank && saved ? saved : {...(saved || {}), ...(layer.localPosition || {}), ...(current ? current.position : {})};
            if(Number.isFinite(geometry.zoomX) && Math.abs(geometry.zoomX - geometry.zoomY) < .01) await command('SetLayer' + layer.layerNumber + 'Zoom', {Input: parent.key, Value: String(geometry.zoomX / 100)});
            for(const [field, suffix] of [['panX', 'PanX'], ['panY', 'PanY']]) if(Number.isFinite(geometry[field])) await command('SetLayer' + layer.layerNumber + suffix, {Input: parent.key, Value: String(geometry[field] / 100)});
            await command('LayerOn', {Input: parent.key, Value: String(layer.layerNumber)});
        } else await command('LayerOff', {Input: parent.key, Value: String(layer.layerNumber)});
        const next = M.clone(screen);
        const row = {parent: parent.key, layer: layer.layerNumber, source: sourceKey};
        next.layerSources = [...(next.layerSources || []).filter(r => r.parent !== row.parent || r.layer !== row.layer), row];
        const geometry = layer.localPosition || (current && current.position);
        const savedPosition = next.layout.find(p => (p.source === parent.key || p.source === parent.number) && p.layer === row.layer);
        if(savedPosition) savedPosition.source = parent.key;
        else if(geometry && geometry.zoomX > 0 && geometry.zoomY > 0) next.layout.push({source: parent.key, layer: row.layer, ...Object.fromEntries(['zoomX', 'zoomY', 'panX', 'panY'].map(k => [k, geometry[k]]))});
        if(next.managed && sourceKey !== null) {
            next.managed.sources[slot] = sourceKey;
            if(next.videoInputs && next.videoInputs.length) next.videoInputs[slot] = sourceKey;
        }
        if(next.managed) next.managed.active = M.activeLayersFor(next, inputs);
        return next;
    }
    const api = {candidates, selectSources, build, rebindLayout, rebindLayerSources, assignLayer, HTML_LAYER, browserNeedsRepair, repairBrowser};
    if(typeof module !== 'undefined') module.exports = api;
    else root.MultiviewBuilder = api;
})(typeof window !== 'undefined' ? window : globalThis);
