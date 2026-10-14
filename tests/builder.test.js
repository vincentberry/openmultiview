const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../multiview-model');
const B = require('../multiview-builder');

const {fakeVmix} = require('./helpers/fake-vmix.cjs');

const options = (api, screen, template = 'sixteen', save = () => {}) => ({screen, template: M.templates.find(t => t.id === template), pc: 'test', index: 0,
    readInputs: api.readInputs, command: api.command, save, displayURL: () => 'http://127.0.0.1:8090/index.html?PC=test&Screen=1'});

test('every model reserves root layer 10 for full-screen HTML and keeps it above the videos', async () => {
    for(const template of M.templates.filter(t => t.slots)) {
        const api = fakeVmix();
        const result = await B.build(options(api, M.screen(), template.id));
        const root = api.inputs.find(i => i.key === result.managed.root);
        const html = root.layers.find(l => l.index === 9);
        assert.equal(html.inputKey, result.managed.browser, template.id);
        assert.equal(html.enabled, true);
        assert.deepEqual(html.position, {zoomX: 100, zoomY: 100, panX: 0, panY: 0});
        assert.ok(result.managed.active[root.key].includes(10));
        assert.ok(result.layout.every(p => p.source !== root.key || p.layer !== 10));
        const lastAttachment = api.calls.filter(c => c.name === 'SetLayer').at(-1);
        assert.deepEqual(lastAttachment, {name: 'SetLayer', Input: root.key, Value: '10,' + result.managed.browser});
        const layers = M.collectLayers(api.inputs, result.inputs, result.managed.active).layers;
        assert.equal(layers.length, template.slots.length);
        assert.ok(layers.every(l => l.inputKey !== result.managed.browser));
        for(const layer of layers) {
            assert.ok(Math.abs(layer.zoomX * 1920 / (layer.zoomY * 1080) - 16/9) < 1e-9, template.id);
            const planned = result.layout.find(p => p.source === layer.sourceKey && p.layer === layer.layerNumber);
            for(const field of ['zoomX','zoomY','panX','panY']) assert.ok(Math.abs(layer[field] - planned[field]) < 1e-9, template.id + ' / ' + field);
        }
        assert.equal(B.browserNeedsRepair({...M.screen(result.inputs), managed: result.managed}, api.inputs), false);
    }
});

test('each screen has its own HTML input on layer 10 and recalls the same IDs', async () => {
    const api = fakeVmix();
    const screens = [];
    for(const [index, template] of ['quad', 'sixteen'].entries()) {
        const setup = {...options(api, M.screen(), template), index, displayURL: () => 'http://localhost/index.html?PC=test&Screen=' + (index + 1)};
        const result = await B.build(setup);
        screens.push({...M.screen(result.inputs), managed: result.managed, layout: result.layout});
        const browser = api.inputs.find(i => i.key === result.managed.browser);
        assert.equal(new URL(browser.url).searchParams.get('Screen'), String(index + 1));
        assert.equal(api.inputs.find(i => i.key === result.managed.root).layers.find(l => l.index === 9).inputKey, browser.key);
    }
    assert.notEqual(screens[0].managed.root, screens[1].managed.root);
    assert.notEqual(screens[0].managed.browser, screens[1].managed.browser);
    const creations = api.calls.filter(c => c.name === 'AddInput').length;
    const recalled = M.unpack(M.pack({version: 1, pc: 'test', host: '127.0.0.1', port: '8088', updated: 1, screens}));
    for(const [index, screen] of recalled.screens.entries()) {
        const result = await B.build({...options(api, screen, screen.managed.template), index});
        assert.equal(result.managed.root, screen.managed.root);
        assert.equal(result.managed.browser, screen.managed.browser);
        assert.equal(api.inputs.find(i => i.key === screen.managed.root).layers.find(l => l.index === 9).inputKey, screen.managed.browser);
    }
    assert.equal(api.calls.filter(c => c.name === 'AddInput').length, creations);
});

