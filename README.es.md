# OpenMultiview

**Un multiview de código abierto para vMix.** Crea distribuciones 16:9,
controla el tally y el audio y recupera las pantallas mediante URL.

[Sitio en español](https://vincentberry.github.io/openmultiview/es.html) ·
[Guía de inicio](https://vincentberry.github.io/openmultiview/guide.es.html) ·
[English](README.md) · [Français](README.fr.md) · [Licencia MIT](LICENSE)

## Funciones

- Presets y plantillas guardadas, con entre 1 y 32 pantallas.
- Miniaturas 16:9 y espacio ajustable entre ellas.
- Creación y reutilización automática de entradas de vMix con IDs estables.
- Grupos anidados para multiviews con más de diez fuentes de vídeo.
- Fuente HTML a pantalla completa en el layer 10 de cada entrada principal.
- Tally en los marcos o en el texto; vúmetros de entrada, Master y BUS A–G.
- Cuenta atrás, bucle y título/tiempo transcurrido de listas de vídeo.
- Tema clásico o OpenMultiview por pantalla, con etiquetas azul noche,
  preview verde menta y programa coral.
- Interfaz en francés, inglés y español con preferencia de idioma guardada.
- Compatibilidad con los enlaces anteriores `Inputs`, `Settings` y `MaskSettings`.

## Primeros pasos en el PC de vMix

En Windows, la [aplicación sin conexión](docs/companion-windows.md) incluye su
propio servidor y no necesita Node.js ni el lanzador de las fuentes. Los pasos
siguientes son una alternativa para ejecutar directamente el código fuente.

Necesitas **vMix 27 o posterior**, **Node.js 22 o posterior** y acceso a la API
HTTP de vMix, normalmente en `http://127.0.0.1:8088/api`. Siguen aplicándose
los límites de entradas de tu edición de vMix.

1. Instala [Node.js](https://nodejs.org/en/download) si es necesario.
2. [Descarga el proyecto](https://github.com/vincentberry/openmultiview/archive/refs/heads/main.zip)
   y extrae el ZIP.
3. Ejecuta `scripts/start-openmultiview.cmd` y mantén la ventana abierta.
4. Abre `http://127.0.0.1:8090/config.html?Lang=es`.
5. Configura el identificador del PC, la dirección de vMix y el número de pantallas.
6. Elige un preset, ajusta las fuentes y guarda el preset de vMix y las URL.

No es necesario instalar dependencias npm. El servicio escucha solo en
`127.0.0.1:8090` y guarda los ajustes en `%LOCALAPPDATA%/multiview-vmix`.
Conserva esa carpeta al actualizar. Reinicia el servicio y actualiza las
fuentes HTML en vMix después de una actualización.

El selector de idioma está en la cabecera del sitio y de la configuración.
El idioma de visualización se incluye en las URL con `Lang=en` o `Lang=es`.
Los nombres de las fuentes, los IDs y los ajustes de vMix permanecen intactos.

## Sitio público y datos locales

El sitio público no tiene cuentas ni una base central de configuraciones.
Cada usuario trabaja con su propia API de vMix y su servicio local. La
demostración del inicio es ilustrativa y no accede a vMix.

Una URL de recuperación contiene IDs, ajustes y la dirección de la API.
Quien recibe el enlace puede leerlos. Las configuraciones grandes colocan sus
ajustes después de `#` para evitar «URI Too Long»; esa parte no se envía al
servidor. Conserva el enlace completo para recuperar los ajustes al reiniciar.
Los parámetros antes de `#` pueden aparecer en los registros del alojamiento.
Usa las páginas locales para
mantener esas solicitudes en tu PC. Consulta la
[página de privacidad](https://vincentberry.github.io/openmultiview/privacy.es.html).

## Desarrollo y contribuciones

Ejecuta `npm test` para los tests, `npm run audit:public` para revisar los
archivos que se van a publicar y `npm run build` para crear el sitio en `dist/`.
Las páginas están en `public/`, los scripts en `public/js/`, los estilos en
`public/css/`, las imágenes en `public/assets/` y jQuery en `public/vendor/`.
Los textos están en `public/js/locales.js`, `public/js/locales-studio.js` y
`public/js/locales-docs.js`. Las direcciones de las páginas no cambian.
El lanzador opcional está en `scripts/start-openmultiview.cmd`; la configuración
opcional de Docker está en `deploy/docker/`. La aplicación Windows y GitHub
Pages funcionan sin estas herramientas.

Lee [CONTRIBUTING.md](CONTRIBUTING.md) antes de contribuir. No publiques datos
de producción privados en las incidencias; usa [SECURITY.md](SECURITY.md) para
informes de vulnerabilidades.

Proyecto comunitario con [licencia MIT](LICENSE), independiente y no afiliado
a vMix. Las licencias de terceros están en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
