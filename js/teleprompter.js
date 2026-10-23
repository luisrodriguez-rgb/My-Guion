/* ==========================================================================
   My-Guion - Módulo de Teleprompter, Grabación y WakeLock
   ========================================================================== */

let wakeLockSentinel = null;

/**
 * Controla la API Screen WakeLock para mantener la pantalla encendida mientras se graba.
 * @param {boolean} on - Activar o desactivar el bloqueo de suspensión.
 */
async function manageWakeLock(on) {
    try {
        if (on && !wakeLockSentinel && "wakeLock" in navigator) {
            wakeLockSentinel = await navigator.wakeLock.request("screen");
            wakeLockSentinel.addEventListener("release", () => {
                wakeLockSentinel = null;
            });
        } else if (!on && wakeLockSentinel) {
            await wakeLockSentinel.release();
            wakeLockSentinel = null;
        }
    } catch (err) {
        wakeLockSentinel = null;
    }
}

/**
 * Respuesta háptica sutil para confirmación en teléfonos móviles.
 */
function triggerHapticFeedback() {
    if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
        try {
            navigator.vibrate([30, 20, 40]);
        } catch (e) {
            // Ignorar si el navegador bloquea la vibración
        }
    }
}

/**
 * Alterna el modo de pantalla completa para grabación sin distracciones.
 */
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
    }
}
