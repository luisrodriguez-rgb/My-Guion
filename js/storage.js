/* ==========================================================================
   My-Guion - Gestión de Estado y Persistencia Local
   ========================================================================== */

/**
 * Estado global reactivo de la aplicación.
 */
let appState = {
    text: SAMPLE_SCRIPT,
    done: {},
    view: "plan",
    phase: "grabar",
    cur: 0,
    z: 1,
    open: false,
    theme: "auto",
};

/**
 * Carga el estado guardado en localStorage de forma segura con fallback.
 */
function loadState() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && typeof parsed === "object") {
                appState = Object.assign(appState, parsed);
            }
        }
    } catch (e) {
        console.warn("No se pudo leer localStorage:", e);
    }
}

/**
 * Guarda el estado actual en localStorage de forma segura.
 */
function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch (e) {
        console.warn("No se pudo guardar en localStorage:", e);
    }
}

/**
 * Reinicia el progreso de las tareas marcadas conservando el guion actual.
 */
function resetProgress() {
    appState.done = {};
    appState.cur = 0;
    saveState();
}

/**
 * Exporta el estado y el guion en un archivo JSON descargable.
 */
function exportBackup() {
    const dataStr =
        "data:text/json;charset=utf-8," +
        encodeURIComponent(JSON.stringify(appState, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `My-Guion-Backup-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}
