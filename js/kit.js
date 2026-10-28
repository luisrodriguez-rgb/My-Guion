/* ==========================================================================
   My-Guion - Lector del Kit de Produccion Semanal
   Convierte el documento "Semana N · Kit de produccion" (pegado desde Word o
   escrito en markdown por Claude) en una semana con piezas, sesiones de
   grabacion, fechas limite, reglas y pendientes.
   ========================================================================== */

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAY_SLATE = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"];

const KIT_DAY_RE = /^\s*(?:#{1,6}\s*)?(?:\*\*)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+(\d{1,2})\s*[·•|:–—-]\s*(.+?)(?:\*\*)?\s*$/i;
const KIT_GLOBAL_RE = /^\s*(?:#{1,6}\s*)?(?:\*\*)?(resumen de la semana|plan de grabaci[oó]n|reglas de grabaci[oó]n|gu[ií]a de edici[oó]n|instrucci[oó]n maestra|env[ií]o de archivos|mensaje para|pendientes por confirmar)/i;
const KIT_INLINE_CAPTION_RE = /^(caption[^:]{0,40}|tiktok|instagram[^:]{0,30}|facebook[^:]{0,30}):\s*["“«](.+?)["”»]?\s*$/i;
const KIT_TIME_RE = /(\d{1,2}(?::\d{2})?\s*(?:a\.?\s?m\.?|p\.?\s?m\.?|m\.)|mediod[ií]a)/i;

/** Quita tildes y pasa a minusculas para comparar palabras. */
function fold(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Fecha local en formato YYYY-MM-DD. */
function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Convierte YYYY-MM-DD en Date local (sin desfase de zona horaria). */
function parseIso(s) {
    const [y, m, d] = String(s).split("-").map(Number);
    return new Date(y, m - 1, d);
}

function todayIso() {
    return isoDate(new Date());
}

/** "2026-10-27" -> "Mar 27" */
function shortDayLabel(iso) {
    if (!iso) return "";
    const d = parseIso(iso);
    return `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()}`;
}

/** Indice de dia de la semana (0 = domingo) a partir de "lun", "Martes", "mié"... */
function weekdayIndex(word) {
    const w = fold(word).slice(0, 2);
    return { do: 0, lu: 1, ma: 2, mi: 3, ju: 4, vi: 5, sa: 6 }[w] ?? -1;
}

/** Dias de la semana mencionados en un texto, en orden de aparicion. */
function weekdaysIn(text) {
    const out = [];
    const re = /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi;
    let m;
    while ((m = re.exec(text))) {
        const idx = weekdayIndex(m[1]);
        if (!out.includes(idx)) out.push(idx);
    }
    return out;
}

/** Hora legible ("6 p. m.") dentro de un texto. */
function timeIn(text) {
    const m = String(text || "").match(KIT_TIME_RE);
    return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

/**
 * Linea que funciona como titulo en un documento pegado desde Word:
 * corta, en mayuscula inicial (no TODO MAYUSCULAS) y sin puntuacion final.
 */
function isKitHeadingLine(raw) {
    if (!raw || /^\s/.test(raw)) return false;
    const t = raw.trim();
    if (/^#{1,6}\s/.test(t)) return true;
    if (t.length < 3 || t.length > 100 || /\t/.test(t)) return false;
    if (!/^[¿¡]?[A-ZÁÉÍÓÚÑ][a-záéíóúñü]/.test(t)) return false;
    if (/[.,;!?…"”»'’]$/.test(t) || /\p{Extended_Pictographic}\s*$/u.test(t)) return false;
    if (/:\s+\S/.test(t)) return false;
    return true;
}

/** Lineas que cierran un bloque literal (brief, caption, mensaje). */
function endsVerbatim(raw) {
    const t = raw.trim();
    if (!t) return false;
    if (/^#{1,6}\s/.test(t) || KIT_DAY_RE.test(raw) || /^caption\b/i.test(t) || KIT_INLINE_CAPTION_RE.test(t)) return true;
    if (KIT_GLOBAL_RE.test(raw) && isKitHeadingLine(raw)) return true;
    return isKitHeadingLine(raw) &&
        /^(captions?|historias|lista de tomas|guion|notas|brief|carrusel del|reel de|pieza \d|whatsapp|texto para)/i.test(t);
}

/**
 * Normaliza un bloque del kit a markdown que entiende parseScript:
 * titulos con ##, vinetas con "- [ ]", tablas con |, y briefs/captions
 * entre ``` para copiarlos completos.
 * @param {string[]} lines - Lineas del bloque.
 * @returns {string}
 */
function normalizeKitLines(lines) {
    const out = [];
    let fence = null; // { label, opened, caption }
    let passthrough = false;
    let lastHeading = "";

    const closeFence = () => {
        if (fence && fence.opened) out.push("```");
        fence = null;
    };
    const openFence = (label, caption) => {
        closeFence();
        fence = { label, opened: false, caption: !!caption };
    };
    const heading = t => {
        const h = t.replace(/^#{1,6}\s*/, "").replace(/\*\*/g, "").replace(/:\s*$/, "").trim();
        lastHeading = h;
        out.push("## " + h);
        return h;
    };

    for (let i = 0; i < lines.length; i++) {
        let raw = lines[i].replace(/ /g, " ").replace(/\s+$/, "");
        const t = raw.trim();

        // Bloques ``` que ya vienen escritos en markdown se copian tal cual
        if (/^```/.test(t)) {
            if (fence && !fence.opened) fence = null;
            else closeFence();
            passthrough = !passthrough;
            out.push(t);
            continue;
        }
        if (passthrough) {
            out.push(raw);
            continue;
        }

        if (fence) {
            if (endsVerbatim(raw)) {
                closeFence();
            } else if (fence.caption && /^(reel|carrusel|historia|tiktok|instagram|facebook)[^:]{0,25}:\s*$/i.test(t)) {
                openFence("Caption " + t.replace(/:\s*$/, "").toLowerCase(), true);
                continue;
            } else {
                if (!t && !fence.opened) continue;
                if (!fence.opened) {
                    if (/^(este mensaje|es la |estas reglas)/i.test(t)) {
                        out.push(t);
                        continue;
                    }
                    out.push("```" + fence.label);
                    fence.opened = true;
                }
                out.push(raw.replace(/\t/g, "  "));
                continue;
            }
        }

        if (!t) {
            out.push("");
            continue;
        }

        // Caption de una linea: Caption (TikTok): "..." o TikTok: "..."
        const ic = t.match(KIT_INLINE_CAPTION_RE);
        if (ic) {
            if (!/^captions?$/i.test(lastHeading)) heading("Caption");
            const label = /^caption/i.test(ic[1]) ? ic[1].trim() : `Caption ${ic[1].trim()}`;
            out.push("```" + label, ic[2].replace(/["”»]\s*$/, ""), "```");
            continue;
        }

        // Vinetas y casillas (Word pega "•<tab>☐ texto" y "1.<tab>texto")
        const bullet = raw.match(/^\s*[•·▪►➤]\s+(.*)$/) || raw.match(/^\s*[-*]\s+(?!\[)(.*)$/);
        const box = /^\s*[☐□]\s*/;
        if (bullet) {
            const v = bullet[1].trim();
            out.push(box.test(v) ? "- [ ] " + v.replace(box, "") : "- " + v);
            continue;
        }
        if (box.test(raw)) {
            out.push("- [ ] " + t.replace(box, ""));
            continue;
        }
        const num = raw.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (num) {
            out.push(`${num[1]}. ${num[2].trim()}`);
            continue;
        }

        // Tablas separadas por tabuladores (incluye tablas de 2 columnas)
        if (/\t/.test(raw) && !/^\s*\|/.test(raw)) {
            const rows = [];
            while (i < lines.length && /\t/.test(lines[i]) && lines[i].trim()) {
                const cells = lines[i].replace(/ /g, " ").split("\t").map(c => c.trim().replace(/\|/g, "/"));
                rows.push("| " + cells.join(" | ") + " |");
                i++;
            }
            i--;
            if (rows.length >= 2) {
                out.push(...rows);
                continue;
            }
            out.push(t.replace(/\t+/g, " "));
            continue;
        }

        if (isKitHeadingLine(raw) && !/^\s*\|/.test(raw)) {
            const h = heading(t);
            if (/\(copiar y pegar|^brief|^instrucci[oó]n maestra|^mensaje para/i.test(h)) {
                openFence(h.replace(/\s*\(copiar y pegar[^)]*\)/i, ""), false);
            } else if (/^captions?$/i.test(h)) {
                openFence("Caption", true);
            }
            continue;
        }

        out.push(raw);
    }
    closeFence();
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Extrae las tablas (| a | b |) de un texto ya normalizado. */
function kitTables(md) {
    const tables = [];
    const L = md.split("\n");
    for (let i = 0; i < L.length; i++) {
        if (!/^\s*\|.*\|\s*$/.test(L[i])) continue;
        const rows = [];
        while (i < L.length && /^\s*\|.*\|\s*$/.test(L[i])) {
            if (!/^\s*\|?[\s:|-]+\|?\s*$/.test(L[i])) {
                rows.push(L[i].trim().replace(/^\||\|$/g, "").split("|").map(c => clean(c)));
            }
            i++;
        }
        if (rows.length >= 2) tables.push({ hdr: rows[0], rows: rows.slice(1) });
    }
    return tables;
}

/** Busca la columna cuyo encabezado cumple la expresion. */
function col(hdr, re) {
    return hdr.findIndex(h => re.test(h));
}

/** Formato corto para mostrar en tarjetas: "Reel", "Carrusel + reel"... */
function shortFormat(f) {
    const t = fold(f);
    const parts = [];
    if (/carrusel/.test(t)) parts.push("Carrusel");
    if (/reel/.test(t)) parts.push(parts.length ? "reel" : "Reel");
    if (/tiktok/.test(t) && !parts.length) parts.push("TikTok");
    if (/historia/.test(t) && !parts.length) parts.push("Historia");
    if (/flyer|post/.test(t) && !parts.length) parts.push("Post");
    if (/video/.test(t) && !parts.length) parts.push("Video");
    if (parts.length) return parts.join(" + ");
    return f && f !== "—" ? f.split(/[(,]/)[0].trim() : "Grabación";
}

/**
 * Lee el kit semanal completo.
 * @param {string} text - Documento pegado.
 * @returns {object|null} Semana lista para guardar, o null si no tiene dias.
 */
function parseKit(text) {
    if (!text || typeof text !== "string") return null;
    const L = text
        .replace(/\r/g, "")
        .replace(/(["”])\s+(Caption \()/g, "$1\n$2")
        .split("\n");

    // 1. Titulo, numero de semana y rango de fechas
    const titleIdx = L.findIndex(l => /^\s*(?:#{1,6}\s*)?(?:\*\*)?semana\s+\d+/i.test(l));
    const titleLine = titleIdx >= 0 ? clean(L[titleIdx].replace(/^\s*#{1,6}\s*/, "")) : "";
    const num = +(titleLine.match(/semana\s+(\d+)/i) || [])[1] || 1;
    const head = L.slice(0, 8).join(" ");
    const year = +(head.match(/\b(20\d{2})\b/) || [])[1] || new Date().getFullYear();

    // 2. Bloques: introduccion, secciones globales y un bloque por dia
    const blocks = [];
    let block = { type: "intro", key: "intro", lines: [] };
    blocks.push(block);
    L.forEach((raw, idx) => {
        if (idx === titleIdx) return;
        const dm = raw.match(KIT_DAY_RE);
        if (dm && raw.trim().length < 160) {
            block = { type: "day", weekday: weekdayIndex(dm[1]), dayNum: +dm[2], title: clean(dm[3]), lines: [] };
            blocks.push(block);
            return;
        }
        const gm = raw.match(KIT_GLOBAL_RE);
        if (gm && isKitHeadingLine(raw)) {
            block = { type: "global", key: fold(gm[1]).split(" ")[0], lines: [raw] };
            blocks.push(block);
            return;
        }
        block.lines.push(raw);
    });

    const days = blocks.filter(b => b.type === "day");
    if (!days.length) return null;

    // 3. Fecha de inicio: rango del titulo "(26 oct – 1 nov)" o primer dia
    let start = null;
    const rm = titleLine.match(/(\d{1,2})\s*(?:de\s+)?([a-záéíóú]{3,})\.?\s*[–—-]/i);
    if (rm) {
        const mi = MONTHS_ES.indexOf(fold(rm[2]).slice(0, 3));
        if (mi >= 0) start = new Date(year, mi, +rm[1]);
    }
    if (!start) {
        const first = days[0];
        const now = new Date();
        start = new Date(now.getFullYear(), now.getMonth(), first.dayNum);
        if (start.getTime() - now.getTime() > 20 * 864e5) start.setMonth(start.getMonth() - 1);
        // Sin rango en el titulo: la semana empieza el lunes de la semana del primer dia
        while (start.getDay() !== 1) start.setDate(start.getDate() - 1);
    }
    const dates = Array.from({ length: 7 }, (_, k) => {
        const d = new Date(start);
        d.setDate(start.getDate() + k);
        return d;
    });
    const dateForDayNum = n => {
        const d = dates.find(x => x.getDate() === n);
        return d ? isoDate(d) : null;
    };
    const dateForWeekday = w => {
        const d = dates.find(x => x.getDay() === w);
        return d ? isoDate(d) : null;
    };
    const when = txt => {
        const w = weekdayIndex((String(txt).match(/^[\p{L}]+/u) || [""])[0]);
        const date = /^hoy/i.test(String(txt).trim()) ? isoDate(dates[0]) : w >= 0 ? dateForWeekday(w) : null;
        return date ? { date, time: timeIn(txt), label: String(txt).trim() } : null;
    };

    // 4. Secciones globales normalizadas
    const globalMd = {};
    blocks.forEach(b => {
        if (b.type === "day") return;
        const md = normalizeKitLines(b.lines);
        if (md) globalMd[b.key] = (globalMd[b.key] ? globalMd[b.key] + "\n\n" : "") + md;
    });
    const allGlobal = Object.values(globalMd).join("\n\n");
    const tables = kitTables(allGlobal);

    // 5. Tabla semanal: Dia | Pieza | Formato | Quien | Lista para
    const rowsByDay = {};
    const weekTable = tables.find(tb => col(tb.hdr, /d[ií]a/i) >= 0 && col(tb.hdr, /pieza/i) >= 0);
    if (weekTable) {
        const h = weekTable.hdr;
        const iD = col(h, /d[ií]a/i), iP = col(h, /pieza/i), iF = col(h, /formato/i),
            iW = col(h, /qui[eé]n/i), iR = col(h, /lista|hora|publica/i);
        weekTable.rows.forEach(r => {
            const n = +(String(r[iD]).match(/\d{1,2}/) || [])[0];
            if (!n) return;
            rowsByDay[n] = {
                star: /★|\*/.test(r[iD]),
                piece: r[iP] || "",
                format: iF >= 0 ? r[iF] : "",
                owner: iW >= 0 ? r[iW] : "",
                time: iR >= 0 ? timeIn(r[iR]) : "",
            };
        });
    }

    // 6. Fechas limite de edicion: Pieza (dia) | Material crudo | Edicion lista
    const dueByWeekday = {};
    const dueTable = tables.find(tb => col(tb.hdr, /crudo/i) >= 0);
    if (dueTable) {
        const h = dueTable.hdr;
        const iP = col(h, /pieza/i), iC = col(h, /crudo/i), iE = col(h, /edici/i);
        dueTable.rows.forEach(r => {
            weekdaysIn(r[iP] || "").forEach(w => {
                dueByWeekday[w] = { raw: iC >= 0 ? when(r[iC]) : null, edit: iE >= 0 ? when(r[iE]) : null };
            });
        });
    }

    // 7. Piezas (una por dia)
    const pieces = days.map(b => {
        const date = dateForDayNum(b.dayNum) || dateForWeekday(b.weekday);
        const row = rowsByDay[b.dayNum] || {};
        const wd = parseIso(date).getDay();
        const body = normalizeKitLines(b.lines);
        const optional = /opcional/i.test(row.piece || "") || /opcional/i.test(b.title);
        const title = clean(b.title.replace(/\(opcional\)/i, "")) || row.piece;
        const due = dueByWeekday[wd] || {};
        return {
            date,
            title,
            text: `# ${title}\n\n${body}`,
            format: shortFormat(row.format || b.title),
            formatRaw: row.format || "",
            owner: row.owner || "",
            time: row.time || timeIn(b.lines.slice(0, 4).join(" ")),
            star: !!row.star,
            optional,
            slatePrefix: `S${num}_${WEEKDAY_SLATE[wd]}`,
            rawDue: due.raw || null,
            editDue: due.edit || null,
        };
    });

    // 8. Sesiones de grabacion: Bloque | Cuando | Quien | Que se graba | Duracion
    const sessions = [];
    const sessTable = tables.find(tb => col(tb.hdr, /bloque/i) >= 0);
    const planMd = globalMd.plan || "";
    if (sessTable) {
        const h = sessTable.hdr;
        const iB = col(h, /bloque/i), iC = col(h, /cu[aá]ndo/i), iW = col(h, /qui[eé]n/i),
            iQ = col(h, /^qu[eé]\s/i), iT = col(h, /duraci/i);
        sessTable.rows.forEach(r => {
            const [id, ...rest] = String(r[iB]).split(/\s*[·•\-–—:]\s*/);
            const what = iQ >= 0 ? r[iQ] : "";
            let order = weekdaysIn(what);
            // "Orden recomendado del bloque B:" seguido de una lista numerada
            const om = planMd.match(new RegExp(`orden recomendado del bloque\\s+${id.trim()}\\b[^\\n]*\\n((?:\\s*\\n|\\d+\\. .*\\n?)+)`, "i"));
            if (om) {
                const fromList = om[1].split("\n").filter(Boolean).map(l => weekdaysIn(l)[0]).filter(x => x !== undefined);
                if (fromList.length) order = fromList.concat(order.filter(x => !fromList.includes(x)));
            }
            const whenTxt = iC >= 0 ? r[iC] : "";
            sessions.push({
                id: id.trim(),
                name: rest.join(" · ").trim() || id.trim(),
                when: whenTxt,
                recorded: /ya grabad/i.test(whenTxt),
                date: /ya grabad/i.test(whenTxt) ? null : (when(whenTxt) || {}).date || null,
                who: iW >= 0 ? r[iW] : "",
                what,
                duration: iT >= 0 ? r[iT] : "",
                screen: /pantalla/i.test(rest.join(" ") + " " + what) && !order.length,
                days: order.map(w => dateForWeekday(w)).filter(Boolean),
            });
        });
    }

    // Una fecha limite o grabacion no puede caer despues de la pieza: "Dom" para
    // una pieza del lunes es el domingo anterior, no el del final de la semana.
    const weekBefore = iso => {
        const d = parseIso(iso);
        d.setDate(d.getDate() - 7);
        return isoDate(d);
    };
    pieces.forEach(p => {
        ["rawDue", "editDue"].forEach(k => {
            if (p[k] && p[k].date > p.date) p[k] = Object.assign({}, p[k], { date: weekBefore(p[k].date) });
        });
    });
    sessions.forEach(sess => {
        if (sess.date && sess.days.length && sess.date > sess.days.reduce((a, b) => (a > b ? a : b))) {
            sess.date = weekBefore(sess.date);
        }
    });

    // 9. Pendientes por confirmar: "☐ Antes del jueves: precios..."
    const pending = [];
    (globalMd.pendientes || "").split("\n").forEach(l => {
        const m = l.match(/^\s*-\s*(?:\[\s?[xX ]?\]\s*)?(.+)$/);
        if (!m) return;
        const txt = clean(m[1]);
        const pm = txt.match(/^([^:]{2,30}):\s*(.+)$/);
        const label = pm ? pm[1] : "";
        let due = null;
        if (/^hoy/i.test(label)) due = isoDate(dates[0]);
        else if (weekdaysIn(label).length) due = dateForWeekday(weekdaysIn(label)[0]);
        pending.push({ text: pm ? pm[2] : txt, label, due });
    });

    // 10. Resumen de la semana (primer parrafo)
    const summary = (globalMd.resumen || "")
        .split("\n")
        .filter(l => l.trim() && !/^(##|\s*\||```)/.test(l))
        .slice(0, 1)
        .join(" ");

    const guideKeys = ["resumen", "plan", "guia", "instruccion", "envio", "mensaje"];
    return {
        num,
        title: titleLine || `Semana ${num}`,
        startDate: isoDate(dates[0]),
        endDate: isoDate(dates[6]),
        summary: clean(summary),
        pieces,
        sessions,
        pending,
        rulesText: globalMd.reglas || "",
        guideText: guideKeys.filter(k => globalMd[k]).map(k => globalMd[k]).join("\n\n"),
        source: text,
    };
}
