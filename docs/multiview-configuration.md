# Configuration du multiview

## Thème de chaque écran

Dans **Disposition → Le style de cet écran**, choisissez **Classique** pour
conserver l’habillage historique, ou **OpenMultiview** pour les bandeaux bleu
nuit, les libellés menthe/corail et les repères Preview/Program de l’accueil.
Le changement est envoyé immédiatement aux pages connectées de cet écran.
Il conserve les réglages de texte et de vumètre et les couleurs personnalisées
des layers. Chaque écran peut utiliser un thème différent.

Le thème est enregistré dans les modèles, le compagnon local et les URL de
rappel (`Theme` et `Config`). Les anciens liens sans thème conservent le rendu
classique, y compris le réglage audio historique des sorties.

## Démarrage sur le PC vMix

Avec Node.js installé, lancer dans le dossier du projet :

```powershell
node server.js
```

Ouvrir `http://127.0.0.1:8090/config.html` dans Chrome ou Edge. Le serveur local synchronise les pages même lorsque vMix utilise son propre navigateur. Il doit rester lancé pendant l’utilisation ; le relancer après un redémarrage du PC. Les configurations sont conservées dans `%LOCALAPPDATA%/multiview-vmix`, indépendamment du dossier du projet. `MULTIVIEW_PORT` et `MULTIVIEW_DATA_DIR` permettent de changer le port et le dossier de sauvegarde.

Les pages servies par un serveur statique local, par exemple `http://127.0.0.1:5500`, détectent aussi automatiquement ce serveur sur le port 8090. Elles peuvent garder leurs URL actuelles. Les pages de configuration et d’affichage partagent les réglages par le serveur, même avec des profils navigateur distincts. Le serveur reste accessible uniquement sur le PC. Après une modification des fichiers, recharger la configuration puis utiliser « Actualiser dans vMix » dans la carte du layer HTML pour recharger cette page. Le bandeau « Synchronisation locale active » confirme la connexion au serveur ; « Serveur de synchronisation requis » ou « Synchronisation interrompue » signale une liaison absente.

La configuration utilise des styles indépendants de l’affichage multiview. Le sélecteur d’écran est en haut, et cinq onglets organisent les réglages : « Disposition », « Sources & layers », « Horloge & infos », « Connexion » et « Sauvegarde & URL ». Les onglets restent accessibles pendant le défilement. Les noms complets des sources et des entrées sont affichés dans la liste et dans le détail du layer ; le plan permet aussi de sélectionner une vignette. Sur une petite fenêtre, les panneaux se disposent verticalement.

1. Choisir un identifiant de PC, l’adresse et le port API vMix, puis enregistrer la connexion.
2. Régler le nombre d’écrans (de 1 à 32). Configurer chaque écran via le sélecteur « Écran à configurer ».
3. Vérifier que les caméras, médias et sorties PGM / PVW à afficher existent dans vMix. Dans « Disposition », la sélection « Sources du preset » est facultative : vide, elle laisse le système choisir les sources ; cochée, elle définit les vignettes souhaitées. La recherche filtre les sources par nom, numéro ou ID. Une sélection plus grande que le preset est acceptée : pour un Quad avec dix sources sélectionnées, les quatre premières sont utilisées et les layers en trop sont désactivés.
4. Cliquer un preset. Le système crée et configure les entrées multiview, les layers et la page web nécessaires. Les entrées créées sont conservées et réutilisées par ID lors des constructions suivantes. Une entrée de regroupement existante peut être réutilisée lorsqu’elle appartient uniquement à cet écran.
5. Vérifier le statut « Page connectée · vMix OK ». Il confirme que la page est ouverte, qu’elle reçoit les réglages et qu’elle récupère des vignettes depuis l’API. Les commandes de placement nécessitent vMix 27 ou ultérieur.
6. Choisir l’habillage de chaque layer : texte sur l’image, au-dessus ou en dessous ; fond activé ou transparent ; vumètre dans l’image ou à côté. Avec un texte sans fond, le tally colore le texte. Augmenter l’espacement du modèle si les habillages extérieurs ont besoin de place.
7. Enregistrer le preset vMix pour conserver également les entrées créées et leurs IDs. Les URL de rappel restent disponibles pour ouvrir les affichages séparément ou ajouter leurs entrées navigateur manuellement.

Une source de type Output, ou nommée OUTPUT / PGM / PROGRAMME, utilise les niveaux stéréo du Master. La mention `BUS A`, `BUS B` (jusqu’à G) dans le nom de l’input prend priorité et sélectionne ce bus, y compris pour un autre input. L’ancien nom `PGM+A` reste accepté. Le mute correspond au Master ou au bus choisi. Les autres inputs utilisent leur propre audio. Un bus absent de l’API affiche un vumètre silencieux et est signalé dans le détail du layer, sans reprendre les niveaux d’un autre bus.

