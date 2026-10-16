/* Integration test of the real offline renderer and embedded server. */
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname, '..');

async function main() {
    const dev = process.argv.includes('--dev');
    const portable = process.argv.includes('--portable');
    const releaseName = process.env.MULTIVIEW_RELEASE_NAME || 'desktop';
    if(!/^[a-z0-9_-]+$/i.test(releaseName)) throw new Error('Invalid release directory name.');
    const executable = dev ? require('electron') : path.join(root, 'release', releaseName, portable ? 'OpenMultiview-Offline.exe' : 'win-unpacked/OpenMultiview.exe');
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'openmultiview-offline-'));
    const reserve = net.createServer();
    await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
    const port = reserve.address().port;
    await new Promise(resolve => reserve.close(resolve));
    const reportPath = path.join(temp, 'report.json');
    const environment = {...process.env, MULTIVIEW_PORT: String(port), MULTIVIEW_DATA_DIR: path.join(temp, 'bridge'), MULTIVIEW_DESKTOP_DATA_DIR: path.join(temp, 'profile'),
        MULTIVIEW_SMOKE_REPORT: reportPath, MULTIVIEW_SMOKE_SCREENSHOT: path.join(temp, 'offline-app.png'), MULTIVIEW_SMOKE_MARKER: 'smoke-' + Date.now()};
    delete environment.ELECTRON_RUN_AS_NODE;
    delete environment.NODE_OPTIONS;
    delete environment.NODE_PATH;
    environment.PATH = path.join(process.env.WINDIR, 'System32');
    let report;
    for(const phase of ['save', 'verify']) {
        await fs.rm(reportPath, {force: true});
        const child = spawn(executable, dev ? [root, '--smoke-test'] : ['--smoke-test'], {env: {...environment, MULTIVIEW_SMOKE_PHASE: phase}, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
        let output = '';
        child.stdout.on('data', data => output += data);
        child.stderr.on('data', data => output += data);
        const exitCode = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { child.kill(); reject(new Error('Offline app test timed out. ' + output)); }, 60000);
            child.once('error', error => { clearTimeout(timer); reject(error); });
            child.once('exit', code => { clearTimeout(timer); resolve(code); });
        });
        report = JSON.parse(await fs.readFile(reportPath, 'utf8').catch(() => JSON.stringify({error: output})));
        if(exitCode !== 0 || !report.passed || !dev && !report.packaged) throw new Error(JSON.stringify(report));
    }
    if(!report.profileSurvivedRestart) throw new Error('Persistent preset was not checked after restart');
    try {
        await fetch('http://127.0.0.1:' + port + '/companion-api', {signal: AbortSignal.timeout(1000)});
        throw new Error('Embedded server did not close');
    } catch(error) { if(error.message === 'Embedded server did not close') throw error; }
    console.log(JSON.stringify({...report, screenshot: path.join(temp, 'offline-app.png')}, null, 2));
}
if(require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