test('older HTML slots migrate to layer 10 while videos, blanks, geometry and IDs stay intact', async () => {
    for(const [template, legacySlot] of [['quad', 5], ['sixteen', 3]]) {
        const api = fakeVmix();
        const first = await B.build(options(api, M.screen(), template));
        const p = first.layout[1];
        let screen = {...M.screen(first.inputs), managed: first.managed, layout: first.layout, tiles: [{key: M.layerKey(p.source, p.layer - 1), value: {titlePosition: 'below'}}]};
        screen = await B.assignLayer({screen, layer: {sourceKey: p.source, layerNumber: p.layer}, sourceKey: null, readInputs: api.readInputs, command: api.command});
        const root = api.inputs.find(i => i.key === screen.managed.root);
        const html = root.layers.find(l => l.index === 9);
        html.index = legacySlot - 1;
        html.position = {zoomX: 50, zoomY: 50, panX: 20, panY: -20};
        screen.managed.active[root.key] = screen.managed.active[root.key].filter(n => n !== 10).concat(legacySlot);
        api.inputs.forEach((i, n) => i.number = n + 30);
        const snapshot = M.clone(screen);
        const videoBefore = M.clone(api.inputs.filter(i => i.key !== screen.managed.browser).map(i => ({key: i.key, layers: i.layers.filter(l => l.inputKey !== screen.managed.browser)})));
        assert.equal(B.browserNeedsRepair(screen, api.inputs), true);
        const before = api.calls.length;
        const next = await B.repairBrowser({screen, readInputs: api.readInputs, command: api.command});
        assert.deepEqual(screen, snapshot);
        assert.deepEqual(next.layout, screen.layout);
        assert.deepEqual(next.tiles, screen.tiles);
        assert.deepEqual(next.layerSources, screen.layerSources);
        assert.deepEqual(next.managed.sources, screen.managed.sources);
        assert.equal(next.managed.root, screen.managed.root);
        assert.equal(next.managed.browser, screen.managed.browser);
        assert.deepEqual(next.managed.parts, screen.managed.parts);
        assert.equal(root.layers.find(l => l.index === legacySlot - 1).enabled, false);
        assert.equal(root.layers.find(l => l.index === 9).enabled, true);
        assert.equal(root.layers.find(l => l.index === 9).inputKey, screen.managed.browser);
        assert.deepEqual(root.layers.find(l => l.index === 9).position, {zoomX: 100, zoomY: 100, panX: 0, panY: 0});
        assert.deepEqual(api.inputs.filter(i => i.key !== screen.managed.browser).map(i => ({key: i.key, layers: i.layers.filter(l => l.inputKey !== screen.managed.browser)})), videoBefore);
        assert.ok(api.calls.slice(before).every(c => c.Input === root.key));
        assert.equal(api.calls.slice(before).filter(c => c.name === 'AddInput').length, 0);
        assert.equal(B.browserNeedsRepair(next, api.inputs), false);
        assert.equal(M.collectLayers(api.inputs, next.inputs, M.activeLayersFor(next, api.inputs)).layers.length, first.layout.length - 1);
    }
});

test('interrupted HTML migration can be retried without losing the saved configuration or creating inputs', async () => {
    const api = fakeVmix(4);
    const result = await B.build(options(api, M.screen(), 'quad'));
    const screen = {...M.screen(result.inputs), managed: result.managed, layout: result.layout};
    const root = api.inputs.find(i => i.key === result.managed.root);
    root.layers.find(l => l.index === 9).index = 4;
    screen.managed.active[root.key] = [1, 2, 3, 4, 5];
    const snapshot = M.clone(screen);
    api.failNext('SetLayer10PanX');
    await assert.rejects(B.repairBrowser({screen, readInputs: api.readInputs, command: api.command}), /Interruption/);
    assert.deepEqual(screen, snapshot);
    const next = await B.repairBrowser({screen, readInputs: api.readInputs, command: api.command});
    assert.equal(B.browserNeedsRepair(next, api.inputs), false);
    assert.equal(api.calls.filter(c => c.name === 'AddInput').length, 2);
});

test('a missing HTML source is created on root layer 10 without rebuilding videos or changing their IDs', async () => {
    for(const template of ['quad', 'sixteen']) {
        const api = fakeVmix();
        const result = await B.build(options(api, M.screen(), template));
        let screen = {...M.screen(result.inputs), managed: result.managed, layout: result.layout, tiles: [{key: 'custom', value: {titlePosition: 'below'}}]};
        const p = screen.layout[1];
        screen = await B.assignLayer({screen, layer: {sourceKey: p.source, layerNumber: p.layer}, sourceKey: null, readInputs: api.readInputs, command: api.command});
        const previousBrowser = screen.managed.browser;
        api.inputs.splice(api.inputs.findIndex(i => i.key === previousBrowser), 1);
        const root = api.inputs.find(i => i.key === screen.managed.root);
        root.layers = root.layers.filter(l => l.index !== 9);
        screen.managed.browser = null;
        // An unrelated browser must not be claimed as this screen's HTML input.
        api.inputs.push({key: 'unrelated-browser', number: 99, title: 'Browser configuration', type: 'Browser', layers: []});
        const before = M.clone(screen);
        const videoBefore = M.clone(api.inputs);
        const count = api.calls.length;
        let saved;
        assert.equal(B.browserNeedsRepair(screen, api.inputs), true);
        const setup = {screen, pc: 'test', index: 0, readInputs: api.readInputs, command: api.command, save: next => saved = next,
            displayURL: async () => {
                assert.equal(root.layers.find(l => l.index === 9).inputKey, saved.managed.browser);
                return 'http://localhost/index.html?PC=test&Screen=1';
            }};
        const next = await B.repairBrowser(setup);
        assert.deepEqual(screen, before);
        assert.equal(next.managed.root, screen.managed.root);
        assert.deepEqual(next.managed.parts, screen.managed.parts);
        assert.deepEqual(next.managed.sources, screen.managed.sources);
        assert.deepEqual(next.layout, screen.layout);
        assert.deepEqual(next.tiles, screen.tiles);
        assert.deepEqual(next.layerSources, screen.layerSources);
        assert.notEqual(next.managed.browser, previousBrowser);
        assert.notEqual(next.managed.browser, 'unrelated-browser');
        assert.deepEqual(api.inputs.filter(i => i.key !== next.managed.browser).map(i => ({...i, layers: i.key === root.key ? i.layers.filter(l => l.index !== 9) : i.layers})), videoBefore);
        assert.deepEqual(api.calls.slice(count).filter(c => c.name === 'AddInput').map(c => c.Value), ['Browser|about:blank']);
        assert.equal(B.browserNeedsRepair(next, api.inputs), false);
        assert.equal(M.configurableLayers(next, api.inputs).filter(l => !l.disabled).length, result.layout.length - 1);
        await B.repairBrowser({...setup, screen: next});
        assert.equal(api.calls.slice(count).filter(c => c.name === 'AddInput').length, 1);
    }
});

