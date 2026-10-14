const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const M = require('../multiview-model');

test('XML zero-based layers map to vMix one-based shortcut numbers', () => {
    assert.equal(M.layerNumber('0', 0), 1);
    assert.equal(M.layerNumber('9', 3), 10);
    assert.equal(M.layerNumber('4', 0), 5);
    assert.equal(M.layerNumber(null, 2), 3);
});

test('layouts preserve aspect ratio and keep every tile within its screen', () => {
    for(const t of M.templates.filter(t => t.slots)) {
        const layers = t.slots.map((_, i) => ({source: 1, layer: i + 1}));
        for(const spacing of [0, M.DEFAULT_SPACING, M.LEGACY_SPACING, 20]) {
            const positions = M.positions(t.slots, layers, spacing);
            for(const p of positions) {
                assert.equal(p.zoomX, p.zoomY);
                const x = p.panX / 2 + 50, y = -p.panY / 2 + 50;
                assert.ok(x - p.zoomX / 2 >= -1e-9 && x + p.zoomX / 2 <= 100 + 1e-9);
                assert.ok(y - p.zoomY / 2 >= -1e-9 && y + p.zoomY / 2 <= 100 + 1e-9);
            }
        }
    }
    assert.throws(() => M.positions(M.templates.find(t => t.id === 'quad').slots, []), /4 layers/);
});

test('all preset cells and previews are 16:9 and match the video positions at every spacing', () => {
    for(const template of M.templates.filter(t => t.slots)) {
        const layers = template.slots.map((_, n) => ({source:'video-parent',layer:n + 1}));
        for(const slot of template.slots) assert.ok(Math.abs(slot.w * 1920 / (slot.h * 1080) - 16/9) < 1e-9, template.id);
        for(const spacing of [0,2,13,20]) {
            const frames = M.templateFrames(template.slots, spacing);
            const applied = M.positions(template.slots, layers, spacing);
            for(const [n, frame] of frames.entries()) {
                assert.ok(Math.abs(frame.w * 1920 / (frame.h * 1080) - 16/9) < 1e-9, template.id);
                const p = applied[n];
                const actual = {x: p.panX / 200 + .5 - p.zoomX / 200, y: .5 - p.panY / 200 - p.zoomY / 200, w:p.zoomX / 100, h:p.zoomY / 100};
                for(const field of ['x','y','w','h']) assert.ok(Math.abs(frame[field] - actual[field]) < 1e-9, template.id + ' / ' + field);
                for(const other of frames.slice(n + 1)) {
                    const overlaps = Math.min(frame.x + frame.w, other.x + other.w) - Math.max(frame.x,other.x) > 1e-9 &&
                        Math.min(frame.y + frame.h, other.y + other.h) - Math.max(frame.y,other.y) > 1e-9;
                    assert.equal(overlaps,false,template.id);
                }
            }
        }
    }
});

test('six- and twelve-source grids pack their 16:9 rows together and keep only equal outer margins', () => {
    for(const [id,cols,rows] of [['six',3,2],['twelve',4,3]]) {
        const frames = M.templateFrames(M.templates.find(t => t.id === id).slots,0);
        const size = 1 / cols;
        const margin = (1 - rows * size) / 2;
        for(const [n, frame] of frames.entries()) {
            assert.ok(Math.abs(frame.x - n % cols * size) < 1e-9);
            assert.ok(Math.abs(frame.y - (margin + Math.floor(n / cols) * size)) < 1e-9);
            assert.ok(Math.abs(frame.w - size) < 1e-9);
            assert.ok(Math.abs(frame.h - size) < 1e-9);
        }
        assert.ok(Math.abs(frames[0].y - (1 - frames.at(-1).y - frames.at(-1).h)) < 1e-9);
    }
    const preset = M.templates.find(t => t.id === 'preset-1');
    assert.deepEqual(preset.slots.slice(0,2).map(s => [s.w,s.h]), [[.5,.5],[.5,.5]]);
    assert.ok(preset.slots.slice(2).every(s => s.w === .25 && s.h === .25));
});