Dans les anciennes configurations sans `PC` ni `Config`, les vumètres OUTPUT / PGM sont masqués par défaut. Un réglage `vu: true` explicite reste respecté, avec le Master ou le bus indiqué dans le nom. Cette préférence est conservée dans les URL de rappel et lors de l’import dans la configuration ; les vumètres des autres sources gardent leur comportement habituel.

Activer « Décompte vidéo / infos liste » pour afficher le temps restant d’un média et son indicateur de boucle. Pour une source `VideoList`, l’habillage ajoute le titre renvoyé par vMix et le temps écoulé, comme `player.html`. Ces informations suivent aussi la liste lorsqu’elle passe sur OUTPUT / PGM, un Mix ou une source Virtual. Le changement de média met les informations à jour ; une caméra ou une liste vide les masque. Le décompte conserve sa taille réduite et les vumètres restent contrôlés par leur réglage indépendant.

Les URL de rappel à copier embarquent les paramètres de tous les écrans, y compris l’adresse vMix. Elles conservent aussi le format ancien `Inputs=key:ID-A,key:ID-B&Settings=…&MaskSettings=…`, correspondant à l’écran choisi, pour les clients qui ne lisent pas `Config`. `IP` et `Port` rappellent la connexion vMix ; `PC`, `Screen` et `Config` ajoutent le contrôle et le rappel de tous les écrans dans la nouvelle version. Quand le serveur local est actif, la source HTML automatique utilise les mêmes paramètres de compatibilité, associés au PC et à l’écran, sans répéter le `Config` complet : la configuration est enregistrée sur ce serveur avant son chargement. Pour un multiview automatique réparti en groupes, `Inputs` référence directement les groupes vidéo et `MaskSettings` masque leurs layers inutilisés. Les URL complètes restent disponibles pour un rappel portable, même sans stockage navigateur.

Un écran associé à `PC` retrouve les derniers réglages enregistrés pour cet identifiant. Les anciennes URL sans `PC` ni `Config` affichent leurs propres sources et réglages, sans recevoir la configuration « régie » ni l’écraser. Le lien « Configuration » importe ces paramètres sous un identifiant distinct ; ajouter un `PC` explicite permet ensuite de relier la configuration et les affichages. Les anciennes URL `Input`, `Inputs`, `Input2`, `Settings` et `MaskSettings` restent utilisables, notamment `?Input=key:IDENTIFIANT-VMIX`, `?Inputs=key:ID-A,key:ID-B` et les numéros d’entrée. Les masques anciens enregistrés sous forme de classes CSS restent lus. Les réglages de layers existants basés sur le numéro de source restent lus ; les nouveaux réglages utilisent son identifiant stable.

Dans « Sauvegarde & URL », le bouton « Copier l’URL » récupère l’adresse complète sans l’afficher au milieu des réglages. « Voir l’URL complète » ouvre un champ lisible et sélectionnable. Le bouton « Ouvrir cet écran » en haut de page ouvre directement l’écran sélectionné.

## Presets de disposition

Les presets 1 à 8 reprennent les dispositions des références :

Chaque écran est au format 16:9, et chaque vignette vidéo conserve aussi ce format. Les aperçus affichent le même cadrage et le même espacement que les positions appliquées dans vMix. Les grilles sont regroupées sans espace ajouté entre les rangées : pour 6 sources, les deux rangées de trois vidéos sont centrées verticalement ; pour 12 sources, les trois rangées de quatre vidéos sont centrées. Les régions inutilisées restent sur les bords afin de préserver les proportions. Les dispositions déjà mémorisées gardent leurs positions jusqu’à l’application explicite d’un preset.

| Preset | Disposition | Vignettes vidéo |
| --- | --- | --- |
| 1 | PVW / PGM en haut, 8 sources en dessous | 10 |
| 2 | PGM / PVW à gauche, 8 sources à droite | 10 |
| 3 | PVW / PGM en haut, 6 sources en dessous | 8 |
| 4 | PGM / PVW à gauche, 6 sources à droite | 8 |
| 5 | Grand PGM et 5 sources | 6 |
| 6 | Grille de 8 sources et PGM en bas à droite | 9 |
| 7 | Grand PGM en haut à gauche et 12 sources autour | 13 |
| 8 | Grand PVW en haut à droite et 12 sources autour | 13 |

