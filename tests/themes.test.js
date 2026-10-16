const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/js/multiview-model');

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

test('shared text settings cover existing and future tiles on every screen while preserving media, geometry and other styles', () => {
    const inputs = [
        {key:'root-a', number:1, title:'Screen A', type:'Colour', layers:[{index:0,inputKey:'cam-a'}]},
        {key:'root-b', number:2, title:'Screen B', type:'Colour', layers:[{index:0,inputKey:'cam-b'}]},
        {key:'cam-a', number:3, title:'CAM A', type:'Capture', layers:[]},
        {key:'cam-b', number:4, title:'CAM B', type:'Capture', layers:[]}
    ];
    const config = {version:1, pc:'shared-demo', host:'127.0.0.1', port:'8088', updated:1, screens:[
        {...M.screen(['root-a']), theme:'classic', tiles:[{key:'source-root-a-layer-0',value:{vu:false,enabled:false,programColor:'#aabbcc',titlePosition:'above'}}],
            layout:[{source:'root-a',layer:1,zoomX:50,zoomY:50,panX:0,panY:0}]},
        {...M.screen(['root-b']), theme:'openmultiview'}
    ]};
    const original = M.clone(config), style = {titlePosition:'below',titleBackground:false,titleFontSize:29};
    const next = M.applyTextStyle(config, style, inputs);
    assert.deepEqual(config, original);
    assert.deepEqual(next.textStyle, style);
    assert.equal(next.screens[0].tiles[0].value.enabled,false);
    assert.equal(next.screens[0].tiles[0].value.vu,false);
    assert.equal(next.screens[0].tiles[0].value.programColor,'#aabbcc');
    for(const [index, screen] of next.screens.entries()) {
        assert.deepEqual(screen.inputs,config.screens[index].inputs);
        assert.deepEqual(screen.layout,config.screens[index].layout);
        for(const [key, value] of Object.entries(style)) assert.equal(screen.tiles[0].value[key],value);
        assert.deepEqual(Object.fromEntries(Object.keys(style).map(key=>[key,M.tileDefaultsFor(screen.theme,next.textStyle)[key]])),style);
    }
    const restored = M.unpack(M.pack(next));
    assert.deepEqual(restored.textStyle,style);
    for(const screen of restored.screens) assert.equal({...M.tileDefaultsFor(screen.theme,restored.textStyle),...screen.tiles[0].value}.titleFontSize,29);
    for(const screen of [0,1]) {
        const query=M.urlParameters(M.recallURL('http://localhost/',restored,screen,{inputs}));
        const mask=JSON.parse(query.get('MaskSettings'))[0];
        for(const [key,value] of Object.entries(style)) assert.equal(mask.value[key],value);
    }
    const different=M.changeTheme(next.screens[0].tiles,'classic','openmultiview');
    assert.equal(different[0].value.titlePosition,'below');
    assert.equal(different[0].value.titleFontSize,29);
    assert.equal(M.textStyleFor({}).titleFontSize,22);
});

test('invalid shared text settings are rejected before replacing any screen settings', () => {
    const config={version:1,pc:'demo',host:'127.0.0.1',port:'8088',updated:1,screens:[M.screen()]};
    const style={titlePosition:'below',titleBackground:false,titleFontSize:29};
    for(const invalid of [{...style,titleFontSize:0},{...style,titleFontSize:101},{...style,titleFontSize:NaN},{...style,titlePosition:'unknown'},{...style,titleBackground:'false'},{...style,extra:true}]) {
        assert.throws(()=>M.applyTextStyle(config,invalid),/Réglages du texte invalides/);
        assert.throws(()=>M.validate({...config,textStyle:invalid}),/Réglages du texte invalides/);
    }
    assert.equal(config.textStyle,undefined);
});

test('preview and display tally use the current vMix keys, with program taking priority and the tally switch respected', () => {
    assert.equal(M.tallyState({tally:true},'cam','cam','other'),'preview');
    assert.equal(M.tallyState({tally:true},'cam','other','cam'),'program');
    assert.equal(M.tallyState({tally:true},'cam','cam','cam'),'program');
    assert.equal(M.tallyState({tally:false},'cam','cam','cam'),'');
    assert.equal(M.tallyState({tally:true},'output','cam-a','cam-b'),'');
});