test('HTML creation and navigation failures preserve the browser ID for a complete retry', async () => {
    for(const failure of ['SetInputName', 'BrowserNavigate', 'SetLayer10PanX']) {
        const api = fakeVmix(4);
        const result = await B.build(options(api, M.screen(), 'quad'));
        const screen = {...M.screen(result.inputs), managed: result.managed, layout: result.layout};
        api.inputs.splice(api.inputs.findIndex(i => i.key === screen.managed.browser), 1);
        api.inputs.find(i => i.key === screen.managed.root).layers = api.inputs.find(i => i.key === screen.managed.root).layers.filter(l => l.index !== 9);
        let saved;
        const setup = {screen, pc: 'test', index: 0, readInputs: api.readInputs, command: api.command, save: next => saved = next,
            displayURL: () => 'http://localhost/index.html?PC=test&Screen=1'};
        api.failNext(failure);
        const count = api.calls.length;
        await assert.rejects(B.repairBrowser(setup), /Interruption/);
        assert.ok(saved.managed.browser);
        assert.equal(saved.managed.htmlPending, true);
        assert.equal(B.browserNeedsRepair(saved, api.inputs), true);
        const recalled = M.unpack(M.pack({version: 1, pc: 'test', host: '127.0.0.1', port: '8088', updated: 1, screens: [saved]})).screens[0];
        const next = await B.repairBrowser({...setup, screen: recalled});
        assert.equal(next.managed.browser, saved.managed.browser);
        assert.equal(next.managed.htmlPending, undefined);
        assert.equal(api.inputs.find(i => i.key === next.managed.browser).title, 'MV · test · Écran 1 · Habillage');
        assert.equal(api.calls.slice(count).filter(c => c.name === 'AddInput').length, 1);
        assert.equal(B.browserNeedsRepair(next, api.inputs), false);
    }
});

test('a long portable URL is loaded only after the browser has been created and attached', async () => {
    const api = fakeVmix(4);
    const longURL = 'https://example.test/index.html?PC=test&Screen=1&Config=' + 'x'.repeat(16000);
    const setup = {...options(api, M.screen(), 'quad'), displayURL: () => longURL};
    setup.command = async (name, args) => {
        if(name === 'AddInput') assert.ok(args.Value.length < 100);
        if(name === 'BrowserNavigate') assert.ok(api.inputs.some(i => i.layers.some(l => l.index === 9 && l.inputKey === args.Input && l.enabled)));
        await api.command(name, args);
    };
    const result = await B.build(setup);
    assert.equal(api.inputs.find(i => i.key === result.managed.browser).url, longURL);
});

test('repairing several screens creates a separate HTML input and URL for each existing multiview', async () => {
    const api = fakeVmix();
    const screens = [];
    for(const [index, template] of ['quad', 'sixteen'].entries()) {
        const result = await B.build({...options(api, M.screen(), template), index});
        const screen = {...M.screen(result.inputs), managed: result.managed, layout: result.layout};
        api.inputs.splice(api.inputs.findIndex(i => i.key === screen.managed.browser), 1);
        api.inputs.find(i => i.key === screen.managed.root).layers = api.inputs.find(i => i.key === screen.managed.root).layers.filter(l => l.index !== 9);
        screens.push(screen);
    }
    const repaired = [];
    for(const [index, screen] of screens.entries()) {
        const next = await B.repairBrowser({screen, pc: 'test', index, readInputs: api.readInputs, command: api.command,
            displayURL: () => 'http://localhost/index.html?PC=test&Screen=' + (index + 1)});
        assert.equal(next.managed.root, screen.managed.root);
        const browser = api.inputs.find(i => i.key === next.managed.browser);
        assert.equal(new URL(browser.url).searchParams.get('Screen'), String(index + 1));
        assert.equal(api.inputs.find(i => i.key === screen.managed.root).layers.find(l => l.index === 9).inputKey, browser.key);
        repaired.push(next);
    }
    assert.notEqual(repaired[0].managed.browser, repaired[1].managed.browser);
});

