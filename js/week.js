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
                done: same ? existing.done : reconcileDoneState(existing.text, existing.done || {}, p.text),
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
    if (st.baseStatus === "Publicado") return { key: "pub", label: "Publicado" };
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

/** Tarjeta de la proxima sesion de grabacion. */
function renderNextSessionHTML(week, today) {
    const sessions = (week.sessions || [])
        .map(sess => ({ sess, q: sessionQueue(week, sess) }))
        .filter(x => x.q.length && x.q.some(e => !isShotDone(e)));
    // El bloque pendiente mas antiguo primero: si uno se quedo atrasado, va antes que el de hoy
    const next = [...sessions].sort((a, b) => (a.sess.date || "9").localeCompare(b.sess.date || "9"))[0];

    if (!next) {
        return `
      <div class="today-card today-main">
        <div class="lbl">Grabación</div>
        <h3 class="today-title">Todo grabado</h3>
        <p class="today-sub">No quedan frases pendientes en los bloques de esta semana.</p>
      </div>`;
    }

    const { sess, q } = next;
    const doneN = q.filter(isShotDone).length;
    const byPiece = [];
    q.forEach(e => {
        let row = byPiece.find(r => r.script === e.script);
        if (!row) byPiece.push((row = { script: e.script, n: 0, d: 0 }));
        row.n++;
        if (isShotDone(e)) row.d++;
    });
    const isToday = sess.date === today;
    const isLate = sess.date && sess.date < today;
    const when = sess.date ? (isToday ? "Hoy" : shortDayLabel(sess.date)) : "";

    return `
    <div class="today-card today-main">
      <div class="lbl ${isLate ? "late" : ""}">${isToday ? "Hoy se graba" : isLate ? `Grabación pendiente desde el ${shortDayLabel(sess.date)}` : "Próxima grabación"}</div>
      <h3 class="today-title">Bloque ${esc(sess.id)} · ${esc(sess.name)}</h3>
      <p class="today-sub">${esc([when, timeIn(sess.when) || "", sess.duration].filter(Boolean).join(" · "))}</p>
      <ol class="session-pieces">
        ${byPiece.map(r => `
          <li class="${r.d === r.n ? "done" : ""}">
            <span>${esc(r.script.title)}</span>
            <span class="mono">${r.d}/${r.n}</span>
          </li>`).join("")}
      </ol>
      <button class="btn primary block" data-start-session="${esc(week.id)}|${esc(sess.id)}">
        ${doneN ? `Continuar sesión · ${doneN}/${q.length}` : `Empezar sesión · ${q.length} frases`}
      </button>
    </div>`;
}

/** Piezas que salen hoy, con sus historias y mensajes del dia. */
function renderTodayPiecesHTML(week, today) {
    const pieces = weekScripts(week).filter(s => s.day === today);
    if (!pieces.length) {
        const next = weekScripts(week).find(s => s.day > today);
        return `
      <div class="today-card">
        <div class="lbl">Hoy no se publica</div>
        ${next ? `<p class="today-sub">Siguiente: <b>${esc(next.title)}</b> · ${shortDayLabel(next.day)}${next.time ? `, ${esc(next.time)}` : ""}</p>` : ""}
      </div>`;
    }
    return pieces.map(s => {
        const stage = pieceStage(s);
        const parsed = parseScript(s.text);
        const tasks = parsed.secs
            .map((sec, i) => ({ sec, i }))
            .filter(x => x.sec.kind === "sec" && /historias|whatsapp/i.test(x.sec.title));
        return `
      <div class="today-card">
        <div class="lbl">Sale hoy${s.time ? ` · ${esc(s.time)}` : ""}</div>
        <button class="today-piece" data-open-script="${esc(s.id)}">
          <span class="today-title">${esc(s.title)}</span>
          <span class="stage stage-${stage.key}">${esc(stage.label)}</span>
        </button>
        ${tasks.map(({ sec, i }) => `
          <div class="today-tasks">
            <div class="today-tasks-h">${esc(sec.title)}</div>
            ${renderItemsHTML(sec, i, scriptOwner(s))}
          </div>`).join("")}
      </div>`;
    }).join("");
}

/** Fechas limite de material crudo y edicion para hoy (y atrasadas). */
function renderDeadlinesHTML(week, today) {
    const rows = [];
    weekScripts(week).forEach(s => {
        const prog = getProgress(s);
        const st = computeScriptStatus(s).baseStatus;
        const rawDone = prog.scenesTotal > 0 && prog.scenesDone === prog.scenesTotal;
        const editDone = ["Editado", "Programado", "Publicado"].includes(st);
        if (s.rawDue && !rawDone && s.rawDue.date <= today) rows.push({ s, due: s.rawDue, what: "Material crudo", late: s.rawDue.date < today });
        if (s.editDue && !editDone && s.editDue.date <= today) rows.push({ s, due: s.editDue, what: "Edición lista", late: s.editDue.date < today });
    });
    if (!rows.length) return "";
    return `
    <div class="today-card">
      <div class="lbl">Fechas límite</div>
      <ul class="deadline-list">
        ${rows.map(r => `
          <li class="${r.late ? "late" : ""}">
            <span class="mono">${r.late ? shortDayLabel(r.due.date) : esc(r.due.time || "Hoy")}</span>
            <span>${r.what} · ${esc(r.s.title)}</span>
          </li>`).join("")}
      </ul>
    </div>`;
}

