const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../multiview-model');

// Synthetic IDs only: no production configuration is included in the repository.
const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const oldExtras = [
    {zoomY: 50, zoomX: 50, panX: 0, panY: 0, color: '#ffffff', enabled: false, fontSize: 70},
    {zoomY: 50, zoomX: 50, panX: 0, panY: 0, color: '#ffffff', enabled: false, fontSize: 70},
    {zoomY: 50, zoomX: 50, panX: 0, panY: 0, enabled: false, fontSize: 36}
];
const oldMasks = [{key: 'source-' + first + '-layer-8', value: {enabled: false, tally: false, name: false, vu: false, timer: false, frame: false, borderWidth: 3, borderColor: '#b4b4b4', previewColor: '#0de416', programColor: '#ff0000'}}];
const oldURL = 'http://127.0.0.1:5500/index.html?Inputs=key:' + first + ',key:' + second + '&Settings=' + encodeURIComponent(JSON.stringify(oldExtras)) + '&MaskSettings=' + encodeURIComponent(JSON.stringify(oldMasks));

function viewer(href, {stored = {}, remote = null, studio = false} = {}) {
    const location = new URL(href);
    const attributes = new Map();
    const calls = [];
    const warnings = [];
    const storage = new Map(Object.entries(stored).map(([pc, config]) => ['multiview.pc.' + pc, JSON.stringify(config)]));
    const jquery = selector => {
        const target = {length: 0};
        let chain;
        chain = new Proxy(target, {get: (_, name) => {
            if(name === 'length') return 0;
            if(name === 'get') return () => [];
            if(name === 'attr') return (key, value) => {if(value !== undefined) attributes.set(selector + ':' + key, value); return chain;};
            return () => chain;
        }});
        return chain;
    };
    const scope = vm.createContext({
        MultiviewModel: M, MultiviewBuilder: {}, URL, URLSearchParams,
        console: {warn: (...args) => warnings.push(args)}, location,
        window: {location, addEventListener() {}}, document: {body: {classList: {contains: () => false}}},
        localStorage: {getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k)},
        crypto: {randomUUID: () => 'url-test'}, Option: function() {}, $: jquery,
        setInterval: () => 0, setTimeout: () => 0, clearTimeout() {},
        fetchWithTimeout: async url => {calls.push(url); return {ok: true, json: async () => remote};}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8'), scope);
    // The viewer's bridge is exercised without the unrelated API polling timer.
    scope.fetchWithTimeout = async url => {calls.push(url); return {ok: true, json: async () => remote};};
    if(studio) vm.runInContext(fs.readFileSync(path.join(__dirname, '../studio.js'), 'utf8'), scope);
    return {scope, calls, warnings, storage, recalled: () => M.unpack(JSON.parse(M.urlParameters(attributes.get('#configureLink:href')).get('Config')))};
}

test('the supplied old URL restores both input IDs, its three extras and disabled layer 9', () => {
    const {scope, warnings} = viewer(oldURL);
    assert.deepEqual(M.clone(scope.vMixSettings.multiViewInputs), [first, second]);
    assert.deepEqual(M.clone(scope.mySettingMask), oldMasks);
    oldExtras.forEach((extra, i) => Object.entries(extra).forEach(([key, value]) => assert.equal(scope.extras[i][key], value)));
    const settings = scope.getTileSettings(oldMasks[0].key);
    for(const key of ['enabled', 'tally', 'name', 'vu', 'timer', 'frame']) assert.equal(settings[key], false);
    assert.equal(warnings.length, 0);
});

test('legacy URLs hide OUTPUT audio by default while cameras and PVW retain their meters', () => {
    const masks = [{key: 'output-style', value: {borderWidth: 5}}, {key: 'output-class', value: 'NameMask'}];
    const href = 'http://localhost/index.html?Inputs=key:root&MaskSettings=' + encodeURIComponent(JSON.stringify(masks));
    const view = viewer(href, {studio: true});
    view.scope.vMixInputs = [
        {key: 'out', type: 'Output', title: 'Retour antenne'},
        {key: 'pgm', type: 'Mix', title: 'PGM'},
        {key: 'bus', type: 'Output', title: 'OUTPUT BUS A'},
        {key: 'cam', type: 'Capture', title: 'CAM 1'},
        {key: 'pvw', type: 'Mix', title: 'PVW'}
    ];
    for(const key of ['out', 'pgm', 'bus']) assert.equal(view.scope.getTileSettings('unconfigured-' + key, key).vu, false);
    for(const key of ['cam', 'pvw']) assert.equal(view.scope.getTileSettings('unconfigured-' + key, key).vu, true);
    assert.equal(view.scope.getTileSettings('output-style', 'out').vu, false);
    assert.equal(view.scope.getTileSettings('output-style', 'out').borderWidth, 5);
    assert.equal(view.scope.getTileSettings('output-class', 'out').vu, false);
    assert.equal(view.scope.getTileSettings('output-class', 'out').name, false);
    assert.equal(view.scope.getTileSettings('output-class', 'cam').vu, true);
    assert.equal(view.recalled().screens[0].hideOutputAudioByDefault, true);
});

test('an explicit legacy VU choice survives import and compact URLs; modern OUTPUT defaults stay enabled', () => {
    for(const vu of [true, false]) {
        const href = 'http://localhost/index.html?Inputs=key:root&MaskSettings=' + encodeURIComponent(JSON.stringify([{key: 'output-style', value: {vu}}]));
        const legacy = viewer(href, {studio: true});
        legacy.scope.vMixInputs = [{key: 'out', type: 'Output', title: 'OUTPUT'}];
        assert.equal(legacy.scope.getTileSettings('output-style', 'out').vu, vu);
        const imported = legacy.recalled();
        assert.equal(imported.screens[0].tiles[0].value.vu, vu);
        const recalled = viewer(M.recallURL('http://localhost/', imported, 0), {studio: true});
        recalled.scope.vMixInputs = legacy.scope.vMixInputs;
        assert.equal(recalled.scope.getTileSettings('output-style', 'out').vu, vu);
        assert.equal(recalled.scope.getTileSettings('missing-output', 'out').vu, false);
    }
    const modern = {version: 1, pc: 'modern', host: '127.0.0.1', port: '8088', updated: 1, screens: [M.screen(['root'])]};
    const view = viewer(M.recallURL('http://localhost/', modern, 0), {studio: true});
    view.scope.vMixInputs = [{key: 'out', type: 'Output', title: 'OUTPUT'}];
    assert.equal(view.scope.getTileSettings('unconfigured-output', 'out').vu, true);
});

test('legacy OUTPUT defaults remain in copied masks and a linked fallback without Config', () => {
    const inputs = [{key: 'root', number: 1, type: 'Colour', title: 'Multiview', layers: [{index: 0, inputKey: 'out'}, {index: 1, inputKey: 'cam'}]},
        {key: 'out', number: 2, type: 'Output', title: 'OUTPUT', layers: []}, {key: 'cam', number: 3, type: 'Capture', title: 'CAM 1', layers: []}];
    const config = {version: 1, pc: 'imported', host: '127.0.0.1', port: '8088', updated: 1,
        screens: [{...M.screen(['root']), hideOutputAudioByDefault: true, tiles: [{key: 'source-root-layer-0', value: {borderWidth: 5}}]}]};
    const href = M.recallURL('http://localhost/', config, 0, {portable: false, inputs});
    const masks = JSON.parse(new URL(href).searchParams.get('MaskSettings'));
    assert.deepEqual(masks, [{key: 'source-root-layer-0', value: {borderWidth: 5, vu: false}}]);
    assert.equal(config.screens[0].tiles[0].value.vu, undefined);
    const view = viewer(href, {studio: true});
    view.scope.vMixInputs = inputs;
    assert.equal(view.scope.getTileSettings('source-root-layer-0', 'out').vu, false);
    assert.equal(view.scope.getTileSettings('source-root-layer-1', 'cam').vu, true);
    config.screens[0].tiles[0].value.vu = true;
    const explicit = new URL(M.recallURL('http://localhost/', config, 0, {portable: false, inputs})).searchParams;
    assert.equal(JSON.parse(explicit.get('MaskSettings'))[0].value.vu, true);
    assert.throws(() => M.validate({...config, screens: [{...config.screens[0], hideOutputAudioByDefault: 'false'}]}), /Réglage audio par défaut invalide/);
});

test('Input, Input2, numeric IDs and old class masks remain readable; broken Settings cannot discard MaskSettings', () => {
    const masks = [{key: 'source-7-layer-1', value: 'multiViewBoxMask NameMask'}];
    const href = 'http://localhost/index.html?Input=7&Input2=key:' + second + '&Settings=invalid&MaskSettings=' + encodeURIComponent(JSON.stringify(masks));
    const {scope, warnings} = viewer(href);
    assert.deepEqual(M.clone(scope.vMixSettings.multiViewInputs), [6, second]);
    const value = scope.normalizeTileSettings(scope.mySettingMask[0]);
    assert.equal(value.frame, false);
    assert.equal(value.vu, false);
    assert.equal(value.name, false);
    assert.equal(warnings.length, 1);
    const padded = viewer('http://localhost/index.html?Inputs=key:' + first + '&Settings=' + encodeURIComponent(JSON.stringify([...oldExtras, {enabled: true}])));
    assert.equal(padded.scope.extras.length, 3);
    assert.equal(padded.warnings.length, 0);
});

test('unnamed legacy links cannot receive or overwrite the saved regie PC, or a stale copy of their own settings', () => {
    const pc = M.legacyPC(new URL(oldURL).searchParams);
    const conflicting = {version: 1, pc: 'regie', host: '198.51.100.12', port: '8099', updated: 9999999999999, screens: [M.screen(['wrong'])]};
    const samePC = {...conflicting, pc};
    const view = viewer(oldURL, {stored: {regie: conflicting, [pc]: samePC}, remote: samePC, studio: true});
    const recalled = view.recalled();
    assert.equal(recalled.pc, pc);
    assert.deepEqual(recalled.screens[0].inputs, [first, second]);
    assert.equal(recalled.screens[0].tiles[0].value.enabled, false);
    assert.equal(recalled.host, '127.0.0.1');
    assert.equal(recalled.port, '8088');
    assert.deepEqual(JSON.parse(view.storage.get('multiview.pc.regie')), conflicting);
    assert.deepEqual(JSON.parse(view.storage.get('multiview.pc.' + pc)), samePC);
    assert.equal(view.calls.length, 0);
    assert.notEqual(M.legacyPC(new URL(oldURL + '&IP=198.51.100.50').searchParams), pc);
    assert.equal(M.legacyPC(new URL(oldURL).searchParams), pc);
});

test('new portable links also contain the old Inputs/Settings/MaskSettings format and preserve JSON encoding', () => {
    const config = {version: 1, pc: 'Régie A', host: '198.51.100.4', port: '8088', updated: 1,
        screens: [{...M.screen([first, second]), extras: [...oldExtras.slice(0, 2), {...oldExtras[2], mask: 'Nom masqué & + écran'}], tiles: oldMasks}]};
    const href = M.recallURL('http://localhost/previous.html?discard=1#old', config, 0);
    assert.ok(href.startsWith('http://localhost/index.html?Inputs=key:' + first + ',key:' + second + '&Settings='));
    const query = new URL(href).searchParams;
    assert.deepEqual(JSON.parse(query.get('Settings')), config.screens[0].extras);
    assert.deepEqual(JSON.parse(query.get('MaskSettings')), oldMasks);
    assert.deepEqual(M.pack(M.unpack(JSON.parse(query.get('Config')))), M.pack(config));
    const rawSettings = href.match(/[?&]Settings=([^&]*)/)[1];
    assert.deepEqual(JSON.parse(decodeURIComponent(rawSettings)), config.screens[0].extras);
    assert.equal(query.get('IP'), config.host);
    assert.equal(query.get('Port'), config.port);
    assert.equal(query.get('PC'), config.pc);
    assert.equal(query.has('discard'), false);
    assert.equal(new URL(href).hash, '');
    const legacy = viewer(href);
    assert.deepEqual(M.clone(legacy.scope.vMixSettings.multiViewInputs), [first, second]);
    assert.equal(legacy.scope.mySettingMask[0].value.enabled, false);
});

test('grouped screen URLs expose their video contributors and hide unused layers for old clients', () => {
    const sources = Array.from({length: 13}, (_, i) => 'cam-' + i);
    const managed = {root: 'root-b', browser: 'html-b', parts: ['part-b1', 'part-b2', 'unused-part'], sources,
        active: {'root-b': [1, 2, 10], 'part-b1': [1,2,3,4,5,6,7,8,9,10], 'part-b2': [1,2,3], 'unused-part': []}};
    const config = {version: 1, pc: 'test', host: '127.0.0.1', port: '8088', updated: 2,
        screens: [{...M.screen([first]), extras: oldExtras, tiles: oldMasks}, {...M.screen(['root-b']), extras: oldExtras, managed}]};
    const query = new URL(M.recallURL('http://localhost/index.html', config, 1, {portable: false})).searchParams;
    assert.equal(query.get('Inputs'), 'key:part-b1,key:part-b2');
    assert.equal(query.get('Screen'), '2');
    assert.equal(query.has('Config'), false);
    const masks = JSON.parse(query.get('MaskSettings'));
    assert.equal(masks.length, 7);
    assert.ok(masks.every(m => m.key.startsWith('source-part-b2-layer-') && m.value.enabled === false));
    const quad = {...config, screens: [{...M.screen(['root']), managed: {root: 'root', browser: 'html', parts: [], sources: sources.slice(0,4), active: {root: [1,2,3,4,10]}}}]};
    const quadMasks = JSON.parse(new URL(M.recallURL('http://localhost/', quad, 0)).searchParams.get('MaskSettings'));
    assert.equal(quadMasks.find(m => m.key === 'source-root-layer-9').value.enabled, false);
    assert.equal(config.screens[1].tiles.length, 0);
});

test('a PC name containing URL cannot hide generated video groups as browser inputs', () => {
    const inputs = [
        {key: 'root', number: 1, type: 'Colour', title: 'MV · regie-url · Écran 2 · Multiview', layers: [{index: 0, inputKey: 'part'}, {index: 9, inputKey: 'html'}]},
        {key: 'part', number: 2, type: 'Colour', title: 'MV · regie-url · Écran 2 · Vignettes 1', layers: [{index: 0, inputKey: 'cam'}]},
        {key: 'cam', number: 3, type: 'Capture', title: 'CAM 1', layers: []},
        {key: 'html', number: 4, type: 'Browser', title: 'MV · regie-url · Écran 2 · Habillage', layers: []}
    ];
    assert.equal(M.isBrowser(inputs[0]), false);
    assert.equal(M.isBrowser(inputs[1]), false);
    assert.equal(M.isBrowser(inputs[3]), true);
    assert.deepEqual(M.collectLayers(inputs, ['root']).layers.map(l => l.inputKey), ['cam']);
    assert.deepEqual(M.collectLayers(inputs, ['part']).layers.map(l => l.inputKey), ['cam']);
});

test('a linked screen 2 with legacy fallback bootstraps from an older single-screen cache and receives the complete PC', async () => {
    const old = {version: 1, pc: 'test', host: '127.0.0.1', port: '8767', updated: 1, screens: [M.screen(['screen-a'])]};
    const complete = {...old, updated: 2, screens: [...old.screens, {...M.screen([first, second]), extras: oldExtras, tiles: oldMasks}]};
    const href = M.recallURL('http://localhost:5500/', complete, 1, {portable: false});
    const view = viewer(href, {stored: {test: old}, remote: complete, studio: true});
    assert.deepEqual(view.recalled().screens[1].inputs, [first, second]);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(M.pack(view.recalled()), M.pack(complete));
    assert.equal(view.calls.length > 0, true);
    const current = {...complete, updated: 3, screens: [complete.screens[0], {...complete.screens[1], inputs: ['newer-source']} ]};
    const cached = viewer(href, {stored: {test: current}, studio: true});
    assert.deepEqual(cached.recalled().screens[1].inputs, ['newer-source']);
});

test('both portable and linked URLs recall the selected screen theme without changing the legacy fields', () => {
    const config = {version: 1, pc: 'theme-demo', host: '127.0.0.1', port: '8767', updated: 1,
        screens: [{...M.screen([first]), theme: 'classic'}, {...M.screen([second]), theme: 'openmultiview', tiles: [{key: 'camera', value: {programColor: '#a1b2c3', titlePosition: 'below', vu: false}}]}]};
    for(const portable of [true, false]) {
        const href = M.recallURL('http://localhost/', config, 1, {portable});
        const query = new URL(href).searchParams;
        assert.equal(query.get('Inputs'), 'key:' + second);
        assert.equal(query.get('Theme'), 'openmultiview');
        assert.ok(query.has('Settings') && query.has('MaskSettings'));
        const view = viewer(href, {studio: true});
        assert.equal(view.scope.vMixSettings.theme, 'openmultiview');
        const styles = view.scope.getTileSettings('camera');
        assert.equal(styles.programColor, '#a1b2c3');
        assert.equal(styles.previewColor, '#66e5b5');
        assert.equal(styles.titlePosition, 'below');
        assert.equal(styles.vu, false);
        assert.equal(view.recalled().screens[1].theme, 'openmultiview');
    }
    assert.equal(viewer(oldURL, {studio: true}).scope.vMixSettings.theme, 'classic');
});

test('a viewer receives a theme from the PC bridge independently of its browser profile', async () => {
    const config = {version: 1, pc: 'theme-demo', host: '127.0.0.1', port: '8767', updated: 2,
        screens: [{...M.screen([first]), theme: 'openmultiview'}]};
    const view = viewer('http://localhost/index.html?Inputs=key:' + first + '&PC=theme-demo', {remote: config, studio: true});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(view.scope.vMixSettings.theme, 'openmultiview');
    assert.equal(view.scope.getDefaultTileSettings().borderColor, '#536b74');
    assert.equal(view.recalled().updated, 2);
});

function largeConfiguration() {
    return {version: 1, pc: 'large-demo', host: '127.0.0.1', port: '8767', updated: 5,
        screens: [0, 1].map(index => ({...M.screen(['root-' + index]), theme: 'openmultiview', extras: oldExtras,
            tiles: Array.from({length: 32}, (_, i) => ({key: 'source-group-' + index + '-layer-' + i,
                value: {...M.tileDefaultsFor('openmultiview'), titlePosition: 'below', titleBackground: false,
                    titleFontSize: 29, timer: true, borderWidth: 5, vuPosition: 'outside-left'}}))}))};
}

test('large portable and linked-fallback URLs keep the HTTP request short and restore both screens after restart', () => {
    const config = largeConfiguration();
    for(const portable of [true, false]) for(const configPage of [true, false]) {
        const href = M.recallURL('https://example.com/community/', config, 1, {portable, configPage, language: 'es'});
        const url = new URL(href), parameters = M.urlParameters(href);
        assert.ok((url.pathname + url.search).length < M.MAX_REQUEST_TARGET);
        assert.ok(url.hash.length > 10000);
        assert.equal(url.searchParams.get('Lang'), 'es');
        assert.equal(parameters.get('Inputs'), 'key:root-1');
        assert.deepEqual(JSON.parse(parameters.get('MaskSettings')), config.screens[1].tiles);
        assert.deepEqual(JSON.parse(parameters.get('Settings')), oldExtras);
        assert.equal(parameters.get('Screen'), '2');
        if(portable) {
            assert.deepEqual(M.pack(M.unpack(JSON.parse(parameters.get('Config')))), M.pack(config));
            const freshBrowser = viewer(href, {studio: true});
            assert.deepEqual(M.pack(freshBrowser.recalled()), M.pack(config));
            assert.equal(freshBrowser.scope.vMixSettings.theme, 'openmultiview');
            assert.equal(freshBrowser.scope.vMixSettings.port, config.port);
        } else {
            assert.equal(parameters.has('Config'), false);
            const legacyFallback = viewer(href);
            assert.deepEqual(M.clone(legacyFallback.scope.mySettingMask), config.screens[1].tiles);
        }
    }
});

test('an oversized existing legacy URL can be repaired without losing IDs, masks, spaces or plus signs', () => {
    const masks = Array.from({length: 40}, (_, i) => ({key: 'source-demo-layer-' + i, value: {...oldMasks[0].value, mask: 'Nom privé & + été ' + i}}));
    const original = oldURL.replace(/MaskSettings=[^&]*/, 'MaskSettings=' + encodeURIComponent(JSON.stringify(masks)));
    const repaired = M.safeURL(original);
    assert.ok(new URL(repaired).hash.length > 10000);
    for(const [key, value] of M.urlParameters(original)) assert.equal(M.urlParameters(repaired).get(key), value);
    assert.deepEqual(M.clone(viewer(repaired).scope.mySettingMask), masks);
    const imported = viewer(repaired, {studio: true});
    for(const mask of masks) for(const [key, value] of Object.entries(mask.value)) assert.equal(imported.scope.getTileSettings(mask.key)[key], value);
    assert.deepEqual(imported.recalled().screens[0].inputs, [first, second]);
    assert.equal(M.safeURL(oldURL), oldURL);
    assert.equal(M.urlParameters('http://localhost/?PC=query#PC=fragment').get('PC'), 'fragment');
    assert.equal(M.urlParameters('http://localhost/?PC=query#Screen').get('PC'), 'query');
});

test('browser navigation uses a short PC reference after bridge save and resolves screen 2 in a fresh browser profile', async () => {
    const config = largeConfiguration();
    const href = M.recallURL('http://localhost/', config, 1, {linked: true, language: 'en'});
    const url = new URL(href);
    assert.ok(href.length < 200);
    assert.equal(url.hash, '');
    assert.equal(url.searchParams.get('PC'), config.pc);
    assert.equal(url.searchParams.get('Screen'), '2');
    assert.equal(url.searchParams.has('MaskSettings'), false);
    const view = viewer(href, {remote: config, studio: true});
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(M.pack(view.recalled()), M.pack(config));
    assert.deepEqual(M.clone(view.scope.vMixSettings.multiViewInputs), ['root-1']);
});

test('shared text defaults and later individual overrides restore from portable URLs and the PC bridge', async () => {
    const config={version:1,pc:'text-demo',host:'127.0.0.1',port:'8767',updated:2,
        textStyle:{titlePosition:'below',titleBackground:false,titleFontSize:29},
        screens:[{...M.screen(['root']),theme:'classic',tiles:[{key:'individual',value:{titleFontSize:42}}]}]};
    for(const linked of [false,true]) {
        const view=viewer(M.recallURL('http://localhost/',config,0,{linked}),{remote:config,studio:true});
        await new Promise(resolve=>setImmediate(resolve));
        const general=view.scope.getTileSettings('new-layer');
        assert.equal(general.titleFontSize,29);
        assert.equal(general.titleBackground,false);
        assert.equal(general.titlePosition,'below');
        assert.equal(view.scope.getTileSettings('individual').titleFontSize,42);
        assert.deepEqual(view.recalled().textStyle,config.textStyle);
    }
});

test('role labels can be hidden for the PC while one layer remains visible, including bridge and portable URL recall', async () => {
    const config={version:1,pc:'labels-demo',host:'127.0.0.1',port:'8767',updated:2,roleBadges:false,
        screens:[{...M.screen(['root']),theme:'openmultiview',tiles:[{key:'output-layer',value:{roleBadge:true,name:false}}]}]};
    for(const linked of [false,true]) {
        const view=viewer(M.recallURL('http://localhost/',config,0,{linked}),{remote:config,studio:true});
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(view.scope.getTileSettings('new-layer').roleBadge,false);
        assert.equal(view.scope.getTileSettings('output-layer').roleBadge,true);
        assert.equal(view.scope.getTileSettings('output-layer').name,false);
        assert.equal(view.recalled().roleBadges,false);
        assert.equal(view.scope.tileSettingsClasses({layerKey:'output-layer',inputKey:'output'}).includes('roleBadgeOff'),false);
        assert.equal(view.scope.tileSettingsClasses({layerKey:'new-layer',inputKey:'preview'}).includes('roleBadgeOff'),true);
    }
});
