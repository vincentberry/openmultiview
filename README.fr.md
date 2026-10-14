# OpenMultiview

**Un multiview open source pour les régies vMix.** Presets 16:9, plusieurs écrans,
tally, audio et URL de rappel, gratuitement et sans compte.

[Site public](https://vincentberry.github.io/openmultiview/) ·
[Guide de démarrage](https://vincentberry.github.io/openmultiview/guide.html) · [Español](README.es.md) ·
[English](README.md) · [Licence MIT](LICENSE)

![OpenMultiview](assets/social-card.jpg)

vMix fournit les vidéos via ses layers. OpenMultiview compose leur disposition
et ajoute un habillage HTML transparent. Il crée les entrées supplémentaires
quand un écran utilise plusieurs groupes de vidéos, et conserve les IDs des
inputs qui existent déjà. Le layer 10 de chaque entrée principale reste réservé
à la source HTML.

## Démarrer

Prérequis : vMix 27 ou ultérieur pour les commandes de layers, Node.js 22 ou
ultérieur, et l’API vMix accessible sur le PC (port 8088 par défaut).

1. Installez [Node.js](https://nodejs.org/en/download) si nécessaire.
2. [Téléchargez le ZIP](https://github.com/vincentberry/openmultiview/archive/refs/heads/main.zip)
   et extrayez-le.
3. Lancez `start-openmultiview.cmd` et gardez la fenêtre ouverte.
4. Ouvrez `http://127.0.0.1:8090/config.html` ou la configuration du site public.
5. Choisissez l’identifiant du PC, la connexion vMix et le nombre d’écrans, puis
   appliquez un preset.
6. Enregistrez le preset vMix et conservez les URL de rappel.

Vous pouvez aussi lancer `node server.js` dans le dossier du projet. Aucune
installation de dépendances npm n’est nécessaire. Les configurations sont
conservées dans `%LOCALAPPDATA%/multiview-vmix`.

## Site public, régie locale

Les réglages sont conservés dans votre navigateur et par le compagnon de votre
PC. Le site n’a pas de base centrale de configurations. Le compagnon relie
Chrome et le navigateur intégré à vMix ; autorisez l’accès au réseau local si le
navigateur le demande. Les pages locales restent disponibles en cas de blocage
depuis HTTPS.

Les anciens liens `Inputs`, `Settings` et `MaskSettings` restent acceptés. Une
URL complète transporte sa configuration. Les gros réglages sont placés après
`#` pour éviter « URI Too Long » ; cette partie n’est pas envoyée au serveur.
Conservez le lien entier pour retrouver tous les écrans après redémarrage.
Les paramètres avant `#` peuvent figurer dans les journaux de l’hébergeur.
L’accueil public présente une simulation, pas un retour vidéo réel.

## Documentation et contributions

Dans **Disposition → Le style de cet écran**, choisissez le thème classique ou
le thème OpenMultiview de l’accueil : bandeaux bleu nuit, preview menthe et
programme corail. Chaque écran conserve son thème dans les modèles et les URL.
Les anciens liens gardent leur rendu classique.

Le sélecteur de l’en-tête propose **Français, English et Español** sur le
site et dans la configuration. Le choix est mémorisé dans ce navigateur et
les URL peuvent rappeler la langue via `Lang=en` ou `Lang=es`. Les noms des
sources et leurs IDs vMix sont conservés.

- [Guide complet de configuration](docs/multiview-configuration.md)
- [Hébergement public et référencement](docs/publication.md)
- [Développement et architecture](README.md#development)
- [Contribuer](CONTRIBUTING.md)
- [Signaler une vulnérabilité](SECURITY.md)

Vérification : `npm test`. Construction du site statique : `npm run build`.

Projet communautaire distribué sous [licence MIT](LICENSE). Les notices de
tiers sont conservées dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
OpenMultiview est indépendant de vMix, qui reste un logiciel distinct avec sa
propre licence.
