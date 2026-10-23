/* ==========================================================================
   My-Guion - Constantes y Configuración Base
   ========================================================================== */

/**
 * Guion de ejemplo precargado con tabla, checklist por fases y copies listos.
 */
const SAMPLE_SCRIPT = `Guion del video (para dos personas)

Duración: entre 20 y 25 segundos. “P1” eres tú y “P2” es tu hermano; pueden intercambiar los roles.

Tiempo\tPlano\tQué pasa\tTexto en pantalla
0–3 s\tP1 a cámara, plano medio\tP1: “Pregunta tipo ICFES: ¿qué estuvo haciendo Seamos Genios mientras no publicaba?”\tPREGUNTA TIPO ICFES (desde el primer segundo)
3–6 s\tP2 acostado en un sofá, con gafas oscuras\tSe estira, relajado\tA. Descansando
6–9 s\tP2 frente al computador, desesperado, tecleando\t“¿Cuál era la contraseña?”\tB. Olvidamos la contraseña
9–12 s\tP2 mirando el celular, triste, esperando\tSuspira\tD. Esperando a que nos extrañaras
12–17 s\tLos dos juntos a cámara, con los brazos cruzados como en la foto de marca\tP1: “Respuesta correcta: C.”\tC. Preparando lo que viene para tu Saber 11 ✓
17–22 s\tLos dos, misma toma\tP2: “Estuvimos callados…” P1: “…pero no quietos.”\tEsta semana te contamos todo
22–24 s\tLogo o cierre\t—\t@seamosgenios

¿Por qué la C va al final? Porque el orden A, B, D y luego C crea suspenso, y la toma de los brazos cruzados conecta visualmente con las piezas de oferta e Intensivo que vienen después.

Si quieren una versión más corta (unos 12 segundos) para pauta: pregunta, opción B (la más graciosa), opción C y cierre.

Checklist para grabar

Antes

 Ambos con la camiseta polo negra de la marca.
 Gafas oscuras para la opción A (como las de la foto).
 Un fondo limpio. Ideal una pared blanca o roja; nada de desorden detrás.
 Luz natural de frente: pónganse mirando hacia una ventana, nunca de espaldas a ella.
 Un lugar silencioso. Si tienen micrófono de solapa, úsenlo; si no, el celular cerca, a un metro como máximo.
 La batería y el espacio del celular llenos.

Durante

 Graben en vertical (9:16), a 1080p o 4K, con la cámara trasera, que tiene mejor calidad.
 Hagan cada toma por separado y 3 veces. Es más fácil editar que repetirlo todo.
 Dejen 1 segundo de silencio antes y después de cada frase.
 Mantengan las caras en el centro del encuadre. Abajo y a la derecha las apps ponen botones y textos encima.
 Si una toma sale con risas o error, guárdenla. Puede servir para un “detrás de cámaras” otro día.

Tomas extra (B-roll), por si sirven para este video o para los siguientes:

 Una mano rellenando el círculo C en una hoja de respuestas.
 La pantalla de la plataforma en el computador o el celular.
 Los dos trabajando o preparando material.

Edición (en CapCut)

 Subtítulos siempre. Mucha gente ve los videos sin sonido.
 Cortes rápidos, sin pausas muertas.
 El texto “PREGUNTA TIPO ICFES” visible desde el primer cuadro.
 Exportar sin marca de agua.
 Música de fondo suave. Ojo: una cuenta de empresa solo puede usar la biblioteca comercial de TikTok o la colección de sonidos de Meta. Las canciones de moda pueden silenciarles el video, sobre todo si lo pautan.
Dónde y cómo subirlo

Regla de oro: suban el archivo original a cada plataforma. No compartan el video de TikTok con marca de agua en Instagram, porque Instagram le baja el alcance.

Antes de publicar, preparen el perfil. El video traerá visitas al perfil y tiene que estar listo para recibirlas:

 Bio actualizada, con algo como: “PreICFES Saber 11 · Inscripciones abiertas Intensivo 🔴”.
 Link directo al WhatsApp con un mensaje automático, por ejemplo: “Hola, quiero información del PreICFES”.
 La misma bio en Instagram, TikTok y Facebook.
Instagram + Facebook
Súbanlo como Reel desde Meta Business Suite, publicándolo en los dos al mismo tiempo.
Portada: el cuadro de “PREGUNTA TIPO ICFES” con el texto grande y centrado, para que se lea bien en la cuadrícula del perfil.
Fíjenlo como primera publicación del perfil durante esta semana.
Caption:

Sí, estuvimos un tiempo sin aparecer por aquí. Pero no fue tiempo perdido 👀

Estuvimos preparando una nueva etapa de Seamos Genios para acompañarte en el camino al Saber 11. Esta semana te contamos todo.

¿Tú qué letra habrías marcado? 👇

#Saber11 #PreICFES #ICFES

TikTok
Caption corto, porque en TikTok se lee menos: “Pregunta tipo ICFES que sí o sí te vas a saber 😅 ¿Qué letra marcabas? #icfes #saber11 #preicfes #estudiantes #colombia”
Respondan los comentarios con humor. En TikTok, contestar un comentario con un video nuevo es una forma muy buena de tener el siguiente contenido.
WhatsApp (canal y grupos)

Envíen el video como archivo de video, no como link, para que se reproduzca dentro del chat. Mensaje:

¡Hola a todos! 👋 Volvimos y queremos empezar con una pregunta tipo ICFES 😄 Esta semana les compartimos los nuevos calendarios y todo lo que preparamos. Si conocen a alguien de 10° u 11° que se esté preparando para el Saber 11, compártanle este video 🙌

Que el mensaje sea corto. Pedirles que lo compartan en los grupos es la forma más barata de llegar a gente nueva.`;

