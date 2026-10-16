# Hébergement public et référencement

## Adresses et compatibilité

Le site public est disponible sur GitHub Pages à
`https://vincentberry.github.io/openmultiview/`.
Le projet, le dépôt et l’interface portent le nom **OpenMultiview**. Le dépôt
public commence avec un historique neuf. Les paramètres historiques
`Inputs`, `Settings` et `MaskSettings` restent utilisables.

Dans le bundle statique, l’accueil occupe `index.html` et l’habillage transparent
est copié dans `viewer.html`. Le petit routeur de l’accueil transmet les anciens
paramètres à cette page, sans changer leurs valeurs. nginx effectue ce routage
côté serveur pour `/` et `/index.html`. Le compagnon local conserve le fichier
`index.html` historique pour les affichages et sert l’accueil à `/` sans
paramètres de multiview.

## Construire et publier

```powershell
$env:PUBLIC_URL = 'https://votre-domaine.example/'
npm run build
```

Publier uniquement `dist/`. La construction utilise une liste explicite de
fichiers publics ; le serveur local, les fichiers `.env`, les logs et les
configurations de PC ne sont pas inclus. `PUBLIC_URL` met à jour les adresses
canoniques, Open Graph et sitemap, et ajoute cette origine à la détection du
compagnon dans le JavaScript construit.

Pour un autre domaine, le compagnon doit également l’autoriser :

```powershell
$env:MULTIVIEW_PUBLIC_ORIGINS = 'https://votre-domaine.example'
node server.js
```

Les origines HTTPS officielles sont autorisées par défaut. Les autres origines
sont refusées ; le compagnon reste sur `127.0.0.1`. Il peut être nécessaire
d’autoriser l’accès au réseau local dans Chrome. Les pages locales constituent
le recours si le navigateur intégré à vMix bloque une requête depuis HTTPS.

Le workflow `pages.yml` teste, construit et publie le site sur GitHub Pages à
chaque push sur `main`. Dans un fork, activer Pages avec une source GitHub
Actions avant d’utiliser ce workflow. Les tests Windows/Linux tournent aussi
dans `test.yml`.

## Hébergement Docker facultatif

Le déploiement GitHub Pages utilise directement `npm run build`. Les fichiers
Docker servent à héberger vous-même le site statique et sont regroupés dans
`deploy/docker/` : `Dockerfile`, `docker-compose.yml` et `nginx.conf`.

Depuis la racine du dépôt :

```powershell
docker compose -f deploy/docker/docker-compose.yml up --build -d
```

Cette configuration suppose un réseau Docker externe nommé `web`, partagé
avec votre reverse proxy. Le conteneur expose le port 80 sur ce réseau.
L’image construit `dist/` puis le sert avec nginx ; elle ne remplace pas le
serveur local de l’application Windows pour la synchronisation avec vMix.

## Référencement préparé

L’accueil, le guide et la confidentialité sont disponibles en français,
anglais et espagnol à des adresses distinctes (`en.html`, `es.html`,
`guide.en.html`, etc.). Le HTML est traduit à la construction, avec une
adresse canonique par langue et des liens `hreflang` réciproques, incluant
`x-default`. Le sitemap contient les neuf pages.
Voir [les recommandations de Google sur les versions localisées](https://developers.google.com/search/docs/specialty/international/localized-versions).

L’accueil, le guide et la page de confidentialité disposent de titres,
descriptions et adresses canoniques. L’accueil fournit les données structurées
`WebSite` et `SoftwareApplication`, sans avis ou notes inventés. Une image
Open Graph accompagne les partages. `robots.txt` indique le sitemap XML.

La configuration, le player et les affichages portent `noindex`. Ils ne figurent
pas dans le sitemap. Les moteurs doivent pouvoir lire cette directive : ces
pages ne sont pas bloquées par `robots.txt`. Les API locales ne sont jamais
publiées dans le bundle.

Après la mise en ligne, le propriétaire du domaine peut :

1. Ajouter et vérifier la propriété dans Google Search Console.
2. Soumettre l’URL réelle du `sitemap.xml`.
3. Inspecter l’accueil et demander son indexation.
4. Vérifier les erreurs d’exploration et les adresses canoniques retenues.

L’indexation et la position dans les résultats restent décidées par Google. Un
sitemap facilite la découverte ; il ne garantit pas le classement.
Références : [sitemaps Google](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
et [nom du site](https://developers.google.com/search/docs/appearance/site-names).
