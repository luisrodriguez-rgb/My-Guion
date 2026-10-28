/* ==========================================================================
   My-Guion - Sincronizacion entre dispositivos (Supabase)
   Cada guion, semana y persona del equipo es un registro en la tabla items.
   Los cambios locales se suben a los pocos segundos y los de los demas llegan
   en vivo. Si dos personas cambian lo mismo sin conexion, las casillas se
   mezclan una por una y en lo demas gana el ultimo cambio.
   ========================================================================== */

const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
const SYNC_STATE_KEY = "myguion.sync";

/** Campos de cada guion que son del dispositivo (posicion y letra del teleprompter). */
const SYNC_DEVICE_KEYS = ["cur", "z", "open", "phase"];

/** Mapas de casillas que se mezclan clave por clave cuando ambos lados cambiaron. */
const SYNC_MERGE_MAPS = ["done", "takeCount", "channels"];

const SYNC_LABELS = {
    local: "Solo en este navegador",
    loading: "Conectando…",
    "signed-out": "Sin iniciar sesión",
    "link-sent": "Revisa tu correo",
    "no-access": "Tu correo no está en el equipo",
    syncing: "Guardando…",
    synced: "Sincronizado",
    offline: "Sin conexión",
    error: "No se pudo sincronizar",
};

const sync = {
    status: "local",
    error: "",
    client: null,
    user: null,
    workspace: null,
    channels: [],
    synced: {}, // "kind:id" -> JSON de lo que hay en la nube segun este dispositivo
    versions: {}, // "kind:id" -> updated_at de la nube, para ignorar avisos atrasados
    lastAt: null,
    sentTo: "",
    timer: null,
    pushing: false,
    again: false,
    handling: null,
};

/** Direccion base del proyecto: acepta tambien la que copia Supabase con /rest/v1/. */
function supabaseBaseUrl(url) {
    return String(url).trim().replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, "");
}

function syncEnabled() {
    return typeof SYNC_CONFIG !== "undefined" && !!SYNC_CONFIG.url && !!SYNC_CONFIG.anonKey;
}

function loadSyncState() {
    try {
        return JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || "{}");
    } catch (e) {
        return {};
    }
}

function saveSyncState() {
    try {
        localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
            workspaceId: sync.workspace ? sync.workspace.id : null,
            synced: sync.synced,
            versions: sync.versions,
            lastAt: sync.lastAt,
        }));
    } catch (e) {
        console.warn("No se pudo guardar el estado de sincronizacion:", e);
    }
}

function setSyncStatus(status, error) {
    sync.status = status;
    sync.error = error || "";
    if (typeof updateSyncIndicator === "function") updateSyncIndicator();
    if (typeof appData !== "undefined" && appData.view === "sync" && typeof renderSync === "function") renderSync();
}

// -----------------------------------------------------------------------------
// Entidades: lo que se comparte del estado local
// -----------------------------------------------------------------------------

/** Guiones, semanas y equipo como mapa "kind:id" -> datos compartidos. */
function syncEntities() {
    const out = {};
    appData.scripts.forEach(s => {
        const d = Object.assign({}, s);
        SYNC_DEVICE_KEYS.forEach(k => delete d[k]);
        out["script:" + s.id] = d;
    });
    (appData.weeks || []).forEach(w => (out["week:" + w.id] = w));
    (appData.team || []).forEach(m => (out["team:" + m.id] = m));
    return out;
}

const isPlainObject = v => v && typeof v === "object" && !Array.isArray(v);

/**
 * Mezcla de tres vias: lo que este dispositivo cambio respecto a la ultima
 * version sincronizada (base) se conserva; lo demas viene de la nube.
 */
