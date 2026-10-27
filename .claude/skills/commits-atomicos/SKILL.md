---
name: commits-atomicos
description: Hace commits atomicos y profesionales en My-Guion con la convencion del repo (tipo(ambito): descripcion en espanol, sin tildes). Usar siempre que se vaya a hacer commit, dividir un cambio grande en varios commits, reescribir commits de una rama o preparar una rama para PR.
---

# Commits atomicos en My-Guion

Un commit = un solo cambio con sentido propio, que se puede revisar, revertir o
cambiar de orden sin arrastrar otra cosa. Cada commit deja la app funcionando.

## 1. Formato del mensaje

```
tipo(ambito): descripcion corta en infinitivo

Cuerpo opcional: el por que del cambio, no el como. Lineas de 72 caracteres.

Co-Authored-By: ...   (solo si la sesion pide atribucion)
```

- Espanol, todo en minusculas, **sin tildes ni ene** (`anadir`, `deteccion`, `vinetas`), como el historial.
- Verbo en infinitivo: anadir, corregir, evitar, mostrar, leer, guardar, quitar, separar, unificar.
- Asunto de maximo 72 caracteres, sin punto final.
- Cuerpo solo cuando el por que no es obvio (un error que se corrige, una decision de diseno).

**Tipos**

| Tipo | Cuando |
|---|---|
| `feat` | Algo nuevo que el usuario puede usar |
| `fix` | Corrige un comportamiento equivocado |
| `refactor` | Cambia la estructura sin cambiar lo que hace la app |
| `style` | Solo apariencia (CSS) sin cambiar comportamiento |
| `docs` | README u otra documentacion |
| `chore` | Configuracion, .gitignore, herramientas, skills |
| `test` | Pruebas |
| `perf` | Rendimiento |

**Ambitos usados en el repo**: `parser`, `kit`, `semana`, `inicio`, `equipo`, `ui`, `teleprompter`,
`editor`, `navigation`, `status`, `storage`, `channels`, `steps`, `dashboard`,
`import`, `backup`, `modal`, `progress`. Usa uno existente antes de inventar otro.

## 2. Como dividir un cambio

1. Mira todo lo que cambio: `git status --short` y `git diff --stat`.
2. Agrupa por motivo, no por archivo. Preguntas utiles:
   - Si reviertes este commit, se rompe otro? Entonces van juntos o en otro orden.
   - Tiene dos verbos en el asunto ("anadir X y corregir Y")? Son dos commits.
   - Hay un arreglo de un error encontrado de paso? Va en su propio `fix`.
   - Una refactorizacion que prepara la funcion nueva va **antes**, en su propio `refactor`.
3. Ordena: primero lo que otros necesitan (refactor, parser, almacenamiento), luego la funcion, al final docs.
4. Cache busting: si un commit cambia JS o CSS, `index.html` y `css/style.css` deben pedir la version nueva (`?v=`) en ese mismo commit o antes de publicarlo.

## 3. Preparar solo una parte de un archivo

`git add -p` es interactivo y aqui no funciona. Usa el ayudante:

```bash
# Archivos nuevos: que aparezcan en el diff
git add -N js/archivo-nuevo.js

# Ver los bloques (hunks) numerados
python3 .claude/skills/commits-atomicos/stage_hunks.py list js/app.js

# Preparar solo algunos bloques
python3 .claude/skills/commits-atomicos/stage_hunks.py add js/app.js#3 js/app.js#7 js/parser.js#1

# Revisar exactamente lo que va en el commit
git diff --cached
```

Si un bloque mezcla dos motivos, edita el archivo temporalmente para separar
(o acepta que vaya en el commit mas cercano y dilo en el cuerpo).

## 4. Verificar antes de cada commit

- `node --check` en cada `.js` que cambio.
- Lo que quedo preparado funciona solo: si el commit usa una funcion, esa funcion ya existe en ese commit o en uno anterior.
- Para reescrituras de rama: el arbol final debe ser identico al de antes (`git diff <respaldo> HEAD` vacio).
- Nunca incluir `.claude/launch.json` ni datos reales del equipo (kits, respaldos JSON, telefonos).

## 5. Reescribir una rama ya subida

1. Respaldo local: `git branch respaldo/<rama>`.
2. `git reset --soft <base>` y `git reset` para dejar todo sin preparar.
3. Crea los commits atomicos con los pasos 2 a 4.
4. `git diff respaldo/<rama> HEAD` debe salir vacio.
5. Subir con `git push --force-with-lease` (nunca `--force` a secas, nunca sobre `main`) y solo con permiso del usuario.
