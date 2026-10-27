/* ==========================================================================
   My-Guion - Controlador Principal de la Aplicacion y Dashboard
   ========================================================================== */

// Inicializacion de almacenamiento y estado
loadAppData();
let activeScript = getActiveScript();
let doc = parseScript(activeScript.text);
let isNewScript = false;

// Utilidades DOM
const $ = id => document.getElementById(id);
const esc = s =>
    String(s ?? "").replace(
        /[&<>"]/g,
        c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );

// Consultas estructuradas sobre el guion activo
const getScenes = () =>
    doc.secs.map((s, i) => ({ s, i })).filter(x => x.s.kind === "scene");
const getSecsOf = ph =>
    doc.secs
        .map((s, i) => ({ s, i }))
        .filter(x => x.s.kind === "sec" && x.s.phase === ph);
const isSceneDone = i => !!activeScript.done["s" + i];


/**
 * Fases que tienen contenido disponible en el guion actual.
 */
function getShownPhases() {
    return PHASES.filter(p =>
        p.id === "grabar"
            ? getScenes().length > 0 || getSecsOf("grabar").length > 0
            : getSecsOf(p.id).length > 0
    );
}

/**
 * Calcula el progreso de un guion usando las mismas claves que Plan y Grabar:
 * - Escenas ("s" + i, donde i es el indice dentro de doc.secs)
 * - Items de fase (i + "-" + k, donde i es el indice dentro de doc.secs y k el de la linea)
 * @param {object} [script] - Objeto de guion (por defecto activeScript).
 * @returns {{
 *   scenesTotal: number,
 *   scenesDone: number,
 *   scenePc: number,
 *   total: number,
 *   done: number,
 *   percent: number,
 *   byPhase: Object.<string, { d: number, n: number }>
 * }}
 */
function getProgress(script) {
    const s = script || activeScript;
    if (!s || !s.text) {
        return {
            scenesTotal: 0,
            scenesDone: 0,
            scenePc: 0,
            total: 0,
            done: 0,
            percent: 0,
            byPhase: {},
        };
    }

    const parsed = (s === activeScript && typeof doc !== "undefined" && doc) ? doc : parseScript(s.text);
    const doneMap = s.done || {};

    let scenesTotal = 0;
    let scenesDone = 0;
    let itemsTotal = 0;
    let itemsDone = 0;

    const byPhase = {};
    PHASES.forEach(p => {
        byPhase[p.id] = { d: 0, n: 0 };
    });

    parsed.secs.forEach((sec, i) => {
        if (sec.kind === "scene") {
            scenesTotal++;
            const isDone = !!doneMap["s" + i];
            if (isDone) scenesDone++;
            if (byPhase["grabar"]) {
                byPhase["grabar"].n++;
                if (isDone) byPhase["grabar"].d++;
            }
        } else if (sec.kind === "sec") {
            const ph = sec.phase || "notas";
            sec.lines.forEach((l, k) => {
                if (l.t === "item") {
                    itemsTotal++;
                    const isDone = !!doneMap[`${i}-${k}`];
                    if (isDone) itemsDone++;
                    if (byPhase[ph]) {
                        byPhase[ph].n++;
                        if (isDone) byPhase[ph].d++;
                    }
                }
            });
        }
    });

    const total = scenesTotal + itemsTotal;
    const done = scenesDone + itemsDone;
    const percent = total ? Math.round((done / total) * 100) : 0;
    const scenePc = scenesTotal ? Math.round((scenesDone / scenesTotal) * 100) : 0;

    return {
        scenesTotal,
        scenesDone,
        scenePc,
        total,
        done,
        percent,
        byPhase,
    };
}

/**
 * Conserva el progreso completado (done) entre la version previa y la nueva de un guion,
 * manteniendo las escenas e items cuyo texto no haya cambiado.
 * @param {string} oldText - Texto original del guion.
 * @param {object} oldDone - Estado de casillas marcadas anterior.
 * @param {string} newText - Nuevo texto a organizar.
 * @returns {object} Objeto con las casillas preservadas.
 */
function reconcileDoneState(oldText, oldDone, newText) {
    if (!oldDone || !Object.keys(oldDone).length) return {};
    if (oldText === newText) return Object.assign({}, oldDone);

    const oldParsed = parseScript(oldText);
    const newParsed = parseScript(newText);
    const newDone = {};

    const doneSignatures = new Set();
    const doneTitles = new Set();
    const doneSceneIndexes = new Set();

    let oldSceneIdx = 0;
    oldParsed.secs.forEach((sec, i) => {
        if (sec.kind === "scene") {
            if (oldDone["s" + i]) {
                const sig = [clean(sec.title), clean(sec.action), (sec.says || []).map(x => clean(x.v)).join(" ")].join("||");
                doneSignatures.add(sig);
                if (sec.title) doneTitles.add(clean(sec.title));
                doneSceneIndexes.add(oldSceneIdx);
            }
            oldSceneIdx++;
        }
    });

    const doneItems = new Set();
    oldParsed.secs.forEach((sec, i) => {
        if (sec.kind === "sec") {
            sec.lines.forEach((l, k) => {
                if (l.t === "item" && oldDone[`${i}-${k}`]) {
                    doneItems.add(clean(l.v));
                }
            });
        }
    });

    let newSceneIdx = 0;
    const sameSceneCount = oldSceneIdx > 0 && oldSceneIdx === newParsed.secs.filter(s => s.kind === "scene").length;

    newParsed.secs.forEach((sec, i) => {
        if (sec.kind === "scene") {
            const sig = [clean(sec.title), clean(sec.action), (sec.says || []).map(x => clean(x.v)).join(" ")].join("||");
            const cleanTitle = clean(sec.title);
            if (
                doneSignatures.has(sig) ||
                (cleanTitle && doneTitles.has(cleanTitle)) ||
                (sameSceneCount && doneSceneIndexes.has(newSceneIdx))
            ) {
                newDone["s" + i] = true;
            }
            newSceneIdx++;
        } else if (sec.kind === "sec") {
            sec.lines.forEach((l, k) => {
                if (l.t === "item" && doneItems.has(clean(l.v))) {
                    newDone[`${i}-${k}`] = true;
                }
            });
        }
    });

    return newDone;
}

/**
 * Calcula el estado del ciclo de vida de una pieza (automatico o manual) y registra el historial con fechas.
 * @param {object} s - Objeto de guion.
 * @returns {{ label: string, cls: string, baseStatus: string }}
 */
function computeScriptStatus(s) {
    if (!s) return { label: "Idea", cls: "status-idea", baseStatus: "Idea" };

    const prog = getProgress(s);
    let label = "Guion listo";
    let baseStatus = "Guion listo";
    let cls = "status-guion-listo";

    const allScenesDone = prog.scenesTotal > 0 && prog.scenesDone === prog.scenesTotal;
    const someScenesDone = prog.scenesDone > 0 && prog.scenesDone < prog.scenesTotal;

    const edit = prog.byPhase["editar"] || { d: 0, n: 0 };
    const editAllDone = edit.n > 0 && edit.d === edit.n;
    const editPartial = edit.d > 0 && edit.d < edit.n;

    const allChannelsDone = s.channels && Object.values(s.channels).length > 0 && Object.values(s.channels).every(c => c && c.done);

    if (!s.text || !s.text.trim()) {
        label = "Idea";
        baseStatus = "Idea";
        cls = "status-idea";
    } else if (s.manualStatus) {
        baseStatus = s.manualStatus;
        label = s.manualStatus;
        const found = SCRIPT_STATUSES.find(st => st.label.toLowerCase() === s.manualStatus.toLowerCase());
        cls = found ? found.cls : "status-guion-listo";
    } else {
        if (allChannelsDone) {
            label = "Publicado";
            baseStatus = "Publicado";
            cls = "status-publicado";
        } else if (editAllDone && s.publishDate && s.publishDate >= todayIso()) {
            label = "Programado";
            baseStatus = "Programado";
            cls = "status-programado";
        } else if (editAllDone) {
            label = "Editado";
            baseStatus = "Editado";
            cls = "status-editado";
        } else if (editPartial) {
            label = `En edición ${edit.d}/${edit.n}`;
            baseStatus = "En edición";
            cls = "status-en-edicion";
        } else if (allScenesDone) {
            label = "Grabado";
            baseStatus = "Grabado";
            cls = "status-grabado";
        } else if (someScenesDone) {
            label = `Grabando ${prog.scenesDone}/${prog.scenesTotal}`;
            baseStatus = "En rodaje";
            cls = "status-grabando";
        } else {
            label = "Guion listo";
            baseStatus = "Guion listo";
            cls = "status-guion-listo";
        }
    }

    // Inicializar o sanitizar historial
    if (!Array.isArray(s.history)) {
        s.history = [];
    }

    // Limpieza retroactiva: si no es manual y no se han completado todas las tomas, eliminar "Grabado" falso
    if (!s.manualStatus && !allScenesDone) {
        s.history = s.history.filter(h => h.status !== "Grabado");
    }

    // Registrar en historial SOLO hitos reales alcanzados y SIN repetir estados ya registrados
    const validMilestones = ["Idea", "Guion listo", "Grabado", "En edición", "Editado", "Programado", "Publicado"];
    const isRealMilestone = validMilestones.includes(baseStatus);
    const alreadyRecorded = s.history.some(h => h.status === baseStatus);

    if (isRealMilestone && !alreadyRecorded) {
        s.history.push({ status: baseStatus, date: Date.now() });
        s.status = baseStatus;
        saveAppData();
    }

    return { label, cls, baseStatus };
}

/**
 * Actualiza el encabezado tipo claqueta: titulo, avance y menu.
 * En Inicio muestra la semana; dentro de un guion, el guion.
 */
function updateHeader() {
    activeScript = getActiveScript();
    const titleEl = $("vtitle");
    const cntEl = $("cnt");
    const cntLbl = $("cnt-lbl");
    const barFillEl = $("barfill");
    const week = getActiveWeek();
    const isWeekView = ["dashboard", "semana", "guia"].includes(appData.view);

    let title;
    let pct = null;
    if (isWeekView) {
        if (appData.view === "semana") title = "Cargar semana";
        else title = week ? `Semana ${week.num} · ${weekRange(week)}` : "My-Guion";
        if (week && appData.view !== "semana") pct = weekProgress(week);
    } else if (appData.view === "guion" && isNewScript) {
        title = "Nuevo guion";
    } else {
        title = activeScript.title || doc.title;
        pct = getProgress(activeScript).percent;
    }

    if (titleEl && document.activeElement !== titleEl) {
        const editable = !isWeekView && !(appData.view === "guion" && isNewScript);
        titleEl.textContent = title;
        titleEl.contentEditable = editable ? "true" : "false";
        titleEl.style.cursor = editable ? "text" : "default";
        titleEl.title = editable ? "Haz clic para editar el nombre del video" : "";
    }

    const countWrap = cntEl && cntEl.parentElement;
    if (countWrap) countWrap.hidden = pct === null;
    if (cntEl && pct !== null) {
        cntEl.textContent = `${pct}%`;
        if (cntLbl) cntLbl.textContent = isWeekView ? " semana" : " listo";
    }
    if (barFillEl) barFillEl.style.width = `${pct || 0}%`;

    // Menu: opciones que dependen de la semana y del tema
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const themeBtn = $("theme-toggle");
    if (themeBtn) themeBtn.textContent = currentTheme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
    document.querySelectorAll("[data-needs-week]").forEach(el => {
        el.hidden = !week;
    });

    const navBar = document.querySelector(".top-nav-bar");
    if (navBar) navBar.hidden = appData.view === "dashboard";

    updateBreadcrumbs();
}

/**
 * Actualiza la ruta de navegacion fija (breadcrumbs) y el boton global Volver.
 */
function updateBreadcrumbs() {
    const backBtn = $("btn-global-back");
    const sepScript = $("crumb-sep-script");
    const crumbScript = $("crumb-script");
    const sepStep = $("crumb-sep-step");
    const crumbStep = $("crumb-step");
    const v = appData.view;

    const setSecond = (text, isLink) => {
        sepScript.hidden = !text;
        crumbScript.hidden = !text;
        if (!text) return;
        crumbScript.textContent = text;
        crumbScript.title = text;
        crumbScript.className = isLink ? "crumb-link" : "crumb-current";
        if (isLink) crumbScript.setAttribute("href", "#");
        else crumbScript.removeAttribute("href");
    };
    const setThird = text => {
        sepStep.hidden = !text;
        crumbStep.hidden = !text;
        if (text) crumbStep.textContent = text;
    };

    if (backBtn) backBtn.hidden = v === "dashboard";

    if (v === "dashboard") {
        setSecond("");
        setThird("");
    } else if (v === "semana") {
        setSecond("Cargar semana", false);
        setThird("");
    } else if (v === "guia") {
        setSecond("Guía de la semana", false);
        setThird("");
    } else if (v === "guion" && isNewScript) {
        setSecond("Nuevo guion", false);
        setThird("");
    } else {
        setSecond(activeScript.title || "Guion", true);
        const stepNames = { notas: "Preparar", antes: "Preparar", grabar: "Grabar", editar: "Editar", publicar: "Publicar" };
        setThird(v === "guion" ? "Editar texto" : v === "grabar" ? "Teleprompter" : stepNames[activeScript.phase] || "Preparar");
    }
}

/**
 * Genera el marcado HTML para listas de items, notas, tablas y bloques de copy.
 * @param {object} s - Seccion del guion.
 * @param {number} i - Indice de la seccion.
 * @param {{ done: object, attr: string, ns: string, key?: string }} [owner] - Donde se guardan las casillas
 *   (por defecto el guion activo; ver scriptOwner y weekOwner en week.js).
 * @returns {string} HTML generado.
 */
function renderItemsHTML(s, i, owner = scriptOwner(activeScript)) {
    const idNs = owner.ns.replace(/[^a-z0-9]/gi, "");
    let out = "";
    let openItemsList = false;

    const closeList = () => {
        if (openItemsList) {
            out += "</div>";
            openItemsList = false;
        }
    };

    s.lines.forEach((l, k) => {
        if (l.t === "item") {
            if (!openItemsList) {
                out += `<div class="items">`;
                openItemsList = true;
            }
            const key = `${i}-${k}`;
            const isChecked = !!owner.done[(owner.key || "") + key];
            out += `
        <label class="item ${isChecked ? "on" : ""}">
          <input type="checkbox" ${owner.attr}="${esc(owner.ns + key)}" ${isChecked ? "checked" : ""}>
          <span>${esc(l.v)}</span>
        </label>`;
            return;
        }

        closeList();

        if (l.t === "lead") {
            out += `<div class="lead">${esc(l.v)}</div>`;
        } else if (l.t === "note") {
            out += `<p class="note">${esc(l.v)}</p>`;
        } else if (l.t === "table") {
            out += `
        <div class="info-table-wrap">
          <table class="info-table">
            <thead>
              <tr>${l.headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${l.rows
                  .map(
                      r => `
                <tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`
                  )
                  .join("")}
            </tbody>
          </table>
        </div>`;
        } else if (l.t === "copy") {
            out += `
        <div class="copy">
          <div class="copy-h">
            <span class="lbl">${esc(l.label)}</span>
            <button class="btn small" data-copy="${idNs}${i}-${k}">Copiar</button>
          </div>
          <pre id="cp${idNs}${i}-${k}">${esc(l.paras.join("\n\n"))}</pre>
        </div>`;
        }
    });

    closeList();
    return out;
}

/**
 * Renderiza la seccion de canales de distribucion social con casillas, fechas y enlaces opcionales.
 * @returns {string} HTML generado.
 */
function renderSocialChannelsHTML() {
    const channels = activeScript.channels || getDefaultChannels();
    const publishedCount = Object.values(channels).filter(c => c && c.done).length;

    return `
    <div class="card social-channels-card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 8px;">
        <h3>Canales de Publicación</h3>
        <span class="step-counter-badge" style="font-size: 0.75rem;">${publishedCount} de ${SOCIAL_CHANNELS.length} publicados</span>
      </div>
      <p class="hint">Marca cada red donde ya esté subido el video. Guarda la fecha automáticamente y admite el link de cada publicación.</p>
      <div class="social-channels-grid">
        ${SOCIAL_CHANNELS.map(ch => {
            const data = channels[ch.id] || { done: false, date: null, url: "" };
            const isDone = !!data.done;
            const dateStr = data.date
                ? new Date(data.date).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
                : null;
            return `
          <div class="social-channel-item ${isDone ? "published" : ""}">
            <div class="social-channel-row">
              <label class="social-channel-check-label">
                <input type="checkbox" data-channel-key="${ch.id}" ${isDone ? "checked" : ""}>
                <span>${esc(ch.name)}</span>
              </label>
              <span class="social-channel-badge ${isDone ? "done" : "pending"}">
                ${isDone ? `✓ ${dateStr}` : "Pendiente"}
              </span>
            </div>
            <div>
              <input type="url" class="channel-url-input" 
                placeholder="Link opcional (${esc(ch.name)}): ${esc(ch.placeholder)}" 
                value="${esc(data.url || "")}" 
                data-channel-url="${ch.id}"
                title="Enlace opcional de la publicación en ${esc(ch.name)}">
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>`;
}

/**
 * Renderiza la vista de Plan con la barra numerada de 4 pasos y navegacion lineal.
 */
function renderPlan() {
    // Garantizar que la fase corresponda a uno de los 4 pasos canonicos
    if (!CANONICAL_STEPS.find(s => s.id === activeScript.phase)) {
        activeScript.phase = "antes";
    }

    const currentStep = CANONICAL_STEPS.find(s => s.id === activeScript.phase) || CANONICAL_STEPS[0];
    const prog = getProgress(activeScript);

    const phasesContainer = $("phases");
    if (phasesContainer) {
        phasesContainer.innerHTML = `
      <div class="step-progress-header" style="grid-column: 1 / -1;">
        <div class="step-nav-grid" role="tablist" aria-label="Pasos del guion">
          ${CANONICAL_STEPS.map(s => {
              const isCurrent = s.id === currentStep.id;
              const r = prog.byPhase[s.id] || { d: 0, n: 0 };
              const isDone = s.id === "grabar"
                  ? (prog.scenesTotal > 0 && prog.scenesDone === prog.scenesTotal)
                  : (r.n > 0 && r.d === r.n);
              const badgeText = s.id === "grabar"
                  ? `${prog.scenesDone}/${prog.scenesTotal} tomas`
                  : (isDone ? "✓ Listo" : (r.n ? `${r.d}/${r.n}` : "Info"));
              return `
            <button class="step-nav-item ${isCurrent ? "active" : ""} ${isDone ? "done" : ""}" data-step-id="${s.id}" role="tab" aria-selected="${isCurrent}">
              <span class="step-nav-num">Paso ${s.num}</span>
              <span class="step-nav-name">${s.name}</span>
              <span class="step-nav-prog ${isDone ? "done" : ""}">${badgeText}</span>
            </button>`;
          }).join("")}
        </div>
      </div>`;
    }

    const statusObj = computeScriptStatus(activeScript);
    const historyTrailHTML = (activeScript.history && activeScript.history.length)
        ? activeScript.history.map(h => {
            const dStr = new Date(h.date).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
            return `<span class="history-item"><b>${esc(h.status)}</b> el ${dStr}</span>`;
          }).join(" · ")
        : "Sin cambios registrados";

    const pieceMeta = activeScript.weekId
        ? [
              [shortDayLabel(activeScript.day), activeScript.time].filter(Boolean).join(", "),
              activeScript.formatRaw || activeScript.format,
              activeScript.owner,
          ].filter(Boolean)
        : [];
    const dues = [
        activeScript.rawDue ? `Crudo: ${activeScript.rawDue.label}` : "",
        activeScript.editDue ? `Edición: ${activeScript.editDue.label}` : "",
    ].filter(Boolean);

    let html = `
    <div class="script-status-tracker">
      ${pieceMeta.length ? `
      <div class="piece-meta">
        ${pieceMeta.map(m => `<span>${esc(m)}</span>`).join("")}
        ${dues.length ? `<span class="piece-dues">${dues.map(esc).join(" · ")}</span>` : ""}
      </div>` : ""}
      <div class="tracker-left">
        <label for="status-override-select" class="tracker-label">Estado</label>
        <select id="status-override-select" class="tracker-select" title="Seleccionar estado manual o automático">
          <option value="" ${!activeScript.manualStatus ? "selected" : ""}>Auto · ${esc(statusObj.label)}</option>
          ${SCRIPT_STATUSES.map(st => `<option value="${st.label}" ${activeScript.manualStatus === st.label ? "selected" : ""}>${st.label}</option>`).join("")}
        </select>
        <div class="tracker-date-wrap">
          <label for="script-publish-date" class="tracker-label">Publicar el</label>
          <input type="date" id="script-publish-date" class="tracker-date-input" value="${activeScript.publishDate || ''}" title="Fecha límite o programada para publicar este video">
        </div>
        <button class="btn small ghost btn-edit-script-text" id="btn-edit-script-text" title="Editar el texto de este guion">Editar texto</button>
      </div>
      <div class="tracker-history">
        <span class="tracker-history-title">Historial:</span>
        ${historyTrailHTML}
      </div>
    </div>

    <div class="phase-bar">
      <h2>${currentStep.name}</h2>
      <div class="row">`;

    if (currentStep.id === "grabar" && getScenes().length) {
        html += `<button class="btn primary small" data-v="grabar">Grabar escena por escena</button>`;
    }
    html += `<button class="btn small ghost" id="share">Copiar checklist</button>`;
    html += `</div></div><div class="list">`;

    // Paso 1: Preparar (incluye Notas informativas previas y seccion Antes)
    if (currentStep.id === "antes") {
        getSecsOf("notas").forEach(({ s, i }) => {
            html += `
          <div class="card notes">
            ${s.title ? `<h3>${esc(s.title)}</h3>` : ""}
            ${renderItemsHTML(s, i)}
          </div>`;
        });
        getSecsOf("antes").forEach(({ s, i }) => {
            html += `
          <div class="card">
            ${s.title ? `<h3>${esc(s.title)}</h3>` : ""}
            ${renderItemsHTML(s, i)}
          </div>`;
        });
    }

    // Paso 2: Grabar (Lista de planos numerados + recordatorios de rodaje)
    if (currentStep.id === "grabar") {
        if (getScenes().length) {
            html += `
          <div class="shots">
            ${getScenes()
                .map(({ s, i }, k) => {
                    const done = isSceneDone(i);
                    const slate = shotSlate({ script: activeScript, sec: s, i, k });
                    const says = s.says && s.says.length ? s.says.map(x => x.v).join(" ") : "";
                    return `
              <button class="shot ${done ? "d" : ""}" data-j="${k}">
                <span class="sn">${k + 1}</span>
                <span class="sm">
                  ${slate ? `<span class="slate-mini">${esc(slate)}</span>` : ""}
                  <span class="st">${esc(says ? `“${says}”` : s.title)}</span>
                  ${says ? `<span class="ss" style="display:block">${esc(s.title)}${s.reps > 1 ? ` · ${s.reps} tomas` : ""}</span>` : ""}
                  ${s.screen ? `<span class="ss" style="display:block">En pantalla: ${esc(s.screen)}</span>` : ""}
                </span>
                <span class="tm">${esc(s.time || "")}</span>
              </button>`;
                })
                .join("")}
          </div>`;
        }
        getSecsOf("grabar").forEach(({ s, i }) => {
            html += `
          <div class="card">
            ${s.title ? `<h3>${esc(s.title)}</h3>` : ""}
            ${renderItemsHTML(s, i)}
          </div>`;
        });
    }

    // Paso 3: Editar (Tareas de edición, CapCut, subtítulos)
    if (currentStep.id === "editar") {
        getSecsOf("editar").forEach(({ s, i }) => {
            html += `
          <div class="card">
            ${s.title ? `<h3>${esc(s.title)}</h3>` : ""}
            ${renderItemsHTML(s, i)}
          </div>`;
        });
    }

    // Paso 4: Publicar (Canales de redes sociales + copy e instrucciones)
    if (currentStep.id === "publicar") {
        html += renderSocialChannelsHTML();
        getSecsOf("publicar").forEach(({ s, i }) => {
            html += `
          <div class="card">
            ${s.title ? `<h3>${esc(s.title)}</h3>` : ""}
            ${renderItemsHTML(s, i)}
          </div>`;
        });
    }

    // Botones grandes de navegacion lineal (Paso anterior / Paso siguiente)
    html += `
    </div>
    <div class="step-footer-nav">
      ${currentStep.prevPhase ? `
        <button class="btn step-footer-btn" data-step-goto="${currentStep.prevPhase}">
          ${currentStep.prevText}
        </button>
      ` : `
        <button class="btn step-footer-btn ghost" data-step-goto="dashboard">
          ← Volver al Inicio
        </button>
      `}
      ${currentStep.nextPhase === "finish" ? `
        <button class="btn primary step-footer-btn" data-step-goto="dashboard">
          ${currentStep.nextText}
        </button>
      ` : `
        <button class="btn primary step-footer-btn" data-step-goto="${currentStep.nextPhase}">
          ${currentStep.nextText}
        </button>
      `}
    </div>`;

    $("phase").innerHTML = html;
}

/**
 * Devuelve la clase CSS del personaje de dialogo (P1, P2).
 */
function getSpeakerClass(who) {
    if (/^p1$/i.test(who)) return "p1";
    if (/^p2$/i.test(who)) return "p2";
    return "";
}

/**
 * Estado de grabacion: la cola de frases y la posicion, ya sea de un guion
 * o de una sesion (bloque) que encadena varias piezas de la semana.
 */
function getRecState() {
    if (appData.session) {
        const week = appData.weeks.find(w => w.id === appData.session.weekId);
        const sess = week && (week.sessions || []).find(x => x.id === appData.session.blockId);
        if (week && sess) {
            return { mode: "session", week, sess, q: sessionQueue(week, sess), cur: appData.session.cur || 0 };
        }
        appData.session = null;
    }
    return { mode: "script", q: buildScriptQueue(activeScript), cur: activeScript.cur || 0 };
}

/** Mueve la posicion del teleprompter (guion o sesion). */
function setRecCur(n) {
    if (appData.session) {
        appData.session.cur = n;
        saveAppData();
    } else {
        activeScript.cur = n;
        updateActiveScript({ cur: n });
    }
}

/**
 * Claqueta de una frase, igual al nombre del archivo: S1_JUE_G_F1, S1_MAR_T2...
 * @returns {string} Vacio si el guion no viene de una semana ni trae codigo.
 */
function shotSlate(e) {
    const code = (e.sec.code || "").replace(/\s+a\s+/i, "-").replace(/\s+/g, "");
    if (/^S\d+_/i.test(code)) return code.toUpperCase();
    if (!e.script.slatePrefix) return "";
    return `${e.script.slatePrefix}_${code || "F" + (e.k + 1)}`.toUpperCase();
}

/**
 * Registra una toma de la frase actual. Al llegar a las tomas pedidas (o con
 * markAll) marca la frase como grabada y pasa a la siguiente.
 * @param {boolean} [markAll] - Dar la frase por lista sin contar tomas.
 */
function registerTake(markAll) {
    const st = getRecState();
    const e = st.q[st.cur];
    if (!e) return;
    const sc = e.script;
    const key = "s" + e.i;
    const reps = e.sec.reps || 1;
    sc.done = sc.done || {};
    sc.takeCount = sc.takeCount || {};

    let advance = true;
    if (!sc.done[key]) {
        const n = markAll ? reps : (sc.takeCount[key] || 0) + 1;
        sc.takeCount[key] = Math.min(n, reps);
        if (n >= reps) sc.done[key] = true;
        else advance = false;
        sc.updatedAt = Date.now();
        triggerHapticFeedback();
    }
    if (advance) setRecCur(st.cur + 1);
    else saveAppData();
    render();
    window.scrollTo(0, 0);
}

/**
 * Renderiza los botones de navegacion rapida por puntos (Dots).
 */
function renderDots(st) {
    return `
    <div class="dots">
      ${st.q
          .map((e, k) => {
              const prevScript = k > 0 ? st.q[k - 1].script : null;
              const sep = st.mode === "session" && prevScript && prevScript !== e.script ? `<span class="dots-sep" aria-hidden="true"></span>` : "";
              return `${sep}<button data-rj="${k}" class="${isShotDone(e) ? "d" : ""} ${k === st.cur ? "c" : ""}" title="${esc(shotSlate(e) || e.sec.title)}" aria-label="Ir a la frase ${k + 1}">${k + 1}</button>`;
          })
          .join("")}
    </div>`;
}

/** Recordatorios plegables del teleprompter. */
function renderRecRemindersHTML(st) {
    const block = (id, title, open, body) => `
      <details class="remind" ${open ? "open" : ""} id="${id}">
        <summary>${title}</summary>
        ${body}
      </details>`;

    if (st.mode === "script") {
        const remindSecs = getSecsOf("grabar");
        if (!remindSecs.length) return "";
        const n = remindSecs.reduce((acc, x) => acc + x.s.lines.filter(l => l.t === "item" || l.t === "note").length, 0);
        return block("rmd", `Recordatorios para grabar (${n})`, activeScript.open, remindSecs
            .map(({ s, i }) => (s.title ? `<div class="lead" style="padding:0 16px">${esc(s.title)}</div>` : "") +
                `<div style="padding:0 16px 8px">${renderItemsHTML(s, i)}</div>`)
            .join(""));
    }

    let out = "";
    const rules = parseScript(st.week.rulesText || "");
    const ruleSecs = rules.secs.map((s, i) => ({ s, i })).filter(x => x.s.kind === "sec" && x.s.lines.some(l => l.t === "item"));
    if (ruleSecs.length) {
        const owner = weekOwner(st.week, "r");
        const total = ruleSecs.reduce((acc, x) => acc + x.s.lines.filter(l => l.t === "item").length, 0);
        const checked = ruleSecs.reduce((acc, x) => acc + x.s.lines.filter((l, k) => l.t === "item" && owner.done[`r${x.i}-${k}`]).length, 0);
        out += block("rmd-rules", `Antes de grabar · reglas ${checked}/${total}`, false, ruleSecs
            .map(({ s, i }) => `<div class="lead" style="padding:0 16px">${esc(s.title)}</div><div style="padding:0 16px 8px">${renderItemsHTML(s, i, owner)}</div>`)
            .join(""));
    }
    const e = st.q[st.cur];
    if (e) {
        const parsed = parseScript(e.script.text);
        const notes = parsed.secs.map((s, i) => ({ s, i }))
            .filter(x => x.s.kind === "sec" && (x.s.phase === "grabar" || /^notas/i.test(x.s.title)) && x.s.lines.length);
        if (notes.length) {
            out += block("rmd-piece", `Notas de ${esc(e.script.title)}`, false, notes
                .map(({ s, i }) => `<div style="padding:0 16px 8px">${renderItemsHTML(s, i, scriptOwner(e.script))}</div>`)
                .join(""));
        }
    }
    return out;
}

/**
 * Renderiza la vista de Grabacion (teleprompter frase a frase) de un guion o de una sesion.
 */
function renderRec() {
    const st = getRecState();
    document.documentElement.style.setProperty("--z", activeScript.z);
    const zoomValEl = $("zoom-val");
    if (zoomValEl) zoomValEl.textContent = `${Math.round(activeScript.z * 100)}%`;

    const label = st.mode === "session" ? `Bloque ${st.sess.id} · ` : "";
    if (!st.q.length) {
        $("recpos").textContent = "";
        $("rec").innerHTML = `
      <p class="empty">${st.mode === "session" ? "Este bloque no tiene frases para grabar." : "Este guion no trae escenas detectables.<br>Pega uno con tabla o con formato “Escena 1, Escena 2…” en <b>Editar texto</b>."}</p>`;
        return;
    }

    // Pantalla de cierre de rodaje
    if (st.cur >= st.q.length) {
        const pending = st.q.filter(e => !isShotDone(e)).length;
        $("recpos").textContent = `${label}Corte`;
        $("rec").innerHTML = `
      <div class="scene wrapup">
        <b>Corte</b>
        <p class="hint" style="margin-inline:auto; font-size:1.05rem">${pending
            ? `Quedan ${pending} ${pending === 1 ? "frase" : "frases"} sin terminar. Toca su número para volver.`
            : st.mode === "session" ? `Bloque ${esc(st.sess.id)} completo. El material crudo ya puede ir a la carpeta del editor.` : "Todas las escenas han sido grabadas. Puedes continuar con la fase de Edicion."}</p>
        <div class="row" style="justify-content:center; margin-top:16px">
          <button class="btn" id="back">Volver a la última frase</button>
          ${st.mode === "session"
              ? `<button class="btn primary" id="btn-exit-rec">Volver a Inicio</button>`
              : `<button class="btn primary" data-ph-go="editar">Ir a Editar</button>`}
        </div>
      </div>
      ${renderDots(st)}`;
        return;
    }

    const e = st.q[st.cur];
    const s = e.sec;
    const done = isShotDone(e);
    const reps = s.reps || 1;
    const taken = (e.script.takeCount && e.script.takeCount["s" + e.i]) || 0;
    const slate = shotSlate(e);
    const nextTake = Math.min(taken + 1, reps);

    let primary;
    if (done) primary = "Siguiente &rarr;";
    else if (reps === 1) primary = "Lista, siguiente";
    else if (nextTake === reps) primary = `Toma ${reps} lista · siguiente frase`;
    else primary = `Toma ${nextTake} lista`;

    $("recpos").textContent = `${label}Frase ${st.cur + 1} de ${st.q.length}`;
    $("rec").innerHTML = `
    ${renderRecRemindersHTML(st)}
    <article class="scene ${done ? "d" : ""}">
      ${st.mode === "session" ? `<div class="scene-piece">${esc(shortDayLabel(e.script.day))} · ${esc(e.script.title)}</div>` : ""}
      ${slate || reps > 1 ? `
      <div class="slate">
        ${slate ? `<span class="slate-code">${esc(slate)}</span>` : "<span></span>"}
        <span class="slate-take ${done ? "done" : ""}">${done ? `✓ ${reps} ${reps === 1 ? "toma" : "tomas"}` : `Toma ${nextTake} de ${reps}`}</span>
      </div>` : ""}
      <div class="scene-h">
        <div class="big">${st.cur + 1}</div>
        <div class="meta">
          ${s.time ? `<span class="pill">${esc(s.time)}</span>` : ""}
          <h2>${esc(s.title)}</h2>
        </div>
      </div>

      ${s.says.length ? `
        <div class="field">
          <div class="lbl">Qué se dice</div>
          ${s.says.map(x => `
            <div class="say">
              ${x.who ? `<span class="who ${getSpeakerClass(x.who)}">${esc(x.who)}</span>` : ""}
              <q>“${esc(x.v)}”</q>
            </div>`).join("")}
        </div>` : ""}

      ${s.action ? `
        <div class="field">
          <div class="lbl">${s.says.length ? "Cómo" : "Qué pasa"}</div>
          <div class="action">${esc(s.action)}</div>
        </div>` : ""}

      ${s.screen ? `
        <div class="field">
          <div class="lbl">Texto en pantalla</div>
          <div class="screen">${esc(s.screen)}</div>
        </div>` : ""}

      ${s.extra.length ? `<div class="field">${s.extra.map(x => `<p class="note">${esc(x)}</p>`).join("")}</div>` : ""}
      ${s.lines && s.lines.length ? `<div class="field">${renderItemsHTML(s, e.i, scriptOwner(e.script))}</div>` : ""}
    </article>

    <div class="nav">
      <button class="btn" id="prev" ${st.cur === 0 ? "disabled" : ""}>&larr; Anterior</button>
      <button class="btn primary ${done ? "isdone" : ""}" id="next">${primary}</button>
    </div>
    ${!done && reps > 1 ? `<div class="nav-aux"><button class="btn ghost small" id="mark-shot">Dar la frase por lista</button></div>` : ""}
    ${renderDots(st)}`;
}

/**
 * Renderizador central de vistas.
 */
function render() {
    activeScript = getActiveScript();
    doc = parseScript(activeScript.text);

    updateHeader();

    const headerEl = $("app-header");
    if (headerEl) {
        headerEl.hidden = appData.view === "grabar";
    }

    ["dashboard", "plan", "grabar", "guion", "semana", "guia"].forEach(v => {
        const viewEl = $("v-" + v);
        const tabEl = $("t-" + (v === "dashboard" ? "dash" : v));
        if (viewEl) viewEl.hidden = appData.view !== v;
        if (tabEl) tabEl.setAttribute("aria-selected", appData.view === v);
    });

    document.body.dataset.view = appData.view;
    const footerEl = document.querySelector(".app-footer");
    if (footerEl) footerEl.hidden = appData.view !== "grabar";
    closeAppMenu();

    if (appData.view === "dashboard") renderHome();
    if (appData.view === "guia") renderGuide();
    if (appData.view === "plan") renderPlan();
    if (appData.view === "grabar") renderRec();
    if (appData.view === "guion") {
        const vGuion = $("v-guion");
        if (vGuion) {
            const lbl = vGuion.querySelector(".lbl");
            if (lbl) lbl.textContent = isNewScript ? "Nuevo guion para estructurar" : `Editar guion: ${activeScript.title || "Sin título"}`;
            const goBtn = $("go");
            if (goBtn) goBtn.textContent = isNewScript ? "Organizar y guardar en biblioteca" : "Guardar cambios y actualizar checklist";
        }
    }

    manageWakeLock(appData.view === "grabar");
}

/** Abre o cierra el menu de la cabecera. */
function toggleAppMenu(force) {
    const menu = $("app-menu");
    const btn = $("btn-menu");
    if (!menu || !btn) return;
    const open = force !== undefined ? force : menu.hidden;
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
}

function closeAppMenu() {
    toggleAppMenu(false);
}

/** Cambia de vista y vuelve arriba. */
function goView(view) {
    appData.view = view;
    saveAppData();
    render();
    window.scrollTo(0, 0);
}

/**
 * Notificacion temporal tipo Toast.
 * @param {string} msg - Mensaje a mostrar.
 */
function showToast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
        t.hidden = true;
    }, 2000);
}

/**
 * Copia texto al portapapeles con fallback seguro.
 * @param {string} txt - Texto a copiar.
 * @param {HTMLElement} [el] - Elemento DOM de respaldo.
 */
async function copyToClipboard(txt, el) {
    try {
        await navigator.clipboard.writeText(txt);
        showToast("Copiado al portapapeles");
    } catch (e) {
        if (el) {
            const r = document.createRange();
            r.selectNodeContents(el);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);
        }
        showToast("Texto seleccionado: copialo manualmente");
    }
}

/**
 * Genera el texto del checklist formateado para compartir por WhatsApp.
 * @param {string} ph - Fase de rodaje.
 * @returns {string}
 */
function generateChecklistText(ph) {
    const p = PHASES.find(x => x.id === ph);
    const out = [`*${activeScript.title || doc.title} — ${p.name}*`];

    if (ph === "grabar") {
        getScenes().forEach(({ s, i }, k) => {
            const mark = isSceneDone(i) ? "☑" : "☐";
            out.push(`${mark} Toma ${k + 1}${s.time ? ` (${s.time})` : ""}: ${s.title}`);
        });
    }

    getSecsOf(ph).forEach(({ s, i }) => {
        if (s.title) out.push("", `*${s.title.toUpperCase()}*`);
        s.lines.forEach((l, k) => {
            if (l.t === "item") {
                const mark = activeScript.done[`${i}-${k}`] ? "☑" : "☐";
                out.push(`${mark} ${l.v}`);
            }
        });
    });

    return out.join("\n");
}

// -----------------------------------------------------------------------------
// Controladores de Eventos Globales
// -----------------------------------------------------------------------------

// Edicion del Titulo en Cabecera
const titleEl = $("vtitle");
if (titleEl) {
    titleEl.addEventListener("blur", () => {
        const val = titleEl.textContent.trim();
        if (val && val !== activeScript.title) {
            activeScript.title = val;
            updateActiveScript({ title: val });
            showToast("Titulo actualizado");
        }
    });
    titleEl.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            e.preventDefault();
            titleEl.blur();
        }
    });
}

// Modificacion de Casillas de Verificacion y Selectores
document.addEventListener("change", e => {
    // Cambio manual de estado del guion
    if (e.target.id === "status-override-select") {
        const val = e.target.value.trim();
        activeScript.manualStatus = val || null;
        updateActiveScript({ manualStatus: activeScript.manualStatus });
        computeScriptStatus(activeScript);
        render();
        showToast(val ? `Estado asignado: ${val}` : "Estado en modo automático");
        return;
    }

    // Fecha de publicacion del guion
    if (e.target.id === "script-publish-date") {
        activeScript.publishDate = e.target.value;
        updateActiveScript({ publishDate: activeScript.publishDate });
        computeScriptStatus(activeScript);
        render();
        showToast(activeScript.publishDate ? `Fecha programada: ${activeScript.publishDate}` : "Fecha de publicación eliminada");
        return;
    }

    // Casillas de publicacion por red social
    const chKey = e.target.dataset && e.target.dataset.channelKey;
    if (chKey) {
        if (!activeScript.channels) activeScript.channels = getDefaultChannels();
        const ch = activeScript.channels[chKey] || { done: false, date: null, url: "" };
        ch.done = e.target.checked;
        ch.date = e.target.checked ? Date.now() : null;
        activeScript.channels[chKey] = ch;
        updateActiveScript({ channels: activeScript.channels });
        computeScriptStatus(activeScript);
        render();
        const chName = (SOCIAL_CHANNELS.find(c => c.id === chKey) || {}).name || chKey;
        showToast(ch.done ? `Publicado en ${chName}` : `Marcado pendiente en ${chName}`);
        return;
    }

    // Enlace opcional de publicacion
    const chUrlKey = e.target.dataset && e.target.dataset.channelUrl;
    if (chUrlKey) {
        if (!activeScript.channels) activeScript.channels = getDefaultChannels();
        const ch = activeScript.channels[chUrlKey] || { done: false, date: null, url: "" };
        ch.url = e.target.value.trim();
        activeScript.channels[chUrlKey] = ch;
        updateActiveScript({ channels: activeScript.channels });
        showToast("Enlace de publicación guardado");
        return;
    }

    const sk = e.target.dataset && e.target.dataset.sk;
    if (sk) {
        const [sid, key] = [sk.slice(0, sk.indexOf("|")), sk.slice(sk.indexOf("|") + 1)];
        const script = appData.scripts.find(x => x.id === sid);
        if (script) {
            script.done = script.done || {};
            script.done[key] = e.target.checked;
            script.updatedAt = Date.now();
            saveAppData();
            render();
        }
        return;
    }

    const wk = e.target.dataset && e.target.dataset.wk;
    if (wk) {
        const [wid, key] = [wk.slice(0, wk.indexOf("|")), wk.slice(wk.indexOf("|") + 1)];
        const week = appData.weeks.find(x => x.id === wid);
        if (week) {
            week.done = week.done || {};
            week.done[key] = e.target.checked;
            saveAppData();
            render();
        }
        return;
    }

    const k = e.target.dataset && e.target.dataset.k;
    if (!k) return;
    activeScript.done[k] = e.target.checked;
    updateActiveScript({ done: activeScript.done });
    render();
});

// Guardar enlace de publicacion al desenfocar el campo
document.addEventListener(
    "blur",
    e => {
        const chUrlKey = e.target.dataset && e.target.dataset.channelUrl;
        if (chUrlKey) {
            if (!activeScript.channels) activeScript.channels = getDefaultChannels();
            const ch = activeScript.channels[chUrlKey] || { done: false, date: null, url: "" };
            const val = e.target.value.trim();
            if (ch.url !== val) {
                ch.url = val;
                activeScript.channels[chUrlKey] = ch;
                updateActiveScript({ channels: activeScript.channels });
                showToast("Enlace guardado");
            }
        }
    },
    true
);

// Despliegue de Detalles de Recordatorios
document.addEventListener(
    "toggle",
    e => {
        if (e.target.id === "rmd") {
            activeScript.open = e.target.open;
            updateActiveScript({ open: e.target.open });
        }
    },
    true
);

// Delegacion de Clics en la Aplicacion
document.addEventListener("click", e => {
    // Navegacion por Breadcrumbs (Ruta fija)
    const crumbHome = e.target.closest("#crumb-home");
    if (crumbHome) {
        e.preventDefault();
        isNewScript = false;
        appData.view = "dashboard";
        saveAppData();
        render();
        window.scrollTo(0, 0);
        return;
    }

    const crumbScript = e.target.closest("#crumb-script");
    if (crumbScript) {
        e.preventDefault();
        appData.view = "plan";
        saveAppData();
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Boton global Volver
    const backBtn = e.target.closest("#btn-global-back");
    if (backBtn) {
        if (appData.view === "grabar") {
            appData.view = "plan";
            activeScript.phase = "grabar";
        } else if (appData.view === "guion") {
            appData.view = isNewScript ? "dashboard" : "plan";
            isNewScript = false;
        } else if (["plan", "semana", "guia"].includes(appData.view)) {
            appData.view = "dashboard";
        }
        saveAppData();
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Boton "Editar texto" dentro del guion
    const editScriptBtn = e.target.closest("#btn-edit-script-text, .btn-edit-script-text");
    if (editScriptBtn) {
        isNewScript = false;
        appData.view = "guion";
        $("src").value = activeScript.text || "";
        $("script-title-input").value = activeScript.title || "";
        saveAppData();
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Boton "✕ Salir" del modo grabacion teleprompter
    const exitRecBtn = e.target.closest("#btn-exit-rec");
    if (exitRecBtn) {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
        if (appData.session) {
            appData.session = null;
            appData.view = "dashboard";
        } else {
            appData.view = "plan";
            activeScript.phase = "grabar";
        }
        saveAppData();
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Menu de la cabecera: abrir/cerrar y cerrar al elegir o tocar fuera
    if (e.target.closest("#btn-menu")) {
        toggleAppMenu();
        return;
    }
    if (!e.target.closest("#app-menu")) closeAppMenu();
    else if (e.target.closest("button")) setTimeout(closeAppMenu, 0);

    // Empezar o continuar una sesion de grabacion (bloque de la semana)
    const sessBtn = e.target.closest("[data-start-session]");
    if (sessBtn) {
        const [wid, bid] = sessBtn.dataset.startSession.split("|");
        const week = appData.weeks.find(w => w.id === wid);
        const sess = week && (week.sessions || []).find(x => x.id === bid);
        if (!sess) return;
        const q = sessionQueue(week, sess);
        const first = q.findIndex(x => !isShotDone(x));
        appData.session = { weekId: wid, blockId: bid, cur: first < 0 ? 0 : first };
        goView("grabar");
        return;
    }

    // Cambiar de semana
    const weekNav = e.target.closest("[data-week-nav]");
    if (weekNav) {
        const weeks = [...appData.weeks].sort((a, b) => a.startDate.localeCompare(b.startDate));
        const idx = weeks.findIndex(w => w.id === (getActiveWeek() || {}).id) + Number(weekNav.dataset.weekNav);
        if (weeks[idx]) {
            appData.activeWeekId = weeks[idx].id;
            saveAppData();
            render();
        }
        return;
    }

    if (e.target.closest("[data-go-import]")) {
        $("kit-src").value = "";
        goView("semana");
        $("kit-src").focus();
        return;
    }
    if (e.target.closest("[data-import-backup]")) {
        $("file-import").click();
        return;
    }
    if (e.target.closest("[data-go-guide]")) {
        goView("guia");
        return;
    }

    // Salto a una frase desde los puntos del teleprompter
    const recDot = e.target.closest("[data-rj]");
    if (recDot) {
        setRecCur(+recDot.dataset.rj);
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Abrir tarjeta desde el Dashboard
    const cardEl = e.target.closest("[data-open-script]");
    if (cardEl && (cardEl.tagName === "BUTTON" || !e.target.closest("button"))) {
        const scriptId = cardEl.dataset.openScript;
        appData.activeScriptId = scriptId;
        appData.view = "plan";
        saveAppData();
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Acciones dentro de las tarjetas del Dashboard
    const dashActionBtn = e.target.closest("[data-dash-action]");
    if (dashActionBtn) {
        const action = dashActionBtn.dataset.dashAction;
        const scriptId = dashActionBtn.dataset.scriptId;
        if (action === "grabar") {
            appData.activeScriptId = scriptId;
            appData.session = null;
            appData.view = "grabar";
            saveAppData();
            render();
            window.scrollTo(0, 0);
        } else if (action === "plan") {
            appData.activeScriptId = scriptId;
            appData.view = "plan";
            saveAppData();
            render();
            window.scrollTo(0, 0);
        } else if (action === "duplicate") {
            duplicateScript(scriptId);
            render();
            showToast("Guion duplicado");
        } else if (action === "delete") {
            const scriptToDelete = appData.scripts.find(s => s.id === scriptId);
            const scriptTitle = scriptToDelete ? scriptToDelete.title : "este guion";
            showConfirmModal({
                title: "Eliminar guion",
                message: `¿Deseas eliminar "${scriptTitle}" de tu biblioteca?`,
                confirmText: "Eliminar",
                confirmClass: "warn primary",
            }).then(confirmed => {
                if (confirmed) {
                    deleteScript(scriptId);
                    render();
                    showToast("Guion eliminado");
                }
            });
        }
        return;
    }

    const t = e.target.closest("button");
    if (!t) return;

    // Retorno al Dashboard
    if (t.id === "btn-to-dashboard") {
        isNewScript = false;
        appData.view = "dashboard";
        saveAppData();
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Creacion de nuevo guion (boton aparte en la biblioteca)
    if (t.id === "btn-create-script" || t.id === "btn-create-script-empty") {
        isNewScript = true;
        appData.view = "guion";
        $("src").value = "";
        $("script-title-input").value = "";
        saveAppData();
        render();
        window.scrollTo(0, 0);
        $("src").focus();
        return;
    }

    // Exportar e Importar Respaldo
    if (t.id === "btn-export-backup") {
        exportBackup();
        showToast("Respaldo descargado");
        return;
    }
    if (t.id === "btn-copy-backup") {
        const jsonStr = JSON.stringify(appData, null, 2);
        copyToClipboard(jsonStr);
        showToast("Respaldo copiado al portapapeles");
        return;
    }
    if (t.id === "btn-import-trigger") {
        $("file-import").click();
        return;
    }

    // Cambio de vista principal desde tabs
    if (t.dataset.v) {
        if (t.dataset.v !== "guion") {
            isNewScript = false;
        }
        appData.view = t.dataset.v;
        if (appData.view === "grabar") appData.session = null;
        if (appData.view === "guion") {
            isNewScript = false;
            $("src").value = activeScript.text;
            $("script-title-input").value = activeScript.title || "";
        }
        saveAppData();
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Cambio de paso desde la barra numerada
    if (t.dataset.stepId) {
        activeScript.phase = t.dataset.stepId;
        updateActiveScript({ phase: activeScript.phase });
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Navegacion lineal (botones grandes Anterior / Siguiente)
    if (t.dataset.stepGoto) {
        if (t.dataset.stepGoto === "dashboard") {
            appData.view = "dashboard";
        } else {
            appData.view = "plan";
            activeScript.phase = t.dataset.stepGoto;
            updateActiveScript({ phase: activeScript.phase });
        }
        saveAppData();
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Cambio de fase en vista Plan (compatibilidad)
    if (t.dataset.ph) {
        activeScript.phase = t.dataset.ph;
        updateActiveScript({ phase: activeScript.phase });
        render();
        return;
    }

    // Salto directo a una fase
    if (t.dataset.phGo) {
        appData.view = "plan";
        activeScript.phase = t.dataset.phGo;
        updateActiveScript({ phase: activeScript.phase });
        saveAppData();
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Salto a una escena especifica desde la lista de tomas del guion
    if (t.dataset.j !== undefined) {
        appData.session = null;
        activeScript.cur = +t.dataset.j;
        appData.view = "grabar";
        updateActiveScript({ cur: activeScript.cur });
        saveAppData();
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Copiar bloques individuales de texto
    if (t.dataset.copy) {
        const el = $("cp" + t.dataset.copy);
        if (el) copyToClipboard(el.textContent, el);
        return;
    }

    switch (t.id) {
        case "go": {
            const v = $("src").value.trim();
            if (!v) {
                showToast("Pega un guion para organizar");
                return;
            }
            const customTitle = $("script-title-input").value.trim();
            const parsed = parseScript(v);
            const finalTitle = customTitle || parsed.title || (isNewScript ? "Nuevo Guion" : activeScript.title);

            if (isNewScript) {
                createScript(finalTitle, v);
                isNewScript = false;
                showToast("Nuevo guion creado");
            } else {
                const preservedDone = (v === activeScript.text)
                    ? (activeScript.done || {})
                    : reconcileDoneState(activeScript.text, activeScript.done || {}, v);

                updateActiveScript({
                    title: finalTitle,
                    text: v,
                    done: preservedDone,
                });
                showToast("Guion actualizado");
            }

            appData.view = "plan";
            saveAppData();
            render();
            window.scrollTo(0, 0);
            break;
        }
        case "clear": {
            $("src").value = "";
            $("script-title-input").value = "";
            $("src").focus();
            break;
        }
        case "btn-copy-claude-prompt": {
            copyToClipboard(CLAUDE_PROMPT_TEMPLATE, t);
            showToast("Prompt para Claude copiado al portapapeles");
            break;
        }
        case "share": {
            copyToClipboard(generateChecklistText(activeScript.phase));
            break;
        }
        case "prev": {
            setRecCur(Math.max(0, getRecState().cur - 1));
            render();
            break;
        }
        case "next": {
            registerTake(false);
            break;
        }
        case "mark-shot": {
            registerTake(true);
            break;
        }
        case "back": {
            setRecCur(Math.max(0, getRecState().q.length - 1));
            render();
            break;
        }
        case "kit-go": {
            const v = $("kit-src").value.trim();
            if (!v) {
                showToast("Pega el kit de la semana");
                return;
            }
            const kit = parseKit(v);
            if (!kit) {
                showToast("No encontré los días (por ejemplo: Martes 27 · Reel de adelanto)");
                return;
            }
            const { week, isUpdate } = importKit(kit);
            showToast(`Semana ${week.num} ${isUpdate ? "actualizada" : "cargada"}: ${kit.pieces.length} piezas, ${kit.sessions.length} bloques`);
            $("kit-src").value = "";
            goView("dashboard");
            break;
        }
        case "kit-clear": {
            $("kit-src").value = "";
            $("kit-src").focus();
            break;
        }
        case "btn-copy-kit-prompt": {
            copyToClipboard(CLAUDE_KIT_PROMPT, t);
            showToast("Prompt del kit copiado");
            break;
        }
        case "btn-delete-week": {
            const week = getActiveWeek();
            if (!week) break;
            showConfirmModal({
                title: "Eliminar semana",
                message: `Se eliminan "${week.title}" y sus ${weekScripts(week).length} piezas, con las tomas marcadas. ¿Continuar?`,
                confirmText: "Eliminar semana",
                confirmClass: "warn primary",
            }).then(confirmed => {
                if (!confirmed) return;
                deleteWeek(week.id);
                goView("dashboard");
                showToast("Semana eliminada");
            });
            break;
        }
        case "zp": {
            activeScript.z = Math.min(1.8, +(activeScript.z + 0.15).toFixed(2));
            updateActiveScript({ z: activeScript.z });
            renderRec();
            break;
        }
        case "zm": {
            activeScript.z = Math.max(0.8, +(activeScript.z - 0.15).toFixed(2));
            updateActiveScript({ z: activeScript.z });
            renderRec();
            break;
        }
        case "theme-toggle": {
            const nextTheme =
                document.documentElement.getAttribute("data-theme") === "dark"
                    ? "light"
                    : "dark";
            document.documentElement.setAttribute("data-theme", nextTheme);
            appData.theme = nextTheme;
            saveAppData();
            updateHeader();
            showToast(`Tema ${nextTheme === "dark" ? "Oscuro" : "Claro"}`);
            break;
        }
        case "btn-fullscreen": {
            toggleFullscreen();
            break;
        }
    }
});

// Modal de Confirmacion Dentro de la Pagina
let modalResolve = null;

function showConfirmModal({ title, message, confirmText = "Confirmar", confirmClass = "primary" }) {
    return new Promise(resolve => {
        modalResolve = resolve;
        const modal = $("confirm-modal");
        const titleEl = $("modal-title");
        const msgEl = $("modal-msg");
        const confirmBtn = $("modal-btn-confirm");

        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        if (confirmBtn) {
            confirmBtn.textContent = confirmText;
            confirmBtn.className = `btn ${confirmClass}`;
        }
        if (modal) {
            modal.hidden = false;
            modal.style.display = "flex";
        }
    });
}

function closeConfirmModal(result) {
    const modal = $("confirm-modal");
    if (modal) {
        modal.hidden = true;
        modal.style.display = "none";
    }
    if (modalResolve) {
        modalResolve(result);
        modalResolve = null;
    }
}

const modalCancelBtn = $("modal-btn-cancel");
if (modalCancelBtn) modalCancelBtn.addEventListener("click", () => closeConfirmModal(false));
const modalConfirmBtn = $("modal-btn-confirm");
if (modalConfirmBtn) modalConfirmBtn.addEventListener("click", () => closeConfirmModal(true));
const modalBackdrop = $("confirm-modal");
if (modalBackdrop) {
    modalBackdrop.addEventListener("click", e => {
        if (e.target === modalBackdrop) closeConfirmModal(false);
    });
}
document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
        const modal = $("confirm-modal");
        if (modal && !modal.hidden && modal.style.display !== "none") {
            closeConfirmModal(false);
        }
    }
});

// Importacion de Respaldo JSON
const fileInput = $("file-import");
if (fileInput) {
    fileInput.addEventListener("change", e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async ev => {
            try {
                const imported = JSON.parse(ev.target.result);
                const importedScripts = Array.isArray(imported.scripts)
                    ? imported.scripts
                    : Array.isArray(imported)
                    ? imported
                    : null;

                if (!importedScripts || !importedScripts.length) {
                    showToast("El archivo no contiene guiones validos");
                    return;
                }

                const count = importedScripts.length;
                const confirmed = await showConfirmModal({
                    title: "Importar guiones",
                    message: `Se añadiran ${count} ${count === 1 ? "guion" : "guiones"} a tu biblioteca existente sin reemplazarla. ¿Deseas continuar?`,
                    confirmText: "Añadir a la biblioteca",
                    confirmClass: "primary",
                });

                if (confirmed) {
                    const existingIds = new Set(appData.scripts.map(s => s.id));
                    let addedCount = 0;
                    (Array.isArray(imported.weeks) ? imported.weeks : []).forEach(w => {
                        if (w && w.id && !appData.weeks.some(x => x.id === w.id)) appData.weeks.push(w);
                    });
                    importedScripts.forEach(s => {
                        if (!s || !s.text) return;
                        let newId = s.id || ("script-" + Date.now());
                        while (existingIds.has(newId)) {
                            newId = "script-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
                        }
                        existingIds.add(newId);
                        appData.scripts.push({
                            ...s,
                            id: newId,
                            title: s.title || "Guion importado",
                            updatedAt: Date.now(),
                        });
                        addedCount++;
                    });

                    saveAppData();
                    render();
                    showToast(`Se añadieron ${addedCount} guiones a la biblioteca`);
                }
            } catch (err) {
                showToast("Error al leer el archivo JSON");
            } finally {
                fileInput.value = "";
            }
        };
        reader.readAsText(file);
    });
}

// Atajos de Teclado
document.addEventListener("keydown", e => {
    if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT" || e.target.isContentEditable)
        return;

    if (appData.view === "grabar") {
        if (e.target.closest && e.target.closest("button, summary, label")) return;
        const st = getRecState();
        if (e.key === "ArrowRight") {
            e.preventDefault();
            if (st.cur < st.q.length) {
                setRecCur(st.cur + 1);
                render();
            }
        } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            if (st.cur > 0) {
                setRecCur(st.cur - 1);
                render();
            }
        } else if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            registerTake(false);
        }
    }
});

// Reactivar WakeLock al regresar a la pestana
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        manageWakeLock(appData.view === "grabar");
    }
});

// Inicializacion de Tema e Interfaz
if (appData.theme && appData.theme !== "auto") {
    document.documentElement.setAttribute("data-theme", appData.theme);
}
render();
