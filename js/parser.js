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
        .replace(/^\s*[*_]+|[*_]+\s*$/g, "")
        .replace(/^\[\s?[xX ]?\]\s*/, "") // Elimina [ ] o [x] residuales de markdown
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
    if (!/^[A-ZÁÉÍÓÚÑ0-9]/.test(t)) return false;
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
    let title = "";
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
                    // Tabla de tomas / escenas
                    body.slice(1).forEach(r => secs.push(rowToScene(hdr, cells(r))));
                    cur = null;
                } else {
                    // Otra tabla (ej: Historias de Instagram) -> convertir a items informativos
                    ensure();
                    body.slice(1).forEach(r => {
                        const c = cells(r);
                        const label = c[0] ? `${c[0]}: ` : "";
                        const val = c.slice(1).join(" — ");
                        cur.lines.push({ t: "item", v: `${label}${val}` });
                    });
                }
            }
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
            if (!title && !secs.length) {
                title = h;
                continue;
            }
            endCopy();
            open(h, phaseOf(h, phase));
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
                cur.lines.push({ t: cur.phase === "notas" ? "note" : "item", v: pre });
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

        // Vineta o elemento de checklist
        const b = raw.match(REGEX_PATTERNS.bullet);
        const v = clean(b ? b[1] : t);
        if (!v || v === "-") continue;

        if (/:\s*$/.test(v)) {
            cur.lines.push({ t: "lead", v: v.replace(/:\s*$/, "") });
            continue;
        }

        if (cur.kind === "scene") {
            const q = parseQuotes(v, "");
            if (/^(texto en pantalla|en pantalla)\s*:/i.test(v)) {
                cur.screen = v.replace(/^[^:]+:\s*/, "");
            } else if (q.says.length && !b) {
                cur.says.push(...q.says);
            } else {
                cur.lines.push({ t: "item", v });
            }
            continue;
        }

        const indented = /^\s/.test(raw) || !!b;
        cur.lines.push({
            t: cur.phase === "notas" && !indented ? "note" : "item",
            v,
        });
    }

    endCopy();

    secs = secs.filter(
        s => s.kind === "scene" || s.lines.some(l => l.t !== "copy" || l.paras.length)
    );
    secs.forEach(s => {
        if (s.lines) {
            s.lines = s.lines.filter(l => l.t !== "copy" || l.paras.length);
        }
    });

    return {
        title: title || "Mi guion",
        secs,
    };
}
