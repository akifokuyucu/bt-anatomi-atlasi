// Ortak arayüz yardımcıları: SVG ikonlar ve açık/koyu tema anahtarı.
// Klasik betik (defer); modüllerden önce çalışır ve window.UI'yi tanımlar.
(() => {
  // Lucide tarzı çizgi ikonlar, 24×24
  const P = {
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
    move: '<path d="m5 9-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
    scroll: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M16 21v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    axial: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/><path d="M3 12h18" opacity=".35"/>',
    coronal: '<rect x="4" y="3" width="16" height="18" rx="4"/><path d="M12 3v18" opacity=".35"/>',
    sagittal: '<path d="M8 3c6 0 9 3 9 9s-3 9-9 9"/><path d="M8 3v18" opacity=".35"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  };

  const icon = (name, cls = '') =>
    `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;
  // Göz düğmesi: açık ve kapalı hali CSS ile (.hid) değişir
  const eye = () => icon('eye', 'on') + icon('eye-off', 'off');

  const hydrate = (root = document) => {
    root.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
  };

  window.UI = { icon, eye, hydrate };

  // ---------- Tema ----------
  const KEY = 'btatlas.theme';
  const meta = () => document.querySelector('meta[name="theme-color"]');
  const current = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  function apply(t) {
    document.documentElement.dataset.theme = t;
    meta()?.setAttribute('content', t === 'light' ? '#f5f2ec' : '#08090c');
    const b = document.getElementById('themeBtn');
    if (b) {
      b.innerHTML = icon(t === 'light' ? 'moon' : 'sun');
      const label = t === 'light' ? 'Koyu temaya geç' : 'Açık temaya geç';
      b.title = label;
      b.setAttribute('aria-label', label);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    hydrate();
    const host = document.querySelector('.top-actions');
    if (host) {
      const b = document.createElement('button');
      b.id = 'themeBtn';
      b.className = 'btn icon';
      b.type = 'button';
      host.appendChild(b);
      b.addEventListener('click', () => {
        const t = current() === 'light' ? 'dark' : 'light';
        try { localStorage.setItem(KEY, t); } catch { /* özel pencere vb. */ }
        apply(t);
      });
    }
    apply(current());
  });
})();