test('the HTML repair recovers its own named input if only the saved browser ID is missing', async () => {
    const api = fakeVmix(4);
    const result = await B.build(options(api, M.screen(), 'quad'));
    const screen = {...M.screen(result.inputs), managed: {...result.managed, browser: null}, layout: result.layout};
    api.inputs.find(i => i.key === screen.managed.root).layers = api.inputs.find(i => i.key === screen.managed.root).layers.filter(l => l.index !== 9);
    const count = api.calls.length;
    const next = await B.repairBrowser({screen, pc: 'test', index: 0, readInputs: api.readInputs, command: api.command,
        displayURL: () => 'http://localhost/index.html?PC=test&Screen=1'});
    assert.equal(next.managed.browser, result.managed.browser);
    assert.equal(api.calls.slice(count).filter(c => c.name === 'AddInput').length, 0);
    assert.equal(B.browserNeedsRepair(next, api.inputs), false);
});

test('the reserved HTML slot cannot be assigned a camera or disabled even if its source is missing', async () => {
    const api = fakeVmix(4);
    const result = await B.build(options(api, M.screen(), 'quad'));
    const screen = {...M.screen(result.inputs), managed: result.managed, layout: result.layout};
    const root = api.inputs.find(i => i.key === result.managed.root);
    root.layers = root.layers.filter(l => l.index !== 9);
    const before = api.calls.length;
    for(const sourceKey of [null, 'camera-1']) await assert.rejects(B.assignLayer({screen, layer: {sourceKey: root.key, layerNumber: 10}, sourceKey, readInputs: api.readInputs, command: api.command}), /réservé.*HTML/);
    const conflicting = {...screen, layout: [...screen.layout, {...screen.layout[0], layer: 10}]};
    await assert.rejects(B.repairBrowser({screen: conflicting, readInputs: api.readInputs, command: api.command}), /position vidéo mémorisée/);
    assert.equal(api.calls.length, before);
});

test('compact and edge-to-edge models reuse inputs for direct and grouped multiviews', async () => {
    for(const [template, zoom, creations] of [['quad', 50, 2], ['sixteen', 25, 4]]) {
        const api = fakeVmix();
        const first = await B.build(options(api, M.screen(), template));
        assert.equal(first.managed.spacing, 2);
        assert.ok(first.layout.every(p => Math.abs(p.zoomX - zoom * .98) < 1e-9));
        const screen = {...M.screen(first.inputs), managed: first.managed, layout: first.layout, spacing: 0};
        const next = await B.build(options(api, screen, template));
        assert.equal(next.managed.root, first.managed.root);
        assert.equal(next.managed.browser, first.managed.browser);
        assert.deepEqual(next.managed.parts, first.managed.parts);
        assert.deepEqual(next.managed.sources, first.managed.sources);
        assert.equal(next.managed.spacing, 0);
        assert.ok(next.layout.every(p => p.zoomX === zoom && p.zoomY === zoom));
        assert.deepEqual(next.layout.map(p => [p.source, p.layer, p.panX, p.panY]), first.layout.map(p => [p.source, p.layer, p.panX, p.panY]));
        assert.equal(api.calls.filter(c => c.name === 'AddInput').length, creations);
        assert.ok(M.collectLayers(api.inputs, next.inputs, next.managed.active).layers.every(l => l.zoomX === zoom));
    }
});

test('a disabled tile returns at the new spacing even if vMix still reports its old geometry', async () => {
    const api = fakeVmix(6);
    const first = await B.build(options(api, {...M.screen(), spacing: 13}, 'quad'));
    const p = first.layout[1];
    let screen = {...M.screen(first.inputs), managed: first.managed, layout: first.layout, spacing: 13};
    screen = await B.assignLayer({screen, layer: {sourceKey: p.source, layerNumber: p.layer}, sourceKey: null, readInputs: api.readInputs, command: api.command});
    screen.layout = M.resizeSpacing(screen.layout, 13, 0);
    screen.spacing = screen.managed.spacing = 0;
    const oldSlot = api.inputs.find(i => i.key === p.source).layers.find(l => l.index === 1);
    assert.equal(oldSlot.position.zoomX, 43.5);
    assert.equal(oldSlot.enabled, false);
    const next = await B.assignLayer({screen, layer: {sourceKey: p.source, layerNumber: p.layer, localPosition: p}, sourceKey: 'camera-6', readInputs: api.readInputs, command: api.command});
    assert.equal(oldSlot.position.zoomX, 50);
    assert.equal(oldSlot.position.zoomY, 50);
    assert.equal(oldSlot.position.panX, p.panX);
    assert.equal(oldSlot.position.panY, p.panY);
    assert.equal(oldSlot.enabled, true);
    assert.equal(next.managed.root, first.managed.root);
    assert.equal(next.layerSources[0].source, 'camera-6');
    assert.equal(api.calls.filter(c => c.name === 'AddInput').length, 2);
});

