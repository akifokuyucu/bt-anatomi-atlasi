// Atlas kabuğu: odak modu, alt gezinme çubuğu (dock), yapı çekmecesi, kaydırıcı balonu.
// app.js'ten bağımsızdır; yalnızca var olan düğmelere tıklayıp sınıfları okur.
(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- Odak modu ----------
  const head = document.querySelector('.viewer-head');
  const focusBtn = document.createElement('button');
  focusBtn.id = 'focusBtn';
  focusBtn.type = 'button';
  focusBtn.className = 'btn small';
  head.appendChild(focusBtn);

  function setFocus(on) {
    document.body.classList.toggle('focus', on);
    if (!on) document.body.classList.remove('drawer');
    focusBtn.innerHTML = `${UI.icon(on ? 'minimize' : 'maximize')}<span class="lbl">${on ? 'Çık' : 'Odak'}</span>`;
    focusBtn.title = on ? 'Odak modundan çık (Esc, F)' : 'Odak modu: kesiti büyüt (F)';
    focusBtn.setAttribute('aria-pressed', on);
    dockSync();
    // Tuval boyutu değişir; app.js'teki ResizeObserver yeniden çizer
    window.scrollTo(0, 0);
  }
  focusBtn.addEventListener('click', () => setFocus(!document.body.classList.contains('focus')));

  // ---------- Alt gezinme çubuğu ----------
  const dock = document.createElement('nav');
  dock.className = 'dock';
  dock.setAttribute('aria-label', 'Hızlı gezinme');
  const PLANES = [['axial', 'Aksiyel'], ['coronal', 'Koronal'], ['sagittal', 'Sagittal']];
  dock.innerHTML =
    PLANES.map(([p, t]) => `<button type="button" data-plane="${p}">${UI.icon(p)}<span>${t}</span></button>`).join('') +
    `<button type="button" data-act="list">${UI.icon('layers')}<span>Yapılar</span></button>` +
    `<button type="button" data-act="quiz">${UI.icon('target')}<span>Test</span></button>`;
  document.body.appendChild(dock);

  // Yapılar: odak modunda çekmeceyi aç/kapa, normal modda yapı listesine in
  dock.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.plane) {
      document.querySelector(`#planes [data-plane="${b.dataset.plane}"]`).click();
    } else if (b.dataset.act === 'quiz') {
      $('quizBtn').click();
    } else if (b.dataset.act === 'list') {
      if (document.body.classList.contains('focus')) document.body.classList.toggle('drawer');
      else document.querySelector('.list-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Düzlem düğmelerinin "on" durumu app.js'teki #planes ile eşlenir
  function dockSync() {
    const on = document.querySelector('#planes button.on')?.dataset.plane;
    dock.querySelectorAll('[data-plane]').forEach((b) => {
      const sel = b.dataset.plane === on;
      b.classList.toggle('on', sel);
      b.setAttribute('aria-pressed', sel);
    });
    dock.querySelector('[data-act="list"]').classList.toggle('on', document.body.classList.contains('drawer'));
    dock.querySelector('[data-act="quiz"] span').textContent = $('quiz').hidden ? 'Test' : 'Bitir';
  }
  new MutationObserver(dockSync).observe($('planes'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  new MutationObserver(dockSync).observe($('quiz'), { attributes: true, attributeFilter: ['hidden'] });

  // Çekmece dışına dokununca kapat
  document.addEventListener('pointerdown', (e) => {
    if (!document.body.classList.contains('drawer')) return;
    if (e.target.closest('.panel, .dock')) return;
    document.body.classList.remove('drawer');
    dockSync();
  });

  // ---------- Klavye ----------
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'f' || e.key === 'F') { setFocus(!document.body.classList.contains('focus')); e.preventDefault(); }
    else if (e.key === 'Escape' && document.body.classList.contains('focus')) setFocus(false);
  });

  // ---------- Kaydırıcı balonu ----------
  const bar = document.querySelector('.slice-bar');
  const slider = $('slider');
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.hidden = true;
  bar.appendChild(bubble);
  let hideT = 0;
  const showBubble = () => {
    const max = +slider.max || 1;
    const r = slider.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    const f = (+slider.value) / max;
    bubble.textContent = `${+slider.value + 1}`;
    bubble.style.left = `${r.left - b.left + 8 + f * (r.width - 16)}px`;
    bubble.hidden = false;
    bubble.classList.add('show');
    clearTimeout(hideT);
    hideT = setTimeout(() => { bubble.classList.remove('show'); }, 700);
  };
  slider.addEventListener('input', showBubble);

  setFocus(false);
})();