test('saved layouts retain their custom positions after the preset gallery adopts 16:9 cells', () => {
    const managed = {root:'root-guid',browser:'html-guid',parts:['part-guid'],template:'preset-1',spacing:2,
        sources:Array.from({length:10},(_,n)=>'cam-' + n),active:{'root-guid':[1,10],'part-guid':[1,2,3,4,5,6,7,8,9,10]}};
    const oldCells = [{x:0,y:0,w:.5,h:.6},{x:.5,y:0,w:.5,h:.6},
        ...Array.from({length:8},(_,n)=>({x:n % 4 / 4,y:.6 + Math.floor(n / 4) * .2,w:.25,h:.2}))];
    const saved = M.positions(oldCells,M.videoLayersFor(managed),2);
    const screen = {...M.screen(['root-guid']),managed,layout:saved};
    assert.deepEqual(M.layoutFor(screen,[]),saved);
    assert.notDeepEqual(M.positions(M.templates.find(t => t.id === 'preset-1').slots,M.videoLayersFor(managed),2),saved);
});

test('compact defaults and spacing adjustments keep tile centres and stable layer IDs', () => {
    const slots = M.templates.find(t => t.id === 'quad').slots;
    const layers = slots.map((_, n) => ({source: 'root-guid', layer: n + 1}));
    const defaults = M.positions(slots, layers);
    const legacy = M.positions(slots, layers, M.LEGACY_SPACING);
    assert.equal(defaults[0].zoomX, 49);
    assert.equal(legacy[0].zoomX, 43.5);
    const original = M.clone(legacy);
    for(const spacing of [0, 2, 20]) {
        const adjusted = M.resizeSpacing(legacy, M.LEGACY_SPACING, spacing);
        const expected = M.positions(slots, layers, spacing);
        adjusted.forEach((p, n) => {
            assert.equal(p.source, legacy[n].source);
            assert.equal(p.layer, legacy[n].layer);
            assert.equal(p.panX, legacy[n].panX);
            assert.equal(p.panY, legacy[n].panY);
            assert.ok(Math.abs(p.zoomX - expected[n].zoomX) < 1e-9);
            assert.equal(p.zoomX, p.zoomY);
        });
    }
    assert.deepEqual(legacy, original);
});

test('spacing recalls independently per screen, including zero and older managed URLs', () => {
    const config = {version: 1, pc: 'test', host: '127.0.0.1', port: '8088', updated: 1, screens: [M.screen(['root-a']), M.screen(['root-b'])]};
    config.screens.forEach((s, n) => {
        s.spacing = n ? 20 : 0;
        s.managed = {root: s.inputs[0], browser: 'browser-' + n, parts: [], sources: ['cam-' + n], active: {[s.inputs[0]]: [1, 2]}, spacing: s.spacing};
    });
    assert.deepEqual(M.unpack(JSON.parse(JSON.stringify(M.pack(config)))), config);
    assert.equal(M.spacingFor(M.screen()), 2);
    assert.equal(M.spacingFor(config.screens[0]), 0);
    const old = M.pack(config);
    old.s.forEach(s => { s.length = 7; delete s[4].spacing; });
    const recalled = M.unpack(old);
    assert.equal(recalled.screens[0].spacing, undefined);
    assert.equal(M.spacingFor(recalled.screens[0]), 13);
    assert.deepEqual(recalled.screens[0].inputs, ['root-a']);
});

test('invalid spacing is rejected before geometry or a recalled configuration is used', () => {
    const config = {version: 1, pc: 'test', host: '127.0.0.1', port: '8088', updated: 1, screens: [M.screen()]};
    for(const spacing of [-1, 21, NaN, '0', null]) {
        assert.throws(() => M.positions([], [], spacing), /Espacement invalide/);
        assert.throws(() => M.resizeSpacing([], 2, spacing), /Espacement invalide/);
        assert.throws(() => M.resizeSpacing([], spacing, 2), /Espacement invalide/);
        assert.throws(() => M.validate({...config, screens: [{...M.screen(), spacing}]}), /Espacement invalide/);
    }
});

test('eight reference presets have the requested source counts and place PGM/PVW by role', () => {
    assert.deepEqual(M.templates.slice(0, 8).map(t => t.slots.length), [10, 10, 8, 8, 6, 9, 13, 13]);
    const preset = M.templates.find(t => t.id === 'preset-6');
    const layers = Array.from({length: 9}, (_, i) => ({source: 1, layer: i + 1, role: i === 0 ? 'PGM' : ''}));
    const result = M.positions(preset.slots, layers);
    assert.equal(result[8].layer, 1);
    assert.equal(new Set(result.map(p => p.layer)).size, 9);
    const pair = M.templates.find(t => t.id === 'preset-1');
    const pairLayers = Array.from({length: 10}, (_, i) => ({source: i < 6 ? 'source-a' : 'source-b', layer: i < 6 ? i + 1 : i - 5, role: i === 4 ? 'PGM' : i === 5 ? 'PVW' : ''}));
    const pairResult = M.positions(pair.slots, pairLayers);
    assert.equal(pairResult[0].layer, 6);
    assert.equal(pairResult[1].layer, 5);
    assert.deepEqual([...new Set(pairResult.map(p => p.source))], ['source-a', 'source-b']);
});

