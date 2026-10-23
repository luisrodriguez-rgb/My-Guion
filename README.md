# 🎬 My-Guion

> **Organizador interactivo de guiones, teleprompter de rodaje y checklist de producción para creadores de contenido.**

[![HTML5](https://img.shields.io/badge/HTML5-Semántico-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/es/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-Modular-1572B6?logo=css3&logoColor=white)](https://developer.mozilla.org/es/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla%20ES6+-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/es/docs/Web/JavaScript)
[![Licencia](https://img.shields.io/badge/Licencia-MIT-green.svg)](LICENSE)

---

## 💡 ¿Qué es My-Guion y por qué existe?

Cuando creas guiones para videos de redes sociales (TikTok, Reels, YouTube Shorts) con inteligencias artificiales como **Claude** o **ChatGPT**, la respuesta suele incluir:
- Una tabla de tomas con tiempos, planos y textos en pantalla.
- Diálogos entre dos o más personas (P1, P2).
- Consejos de preparación técnica (luces, encuadre, vestuario).
- Checklists de grabación y edición.
- Copies o captions para Instagram, TikTok y grupos de WhatsApp.

**El problema:** En el momento de grabar con el celular o la cámara, un chat de IA es incómodo: la pantalla se apaga sola, no se pueden marcar las tomas terminadas, no hay zoom de lectura y no se puede seguir escena a escena.

**La solución:** **My-Guion** toma ese texto copiado directamente de Claude/ChatGPT y lo transforma al instante en una suite interactiva de rodaje lista para el móvil o el computador, sin necesidad de servidores, bases de datos ni conexión a internet.

---

## ✨ Características Principales

### 1. 📋 Planificación y Fases del Rodaje
* **Parser Inteligente:** Detecta tablas con tabuladores o formato markdown (`|`), identificando duración, plano, acción, diálogos y texto en pantalla.
* **Separación por Fases de Producción:**
  - 🟡 **Notas:** Contexto, concepto y recomendaciones generales.
  - 🟢 **Preparar:** Checklist previo (vestuario, batería, luces, sonido, fondo).
  - 🎬 **Grabar:** Lista de tomas numeradas y planos ordenados.
  - ✂️ **Editar:** Pautas de montaje, música comercial permitida y subtitulado.
  - 🚀 **Publicar:** Textos listos para copiar directo a Instagram, TikTok y WhatsApp.
* **Checklist con Persistencia:** Las casillas marcadas se guardan automáticamente en el navegador (`localStorage`).
* **Compartir por WhatsApp:** Genera listas formateadas con casillas `☑` y `☐` listas para enviar a tu equipo o hermano.

### 2. 🎥 Modo Grabación (Teleprompter Escena a Escena)
* **Vista Focalizada:** Muestra únicamente la escena actual con tipografía grande y clara.
* **Diferenciación de Personajes:** Identifica visualmente a los interlocutores (`P1`, `P2`) con colores distintivos.
* **Overlay en Pantalla:** Representa los textos y letreros superpuestos como se verán en el video final.
* **Screen WakeLock API:** Impide que la pantalla del celular se apague mientras estás grabando frente a la cámara.
* **Zoom Dinámico:** Controles `A+` y `A-` para ajustar el tamaño de la letra a cualquier distancia.
* **Atajos de Teclado:**
  - <kbd>Espacio</kbd> o <kbd>Enter</kbd>: Marca la escena como grabada y salta a la siguiente.
  - <kbd>→</kbd> / <kbd>←</kbd>: Navega entre tomas.
* **Respuesta Háptica:** Vibración sutil en smartphones al completar cada toma.

### 3. 📝 Pegado Universal de Guiones
* Pega cualquier guion generado por IA sin necesidad de editarlo previamente.
* El motor identifica patrones en lenguaje natural (`Escena 1`, `Toma 2`, duraciones `0-3 s`, tablas y viñetas).

### 4. 🎨 Diseño Cinematográfico y Temas
* Estética de **claqueta de cine** con barra de progreso interactiva en tiempo real.
* Modo Claro y Modo Oscuro accesibles con un solo clic.
* Diseño 100% responsivo adaptado a las áreas seguras de smartphones (Notch, Dynamic Island).

---

## 🏗️ Arquitectura y Estructura del Proyecto

El proyecto sigue una separación estricta de responsabilidades bajo las mejores prácticas de la web moderna:

```
My-Guion/
├── index.html              # Estructura semántica HTML5, metadatos y accesibilidad
├── Myguion.html            # Redirección de compatibilidad retroactiva
├── css/
│   ├── variables.css       # Tokens de diseño, paleta cinematográfica y temas (Dark/Light)
│   ├── layout.css          # Contenedores, área segura móvil, claqueta y pestañas
│   ├── components.css      # Tarjetas, teleprompter, botones, shot list y badges
│   └── style.css           # Hoja maestra modular
├── js/
│   ├── constants.js        # Guion de ejemplo, fases de producción y expresiones regulares
│   ├── parser.js           # Motor de análisis sintáctico de guiones y tablas
│   ├── storage.js          # Persistencia en localStorage, exportación y backups
│   ├── teleprompter.js     # Screen WakeLock, pantalla completa, zoom y respuesta háptica
│   └── app.js              # Controlador principal, renderizado DOM y gestión de eventos
├── .gitignore              # Exclusión de archivos del sistema y temporales
└── README.md               # Documentación integral del proyecto
```

---

## 🚀 Inicio Rápido

### Uso Local (Sin instalación)
1. Clona el repositorio:
   ```bash
   git clone https://github.com/luisrodriguez-rgb/My-Guion.git
   cd My-Guion
   ```
2. Abre `index.html` en tu navegador favorito:
   ```bash
   # En macOS
   open index.html

   # En Linux
   xdg-open index.html

   # En Windows
   start index.html
   ```

*No requiere `npm`, Node.js ni compiladores. Funciona completamente offline.*

---

## 📱 Despliegue en GitHub Pages

Para acceder desde tu celular o compartirlo con cualquier persona:

1. Ve a tu repositorio en GitHub: `https://github.com/luisrodriguez-rgb/My-Guion`.
2. Dirígete a **Settings** > **Pages**.
3. En **Source**, selecciona `Deploy from a branch`.
4. Elige la rama `main` y la carpeta `/ (root)`.
5. Haz clic en **Save**. En un minuto tendrás tu enlace activo en `https://luisrodriguez-rgb.github.io/My-Guion/`.

---

## 🤝 Créditos y Contexto

Desarrollado como una herramienta ágil para creadores independientes, hermanos y equipos de marketing que necesitan convertir ideas y guiones de IA en videos reales de forma eficiente y sin fricción.
