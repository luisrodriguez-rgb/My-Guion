/* ==========================================================================
   My-Guion - Motor de Analisis y Parseo de Guiones
   ========================================================================== */

/**
 * Limpia caracteres de formato markdown, checkboxes manuales y espacios redundantes.
 * @param {string} s - Texto a limpiar.
 * @returns {string} Texto normalizado.
 */
function clean(s) {
    if (!s) return "";
    return s
        .replace(/\*\*|__|`/g, "")
        .replace(/\*/g, "") // Elimina asteriscos sueltos o de cursiva markdown
        .replace(/^\s*[_]+|[_]+\s*$/g, "")
        .replace(/^\[\s?[xX ]?\]\s*/, "") // Elimina [ ] o [x] residuales de markdown
        .replace(/^\[(.*)\]$/, "$1") // Elimina corchetes de plantilla ej: [Título del video]
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Determina a que fase del rodaje pertenece un encabezado o seccion.
 * @param {string} title - Titulo a clasificar.
 * @param {string|null} currentPhase - Fase activa previa.
 * @returns {string} Identificador de la fase.
 */
function phaseOf(title, currentPhase) {
    if (/^(mi recomendaci[oó]n|aqu[ií] (?:tienes|est[aá]|te dejo)|te la audito|hola|bueno|consejo|idea|an[aá]lisis|contexto|intro)/i.test(title.trim())) {
        return "notas";
    }
    for (const p of PHASES) {
        if (p.re && p.re.test(title)) return p.id;
    }
    return currentPhase || "notas";
}

/**
 * Identifica si una linea es un encabezado plano (sin prefijos markdown).
 * @param {string} raw - Linea original.
 * @param {string} t - Linea limpia.
 * @returns {boolean}
 */
function isPlainHeading(raw, t) {
    if (/^\s/.test(raw) || t.length > 60 || t.length < 3) return false;
    if (/^\d+[.)]\s/.test(t)) return false; // Viñetas numeradas (1. item o 1) item), no encabezados
    if (!/^[A-ZÁÉÍÓÚÑ]/.test(t)) return false;
    if (/[.,;:!?…"”»'’]$/.test(t) || /\p{Extended_Pictographic}$/u.test(t)) return false;
    if (/:\s/.test(t)) return false;
    return true;
}

/**
 * Extrae dialogos con identificacion de personajes (P1, P2, etc.) y texto residual de accion.
 * @param {string} text - Contenido de la celda o parrafo.
 * @param {string} fallbackWho - Personaje inferido del plano si no esta explicito.
 * @returns {{ says: Array<{ who: string, v: string }>, rest: string }}
 */
function parseQuotes(text, fallbackWho) {
    const says = [];
    let rest = text;
    const re = new RegExp(REGEX_PATTERNS.quotes.source, "g");
    let m;
    while ((m = re.exec(text))) {
        says.push({
            who: m[1] || fallbackWho || "",
            v: m[2].trim(),
        });
        rest = rest.replace(m[0], " ");
    }
    rest = rest.replace(/^[\s—–\-.]+|[\s—–\-]+$/g, "").trim();
    return { says, rest };
}

/**
 * Valida si los encabezados de una tabla corresponden a un listado de tomas o escenas.
 * Evita que tablas secundarias (como cronogramas de historias o calendarios) se conviertan en tomas de teleprompter.
 * @param {string[]} hdr - Encabezados de la tabla.
 * @returns {boolean}
 */
function isSceneTableHeaders(hdr) {
    const joined = hdr.join(" ").toLowerCase();
    const hasShotOrTime = /tiempo|seg|duraci|min|time|plano|toma|encuadre|shot|escena/.test(joined);
    const hasActionOrSay = /pasa|acci[oó]n|descrip|di[aá]logo|dice|pantalla|overlay/.test(joined);
    return hasShotOrTime && hasActionOrSay;
}

/**
 * Convierte una fila de tabla (tiempo, plano, que pasa, texto en pantalla) a un objeto de escena estructurado.
 * @param {string[]} hdr - Encabezados de la tabla normalizados.
 * @param {string[]} c - Celdas de la fila.
 * @returns {object} Objeto de escena listo para el teleprompter y checklist.
 */
function rowToScene(hdr, c) {
    const find = re => hdr.findIndex(h => re.test(h));
    const iT = find(/tiempo|seg|duraci|min|time/i);
    const iS = find(/pantalla|overlay|en pantalla|gr[aá]fico|letrero/i);
    const iP = find(/plano|toma|encuadre|c[aá]mara|escena|qui[eé]n|shot/i);
    const iA = find(/qu[eé] pasa|acci[oó]n|descrip|situaci|qu[eé] hace/i);
    const iD = hdr.findIndex(
        (h, k) => k !== iS && /di[aá]logo|dice|voz|gui[oó]n|texto|locuci|parlamento/i.test(h)
    );

    const sc = {
        kind: "scene",
        time: iT >= 0 ? c[iT] : "",
        title: "",
        action: "",
        says: [],
        screen: iS >= 0 ? c[iS] : "",
        extra: [],
    };

    sc.title = iP >= 0 ? c[iP] : c.find((v, k) => k !== iT && v) || "";
    const whoMatches = sc.title.match(/\bP\d+\b/g) || [];
    const who = whoMatches.length === 1 ? whoMatches[0] : "";

    [iA, iD].forEach(k => {
        if (k < 0 || !c[k] || c[k] === "—") return;
        const q = parseQuotes(c[k], who);
        sc.says.push(...q.says);
        if (q.rest) {
            sc.action = (sc.action ? sc.action + " " : "") + q.rest;
        }
    });

    c.forEach((v, k) => {
        if (v && v !== "—" && ![iT, iS, iP, iA, iD].includes(k)) {
            sc.extra.push((hdr[k] ? hdr[k] + ": " : "") + v);
        }
    });

    if (sc.screen === "—") sc.screen = "";
    return sc;
}

/**
 * Busca de forma inteligente el titulo principal del guion, descartando frases introductorias
 * o consejos de la IA ("Mi recomendacion", "Te dejo el guion", "Aqui tienes...", etc.).
 * @param {string[]} lines - Lineas del texto.
 * @returns {string} Titulo detectado.
 */
function findScriptTitle(lines) {
    const isAdvice = s =>
        /^(mi recomendaci[oó]n|aqu[ií] (?:tienes|est[aá]|te dejo)|te la audito|hola|bueno|consejo|idea|an[aá]lisis|contexto|intro)/i.test(
            s.trim()
        );

    const isNonTitle = s => {
        const t = s.trim();
        if (!t) return true;
        if (/^(\||-|\*|\d+[.)]|>|\[|\/\/)/.test(t)) return true;
        if (/^(preparar|grabar|editar|publicar|escenas|notas|checklist|distribuci[oó]n|caption|copy|duraci[oó]n)/i.test(t)) return true;
        if (isAdvice(t)) return true;
        return false;
    };

    const isGenericHeading = h =>
        /^(escenas|preparar|grabar|editar|publicar|notas|checklist|d[oó]nde y c[oó]mo|sobre la pauta|c[oó]mo sabr[aá]n|distribuci[oó]n|caption)/i.test(h);

    // 1. Prioridad: Encabezado H1 o H2 con palabras clave de pieza audiovisual
    for (const line of lines) {
        const m = line.match(/^\s*#{1,3}\s+(.+)$/);
        if (m) {
            const h = clean(m[1]);
            if (!isAdvice(h) && /gui[oó]n|video|spot|reel|tiktok|cortometraje|tutorial|pregunta|campa[ñn]a/i.test(h)) {
                return h;
            }
        }
    }

    // 2. Prefijo explícito de título: "Título: ...", "Guion: ...", "Video: ..." (con o sin markdown)
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
        const line = lines[i];
        const m = line.match(/^\s*(?:#{1,3}\s+|\*\*)?(?:t[ií]tulo(?: del video)?|gui[oó]n|video|nombre):\s*(.+?)(?:\*\*)?$/i);
        if (m) {
            const h = clean(m[1]);
            if (h && !isAdvice(h) && h.length >= 3) {
                return h;
            }
        }
    }

    // 3. Encabezado markdown H1 o H2 que no sea consejo ni sección genérica de trabajo
    for (const line of lines) {
        const m = line.match(/^\s*#{1,3}\s+(.+)$/);
        if (m) {
            const h = clean(m[1]);
            if (!isAdvice(h) && !isGenericHeading(h)) {
                return h;
            }
        }
    }

    // 4. Línea en negrita solitaria al inicio (primeras 10 líneas)
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const m = lines[i].match(/^\s*\*\*([^*]{3,120})\*\*\s*$/);
        if (m) {
            const h = clean(m[1]);
            if (!isNonTitle(h) && !isAdvice(h) && !isGenericHeading(h)) {
                return h;
            }
        }
    }

    // 5. Línea de texto plano relevante en las primeras 10 líneas que contenga "video", "tutorial", "guion", etc. (incluso con dos puntos)
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const raw = lines[i];
        const t = clean(raw);
        if (t && t.length >= 5 && t.length <= 120 && !isNonTitle(t)) {
            if (/gui[oó]n|video|spot|reel|tiktok|cortometraje|tutorial|pregunta|campa[ñn]a/i.test(t)) {
                return t;
            }
        }
    }

    // 6. Primera línea no vacía si parece un título limpio
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const t = clean(lines[i]);
        if (t && t.length >= 4 && t.length <= 90 && !isNonTitle(t) && !isGenericHeading(t)) {
            return t;
        }
    }

    return "Mi guion";
}

/**
 * Parsea el texto completo pegado (incluso de Claude o ChatGPT sin formato previo)
 * y lo organiza en titulo, escenas de rodaje y fases de preparacion, grabacion, edicion y publicacion.
 * @param {string} text - Texto en bruto del guion.
 * @returns {{ title: string, secs: Array<object> }}
 */
function parseScript(text) {
    if (!text || typeof text !== "string") {
        return { title: "Mi guion", secs: [] };
    }

    const L = text.replace(/\r/g, "").split("\n");
    const detectedTitle = findScriptTitle(L);
    const cleanDetectedTitle = clean(detectedTitle).toLowerCase();
    let secs = [];
    let cur = null;
    let phase = null;
    let copy = null;
    let para = [];

    const open = (t, ph) => {
        phase = ph;
        cur = { kind: "sec", title: t, phase: ph, lines: [] };
        secs.push(cur);
        copy = null;
    };

    const ensure = () => {
        if (!cur) open("", "notas");
    };

    const flushCopy = () => {
        if (copy && para.length) {
            copy.paras.push(para.join("\n").trim());
        }
        para = [];
    };

    const endCopy = () => {
        flushCopy();
        copy = null;
    };

    const nextNonBlank = i => {
        for (let j = i + 1; j < L.length; j++) {
            if (L[j].trim()) return L[j];
        }
        return "";
    };

    for (let i = 0; i < L.length; i++) {
        const raw = L[i];
        const t = clean(raw);

        // Deteccion de tablas (tabuladores o tuberias markdown | )
        const isTab = (raw.match(/\t/g) || []).length >= 2;
        const isPipe = /^\s*\|.*\|\s*$/.test(raw);

        if (isTab || isPipe) {
            endCopy();
            const rows = [];
            while (
                i < L.length &&
                ((L[i].match(/\t/g) || []).length >= 2 || /^\s*\|.*\|\s*$/.test(L[i]))
            ) {
                rows.push(L[i]);
                i++;
            }
            i--;

            const cells = r =>
                (/\t/.test(r)
                    ? r.split("\t")
                    : r.trim().replace(/^\||\|$/g, "").split("|")
                ).map(x => clean(x));

            const body = rows.filter(r => !/^\s*\|?[\s:|-]+\|?\s*$/.test(r));
            if (body.length > 0) {
                const hdr = cells(body[0]);
                if (isSceneTableHeaders(hdr)) {
                    // Tabla de tomas / escenas para el teleprompter
                    body.slice(1).forEach(r => secs.push(rowToScene(hdr, cells(r))));
                    cur = null;
                } else {
                    // Tabla secundaria informativa (ej: Historias de Instagram) -> Se renderiza como tabla de referencia, NO como tareas
                    ensure();
                    const tableRows = body.slice(1).map(r => cells(r));
                    cur.lines.push({ t: "table", headers: hdr, rows: tableRows });
                }
            }
            continue;
        }

        // Si es la linea que origino el titulo principal antes de entrar a secciones, se omite para evitar notas fantasma
        if (!cur && clean(t).toLowerCase() === cleanDetectedTitle) {
            continue;
        }

        if (!raw.trim()) {
            if (copy) flushCopy();
            continue;
        }

        // Separadores horizontales (---, ***, ___)
        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) continue;

        // Encabezado explicito de escena (ej: "Escena 1: Introduccion (0-3s)")
        const sm = raw.match(REGEX_PATTERNS.sceneHead);
        if (sm && !/^\s/.test(raw)) {
            endCopy();
            const rest = clean(sm[3] || "");
            const tm = rest.match(REGEX_PATTERNS.time);
            cur = {
                kind: "scene",
                time: tm ? tm[1] : "",
                title:
                    clean(tm ? rest.replace(tm[0], "") : rest).replace(
                        /^[–—:\-\s]+|[–—:\-\s]+$/g,
                        ""
                    ) || `Escena ${sm[2]}`,
                action: "",
                says: [],
                screen: "",
                extra: [],
                lines: [],
            };
            secs.push(cur);
            phase = "grabar";
            continue;
        }

        // Encabezados markdown (# o negrita sola)
        const md = raw.match(/^\s*#{1,6}\s+(.+)$/) || raw.match(/^\s*\*\*([^*]{2,90})\*\*\s*:?\s*$/);
        const next = nextNonBlank(i);
        const subHead =
            !/^\s/.test(raw) &&
            /:\s*$/.test(t) &&
            t.length < 110 &&
            !REGEX_PATTERNS.copyLabel.test(t) &&
            (/^\s/.test(next) || REGEX_PATTERNS.bullet.test(next));

        if (md || subHead || (isPlainHeading(raw, t) && !(copy && /^#/.test(t)))) {
            const h = clean(md ? md[1] : t).replace(/:\s*$/, "");
            endCopy();
            const nextPhase = (!md && phase === "notas") ? "notas" : phaseOf(h, phase);
            open(h, nextPhase);
            continue;
        }

        // Bloque copiable continuo (captions, mensajes de difusion, blockquotes)
        if (copy) {
            if (REGEX_PATTERNS.endCopy.test(t) && copy.paras.length + (para.length ? 1 : 0) > 0) {
                endCopy();
            } else {
                // Elimina prefijo de cita markdown '>' para copiar limpio
                para.push(raw.trim().replace(/^>\s?/, ""));
                continue;
            }
        }

        ensure();

        // Caption o copy en una sola linea entre comillas
        const inlineCopy = raw.match(REGEX_PATTERNS.inlineCopy);
        if (inlineCopy) {
            const label = clean(inlineCopy[1]);
            const content = clean(inlineCopy[2]);
            cur.lines.push({ t: "lead", v: label });
            cur.lines.push({
                t: "copy",
                label: (label.match(/caption|mensaje|copy|bio/i) || ["Texto"])[0],
                paras: [content],
            });
            continue;
        }

        // Etiqueta iniciadora de bloque de copy (ej: "Caption:", "Mensaje:")
        const cl = t.match(REGEX_PATTERNS.copyLabel);
        if (cl) {
            const pre = t.slice(0, t.length - cl[0].length).trim();
            if (pre && pre !== "-") {
                cur.lines.push({ t: "note", v: pre });
            }
            copy = {
                t: "copy",
                label: cl[1][0].toUpperCase() + cl[1].slice(1),
                paras: [],
            };
            cur.lines.push(copy);
            para = [];
            continue;
        }

        // Analisis de Tareas vs Informacion:
        // Las viñetas normales (-, •, números) y casillas [ ] dentro de las fases
        // (Preparar, Grabar, Editar, Publicar) son tareas con casilla.
        // Solo son información: párrafos explicativos, tablas y textos para copiar.
        const hasExplicitCheckbox = /^\s*(?:[-*•]\s*)?\[\s?[xX ]?\]\s*(.*)$/.test(raw);
        const bulletMatch = raw.match(/^\s*(?:[-*•·▪►➤✅✔☑☐□]|\d+[.)])\s+(.*)$/);

        if (hasExplicitCheckbox) {
            const textVal = clean(raw.replace(/^\s*(?:[-*•]\s*)?\[\s?[xX ]?\]\s*/, ""));
            cur.lines.push({ t: "item", v: textVal });
            continue;
        }

        if (bulletMatch) {
            const v = clean(bulletMatch[1]);
            if (!v || v === "-") continue;

            // En la fase de notas/explicaciones, las viñetas son información de referencia a menos que tengan [ ] explícito
            if (phase === "notas" && !hasExplicitCheckbox) {
                cur.lines.push({ t: "note", v: "• " + v });
            } else {
                cur.lines.push({ t: "item", v });
            }
            continue;
        }

        // Texto regular o parrafo explicativo (informacion de referencia)
        cur.lines.push({ t: "note", v: t });
    }

    endCopy();

    secs = secs.filter(
        s => s.kind === "scene" || s.lines.length > 0
    );

    return {
        title: detectedTitle || "Mi guion",
        secs,
    };
}
