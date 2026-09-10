# Expediente GJ-2411

Sitio estático de una sola página: una secuencia bloqueada de cuatro informes que revelan poco a poco un viaje a Cartagena (24–28 nov 2026), y después el expediente completo navegable.

Sin dependencias, sin build. Solo HTML, CSS y JS.

## Estructura

```
index.html
assets/
  css/style.css
  js/app.js
  img/            ← aquí van las fotos
.github/workflows/deploy.yml
```

## 1. Cambiar las fotos

Reemplaza los archivos en `assets/img/` conservando exactamente estos nombres:

| Archivo             | Dónde sale                    | Formato sugerido |
|---------------------|-------------------------------|------------------|
| `sujeto-01.jpg`     | Ficha de Juan                 | vertical 3:4     |
| `sujeto-02.jpg`     | Ficha de Laura                | vertical 3:4     |
| `evidencia-01.jpg`  | Informe 01 (la primera foto)  | cuadrada 1:1     |
| `evidencia-02..07`  | Galería de evidencia          | cuadrada 1:1     |

Recomendado: recortar a 1200×1200 px (o 900×1200 en las verticales) y dejarlas por debajo de ~400 KB cada una.

## 2. Cambiar los textos

Todo el texto está en `index.html`, en español y en orden de aparición:

- **Terminal de acceso** → array `lines` en `assets/js/app.js`
- **Informes 01 a 03** → secciones `<section class="stage" data-stage="N">`
- **Carta final** → `<article class="letter" id="letter">` (esto es lo primero que deberías personalizar)
- **Fecha del despegue** → `startCountdown()` en `app.js`

## 3. Publicar en GitHub Pages

```bash
git init
git add .
git commit -m "feat: expediente GJ-2411"
git branch -M main
git remote add origin git@github.com:<tu-usuario>/<tu-repo>.git
git push -u origin main
```

Luego en GitHub: **Settings → Pages → Source: GitHub Actions**. El workflow incluido publica en cada push a `main`.

Si prefieres no usar Actions, sirve igual con **Source: Deploy from a branch → main / (root)**; el archivo `.nojekyll` ya está para que Pages no procese nada.

La URL queda en `https://<tu-usuario>.github.io/<tu-repo>/`.

## Probar en local

```bash
python3 -m http.server 8000
```

Y abrir `http://localhost:8000`.

Atajos útiles mientras pruebas:

- `?skip` en la URL salta directo a la revelación
- El botón discreto **saltar ▸** abajo a la derecha hace lo mismo

## Notas

- El sitio respeta `prefers-reduced-motion`: si el sistema lo pide, las animaciones se desactivan y todo queda legible.
- Funciona sin conexión salvo las tipografías (Google Fonts). Si quieres que funcione 100 % offline, descarga las fuentes a `assets/fonts/` y cambia el `<link>` por un `@font-face`.
