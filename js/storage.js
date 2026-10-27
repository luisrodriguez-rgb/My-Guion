/* ==========================================================================
   My-Guion - Gestion de Estado y Multi-Proyectos (Dashboard)
   ========================================================================== */

/**
 * Canales por defecto de distribucion social.
 */
function getDefaultChannels() {
    return {
        instagram: { done: false, date: null, url: "" },
        tiktok: { done: false, date: null, url: "" },
        facebook: { done: false, date: null, url: "" },
        whatsapp: { done: false, date: null, url: "" },
    };
}

/**
 * Estado general de la aplicacion con soporte multi-guion.
 */
let appData = {
    activeScriptId: "seamos-genios",
    view: "dashboard", // 'dashboard', 'plan', 'grabar', 'guion', 'semana', 'guia'
    theme: "auto",
    weeks: [], // Kits de produccion semanales (ver js/week.js)
    activeWeekId: null,
    session: null, // Sesion de grabacion en curso: { weekId, blockId, cur }
    team: [], // Personas del equipo: { id, name, role, note, color }
    helpDismissed: false,
    scripts: [
        {
            id: "seamos-genios",
            title: "Guion Seamos Genios (Pregunta tipo ICFES)",
            text: SAMPLE_SCRIPT,
            done: {},
            cur: 0,
            z: 1,
            phase: "antes",
            open: false,
            status: "Guion listo",
            manualStatus: null,
            publishDate: "",
            channels: getDefaultChannels(),
            history: [
                { status: "Guion listo", date: Date.now() - 3600000 },
            ],
            createdAt: Date.now() - 3600000,
            updatedAt: Date.now(),
        },
    ],
};

/**
 * Carga el estado guardado en localStorage con migracion automatica de versiones previas.
 */
function loadAppData() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && typeof parsed === "object" && Array.isArray(parsed.scripts)) {
                appData = Object.assign(appData, parsed);
                if (!Array.isArray(appData.weeks)) appData.weeks = [];
                if (appData.activeWeekId === undefined) appData.activeWeekId = null;
                if (appData.session === undefined) appData.session = null;
                if (!Array.isArray(appData.team)) appData.team = [];

                // Migracion segura: garantizar campos de seguimiento sin perder tareas chuleadas
                appData.scripts.forEach(s => {
                    if (!s.channels || typeof s.channels !== "object") {
                        s.channels = getDefaultChannels();
                    } else {
                        // Garantizar que esten las 4 redes
                        const def = getDefaultChannels();
                        Object.keys(def).forEach(k => {
                            if (!s.channels[k]) s.channels[k] = def[k];
                        });
                    }
                    if (s.publishDate === undefined) s.publishDate = "";
                    if (!Array.isArray(s.history)) {
                        s.history = [
                            { status: s.status || "Guion listo", date: s.createdAt || Date.now() }
                        ];
                    }
                    if (!s.status) s.status = "Guion listo";
                    if (!s.phase) s.phase = "antes";
                });
                saveAppData();
                return;
            }
        }

        // Migracion desde versiones anteriores (v2 o v3)
        const oldV3 = localStorage.getItem("myguion.v3");
        const oldV2 = localStorage.getItem("myguion.v2");
        const legacy = oldV3 || oldV2;
        if (legacy) {
            const parsedLegacy = JSON.parse(legacy);
            if (parsedLegacy && typeof parsedLegacy === "object" && parsedLegacy.text) {
                appData.scripts[0].text = parsedLegacy.text;
                appData.scripts[0].done = parsedLegacy.done || {};
                appData.scripts[0].cur = parsedLegacy.cur || 0;
                appData.scripts[0].z = parsedLegacy.z || 1;
                appData.scripts[0].phase = parsedLegacy.phase || "antes";
                appData.theme = parsedLegacy.theme || "auto";
                saveAppData();
                return;
            }
        }
    } catch (e) {
        console.warn("No se pudo leer localStorage:", e);
    }
}