test('corner presets fill a 4 by 4 screen with one large PGM or PVW and twelve small views', () => {
    for(const [id, role, panX] of [['preset-7', 'PGM', -50], ['preset-8', 'PVW', 50]]) {
        const preset = M.templates.find(t => t.id === id);
        const layers = Array.from({length: 13}, (_, i) => ({source: i < 10 ? 'part-a' : 'part-b', layer: i < 10 ? i + 1 : i - 9, role: i === 12 ? role : ''}));
        const result = M.positions(preset.slots, layers, 0);
        const large = result.filter(p => p.zoomX === 50);
        assert.deepEqual(large, [{source: 'part-b', layer: 3, zoomX: 50, zoomY: 50, panX, panY: 50}]);
        const small = result.filter(p => p.zoomX === 25);
        assert.equal(small.length, 12);
        assert.ok(small.every(p => p.zoomY === 25));
        assert.equal(new Set(result.map(p => `${p.source}:${p.layer}`)).size, 13);
        assert.equal(result.reduce((area, p) => area + p.zoomX * p.zoomY / 10000, 0), 1);
        assert.equal(small.filter(p => p.panY < 0).length, 8);
        assert.ok(small.filter(p => p.panY > 0).every(p => Math.sign(p.panX) === -Math.sign(panX)));
    }
});

test('source IDs match existing key URLs and survive input reorder', () => {
    assert.equal(M.parseSourceReference('key:abc-def'), 'abc-def');
    assert.equal(M.parseSourceReference('abc-def'), 'abc-def');
    assert.equal(M.parseSourceReference('2'), 1);
    assert.equal(M.parseSourceReference(''), undefined);
    const inputs = [{key: 'abc-def', number: 7}, {key: 'other', number: 2}];
    assert.equal(M.resolveSource(inputs, 'abc-def').number, 7);
    assert.equal(M.resolveSource(inputs, 1).key, 'other');
});

test('legacy numeric layer settings migrate to IDs before input numbers change', () => {
    const legacy = [{key: 'source-2-layer-0', value: {name: false, titlePosition: 'below'}}];
    const layers = [{layerKey: 'source-id-a-layer-0', legacyLayerKey: 'source-2-layer-0'}];
    const migrated = M.migrateTileSettings(legacy, layers);
    assert.deepEqual(migrated, [{key: 'source-id-a-layer-0', value: legacy[0].value}]);
    const reordered = [{layerKey: 'source-id-a-layer-0', legacyLayerKey: 'source-1-layer-0'}, {layerKey: 'source-id-b-layer-0', legacyLayerKey: 'source-2-layer-0'}];
    assert.deepEqual(M.migrateTileSettings(migrated, reordered), migrated);
    assert.equal(M.migrateTileSettings([...legacy, {key: layers[0].layerKey, value: {name: true}}], layers)[0].value.name, true);
});

test('new input IDs and expected source assignments are configurable before vMix reports any layers', () => {
    const inputs = ['root', 'browser', ...Array.from({length: 4}, (_, n) => 'cam-' + n)].map((key, n) => ({key, number: n + 1, type: key === 'browser' ? 'Browser' : key === 'root' ? 'Colour' : 'Capture', title: key, layers: []}));
    const managed = {root: 'root', browser: 'browser', parts: [], sources: inputs.slice(2).map(i => i.key), active: {root: []}};
    const layout = M.positions(M.templates.find(t => t.id === 'quad').slots, M.videoLayersFor(managed));
    const s = {...M.screen(['root']), managed, layout};
    const layers = M.configurableLayers(s, inputs);
    assert.equal(layers.length, 4);
    assert.deepEqual(layers.map(l => l.inputKey), managed.sources);
    assert.ok(layers.every(l => l.sourceKey === 'root' && l.pending && !l.disabled && l.zoomX === 49));
    assert.deepEqual(M.activeLayersFor(s, inputs).root, [1, 2, 3, 4, 10]);
    assert.equal(M.collectLayers(inputs, s.inputs, M.activeLayersFor(s, inputs), s.layout).layers.length, 0);
    inputs.forEach((i, n) => i.number = n + 50);
    assert.ok(M.configurableLayers(s, inputs).every(l => l.sourceKey === 'root' && l.sourceNumber === 50));
});

