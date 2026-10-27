# My-Guion

> **Organizador interactivo de guiones, teleprompter de rodaje y checklist de producción para creadores de contenido.**

[![HTML5](https://img.shields.io/badge/HTML5-Semántico-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/es/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-Modular-1572B6?logo=css3&logoColor=white)](https://developer.mozilla.org/es/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla%20ES6+-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/es/docs/Web/JavaScript)
[![Licencia](https://img.shields.io/badge/Licencia-MIT-green.svg)](LICENSE)

---

## Que es My-Guion y por que existe

Cuando creas guiones para videos de redes sociales (TikTok, Reels, YouTube Shorts) con inteligencias artificiales como Claude o ChatGPT, la respuesta suele incluir:
- Una tabla de tomas con tiempos, planos y textos en pantalla.
- Dialogos entre dos o mas personas (P1, P2).
- Consejos de preparacion tecnica (luces, encuadre, vestuario).
- Checklists de grabacion y edicion.
- Copies o captions para Instagram, TikTok y grupos de WhatsApp.

**El problema:** En el momento de grabar con el celular o la camara, un chat de IA presenta demasiada friccion: la pantalla se apaga sola, no se pueden marcar las tomas terminadas, no hay zoom de lectura y no se puede seguir escena a escena.

**La solucion:** **My-Guion** toma ese texto copiado directamente de Claude o ChatGPT y lo transforma al instante en una suite interactiva de rodaje lista para el movil o el computador, sin necesidad de servidores, bases de datos ni conexion a internet.

---

## Caracteristicas Principales

### 0. Semana de Produccion (Inicio)
* **Cargar semana:** Pega el kit "Semana N · Kit de produccion" (desde Word o en markdown desde Claude; el menu trae el prompt con el formato). My-Guion crea una pieza por dia con su hora, formato, responsable y fechas limite de material crudo y edicion.
* **Inicio por semana:** Primero lo de hoy (la grabacion pendiente, lo que se publica hoy con sus historias y las fechas limite), luego los 7 dias con el estado de cada pieza, los bloques de grabacion y los pendientes por confirmar.
* **Sesion de grabacion:** Cada bloque del "Plan de grabacion" encadena en el teleprompter las frases de varias piezas en el orden recomendado, solo las de las personas del bloque (gemelos o colaboradora) y separando las grabaciones de pantalla.
* **Claqueta y tomas:** Cada frase muestra su nombre de archivo (por ejemplo `S1_JUE_G_F1`) y cuenta las tomas pedidas ("Toma 2 de 3"). `Espacio` registra una toma; al completar las tomas pasa a la siguiente frase.
* **Guia de la semana:** Reglas de grabacion con casillas, guia de edicion y mensajes para el equipo listos para copiar.
* **Actualizar sin perder avance:** Volver a pegar el kit de la misma semana actualiza las piezas y conserva tomas y casillas ya marcadas.

### 1. Planificacion y Fases del Rodaje
* **Parser Inteligente de Guiones:**
  - Discrimina entre tablas de tomas de grabacion y tablas accesorias (como calendarios de historias o listas secundarias).
  - Limpia automaticamente prefijos de checkbox markdown (`- [ ]`) para evitar casillas duplicadas.
  - Elimina marcas de bloque de cita (`> `) en los captions y mensajes para que la copia sea inmediata y limpia.
  - Detecta captions inline (como los de TikTok) y genera bloques con boton de copia dedicado.
* **Separacion por Fases de Produccion:**
  - **Notas:** Contexto, concepto y recomendaciones generales.
  - **Preparar:** Checklist previo (vestuario, bateria, luces, sonido, fondo).
  - **Grabar:** Lista de tomas numeradas y planos ordenados.
  - **Editar:** Pautas de montaje, musica comercial permitida y subtitulado.
  - **Publicar:** Textos listos para copiar directo a Instagram, TikTok y WhatsApp, pauta y metricas.
* **Checklist con Persistencia:** Las casillas marcadas se guardan automaticamente en el navegador (`localStorage`).
* **Compartir por WhatsApp:** Genera listas formateadas con casillas `[x]` y `[ ]` listas para enviar a tu equipo o hermano.

### 2. Modo Grabacion (Teleprompter Escena a Escena)
* **Vista Focalizada:** Muestra unicamente la escena actual con tipografia grande y clara.
* **Diferenciacion de Personajes:** Identifica visualmente a los interlocutores (`P1`, `P2`) con colores distintivos.
* **Overlay en Pantalla:** Representa los textos y letreros superpuestos como se veran en el video final.
* **Screen WakeLock API:** Impide que la pantalla del celular se apague mientras estas grabando frente a la camara.
* **Zoom Dinamico:** Controles `A+` y `A-` para ajustar el tamano de la letra a cualquier distancia.
* **Atajos de Teclado:**
  - `Espacio` o `Enter`: Marca la escena como grabada y salta a la siguiente.
  - `->` / `<-`: Navega entre tomas.
* **Respuesta Haptica:** Vibracion sutil en smartphones al completar cada toma.

### 3. Pegado Universal de Guiones
* Pega cualquier guion generado por IA sin necesidad de editarlo previamente.
* El motor identifica patrones en lenguaje natural (`Escena 1`, `Toma 2`, duraciones `0-3 s`, tablas y vinetas).

### 4. Diseno Cinematografico y Temas
* Estetica de claqueta de cine minimalista sin distracciones ni emojis.
* Modo Claro y Modo Oscuro accesibles con un solo clic.
* Diseno 100% responsivo adaptado a las areas seguras de smartphones (Notch, Dynamic Island).

---

## Hoja de Ruta (Roadmap) para Eliminar Friccion

Basado en pruebas reales en set de grabacion, este es el plan de accion para optimizar la experiencia de uso:

### Fase 1: Reduccion de Friccion en la Ingesta (Completada)
- [x] Correccion del parser para evitar falsas escenas provenientes de tablas secundarias (como tablas de historias).
- [x] Limpieza automatica de casillas markdown `[ ]` para evitar duplicidad visual de checkboxes.
- [x] Deteccion automatica de captions en bloques de cita `>` y lineas inline de TikTok.
- [x] Eliminacion de emojis en la interfaz para una experiencia visual profesional y limpia.

### Fase 2: Reduccion de Friccion durante la Grabacion (Proxima etapa)
- [ ] **Filtro por Personaje:** Selector para que P1 o P2 puedan activar una vista filtrada donde solo resalten sus dialogos y acciones.
- [ ] **Soporte para disparadores Bluetooth:** Permitir avanzar escenas usando los botones de volumen de un control remoto o auriculares Bluetooth.
- [ ] **Gestos tactiles de deslizamiento (Swipe):** Deslizar a la izquierda o derecha en el movil para cambiar de escena comodamente con una sola mano.
- [ ] **Temporizador de toma:** Contador integrado de segundos para verificar si la toma se mantiene dentro del rango estimado (ej: 0 a 3 segundos).

### Fase 3: Reduccion de Friccion en la Colaboracion
- [ ] **Enlace de sincronizacion express (URL Hash):** Codificar el guion completo dentro de la URL para compartirlo por WhatsApp con un clic, permitiendo que la otra persona abra el teleprompter en su telefono sin tener que pegar nada.
- [ ] **Exportacion de tomas en formato PDF / TXT:** Generar una hoja de rodaje imprimible o lista de planos rapida para asistentes de camara.

---

## Arquitectura y Estructura del Proyecto

```
My-Guion/
├── index.html              # Estructura semantica HTML5, metadatos y accesibilidad
├── Myguion.html            # Redireccion de compatibilidad retroactiva
├── css/
│   ├── variables.css       # Tokens de diseno, paleta cinematografica y temas (Dark/Light)
│   ├── layout.css          # Contenedores, area segura movil, claqueta y pestanas
│   ├── components.css      # Tarjetas, teleprompter, botones, shot list y badges
│   ├── home.css            # Inicio por semana, menu, sesion de grabacion y claqueta
│   └── style.css           # Hoja maestra modular
├── js/
│   ├── constants.js        # Guion de ejemplo, fases de produccion y expresiones regulares
│   ├── parser.js           # Motor de analisis sintactico de guiones y tablas
│   ├── kit.js              # Lector del kit de produccion semanal (dias, bloques, fechas, pendientes)
│   ├── storage.js          # Persistencia en localStorage, exportacion y backups
│   ├── teleprompter.js     # Screen WakeLock, pantalla completa, zoom y respuesta haptica
│   ├── week.js             # Semanas, sesiones de grabacion y pantalla de Inicio
│   └── app.js              # Controlador principal, renderizado DOM y gestion de eventos
├── .gitignore              # Exclusion de archivos del sistema y temporales
└── README.md               # Documentacion integral y hoja de ruta
```

---

## Inicio Rapido

### Uso Local (Sin instalacion)
1. Clona el repositorio:
   ```bash
   git clone https://github.com/luisrodriguez-rgb/My-Guion.git
   cd My-Guion
   ```
2. Abre `index.html` en tu navegador:
   ```bash
   open index.html
   ```

*No requiere `npm`, Node.js ni compiladores. Funciona completamente offline.*

---

## Despliegue en GitHub Pages

1. Ve a tu repositorio en GitHub: `https://github.com/luisrodriguez-rgb/My-Guion`.
2. Dirigete a **Settings** > **Pages**.
3. En **Source**, selecciona `Deploy from a branch`.
4. Elige la rama `main` y la carpeta `/ (root)`.
5. Guarda los cambios. Tu aplicacion estara disponible en `https://luisrodriguez-rgb.github.io/My-Guion/`.