/**
 * Guarda el estado actual en localStorage.
 */
function saveAppData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    } catch (e) {
        console.warn("No se pudo guardar en localStorage:", e);
    }
}

/**
 * Obtiene el guion activo actual.
 * @returns {object}
 */
function getActiveScript() {
    let script = appData.scripts.find(s => s.id === appData.activeScriptId);
    if (!script) {
        script = appData.scripts[0];
        if (script) {
            appData.activeScriptId = script.id;
        } else {
            script = createScript("Nuevo Guion", SAMPLE_SCRIPT);
        }
    }
    return script;
}

/**
 * Construye un guion vacio con todos los campos de seguimiento.
 * @param {string} title - Titulo del guion.
 * @param {string} text - Contenido del guion.
 * @returns {object}
 */
function newScriptRecord(title, text) {
    const now = Date.now();
    const initStatus = text ? "Guion listo" : "Idea";
    return {
        id: "script-" + now + "-" + Math.random().toString(36).slice(2, 6),
        title: title || "Nuevo Guion",
        text: text || "",
        done: {},
        cur: 0,
        z: 1,
        phase: "antes",
        open: false,
        status: initStatus,
        manualStatus: null,
        publishDate: "",
        channels: getDefaultChannels(),
        history: [
            { status: initStatus, date: now }
        ],
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * Crea un nuevo proyecto de guion y lo establece como activo.
 * @param {string} title - Titulo del guion.
 * @param {string} text - Contenido del guion.
 * @returns {object} El nuevo guion creado.
 */
function createScript(title, text) {
    const newScript = newScriptRecord(title, text);
    appData.scripts.unshift(newScript);
    appData.activeScriptId = newScript.id;
    saveAppData();
    return newScript;
}

/**
 * Actualiza los datos del guion activo.
 * @param {object} updates - Propiedades a actualizar.
 */
function updateActiveScript(updates) {
    const script = getActiveScript();
    if (script) {
        Object.assign(script, updates);
        script.updatedAt = Date.now();
        saveAppData();
    }
}

/**
 * Duplica un guion existente.
 * @param {string} id - Identificador del guion.
 */
function duplicateScript(id) {
    const original = appData.scripts.find(s => s.id === id);
    if (!original) return;
    const copy = JSON.parse(JSON.stringify(original));
    const now = Date.now();
    copy.id = "script-" + now;
    delete copy.weekId;
    copy.title = `${original.title} (Copia)`;
    copy.done = {};
    copy.cur = 0;
    copy.status = "Guion listo";
    copy.manualStatus = null;
    copy.publishDate = "";
    copy.channels = getDefaultChannels();
    copy.history = [{ status: "Guion listo", date: now }];
    copy.createdAt = now;
    copy.updatedAt = now;
    appData.scripts.unshift(copy);
    saveAppData();
}

/**
 * Elimina un guion por ID.
 * @param {string} id - Identificador del guion.
 */
function deleteScript(id) {
    if (appData.scripts.length <= 1) {
        // Si es el ultimo, reiniciamos su contenido en lugar de dejar el array vacio
        appData.scripts[0] = newScriptRecord("Nuevo Guion", "");
        appData.activeScriptId = appData.scripts[0].id;
    } else {
        appData.scripts = appData.scripts.filter(s => s.id !== id);
        if (appData.activeScriptId === id) {
            appData.activeScriptId = appData.scripts[0].id;
        }
    }
    saveAppData();
}

/**
 * Reinicia el progreso del guion activo.
 */
function resetActiveScriptProgress() {
    updateActiveScript({ done: {}, cur: 0 });
}

/**
 * Exporta todos los proyectos en un archivo JSON descargable.
 */
function exportBackup() {
    const dataStr =
        "data:text/json;charset=utf-8," +
        encodeURIComponent(JSON.stringify(appData, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute(
        "download",
        `My-Guion-Dashboard-Backup-${new Date().toISOString().slice(0, 10)}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}
