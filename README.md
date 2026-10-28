<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" alt="My-Guion" width="380">
  </picture>
</p>

<p align="center">
  <b>El plan de la semana, el guion y la grabación en un solo lugar.</b><br>
  Pegas el kit de producción que te arma Claude, grabas frase por frase con claqueta<br>
  y todo el equipo ve lo mismo desde el computador o el celular.
</p>

<p align="center">
  <a href="https://luisrodriguez-rgb.github.io/My-Guion/"><b>Abrir la app</b></a>
  &nbsp;·&nbsp;
  <a href="#cómo-se-usa-una-semana">Cómo se usa</a>
  &nbsp;·&nbsp;
  <a href="docs/sincronizacion.md">Sincronizar dispositivos</a>
</p>

<p align="center">
  <img alt="Sin instalación" src="https://img.shields.io/badge/instalaci%C3%B3n-ninguna-2f7d4f">
  <img alt="JavaScript sin frameworks" src="https://img.shields.io/badge/JavaScript-sin%20frameworks-f2c230?logo=javascript&logoColor=black">
  <img alt="GitHub Pages" src="https://img.shields.io/badge/publicada%20en-GitHub%20Pages-232a28?logo=github">
  <img alt="Supabase opcional" src="https://img.shields.io/badge/sincronizaci%C3%B3n-Supabase%20(opcional)-3ecf8e?logo=supabase&logoColor=white">
</p>

---

## Qué es

My-Guion nació grabando los videos de **Seamos Genios** (preparación para el ICFES Saber 11). Los guiones los arma Claude, pero grabar leyendo un chat en el celular es incómodo: la pantalla se apaga, no se pueden marcar las tomas y no se sabe qué falta.

Hoy la app organiza la **semana completa**: qué se publica cada día, qué se graba en cada sesión y en qué orden, qué hay que entregarle al editor y quién hace cada cosa. Quien entra entiende en segundos qué toca hoy, sin leer el documento entero.

## Cómo se usa una semana

1. **Pide el kit a Claude.** En la app: menú **⋯ → Cargar o actualizar semana → Copiar prompt para Claude**. Ese prompt le pide el formato exacto que la app entiende.
2. **Pega el kit.** Sirve tal cual sale de Word o en markdown. La app crea una pieza por día, los bloques de grabación con sus frases, las fechas límite y los pendientes.
3. **Abre el Inicio cada día.** Arriba está **Lo que hay que hacer**: lo que se graba (incluido lo atrasado), lo que hay que entregar al editor, lo que se publica con sus historias y lo que hay que confirmar. Cada cosa dice quién la hace.
4. **Graba por bloques.** Toca **Empezar** en un bloque: el teleprompter encadena las frases de varias piezas en el orden recomendado y muestra la claqueta con el nombre del archivo (`S1_VIE_A_F1`) y la toma (`Toma 2 de 3`). La barra espaciadora marca la toma.
5. **Cierra el día.** Marca cada pieza cuando se publique; cuando están todas, el día queda tachado.
6. **Opcional: sincroniza.** Con Supabase, cada persona entra con su correo y todos ven lo mismo, en vivo. Ver [docs/sincronizacion.md](docs/sincronizacion.md).

Si vuelves a pegar el kit de la misma semana (por ejemplo, con un cambio de último minuto), se actualiza sin perder las tomas ni las casillas marcadas.

## Qué trae

**Inicio de la semana**
- Mensaje de la semana para el equipo, editable.
- Gráficos de avance: frases grabadas, piezas publicadas, días listos y lo atrasado.
- Lista de hoy con casillas, quién hace cada cosa y un aviso de "Todo listo por hoy".
- Los 7 días con casilla por pieza y por día, formato, hora y responsables.
- Bloques de grabación con su avance y pendientes por confirmar con su fecha.
- Guía rápida de tres pasos para quien entra por primera vez.

**Grabación**
- Teleprompter de una frase a la vez, con letra grande ajustable (`A−` / `A+`) y pantalla completa.
- Claqueta con el nombre del archivo y conteo de tomas por frase.
- Sesiones por bloque: solo las frases de las personas de ese bloque, separando las grabaciones de pantalla.
- Reglas de grabación del kit (cámara, luz, audio…) como lista para revisar antes de empezar.
- La pantalla no se apaga mientras grabas y, en Android, el celular vibra al marcar cada toma.

