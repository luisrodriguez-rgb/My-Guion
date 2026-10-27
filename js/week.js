/* ==========================================================================
   My-Guion - Semana de Produccion: piezas, sesiones de grabacion e Inicio
   ========================================================================== */

/**
 * Semana activa: la elegida, la que contiene hoy o la mas reciente.
 * @returns {object|null}
 */
function getActiveWeek() {
    const weeks = appData.weeks || [];
    let week = weeks.find(w => w.id === appData.activeWeekId);
    if (!week && weeks.length) {
        const t = todayIso();
        week = weeks.find(w => w.startDate <= t && t <= w.endDate) ||
            [...weeks].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
        appData.activeWeekId = week.id;
    }
    return week || null;
}

/** Piezas (guiones) de una semana, ordenadas por dia. */
function weekScripts(week) {
    return appData.scripts
        .filter(s => s.weekId === week.id)
        .sort((a, b) => (a.day || "").localeCompare(b.day || ""));
}

/**
 * Guarda un kit leido con parseKit. Si la semana ya existe (mismo numero y
 * fecha de inicio) la actualiza y conserva las tomas y casillas ya marcadas.
 * @param {object} kit - Resultado de parseKit.
 * @returns {{ week: object, isUpdate: boolean }}
 */
function importKit(kit) {
    let week = appData.weeks.find(w => w.num === kit.num && w.startDate === kit.startDate);
    const isUpdate = !!week;
    if (!week) {
        week = { id: "week-" + Date.now(), done: {}, createdAt: Date.now() };
        appData.weeks.push(week);
    }
    Object.assign(week, {
        num: kit.num,
        title: kit.title,
        startDate: kit.startDate,
        endDate: kit.endDate,
        summary: kit.summary,
        sessions: kit.sessions,
        pending: kit.pending,
        rulesText: kit.rulesText,
        guideText: kit.guideText,
        source: kit.source,
        updatedAt: Date.now(),
    });

    kit.pieces.forEach(p => {
        const meta = {
            weekId: week.id,
            day: p.date,
            publishDate: p.date,
            time: p.time,
            format: p.format,
            formatRaw: p.formatRaw,
            owner: p.owner,
            star: p.star,
            optional: p.optional,
            slatePrefix: p.slatePrefix,
            rawDue: p.rawDue,
            editDue: p.editDue,
        };
        const existing = appData.scripts.find(s => s.weekId === week.id && s.day === p.date);
        if (existing) {
            const same = existing.text === p.text;
            Object.assign(existing, meta, {
                title: p.title,
                text: p.text,
                done: Object.assign(
                    same ? {} : reconcileDoneState(existing.text, existing.done || {}, p.text),
                    // Casillas propias de la pieza (entregas): no dependen del texto
                    Object.fromEntries(Object.entries(existing.done || {}).filter(([k]) => same || k.startsWith("__")))
                ),
                takeCount: same ? existing.takeCount || {} : {},
                updatedAt: Date.now(),
            });
        } else {
            appData.scripts.push(Object.assign(newScriptRecord(p.title, p.text), meta, { takeCount: {} }));
        }
    });

    appData.activeWeekId = week.id;
    saveAppData();
    return { week, isUpdate };
}

/** Elimina una semana y sus piezas. */
function deleteWeek(id) {
    appData.weeks = appData.weeks.filter(w => w.id !== id);
    appData.scripts = appData.scripts.filter(s => s.weekId !== id);
    if (!appData.scripts.length) appData.scripts.push(newScriptRecord("Nuevo Guion", ""));
    if (!appData.scripts.some(s => s.id === appData.activeScriptId)) {
        appData.activeScriptId = appData.scripts[0].id;
    }
    if (appData.activeWeekId === id) appData.activeWeekId = null;
    if (appData.session && appData.session.weekId === id) appData.session = null;
    saveAppData();
}

/**
 * Frases a grabar de un guion, en orden, con su indice dentro de doc.secs.
 * @param {object} script
 * @returns {Array<{ script: object, sec: object, i: number, k: number }>}
 */
function buildScriptQueue(script) {
    const parsed = script === activeScript && typeof doc !== "undefined" && doc ? doc : parseScript(script.text);
    let k = 0;
    return parsed.secs
        .map((sec, i) => ({ sec, i }))
        .filter(x => x.sec.kind === "scene")
        .map(x => ({ script, sec: x.sec, i: x.i, k: k++ }));
}