test('interrupted configurations recover missing template positions while retaining custom saved slots', () => {
    const inputs = [{key: 'root', number: 9, title: 'MV', layers: []}, ...Array.from({length: 4}, (_, n) => ({key: 'cam-' + n, number: n + 1, title: 'CAM ' + n, layers: []}))];
    const managed = {root: 'root', browser: null, parts: [], sources: inputs.slice(1).map(i => i.key), active: {}, template: 'quad', spacing: 2};
    const s = {...M.screen(['root']), managed};
    assert.ok(M.configurableLayers(s, inputs).every(l => l.zoomX === 49 && l.pending));
    s.layout = [{source: 'root', layer: 2, zoomX: 40, zoomY: 40, panX: 45, panY: 50}];
    const positions = M.layoutFor(s, inputs);
    assert.equal(positions.length, 4);
    assert.deepEqual(positions.find(p => p.layer === 2), s.layout[0]);
    assert.ok(positions.filter(p => p.layer !== 2).every(p => p.zoomX === 49));
});

test('empty grouping inputs never become video thumbnails, while their planned video layers remain editable', () => {
    const managed = {root: 'root', browser: 'browser', parts: ['part-a', 'part-b'], sources: Array.from({length: 16}, (_, n) => 'cam-' + n), active: {root: [], 'part-a': [], 'part-b': []}};
    const inputs = [{key: 'root', number: 1, title: 'MV', type: 'Colour', layers: [{index: 0, inputKey: 'part-a'}, {index: 1, inputKey: 'part-b'}, {index: 9, inputKey: 'browser'}]},
        {key: 'browser', number: 2, type: 'Browser', layers: []}, ...managed.parts.map((key, n) => ({key, number: n + 3, title: 'MV · test · Écran 1 · Vignettes ' + (n + 1), type: 'Colour', layers: []})),
        ...managed.sources.map((key, n) => ({key, number: n + 5, title: 'CAM ' + n, type: 'Capture', layers: []}))];
    const s = {...M.screen(['root']), managed, layout: M.positions(M.templates.find(t => t.id === 'sixteen').slots, M.videoLayersFor(managed))};
    assert.equal(M.collectLayers(inputs, s.inputs, M.activeLayersFor(s, inputs)).layers.length, 0);
    const layers = M.configurableLayers(s, inputs);
    assert.equal(layers.length, 16);
    assert.equal(layers.filter(l => l.sourceKey === 'part-a').length, 10);
    assert.equal(layers.filter(l => l.sourceKey === 'part-b').length, 6);
    assert.equal(layers.find(l => l.sourceKey === 'part-a' && l.layerNumber === 10).inputKey, 'cam-9');
    assert.ok(layers.every(l => l.pending && !l.disabled && l.zoomX === 24.5));
    assert.ok(layers.every(l => l.sourceKey !== 'root' && l.inputKey !== 'browser'));
});

test('XML without coordinates falls back to saved positions and explicit vMix coordinates take priority', () => {
    const s = {...M.screen(['root']), layout: [{source: 'root', layer: 1, zoomX: 49, zoomY: 49, panX: -50, panY: 50}]};
    const inputs = [{key: 'root', number: 8, title: 'MV', layers: [{index: 0, inputKey: 'cam', position: {}}]}, {key: 'cam', number: 2, title: 'CAM', layers: []}];
    const saved = M.collectLayers(inputs, s.inputs, {}, s.layout).layers[0];
    assert.equal(saved.zoomX, 49);
    assert.equal(saved.panX, -50);
    inputs[0].layers[0].position = {zoomX: 40, zoomY: 40, panY: -25};
    const live = M.collectLayers(inputs, s.inputs, {}, s.layout).layers[0];
    assert.equal(live.zoomX, 40);
    assert.equal(live.panX, -50);
    assert.equal(live.panY, -25);
    assert.equal(M.configurableLayers(s, inputs)[0].zoomX, 40);
});

