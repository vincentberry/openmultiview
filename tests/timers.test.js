const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../public/js/multiview-model');

function timerScope() {
    const empty = new Proxy({length: 0}, {get: (target, key) => key === 'length' ? 0 : () => empty});
    const scope = vm.createContext({
        MultiviewModel: M, URLSearchParams, console,
        window: {location: {href: 'http://localhost/index.html', search: ''}},
        document: {}, Option: function() {}, $: () => empty,
        setInterval: () => 0, setTimeout: () => 0, clearTimeout: () => {}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/viewer.js'), 'utf8'), scope);
    scope.vMixInputs = [
        {key: 'clip', number: 1, title: 'Clip', shortTitle: 'Clip', type: 'Video', video: true, duration: '60000', position: '55000', loop: true},
        {key: 'other', number: 2, title: 'Other', type: 'Video', video: true, duration: '90000', position: '10000', loop: false},
        {key: 'output', number: 3, title: 'Output', type: 'Output', loop: false},
        {key: 'mix', number: 4, title: 'Mix 2', type: 'Mix', loop: false},
        {key: 'virtual', number: 5, title: 'Virtual Clip', shortTitle: 'Clip', type: 'Virtual', loop: false}
    ];
    scope.vMixSettings.programNumber = 1;
    scope.lastResponse = {querySelector: selector => selector === 'mix[number="2"]' ? {getElementsByTagName: () => [{innerHTML: '1'}]} : null};
    return scope;
}

function renderedTimer(scope, inputKey = 'output') {
    const elements = {};
    const rendered = {display: '', classes: ''};
    const timer = {length: 1,
        removeClass() {rendered.classes = ''; return this;},
        addClass(value) {rendered.classes = value; return this;},
        css(name, value) {rendered[name] = value; return this;},
        find(selector) {
            const state = elements[selector] || (elements[selector] = {});
            return {prop(name, value) {state[name] = value; return this;},
                attr(name, value) {state[name] = value; return this;},
                text(value) {state.text = value; return this;}};
        }};
    const tile = {find: () => timer, toggleClass(name, value) {rendered[name] = value;}};
    scope.document.getElementById = () => tile;
    scope.$ = () => tile;
    scope.multiViewOverlays = [{layerKey: 'test-layer', inputKey}];
    return {rendered, elements};
}

test('the countdown carries the loop state of its media, including Virtual sources', () => {
    const scope = timerScope();
    for(const key of ['clip', 'virtual']) {
        const input = scope.vMixInputs.find(i => i.key === key);
        assert.equal(scope.getLayerTimerInfo(input).loop, true);
        assert.equal(scope.getLayerTimerInfo(input).timeLeft, 5000);
        scope.vMixInputs[0].loop = false;
        assert.equal(scope.getLayerTimerInfo(input).loop, false);
        scope.vMixInputs[0].loop = true;
    }
    assert.equal(scope.getLayerTimerInfo({type: 'Capture'}), undefined);
});

test('OUTPUT and Mix loop indicators follow their active media independently', () => {
    const scope = timerScope();
    const output = scope.vMixInputs[2], mix = scope.vMixInputs[3];
    assert.equal(scope.getLayerTimerInfo(output).loop, true);
    assert.equal(scope.getLayerTimerInfo(mix).loop, true);
    output.loop = true;
    scope.vMixSettings.programNumber = 2;
    assert.equal(scope.getLayerTimerInfo(output).loop, false);
    assert.equal(scope.getLayerTimerInfo(output).timeLeft, 80000);
    assert.equal(scope.getLayerTimerInfo(mix).loop, true);
});

test('loop and countdown updates stay correct as PGM changes or stops showing media', () => {
    const scope = timerScope();
    const {rendered, elements} = renderedTimer(scope);
    scope.updateLayerTimers();
    assert.equal(elements['.layerLoop'].hidden, false);
    assert.equal(elements['.layerTimerValue'].text, '00:00:05.00');
    scope.vMixSettings.programNumber = 2;
    scope.updateLayerTimers();
    assert.equal(elements['.layerLoop'].hidden, true);
    assert.equal(elements['.layerTimerValue'].text, '00:01:20.00');
    scope.vMixInputs[1].video = false;
    scope.updateLayerTimers();
    assert.equal(rendered.display, 'none');
    assert.equal(elements['.layerTimerValue'].text, '');
    assert.equal(elements['.layerLoop'].hidden, true);
    scope.vMixSettings.programNumber = 1;
    scope.updateLayerTimers();
    assert.equal(rendered.display, '');
    assert.equal(elements['.layerLoop'].hidden, false);
});

test('VideoList player info follows the resolved media for direct, Virtual, OUTPUT and Mix layers', () => {
    const scope = timerScope();
    Object.assign(scope.vMixInputs[0], {type: 'VideoList', title: 'Clip 01.mp4', duration: '180000', position: '45000'});
    for(const index of [0, 2, 3, 4]) {
        const info = scope.getLayerTimerInfo(scope.vMixInputs[index]);
        assert.equal(info.isVideoList, true);
        assert.equal(info.mediaTitle, 'Clip 01.mp4');
        assert.equal(info.elapsed, 45000);
        assert.equal(info.timeLeft, 135000);
        assert.equal(info.loop, true);
    }
    scope.vMixSettings.programNumber = 2;
    const info = scope.getLayerTimerInfo(scope.vMixInputs[2]);
    assert.equal(info.isVideoList, false);
    assert.equal(info.mediaTitle, '');
    assert.equal(info.className.includes('timerVideoList'), false);
});

test('list titles and elapsed time update as items change and disappear when PGM leaves the list', () => {
    const scope = timerScope();
    Object.assign(scope.vMixInputs[0], {type: 'VideoList', title: 'Clip 01.mp4', position: '12345'});
    const {rendered, elements} = renderedTimer(scope);
    scope.updateLayerTimers();
    assert.equal(rendered.hasListPlayer, true);
    assert.equal(elements['.layerMediaTitle'].text, 'Clip 01.mp4');
    assert.equal(elements['.layerElapsedValue'].text, '00:00:12.34');
    assert.equal(elements['.layerElapsed'].hidden, false);
    Object.assign(scope.vMixInputs[0], {title: 'Clip 02.mp4', position: '0', loop: false});
    scope.updateLayerTimers();
    assert.equal(elements['.layerMediaTitle'].title, 'Clip 02.mp4');
    assert.equal(elements['.layerElapsedValue'].text, '00:00:00.00');
    assert.equal(elements['.layerTimerValue'].text, '00:01:00.00');
    assert.equal(elements['.layerLoop'].hidden, true);
    scope.vMixSettings.programNumber = 2;
    scope.updateLayerTimers();
    assert.equal(rendered.hasListPlayer, false);
    assert.equal(elements['.layerMediaTitle'].text, '');
    assert.equal(elements['.layerMediaTitle'].hidden, true);
    assert.equal(elements['.layerElapsed'].hidden, true);
    assert.equal(elements['.layerElapsedValue'].text, '');
    assert.equal(elements['.layerTimerValue'].text, '00:01:20.00');
    scope.vMixInputs[1].video = false;
    scope.updateLayerTimers();
    assert.equal(rendered.display, 'none');
});

test('list player info respects the timer switch and escapes media titles', () => {
    const scope = timerScope();
    Object.assign(scope.vMixInputs[0], {type: 'VideoList', title: '<clip & "intro">'});
    const overlay = {layerKey: 'test-layer', inputKey: 'clip'};
    assert.equal(scope.generateLayerTimer(scope.vMixInputs[0], overlay), '');
    scope.mySettingMask = [{key: 'test-layer', value: {timer: true}}];
    const html = scope.generateLayerTimer(scope.vMixInputs[0], overlay);
    assert.match(html, /&lt;clip &amp; &quot;intro&quot;&gt;/);
    assert.doesNotMatch(html, /<clip/);
    assert.match(html, /00:00:55.00/);
    assert.match(html, /00:00:05.00/);
});

test('empty lists and invalid timing data do not show player info', () => {
    const scope = timerScope();
    const input = {...scope.vMixInputs[0], type: 'VideoList'};
    for(const duration of ['0', 'NaN', 'Infinity']) {
        input.duration = duration;
        assert.equal(scope.getLayerTimerInfo(input), undefined);
    }
    Object.assign(input, {duration: '60000', position: '-10'});
    assert.equal(scope.getLayerTimerInfo(input).elapsed, 0);
    input.position = '70000';
    assert.equal(scope.getLayerTimerInfo(input).timeLeft, 0);
});

test('a list whose media name mentions OUTPUT or Mix still uses its own timing, even when empty', () => {
    const scope = timerScope();
    Object.assign(scope.vMixInputs[1], {type: 'VideoList', title: 'OUTPUT Mix 2.mp4'});
    const info = scope.getLayerTimerInfo(scope.vMixInputs[1]);
    assert.equal(info.elapsed, 10000);
    assert.equal(info.timeLeft, 80000);
    assert.equal(info.mediaTitle, 'OUTPUT Mix 2.mp4');
    assert.equal(info.className.includes('timerOutputMix'), false);
    scope.vMixInputs[1].duration = '0';
    assert.equal(scope.getLayerTimerInfo(scope.vMixInputs[1]), undefined);
});
