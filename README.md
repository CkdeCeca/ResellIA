# Tasador de Segunda Mano

Web para subir la foto de un artículo y estimar su precio de reventa en Vinted y Wallapop, usando la API gratuita de Google Gemini (visión + búsqueda web integrada).

## Estructura del proyecto

```
tasador-app/
├── index.html        → frontend (lo que ve el usuario)
├── manifest.json      → permite "instalar" la web como app en el móvil
├── icon.svg            → icono de la app
├── sw.js               → service worker (carga rápida + instalable)
├── api/
│   └── estimate.js     → función serverless: llama a Gemini con tu clave, en secreto
├── vercel.json
├── package.json
├── .env.example
└── .gitignore
```

## Pasos para publicarla (con Vercel, gratis)

### 1. Consigue tu clave de la API de Gemini (gratis)
1. Entra en https://aistudio.google.com/app/apikey
2. Inicia sesión con tu cuenta de Google.
3. Pulsa **Create API key**. No hace falta tarjeta de crédito.
4. Copia la clave — empieza por `AIza...`.

La capa gratuita incluye visión (para leer la foto) y una cuota diaria de peticiones más una cuota mensual de búsquedas web gratis; de sobra para uso personal o de un grupo pequeño. Si algún día la superas, la API simplemente devuelve un error temporal hasta el día siguiente (no te cobra nada solo).

### 2. Sube el proyecto a GitHub
1. Crea una cuenta en https://github.com si no tienes.
2. Crea un repositorio nuevo (puede ser privado).
3. Sube esta carpeta al repositorio. La forma más fácil si nunca has usado Git:
   - Entra en tu repositorio en GitHub → **Add file** → **Upload files**
   - Arrastra todos los archivos de esta carpeta (menos `.env.example`, que puedes subir tal cual, nunca subas un `.env` con tu clave real)
   - Commit.

### 3. Despliega en Vercel — **aquí es donde pones la clave**
1. Entra en https://vercel.com y crea una cuenta (puedes usar tu cuenta de GitHub para entrar directamente).
2. **Add New... → Project**.
3. Selecciona el repositorio que acabas de subir.
4. Antes de darle a Deploy, despliega la sección **Environment Variables** y añade:
   - Name: `GEMINI_API_KEY` → Value: la clave que copiaste en el paso 1 (`AIza...`)
   - Name: `APP_PASSWORD` → Value: (opcional pero recomendado) un código que tú elijas, por ejemplo `familia2026`. Si lo defines, la web pedirá ese código la primera vez que alguien intente usarla.
5. Pulsa **Deploy**. En 1-2 minutos te da una URL pública, algo como `tasador-segunda-mano.vercel.app`.
6. Abre esa URL — ya funciona, también desde el móvil.

Si más adelante quieres cambiar la clave o el código de acceso: en Vercel ve a tu proyecto → **Settings → Environment Variables**, edítalas, y vuelve a desplegar (**Deployments → ⋯ → Redeploy**).

### 4. Instalarla como "app" en el móvil (sin tiendas de aplicaciones)
- **Android (Chrome):** abre la URL → menú (⋮) → "Añadir a pantalla de inicio" / "Instalar app".
- **iPhone (Safari):** abre la URL → botón compartir (□↑) → "Añadir a pantalla de inicio".

Se comporta como una app: icono propio, pantalla completa sin barra del navegador.

### 5. (Opcional) Dominio propio
En Vercel: **Settings → Domains**, y añade el dominio que quieras (ej. `tasador.tudominio.com`), siguiendo las instrucciones que te da para configurar el DNS.

## Importante: control de uso

Como es una web pública, cualquiera con el enlace (y el código, si lo pusiste) puede generar estimaciones. Con Gemini no vas a pagar nada mientras te mantengas dentro de la capa gratuita, pero si la cuota diaria se agota, la web dejará de funcionar hasta el día siguiente. Recomendaciones:

- Usa `APP_PASSWORD` si vas a compartirla más allá de tu círculo cercano, para no agotar la cuota con visitas de desconocidos.
- Puedes revisar tu consumo en https://aistudio.google.com (panel de uso).
- Si más adelante quieres pasar a un plan de pago de Gemini para tener más cuota, o límites por usuario, dímelo y lo adaptamos.

## Actualizar la web más adelante
Cualquier cambio que quieras (diseño, textos, lógica) lo hacemos aquí en el chat sobre estos mismos archivos, y luego solo tienes que volver a subir los archivos actualizados a GitHub — Vercel vuelve a desplegar automáticamente en cuanto detecta el cambio.
