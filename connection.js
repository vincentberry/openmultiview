/* Browser permission handling shared by API polling and explicit commands. */
(function(root) {
    function addressSpace(href) {
        const host = new URL(href).hostname.toLowerCase();
        if(host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127\./.test(host)) return 'loopback';
        if(/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.endsWith('.local') || /^\[(f[cd]|fe80:)/.test(host)) return 'local';
        return null;
    }
    function createAccess({href, navigator, changed = () => {}}) {
        const page = new URL(href);
        const permissions = {loopback: 'unknown', local: 'unknown'};
        const granular = new Set();
        let requested = false;
        const chrome = /(?:Chrome|Chromium)\/(\d+)/.exec(navigator?.userAgent || '');
        const queryable = page.protocol === 'https:' && chrome && +chrome[1] >= 138 && navigator?.permissions?.query;
        function scope(url) {
            const target = new URL(url, href);
            const space = addressSpace(target.href);
            if(target.origin === page.origin || addressSpace(href) === 'loopback' && space === 'loopback') return null;
            return space;
        }
        async function check(space) {
            if(!queryable) return;
            for(const name of [space === 'loopback' ? 'loopback-network' : 'local-network', 'local-network-access']) {
                try {
                    const status = await navigator.permissions.query({name});
                    if(name !== 'local-network-access') granular.add(space);
                    permissions[space] = status.state;
                    status.addEventListener?.('change', () => { permissions[space] = status.state; changed(); });
                    return;
                } catch(_) { /* Older Chromium and CEF do not expose these names. */ }
            }
        }
        const ready = Promise.all([check('loopback'), check('local')]).then(() => changed());
        return {
            ready, permissions,
            request() { requested = true; },
            state(url) { return permissions[scope(url)] || 'granted'; },
            options(url) { const space = scope(url); return granular.has(space) ? {targetAddressSpace: space} : {}; },
            assertAllowed(url) {
                const permission = this.state(url);
                if(permission !== 'denied' && (permission !== 'prompt' || requested)) return;
                const error = new Error(permission === 'denied' ? 'Le navigateur refuse l’accès à vMix sur ce PC. Autorisez l’accès au réseau local ou aux applications de cet appareil dans les paramètres du site, puis réessayez.' : 'Autorisez OpenMultiview à communiquer avec vMix sur ce PC en cliquant sur « Connecter à vMix ».');
                error.code = 'LOCAL_NETWORK_ACCESS';
                error.permission = permission;
                throw error;
            }
        };
    }
    const api = {addressSpace, createAccess};
    if(typeof module !== 'undefined') module.exports = api;
    else root.MultiviewConnection = api;
})(typeof window === 'undefined' ? globalThis : window);
