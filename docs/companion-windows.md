# Application Windows hors ligne

`OpenMultiview-Offline.exe` est la version Windows complète d’OpenMultiview.
Elle embarque Electron, Chromium, Node.js, l’interface, les images, les langues
et le guide. Elle fonctionne sans connexion Internet, sans Node.js installé
et sans navigateur externe pour utiliser l’application.

Le lanceur `scripts/start-openmultiview.cmd` sert uniquement au lancement
depuis les sources avec Node.js. L’exécutable embarque déjà son serveur.
Les fichiers de `deploy/docker/` proposent un hébergement statique distinct.

vMix doit être ouvert et accessible sur le PC ou le réseau local pour lire ses
sources et appliquer les dispositions. L’application ne télécharge aucun
composant au démarrage. Les seuls appels réseau automatiques autorisés servent
à son serveur local et à l’API vMix sur le réseau local. Les liens externes de
documentation restent facultatifs et s’ouvrent sur demande.

## Utilisation

1. Lancez `OpenMultiview-Offline.exe` par double-clic sur le PC vMix.
2. La configuration s’ouvre dans la fenêtre de l’application.
3. Choisissez l’adresse et le port vMix, puis appliquez une disposition.
4. Les inputs HTML créés dans vMix utilisent les pages locales embarquées,
   habituellement sur `http://127.0.0.1:8090/index.html`.
5. Gardez l’application active pendant l’utilisation des inputs HTML.

Fermer la fenêtre conserve l’application et la synchronisation près de
l’horloge Windows. Le menu de cette icône permet de rouvrir l’application ou
de quitter. Le guide s’ouvre aussi dans une fenêtre intégrée, hors ligne.
Une seconde ouverture de l’exécutable ramène la fenêtre existante au premier
plan. Si l’ancien compagnon occupe déjà le port 8090, quittez-le avant de
lancer la nouvelle application.

## Réglages et modèles

Les modèles personnalisés et les préférences de l’interface sont conservés
dans le profil persistant de l’application :
`%LOCALAPPDATA%/OpenMultiview/desktop`.

La configuration partagée avec les navigateurs vMix reste dans
`%LOCALAPPDATA%/multiview-vmix`. Une mise à jour conserve ces deux dossiers.
Le serveur écoute uniquement sur `127.0.0.1`.

Le profil de l’application est distinct de Chrome et du site GitHub Pages.
Les modèles sauvegardés dans Chrome ne sont pas transférés automatiquement.
Une URL de rappel permet de retrouver une configuration ; remplacez l’adresse
du site par l’adresse locale en conservant ses paramètres et son fragment.

## Développement et construction

Sur Windows x64, avec Node.js 22 ou ultérieur et Internet pour télécharger les
dépendances de construction :

```powershell
npm ci
npm run desktop
npm run build:desktop
```

Le résultat portable est `release/desktop/OpenMultiview-Offline.exe`, accompagné
de son empreinte SHA-256. Tous les composants sont inclus dans ce fichier.
Le workflow **Application Windows hors ligne** construit et teste le même
artefact. L’ancienne commande `npm run build:companion` reste un alias du build.
Si une version ouverte verrouille le fichier de sortie, définissez
`$env:MULTIVIEW_RELEASE_NAME = 'desktop-update'` avant la construction et les tests
pour utiliser `release/desktop-update/`.
L’exécutable produit est non signé ; la signature d’une distribution publique
nécessite un certificat de signature de code.

## Vérification

```powershell
node scripts/test-desktop.cjs --dev
node scripts/test-desktop.cjs
node scripts/test-desktop.cjs --portable
```

Les tests ouvrent un renderer caché et isolé, avec le serveur local embarqué.
Ils vérifient les scripts et les dispositions, l’enregistrement d’un modèle,
sa présence après un redémarrage complet, le blocage des requêtes Internet et
l’arrêt du serveur à la fermeture. Node.js est retiré du chemin système durant
le lancement de la version empaquetée. Aucune commande n’est envoyée à vMix.
