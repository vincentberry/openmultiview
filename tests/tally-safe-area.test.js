const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../public/js/multiview-model');

function production() {
    const inputs = [
        {key: 'cam-a', number: 1, title: 'CAM A', type: 'Capture'},
        {key: 'cam-b', number: 2, title: 'CAM B', type: 'Capture'},
        {key: 'off', number: 3, title: 'OFF', type: 'Capture'},
        {key: 'scene', number: 4, type: 'Colour', layers: [{inputKey: 'cam-a'}, {inputKey: 'off', enabled: false}, {inputKey: 'off', opacity: 0}]},
        {key: 'mix', number: 5, title: 'Retour salle renommé', type: 'Mix', mixNumber: 2},
        {key: 'nested', number: 6, type: 'Colour', layers: [{inputKey: 'mix'}, {inputKey: 'cam-b', position: {zoomX: 0}}]},
        {key: 'unrelated', number: 7, title: 'Mix 2 camera name', type: 'Capture'}
    ];
    const mixes = [{number: 1, previewKey: 'cam-b', programKey: 'nested'}, {number: 2, previewKey: 'cam-b', programKey: 'scene'}];
    return {inputs, mixes};
}

test('nested layers and renamed Mix outputs propagate both buses, skipping disabled and invisible layers', () => {
    const {inputs, mixes} = production();
    let graph = M.tallyGraph(inputs, mixes);
    assert.deepEqual([...graph[0].program], ['nested', 'mix', 'scene', 'cam-a']);
    assert.deepEqual([...graph[1].program], ['scene', 'cam-a']);
    assert.deepEqual([...graph[0].preview], ['cam-b']);
    assert.equal(graph.some(bus => bus.program.has('off') || bus.program.has('unrelated')), false);
    mixes[1].programKey = 'cam-b';
    graph = M.tallyGraph(inputs, mixes);
    assert.equal(graph[0].program.has('cam-a'), false);
    assert.equal(graph[0].program.has('cam-b'), true);
    // The nested Mix always contributes its output, including in main preview.
    mixes[0].previewKey = 'nested'; mixes[0].programKey = 'cam-a';
    graph = M.tallyGraph(inputs, mixes);
    assert.equal(graph[0].preview.has('cam-b'), true);
    assert.equal(graph[0].preview.has('cam-a'), false);
});

test('cycles, duplicate layers and an Output feeding itself cannot light unrelated cameras', () => {
    const inputs = [{key: 'a', layers: [{inputKey: 'b'}, {inputKey: 'b'}]}, {key: 'b', layers: [{inputKey: 'a'}]},
        {key: 'output', type: 'Output'}, {key: 'unused', type: 'Capture'}];
    const graph = M.tallyGraph(inputs, [{number: 1, previewKey: 'a', programKey: 'output', overlayKeys: ['b']}]);
    assert.deepEqual([...graph[0].preview], ['a', 'b']);
    assert.deepEqual([...graph[0].program], ['output', 'b', 'a']);
    assert.equal(graph[0].program.has('unused'), false);
});

test('active overlays on a nested Mix also propagate to the main program and preview', () => {
    const {inputs, mixes} = production();
    mixes[1].overlayKeys = ['cam-b'];
    mixes[0].previewKey = 'nested';
    const graph = M.tallyGraph(inputs, mixes);
    for(const state of ['program', 'preview']) assert.equal(graph[0][state].has('cam-b'), true);
    assert.equal(graph[1].program.has('cam-b'), true);
    assert.equal(graph[0].program.has('off'), false);
});