**Equipo y datos**
- Personas con rol y nota (por ejemplo, *"nueva, mándale el mensaje de WhatsApp"*). Se asignan solas cuando el kit nombra su rol.
- Nota por pieza para el equipo.
- Guía de la semana con la guía de edición y los mensajes listos para copiar.
- Sincronización opcional entre dispositivos y personas (Supabase), con cambios en vivo y sin perder lo marcado sin conexión.
- Respaldo en JSON para descargar, copiar o importar.

**Guiones sueltos**
- Pega cualquier guion de Claude o ChatGPT: la app separa las escenas y reparte las tareas en **Preparar → Grabar → Editar → Publicar**.
- Captions listos para copiar, casillas de publicación por red social y estados automáticos (`Grabando 3/7`, `En edición`, `Publicado`).
- Checklist para compartir por WhatsApp.

## Atajos en el teleprompter

| Tecla | Qué hace |
|---|---|
| `Espacio` o `Enter` | Toma lista; al completar las tomas pedidas pasa a la siguiente frase |
| `→` / `←` | Siguiente o anterior frase, sin marcar nada |

## Usarla

- **En línea:** [luisrodriguez-rgb.github.io/My-Guion](https://luisrodriguez-rgb.github.io/My-Guion/).
- **En el celular como app:** ábrela en Safari → **Compartir → Agregar a inicio**.
- **En tu computador:** no necesita instalar nada.

  ```bash
  git clone https://github.com/luisrodriguez-rgb/My-Guion.git
  ```

  Luego abre `index.html` en el navegador.

## Dónde quedan los datos

- **Sin sincronizar**, todo se guarda en el navegador donde usas la app (`localStorage`). Cada navegador tiene su propia copia; para pasar datos usa **Descargar respaldo** e **Importar respaldo** del menú.
- **Con Supabase**, los datos del equipo quedan en tu proyecto. Solo pueden leerlos o cambiarlos los correos que están en el equipo (reglas en [docs/supabase.sql](docs/supabase.sql)). La clave de `js/config.js` es pública a propósito.

## Estructura

```
My-Guion/
├── index.html            Página única de la app
├── assets/               Logo (SVG) e ícono para el celular
├── css/
│   ├── variables.css     Colores y temas claro/oscuro
│   ├── layout.css        Cabecera tipo claqueta y estructura
│   ├── components.css    Tarjetas, teleprompter, botones y listas
│   ├── home.css          Inicio, gráficos, equipo, claqueta y sincronización
│   └── style.css         Importa todo lo anterior
├── js/
│   ├── constants.js      Guion de ejemplo, fases y prompts para Claude
│   ├── parser.js         Lee guiones: escenas, lista de tomas, tareas y captions
│   ├── kit.js            Lee el kit semanal: días, bloques, fechas y pendientes
│   ├── icons.js          Íconos de línea en SVG
│   ├── config.js         Dirección y clave pública de Supabase
│   ├── storage.js        Guardado local y respaldos
│   ├── teleprompter.js   Pantalla encendida, pantalla completa y vibración
│   ├── team.js           Equipo y quién hace cada pieza
│   ├── week.js           Semanas, sesiones de grabación e Inicio
│   ├── sync.js           Sincronización con Supabase
│   └── app.js            Vistas y eventos
└── docs/
    ├── sincronizacion.md Cómo conectar Supabase paso a paso
    └── supabase.sql      Tablas y reglas de acceso
```

## Desarrollo

- **Sin dependencias ni compilación.** HTML, CSS y JavaScript sin frameworks. Supabase solo se descarga si `js/config.js` tiene una dirección.
- **Caché:** al cambiar un JS o CSS, sube su `?v=` en `index.html` o en `css/style.css` para que los navegadores bajen la versión nueva.
- **Commits atómicos:** `tipo(ámbito): descripción` en español, sin tildes. La skill [`commits-atomicos`](.claude/skills/commits-atomicos/SKILL.md) explica cómo dividir un cambio y trae un ayudante para preparar solo algunas partes de un archivo.
- **Publicación:** GitHub Pages publica la rama `main` sola, a los pocos minutos de cada fusión.

## Próximos pasos

- [ ] Correo propio (SMTP) para que los enlaces de acceso lleguen a cualquiera del equipo.
- [ ] Avanzar frases con gestos o con un control Bluetooth, sin tocar la pantalla.
- [ ] Ver solo las frases de una persona en el teleprompter.
- [ ] Temporizador de toma para saber si la frase cabe en su tiempo.
- [ ] Exportar la hoja de rodaje en PDF.