test('disabled slots stay distinct from pending active layers and never appear in the display collection', () => {
    const managed = {root: 'root', browser: 'browser', parts: [], sources: ['cam-a', 'cam-b'], active: {root: []}};
    const inputs = [{key: 'root', number: 1, title: 'MV', layers: [{index: 0, inputKey: 'cam-a'}, {index: 1, inputKey: 'cam-b'}]},
        {key: 'cam-a', number: 2, title: 'CAM A', layers: []}, {key: 'cam-b', number: 3, title: 'CAM B', layers: []}];
    const s = {...M.screen(['root']), managed, layerSources: [{parent: 'root', layer: 1, source: null}]};
    const layers = M.configurableLayers(s, inputs);
    assert.equal(layers.find(l => l.layerNumber === 1).disabled, true);
    assert.equal(layers.find(l => l.layerNumber === 1).pending, false);
    assert.equal(layers.filter(l => !l.disabled).length, 1);
    assert.deepEqual(M.collectLayers(inputs, s.inputs, M.activeLayersFor(s, inputs)).layers.map(l => l.inputKey), ['cam-b']);
});

test('nested multiviews expose only leaves, skip browser pages, deduplicate and compose geometry', () => {
    const leaf = (key, number, title = key, type = 'Capture') => ({key, number, title, type, layers: []});
    const layer = (index, inputKey, position = {}) => ({index, inputKey, position});
    const inputs = [
        {...leaf('root', 1), layers: [layer(0, 'a', {zoomX: 50, zoomY: 50, panX: -50}), layer(1, 'b', {zoomX: 50, zoomY: 50, panX: 50}), layer(2, 'web')]},
        {...leaf('a', 2), layers: [layer(0, 'camera-1'), layer(1, 'web')]},
        {...leaf('b', 3), layers: [layer(0, 'camera-2')]},
        leaf('web', 4, 'https://vincentberry.github.io/openmultiview/?Input=key:root', 'Browser'),
        leaf('camera-1', 5), leaf('camera-2', 6)
    ];
    const result = M.collectLayers(inputs, ['a', 'root', 'b']);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.layers.map(l => l.inputKey), ['camera-1', 'camera-2']);
    assert.equal(result.layers[0].zoomX, 50);
    assert.equal(result.layers[0].panX, -50);
    assert.equal(result.layers[1].panX, 50);
    assert.equal(result.layers[0].sourceKey, 'a');
    assert.equal(result.layers[0].layerKey, 'source-a-layer-0');
    assert.equal(result.layers[0].legacyLayerKey, 'source-2-layer-0');
    const targets = M.positions(M.templates.find(t => t.id === 'quad').slots.slice(0, 2), result.layers);
    const global = M.compose(result.layers[0].parentPosition, targets[0]);
    assert.equal(global.panX, -50);
    assert.equal(global.panY, 50);
    assert.equal(global.zoomX, 49);
});

test('multiview cycles stop, and programme outputs remain visible as one layer', () => {
    const inputs = [
        {key: 'a', number: 1, title: 'MV', layers: [{index: 0, inputKey: 'b'}, {index: 1, inputKey: 'pgm'}]},
        {key: 'b', number: 2, title: 'MV B', layers: [{index: 0, inputKey: 'a'}]},
        {key: 'pgm', number: 3, title: 'PGM', layers: [{index: 0, inputKey: 'camera'}]},
        {key: 'camera', number: 4, title: 'CAM', layers: []}
    ];
    const result = M.collectLayers(inputs, ['a']);
    assert.equal(result.layers.length, 1);
    assert.equal(result.layers[0].inputKey, 'pgm');
    assert.equal(result.layers[0].role, 'PGM');
    assert.match(result.warnings[0], /Boucle/);
});

test('more than ten layers combine on one screen, while each vMix input keeps ten layers', () => {
    const inputs = Array.from({length: 12}, (_, i) => ({key: 'cam-' + i, number: i + 3, title: 'CAM ' + i, layers: []}));
    inputs.push(...['a', 'b'].map((key, n) => ({key, number: n + 1, title: 'MV ' + key, layers: Array.from({length: 6}, (_, i) => ({index: i, inputKey: 'cam-' + (i + n * 6)}))})));
    const result = M.collectLayers(inputs, ['a', 'b']);
    assert.equal(result.layers.length, 12);
    assert.equal(Math.max(...result.layers.map(l => l.layerNumber)), 6);
    const placements = M.positions(M.templates.find(t => t.id === 'twelve').slots, result.layers);
    assert.equal(placements.length, 12);
    assert.deepEqual([...new Set(placements.map(p => p.source))], ['a', 'b']);
    const config = {version: 1, pc: 'test', host: '127.0.0.1', port: '8088', updated: 1, screens: Array.from({length: 4}, () => M.screen(['a', 'b']))};
    config.screens[3].layout = [{source: 'a', layer: 6, zoomX: 50, zoomY: 50, panX: 0, panY: 0}];
    config.screens[0].layout = placements;
    const recalled = M.unpack(M.pack(config));
    assert.deepEqual(recalled.screens.map(s => s.inputs), config.screens.map(s => s.inputs));
    recalled.screens[0].layout.forEach((p, i) => {
        assert.equal(p.source, placements[i].source);
        assert.equal(p.layer, placements[i].layer);
        for(const field of ['zoomX', 'zoomY', 'panX', 'panY']) assert.ok(Math.abs(p[field] - placements[i][field]) < .00001);
    });
    assert.throws(() => M.validate({...config, screens: Array.from({length: M.MAX_SCREENS + 1}, () => M.screen())}), /Configuration invalide/);
});