test('independent per-mix colors retain simultaneous Preview and Program and respect mix and tally switches', () => {
    const {inputs, mixes} = production();
    mixes[0].previewKey = 'cam-a';
    const graph = M.tallyGraph(inputs, mixes);
    const settings = {...M.tileDefaultsFor('tally-sides'), programColor: '#123456'};
    const palettes = [{mix: 2, enabled: true, previewColor: '#abcdef', programColor: '#fedcba'}];
    let tally = M.tallyFor(settings, 'cam-a', graph, palettes);
    assert.equal(tally.state, 'program');
    assert.deepEqual(tally.preview, [{mix: 1, color: settings.previewColor}]);
    assert.deepEqual(tally.program, [{mix: 1, color: '#123456'}, {mix: 2, color: '#fedcba'}]);
    tally = M.tallyFor({...settings, tallyMix: 2}, 'cam-a', graph, palettes);
    assert.deepEqual(tally.program, [{mix: 2, color: '#fedcba'}]);
    assert.deepEqual(tally.preview, []);
    assert.equal(M.tallyFor({...settings, tallyMix: 2}, 'cam-a', graph, [{...palettes[0], enabled: false}]).state, '');
    assert.equal(M.tallyFor({...settings, tally: false}, 'cam-a', graph, palettes).state, '');
    assert.equal(M.tallyFor({...settings, tallyMix: 3}, 'cam-a', graph, palettes).state, '');
    assert.equal(M.mixNumberFor({type: 'Video', title: 'Mix 2 documentary'}), undefined);
    assert.equal(M.mixNumberFor({type: 'Mix', title: 'Mix 3', mixNumber: 2}), 2);
});

test('safe area margins and aspect frames stay centered on 16:9 and custom tile shapes', () => {
    const settings = {...M.safeAreaDefaults, enabled: true, aspect: '4:3'};
    assert.deepEqual(M.safeAreaGuides(settings), [
        {kind: 'action', x: 5, y: 5, w: 90, h: 90}, {kind: 'title', x: 10, y: 10, w: 80, h: 80},
        {kind: 'aspect', x: 12.5, y: 0, w: 75, h: 100}
    ]);
    for(const aspect of ['4:3', '1:1', '9:16', '2.39:1']) for(const tileRatio of [16/9, 4/3, 1]) {
        const guide = M.safeAreaGuides({...settings, action: false, title: false, aspect}, tileRatio)[0];
        assert.ok(Math.abs(guide.x * 2 + guide.w - 100) < 1e-8);
        assert.ok(Math.abs(guide.y * 2 + guide.h - 100) < 1e-8);
        const [w, h] = aspect.split(':').map(Number);
        assert.ok(Math.abs(guide.w / guide.h * tileRatio - w/h) < 1e-8);
    }
    assert.deepEqual(M.safeAreaGuides({...settings, enabled: false}), []);
    assert.deepEqual(M.safeAreaGuides({...settings, action: false, title: false, aspect: 'none'}), []);
});

test('screen-specific safe areas, palettes and tile overrides survive every recall format without changing old screens', () => {
    const screen = {...M.screen(['root']), theme: 'tally-sides', safeArea: {...M.safeAreaDefaults, enabled: true, center: true, aspect: '9:16'},
        tallyMixes: [{mix: 2, enabled: false, previewColor: '#abcdef', programColor: '#123456'}],
        tiles: [{key: 'source-root-layer-0', value: {safeArea: false, tallyMix: 2}}]};
    const config = {version: 1, pc: 'fixture', host: '127.0.0.1', port: '8767', screens: [screen, M.screen(['root-2'])]};
    assert.deepEqual(M.unpack(M.pack(config)).screens, config.screens);
    for(const href of [M.recallURL('http://localhost/', config, 0), M.browserRecallURL('http://localhost/', config, 0)]) {
        const recalled = M.unpack(JSON.parse(M.urlParameters(href).get('Config')));
        assert.deepEqual(recalled.screens[0], screen);
        assert.equal(M.themeFor(recalled.screens[1]), 'classic');
        assert.equal(M.safeAreaFor(recalled.screens[1]).enabled, false);
    }
    const fallback = M.urlParameters(M.recallURL('http://localhost/', config, 0, {portable: false}));
    assert.deepEqual(JSON.parse(fallback.get('TallyMixes')), screen.tallyMixes);
    assert.deepEqual(JSON.parse(fallback.get('SafeArea')), screen.safeArea);
    const linked = M.recallURL('http://localhost/', config, 0, {linked: true});
    assert.equal(M.urlParameters(linked).has('TallyMixes'), false);
});