/** Tira de 7 dias con las piezas de cada uno. */
function renderWeekStripHTML(week, today) {
    const scripts = weekScripts(week);
    const days = Array.from({ length: 7 }, (_, k) => {
        const d = parseIso(week.startDate);
        d.setDate(d.getDate() + k);
        return isoDate(d);
    });
    return `
    <section class="home-section">
      <div class="home-section-h">
        <h3>La semana</h3>
        <span class="legend">
          <i class="dot stage-todo"></i>Pendiente <i class="dot stage-wip"></i>En curso
          <i class="dot stage-ready"></i>Listo <i class="dot stage-pub"></i>Publicado <i class="dot stage-late"></i>Atrasado
        </span>
      </div>
      <div class="week-strip">
        ${days.map(day => {
            const items = scripts.filter(s => s.day === day);
            return `
          <div class="week-day ${day === today ? "is-today" : ""} ${day < today ? "is-past" : ""}">
            <div class="week-day-h">${shortDayLabel(day)}${day === today ? ` <span class="today-tag">hoy</span>` : ""}</div>
            <div class="week-day-items">
            ${items.length ? items.map(s => {
                const stage = pieceStage(s);
                return `
              <button class="piece-chip ${s.optional ? "optional" : ""}" data-open-script="${esc(s.id)}" title="${esc(stage.label)}">
                <i class="dot stage-${stage.key}"></i>
                <span class="piece-chip-body">
                  <span class="piece-chip-title">${esc(s.title)}</span>
                  <span class="piece-chip-meta">${esc([s.format, s.time].filter(Boolean).join(" · "))}${s.optional ? " · opcional" : ""}</span>
                </span>
              </button>`;
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
      <div class="home-section-h"><h3>Bloques de grabación</h3></div>
      <div class="session-list">
        ${sessions.map(sess => {
            const q = sessionQueue(week, sess);
            const d = q.filter(isShotDone).length;
            const pieces = [...new Set(q.map(e => e.script.title))];
            const complete = q.length && d === q.length;
            return `
          <div class="session-row ${complete ? "complete" : ""}">
            <div class="session-id">${esc(sess.id)}</div>
            <div class="session-body">
              <div class="session-name">${esc(sess.name)} <span class="muted">· ${esc(sess.when)}</span></div>
              <div class="session-meta">${esc(sess.recorded ? sess.what : pieces.join(" · ") || sess.what)}</div>
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
      <div class="home-section-h"><h3>Por confirmar</h3><span class="count-pill">${open} de ${pending.length}</span></div>
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
            <button class="icon-btn" data-dash-action="delete" data-script-id="${esc(s.id)}" title="Eliminar guion" aria-label="Eliminar ${esc(s.title)}">✕</button>
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
        <button class="btn ghost" id="btn-create-script-empty">Nuevo guion suelto</button>
      </div>
    </div>`;
}

/**
 * Renderiza la pantalla de Inicio: hoy, la semana, bloques y pendientes.
 */
function renderHome() {
    const root = $("dash-grid");
    if (!root) return;
    const week = getActiveWeek();
    if (!week) {
        root.innerHTML = renderWeekEmptyHTML() + renderLooseScriptsHTML();
        return;
    }

    const realToday = todayIso();
    const inWeek = realToday >= week.startDate && realToday <= week.endDate;
    const today = inWeek ? realToday : realToday < week.startDate ? week.startDate : week.endDate;
    const weeks = [...appData.weeks].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const wi = weeks.findIndex(w => w.id === week.id);

    root.innerHTML = `
    <div class="week-head">
      <div class="week-head-main">
        ${weeks.length > 1 ? `<button class="icon-btn" data-week-nav="-1" ${wi <= 0 ? "disabled" : ""} aria-label="Semana anterior">‹</button>` : ""}
        <div>
          <div class="lbl">${inWeek ? `Hoy · ${esc(longDate(realToday))}` : realToday < week.startDate ? "Empieza pronto" : "Semana terminada"}</div>
          ${week.summary ? `<p class="week-summary">${esc(week.summary.split(/(?<=\.)\s/)[0])}</p>` : ""}
        </div>
        ${weeks.length > 1 ? `<button class="icon-btn" data-week-nav="1" ${wi >= weeks.length - 1 ? "disabled" : ""} aria-label="Semana siguiente">›</button>` : ""}
      </div>
      <button class="btn small ghost" data-go-guide>Guía de la semana</button>
    </div>

    <div class="today-grid">
      ${renderNextSessionHTML(week, today)}
      <div class="today-side">
        ${renderTodayPiecesHTML(week, today)}
        ${renderDeadlinesHTML(week, today)}
      </div>
    </div>

    ${renderWeekStripHTML(week, today)}
    ${renderSessionsHTML(week, today)}
    ${renderPendingHTML(week, today)}
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
