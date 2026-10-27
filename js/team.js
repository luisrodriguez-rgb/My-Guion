/* ==========================================================================
   My-Guion - Equipo: personas, roles y quien hace cada pieza
   ========================================================================== */

const AVATAR_COLORS = ["#d9481c", "#2563a8", "#8a3fb0", "#2f7d4f", "#b7791f", "#0e7c86", "#b83280"];

function getTeam() {
    if (!Array.isArray(appData.team)) appData.team = [];
    return appData.team;
}

/** Guarda una persona nueva o editada. */
function saveTeamMember({ id, name, role, note }) {
    const team = getTeam();
    const clean2 = v => String(v || "").trim();
    if (!clean2(name)) return null;
    let m = id && team.find(x => x.id === id);
    if (!m) {
        m = { id: "person-" + Date.now(), color: AVATAR_COLORS[team.length % AVATAR_COLORS.length] };
        team.push(m);
    }
    Object.assign(m, { name: clean2(name), role: clean2(role), note: clean2(note) });
    saveAppData();
    return m;
}

function deleteTeamMember(id) {
    appData.team = getTeam().filter(m => m.id !== id);
    appData.scripts.forEach(s => {
        if (Array.isArray(s.people)) s.people = s.people.filter(p => p !== id);
    });
    saveAppData();
}

/**
 * Personas de una pieza: las asignadas a mano o, si no hay, las que el kit
 * nombra en "Quien la graba o disena" (por nombre o por rol).
 * @param {object} s - Guion o pieza.
 * @returns {{ people: object[], auto: boolean }}
 */
function piecePeople(s) {
    const team = getTeam();
    if (Array.isArray(s.people) && s.people.length) {
        return { people: s.people.map(id => team.find(m => m.id === id)).filter(Boolean), auto: false };
    }
    const owner = fold(s.owner);
    if (!owner) return { people: [], auto: true };
    const stem = w => fold(w).replace(/[^a-z ]/g, " ").split(/\s+/).filter(x => x.length > 3).map(x => x.slice(0, 6));
    const people = team.filter(m => [...stem(m.name), ...stem(m.role)].some(st => owner.includes(st)));
    return { people, auto: true };
}

/** Iniciales para el avatar. */
function initials(name) {
    return String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

/** Circulos con las iniciales de las personas. */
function avatarsHTML(people, size = "") {
    if (!people.length) return "";
    return `<span class="avatars ${size}">${people
        .map(m => `<span class="avatar" style="--av:${esc(m.color)}" title="${esc(m.name)}${m.role ? ` · ${esc(m.role)}` : ""}">${esc(initials(m.name))}</span>`)
        .join("")}</span>`;
}

/** Selector de personas para una pieza (vista de guion). */
function renderAssignHTML(s) {
    const team = getTeam();
    const { people, auto } = piecePeople(s);
    const ids = people.map(m => m.id);
    return `
    <div class="assign">
      <span class="tracker-label">Quién la hace</span>
      ${team.length
          ? team.map(m => `
            <button class="assign-chip ${ids.includes(m.id) ? "on" : ""} ${auto && ids.includes(m.id) ? "auto" : ""}" data-assign="${esc(m.id)}" title="${auto && ids.includes(m.id) ? "Sugerido por el kit; toca para fijar" : ""}">
              ${avatarsHTML([m])}<span>${esc(m.name)}</span>
            </button>`).join("")
          : `<span class="muted">${s.owner ? esc(s.owner) + " · " : ""}Agrega el equipo en Inicio para asignar personas.</span>`}
    </div>
    <label class="piece-note">
      <span class="tracker-label">Nota para el equipo</span>
      <textarea id="piece-note" rows="2" placeholder="Ej.: la colaboradora es nueva, mándale el mensaje de WhatsApp con las frases">${esc(s.note || "")}</textarea>
    </label>`;
}

/** Seccion Equipo del Inicio. */
function renderTeamHTML(week) {
    const team = getTeam();
    const scripts = week ? weekScripts(week) : [];
    const form = homeUI.teamForm;
    const editing = form && form !== "new" ? team.find(m => m.id === form) : null;
    const countFor = m => scripts.filter(s => piecePeople(s).people.includes(m)).length;

    const formHTML = form ? `
      <form class="team-form" id="team-form">
        <input type="hidden" name="memberId" value="${esc(editing ? editing.id : "")}">
        <input name="name" placeholder="Nombre (ej.: Laura)" value="${esc(editing ? editing.name : "")}" required>
        <input name="role" placeholder="Qué hace (ej.: Colaboradora de Bogotá)" value="${esc(editing ? editing.role : "")}">
        <input name="note" placeholder="Nota (ej.: nueva, graba los martes)" value="${esc(editing ? editing.note : "")}">
        <div class="row">
          <button class="btn primary small" type="submit">${editing ? "Guardar" : "Añadir"}</button>
          <button class="btn ghost small" type="button" data-team-cancel>Cancelar</button>
        </div>
      </form>` : "";

    return `
    <section class="home-section">
      <div class="home-section-h">
        <h3>${icon("users")} Equipo</h3>
        ${form ? "" : `<button class="btn small ghost" data-team-add>${icon("plus")} Añadir persona</button>`}
      </div>
      ${team.length ? `
      <div class="team-grid">
        ${team.map(m => `
          <div class="team-card">
            ${avatarsHTML([m], "lg")}
            <div class="team-body">
              <div class="team-name">${esc(m.name)}</div>
              ${m.role ? `<div class="team-role">${esc(m.role)}</div>` : ""}
              ${m.note ? `<div class="team-note">${icon("note")}${esc(m.note)}</div>` : ""}
              ${week ? `<div class="team-count mono">${countFor(m)} ${countFor(m) === 1 ? "pieza" : "piezas"} esta semana</div>` : ""}
            </div>
            <div class="team-actions">
              <button class="icon-btn" data-team-edit="${esc(m.id)}" aria-label="Editar ${esc(m.name)}">${icon("pencil")}</button>
              <button class="icon-btn" data-team-del="${esc(m.id)}" aria-label="Quitar ${esc(m.name)}">${icon("x")}</button>
            </div>
          </div>`).join("")}
      </div>` : form ? "" : `<p class="hint">Agrega a las personas (por ejemplo la diseñadora o la colaboradora de Bogotá) para ver en cada pieza quién la hace. Si el kit nombra su rol, se asignan solas.</p>`}
      ${formHTML}
    </section>`;
}