/** Frases que se graban en pantalla (no a camara). */
function isScreenShot(sec) {
    return /grabaci[oó]n de pantalla/i.test(`${sec.title} ${sec.action}`);
}

/**
 * Frases de un bloque de grabacion, en el orden recomendado: solo las de las
 * personas del bloque (gemelos o colaboradora) y sin grabaciones de pantalla,
 * salvo que el bloque sea el de pantallas.
 * @param {object} week
 * @param {object} sess - Bloque de week.sessions.
 * @returns {Array<object>} Cola de grabacion.
 */
function sessionQueue(week, sess) {
    if (!week || !sess || sess.recorded) return [];
    const scripts = weekScripts(week);
    const people = `${sess.who} ${sess.name}`;
    const kw = /gemel/i.test(people) ? "gemel" : /colabor|bogot/i.test(people) ? "colabor" : "";
    const matchWho = sec => {
        const who = sec.who || "";
        const code = sec.code || "";
        const hasPerson = who || /_(?:G|A|B|AB|C)_F/i.test(code);
        if (!kw || !hasPerson) return true;
        if (kw === "gemel") return /gemel|los dos|ambos/i.test(who) || /_(?:G|A|B|AB)_F/i.test(code);
        return /colabor/i.test(who) || /_C_F/i.test(code);
    };
    const days = sess.screen ? scripts.map(s => s.day) : sess.days || [];
    const out = [];
    days.forEach(day => {
        const script = scripts.find(s => s.day === day);
        if (!script) return;
        buildScriptQueue(script).forEach(e => {
            const ok = sess.screen ? isScreenShot(e.sec) : !isScreenShot(e.sec) && matchWho(e.sec);
            if (ok) out.push(e);
        });
    });
    return out;
}

const isShotDone = e => !!(e.script.done && e.script.done["s" + e.i]);

/**
 * Etapa de una pieza para la vista de semana.
 * @returns {{ key: string, label: string }} key: todo | wip | ready | pub | late
 */
function pieceStage(s) {
    const st = computeScriptStatus(s);
    const prog = getProgress(s);
    if (st.baseStatus === "Publicado") return { key: "pub", label: s.format === "Grabación" ? "Hecho" : "Publicado" };
    if (s.day && s.day < todayIso()) return { key: "late", label: "Atrasado" };
    if (st.baseStatus === "Editado" || st.baseStatus === "Programado") return { key: "ready", label: "Listo para publicar" };
    if (prog.done > 0) return { key: "wip", label: st.label };
    return { key: "todo", label: prog.scenesTotal ? `Por grabar · ${prog.scenesTotal} frases` : "Pendiente" };
}

/** Fecha larga: "martes 27 de octubre". */
function longDate(iso) {
    return parseIso(iso).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
}

/** Rango corto de la semana: "26 oct – 1 nov". */
function weekRange(week) {
    const f = iso => {
        const d = parseIso(iso);
        return `${d.getDate()} ${MONTHS_ES[d.getMonth()]}`;
    };
    return `${f(week.startDate)} – ${f(week.endDate)}`;
}

/** Progreso de la semana: porcentaje medio de sus piezas. */
function weekProgress(week) {
    const scripts = weekScripts(week);
    if (!scripts.length) return 0;
    return Math.round(scripts.reduce((acc, s) => acc + getProgress(s).percent, 0) / scripts.length);
}

/** Dueño de casillas para renderItemsHTML: un guion o la semana. */
function scriptOwner(script) {
    return script === activeScript
        ? { done: script.done || {}, attr: "data-k", ns: "" }
        : { done: script.done || {}, attr: "data-sk", ns: script.id + "|" };
}

function weekOwner(week, prefix) {
    week.done = week.done || {};
    return { done: week.done, attr: "data-wk", ns: `${week.id}|${prefix}`, key: prefix };
}

/** Clave estable de un pendiente (sobrevive a reimportar el kit). */
const pendingKey = p => "p:" + clean(p.text).toLowerCase().slice(0, 60);

// -----------------------------------------------------------------------------
// Pantalla de Inicio
// -----------------------------------------------------------------------------

/** Estado de la interfaz del Inicio que no se guarda (formularios abiertos). */
const homeUI = { editingMsg: false, teamForm: null };

/** Una pieza esta hecha cuando se marco como publicada (o "hecha", si es grabacion). */
const isPieceDone = s => computeScriptStatus(s).baseStatus === "Publicado";