test('complete dual-screen URL round trip and invalid positions rejected', () => {
    const config = {version: 1, pc: 'Régie A', host: '127.0.0.1', port: '8088', updated: 123, screens: [M.screen([0]), M.screen([1])]};
    config.screens[0].tiles.push({key: 'source-1-layer-1', value: {titlePosition: 'below', titleBackground: false, vuPosition: 'outside-right'}});
    const params = new URLSearchParams({PC: config.pc, Screen: '2', Config: JSON.stringify(M.pack(config))});
    const recalled = M.unpack(JSON.parse(new URLSearchParams(params.toString()).get('Config')));
    assert.deepEqual(recalled, config);
    recalled.screens[1].inputs[0] = 4;
    assert.equal(config.screens[1].inputs[0], 1);
    const invalid = M.clone(config);
    invalid.screens[0].layout = [{source: 1, layer: 11, zoomX: 50, zoomY: 50, panX: 0, panY: 0}];
    assert.throws(() => M.validate(invalid), /Position invalide/);
});

test('portable source assignments retain stable IDs and none, with old URLs still readable', () => {
    const config = {version: 1, pc: 'test', host: '127.0.0.1', port: '8088', updated: 1, screens: [M.screen(['root'])]};
    config.screens[0].layerSources = [{parent: 'root', layer: 1, source: null}, {parent: 'root', layer: 2, source: 'camera-a'}];
    assert.deepEqual(M.unpack(JSON.parse(JSON.stringify(M.pack(config)))), config);
    const old = M.pack(config);
    old.s[0] = old.s[0].slice(0, 6);
    assert.equal(M.unpack(old).screens[0].layerSources, undefined);
    for(const invalid of [{parent: 'root', layer: 11, source: null}, {parent: 'root', layer: 1, source: 3}, {parent: '', layer: 1, source: null}]) {
        const next = M.clone(config);
        next.screens[0].layerSources = [invalid];
        assert.throws(() => M.validate(next), /Affectations/);
    }
});

test('local PC bridge survives restart, isolates PCs and rejects stale writes', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'multiview-test-'));
    process.env.MULTIVIEW_DATA_DIR = dir;
    const {createServer} = require('../server');
    let server;
    async function start() {
        server = createServer();
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        return 'http://127.0.0.1:' + server.address().port;
    }
    const put = (base, config, origin) => fetch(base + '/control-api?PC=' + config.pc, {method: 'PUT', headers: {'Content-Type': 'application/json', ...(origin ? {Origin: origin} : {})}, body: JSON.stringify(config)});
    try {
        let base = await start();
        const config = {version: 1, pc: 'test', host: '127.0.0.1', port: '8088', updated: 2, screens: [M.screen([0]), M.screen([1])]};
        assert.equal((await put(base, config)).status, 200);
        assert.equal((await put(base, {...config, updated: 1})).status, 200);
        assert.equal((await fetch(base + '/control-api?PC=test').then(r => r.json())).updated, 2);
        assert.equal(await fetch(base + '/control-api?PC=other').then(r => r.json()), null);
        assert.equal((await put(base, config, 'https://external.example')).status, 403);
        assert.equal((await fetch(base + '/server.js')).status, 404);
        assert.equal((await fetch(base + '/config.html')).status, 200);
        assert.equal((await fetch(base + '/config.css?v=20261013-bindings')).status, 200);
        await new Promise(resolve => server.close(resolve));
        base = await start();
        assert.deepEqual(await fetch(base + '/control-api?PC=test').then(r => r.json()), config);
    } finally {
        if(server) await new Promise(resolve => server.close(resolve));
        // The exact directory was created by this test under the system temp dir.
        await fs.rm(dir, {recursive: true, force: true});
    }
});
