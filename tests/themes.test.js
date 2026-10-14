const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../multiview-model');

test('per-screen themes round trip with different palettes and custom layer settings', () => {
    const screens = [
        {...M.screen(['root-a']), theme: 'classic', tiles: [{key: 'source-root-a-layer-0', value: {...M.tileDefaultsFor(), vu: false, titlePosition: 'below'}}]},
        {...M.screen(['root-b']), theme: 'openmultiview', tiles: [{key: 'source-root-b-layer-0', value: {...M.tileDefaultsFor('openmultiview'), programColor: '#ad30e1', timer: true, titleBackground: false}}]}
    ];
    const config = {version: 1, pc: 'demo', host: '127.0.0.1', port: '8088', updated: 1, screens};
    const restored = M.unpack(M.pack(config));
    for(const [n, screen] of restored.screens.entries()) {
        assert.equal(screen.theme, screens[n].theme);
        assert.deepEqual({...M.tileDefaultsFor(M.themeFor(screen)), ...screen.tiles[0].value}, screens[n].tiles[0].value);
    }
    assert.throws(() => M.validate({...config, screens: [{...screens[0], theme: 'unknown'}]}), /Thème invalide/);
});

test('old compact configurations without a theme remain classic', () => {
    const config = {version: 1, pc: 'demo', host: '127.0.0.1', port: '8088', updated: 1, screens: [M.screen(['root'])]};
    const packed = M.pack(config);
    packed.s[0] = packed.s[0].slice(0, 8);
    const restored = M.unpack(packed);
    assert.equal(M.themeFor(restored.screens[0]), 'classic');
    assert.equal(M.tileDefaultsFor(M.themeFor(restored.screens[0])).programColor, '#ff0000');
});

test('switching themes replaces inherited colors and preserves custom styles, flags, IDs and legacy masks', () => {
    const tiles = [
        {key: 'source-root-layer-0', value: {...M.tileDefaultsFor(), vu: false, titlePosition: 'above', titleBackground: false}},
        {key: 'source-root-layer-1', value: {previewColor: '#5e88ac', programColor: '#dec234', borderWidth: 8, enabled: false}},
        {key: 'source-root-layer-2', value: 'NameMask'}
    ];
    const original = M.clone(tiles);
    const changed = M.changeTheme(tiles, 'classic', 'openmultiview');
    assert.equal(changed[0].value.previewColor, '#66e5b5');
    assert.equal(changed[0].value.programColor, '#ff7164');
    for(const key of ['vu', 'titlePosition', 'titleBackground']) assert.equal(changed[0].value[key], tiles[0].value[key]);
    assert.deepEqual(changed[1], tiles[1]);
    assert.deepEqual(changed[2], tiles[2]);
    assert.deepEqual(changed.map(t => t.key), tiles.map(t => t.key));
    assert.deepEqual(tiles, original);
    assert.deepEqual(M.changeTheme(changed, 'openmultiview', 'classic'), tiles);
});