/** Marca o desmarca una pieza como hecha desde el Inicio. */
function setPieceDone(s, done) {
    s.manualStatus = done ? "Publicado" : null;
    s.updatedAt = Date.now();
    computeScriptStatus(s);
    saveAppData();
}

/** Dias (YYYY-MM-DD) de la semana. */
function weekDays(week) {
    return Array.from({ length: 7 }, (_, k) => {
        const d = parseIso(week.startDate);
        d.setDate(d.getDate() + k);
        return isoDate(d);
    });
}

/** Cifras de la semana para los graficos. */
function weekStats(week, today) {
    const scripts = weekScripts(week);
    let shots = 0;
    let shotsDone = 0;
    scripts.forEach(s => {
        const p = getProgress(s);
        shots += p.scenesTotal;
        shotsDone += p.scenesDone;
    });
    const days = weekDays(week).map(day => scripts.filter(s => s.day === day));
    return {
        pct: weekProgress(week),
        shots,
        shotsDone,
        pieces: scripts.length,
        piecesDone: scripts.filter(isPieceDone).length,
        daysDone: days.filter(list => list.length && list.every(isPieceDone)).length,
        daysWithWork: days.filter(list => list.length).length,
        // Todo lo atrasado: piezas de dias pasados y lo vencido de la lista de hoy
        late: scripts.filter(s => !isPieceDone(s) && s.day < today).length + todayItems(week, today).filter(it => it.late).length,
    };
}

/**
 * Lo que hay que hacer hoy, en orden: grabaciones (incluidas las atrasadas),
 * entregas al editor, publicaciones con sus historias y pendientes.
 * Las grabaciones y entregas se marcan solas; el resto se marca a mano.
 */
function todayItems(week, today) {
    const items = [];
    const scripts = weekScripts(week);
    const team = getTeam();
    const peopleFor = text => team.filter(m => fold(text).includes(fold(m.name).split(" ")[0]) || (m.role && fold(text).includes(fold(m.role).slice(0, 6))));

    (week.sessions || []).forEach(sess => {
        if (sess.recorded || !sess.date || sess.date > today) return;
        const q = sessionQueue(week, sess);
        if (!q.length) return;
        const d = q.filter(isShotDone).length;
        const done = d === q.length;
        if (sess.date < today && done) return;
        items.push({
            icon: "clapper",
            text: `Grabar bloque ${sess.id} · ${sess.name}`,
            meta: [sess.date < today ? `desde el ${shortDayLabel(sess.date)}` : timeIn(sess.when), `${d}/${q.length} frases`, sess.who].filter(Boolean).join(" · "),
            people: peopleFor(`${sess.who} ${sess.name}`),
            done,
            late: !done && sess.date < today,
            auto: "Se marca solo cuando se graban todas las frases",
            action: done ? "" : `<button class="btn small primary" data-start-session="${esc(week.id)}|${esc(sess.id)}">${icon("play")} ${d ? "Continuar" : "Empezar"}</button>`,
        });
    });

    scripts.forEach(s => {
        const prog = getProgress(s);
        const st = computeScriptStatus(s).baseStatus;
        const done = s.done || {};
        // Entregas: se marcan a mano (subir el crudo a Drive no lo sabe la app)
        const rawDone = !!done.__raw;
        const editDone = !!done.__edit || ["Editado", "Programado", "Publicado"].includes(st);
        const due = (d, what, ok, ic, key) => {
            if (!d || d.date > today || (d.date < today && ok)) return;
            const pending = key === "__raw" && prog.scenesTotal > prog.scenesDone ? ` · faltan ${prog.scenesTotal - prog.scenesDone} frases por grabar` : "";
            items.push({
                icon: ic,
                text: `${what} · ${s.title}`,
                meta: (d.date < today ? `era para el ${shortDayLabel(d.date)}` : `antes de las ${d.time || "fin del día"}`) + pending,
                people: [],
                done: ok,
                late: !ok && d.date < today,
                check: `data-sk="${esc(s.id)}|${key}"`,
                open: s.id,
            });
        };
        due(s.rawDue, "Material crudo al editor", rawDone, "send", "__raw");
        due(s.editDue, "Edición lista", editDone, "scissors", "__edit");
    });

    scripts.filter(s => s.day === today).forEach(s => {
        const parsed = parseScript(s.text);
        const subs = parsed.secs
            .map((sec, i) => ({ sec, i }))
            .filter(x => x.sec.kind === "sec" && /historias|whatsapp/i.test(x.sec.title) && x.sec.lines.some(l => l.t === "item"));
        items.push({
            icon: formatIcon(s.format),
            text: `${s.format === "Grabación" ? "" : "Publicar "}${s.title}`,
            meta: [s.time, s.formatRaw || s.format].filter(Boolean).join(" · "),
            people: piecePeople(s).people,
            note: s.note,
            done: isPieceDone(s),
            check: `data-piece-done="${esc(s.id)}"`,
            open: s.id,
            subs: subs.map(({ sec, i }) => ({ title: sec.title, html: renderItemsHTML(sec, i, scriptOwner(s)), sec, i, s })),
        });
    });

    const owner = weekOwner(week, "");
    (week.pending || []).forEach(p => {
        if (!p.due || p.due > today) return;
        const key = pendingKey(p);
        const done = !!owner.done[key];
        if (done && p.due < today) return;
        items.push({
            icon: "alert",
            text: p.text.charAt(0).toUpperCase() + p.text.slice(1),
            meta: p.due < today ? `pendiente desde el ${shortDayLabel(p.due)}` : "confirmar hoy",
            people: [],
            done,
            late: !done && p.due < today,
            check: `data-wk="${esc(week.id)}|${esc(key)}"`,
        });
    });
    return items;
}

