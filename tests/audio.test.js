const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/js/multiview-model');

const buses = {master: {meterF1: .8, meterF2: .4, muted: 'False'},
    busA: {meterF1: .02, meterF2: .06, muted: 'False'}, busB: {meterF1: .1, meterF2: .9, muted: 'True'}};
const level = value => Math.max(0, Math.min(100, (20 * Math.log10(value) + 60) / 60 * 100));

test('meter heights match the player dBFS scale from -60 dB to 0 dB', () => {
    for(const [amplitude, expected] of [[1,100], [.1,200/3], [.01,100/3], [.001,0], [0,0], [2,100]]) {
        const result = M.audioLevels({title:'CAM 1',meterF1:amplitude,meterF2:amplitude});
        assert.ok(Math.abs(result.audioL - expected) < 1e-9);
        assert.ok(Math.abs(result.audioR - expected) < 1e-9);
    }
});

test('OUTPUT and PGM use Master; a written BUS takes precedence and legacy PGM+A remains readable', () => {
    for(const input of [{title:'Output'}, {title:'PGM'}, {title:'PROGRAMME principal'}, {type:'Output',title:'Retour antenne'}]) assert.equal(M.audioRoute(input), 'master');
    for(const [title, route] of [['OUTPUT BUS A','busA'], ['PGM BUS B','busB'], ['Offline - VI bus a','busA'], ['BUS-B','busB'], ['PGM+A','busA'], ['PGM+G','busG']]) assert.equal(M.audioRoute({title}), route);
    assert.equal(M.audioRoute({title:'PGM',shortTitle:'BUS B'}), 'busB');
    assert.equal(M.audioRoute({title:'CAM 1'}), 'input');
    assert.equal(M.audioRoute({title:'BUS AB'}), 'input');
});

test('a silent or audio-less Output displays the Master levels and the Master mute state', () => {
    const result = M.audioLevels({type:'Output',title:'Output',muted:'True',meterF1:0,meterF2:0}, buses);
    assert.equal(result.audioSource, 'master');
    assert.equal(result.audio, true);
    assert.equal(result.audioAvailable, true);
    assert.equal(result.muted, false);
    assert.equal(result.audioL, level(.8));
    assert.equal(result.audioR, level(.4));
    assert.equal(M.audioLevels({title:'PGM'}, {...buses,master:{...buses.master,muted:'True'}}).muted, true);
});

test('BUS A and BUS B use their own stereo levels and mute states', () => {
    const a = M.audioLevels({title:'OUTPUT BUS A',meterF1:1,meterF2:1,muted:'True'}, buses);
    const b = M.audioLevels({title:'PGM BUS B',meterF1:1,meterF2:1,muted:'False'}, buses);
    assert.equal(a.audioL, level(.02)); assert.equal(a.audioR, level(.06)); assert.equal(a.muted, false);
    assert.equal(b.audioL, level(.1)); assert.equal(b.audioR, level(.9)); assert.equal(b.muted, true);
    assert.notEqual(a.audioL, M.audioLevels({title:'PGM'}, buses).audioL);
});

test('an unavailable bus goes silent without retaining another input or Master meter', () => {
    M.audioLevels({title:'PGM BUS A'}, buses);
    const result = M.audioLevels({title:'PGM BUS B'}, {master:buses.master});
    assert.equal(result.audioSource, 'busB');
    assert.equal(result.audio, true);
    assert.equal(result.audioAvailable, false);
    assert.equal(result.audioL, 0); assert.equal(result.audioR, 0);
    assert.equal(result.muted, false);
});

test('ordinary inputs keep their own audio and silence or invalid XML never produces NaN', () => {
    const result = M.audioLevels({title:'CAM 1',meterF1:.3,meterF2:.5,muted:'True'}, buses);
    assert.equal(result.audioSource, 'input');
    assert.equal(result.audioL, level(.3)); assert.equal(result.audioR, level(.5)); assert.equal(result.muted, true);
    assert.equal(M.audioLevels({title:'Image'}, buses).audio, false);
    for(const value of [0,-1,null,undefined,'',NaN,Infinity,'bad']) {
        const silent = M.audioLevels({title:'PGM'}, {master:{meterF1:value,meterF2:value}});
        assert.equal(silent.audioL, 0); assert.equal(silent.audioR, 0);
    }
    assert.equal(M.audioLevels({title:'CAM 1',meterF1:2}, buses).audioL, 100);
});