test('16 thumbnails create two panels, one root and one browser; every layer stays within 10', async () => {
    const api = fakeVmix();
    const result = await B.build(options(api, M.screen()));
    assert.equal(api.calls.filter(c => c.name === 'AddInput').length, 4);
    assert.equal(result.managed.parts.length, 2);
    assert.deepEqual(result.managed.active[result.managed.root], [1, 2, 10]);
    assert.equal(result.managed.active[result.managed.parts[0]].length, 10);
    assert.equal(result.managed.active[result.managed.parts[1]].length, 6);
    assert.equal(M.collectLayers(api.inputs, result.inputs, result.managed.active).layers.length, 16);
    assert.equal(api.calls.find(c => c.name === 'AddInput' && c.Value === 'Colour|Transparent').Value, 'Colour|Transparent');
    const state = {version: 1, pc: 'test', host: '127.0.0.1', port: '8088', updated: 1, screens: [{...M.screen(result.inputs), managed: result.managed, layout: result.layout}]};
    assert.equal(M.unpack(M.pack(state)).screens[0].managed.root, result.managed.root);
});

test('repeat and smaller presets reuse IDs; disabled leftover layers do not appear in the multiview', async () => {
    const api = fakeVmix();
    const first = await B.build(options(api, M.screen()));
    const screen = {...M.screen(first.inputs), managed: first.managed, layout: first.layout};
    const second = await B.build(options(api, screen));
    assert.deepEqual(second.managed.parts, first.managed.parts);
    assert.equal(second.managed.root, first.managed.root);
    assert.equal(second.managed.browser, first.managed.browser);
    assert.equal(api.calls.filter(c => c.name === 'AddInput').length, 4);
    const smaller = await B.build(options(api, {...screen, managed: second.managed}, 'quad'));
    assert.equal(smaller.managed.root, first.managed.root);
    assert.equal(smaller.managed.browser, first.managed.browser);
    assert.equal(M.collectLayers(api.inputs, smaller.inputs, smaller.managed.active).layers.length, 4);
    assert.equal(api.calls.filter(c => c.name === 'AddInput').length, 4);
});

test('ten video sources reserve a separate browser layer by using one additional panel', async () => {
    const api = fakeVmix(10);
    const result = await B.build(options(api, M.screen(), 'preset-1'));
    assert.equal(result.managed.parts.length, 1);
    assert.deepEqual(result.managed.active[result.managed.root], [1, 10]);
    assert.equal(M.collectLayers(api.inputs, result.inputs, result.managed.active).layers.length, 10);
});

test('an interrupted creation resumes with the IDs already recorded', async () => {
    const api = fakeVmix();
    let saved;
    api.failNext('SetInputName');
    await assert.rejects(B.build(options(api, M.screen(), 'sixteen', value => saved = value)), /Interruption/);
    assert.ok(saved.root);
    const result = await B.build(options(api, {...M.screen(), managed: saved}));
    assert.equal(result.managed.root, saved.root);
    assert.equal(api.calls.filter(c => c.name === 'AddInput').length, 4);
});

test('the planned layers are saved and videos are attached before HTML setup can fail', async () => {
    const api = fakeVmix(4);
    let saved;
    const setup = options(api, M.screen(), 'quad', (managed, planned) => saved = {...M.screen([managed.root]), managed, ...(planned ? {layout: planned.layout} : {})});
    setup.command = async (name, args) => {
        if(name === 'SetInputName' && api.inputs.find(i => i.key === args.Input).type === 'Browser') api.failNext(name);
        await api.command(name, args);
    };
    await assert.rejects(B.build(setup), /Interruption/);
    assert.equal(saved.layout.length, 4);
    assert.ok(saved.managed.root);
    assert.ok(saved.managed.browser);
    const layers = M.configurableLayers(saved, api.inputs);
    assert.equal(layers.length, 4);
    assert.deepEqual(layers.map(l => l.inputKey), saved.managed.sources);
    assert.ok(layers.every(l => !l.disabled && l.zoomX === 49));
    assert.ok(api.inputs.find(i => i.key === saved.managed.root).layers.filter(l => l.enabled).length >= 4);
    const resumed = await B.build(options(api, saved, 'quad'));
    assert.equal(resumed.managed.root, saved.managed.root);
    assert.equal(resumed.managed.browser, saved.managed.browser);
    assert.equal(api.calls.filter(c => c.name === 'AddInput').length, 2);
});

test('a build waits for vMix to return the newly attached layers and keeps the plan available meanwhile', async () => {
    const api = fakeVmix();
    let staleReads = 0, planChecked = false;
    const setup = options(api, M.screen(), 'sixteen', (managed, plan) => {
        if(!plan || planChecked) return;
        const s = {...M.screen(plan.inputs), managed, layout: plan.layout};
        const layers = M.configurableLayers(s, api.inputs);
        assert.equal(layers.length, 16);
        assert.ok(layers.every(l => l.pending && !l.disabled));
        planChecked = true;
    });
    setup.readInputs = async () => {
        const inputs = await api.readInputs();
        const complete = inputs.some(i => i.layers.some(l => l.index === 9 && api.inputs.find(child => child.key === l.inputKey).type === 'Browser' && l.enabled));
        if(complete && ++staleReads <= 2) inputs.forEach(i => i.layers = []);
        return inputs;
    };
    const result = await B.build(setup);
    assert.equal(staleReads, 3);
    assert.equal(planChecked, true);
    assert.equal(M.collectLayers(api.inputs, result.inputs, result.managed.active).layers.length, 16);
    assert.equal(api.calls.filter(c => c.name === 'AddInput').length, 4);
});

