const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const {build} = require('electron-builder');
const {publicFiles} = require('./build-public.cjs');
const root = path.resolve(__dirname, '..');
const releaseName = process.env.MULTIVIEW_RELEASE_NAME || 'desktop';
if(!/^[a-z0-9_-]+$/i.test(releaseName)) throw new Error('Invalid release directory name.');
const output = path.join(root, 'release', releaseName);

async function main() {
    if(process.platform !== 'win32') throw new Error('La version Windows se construit sur Windows.');
    const targets = await build({
        projectDir: root,
        config: {
            appId: 'io.github.vincentberry.openmultiview', productName: 'OpenMultiview',
            directories: {output}, asar: true, npmRebuild: false,
            files: [...publicFiles, 'assets/social-card.html', 'server.js', 'desktop/main.cjs', 'desktop/policy.cjs', 'package.json'],
            extraMetadata: {main: 'desktop/main.cjs'},
            win: {target: [{target: 'portable', arch: ['x64']}], icon: 'assets/openmultiview-logo.png', signExecutable: false},
            portable: {artifactName: 'OpenMultiview-Offline.exe'}
        }
    });
    for(const file of targets.filter(name => name.endsWith('.exe'))) {
        const bytes = await fs.readFile(file);
        await fs.writeFile(file + '.sha256', crypto.createHash('sha256').update(bytes).digest('hex') + '  ' + path.basename(file) + '\n');
        console.log('Application hors ligne : ' + file + ' (' + (bytes.length / 1024 / 1024).toFixed(1) + ' Mo)');
    }
}
if(require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
