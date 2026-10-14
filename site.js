/* The public preview is illustrative: it never contacts vMix or the PC bridge. */
(function() {
    const query = new URLSearchParams(location.search);
    const appParameters = ['input', 'inputs', 'input2', 'settings', 'masksettings', 'pc', 'screen', 'config', 'ip', 'port'];
    if([...query.keys()].some(key => appParameters.includes(key.toLowerCase()))) {
        // Static hosts cannot route query parameters; keep legacy index links usable.
        location.replace(new URL('viewer.html' + location.search + location.hash, location.href).href);
        return;
    }
    const screen = document.getElementById('demoScreen');
    if(!screen) return;
    document.querySelectorAll('[data-layout]').forEach(button => {
        button.addEventListener('click', () => {
            screen.dataset.layout = button.dataset.layout;
            document.querySelectorAll('[data-layout]').forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
            document.getElementById('demoCount').textContent = (button.dataset.layout === 'quad' ? 4 : button.dataset.layout === 'grid' ? 16 : 10) + ' VUES · 1 ÉCRAN';
        });
    });
})();