test('invalid safe area settings and mix palettes are rejected before being saved or rendered', () => {
    const config = {version: 1, pc: 'fixture', host: 'localhost', port: '8088', screens: [M.screen()]};
    for(const safeArea of [{enabled: 'true'}, {actionInset: 50}, {titleInset: -1}, {aspect: 'invalid'}, {color: 'red'}, {opacity: 101}, {lineWidth: 0}, {lineStyle: 'custom'}, {unexpected: true}]) {
        assert.throws(() => M.validate({...config, screens: [{...config.screens[0], safeArea}]}), /safe area/);
    }
    const palette = {mix: 2, enabled: true, previewColor: '#abcdef', programColor: '#123456'};
    for(const tallyMixes of [[{...palette, mix: 0}], [{...palette, enabled: 'true'}], [{...palette, programColor: 'red'}], [palette, palette]]) {
        assert.throws(() => M.validate({...config, screens: [{...config.screens[0], tallyMixes}]}), /tally/);
    }
    assert.throws(() => M.validate({...config, screens: [{...config.screens[0], tiles: [{key: 'cam', value: {tallyMix: -1}}]}]}), /Mix tally/);
});

function viewerScope() {
    const empty = new Proxy({length: 0}, {get: (_, key) => key === 'length' ? 0 : () => empty});
    const scope = vm.createContext({MultiviewModel: M, URLSearchParams, console, window: {location: {href: 'http://localhost/index.html'}},
        document: {}, Option: function() {}, $: () => empty, setInterval: () => 0, setTimeout: () => 0, clearTimeout() {}});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/viewer.js'), 'utf8'), scope);
    return scope;
}

test('rendered guides follow each screen and tile and tally lights preserve both sides with identifiable mix numbers', () => {
    const scope = viewerScope(), overlay = {layerKey: 'tile', inputKey: 'cam', zoomX: 50, zoomY: 50};
    scope.vMixInputs = [{key: 'cam', type: 'Capture'}];
    assert.equal(scope.generateSafeArea(overlay), '');
    scope.vMixSettings.safeArea = {...M.safeAreaDefaults, enabled: true, center: true};
    assert.match(scope.generateSafeArea(overlay), /safe-action/);
    assert.match(scope.generateSafeArea(overlay), /safe-title/);
    assert.match(scope.generateSafeArea(overlay), /safe-center/);
    scope.mySettingMask = [{key: 'tile', value: {safeArea: false}}];
    assert.equal(scope.generateSafeArea(overlay), '');
    const tally = {preview: [{mix: 1, color: '#00ff00'}], program: [{mix: 2, color: '#ff0000'}, {mix: 3, color: '#ff00ff'}]};
    assert.match(scope.generateTallyLights(tally, 'preview'), /Preview · Mix 1/);
    assert.match(scope.generateTallyLights(tally, 'program'), /Program · Mix 2.*Program · Mix 3/);
});

test('XML mix parsing reads the main buses from root children and maps renamed Mix inputs independently of source names', () => {
    const node = (tagName, textContent = '', attributes = {}, children = []) => ({tagName, textContent, children, getAttribute: name => attributes[name] ?? null});
    const additional = node('mix', '', {number: '2'}, [node('preview', '2'), node('active', '4')]);
    const root = node('vmix', '', {}, [additional, node('preview', '1'), node('active', '6'), node('overlays', '', {}, [node('overlay', '3'), node('overlay', '')])]);
    const scope = viewerScope(), {inputs} = production();
    delete inputs.find(input => input.key === 'mix').mixNumber;
    scope.vMixInputs = inputs;
    const data = {getElementsByTagName: name => name === 'vmix' ? [root] : name === 'mix' ? [additional] : []};
    const mixes = scope.readVmixMixes(data);
    assert.deepEqual(M.clone(mixes), [{number: 1, previewKey: 'cam-a', programKey: 'nested', overlayKeys: ['off']}, {number: 2, previewKey: 'cam-b', programKey: 'scene', overlayKeys: []}]);
    assert.equal(scope.vMixInputs.find(input => input.key === 'mix').mixNumber, 2);
});