/** Cuenta casillas hechas de una lista de hoy (incluye historias). */
function countToday(items) {
    let n = 0;
    let d = 0;
    items.forEach(it => {
        n++;
        if (it.done) d++;
        (it.subs || []).forEach(sub => sub.sec.lines.forEach((l, k) => {
            if (l.t !== "item") return;
            n++;
            if (sub.s.done && sub.s.done[`${sub.i}-${k}`]) d++;
        }));
    });
    return { n, d };
}

/** Checklist "Hoy": lo que toca, quien lo hace y si ya esta. */
function renderTodayChecklistHTML(week, today, isRealToday) {
    const items = todayItems(week, today);
    const { n, d } = countToday(items);
    const allDone = n > 0 && d === n;
    const pct = n ? Math.round((d / n) * 100) : 100;

    const row = it => `
      <li class="todo ${it.done ? "on" : ""} ${it.late ? "late" : ""}">
        ${it.check
            ? `<input type="checkbox" class="todo-check" ${it.check} ${it.done ? "checked" : ""} aria-label="Marcar: ${esc(it.text)}">`
            : `<span class="todo-check auto ${it.done ? "on" : ""}" title="${esc(it.auto || "")}">${it.done ? icon("check") : ""}</span>`}
        <span class="todo-icon">${icon(it.icon)}</span>
        <div class="todo-body">
          ${it.open ? `<button class="todo-text link" data-open-script="${esc(it.open)}">${esc(it.text)}</button>` : `<span class="todo-text">${esc(it.text)}</span>`}
          <div class="todo-meta">
            ${it.late ? `<span class="tag-late">Atrasado</span>` : ""}
            <span>${esc(it.meta || "")}</span>
            ${avatarsHTML(it.people || [], "sm")}
          </div>
          ${it.note ? `<div class="todo-note">${icon("note")}${esc(it.note)}</div>` : ""}
          ${(it.subs || []).map(sub => `<div class="todo-subs"><div class="todo-subs-h">${icon("story")} ${esc(sub.title)}</div>${sub.html}</div>`).join("")}
        </div>
        ${it.action || ""}
      </li>`;

    return `
    <div class="today-card today-main">
      <div class="today-head">
        <div>
          <div class="lbl">${isRealToday ? `Hoy · ${esc(longDate(today))}` : `Día · ${esc(longDate(today))}`}</div>
          <h3 class="today-title">${allDone ? "Todo listo por hoy" : n ? "Lo que hay que hacer" : "Hoy no hay tareas"}</h3>
        </div>
        ${n ? `<div class="today-count"><b>${d}</b>/${n}</div>` : ""}
      </div>
      ${n ? `<div class="meter"><i style="width:${pct}%"></i></div>` : ""}
      ${allDone ? `<div class="all-done">${icon("trophy")}<span>Ya está todo lo de hoy. Si quieres adelantar, mira lo de mañana en la semana.</span></div>` : ""}
      ${n ? `<ul class="todo-list">${items.map(row).join("")}</ul>` : `<p class="today-sub">Revisa la semana para adelantar trabajo.</p>`}
    </div>`;
}