function merge3(base, local, remote) {
    const out = Object.assign({}, remote);
    const keys = new Set([...Object.keys(base || {}), ...Object.keys(local), ...Object.keys(remote)]);
    keys.forEach(k => {
        const b = JSON.stringify((base || {})[k]);
        const l = JSON.stringify(local[k]);
        const r = JSON.stringify(remote[k]);
        if (l === b || l === r) return;
        if (r !== b && SYNC_MERGE_MAPS.includes(k) && isPlainObject(local[k]) && isPlainObject(remote[k])) {
            out[k] = merge3((base || {})[k] || {}, local[k], remote[k]);
        } else if (local[k] === undefined) {
            delete out[k];
        } else {
            out[k] = local[k];
        }
    });
    return out;
}

const listFor = kind => (kind === "script" ? appData.scripts : kind === "week" ? appData.weeks : appData.team);

/** Reemplaza o agrega una entidad que llego de la nube. */
function putEntity(kind, data) {
    if (kind === "team" && !Array.isArray(appData.team)) appData.team = [];
    const list = listFor(kind);
    const local = list.find(x => x.id === data.id);

    if (kind === "week" && !local) {
        // La misma semana cargada en otro navegador antes de sincronizar: se queda la de la nube
        const twin = appData.weeks.find(w => w.num === data.num && w.startDate === data.startDate && !(("week:" + w.id) in sync.synced));
        if (twin) {
            appData.weeks = appData.weeks.filter(w => w !== twin);
            appData.scripts = appData.scripts.filter(s => s.weekId !== twin.id);
        }
    }

    if (local) {
        const keep = {};
        if (kind === "script") SYNC_DEVICE_KEYS.forEach(k => (keep[k] = local[k]));
        Object.keys(local).forEach(k => delete local[k]);
        Object.assign(local, data, keep);
    } else if (kind === "script") {
        listFor(kind).push(Object.assign({ cur: 0, z: 1, open: false, phase: "antes" }, data));
    } else {
        listFor(kind).push(Object.assign({}, data));
    }
}

function removeEntity(key) {
    const [kind, ...rest] = key.split(":");
    const id = rest.join(":");
    if (kind === "script") appData.scripts = appData.scripts.filter(s => s.id !== id);
    if (kind === "week") appData.weeks = appData.weeks.filter(w => w.id !== id);
    if (kind === "team") appData.team = (appData.team || []).filter(m => m.id !== id);
    delete sync.synced[key];
    delete sync.versions[key];
    if (!appData.scripts.length) appData.scripts.push(newScriptRecord("Nuevo Guion", ""));
}

/**
 * Aplica un registro de la nube. Si este dispositivo tenia cambios sin subir
 * en esa misma entidad, los mezcla y deja la mezcla pendiente de subir.
 * @returns {boolean} true si cambio algo local.
 */
function applyRemote(row) {
    const key = row.kind + ":" + row.id;
    // Un aviso que llega tarde con una version mas vieja que la conocida no pisa nada
    if (row.updated_at && sync.versions[key] && row.updated_at < sync.versions[key]) return false;
    if (row.updated_at) sync.versions[key] = row.updated_at;
    const remoteJson = JSON.stringify(row.data);
    const local = syncEntities()[key];
    const localJson = local ? JSON.stringify(local) : undefined;
    if (localJson === remoteJson) {
        sync.synced[key] = remoteJson;
        return false;
    }
    if (sync.synced[key] === remoteJson) return false; // eco de lo que este dispositivo ya tenia
    const dirty = local && localJson !== sync.synced[key];
    const base = sync.synced[key] ? JSON.parse(sync.synced[key]) : {};
    putEntity(row.kind, dirty ? merge3(base, local, row.data) : row.data);
    sync.synced[key] = remoteJson;
    return true;
}

// -----------------------------------------------------------------------------
// Subir y bajar
// -----------------------------------------------------------------------------

/** Programa la subida de los cambios locales (se llama desde saveAppData). */
function scheduleSync() {
    if (!sync.workspace) return;
    clearTimeout(sync.timer);
    sync.timer = setTimeout(pushChanges, 700);
}