test('generated inputs without layers are excluded from other screens camera choices', () => {
    const api = fakeVmix(4);
    api.inputs.push({key: 'other-root', number: 5, type: 'Colour', title: 'MV · other · Écran 2 · Multiview', layers: []},
        {key: 'other-part', number: 6, type: 'Colour', title: 'MV · other · Écran 2 · Vignettes 1', layers: []});
    assert.deepEqual(B.candidates(api.inputs, M.screen()).map(i => i.key), ['camera-1', 'camera-2', 'camera-3', 'camera-4']);
});

test('editing a planned layer reconnects its grouping input after an interrupted creation', async () => {
    const api = fakeVmix();
    const result = await B.build(options(api, M.screen()));
    const screen = {...M.screen(result.inputs), managed: result.managed, layout: result.layout};
    const root = api.inputs.find(i => i.key === result.managed.root);
    const group = api.inputs.find(i => i.key === result.managed.parts[0]);
    root.layers = root.layers.filter(l => l.index !== 0);
    group.layers = [];
    const layer = M.configurableLayers(screen, api.inputs).find(l => l.sourceKey === group.key && l.layerNumber === 10);
    assert.equal(layer.pending, true);
    const next = await B.assignLayer({screen, layer, sourceKey: 'camera-14', readInputs: api.readInputs, command: api.command});
    assert.equal(root.layers.find(l => l.index === 0).inputKey, group.key);
    assert.equal(root.layers.find(l => l.index === 0).enabled, true);
    assert.equal(group.layers.find(l => l.index === 9).inputKey, 'camera-14');
    assert.equal(group.layers.find(l => l.index === 9).position.zoomX, 24.5);
    assert.equal(root.layers.find(l => l.index === 9).inputKey, result.managed.browser);
    assert.equal(next.managed.sources[9], 'camera-14');
    assert.equal(api.calls.filter(c => c.name === 'AddInput').length, 4);
});

test('a lost AddInput reply is recovered from XML without a duplicate input', async () => {
    const api = fakeVmix(4);
    api.failNext('AddInput');
    await B.build(options(api, M.screen(), 'quad'));
    assert.equal(api.calls.filter(c => c.name === 'AddInput').length, 2);
});

test('a reusable multiview keeps its ID; incomplete source selection creates no input', async () => {
    const api = fakeVmix(4);
    api.inputs.push({key: 'original-root', number: 5, title: 'Original MV', type: 'Colour', layers: [{index: 0, inputKey: 'camera-1'}]});
    const result = await B.build({...options(api, M.screen(['original-root']), 'quad'), reusableRoot: 'original-root'});
    assert.equal(result.managed.root, 'original-root');
    assert.equal(api.calls.filter(c => c.name === 'AddInput').length, 1);
    const before = api.calls.length;
    await assert.rejects(B.build(options(api, {...M.screen(), videoInputs: ['camera-1']}, 'quad')), /Sélectionnez 4/);
    assert.equal(api.calls.length, before);
});

test('only a missing input is recreated; custom positions rebind to its new ID', async () => {
    const api = fakeVmix(4);
    const first = await B.build(options(api, M.screen(), 'quad'));
    const custom = first.layout.map(p => ({...p, panX: p.panX + 3}));
    api.inputs.splice(api.inputs.findIndex(i => i.key === first.managed.root), 1);
    const second = await B.build(options(api, {...M.screen(first.inputs), managed: first.managed}, 'quad'));
    assert.notEqual(second.managed.root, first.managed.root);
    assert.equal(second.managed.browser, first.managed.browser);
    assert.equal(api.calls.filter(c => c.name === 'AddInput').length, 3);
    const rebound = B.rebindLayout(custom, first.managed, second.managed);
    assert.equal(rebound[0].source, second.managed.root);
    assert.equal(rebound[0].panX, custom[0].panX);
    assert.deepEqual(B.rebindLayerSources([{parent: first.managed.root, layer: 1, source: null}, {parent: first.managed.root, layer: 2, source: 'camera-4'}], first.managed, second.managed),
        [{parent: second.managed.root, layer: 1, source: null}, {parent: second.managed.root, layer: 2, source: 'camera-4'}]);
});

test('programme and Mix outputs with layers remain eligible video sources', () => {
    const inputs = [{key: 'pgm', number: 1, title: 'PGM', type: 'Mix', layers: [{index: 0, inputKey: 'cam'}]},
        {key: 'cam', number: 2, title: 'CAM', type: 'Capture', layers: []}];
    assert.ok(B.candidates(inputs, M.screen(['missing'])).some(i => i.key === 'pgm'));
});