/** Proxima grabacion que no es de hoy (las de hoy y atrasadas ya estan en la checklist). */
function renderNextSessionHTML(week, today) {
    const next = (week.sessions || [])
        .filter(sess => !sess.recorded && sess.date && sess.date > today)
        .map(sess => ({ sess, q: sessionQueue(week, sess) }))
        .filter(x => x.q.some(e => !isShotDone(e)))
        .sort((a, b) => a.sess.date.localeCompare(b.sess.date))[0];
    if (!next) return "";
    const { sess, q } = next;
    const pieces = [...new Set(q.map(e => e.script.title))];
    return `
    <div class="today-card">
      <div class="lbl">${icon("clapper")} Próxima grabación</div>
      <h3 class="today-title sm">Bloque ${esc(sess.id)} · ${esc(sess.name)}</h3>
      <p class="today-sub">${esc([shortDayLabel(sess.date), timeIn(sess.when), sess.duration].filter(Boolean).join(" · "))}</p>
      <ul class="mini-list">${pieces.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
      <button class="btn small block-sm" data-start-session="${esc(week.id)}|${esc(sess.id)}">${icon("play")} Abrir sesión · ${q.length} frases</button>
    </div>`;
}

/** Quien trabaja hoy: personas asignadas a lo de hoy. */
function renderTodayPeopleHTML(week, today) {
    const team = getTeam();
    if (!team.length) return "";
    // Quien tiene algo en la lista de hoy (grabaciones, piezas y entregas)
    const busy = new Set(todayItems(week, today).filter(it => !it.done).flatMap(it => it.people || []));
    const people = team.filter(m => busy.has(m));
    if (!people.length) return "";
    return `
    <div class="today-card">
      <div class="lbl">${icon("users")} Hoy trabajan</div>
      <ul class="people-list">
        ${people.map(m => `<li>${avatarsHTML([m])}<span><b>${esc(m.name)}</b>${m.role ? ` · ${esc(m.role)}` : ""}${m.note ? `<span class="muted"> — ${esc(m.note)}</span>` : ""}</span></li>`).join("")}
      </ul>
    </div>`;
}

/** Anillo de progreso en SVG. */
function donutHTML(pct, label) {
    const r = 34;
    const c = 2 * Math.PI * r;
    return `
    <div class="donut" role="img" aria-label="${pct}% ${esc(label)}">
      <svg viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="${r}" class="donut-track"/>
        <circle cx="40" cy="40" r="${r}" class="donut-fill" stroke-dasharray="${(c * pct) / 100} ${c}" transform="rotate(-90 40 40)"/>
      </svg>
      <div class="donut-label"><b>${pct}%</b><span>${esc(label)}</span></div>
    </div>`;
}

/** Fila de graficos: avance de la semana y cifras clave. */
function renderStatsHTML(week, today) {
    const st = weekStats(week, today);
    const bar = (a, b) => `<div class="meter sm"><i style="width:${b ? Math.round((a / b) * 100) : 0}%"></i></div>`;
    const card = (ic, label, value, extra, cls = "") => `
      <div class="stat ${cls}">
        <div class="stat-h">${icon(ic)}<span>${label}</span></div>
        <div class="stat-v">${value}</div>
        ${extra}
      </div>`;
    return `
    <div class="stats">
      ${donutHTML(st.pct, "semana")}
      ${card("clapper", "Frases grabadas", `${st.shotsDone}<small>/${st.shots}</small>`, bar(st.shotsDone, st.shots))}
      ${card("send", "Piezas publicadas", `${st.piecesDone}<small>/${st.pieces}</small>`, bar(st.piecesDone, st.pieces))}
      ${card("calendar", "Días listos", `${st.daysDone}<small>/${st.daysWithWork}</small>`, bar(st.daysDone, st.daysWithWork))}
      ${card("alert", "Atrasado", `${st.late}`, `<div class="stat-foot">${st.late ? "cosas de días pasados sin terminar" : "nada atrasado"}</div>`, st.late ? "is-late" : "is-ok")}
    </div>`;
}

