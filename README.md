# Seguimiento EMCALI

Aplicativo de gestión de pérdidas no técnicas de energía (amarre cliente-red, trafos, balances DISICO/EMCALI y balances SICONER) para el contrato 500-PS-3324-2024 con EMCALI.

Es una aplicación web estática, sin servidor ni base de datos: solo tres archivos que se abren directamente en el navegador.

## Estructura del proyecto

```
/ (raíz del repositorio)
├── index.html   → estructura de la página, datos actuales de la app (clientes, trafos, balances, Siconer)
├── styles.css   → todos los estilos visuales
└── app.js       → toda la lógica del aplicativo (pestañas, filtros, tablas, importar/exportar Excel, etc.)
```

Se separó en estos tres archivos para que sea más fácil mantenerlo y actualizarlo: los cambios de diseño van en `styles.css`, los cambios de funcionalidad van en `app.js`, y `index.html` queda liviano.

**Importante:** los tres archivos deben ir juntos en la misma carpeta (los tres en la raíz del repositorio, o los tres dentro de la misma subcarpeta) porque `index.html` los referencia por su nombre relativo (`<link href="styles.css">` y `<script src="app.js">`). Si se mueve uno sin el otro, la página no carga bien.

## Cómo publicarlo con una URL (GitHub Pages)

1. Sube los tres archivos (`index.html`, `styles.css`, `app.js`) a este repositorio, todos en la raíz (o todos dentro de la misma carpeta).
2. Entra a **Settings → Pages** (menú de la izquierda del repositorio).
3. En "Build and deployment" → "Source", selecciona **Deploy from a branch**.
4. En "Branch", selecciona **main** y la carpeta **/(root)** (o la subcarpeta donde pusiste los 3 archivos), luego **Save**.
5. Espera uno o dos minutos. GitHub mostrará una URL parecida a:
   `https://juancmontoya2005-stack.github.io/SEGUIMIENTO-CLIENTES/`
6. Esa URL abre el aplicativo directamente, desde cualquier dispositivo.

## Importante sobre los datos y el guardado

- Los datos que ves (clientes, trafos, balances y el módulo "Ver Balances Siconer") están guardados **dentro de `index.html`**, tal como estaban en el momento en que se generó este paquete. Es una copia de seguridad de ese momento.
- El botón **"💾 Guardar cambios"** dentro del aplicativo solo funciona para guardar de forma permanente cuando la app corre dentro de un artifact de Claude (usa una función especial de ese entorno). Corriendo en GitHub Pages, ese botón mostrará el aviso *"Cambios aplicados solo en esta vista: el guardado persistente no está disponible en este entorno"* — es decir, cualquier edición que hagas ahí (agregar cliente, marcar seguimiento, etc.) se ve mientras tengas la pestaña abierta, pero se pierde al recargar la página. Es normal, no es un error.
- Por eso te recomendamos usar **un solo lugar como versión "oficial"** donde editas día a día (lo más práctico es seguir usando el artifact de Claude, que sí guarda), y usar esta copia de GitHub solo como **respaldo / archivo histórico** o para que otras personas puedan verla sin tocarla. Cuando quieras actualizar el respaldo de GitHub con los datos más recientes, vuelve a pedir los tres archivos y reemplázalos.

## Contenido de este paquete

- `index.html` — estructura HTML y los datos actuales de la app.
- `styles.css` — hoja de estilos completa.
- `app.js` — toda la lógica de la aplicación, sin ninguna modificación funcional respecto a la versión anterior de un solo archivo.