test('a quad accepts ten selected sources and switches off every surplus video layer', async () => {
    const api = fakeVmix(10);
    const videoInputs = api.inputs.map(i => i.key);
    const first = await B.build(options(api, {...M.screen(), videoInputs}, 'preset-1'));
    const screen = {...M.screen(first.inputs), managed: first.managed, layout: first.layout, videoInputs};
    const before = api.calls.length;
    const quad = await B.build(options(api, screen, 'quad'));
    assert.deepEqual(quad.managed.sources, videoInputs.slice(0, 4));
    assert.equal(quad.managed.root, first.managed.root);
    assert.equal(quad.managed.browser, first.managed.browser);
    assert.deepEqual(quad.managed.parts, first.managed.parts);
    assert.equal(api.calls.slice(before).filter(c => c.name === 'AddInput').length, 0);
    const root = api.inputs.find(i => i.key === quad.managed.root);
    assert.deepEqual(root.layers.filter(l => l.enabled).sort((a, b) => a.index - b.index).map(l => l.inputKey), [...videoInputs.slice(0, 4), quad.managed.browser]);
    for(const part of quad.managed.parts) assert.ok(api.inputs.find(i => i.key === part).layers.every(l => l.enabled === false));
    for(let n = 5; n < 10; n++) assert.ok(api.calls.slice(before).some(c => c.name === 'LayerOff' && c.Input === root.key && c.Value === String(n)));
    assert.equal(M.collectLayers(api.inputs, quad.inputs, quad.managed.active).layers.length, 4);
});

test('source selection edits a layer by stable ID while preserving geometry and the source pool', async () => {
    const api = fakeVmix(10);
    const videoInputs = api.inputs.map(i => i.key);
    const first = await B.build(options(api, {...M.screen(), videoInputs}, 'quad'));
    const screen = {...M.screen(first.inputs), managed: first.managed, layout: first.layout, videoInputs};
    const parent = api.inputs.find(i => i.key === first.managed.root);
    const position = M.clone(parent.layers.find(l => l.index === 1).position);
    // vMix input numbers can change without changing the API targets.
    api.inputs.forEach((input, n) => input.number = n + 20);
    const before = api.calls.length;
    const next = await B.assignLayer({screen, layer: {sourceKey: parent.key, layerNumber: 2, localPosition: position}, sourceKey: 'camera-7', readInputs: api.readInputs, command: api.command});
    assert.equal(next.managed.root, parent.key);
    assert.equal(next.managed.sources[1], 'camera-7');
    assert.equal(next.videoInputs.length, 10);
    assert.equal(next.videoInputs[1], 'camera-7');
    assert.deepEqual(next.layerSources, [{parent: parent.key, layer: 2, source: 'camera-7'}]);
    assert.deepEqual(parent.layers.find(l => l.index === 1).position, position);
    assert.equal(parent.layers.find(l => l.index === 1).enabled, true);
    assert.equal(api.calls.slice(before).find(c => c.name === 'SetLayer').Value, '2,camera-7');
    assert.ok(api.calls.slice(before).every(c => c.Input === parent.key));
    assert.deepEqual(B.selectSources(api.inputs, next, M.templates.find(t => t.id === 'quad')).map(i => i.key), ['camera-1', 'camera-7', 'camera-3', 'camera-4']);
    assert.equal(screen.managed.sources[1], 'camera-2');
});

test('blank layers retain their slots and URL assignments, then reactivate in place', async () => {
    const api = fakeVmix(6);
    const first = await B.build(options(api, M.screen(), 'quad'));
    let screen = {...M.screen(first.inputs), managed: first.managed, layout: first.layout};
    for(const p of first.layout) screen = await B.assignLayer({screen, layer: {sourceKey: p.source, layerNumber: p.layer, localPosition: p}, sourceKey: null, readInputs: api.readInputs, command: api.command});
    assert.equal(screen.layerSources.length, 4);
    assert.equal(screen.layout.length, 4);
    assert.deepEqual(screen.managed.sources, first.managed.sources);
    assert.deepEqual(screen.managed.active[first.managed.root], [10]);
    assert.equal(M.collectLayers(api.inputs, screen.inputs, M.activeLayersFor(screen, api.inputs)).layers.length, 0);
    const config = {version: 1, pc: 'test', host: '127.0.0.1', port: '8088', updated: 2, screens: [screen]};
    const recalled = M.unpack(M.pack(config)).screens[0];
    assert.deepEqual(recalled.layerSources, screen.layerSources);
    const restored = await B.assignLayer({screen: recalled, layer: {sourceKey: first.managed.root, layerNumber: 1, localPosition: first.layout[0]}, sourceKey: 'camera-6', readInputs: api.readInputs, command: api.command});
    const visible = M.collectLayers(api.inputs, restored.inputs, M.activeLayersFor(restored, api.inputs)).layers;
    assert.deepEqual(visible.map(l => l.inputKey), ['camera-6']);
    assert.deepEqual(visible[0].localPosition, Object.fromEntries(['zoomX', 'zoomY', 'panX', 'panY'].map(k => [k, first.layout[0][k]])));
    assert.equal(restored.layerSources.find(r => r.layer === 1).source, 'camera-6');
    assert.equal(api.calls.filter(c => c.name === 'AddInput').length, 2);
});