/** Mensaje fijo de la semana para el equipo (editable). */
function renderWeekMessageHTML(week) {
    if (homeUI.editingMsg) {
        return `
      <div class="week-msg editing">
        <span class="week-msg-icon">${icon("megaphone")}</span>
        <div class="week-msg-body">
          <div class="lbl">Mensaje de la semana para el equipo</div>
          <textarea id="week-msg-input" rows="3" placeholder="Ej.: Esta semana lanzamos el Intensivo el jueves. Lo más importante: grabar el lunes todo lo de los gemelos.">${esc(week.message || week.summary || "")}</textarea>
          <div class="row"><button class="btn primary small" data-msg-save>Guardar</button><button class="btn ghost small" data-msg-cancel>Cancelar</button></div>
        </div>
      </div>`;
    }
    // Los kits cargados antes guardaban la fila de encabezado de la tabla en el resumen
    const text = week.message || String(week.summary || "").replace(/\s*\|.*$/, "");
    return `
    <div class="week-msg">
      <span class="week-msg-icon">${icon("megaphone")}</span>
      <div class="week-msg-body">
        <div class="lbl">${week.message ? "Mensaje de la semana" : "De qué se trata esta semana"}</div>
        <p>${esc(text || "Escribe aquí lo más importante de la semana para que cualquiera del equipo lo entienda al entrar.")}</p>
      </div>
      <button class="icon-btn" data-msg-edit aria-label="Editar mensaje de la semana">${icon("pencil")}</button>
    </div>`;
}

/** Guia rapida para quien entra por primera vez. */
function renderHelpHTML() {
    if (appData.helpDismissed) return "";
    const step = (n, ic, title, body) => `
      <li><span class="help-n">${n}</span><div><b>${icon(ic)} ${title}</b><p>${body}</p></div></li>`;
    return `
    <div class="help-card">
      <div class="help-head">
        <h3>${icon("help")} Cómo usar esta pantalla</h3>
        <button class="btn small ghost" data-help-dismiss>Entendido</button>
      </div>
      <ol class="help-steps">
        ${step(1, "check", "Mira «Lo que hay que hacer»", "Es la lista de hoy. Marca cada cosa cuando la termines. Las grabaciones se marcan solas al terminar la sesión.")}
        ${step(2, "clapper", "Para grabar, toca Empezar", "La app muestra la frase, el nombre del archivo y cuántas tomas van. Barra espaciadora = toma lista.")}
        ${step(3, "calendar", "Cierra cada día en La semana", "Marca la casilla de cada pieza cuando se publique. Cuando todas están, el día queda tachado.")}
      </ol>
    </div>`;
}

/** Tira de 7 dias: casilla por dia y por pieza, avance y quien la hace. */
function renderWeekStripHTML(week, today) {
    const scripts = weekScripts(week);
    return `
    <section class="home-section">
      <div class="home-section-h">
        <h3>${icon("calendar")} La semana</h3>
        <span class="legend">
          <i class="dot stage-todo"></i>Pendiente <i class="dot stage-wip"></i>En curso
          <i class="dot stage-ready"></i>Listo <i class="dot stage-pub"></i>Publicado <i class="dot stage-late"></i>Atrasado
        </span>
      </div>
      <div class="week-strip">
        ${weekDays(week).map(day => {
            const items = scripts.filter(s => s.day === day);
            const dayDone = items.length > 0 && items.every(isPieceDone);
            const pct = items.length ? Math.round(items.reduce((a, s) => a + (isPieceDone(s) ? 100 : getProgress(s).percent), 0) / items.length) : 0;
            return `
          <div class="week-day ${day === today ? "is-today" : ""} ${day < today ? "is-past" : ""} ${dayDone ? "is-done" : ""}">
            <div class="week-day-h">
              ${items.length ? `<input type="checkbox" class="day-check" data-day-done="${day}" ${dayDone ? "checked" : ""} aria-label="Marcar todo el ${esc(longDate(day))} como hecho">` : ""}
              <span class="week-day-label">${shortDayLabel(day)}</span>${day === today ? ` <span class="today-tag">hoy</span>` : ""}
            </div>
            ${items.length ? `<div class="meter xs"><i style="width:${pct}%"></i></div>` : ""}
            <div class="week-day-items">
            ${items.length ? items.map(s => {
                const stage = pieceStage(s);
                const done = isPieceDone(s);
                return `
              <div class="piece-chip ${s.optional ? "optional" : ""} ${done ? "done" : ""}">
                <input type="checkbox" class="chip-check" data-piece-done="${esc(s.id)}" ${done ? "checked" : ""} aria-label="Marcar ${esc(s.title)} como hecha">
                <button class="piece-chip-body" data-open-script="${esc(s.id)}" title="${esc(stage.label)}">
                  <span class="piece-chip-title"><i class="dot stage-${stage.key}"></i>${esc(s.title)}</span>
                  <span class="piece-chip-meta">${icon(formatIcon(s.format))}${esc([s.format, s.time].filter(Boolean).join(" · "))}${s.optional ? " · opcional" : ""}</span>
                  ${avatarsHTML(piecePeople(s).people, "sm")}${s.note ? `<span class="chip-note" title="${esc(s.note)}">${icon("note")}</span>` : ""}
                </button>
              </div>`;
            }).join("") : `<div class="week-day-empty">—</div>`}
            </div>
          </div>`;
        }).join("")}
      </div>
    </section>`;
}