/** Sube lo que cambio desde la ultima sincronizacion y borra lo que se elimino. */
async function pushChanges() {
    if (!sync.workspace || !sync.client) return;
    if (sync.pushing) {
        sync.again = true;
        return;
    }
    const entities = syncEntities();
    const ups = Object.entries(entities)
        .map(([key, data]) => ({ key, data, json: JSON.stringify(data) }))
        .filter(u => sync.synced[u.key] !== u.json);
    const dels = Object.keys(sync.synced).filter(key => !(key in entities));
    if (!ups.length && !dels.length) {
        if (sync.status !== "synced") setSyncStatus("synced");
        return;
    }

    sync.pushing = true;
    setSyncStatus("syncing");
    try {
        if (ups.length) {
            const rows = ups.map(u => {
                const [kind, ...rest] = u.key.split(":");
                return { workspace_id: sync.workspace.id, kind, id: rest.join(":"), data: u.data, updated_by: sync.user.email };
            });
            // updated_at lo pone el servidor (docs/supabase.sql), asi no importa la hora de cada celular
            const { data, error } = await sync.client.from("items").upsert(rows).select("kind,id,updated_at");
            if (error) throw error;
            ups.forEach(u => (sync.synced[u.key] = u.json));
            (data || []).forEach(r => (sync.versions[r.kind + ":" + r.id] = r.updated_at));
        }
        for (const key of dels) {
            const [kind, ...rest] = key.split(":");
            const { error } = await sync.client.from("items").delete()
                .eq("workspace_id", sync.workspace.id).eq("kind", kind).eq("id", rest.join(":"));
            if (error) throw error;
            delete sync.synced[key];
            delete sync.versions[key];
        }
        sync.lastAt = Date.now();
        saveSyncState();
        setSyncStatus("synced");
    } catch (e) {
        setSyncStatus(navigator.onLine === false ? "offline" : "error", e.message || String(e));
    } finally {
        sync.pushing = false;
        if (sync.again) {
            sync.again = false;
            scheduleSync();
        }
    }
}

/** Baja todo lo del equipo, junta lo local que no estaba y sube lo pendiente. */
async function pullAll() {
    const { data, error } = await sync.client.from("items").select("kind,id,data,updated_at").eq("workspace_id", sync.workspace.id);
    if (error) throw error;
    const order = { week: 0, script: 1, team: 2 };
    const rows = [...data].sort((a, b) => order[a.kind] - order[b.kind]);
    const remoteKeys = new Set(rows.map(r => r.kind + ":" + r.id));
    // Lo que este dispositivo ya habia sincronizado y alguien borro en otro lado
    Object.keys(sync.synced).forEach(key => {
        if (!remoteKeys.has(key)) removeEntity(key);
    });
    rows.forEach(applyRemote);
    sync.lastAt = Date.now();
    saveAppData(); // tambien programa la subida de lo local que la nube no tenia
    saveSyncState();
    refreshAfterSync();
}

/** Vuelve a dibujar sin interrumpir a quien esta escribiendo. */
function refreshAfterSync() {
    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        el.addEventListener("blur", () => render(), { once: true });
        return;
    }
    render();
}

function subscribeLive() {
    const ws = sync.workspace.id;
    const onRow = payload => {
        let changed = false;
        if (payload.eventType === "DELETE") {
            const o = payload.old || {};
            if (o.workspace_id && o.workspace_id !== ws) return;
            const key = o.kind + ":" + o.id;
            if (key in sync.synced || syncEntities()[key]) {
                removeEntity(key);
                changed = true;
            }
        } else if (payload.new && payload.new.workspace_id === ws) {
            changed = applyRemote(payload.new);
        }
        if (!changed) return;
        saveAppData();
        saveSyncState();
        sync.lastAt = Date.now();
        refreshAfterSync();
    };
    // Los borrados no se pueden filtrar por equipo: se revisa workspace_id en el registro
    sync.channels = [
        sync.client.channel("items-" + ws)
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "items", filter: `workspace_id=eq.${ws}` }, onRow)
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "items", filter: `workspace_id=eq.${ws}` }, onRow)
            .on("postgres_changes", { event: "DELETE", schema: "public", table: "items" }, onRow)
            .subscribe(),
    ];
}