test('recalling source assignments restores duplicate cameras, blanks and changed presets without new IDs', async () => {
    const api = fakeVmix();
    const first = await B.build(options(api, M.screen(), 'quad'));
    let saved = {...M.screen(first.inputs), managed: first.managed, layout: first.layout};
    saved = await B.assignLayer({screen: saved, layer: {sourceKey: first.managed.root, layerNumber: 2}, sourceKey: 'camera-1', readInputs: api.readInputs, command: api.command});
    saved = await B.assignLayer({screen: saved, layer: {sourceKey: first.managed.root, layerNumber: 3}, sourceKey: null, readInputs: api.readInputs, command: api.command});
    await B.build(options(api, saved, 'nine'));
    const before = api.calls.filter(c => c.name === 'AddInput').length;
    const result = await B.build(options(api, saved, 'quad'));
    let recalled = {...saved, managed: result.managed, layout: B.rebindLayout(saved.layout, saved.managed, result.managed), layerSources: B.rebindLayerSources(saved.layerSources, saved.managed, result.managed)};
    for(const row of recalled.layerSources) recalled = await B.assignLayer({screen: recalled, layer: {sourceKey: row.parent, layerNumber: row.layer}, sourceKey: row.source, readInputs: api.readInputs, command: api.command});
    assert.equal(result.managed.root, first.managed.root);
    assert.deepEqual(M.collectLayers(api.inputs, recalled.inputs, M.activeLayersFor(recalled, api.inputs)).layers.map(l => l.inputKey), ['camera-1', 'camera-1', 'camera-4']);
    assert.equal(api.calls.filter(c => c.name === 'AddInput').length, before);
});

test('assignment rejects browser, grouping, cyclic and invalid layers before issuing a command', async () => {
    const api = fakeVmix();
    const first = await B.build(options(api, M.screen()));
    const screen = {...M.screen(first.inputs), managed: first.managed, layout: first.layout};
    api.inputs.push({key: 'cycle', number: 21, title: 'Mix 2', type: 'Mix', layers: [{index: 0, inputKey: first.managed.parts[0]}]});
    const before = api.calls.length;
    const assign = (parent, slot, source) => B.assignLayer({screen, layer: {sourceKey: parent, layerNumber: slot}, sourceKey: source, readInputs: api.readInputs, command: api.command});
    await assert.rejects(assign(first.managed.parts[0], 1, first.managed.browser), /ne peut pas/);
    await assert.rejects(assign(first.managed.root, 1, 'camera-1'), /regroupement/);
    await assert.rejects(assign(first.managed.root, 10, null), /navigateur/);
    await assert.rejects(assign(first.managed.parts[0], 1, 'cycle'), /boucle/);
    await assert.rejects(assign(first.managed.parts[0], 0, 'camera-1'), /invalide/);
    await assert.rejects(assign('missing', 1, 'camera-1'), /introuvable/);
    assert.equal(api.calls.length, before);
});

test('manual multiview assignments preserve legacy positions and exclude only disabled slots', async () => {
    const api = fakeVmix(4);
    const position = {zoomX: 43.5, zoomY: 43.5, panX: -50, panY: 50};
    api.inputs.push({key: 'old-root', number: 5, title: 'MV', type: 'Colour', layers: [0, 1, 2, 3].map(index => ({index, inputKey: 'camera-' + (index + 1), position: M.clone(position)}))});
    const screen = {...M.screen(['old-root']), layout: [{source: 5, layer: 1, ...position}]};
    const blank = await B.assignLayer({screen, layer: {sourceKey: 'old-root', layerNumber: 1, localPosition: position}, sourceKey: null, readInputs: api.readInputs, command: api.command});
    assert.equal(blank.layout[0].source, 'old-root');
    assert.deepEqual(M.activeLayersFor(blank, api.inputs)['old-root'], [2, 3, 4]);
    assert.equal(M.collectLayers(api.inputs, blank.inputs, M.activeLayersFor(blank, api.inputs)).layers.length, 3);
    const next = await B.assignLayer({screen: blank, layer: {sourceKey: 'old-root', layerNumber: 1, localPosition: position}, sourceKey: 'camera-4', readInputs: api.readInputs, command: api.command});
    assert.equal(next.layout.length, 1);
    assert.equal(M.collectLayers(api.inputs, next.inputs, M.activeLayersFor(next, api.inputs)).layers.length, 4);
    api.failNext('SetLayer');
    const snapshot = M.clone(next);
    await assert.rejects(B.assignLayer({screen: next, layer: {sourceKey: 'old-root', layerNumber: 1}, sourceKey: 'camera-2', readInputs: api.readInputs, command: api.command}), /Interruption/);
    assert.deepEqual(next, snapshot);
});