/** Bloques de grabacion de la semana con su avance. */
function renderSessionsHTML(week, today) {
    const sessions = week.sessions || [];
    if (!sessions.length) return "";
    return `
    <section class="home-section">
      <div class="home-section-h"><h3>${icon("clapper")} Bloques de grabación</h3></div>
      <div class="session-list">
        ${sessions.map(sess => {
            const q = sessionQueue(week, sess);
            const d = q.filter(isShotDone).length;
            const pieces = [...new Set(q.map(e => e.script.title))];
            const complete = q.length && d === q.length;
            const late = !complete && q.length && sess.date && sess.date < today;
            return `
          <div class="session-row ${complete ? "complete" : ""} ${late ? "late" : ""}">
            <div class="session-id">${complete ? icon("check") : esc(sess.id)}</div>
            <div class="session-body">
              <div class="session-name">${esc(sess.name)} <span class="muted">· ${esc(sess.when)}</span>${late ? ` <span class="tag-late">Atrasado</span>` : ""}</div>
              <div class="session-meta">${esc(sess.recorded ? sess.what : pieces.join(" · ") || sess.what)}</div>
              ${q.length ? `<div class="meter xs"><i style="width:${Math.round((d / q.length) * 100)}%"></i></div>` : ""}
            </div>
            ${sess.recorded
                ? `<span class="muted mono">ya grabado</span>`
                : q.length
                    ? `<span class="mono session-count">${d}/${q.length}</span>
                       <button class="btn small ${complete ? "ghost" : ""}" data-start-session="${esc(week.id)}|${esc(sess.id)}">${complete ? "Revisar" : d ? "Continuar" : "Grabar"}</button>`
                    : `<span class="muted mono">sin frases</span>`}
          </div>`;
        }).join("")}
      </div>
    </section>`;
}

/** Pendientes por confirmar, con casilla y fecha. */
function renderPendingHTML(week, today) {
    const pending = week.pending || [];
    if (!pending.length) return "";
    const owner = weekOwner(week, "");
    const open = pending.filter(p => !owner.done[pendingKey(p)]).length;
    return `
    <section class="home-section">
      <div class="home-section-h"><h3>${icon("alert")} Por confirmar</h3><span class="count-pill">${open ? `${open} sin confirmar` : "todo confirmado"}</span></div>
      <div class="items">
        ${pending.map(p => {
            const key = pendingKey(p);
            const on = !!owner.done[key];
            const late = !on && p.due && p.due < today;
            const dueTxt = p.due ? (p.due === today ? "Hoy" : shortDayLabel(p.due)) : p.label;
            return `
          <label class="item ${on ? "on" : ""}">
            <input type="checkbox" data-wk="${esc(week.id)}|${esc(key)}" ${on ? "checked" : ""}>
            <span>${esc(p.text.charAt(0).toUpperCase() + p.text.slice(1))}</span>
            ${dueTxt ? `<span class="due ${late ? "late" : ""} ${p.due === today && !on ? "now" : ""}">${esc(dueTxt)}</span>` : ""}
          </label>`;
        }).join("")}
      </div>
    </section>`;
}

/** Guiones sueltos (sin semana). */
function renderLooseScriptsHTML() {
    const loose = appData.scripts.filter(s => !s.weekId && (s.text || "").trim());
    if (!loose.length) return "";
    return `
    <details class="home-section loose-scripts" ${appData.weeks.length ? "" : "open"}>
      <summary class="home-section-h"><h3>Guiones sueltos</h3><span class="count-pill">${loose.length}</span></summary>
      <div class="loose-list">
        ${loose.map(s => {
            const st = computeScriptStatus(s);
            const prog = getProgress(s);
            return `
          <div class="loose-row" data-open-script="${esc(s.id)}">
            <span class="loose-title">${esc(s.title)}</span>
            <span class="dash-status ${st.cls}">${esc(st.label)}</span>
            <span class="mono muted">${prog.scenesDone}/${prog.scenesTotal}</span>
            <button class="icon-btn" data-dash-action="delete" data-script-id="${esc(s.id)}" title="Eliminar guion" aria-label="Eliminar ${esc(s.title)}">${icon("x")}</button>
          </div>`;
        }).join("")}
      </div>
    </details>`;
}