function unsubscribeLive() {
    sync.channels.forEach(ch => sync.client.removeChannel(ch));
    sync.channels = [];
}

// -----------------------------------------------------------------------------
// Sesion
// -----------------------------------------------------------------------------

function loadSupabaseLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = SUPABASE_JS_URL;
        s.onload = resolve;
        s.onerror = () => reject(new Error("No se pudo cargar Supabase"));
        document.head.appendChild(s);
    });
}

async function handleSession(session) {
    if (!session) {
        if (sync.workspace) unsubscribeLive();
        sync.user = null;
        sync.workspace = null;
        setSyncStatus(sync.sentTo ? "link-sent" : "signed-out");
        return;
    }
    if (sync.user && sync.user.id === session.user.id && sync.workspace) return;
    sync.user = session.user;
    setSyncStatus("loading");
    try {
        const { data, error } = await sync.client
            .from("members")
            .select("workspace_id, workspaces(name)")
            .ilike("email", session.user.email)
            .limit(1);
        if (error) throw error;
        if (!data || !data.length) {
            setSyncStatus("no-access");
            return;
        }
        const saved = loadSyncState();
        const ws = { id: data[0].workspace_id, name: (data[0].workspaces || {}).name || "Equipo" };
        if (saved.workspaceId && saved.workspaceId !== ws.id) {
            sync.synced = {};
            sync.versions = {};
        }
        sync.workspace = ws;
        sync.sentTo = "";
        await pullAll();
        subscribeLive();
        setSyncStatus("synced");
    } catch (e) {
        setSyncStatus(navigator.onLine === false ? "offline" : "error", e.message || String(e));
    }
}

/** Arranca la sincronizacion si la app esta conectada a Supabase. */
async function initSync() {
    if (!syncEnabled()) {
        setSyncStatus("local");
        return;
    }
    setSyncStatus("loading");
    try {
        await loadSupabaseLib();
    } catch (e) {
        setSyncStatus("offline", e.message);
        return;
    }
    const saved = loadSyncState();
    sync.synced = saved.synced || {};
    sync.versions = saved.versions || {};
    sync.lastAt = saved.lastAt || null;
    sync.client = window.supabase.createClient(supabaseBaseUrl(SYNC_CONFIG.url), SYNC_CONFIG.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    sync.client.auth.onAuthStateChange((event, session) => {
        sync.handling = Promise.resolve(sync.handling).then(() => handleSession(session));
    });
    const { data } = await sync.client.auth.getSession();
    sync.handling = Promise.resolve(sync.handling).then(() => handleSession(data.session));

    window.addEventListener("online", () => pushChanges());
    setInterval(() => {
        if (sync.status === "error" || sync.status === "offline") pushChanges();
    }, 30000);
}

/** Envia el enlace de acceso al correo. */
async function syncSignIn(email) {
    const { error } = await sync.client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) {
        setSyncStatus("signed-out", error.message);
        return false;
    }
    sync.sentTo = email;
    setSyncStatus("link-sent");
    return true;
}

async function syncSignOut() {
    if (sync.workspace) unsubscribeLive();
    sync.workspace = null;
    sync.sentTo = "";
    await sync.client.auth.signOut();
    setSyncStatus("signed-out");
}

/** Sincroniza ya: baja lo nuevo y sube lo pendiente. */
async function syncNow() {
    if (!sync.workspace) return;
    setSyncStatus("syncing");
    try {
        await pullAll();
        await pushChanges();
        setSyncStatus("synced");
    } catch (e) {
        setSyncStatus(navigator.onLine === false ? "offline" : "error", e.message || String(e));
    }
}

// -----------------------------------------------------------------------------
// Interfaz: indicador en la cabecera y pantalla "Sincronizar dispositivos"
// -----------------------------------------------------------------------------

