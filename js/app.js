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

    oldParsed.secs.forEach((sec, i) => {
        if (sec.kind === "scene" && oldDone["s" + i]) {
            const sig = [clean(sec.title), clean(sec.action), (sec.says || []).map(x => clean(x.v)).join(" ")].join("||");
            doneSignatures.add(sig);
            if (sec.title) doneTitles.add(clean(sec.title));
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

    newParsed.secs.forEach((sec, i) => {
        if (sec.kind === "scene") {
            const sig = [clean(sec.title), clean(sec.action), (sec.says || []).map(x => clean(x.v)).join(" ")].join("||");
            const cleanTitle = clean(sec.title);
            if (doneSignatures.has(sig) || (cleanTitle && doneTitles.has(cleanTitle))) {
                newDone["s" + i] = true;
            }
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
        const allScenesDone = prog.scenesTotal > 0 && prog.scenesDone === prog.scenesTotal;
        const someScenesDone = prog.scenesDone > 0 && prog.scenesDone < prog.scenesTotal;

        const edit = prog.byPhase["editar"] || { d: 0, n: 0 };
        const editAllDone = edit.n > 0 && edit.d === edit.n;
        const editPartial = edit.d > 0 && edit.d < edit.n;

        const allChannelsDone = s.channels && Object.values(s.channels).length > 0 && Object.values(s.channels).every(c => c && c.done);

        if (allChannelsDone) {
            label = "Publicado";
            baseStatus = "Publicado";
            cls = "status-publicado";
        } else if (s.publishDate && new Date(s.publishDate).getTime() > Date.now()) {
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
            baseStatus = "Grabado";
            cls = "status-grabado";
        } else {
            label = "Guion listo";
            baseStatus = "Guion listo";
            cls = "status-guion-listo";
        }
    }

    // Registrar cambio de estado en el historial con fecha
    if (!Array.isArray(s.history)) {
        s.history = [];
    }
    const lastHistory = s.history[s.history.length - 1];
    if (!lastHistory || lastHistory.status !== baseStatus) {
        s.history.push({ status: baseStatus, date: Date.now() });
        s.status = baseStatus;
        saveAppData();
    }

    return { label, cls, baseStatus };
}

/**
 * Actualiza el encabezado tipo claqueta con el titulo y la barra de progreso global.
 */
function updateHeader() {
    activeScript = getActiveScript();
    const titleEl = $("vtitle");
    if (titleEl && document.activeElement !== titleEl) {
        titleEl.textContent = activeScript.title || doc.title;
    }

    const prog = getProgress(activeScript);
    const cntEl = $("cnt");
    const barFillEl = $("barfill");

    if (cntEl) cntEl.textContent = `${prog.percent}%`;
    if (barFillEl) barFillEl.style.width = `${prog.percent}%`;

    // Boton de Tema en cabecera
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const themeBtn = $("theme-toggle");
    if (themeBtn) {
        themeBtn.textContent = currentTheme === "dark" ? "Tema: Claro" : "Tema: Oscuro";
    }

    // Boton de retorno a biblioteca
    const backDashBtn = $("btn-to-dashboard");
    if (backDashBtn) {
        backDashBtn.style.display = appData.view === "dashboard" ? "none" : "inline-block";
    }

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

    if (appData.view === "dashboard") {
        if (backBtn) backBtn.hidden = true;
        if (sepScript) sepScript.hidden = true;
        if (crumbScript) crumbScript.hidden = true;
        if (sepStep) sepStep.hidden = true;
        if (crumbStep) crumbStep.hidden = true;
    } else {
        if (backBtn) backBtn.hidden = false;
        if (sepScript) sepScript.hidden = false;
        if (crumbScript) {
            crumbScript.hidden = false;
            const scriptTitle = activeScript.title || "Guion";
            crumbScript.textContent = scriptTitle;
            crumbScript.title = scriptTitle;
        }

        if (appData.view === "guion") {
            if (sepStep) sepStep.hidden = false;
            if (crumbStep) {
                crumbStep.hidden = false;
                crumbStep.textContent = "Editar texto";
            }
        } else if (appData.view === "grabar") {
            if (sepStep) sepStep.hidden = false;
            if (crumbStep) {
                crumbStep.hidden = false;
                crumbStep.textContent = "Teleprompter";
            }
        } else {
            const phaseNames = {
                notas: "Preparar",
                antes: "Preparar",
                grabar: "Grabar",
                editar: "Editar",
                publicar: "Publicar",
            };
            const stepName = phaseNames[activeScript.phase] || "Preparar";
            if (sepStep) sepStep.hidden = false;
            if (crumbStep) {
                crumbStep.hidden = false;
                crumbStep.textContent = stepName;
            }
        }
    }
}

/**
 * Renderiza la vista de Dashboard (Biblioteca de Guiones).
 */
function renderDashboard() {
    const grid = $("dash-grid");
    if (!grid) return;

    if (!appData.scripts.length) {
        grid.innerHTML = `
      <div class="dash-empty" style="grid-column: 1 / -1;">
        <h3>No tienes ningún guion guardado todavía</h3>
        <p class="hint" style="margin-inline:auto">Pega el guion que te dio Claude o ChatGPT para comenzar a organizar tu rodaje.</p>
        <button class="btn primary" id="btn-create-script-empty" style="margin-top:12px">+ Crear mi primer guion</button>
      </div>`;
        return;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysFromNow = today + 7 * 24 * 60 * 60 * 1000;

    const estaSemana = [];
    const pendientes = [];
    const publicados = [];

    appData.scripts.forEach(s => {
        const status = computeScriptStatus(s);
        const isPub = status.baseStatus === "Publicado";

        if (isPub) {
            publicados.push({ s, status, overdue: false, upcoming: false });
            return;
        }

        if (s.publishDate) {
            const parts = s.publishDate.split("-");
            if (parts.length === 3) {
                const targetDate = new Date(+parts[0], +parts[1] - 1, +parts[2]).getTime();
                if (targetDate < today) {
                    estaSemana.push({ s, status, overdue: true, upcoming: false, targetDate });
                    return;
                } else if (targetDate <= sevenDaysFromNow) {
                    estaSemana.push({ s, status, overdue: false, upcoming: true, targetDate });
                    return;
                }
            }
        }

        pendientes.push({ s, status, overdue: false, upcoming: false });
    });

    const renderCard = ({ s, status, overdue, upcoming, targetDate }) => {
        const prog = getProgress(s);
        const isActive = s.id === appData.activeScriptId;

        const dateStr = new Date(s.updatedAt || s.createdAt).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "short",
        });

        let pubDateBadge = "";
        if (overdue) {
            const targetStr = new Date(targetDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
            pubDateBadge = `<span class="dash-status badge-overdue">⚠️ Atrasado (${targetStr})</span>`;
        } else if (upcoming) {
            const targetStr = new Date(targetDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
            pubDateBadge = `<span class="dash-status badge-upcoming">📅 Publica ${targetStr}</span>`;
        } else if (s.publishDate) {
            const parts = s.publishDate.split("-");
            const targetStr = new Date(+parts[0], +parts[1] - 1, +parts[2]).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
            pubDateBadge = `<span class="dash-status">📅 ${targetStr}</span>`;
        }

        const isCardMuted = status.baseStatus === "Publicado";
        const isCardOverdue = overdue;

        return `
        <article class="dash-card ${isActive ? "active" : ""} ${isCardMuted ? "card-muted" : ""} ${isCardOverdue ? "card-overdue" : ""}" data-open-script="${s.id}">
          <div class="dash-card-top">
            <div class="dash-badge-row">
              <span class="dash-status ${status.cls}">${status.label}</span>
              ${pubDateBadge}
              <span class="dash-card-meta">${dateStr}</span>
            </div>
            <h3 class="dash-card-title">${esc(s.title || (parseScript(s.text).title))}</h3>
            <div class="dash-card-meta">
              <span>${prog.scenesDone}/${prog.scenesTotal} tomas</span>
              <span>·</span>
              <span>${prog.scenePc}% grabado</span>
              <span>·</span>
              <span>${prog.percent}% listo</span>
            </div>
          </div>

          <div class="dash-card-progress">
            <div class="p-bar"><i style="width: ${prog.scenePc}%"></i></div>
          </div>

          <div class="dash-card-actions">
            <button class="btn primary small" data-dash-action="grabar" data-script-id="${s.id}">Grabar</button>
            <button class="btn small" data-dash-action="plan" data-script-id="${s.id}">Plan</button>
            <button class="btn ghost small" data-dash-action="duplicate" data-script-id="${s.id}" title="Duplicar guion">Duplicar</button>
            <button class="btn ghost small warn" data-dash-action="delete" data-script-id="${s.id}" title="Eliminar guion">Eliminar</button>
          </div>
        </article>`;
    };

    let fullHTML = "";

    // 1. Seccion Esta semana
    if (estaSemana.length) {
        const hasOverdue = estaSemana.some(x => x.overdue);
        fullHTML += `
      <section class="dash-section">
        <div class="dash-section-header">
          <h3 class="dash-section-title">
            <span>📅 Esta semana</span>
            <span class="dash-section-badge ${hasOverdue ? "warn" : ""}">${estaSemana.length} ${estaSemana.length === 1 ? "pieza" : "piezas"}${hasOverdue ? " (con atrasadas)" : ""}</span>
          </h3>
        </div>
        <div class="dash-grid">
          ${estaSemana.map(renderCard).join("")}
        </div>
      </section>`;
    }

    // 2. Seccion Pendientes
    fullHTML += `
    <section class="dash-section">
      <div class="dash-section-header">
        <h3 class="dash-section-title">
          <span>📝 Pendientes</span>
          <span class="dash-section-badge">${pendientes.length} ${pendientes.length === 1 ? "pieza" : "piezas"}</span>
        </h3>
      </div>
      <div class="dash-grid">
        ${pendientes.length ? pendientes.map(renderCard).join("") : `
          <p class="hint" style="grid-column: 1 / -1; padding: 12px 0;">No tienes piezas pendientes adicionales.</p>
        `}
      </div>
    </section>`;

    // 3. Seccion Publicados (plegada y en gris)
    if (publicados.length) {
        fullHTML += `
      <details class="dash-foldable-section">
        <summary class="dash-fold-summary">
          <span>✓ Publicados (${publicados.length})</span>
          <span class="dash-fold-hint">Plegado · Toca para ver</span>
        </summary>
        <div class="dash-foldable-content">
          <div class="dash-grid">
            ${publicados.map(renderCard).join("")}
          </div>
        </div>
      </details>`;
    }

    grid.innerHTML = fullHTML;
}

/**
 * Genera el marcado HTML para listas de items, notas, tablas y bloques de copy.
 * @param {object} s - Seccion del guion.
 * @param {number} i - Indice de la seccion.
 * @returns {string} HTML generado.
 */
function renderItemsHTML(s, i) {
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
            const isChecked = !!activeScript.done[key];
            out += `
        <label class="item ${isChecked ? "on" : ""}">
          <input type="checkbox" id="c${key}" data-k="${key}" ${isChecked ? "checked" : ""}>
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
            <button class="btn small" data-copy="${i}-${k}">Copiar</button>
          </div>
          <pre id="cp${i}-${k}">${esc(l.paras.join("\n\n"))}</pre>
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
        <div class="step-meta-row">
          <div class="step-counter-badge">Paso ${currentStep.num} de 4 · ${currentStep.name}</div>
          <div class="step-overall-meta">${prog.percent}% completado</div>
        </div>
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

    let html = `
    <div class="script-status-tracker">
      <div class="tracker-left">
        <label for="status-override-select" class="tracker-label">Estado:</label>
        <select id="status-override-select" class="tracker-select" title="Seleccionar estado manual o automático">
          <option value="" ${!activeScript.manualStatus ? "selected" : ""}>Auto (${statusObj.label})</option>
          <option value="Idea" ${activeScript.manualStatus === "Idea" ? "selected" : ""}>Idea</option>
          <option value="Guion listo" ${activeScript.manualStatus === "Guion listo" ? "selected" : ""}>Guion listo</option>
          <option value="Grabado" ${activeScript.manualStatus === "Grabado" ? "selected" : ""}>Grabado</option>
          <option value="En edición" ${activeScript.manualStatus === "En edición" ? "selected" : ""}>En edición</option>
          <option value="Editado" ${activeScript.manualStatus === "Editado" ? "selected" : ""}>Editado</option>
          <option value="Programado" ${activeScript.manualStatus === "Programado" ? "selected" : ""}>Programado</option>
          <option value="Publicado" ${activeScript.manualStatus === "Publicado" ? "selected" : ""}>Publicado</option>
        </select>
        <span class="dash-status ${statusObj.cls}">${statusObj.label}</span>
        <div class="tracker-date-wrap">
          <label for="script-publish-date" class="tracker-label">Publicar el:</label>
          <input type="date" id="script-publish-date" class="tracker-date-input" value="${activeScript.publishDate || ''}" title="Fecha límite o programada para publicar este video">
        </div>
      </div>
      <div class="tracker-history">
        <span class="tracker-history-title">Historial:</span>
        ${historyTrailHTML}
      </div>
    </div>

    <div class="phase-bar">
      <h2>Paso ${currentStep.num}: ${currentStep.name}</h2>
      <div class="row">`;

    if (currentStep.id === "grabar" && getScenes().length) {
        html += `<button class="btn primary small" data-v="grabar">🎬 Grabar escena por escena</button>`;
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
                    return `
              <button class="shot ${done ? "d" : ""}" data-j="${k}">
                <span class="sn">${k + 1}</span>
                <span class="sm">
                  <span class="st">${esc(s.title)}</span>
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
 * Renderiza los botones de navegacion rapida por puntos (Dots).
 */
function renderDots(sc) {
    return `
    <div class="dots">
      ${sc
          .map((x, k) => {
              const done = isSceneDone(x.i);
              const current = k === activeScript.cur;
              return `<button data-j="${k}" class="${done ? "d" : ""} ${current ? "c" : ""}" aria-label="Ir a la escena ${k + 1}">${k + 1}</button>`;
          })
          .join("")}
    </div>`;
}

/**
 * Renderiza la vista de Grabacion (Modo Teleprompter escena a escena).
 */
function renderRec() {
    const sc = getScenes();
    document.documentElement.style.setProperty("--z", activeScript.z);

    const zoomValEl = $("zoom-val");
    if (zoomValEl) {
        zoomValEl.textContent = `${Math.round(activeScript.z * 100)}%`;
    }

    if (!sc.length) {
        $("recpos").textContent = "";
        $("rec").innerHTML = `
      <p class="empty">Este guion no trae escenas detectables.<br>Pega uno con tabla o con formato “Escena 1, Escena 2…” en la pestana <b>Pegar guion</b>.</p>`;
        return;
    }

    const remindSecs = getSecsOf("grabar");
    const remindCount = remindSecs.reduce(
        (acc, x) => acc + x.s.lines.filter(l => l.t === "item" || l.t === "note").length,
        0
    );

    const remindHTML = remindSecs.length
        ? `
      <details class="remind" ${activeScript.open ? "open" : ""} id="rmd">
        <summary>Recordatorios para grabar (${remindCount} notas y tips)</summary>
        ${remindSecs
            .map(
                ({ s, i }) =>
                    (s.title
                        ? `<div class="lead" style="padding:0 16px">${esc(s.title)}</div>`
                        : "") +
                    `<div style="padding:0 16px 8px">${renderItemsHTML(s, i)}</div>`
            )
            .join("")}
      </details>`
        : "";

    // Pantalla de cierre de rodaje
    if (activeScript.cur >= sc.length) {
        $("recpos").textContent = "Rodaje Completo";
        $("rec").innerHTML = `
      <div class="scene wrapup">
        <b>Corte</b>
        <p class="hint" style="margin-inline:auto; font-size:1.05rem">Todas las escenas han sido grabadas. Puedes continuar con la fase de Edicion.</p>
        <div class="row" style="justify-content:center; margin-top:16px">
          <button class="btn" id="back">Volver a la ultima escena</button>
          <button class="btn primary" data-ph-go="editar">Ir a Editar</button>
        </div>
      </div>
      ${renderDots(sc)}`;
        return;
    }

    const { s, i } = sc[activeScript.cur];
    const isDone = isSceneDone(i);

    $("recpos").textContent = `Toma ${activeScript.cur + 1} de ${sc.length}`;
    $("rec").innerHTML = `
    ${remindHTML}
    <article class="scene ${isDone ? "d" : ""}">
      <div class="scene-h">
        <div class="big">${activeScript.cur + 1}</div>
        <div class="meta">
          ${s.time ? `<span class="pill">${esc(s.time)}</span>` : ""}
          <h2>${esc(s.title)}</h2>
        </div>
      </div>

      ${
          s.action
              ? `
        <div class="field">
          <div class="lbl">Que pasa (Accion)</div>
          <div class="action">${esc(s.action)}</div>
        </div>`
              : ""
      }

      ${
          s.says.length
              ? `
        <div class="field">
          <div class="lbl">Que se dice (Dialogo)</div>
          ${s.says
              .map(
                  x => `
            <div class="say">
              ${x.who ? `<span class="who ${getSpeakerClass(x.who)}">${esc(x.who)}</span>` : ""}
              <q>“${esc(x.v)}”</q>
            </div>`
              )
              .join("")}
        </div>`
              : ""
      }

      ${
          s.screen
              ? `
        <div class="field">
          <div class="lbl">Texto en pantalla (Overlay)</div>
          <div class="screen">${esc(s.screen)}</div>
        </div>`
              : ""
      }

      ${
          s.extra.length
              ? `
        <div class="field">
          ${s.extra.map(x => `<p class="note">${esc(x)}</p>`).join("")}
        </div>`
              : ""
      }

      ${s.lines && s.lines.length ? `<div class="field">${renderItemsHTML(s, i)}</div>` : ""}
    </article>

    <div class="nav">
      <button class="btn" id="prev" ${activeScript.cur === 0 ? "disabled" : ""}>&larr; Anterior</button>
      <button class="btn primary ${isDone ? "isdone" : ""}" id="next">
        ${isDone ? "Siguiente &rarr;" : "Lista, siguiente"}
      </button>
    </div>
    ${renderDots(sc)}`;
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

    ["dashboard", "plan", "grabar", "guion"].forEach(v => {
        const viewEl = $("v-" + v);
        const tabEl = $("t-" + (v === "dashboard" ? "dash" : v));
        if (viewEl) viewEl.hidden = appData.view !== v;
        if (tabEl) tabEl.setAttribute("aria-selected", appData.view === v);
    });

    if (appData.view === "dashboard") renderDashboard();
    if (appData.view === "plan") renderPlan();
    if (appData.view === "grabar") renderRec();

    manageWakeLock(appData.view === "grabar");
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
        } else if (appData.view === "plan") {
            appData.view = "dashboard";
        }
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
        appData.view = "plan";
        activeScript.phase = "grabar";
        saveAppData();
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Abrir tarjeta desde el Dashboard
    const cardEl = e.target.closest("[data-open-script]");
    if (cardEl && !e.target.closest("button")) {
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

    // Salto a una escena especifica desde dots o shot list
    if (t.dataset.j !== undefined) {
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

    const sc = getScenes();
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
        case "share": {
            copyToClipboard(generateChecklistText(activeScript.phase));
            break;
        }
        case "prev": {
            activeScript.cur = Math.max(0, activeScript.cur - 1);
            updateActiveScript({ cur: activeScript.cur });
            render();
            break;
        }
        case "next": {
            if (sc[activeScript.cur]) {
                const i = sc[activeScript.cur].i;
                activeScript.done["s" + i] = true;
                triggerHapticFeedback();
            }
            activeScript.cur++;
            updateActiveScript({ done: activeScript.done, cur: activeScript.cur });
            render();
            window.scrollTo(0, 0);
            break;
        }
        case "back": {
            activeScript.cur = Math.max(0, sc.length - 1);
            updateActiveScript({ cur: activeScript.cur });
            render();
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
        const sc = getScenes();
        if (e.key === "ArrowRight") {
            e.preventDefault();
            if (activeScript.cur < sc.length) {
                activeScript.cur++;
                updateActiveScript({ cur: activeScript.cur });
                render();
            }
        } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            if (activeScript.cur > 0) {
                activeScript.cur--;
                updateActiveScript({ cur: activeScript.cur });
                render();
            }
        } else if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            if (sc[activeScript.cur]) {
                const i = sc[activeScript.cur].i;
                activeScript.done["s" + i] = true;
                triggerHapticFeedback();
                activeScript.cur++;
                updateActiveScript({ done: activeScript.done, cur: activeScript.cur });
                render();
            }
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
