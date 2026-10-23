/* ==========================================================================
   My-Guion - Motor de Análisis y Parseo de Guiones
   ========================================================================== */

/**
 * Limpia caracteres de formato markdown y espacios redundantes.
 * @param {string} s - Texto a limpiar.
 * @returns {string} Texto normalizado.
 */
function clean(s) {
    if (!s) return "";
    return s
        .replace(/\*\*|__|`/g, "")
        .replace(/^\s*[*_]+|[*_]+\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Determina a qué fase del rodaje pertenece un encabezado o sección.
 * @param {string} title - Título a clasificar.
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
 * Identifica si una línea es un encabezado plano (sin prefijos markdown).
 * @param {string} raw - Línea original.
 * @param {string} t - Línea limpia.
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
 * Extrae diálogos con identificación de personajes (P1, P2, etc.) y texto residual de acción.
 * @param {string} text - Contenido de la celda o párrafo.
 * @param {string} fallbackWho - Personaje inferido del plano si no está explícito.
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
 * Convierte una fila de tabla (tiempo, plano, qué pasa, texto en pantalla) a un objeto de escena estructurado.
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
 * y lo organiza en título, escenas de rodaje y fases de preparación, grabación, edición y publicación.
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
            copy.paras.push(para.join("\n"));
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

        // Detección de tablas (tabuladores o tuberías markdown | )
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
                body.slice(1).forEach(r => secs.push(rowToScene(hdr, cells(r))));
            }
            cur = null;
            continue;
        }

        if (!raw.trim()) {
            if (copy) flushCopy();
            continue;
        }

        // Separadores horizontales (---, ***, ___)
        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) continue;

        // Encabezado explícito de escena (ej: "Escena 1: Introducción (0-3s)")
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

        // Bloque copiable continuo (captions, mensajes de difusión)
        if (copy) {
            if (REGEX_PATTERNS.endCopy.test(t) && copy.paras.length + (para.length ? 1 : 0) > 0) {
                endCopy();
            } else {
                para.push(t);
                continue;
            }
        }

        ensure();

        // Caption o copy en una sola línea entre comillas
        const inlineCopy = t.match(REGEX_PATTERNS.inlineCopy);
        if (inlineCopy) {
            cur.lines.push({ t: "lead", v: inlineCopy[1] });
            cur.lines.push({
                t: "copy",
                label: (inlineCopy[1].match(/caption|mensaje|copy|bio/i) || ["Texto"])[0],
                paras: [inlineCopy[2]],
            });
            continue;
        }

        // Etiqueta iniciadora de bloque de copy
        const cl = t.match(REGEX_PATTERNS.copyLabel);
        if (cl) {
            const pre = t.slice(0, t.length - cl[0].length).trim();
            if (pre) {
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

        // Viñeta o elemento de checklist
        const b = raw.match(REGEX_PATTERNS.bullet);
        const v = clean(b ? b[1] : t);
        if (!v) continue;

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
