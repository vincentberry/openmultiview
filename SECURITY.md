# Security policy

Please report vulnerabilities privately through
[GitHub's security advisory form](https://github.com/vincentberry/openmultiview/security/advisories/new).
Do not publish exploit details or production data in a public issue.

Include the affected version, reproduction steps, potential impact and a minimal
example using test sources. Do not send credentials, private keys or client
production configurations. Reports in French or English are welcome.

The supported code is the current `main` branch. There is no guaranteed response
time; this is a community project.

The companion must stay bound to loopback. It accepts only local web origins and
explicitly configured HTTPS origins for synchronization, and stores settings on
the local PC. vMix's API has its own access settings. Recall URLs are portable
configuration data, not secrets protected by authentication.