Chaque preset s’applique à l’écran sélectionné. Un preset ne fixe pas le nombre d’écrans. Les layers dont l’entrée porte un nom PGM / Programme ou PVW / Preview sont placés dans les zones correspondantes. Si ces noms ne sont pas trouvés, l’ordre des sources et des layers sert d’affectation.

Des grilles de 12 et 16 sources sont aussi disponibles pour les écrans répartis sur plusieurs entrées vMix.

Les presets 7 et 8 remplissent une grille de quatre colonnes et quatre rangées : la grande vignette occupe quatre cases, les douze autres une case chacune. Leurs treize vues sont réparties automatiquement dans deux groupes vidéo de dix et trois layers, avec la source HTML au layer 10 de l’entrée principale.

Un écran peut réunir plus de dix vignettes à partir de plusieurs entrées vMix, chacune limitée à dix layers. Vous pouvez sélectionner toutes les entrées contributrices ou seulement l’entrée qui les regroupe. Les références imbriquées ne créent pas de doublons. Les positions des regroupements sont prises en compte dans les cadres des vignettes ; les commandes de placement ciblent les layers vidéo finaux, avec des coordonnées corrigées pour leur parent.

Les entrées PGM / PVW et les sorties Mix ou Virtual restent des vignettes, même si elles contiennent des layers, sauf lorsqu’elles sont explicitement sélectionnées comme source multiview.

## Entrées automatiques et connexion des pages

Le layer 10 de l’entrée principale de chaque écran est toujours réservé à sa source HTML, à zoom 100 % et position centrée. Il est activé au-dessus des vidéos et exclu de la sélection des sources vidéo. Pour quatre vignettes, les layers 1 à 4 contiennent les vidéos, les layers 5 à 9 sont désactivés et le layer 10 contient la page web. Pour dix vignettes, un groupe vidéo supplémentaire est placé au layer 1 de l’entrée principale. Pour seize vignettes, deux groupes vidéo transparents contiennent dix et six sources, puis l’entrée principale les regroupe aux layers 1 et 2, avec sa page web au layer 10. Les groupes vidéo peuvent utiliser leurs dix layers ; chaque écran possède une seule source HTML dans son entrée principale. Aucun input ne dépasse dix layers.

« Sources & layers » affiche une carte dédiée au layer 10 avec l’entrée HTML, son ID et son état. À l’ouverture de la configuration, les écrans automatiques dont la source HTML manque ou occupe un autre layer sont corrigés dès la connexion à vMix. Une source HTML absente est créée ; une entrée existante est réutilisée. La source est attachée au layer 10 avant le chargement de l’URL. Les IDs, les sources vidéo, leurs positions et leurs désactivations sont conservés. Si la correction est interrompue, utiliser « Créer la source HTML », « Recharger la source HTML » ou « Rétablir le layer 10 » dans cette carte. L’ID créé est enregistré immédiatement pour éviter les doublons lors d’une reprise. Pour une configuration construite manuellement, affecter la source HTML contenant l’URL de l’écran au layer 10 de son input principal.

Les groupes inutilisés sont conservés lorsque vous passez à un preset plus petit. Leurs layers sont désactivés et exclus de l’habillage. Revenir à un preset plus grand réutilise les mêmes IDs. Les IDs sont mémorisés immédiatement à leur création, y compris en cas d’interruption. Si une entrée a été supprimée de vMix, sa recréation reçoit un nouvel ID attribué par vMix ; les réglages sont reliés à cet ID automatiquement. Les entrées qui existent encore conservent leur ID.

Dans « Sources & layers », sélectionner un layer puis choisir « Source du layer » pour lui affecter une entrée vidéo directement dans vMix. L’entrée multiview garde son ID et le layer conserve sa position. « Aucune source » désactive le layer et le retire du plan et de l’affichage. Pour le réactiver, ouvrir la liste repliée « Layers désactivés », sélectionner son numéro et lui affecter une source. Les layers de regroupement et de navigateur ne sont pas proposés comme vignettes. Les affectations, y compris les layers désactivés, sont conservées dans les modèles nommés et les URL de rappel.

Les IDs des inputs, les affectations des sources et les positions prévues sont reliés à la configuration pendant la construction, avant la création de la source HTML. Les sources restent modifiables si vMix n’a pas encore renvoyé les layers dans son XML ou si la construction a été interrompue. Un layer prévu mais absent de la réponse porte la mention « En attente de vMix ». Les inputs de regroupement vides sont exclus des sources vidéo. Quand le XML contient les layers sans coordonnées, les positions mémorisées servent à placer l’habillage ; les coordonnées explicitement renvoyées par vMix restent prioritaires. La construction attend la confirmation des affectations dans l’API avant d’annoncer sa réussite.