/** Punto de estado junto al menu: verde sincronizado, amarillo guardando, rojo con problema. */
function updateSyncIndicator() {
    const el = document.getElementById("sync-indicator");
    if (!el) return;
    el.hidden = sync.status === "local";
    el.className = `sync-indicator is-${sync.status}`;
    el.title = SYNC_LABELS[sync.status] + (sync.error ? ` · ${sync.error}` : "");
    el.setAttribute("aria-label", el.title);
}

function renderSync() {
    const root = document.getElementById("sync-view");
    if (!root) return;
    const st = sync.status;
    const last = sync.lastAt
        ? new Date(sync.lastAt).toLocaleString("es-ES", { weekday: "short", hour: "numeric", minute: "2-digit" })
        : "todavía no";

    let body = "";
    if (st === "local") {
        body = `
      <p>Esta copia de la app todavía no está conectada a Supabase, así que todo se guarda solo en este navegador.</p>
      <p class="hint">Quien administra la app debe seguir los pasos de <b>docs/sincronizacion.md</b> (crear el proyecto y poner la dirección y la clave en <b>js/config.js</b>). Mientras tanto puedes pasar datos con <b>Descargar respaldo</b> e <b>Importar respaldo</b> del menú.</p>`;
    } else if (st === "signed-out" || st === "link-sent" || (st === "loading" && !sync.user)) {
        body = `
      ${st === "link-sent" ? `
      <div class="sync-note ok">${icon("message")}<span>Te enviamos un enlace a <b>${esc(sync.sentTo)}</b>. Ábrelo <b>en este mismo navegador</b> para entrar.</span></div>` : ""}
      <form id="sync-form" class="sync-form">
        <label for="sync-email" class="tracker-label">Tu correo</label>
        <div class="row">
          <input id="sync-email" type="email" name="email" required placeholder="nombre@correo.com" autocomplete="email" value="${esc(sync.sentTo)}">
          <button class="btn primary" type="submit">${st === "link-sent" ? "Reenviar enlace" : "Enviarme el enlace"}</button>
        </div>
        <p class="hint">No hay contraseña: te llega un enlace por correo. Solo entran los correos que están en el equipo.</p>
      </form>`;
    } else if (st === "no-access") {
        body = `
      <div class="sync-note bad">${icon("alert")}<span>El correo <b>${esc(sync.user ? sync.user.email : "")}</b> no está en el equipo. Pide que lo agreguen (docs/sincronizacion.md, "Agregar o quitar personas").</span></div>
      <div class="row"><button class="btn" id="btn-sync-out">Cerrar sesión</button></div>`;
    } else {
        body = `
      <dl class="sync-facts">
        <div><dt>Conectado como</dt><dd>${esc(sync.user ? sync.user.email : "")}</dd></div>
        <div><dt>Equipo</dt><dd>${esc(sync.workspace ? sync.workspace.name : "")}</dd></div>
        <div><dt>Última sincronización</dt><dd>${esc(last)}</dd></div>
      </dl>
      ${sync.error ? `<div class="sync-note bad">${icon("alert")}<span>${esc(sync.error)}. Lo que marques se guarda aquí y se sube cuando vuelva la conexión.</span></div>` : ""}
      <div class="row">
        <button class="btn primary" id="btn-sync-now">Sincronizar ahora</button>
        <button class="btn ghost" id="btn-sync-out">Cerrar sesión</button>
      </div>`;
    }

    root.innerHTML = `
    <div class="sync-head">
      <h2>Sincronizar dispositivos</h2>
      <p class="hint">Con tu correo, la semana, las tomas, las casillas y el equipo se ven igual en el computador, en el celular y en los dispositivos del equipo.</p>
    </div>
    <div class="sync-card">
      <div class="sync-status is-${st}"><span class="sync-dot"></span>${esc(SYNC_LABELS[st])}</div>
      ${body}
    </div>`;
}
