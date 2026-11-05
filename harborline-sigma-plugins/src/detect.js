// Works out whether the plugin is running inside a Sigma workbook.
// Sigma answers the SDK's start-up message with a "wb:" message. Outside Sigma
// (a browser tab, a shared preview link) nothing answers, and the plugin falls
// back to the Harborline sample data. Add #demo to the URL to force sample data.
export const host = { inSigma: false, listeners: new Set() };

if (typeof window !== 'undefined') {
  window.addEventListener('message', (e) => {
    // Only a parent window can be Sigma. Opened as a top-level page, the SDK's own
    // start-up message lands on this same window and must not count.
    if (!e || e.source === window || window.parent === window) return;
    const t = e.data && e.data.type;
    if (typeof t === 'string' && t.startsWith('wb:') && !host.inSigma) {
      host.inSigma = true;
      host.listeners.forEach((f) => f());
    }
  });
}

export const forcedDemo = typeof window !== 'undefined' && window.location.hash === '#demo';