Le suivi des pages fonctionne avec le serveur local entre Chrome et le navigateur vMix, ou via BroadcastChannel et le stockage local pour un même profil navigateur en hébergement statique. Chaque page envoie un signal toutes les deux secondes. Une fermeture ou une perte de connexion est détectée au plus tard après douze secondes. Le statut différencie une page absente, une page présente sans API vMix, une page sans vignette et une page à jour avec vMix connecté.

La configuration défile verticalement jusqu’aux réglages et aux URL ; l’affichage multiview conserve son cadrage fixe.

## Modèles personnalisés

Dans « Disposition », l’espacement entre les vignettes se règle de 0 à 20 % pour chaque écran. Les nouveaux modèles utilisent 2 % par défaut. Choisir l’espacement avant d’appliquer un modèle, ou cliquer « Appliquer l’espacement » pour modifier un modèle déjà construit. Ce bouton conserve les centres des vignettes, les sources, les IDs et les layers désactivés. Le zoom reste uniforme et les vignettes restent en 16:9. Les aperçus des presets suivent l’espacement choisi. Les configurations existantes conservent leur placement jusqu’à une modification explicite. Les anciens modèles automatiques sans réglage d’espacement sont reconnus avec leur ancienne marge de 13 %. L’espacement choisi et le placement appliqué sont mémorisés dans les modèles nommés et les URL de rappel.

Après avoir positionné vos layers dans vMix, cliquer « Mémoriser les positions vMix actuelles » pour chacun des écrans, puis donner un nom et cliquer « Mémoriser les écrans ». Le rappel restaure l’habillage et applique les positions mémorisées à vMix. Les modèles nommés sont conservés dans le navigateur de configuration, par identifiant de PC ; les URL restent transportables.

Le placement utilise un zoom uniforme pour préserver les proportions. Un modèle personnalisé avec des zooms X et Y différents peut conserver l’habillage mais ne peut pas appliquer automatiquement ces positions : un message l’indique. Le choix d’un preset de disposition affecte les sources et construit les layers. Le rappel d’un modèle personnalisé réaffecte les sources, réapplique les désactivations et restaure ses positions mémorisées ; les entrées existantes gardent leur ID et les entrées automatiques manquantes sont reconstruites si nécessaire. Si une commande échoue au milieu du rappel, les commandes déjà exécutées restent appliquées ; corriger la connexion et relancer le rappel.

Les URL de navigateur restaurent l’habillage. Pour retrouver également le placement vidéo après la fermeture de vMix, enregistrer le preset vMix après l’application d’un modèle, ou rappeler le modèle dans la page de configuration.

## Hébergement public et statique

`config.html` et `index.html` restent disponibles dans l’image Docker/nginx. Sans le serveur local, le contrôle en direct repose sur BroadcastChannel et le stockage local : les pages doivent partager le même site et le même profil navigateur. Chrome et le navigateur intégré à vMix nécessitent le serveur local pour communiquer. Le serveur écoute uniquement sur `127.0.0.1`, pour un contrôle sur le PC concerné.

Le site statique peut être partagé publiquement. Chaque visiteur interroge son propre vMix : `127.0.0.1` désigne son ordinateur, et les réglages restent dans son navigateur. Partager l’adresse du site ne partage pas le vMix ni les réglages d’un autre utilisateur. Chaque utilisateur doit conserver ses propres IDs de sources et URL de rappel. Une mise à jour du site modifie toutefois la version chargée par tous ; les anciennes URL restent compatibles.

Le site officiel `https://vincentberry.github.io/openmultiview/` détecte le compagnon sur le port 8090. Le serveur accepte cette origine HTTPS et les pages locales ; il refuse les autres et reste lié à `127.0.0.1`. Le conteneur nginx ne fournit pas les API de synchronisation : chaque utilisateur lance son compagnon sur son PC. Les URL complètes restent utilisables séparément sur un hébergement statique. Voir [la publication publique](publication.md) pour autoriser un domaine personnalisé.

L’accès d’une page publique à l’API locale dépend aussi du navigateur et de ses autorisations. Utiliser HTTPS pour le site ; Chrome peut demander l’autorisation d’accès au réseau local. Les autres navigateurs et le navigateur intégré à vMix peuvent appliquer des restrictions différentes. Voir la [documentation Chrome sur l’accès au réseau local](https://developer.chrome.com/blog/local-network-access?hl=fr).

La page reste un habillage transparent ; les vidéos sont fournies par les layers de vMix. Le plan de disposition de la configuration est un schéma, pas un retour vidéo.

## Vérification

```powershell
node --test tests/*.test.js
```

Référence des commandes : [vMix Shortcut Function Reference](https://download.vmix.com/help29/ShortcutFunctionReference.html).