/** Clave de persistencia en localStorage */
const STORAGE_KEY = "myguion.v2";

/** Definición de fases del rodaje con expresiones regulares de emparejamiento */
const PHASES = [
    { id: "notas", name: "Notas", re: null },
    {
        id: "antes",
        name: "Preparar",
        re: /\bantes\b|prepar|checklist|material|equipo|vestuario|utiler|necesit/i,
    },
    {
        id: "grabar",
        name: "Grabar",
        re: /durante|grabaci|rodaje|b-?roll|tomas? extra|al grabar|escenas?\b/i,
    },
    {
        id: "editar",
        name: "Editar",
        re: /edici|editar|capcut|montaje|postpro|subt[ií]tul/i,
    },
    {
        id: "publicar",
        name: "Publicar",
        re: /subir|publica|instagram|facebook|tiktok|whatsapp|caption|perfil|redes|youtube|despu[eé]s de grabar|difusi/i,
    },
];

/** Patrones RegEx para análisis de texto */
const REGEX_PATTERNS = {
    bullet: /^\s*(?:[-*•·▪►➤✅✔☑☐□]|\d+[.)]|\[\s?[xX ]?\])\s+(.*)$/u,
    copyLabel: /(caption|mensaje|copy|descripci[oó]n|texto para (?:publicar|enviar)|bio)\s*:\s*$/i,
    endCopy: /^(que |ojo|nota|tip|importante|recuerd|eviten|no |si |respond|env[ií]en)/i,
    time: /\(?\s*((?:\d{1,2}:\d{2}|\d+)\s*(?:s|seg|segundos)?\s*[-–a]\s*(?:\d{1,2}:\d{2}|\d+)\s*(?:s|seg|segundos)?)\s*\)?/i,
    sceneHead: /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:[^\p{L}\p{N}\s]{1,3}\s*)?(escena|toma|scene|shot|secuencia|plano)\s*#?\s*(\d+)\b\s*[:.\-–—)|]?\s*(.*)$/iu,
    quotes: /(?:(P\d+|[A-ZÁÉÍÓÚ][\wáéíóúñ]{1,14})\s*:\s*)?[“"«]([^”"»]+)[”"»]/g,
    inlineCopy: /^(.*?(?:caption|mensaje|copy|bio)[^:“"]*):\s*[“"«](.+)[”"»]\s*$/i,
};
