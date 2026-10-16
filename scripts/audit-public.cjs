/* Review tracked and new source files, without printing their contents. */
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');

function auditFile(name, bytes) {
    const findings = [];
    if(/(^|\/)(?:\.env(?!\.example$)|[^/]+\.(?:log|pem|pfx|p12)|id_rsa|id_ed25519|credentials)(?:$|\/)/i.test(name)) findings.push('private file');
    if(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
        for(let at = 8; at + 12 <= bytes.length;) {
            const size = bytes.readUInt32BE(at), kind = bytes.toString('ascii', at + 4, at + 8);
            if(['tEXt','iTXt','zTXt','eXIf'].includes(kind)) findings.push('image metadata');
            at += 12 + size;
        }
    } else if(!/\.(?:jpg|ico)$/i.test(name)) {
        const text = bytes.toString('utf8');
        if(/(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text)) findings.push('credential pattern');
        if(/(?:[A-Za-z]:[\\/]Users[\\/][^\s/\\]+|\/home\/[^\s/]+\/)/.test(text)) findings.push('personal filesystem path');
        for(const id of text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi) || []) {
            if(!/^00000000-0000-4000-8000-00000000000[12]$/.test(id)) findings.push('non-synthetic input ID');
        }
        for(const ip of text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || []) {
            if(!/^(?:127\.|0\.0\.0\.0$|198\.51\.100\.|192\.0\.2\.|203\.0\.113\.)/.test(ip)) findings.push('non-example network address');
        }
        if(name.endsWith('.json')) {
            try { const value = JSON.parse(text); if(value && value.version === 1 && value.pc && Array.isArray(value.screens)) findings.push('PC configuration'); } catch (_) {}
        }
    }
    return [...new Set(findings)];
}
function audit() {
    let files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean))]
        .filter(name => fs.existsSync(path.join(root, name)));
    if(!files.length) {
        function walk(directory) {
            return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
                if(['.git','dist','release','node_modules'].includes(entry.name)) return [];
                const file = path.join(directory, entry.name);
                if(entry.isSymbolicLink()) throw new Error('Public audit refuses symbolic links');
                return entry.isDirectory() ? walk(file) : [path.relative(root, file).replaceAll('\\', '/')];
            });
        }
        files = walk(root);
    }
    const failures = files.flatMap(name => auditFile(name, fs.readFileSync(path.join(root, name))).map(reason => ({file: name, reason})));
    for(const failure of failures) console.error(`${failure.file}: ${failure.reason}`);
    console.log(`${files.length} source files reviewed; ${failures.length} findings. Manual review of names and public links is also required.`);
    return failures;
}
if(require.main === module) { if(audit().length) process.exitCode = 1; }
module.exports = {auditFile, audit};
