/* ==========================================================================
   My-Guion - Controlador Principal de la Aplicación
   ========================================================================== */

// Inicialización de estado y documento parseado
loadState();
let doc = parseScript(appState.text);

// Utilidades DOM
const $ = id => document.getElementById(id);
const esc = s =>
    String(s ?? "").replace(
        /[&<>"]/g,
        c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );

// Consultas estructuradas sobre el guion
const getScenes = () =>
    doc.secs.map((s, i) => ({ s, i })).filter(x => x.s.kind === "scene");
const getSecsOf = ph =>
    doc.secs
        .map((s, i) => ({ s, i }))
        .filter(x => x.s.kind === "sec" && x.s.phase === ph);
const isSceneDone = i => !!appState.done["s" + i];

/**
 * Obtiene todas las claves únicas de checklist para una fase dada.
 * @param {string} ph - Identificador de fase.
 * @returns {string[]}
 */
function getItemKeys(ph) {
    const keys = [];
    getSecsOf(ph).forEach(({ s, i }) =>
        s.lines.forEach((l, k) => {
            if (l.t === "item") keys.push(i + "-" + k);
        })
    );
    getScenes().forEach(({ s, i }) => {
        if (ph === "grabar") {
            keys.push("s" + i);
            (s.lines || []).forEach((l, k) => {
                if (l.t === "item") keys.push(i + "-" + k);
            });
        }
    });
    return keys;
}

/**
 * Fases que tienen contenido disponible en el guion actual.
 */
function getShownPhases() {
    return PHASES.filter(p =>
        p.id === "grabar"
            ? getScenes().length || getSecsOf("grabar").length
            : getSecsOf(p.id).length
    );
}

/**
 * Calcula el progreso de tareas completadas de una fase.
 * @param {string} ph - Identificador de fase.
 * @returns {{ d: number, n: number }}
 */
function getProgress(ph) {
    const keys = getItemKeys(ph);
    return {
        d: keys.filter(x => appState.done[x]).length,
        n: keys.length,
    };
}

/**
 * Actualiza el encabezado tipo claqueta con el título y la barra de progreso global.
 */
function updateHeader() {
    const titleEl = $("vtitle");
    if (titleEl) titleEl.textContent = doc.title;

    let d = 0,
        n = 0;
    PHASES.forEach(p => {
        const r = getProgress(p.id);
        d += r.d;
        n += r.n;
    });

    const pc = n ? Math.round((d / n) * 100) : 0;
    const cntEl = $("cnt");
    const barFillEl = $("barfill");

    if (cntEl) cntEl.textContent = `${pc}%`;
    if (barFillEl) barFillEl.style.width = `${pc}%`;
}

/**
 * Genera el marcado HTML para listas de ítems, notas y bloques de copy.
 * @param {object} s - Sección del guion.
 * @param {number} i - Índice de la sección.
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
            const isChecked = !!appState.done[key];
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
 * Renderiza la vista de Plan con las fases y sus checklists.
 */
function renderPlan() {
    const shown = getShownPhases();
    if (!shown.find(p => p.id === appState.phase)) {
        appState.phase = (
            shown.find(p => p.id === "grabar") ||
            shown[0] || { id: "notas" }
        ).id;
    }

    const phasesContainer = $("phases");
    phasesContainer.style.setProperty("--n", shown.length);
    phasesContainer.innerHTML = shown
        .map(p => {
            const r = getProgress(p.id);
            const isFull = r.n > 0 && r.d === r.n;
            return `
      <button class="ph ${isFull ? "full" : ""}" role="tab" data-ph="${p.id}" aria-selected="${appState.phase === p.id}">
        <span class="k">${p.id === "notas" ? "INFO" : isFull ? "LISTO" : `${r.d}/${r.n}`}</span>
        <span class="n">${p.name}</span>
        <span class="p"><i style="width: ${r.n ? (r.d / r.n) * 100 : 0}%"></i></span>
      </button>`;
        })
        .join("");

    const currentPhaseObj = PHASES.find(x => x.id === appState.phase);
    let html = `
    <div class="phase-bar">
      <h2>${currentPhaseObj.name}</h2>
      <div class="row">`;

    if (currentPhaseObj.id === "grabar" && getScenes().length) {
        html += `<button class="btn primary small" data-v="grabar">Grabar escena por escena</button>`;
    }
    if (currentPhaseObj.id !== "notas") {
        html += `<button class="btn small" id="share">Copiar checklist</button>`;
    }

    html += `</div></div><div class="list">`;

    // Si estamos en fase Grabar y hay escenas estructuradas, mostramos el shot list
    if (currentPhaseObj.id === "grabar" && getScenes().length) {
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

    // Secciones y tarjetas de la fase activa
    getSecsOf(currentPhaseObj.id).forEach(({ s, i }) => {
        html += `
      <div class="card ${currentPhaseObj.id === "notas" ? "notes" : ""}">
        ${s.title ? `<h3>${esc(s.title)}</h3>` : ""}
        ${renderItemsHTML(s, i)}
      </div>`;
    });

    html += `</div>`;
    $("phase").innerHTML = html;
}

/**
 * Devuelve la clase CSS del personaje de diálogo (P1, P2).
 */
function getSpeakerClass(who) {
    if (/^p1$/i.test(who)) return "p1";
    if (/^p2$/i.test(who)) return "p2";
    return "";
}

/**
 * Renderiza los botones de navegación rápida por puntos (Dots).
 */
function renderDots(sc) {
    return `
    <div class="dots">
      ${sc
          .map((x, k) => {
              const done = isSceneDone(x.i);
              const current = k === appState.cur;
              return `<button data-j="${k}" class="${done ? "d" : ""} ${current ? "c" : ""}" aria-label="Ir a la escena ${k + 1}">${k + 1}</button>`;
          })
          .join("")}
    </div>`;
}

/**
 * Renderiza la vista de Grabación (Modo Teleprompter escena a escena).
 */
function renderRec() {
    const sc = getScenes();
    document.documentElement.style.setProperty("--z", appState.z);

    if (!sc.length) {
        $("recpos").textContent = "";
        $("rec").innerHTML = `
      <p class="empty">Este guion no trae escenas detectables.<br>Pega uno con tabla o con formato “Escena 1, Escena 2…” en la pestaña <b>Pegar guion</b>.</p>`;
        return;
    }

    const remindSecs = getSecsOf("grabar");
    const remindHTML = remindSecs.length
        ? `
      <details class="remind" ${appState.open ? "open" : ""} id="rmd">
        <summary>Recordatorios para grabar (${remindSecs.reduce((acc, x) => acc + x.s.lines.filter(l => l.t === "item").length, 0)} puntos)</summary>
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
    if (appState.cur >= sc.length) {
        $("recpos").textContent = "Rodaje Completo";
        $("rec").innerHTML = `
      <div class="scene wrapup">
        <b>¡Corte!</b>
        <p class="hint" style="margin-inline:auto; font-size:1.05rem">Todas las escenas han sido grabadas. Puedes continuar con la fase de Edición.</p>
        <div class="row" style="justify-content:center; margin-top:16px">
          <button class="btn" id="back">Volver a la última escena</button>
          <button class="btn primary" data-ph-go="editar">Ir a Editar</button>
        </div>
      </div>
      ${renderDots(sc)}`;
        return;
    }

    const { s, i } = sc[appState.cur];
    const isDone = isSceneDone(i);

    $("recpos").textContent = `Escena ${appState.cur + 1} de ${sc.length}`;
    $("rec").innerHTML = `
    ${remindHTML}
    <article class="scene ${isDone ? "d" : ""}">
      <div class="scene-h">
        <div class="big">${appState.cur + 1}</div>
        <div class="meta">
          ${s.time ? `<span class="pill">${esc(s.time)}</span>` : ""}
          <h2>${esc(s.title)}</h2>
        </div>
      </div>

      ${
          s.action
              ? `
        <div class="field">
          <div class="lbl">Qué pasa (Acción)</div>
          <div class="action">${esc(s.action)}</div>
        </div>`
              : ""
      }

      ${
          s.says.length
              ? `
        <div class="field">
          <div class="lbl">Qué se dice (Diálogo)</div>
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
      <button class="btn" id="prev" ${appState.cur === 0 ? "disabled" : ""}>← Anterior</button>
      <button class="btn primary ${isDone ? "isdone" : ""}" id="next">
        ${isDone ? "Siguiente →" : "Lista, siguiente"}
      </button>
    </div>
    ${renderDots(sc)}`;
}

/**
 * Renderizador central de vistas.
 */
function render() {
    updateHeader();

    ["plan", "grabar", "guion"].forEach(v => {
        const viewEl = $("v-" + v);
        const tabEl = $("t-" + v);
        if (viewEl) viewEl.hidden = appState.view !== v;
        if (tabEl) tabEl.setAttribute("aria-selected", appState.view === v);
    });

    if (appState.view === "plan") renderPlan();
    if (appState.view === "grabar") renderRec();

    manageWakeLock(appState.view === "grabar");
}

/**
 * Notificación temporal tipo Toast.
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
 * @param {HTMLElement} [el] - Elemento DOM de respaldo para selección.
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
        showToast("Texto seleccionado: cópialo manualmente");
    }
}

/**
 * Genera el texto del checklist formateado con casillas ☑ / ☐ para compartir por WhatsApp.
 * @param {string} ph - Fase de rodaje.
 * @returns {string}
 */
function generateChecklistText(ph) {
    const p = PHASES.find(x => x.id === ph);
    const out = [`*${doc.title} — ${p.name}*`];

    if (ph === "grabar") {
        getScenes().forEach(({ s, i }, k) => {
            const mark = isSceneDone(i) ? "☑" : "☐";
            out.push(`${mark} Escena ${k + 1}${s.time ? ` (${s.time})` : ""}: ${s.title}`);
        });
    }

    getSecsOf(ph).forEach(({ s, i }) => {
        if (s.title) out.push("", `*${s.title.toUpperCase()}*`);
        s.lines.forEach((l, k) => {
            if (l.t === "item") {
                const mark = appState.done[`${i}-${k}`] ? "☑" : "☐";
                out.push(`${mark} ${l.v}`);
            }
        });
    });

    return out.join("\n");
}

// -----------------------------------------------------------------------------
// Controladores de Eventos Globales
// -----------------------------------------------------------------------------

// Modificación de Casillas de Verificación
document.addEventListener("change", e => {
    const k = e.target.dataset && e.target.dataset.k;
    if (!k) return;
    appState.done[k] = e.target.checked;
    saveState();
    render();
});

// Despliegue de Detalles de Recordatorios
document.addEventListener(
    "toggle",
    e => {
        if (e.target.id === "rmd") {
            appState.open = e.target.open;
            saveState();
        }
    },
    true
);

// Delegación de Clics en la Aplicación
document.addEventListener("click", e => {
    const t = e.target.closest("button");
    if (!t) return;

    // Cambio de vista principal (Plan / Grabar / Pegar guion)
    if (t.dataset.v) {
        appState.view = t.dataset.v;
        if (appState.view === "guion") {
            $("src").value = appState.text;
        }
        saveState();
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Cambio de fase en la vista de Plan
    if (t.dataset.ph) {
        appState.phase = t.dataset.ph;
        saveState();
        render();
        return;
    }

    // Salto directo a una fase
    if (t.dataset.phGo) {
        appState.view = "plan";
        appState.phase = t.dataset.phGo;
        saveState();
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Salto a una escena específica desde dots o lista de planos
    if (t.dataset.j !== undefined) {
        appState.cur = +t.dataset.j;
        appState.view = "grabar";
        saveState();
        render();
        window.scrollTo(0, 0);
        return;
    }

    // Copiar bloques individuales de texto (captions, bios, etc.)
    if (t.dataset.copy) {
        const el = $("cp" + t.dataset.copy);
        if (el) copyToClipboard(el.textContent, el);
        return;
    }

    const sc = getScenes();
    switch (t.id) {
        case "go": {
            const v = $("src").value.trim();
            if (!v) return;
            appState.text = v;
            appState.done = {};
            appState.cur = 0;
            appState.phase = "grabar";
            doc = parseScript(v);
            appState.view = "plan";
            saveState();
            render();
            window.scrollTo(0, 0);
            showToast("Guion organizado con éxito");
            break;
        }
        case "clear": {
            $("src").value = "";
            $("src").focus();
            break;
        }
        case "share": {
            copyToClipboard(generateChecklistText(appState.phase));
            break;
        }
        case "prev": {
            appState.cur = Math.max(0, appState.cur - 1);
            saveState();
            render();
            break;
        }
        case "next": {
            if (sc[appState.cur]) {
                const i = sc[appState.cur].i;
                appState.done["s" + i] = true;
                triggerHapticFeedback();
            }
            appState.cur++;
            saveState();
            render();
            window.scrollTo(0, 0);
            break;
        }
        case "back": {
            appState.cur = Math.max(0, sc.length - 1);
            saveState();
            render();
            break;
        }
        case "zp": {
            appState.z = Math.min(1.8, +(appState.z + 0.15).toFixed(2));
            saveState();
            renderRec();
            break;
        }
        case "zm": {
            appState.z = Math.max(0.8, +(appState.z - 0.15).toFixed(2));
            saveState();
            renderRec();
            break;
        }
        case "theme-toggle": {
            const nextTheme =
                document.documentElement.getAttribute("data-theme") === "dark"
                    ? "light"
                    : "dark";
            document.documentElement.setAttribute("data-theme", nextTheme);
            appState.theme = nextTheme;
            saveState();
            showToast(`Tema ${nextTheme === "dark" ? "Oscuro" : "Claro"}`);
            break;
        }
        case "btn-fullscreen": {
            toggleFullscreen();
            break;
        }
    }
});

// Atajos de Teclado Útiles durante la Grabación
document.addEventListener("keydown", e => {
    // Si el usuario está escribiendo en el textarea, ignorar atajos
    if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;

    if (appState.view === "grabar") {
        const sc = getScenes();
        if (e.key === "ArrowRight") {
            e.preventDefault();
            if (appState.cur < sc.length) {
                appState.cur++;
                saveState();
                render();
            }
        } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            if (appState.cur > 0) {
                appState.cur--;
                saveState();
                render();
            }
        } else if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            if (sc[appState.cur]) {
                const i = sc[appState.cur].i;
                appState.done["s" + i] = true;
                triggerHapticFeedback();
                appState.cur++;
                saveState();
                render();
            }
        }
    }
});

// Reactivar WakeLock cuando el usuario regresa a la pestaña
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        manageWakeLock(appState.view === "grabar");
    }
});

// Inicialización de Interfaz
if (appState.theme && appState.theme !== "auto") {
    document.documentElement.setAttribute("data-theme", appState.theme);
}
if ($("src")) {
    $("src").value = appState.text;
}
render();
