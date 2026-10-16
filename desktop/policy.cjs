/* Keep application resources offline; only vMix API traffic may leave the app origin. */
const {addressSpace} = require('../public/js/connection');

function localDevice(url) {
    return !!addressSpace(url.href) || /^[a-z0-9-]+$/i.test(url.hostname);
}
function allowRequest(raw, origin, resourceType) {
    let url;
    try { url = new URL(raw); } catch(_) { return false; }
    if(url.username || url.password) return false;
    if(url.href === 'about:blank') return true;
    if(url.protocol === 'data:') return resourceType === 'image';
    if(url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if(url.origin === origin) return true;
    return localDevice(url) && /^\/api\/?$/i.test(url.pathname);
}
function appPage(raw, origin) {
    try {
        const url = new URL(raw);
        return url.origin === origin && !url.username && !url.password && /\/(?:config|index|viewer|guide(?:\.(?:en|es))?|home|en|es|privacy(?:\.(?:en|es))?|player)\.html$/.test(url.pathname);
    } catch(_) { return false; }
}
function externalLink(raw) {
    try {
        const url = new URL(raw);
        return !url.username && !url.password && (url.protocol === 'https:' || url.protocol === 'http:' && localDevice(url) && /^\/api\/?$/i.test(url.pathname));
    } catch(_) { return false; }
}
module.exports = {allowRequest, appPage, externalLink};