/** Estado vacio: todavia no hay semana cargada. */
function renderWeekEmptyHTML() {
    return `
    <div class="week-empty">
      <div class="lbl">Empieza por la semana</div>
      <h2>Carga el kit de producción</h2>
      <p class="hint">Pega el documento "Semana N · Kit de producción" tal como sale de Claude o de Word. My-Guion arma los días, los bloques de grabación con sus frases, las fechas límite y los pendientes.</p>
      <div class="row">
        <button class="btn primary" data-go-import>Cargar semana</button>
        <button class="btn ghost" data-import-backup>Importar respaldo</button>
        <button class="btn ghost" id="btn-create-script-empty">Nuevo guion suelto</button>
      </div>
      <p class="week-empty-note">Las semanas se guardan solo en este navegador. Si la cargaste en otro navegador o en el celular, vuelve a pegar el kit aquí, o descarga el respaldo allá (menú ⋯) e impórtalo aquí.</p>
    </div>`;
}

/**
 * Renderiza la pantalla de Inicio: mensaje, avance, hoy, la semana, bloques,
 * pendientes y equipo.
 */
function renderHome() {
    const root = $("dash-grid");
    if (!root) return;
    const week = getActiveWeek();
    if (!week) {
        root.innerHTML = renderWeekEmptyHTML() + renderTeamHTML(null) + renderLooseScriptsHTML();
        return;
    }

    const realToday = todayIso();
    const inWeek = realToday >= week.startDate && realToday <= week.endDate;
    const today = inWeek ? realToday : realToday < week.startDate ? week.startDate : week.endDate;
    const weeks = [...appData.weeks].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const wi = weeks.findIndex(w => w.id === week.id);
    const side = renderNextSessionHTML(week, today) + renderTodayPeopleHTML(week, today);

    root.innerHTML = `
    ${weeks.length > 1 ? `
    <div class="week-switch">
      <button class="icon-btn" data-week-nav="-1" ${wi <= 0 ? "disabled" : ""} aria-label="Semana anterior">‹</button>
      <span class="mono">Semana ${esc(week.num)} de ${weeks.length} cargadas</span>
      <button class="icon-btn" data-week-nav="1" ${wi >= weeks.length - 1 ? "disabled" : ""} aria-label="Semana siguiente">›</button>
    </div>` : ""}

    <div class="home-top">
      ${renderWeekMessageHTML(week)}
      <button class="btn small ghost" data-go-guide>${icon("note")} Guía de la semana</button>
    </div>
    ${renderHelpHTML()}
    ${renderStatsHTML(week, today)}

    <div class="today-grid ${side.trim() ? "" : "single"}">
      ${renderTodayChecklistHTML(week, today, inWeek)}
      ${side.trim() ? `<div class="today-side">${side}</div>` : ""}
    </div>

    ${renderWeekStripHTML(week, today)}
    ${renderSessionsHTML(week, today)}
    ${renderPendingHTML(week, today)}
    ${renderTeamHTML(week)}
    ${renderLooseScriptsHTML()}`;
}

/**
 * Renderiza la guia de la semana: reglas de grabacion y material para el equipo.
 */
function renderGuide() {
    const root = $("guia");
    const week = getActiveWeek();
    if (!root) return;
    if (!week) {
        root.innerHTML = `<p class="empty">Todavía no hay una semana cargada.</p>`;
        return;
    }
    const section = (sec, i, owner) => sec.kind === "sec" && sec.lines.length ? `
      <div class="card ${sec.phase === "notas" ? "notes" : ""}">
        ${sec.title ? `<h3>${esc(sec.title)}</h3>` : ""}
        ${renderItemsHTML(sec, i, owner)}
      </div>` : "";
    const rules = parseScript(week.rulesText || "");
    const guide = parseScript(week.guideText || "");
    root.innerHTML = `
    <div class="guide-head">
      <h2>${esc(week.title)}</h2>
      <p class="hint">Reglas de grabación, guía de edición y mensajes listos para copiar y mandar al equipo.</p>
    </div>
    <div class="list">
      ${guide.secs.map((sec, i) => section(sec, i, weekOwner(week, "g"))).join("")}
      ${rules.secs.map((sec, i) => section(sec, i, weekOwner(week, "r"))).join("")}
    </div>`;
}
