/* Shared, dependency-free configuration and layout model. */
(function(root) {
    const clone = value => JSON.parse(JSON.stringify(value));
    function layerNumber(xmlIndex, ordinal) {
        // XML overlay indices start at zero; shortcut function names start at one.
        return xmlIndex == null || xmlIndex === '' ? ordinal + 1 : Number(xmlIndex) + 1;
    }
    function screen(inputs = [0]) {
        return { inputs, extras: [], tiles: [], layout: [] };
    }
    const MAX_SCREENS = 32;
    const HTML_LAYER = 10;
    const DEFAULT_SPACING = 2;
    const LEGACY_SPACING = 13;
    const themes = [
        {id: 'classic', name: 'Classique', description: 'Libellés centrés, tally vert et rouge.'},
        {id: 'openmultiview', name: 'OpenMultiview', description: 'Bandeaux bleu nuit, preview menthe et programme corail.'}
    ];
    const themeFor = s => themes.some(t => t.id === s.theme) ? s.theme : 'classic';
    function tileDefaultsFor(theme = 'classic') {
        return {...tileDefaults, ...(theme === 'openmultiview' ? {borderWidth: 2, borderColor: '#536b74', previewColor: '#66e5b5', programColor: '#ff7164'} : {})};
    }
    function changeTheme(tiles, previous, next) {
        const before = tileDefaultsFor(previous), after = tileDefaultsFor(next);
        return tiles.map(tile => {
            const result = clone(tile);
            if(!result.value || typeof result.value !== 'object') return result;
            for(const key of ['borderWidth', 'borderColor', 'previewColor', 'programColor']) {
                // Keep individual custom colors and only replace inherited defaults.
                if(result.value[key] === before[key]) result.value[key] = after[key];
            }
            return result;
        });
    }
    function validSpacing(value) { return Number.isFinite(value) && value >= 0 && value <= 20; }
    function spacingFor(screen) {
        return screen.spacing !== undefined ? screen.spacing : screen.managed ? screen.managed.spacing ?? LEGACY_SPACING : DEFAULT_SPACING;
    }
    const validReference = ref => (Number.isInteger(ref) && ref >= 0) || (typeof ref === 'string' && ref.trim().length > 0 && ref.length <= 200);
    function parseSourceReference(value) {
        const ref = String(value == null ? '' : value).trim();
        if(!ref) return undefined;
        if(ref.startsWith('key:')) return ref.slice(4) || undefined;
        if(/^\d+$/.test(ref)) return Math.max(Number(ref) - 1, 0);
        return ref;
    }
    function resolveSource(inputs, ref) {
        if(typeof ref === 'string') return inputs.find(i => i.key === ref.replace(/^key:/, '')) || (/^\d+$/.test(ref) ? inputs.find(i => i.number === Number(ref)) : undefined);
        return inputs.find(i => i.number === ref + 1);
    }
    function isBrowser(input) {
        // The PC name may contain "URL"; generated Colour inputs remain video groups.
        if(isGeneratedMultiview(input)) return false;
        return !!input && /https?:\/\/|\bbrowser\b|\bweb\s*(browser|page)\b|\bpage\s*web\b|\bwebsite\b|\burl\b/i.test([input.title, input.shortTitle, input.type].join(' '));
    }
    function isGeneratedMultiview(input) {
        return !!input && /^(Colour|Color)$/i.test(input.type || '') && /^MV · .+ · Écran \d+ · (Multiview|Vignettes \d+)$/.test(input.title || '');
    }
    function role(input) {
        const label = [input.title, input.shortTitle].join(' ');
        if(/\b(pgm|program|programme|output)\b/i.test(label)) return 'PGM';
        if(/\b(pvw|prv|preview)\b/i.test(label)) return 'PVW';
        return '';
    }
    function audioRoute(input) {
        const label = [input.title, input.shortTitle].join(' ');
        const bus = label.match(/\bBUS[\s:_-]*([A-G])\b/i) || label.match(/\bPGM\s*\+\s*([A-G])\b/i);
        if(bus) return 'bus' + bus[1].toUpperCase();
        return /^Output$/i.test(input.type || '') || role(input) === 'PGM' ? 'master' : 'input';
    }
    function audioLevels(input, buses) {
        const audioSource = audioRoute(input);
        const meter = audioSource === 'input' ? input : buses[audioSource];
        const number = value => value == null || value === '' ? NaN : Number(value);
        const level = value => {
            const amplitude = number(value);
            return Number.isFinite(amplitude) && amplitude > 0 ? Math.max(0, Math.min(100, (20 * Math.log10(amplitude) + 60) / 60 * 100)) : 0;
        };
        const audioAvailable = !!meter && [meter.meterF1, meter.meterF2].some(value => Number.isFinite(number(value)));
        return {audioSource, audioAvailable, audio: audioSource !== 'input' || audioAvailable,
            muted: !!meter && (meter.muted === true || /^true$/i.test(String(meter.muted))),
            audioL: level(meter && meter.meterF1), audioR: level(meter && meter.meterF2)};
    }
    const nextUpdate = (previous, now = Date.now()) => Math.max(Number(previous || 0) + 1, now);
    const PUBLIC_ORIGINS = ['https://vincentberry.github.io'];
    function isLoopbackURL(value) {
        try {
            const url = new URL(value);
            return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password;
        } catch (_) { return false; }
    }
    function syncBases(pageURL) {
        if(PUBLIC_ORIGINS.includes(new URL(pageURL).origin)) return ['http://127.0.0.1:8090/'];
        const bases = [new URL('./', pageURL).href];
        if(isLoopbackURL(pageURL) && new URL(pageURL).origin !== 'http://127.0.0.1:8090') bases.push('http://127.0.0.1:8090/');
        return [...new Set(bases)];
    }
    const identity = {zoomX: 100, zoomY: 100, panX: 0, panY: 0};
    function compose(parent, local) {
        return {zoomX: parent.zoomX * local.zoomX / 100, zoomY: parent.zoomY * local.zoomY / 100,
            panX: parent.panX + local.panX * parent.zoomX / 100, panY: parent.panY + local.panY * parent.zoomY / 100};
    }
    function localPosition(target, parent = identity) {
        if(!parent.zoomX || !parent.zoomY) throw new Error('Une entrée de regroupement a un zoom nul.');
        return {zoomX: target.zoomX * 100 / parent.zoomX, zoomY: target.zoomY * 100 / parent.zoomY,
            panX: (target.panX - parent.panX) * 100 / parent.zoomX, panY: (target.panY - parent.panY) * 100 / parent.zoomY};
    }
    function layerKey(source, index) {
        const safe = String(source).replace(/[^a-zA-Z0-9_-]/g, c => '_' + c.charCodeAt(0).toString(16) + '_');
        return 'source-' + safe + '-layer-' + index;
    }
    function collectLayers(inputs, references, activeLayers = {}, layout = []) {
        const selected = references.map(ref => resolveSource(inputs, ref)).filter(Boolean);
        const selectedKeys = new Set(selected.map(i => i.key));
        const byKey = new Map(inputs.map(i => [i.key, i]));
        const container = input => input && !isBrowser(input) && (Object.hasOwn(activeLayers, input.key) || isGeneratedMultiview(input) ||
            input.layers && input.layers.length && (selectedKeys.has(input.key) || (!role(input) && !/^(Mix|Virtual)$/i.test(input.type || ''))));
        const descendants = input => {
            const found = new Set();
            function visit(node) {
                if(!node || found.has(node.key)) return;
                found.add(node.key);
                (node.layers || []).forEach(l => { const child = byKey.get(l.inputKey); if(container(child)) visit(child); });
            }
            visit(input); found.delete(input.key); return found;
        };
        const nestedKeys = new Set(selected.flatMap(i => [...descendants(i)]));
        let roots = selected.filter(i => !nestedKeys.has(i.key));
        if(!roots.length && selected.length) roots = [selected[0]];
        const layers = [], warnings = [], visited = new Set(), parents = new Map();
        references.forEach(ref => { if(!resolveSource(inputs, ref)) warnings.push('Entrée introuvable : ' + (typeof ref === 'number' ? ref + 1 : ref)); });
        function walk(source, parent, path) {
            if(path.has(source.key)) { warnings.push('Boucle de regroupement : ' + (source.title || source.key)); return; }
            const nextPath = new Set([...path, source.key]);
            parents.set(source.key, parent);
            (source.layers || []).forEach((layer, ordinal) => {
                if(activeLayers[source.key] && !activeLayers[source.key].includes(layerNumber(layer.index, ordinal))) return;
                const input = byKey.get(layer.inputKey);
                if(!input || isBrowser(input)) return;
                const saved = layout.find(p => (p.source === source.key || p.source === source.number) && p.layer === layerNumber(layer.index, ordinal));
                const local = {...identity, ...(saved ? Object.fromEntries(['zoomX', 'zoomY', 'panX', 'panY'].map(k => [k, saved[k]])) : {}), ...layer.position};
                const global = compose(parent, local);
                if(container(input)) { walk(input, global, nextPath); return; }
                const index = layer.index == null ? ordinal : layer.index;
                const key = layerKey(source.key, index);
                if(visited.has(key)) return;
                visited.add(key);
                layers.push({...global, localPosition: local, parentPosition: parent, inputKey: input.key, inputName: input.title || input.shortTitle || input.key,
                    sourceKey: source.key, sourceNumber: source.number, layerNumber: layerNumber(layer.index, ordinal), layerKey: key,
                    legacyLayerKey: layerKey(source.number, index), role: role(input),
                    layerName: 'Entrée ' + source.number + ' · ' + (source.title || source.key) + ' / Layer ' + layerNumber(layer.index, ordinal)});
            });
        }
        roots.forEach(i => { if(!isBrowser(i)) walk(i, identity, new Set()); });
        return {layers, warnings, parents};
    }
    function migrateTileSettings(tiles, layers) {
        const migrated = [], consumed = new Set();
        layers.forEach(layer => {
            const legacy = tiles.find(t => t.key === layer.legacyLayerKey);
            if(!legacy || layer.legacyLayerKey === layer.layerKey) return;
            consumed.add(legacy.key);
            if(!tiles.some(t => t.key === layer.layerKey)) migrated.push({key: layer.layerKey, value: clone(legacy.value)});
        });
        return [...tiles.filter(t => !consumed.has(t.key)), ...migrated];
    }
    function activeLayersFor(screen, inputs) {
        const active = clone(screen.managed ? screen.managed.active : {});
        const managed = screen.managed;
        if(managed && managed.root && Array.isArray(managed.sources)) {
            [managed.root, ...managed.parts].filter(Boolean).forEach(key => active[key] = []);
            const grouped = managed.sources.length > 9;
            videoLayersFor(managed).forEach(l => active[l.sourceKey].push(l.layerNumber));
            if(grouped) active[managed.root] = managed.parts.slice(0, Math.ceil(managed.sources.length / 10)).map((_, n) => n + 1);
            if(managed.browser) active[managed.root].push(HTML_LAYER);
        }
        (screen.layerSources || []).forEach(row => {
            if(!active[row.parent]) {
                const parent = resolveSource(inputs, row.parent);
                active[row.parent] = parent ? (parent.layers || []).map((l, i) => layerNumber(l.index, i)) : Array.from({length: 10}, (_, i) => i + 1);
            }
            if(row.source === null) active[row.parent] = active[row.parent].filter(n => n !== row.layer);
            else if(!active[row.parent].includes(row.layer)) active[row.parent].push(row.layer);
        });
        return active;
    }
    function videoLayersFor(managed) {
        if(!managed || !Array.isArray(managed.sources)) return [];
        const grouped = managed.sources.length > 9;
        return managed.sources.map((inputKey, n) => ({inputKey, sourceKey: grouped ? managed.parts[Math.floor(n / 10)] : managed.root,
            layerNumber: grouped ? n % 10 + 1 : n + 1})).filter(l => l.sourceKey);
    }
    function layoutFor(screen, inputs) {
        const planned = videoLayersFor(screen.managed);
        const template = screen.managed && templates.find(t => t.id === screen.managed.template && t.slots);
        if(!template || planned.length !== template.slots.length) return screen.layout;
        const base = positions(template.slots, planned.map(l => ({...l, role: (resolveSource(inputs, l.inputKey) || {}).title ? role(resolveSource(inputs, l.inputKey)) : ''})), spacingFor(screen));
        const savedFor = p => screen.layout.find(s => (s.source === p.source || s.source === (resolveSource(inputs, p.source) || {}).number) && s.layer === p.layer);
        return [...base.map(p => savedFor(p) || p), ...screen.layout.filter(p => !base.some(b => (b.source === p.source || (resolveSource(inputs, b.source) || {}).number === p.source) && b.layer === p.layer))];
    }
    function configurableLayers(screen, inputs) {
        const layout = layoutFor(screen, inputs);
        const collected = collectLayers(inputs, screen.inputs, activeLayersFor(screen, inputs), layout);
        const planned = videoLayersFor(screen.managed);
        const isPlanned = (parent, layer) => planned.some(l => l.sourceKey === parent && l.layerNumber === layer);
        const layers = new Map(collected.layers.filter(l => !screen.managed || isPlanned(l.sourceKey, l.layerNumber)).map(l => [l.layerKey, l]));
        const slots = [...planned.map(l => ({parent: l.sourceKey, layer: l.layerNumber, inputKey: l.inputKey})),
            ...layout.map(p => ({parent: typeof p.source === 'number' ? (resolveSource(inputs, p.source - 1) || {}).key : p.source, layer: p.layer})), ...(screen.layerSources || [])];
        slots.forEach(slot => {
            const parent = resolveSource(inputs, slot.parent);
            if(!parent || screen.managed && !isPlanned(parent.key, slot.layer)) return;
            const key = layerKey(parent.key, slot.layer - 1);
            if(layers.has(key)) return;
            const row = (screen.layerSources || []).find(r => r.parent === parent.key && r.layer === slot.layer);
            const current = (parent.layers || []).find((l, n) => layerNumber(l.index, n) === slot.layer);
            const expected = planned.find(l => l.sourceKey === parent.key && l.layerNumber === slot.layer);
            const inputKey = row && row.source !== null ? row.source : current && current.inputKey || expected && expected.inputKey;
            const input = resolveSource(inputs, inputKey);
            if(isBrowser(input) || screen.managed && screen.managed.parts.includes(inputKey)) return;
            const saved = layout.find(p => (p.source === parent.key || p.source === parent.number) && p.layer === slot.layer);
            const disabled = !!(row && row.source === null) || !input;
            const local = disabled && saved ? saved : {...identity, ...(saved || {}), ...(current && current.position || {})};
            const parentPosition = collected.parents.get(parent.key) || identity;
            layers.set(key, {...compose(parentPosition, local), localPosition: local, parentPosition, sourceKey: parent.key, sourceNumber: parent.number,
                layerNumber: slot.layer, layerKey: key, inputKey, inputName: input ? input.title || input.key : 'Source à choisir',
                role: input ? role(input) : '', disabled, pending: !disabled,
                layerName: 'Entrée ' + parent.number + ' · ' + parent.title + ' / Layer ' + slot.layer});
        });
        return [...layers.values()].sort((a, b) => a.sourceNumber - b.sourceNumber || a.layerNumber - b.layerNumber);
    }
    function validate(value) {
        if (!value || value.version !== 1 || !Array.isArray(value.screens) || value.screens.length < 1 || value.screens.length > MAX_SCREENS) throw new Error('Configuration invalide');
        if (typeof value.pc !== 'string' || !value.pc || value.pc.length > 80) throw new Error('Identifiant PC invalide');
        if (!/^[a-zA-Z0-9.:-]+$/.test(value.host) || !Number.isInteger(+value.port) || +value.port < 1 || +value.port > 65535) throw new Error('Adresse vMix invalide');
        value.screens.forEach(s => {
            if (!Array.isArray(s.inputs) || !s.inputs.length || s.inputs.some(n => !validReference(n))) throw new Error('Entrées invalides');
            if (!Array.isArray(s.tiles) || !Array.isArray(s.extras) || !Array.isArray(s.layout)) throw new Error('Écran invalide');
            if(s.spacing !== undefined && !validSpacing(s.spacing)) throw new Error('Espacement invalide');
            if(s.theme !== undefined && !themes.some(t => t.id === s.theme)) throw new Error('Thème invalide');
            if(s.hideOutputAudioByDefault !== undefined && typeof s.hideOutputAudioByDefault !== 'boolean') throw new Error('Réglage audio par défaut invalide');
            if(s.videoInputs && (!Array.isArray(s.videoInputs) || s.videoInputs.some(k => typeof k !== 'string' || !validReference(k)))) throw new Error('Sources vidéo invalides');
            if(s.layerSources && (!Array.isArray(s.layerSources) || s.layerSources.some(r => !r || typeof r.parent !== 'string' || !validReference(r.parent) || !Number.isInteger(r.layer) || r.layer < 1 || r.layer > 10 || (r.source !== null && (typeof r.source !== 'string' || !validReference(r.source)))))) throw new Error('Affectations de layers invalides');
            if(s.managed) {
                if(s.managed.htmlPending !== undefined && typeof s.managed.htmlPending !== 'boolean') throw new Error('État de source HTML invalide');
                if(s.managed.spacing !== undefined && !validSpacing(s.managed.spacing)) throw new Error('Espacement appliqué invalide');
                if(typeof s.managed !== 'object' || !Array.isArray(s.managed.parts) || !Array.isArray(s.managed.sources) || !s.managed.active || typeof s.managed.active !== 'object') throw new Error('Entrées automatiques invalides');
                if([s.managed.root, s.managed.browser, ...s.managed.parts, ...s.managed.sources].filter(k => k != null).some(k => typeof k !== 'string' || !validReference(k))) throw new Error('ID automatique invalide');
                Object.values(s.managed.active).forEach(slots => { if(!Array.isArray(slots) || slots.some(n => !Number.isInteger(n) || n < 1 || n > 10)) throw new Error('Layers automatiques invalides'); });
            }
            s.tiles.forEach(t => {
                if (!t || typeof t.key !== 'string' || !t.value || typeof t.value !== 'object') throw new Error('Layer invalide');
                Object.entries(t.value).forEach(([key, val]) => {
                    if (/Color$/.test(key) && !/^#[0-9a-f]{6}$/i.test(val)) throw new Error('Couleur invalide');
                });
            });
            s.layout.forEach(p => {
                if (!p || !validReference(p.source) || p.source === 0 || !Number.isInteger(p.layer) || p.layer < 1 || p.layer > 10 || ![p.zoomX, p.zoomY, p.panX, p.panY].every(Number.isFinite) || p.zoomX <= 0 || p.zoomY <= 0 || p.zoomX > 500 || p.zoomY > 500 || Math.abs(p.panX) > 200 || Math.abs(p.panY) > 200) throw new Error('Position invalide');
            });
        });
        return clone(value);
    }
    function grid(cols, rows, y = 0, height = 1, x = 0, width = 1) {
        // A square in normalized coordinates is a 16:9 video on a 16:9 canvas.
        const size = Math.min(width / cols, height / rows);
        const startX = x + (width - cols * size) / 2;
        const startY = y + (height - rows * size) / 2;
        return Array.from({length: cols * rows}, (_, i) => ({x: startX + (i % cols) * size, y: startY + Math.floor(i / cols) * size, w: size, h: size}));
    }
    const slot = (x, y, w, h, label) => ({x, y, w, h, label});
    const numbered = (slots, start = 1) => slots.map((s, i) => ({...s, label: String(start + i)}));
    const rightGrid = rows => numbered(grid(2, rows, 0, 1, .5, .5));
    const templates = [
        {id: 'preset-1', name: 'Preset 1 · PVW / PGM + 8', slots: [slot(0, 0, .5, .5, 'PVW'), slot(.5, 0, .5, .5, 'PGM'), ...numbered(grid(4, 2, .5, .5))]},
        {id: 'preset-2', name: 'Preset 2 · PGM / PVW à gauche + 8', slots: [slot(0, 0, .5, .5, 'PGM'), slot(0, .5, .5, .5, 'PVW'), ...rightGrid(4)]},
        {id: 'preset-3', name: 'Preset 3 · PVW / PGM + 6', slots: [slot(0, 0, .5, .5, 'PVW'), slot(.5, 0, .5, .5, 'PGM'), ...numbered(grid(3, 2, .5, .5))]},
        {id: 'preset-4', name: 'Preset 4 · PGM / PVW à gauche + 6', slots: [slot(0, 0, .5, .5, 'PGM'), slot(0, .5, .5, .5, 'PVW'), ...rightGrid(3)]},
        {id: 'preset-5', name: 'Preset 5 · PGM + 5', slots: [slot(0, 0, 2/3, 2/3, 'PGM'), slot(2/3, 0, 1/3, 1/3, '1'), slot(2/3, 1/3, 1/3, 1/3, '2'), ...numbered(grid(3, 1, 2/3, 1/3), 3)]},
        {id: 'preset-6', name: 'Preset 6 · 8 sources + PGM', slots: grid(3, 3).map((s, i) => ({...s, label: i === 8 ? 'PGM' : String(i + 1)}))},
        {id: 'preset-7', name: 'Preset 7 · PGM en haut à gauche + 12', slots: [slot(0, 0, .5, .5, 'PGM'), ...numbered([...grid(2, 2, 0, .5, .5, .5), ...grid(4, 2, .5, .5)])]},
        {id: 'preset-8', name: 'Preset 8 · PVW en haut à droite + 12', slots: [slot(.5, 0, .5, .5, 'PVW'), ...numbered([...grid(2, 2, 0, .5, 0, .5), ...grid(4, 2, .5, .5)])]},
        { id: 'quad', name: 'Quad · 4 sources', slots: grid(2, 2) },
        { id: 'nine', name: 'Grille · 9 sources', slots: grid(3, 3) },
        { id: 'six', name: 'Grille · 6 sources', slots: grid(3, 2) },
        { id: 'twelve', name: 'Grille · 12 sources', slots: grid(4, 3) },
        { id: 'sixteen', name: 'Grille · 16 sources', slots: grid(4, 4) },
        { id: 'production', name: 'Production · 2 + 8', slots: [...grid(2, 1, 0, .5), ...grid(4, 2, .5, .5)] },
        { id: 'hero', name: 'Programme · 1 + 6', slots: [slot(1/6, 0, 2/3, 2/3), ...grid(3, 2, 2/3, 1/3)] },
        { id: 'dual', name: 'Régie · 2 écrans', screens: ['production', 'nine'] }
    ];
    function templateFrames(slots, spacing = DEFAULT_SPACING) {
        if(!validSpacing(spacing)) throw new Error('Espacement invalide');
        return slots.map(s => {
            const size = Math.min(s.w, s.h) * (1 - spacing / 100);
            return {...s, x: s.x + (s.w - size) / 2, y: s.y + (s.h - size) / 2, w: size, h: size};
        });
    }
    function positions(slots, layers, spacing = DEFAULT_SPACING) {
        const frames = templateFrames(slots, spacing);
        const assigned = new Set();
        const assignment = slots.map(s => {
            if(s.label !== 'PGM' && s.label !== 'PVW') return null;
            const layer = layers.find(l => l.role === s.label && !assigned.has(l));
            if(layer) assigned.add(layer);
            return layer;
        });
        return frames.map((frame, i) => {
            const slot = slots[i];
            const layer = assignment[i] || layers.find(l => !assigned.has(l));
            if (!layer) throw new Error(`Ce modèle nécessite ${slots.length} layers vidéo. Ajoutez-les dans vMix avant de l’appliquer.`);
            assigned.add(layer);
            const target = {zoomX: frame.w * 100, zoomY: frame.h * 100,
                panX: (slot.x + slot.w / 2 - .5) * 200,
                panY: (.5 - slot.y - slot.h / 2) * 200 };
            return {source: layer.sourceKey || layer.source, layer: layer.layerNumber || layer.layer, ...localPosition(target, layer.parentPosition)};
        });
    }
    function resizeSpacing(layout, previous, next) {
        if(!validSpacing(previous) || !validSpacing(next)) throw new Error('Espacement invalide');
        const ratio = (100 - next) / (100 - previous);
        return layout.map(p => ({...p, zoomX: p.zoomX * ratio, zoomY: p.zoomY * ratio}));
    }
    const tileDefaults = {enabled: true, tally: true, name: true, vu: true, timer: false, frame: true,
        titlePosition: 'overlay-bottom', titleBackground: true, titleFontSize: 22, vuPosition: 'inside-left',
        borderWidth: 3, borderColor: '#b4b4b4', previewColor: '#0de416', programColor: '#ff0000'};
    // Compact portable URLs: positions and extras otherwise repeat long property
    // names for every layer, readily exceeding web-server request-line limits.
    const extraFields = ['zoomY', 'zoomX', 'panX', 'panY', 'color', 'enabled', 'fontSize', 'mask'];
    function pack(config) {
        return {v: 1, p: config.pc, h: config.host, o: config.port, u: config.updated, s: config.screens.map(s => [
            s.inputs, s.extras.map(e => extraFields.map(k => e[k] === undefined ? null : e[k])),
            s.tiles.map(t => [t.key, Object.fromEntries(Object.entries(t.value).filter(([k, v]) => k === 'vu' && s.hideOutputAudioByDefault === true || tileDefaultsFor(themeFor(s))[k] !== v))]),
            s.layout.map(p => [p.source, p.layer, ...['zoomX', 'zoomY', 'panX', 'panY'].map(k => Math.round(p[k] * 100000) / 100000)]),
            s.managed || null, s.videoInputs || [], (s.layerSources || []).map(r => [r.parent, r.layer, r.source]), s.spacing ?? null, s.hideOutputAudioByDefault ?? null, s.theme ?? null
        ])};
    }
    function unpack(value) {
        if(value.v !== 1) return validate(value);
        return validate({version: 1, pc: value.p, host: value.h, port: value.o, updated: value.u,
            screens: value.s.map(s => ({inputs: s[0], extras: s[1].map(e => Object.fromEntries(extraFields.map((k, i) => [k, e[i]]).filter(p => p[1] !== null))),
                tiles: s[2].map(t => ({key: t[0], value: t[1]})),
                layout: s[3].map(p => ({source: p[0], layer: p[1], zoomX: p[2], zoomY: p[3], panX: p[4], panY: p[5]})),
                ...(s[4] ? {managed: s[4]} : {}), ...(s[5] && s[5].length ? {videoInputs: s[5]} : {}),
                ...(s[6] && s[6].length ? {layerSources: s[6].map(r => ({parent: r[0], layer: r[1], source: r[2]}))} : {}),
                ...(s[7] != null ? {spacing: s[7]} : {}), ...(s[8] != null ? {hideOutputAudioByDefault: s[8]} : {}), ...(s[9] != null ? {theme: s[9]} : {})}))});
    }
    function legacyPC(query) {
        // Unnamed old links belong to their own URL, never to the default regie PC.
        const text = JSON.stringify(['Inputs', 'Input', 'Input2', 'Settings', 'MaskSettings', 'IP', 'Port'].map(k => [k, query.get(k)]));
        let a = 0x811c9dc5, b = 0x9e3779b9;
        for(let i = 0; i < text.length; i++) {
            a = Math.imul(a ^ text.charCodeAt(i), 0x01000193);
            b = Math.imul(b ^ text.charCodeAt(i), 0x5bd1e995);
        }
        return 'legacy-' + [a, b].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
    }
    const MAX_REQUEST_TARGET = 1800;
    function urlParameters(href) {
        const url = new URL(href);
        const parameters = new URLSearchParams(url.search);
        // A normal section anchor is not a configuration. Fragment values win
        // when a portable link also carries a small routing query.
        if(url.hash.includes('=')) for(const [name, value] of new URLSearchParams(url.hash.replace(/^#\??/, ''))) parameters.set(name, value);
        return parameters;
    }
    function safeURL(href) {
        const target = new URL(href);
        if((target.pathname + target.search).length <= MAX_REQUEST_TARGET) return target.href;
        const parameters = urlParameters(target.href);
        const selected = Number(parameters.get('Screen'));
        const screen = Number.isInteger(selected) && selected >= 1 && selected <= MAX_SCREENS ? selected : 1;
        const language = parameters.get('Lang');
        // The fragment is kept by browsers and vMix, but is never sent in the
        // HTTP request. All fields remain self-contained, including old masks.
        target.search = 'Screen=' + screen + (['fr', 'en', 'es'].includes(language) ? '&Lang=' + language : '');
        target.hash = [...parameters].map(([name, value]) => encodeURIComponent(name) + '=' + encodeURIComponent(value)).join('&');
        return target.href;
    }
    function recallURL(href, config, index, {configPage = false, portable = true, linked = false, inputs = [], language} = {}) {
        const s = config.screens[index];
        if(!s) throw new Error('Écran introuvable');
        const target = new URL(configPage ? 'config.html' : 'index.html', href);
        target.hash = '';
        const connection = [['IP', config.host], ['Port', config.port], ['PC', config.pc], ['Screen', String(index + 1)]];
        if(s.theme) connection.push(['Theme', s.theme]);
        if(['en','es'].includes(language)) connection.push(['Lang', language]);
        if(linked) {
            // Only use this after saving to the PC bridge: BrowserNavigate is
            // itself a GET command, so embedding a long fragment would still
            // make the vMix API request too long. Portable backup links stay
            // available separately in the configuration page.
            target.search = connection.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
            return target.href;
        }
        // Old viewers read contributor inputs directly rather than the root's groups.
        const refs = s.managed ? (s.managed.sources.length > 9 ? s.managed.parts.slice(0, Math.ceil(s.managed.sources.length / 10)) : [s.managed.root]) : s.inputs;
        const sourceList = refs.map(ref => {
            const input = resolveSource(inputs, ref);
            const key = input ? input.key : typeof ref === 'string' ? ref.replace(/^key:/, '') : null;
            return key !== null ? 'key:' + encodeURIComponent(key) : String(ref + 1);
        }).join(',');
        const masks = clone(s.tiles);
        const active = activeLayersFor(s, inputs);
        if(s.hideOutputAudioByDefault === true) {
            collectLayers(inputs, s.inputs, active, s.layout).layers.forEach(layer => {
                const input = resolveSource(inputs, layer.inputKey);
                if(!input || !(/^Output$/i.test(input.type || '') || role(input) === 'PGM')) return;
                const entry = masks.find(t => t.key === layer.layerKey) || masks.find(t => t.key === layer.legacyLayerKey) || masks.find(t => t.key === layer.inputKey);
                if(entry && entry.value.vu !== undefined) return;
                if(entry) entry.value.vu = false;
                else masks.push({key: layer.layerKey, value: {vu: false}});
            });
        }
        refs.forEach(ref => {
            const input = resolveSource(inputs, ref);
            const key = input ? input.key : ref;
            if(!active[key]) return;
            for(let layer = 1; layer <= 10; layer++) {
                if(active[key].includes(layer) && !(s.managed && key === s.managed.root && layer === HTML_LAYER)) continue;
                const id = layerKey(key, layer - 1);
                const entry = masks.find(t => t.key === id);
                if(entry) entry.value.enabled = false;
                else masks.push({key: id, value: {enabled: false}});
            }
        });
        const parameters = [['Settings', JSON.stringify(s.extras)], ['MaskSettings', JSON.stringify(masks)], ...connection];
        if(portable) parameters.push(['Config', JSON.stringify(pack(config))]);
        // encodeURIComponent preserves JSON spaces for clients using the old decoder.
        target.search = 'Inputs=' + sourceList + '&' + parameters.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
        return safeURL(target.href);
    }
    const api = {clone, screen, validate, templates, templateFrames, positions, resizeSpacing, spacingFor, DEFAULT_SPACING, LEGACY_SPACING, pack, unpack, legacyPC, recallURL, safeURL, urlParameters, MAX_REQUEST_TARGET, layerNumber, MAX_SCREENS, HTML_LAYER, themes, themeFor, tileDefaultsFor, changeTheme,
        parseSourceReference, resolveSource, isBrowser, isGeneratedMultiview, collectLayers, role, audioRoute, audioLevels, nextUpdate, isLoopbackURL, syncBases, PUBLIC_ORIGINS,
        compose, localPosition, migrateTileSettings, layerKey, activeLayersFor, videoLayersFor, layoutFor, configurableLayers};
    if (typeof module !== 'undefined') module.exports = api;
    else root.MultiviewModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
