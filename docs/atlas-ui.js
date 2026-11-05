// Atlas kabuğu: odak modu, alt gezinme çubuğu (dock), yapı çekmecesi, kaydırıcı balonu.
// Telefonda (body.tel): odak düzeni varsayılan, kontroller "Ayarlar" alt panelinde, seçili yapı şeridi.
// app.js'ten bağımsızdır; yalnızca var olan düğmelere tıklayıp sınıfları okur.
(() => {
  const $ = (id) => document.getElementById(id);
  const body = document.body;

  // ---------- Odak modu ----------
  const head = document.querySelector('.viewer-head');
  const focusBtn = document.createElement('button');
  focusBtn.id = 'focusBtn';
  focusBtn.type = 'button';
  focusBtn.className = 'btn small';
  head.appendChild(focusBtn);

  // Telefonda odak modundan çıkış yok; geri dönüş BT listesine bağlantıyla
  const geri = document.createElement('a');
  geri.className = 'btn small geri';
  geri.href = 'bt.html';
  geri.setAttribute('aria-label', 'BT listesine dön');
  geri.innerHTML = `${UI.icon('back')}<span class="lbl">BT</span>`;
  head.prepend(geri);

  function setFocus(on) {
    body.classList.toggle('focus', on);
    if (!on) body.classList.remove('drawer', 'ayar');
    focusBtn.innerHTML = `${UI.icon(on ? 'minimize' : 'maximize')}<span class="lbl">${on ? 'Çık' : 'Odak'}</span>`;
    focusBtn.title = on ? 'Odak modundan çık (Esc, F)' : 'Odak modu: kesiti büyüt (F)';
    focusBtn.setAttribute('aria-pressed', on);
    dockSync();
    // Tuval boyutu değişir; app.js'teki ResizeObserver yeniden çizer
    window.scrollTo(0, 0);
  }
  focusBtn.addEventListener('click', () => setFocus(!body.classList.contains('focus')));

  // ---------- Alt gezinme çubuğu ----------
  const dock = document.createElement('nav');
  dock.className = 'dock';
  dock.setAttribute('aria-label', 'Hızlı gezinme');
  const PLANES = [['axial', 'Aksiyel'], ['coronal', 'Koronal'], ['sagittal', 'Sagittal']];
  dock.innerHTML =
    PLANES.map(([p, t]) => `<button type="button" data-plane="${p}">${UI.icon(p)}<span>${t}</span></button>`).join('') +
    `<button type="button" data-act="list">${UI.icon('layers')}<span>Yapılar</span></button>` +
    `<button type="button" data-act="quiz">${UI.icon('target')}<span>Test</span></button>` +
    `<button type="button" data-act="ayar" class="dock-ayar">${UI.icon('sliders')}<span>Ayarlar</span></button>`;
  body.appendChild(dock);

  // ---------- Ayarlar alt paneli (yalnızca telefon) ----------
  const sheet = document.createElement('section');
  sheet.className = 'sheet';
  sheet.id = 'ayarSheet';
  sheet.setAttribute('aria-label', 'Ayarlar');
  sheet.innerHTML =
    '<div class="sheet-grip" aria-hidden="true"></div>' +
    '<div class="sheet-head"><div><span class="caption">AYARLAR</span><b id="ayarBaslik"></b></div>' +
    '<button type="button" class="btn small" id="ayarKapat">Kapat</button></div>' +
    '<div class="sheet-body" id="ayarGovde"></div>';
  body.appendChild(sheet);

  // Telefonda üst eylemler (vaka, dil, paylaş, tema) ve araç çubuğu panele taşınır; masaüstüne dönünce eski yerine
  const yerler = [];
  function ayarlaraTasi(tasi) {
    const kutu = $('ayarGovde');
    if (tasi) {
      [document.querySelector('.topbar .top-actions'), document.querySelector('.toolbar')].forEach((el) => {
        if (!el) return;
        yerler.push({ el, ata: el.parentNode, sonraki: el.nextSibling });
        kutu.appendChild(el);
      });
    } else {
      yerler.splice(0).reverse().forEach(({ el, ata, sonraki }) => {
        ata.insertBefore(el, sonraki && sonraki.parentNode === ata ? sonraki : null);
      });
    }
  }

  const kapatAlt = () => { body.classList.remove('drawer', 'ayar'); dockSync(); };
  function ac(ad) {
    const acik = body.classList.contains(ad);
    body.classList.remove('drawer', 'ayar');
    if (!acik) {
      body.classList.add(ad);
      if (ad === 'ayar') $('ayarBaslik').textContent = $('title').textContent;
    }
    dockSync();
  }

  dock.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.plane) {
      document.querySelector(`#planes [data-plane="${b.dataset.plane}"]`).click();
    } else if (b.dataset.act === 'quiz') {
      body.classList.remove('ayar');
      $('quizBtn').click();
    } else if (b.dataset.act === 'ayar') {
      ac('ayar');
    } else if (b.dataset.act === 'list') {
      if (body.classList.contains('focus')) ac('drawer');
      else document.querySelector('.list-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  $('ayarKapat').addEventListener('click', kapatAlt);

  // Düzlem düğmelerinin "on" durumu app.js'teki #planes ile eşlenir
  function dockSync() {
    const on = document.querySelector('#planes button.on')?.dataset.plane;
    dock.querySelectorAll('[data-plane]').forEach((b) => {
      const sel = b.dataset.plane === on;
      b.classList.toggle('on', sel);
      b.setAttribute('aria-pressed', sel);
    });
    dock.querySelector('[data-act="list"]').classList.toggle('on', body.classList.contains('drawer'));
    dock.querySelector('[data-act="ayar"]').classList.toggle('on', body.classList.contains('ayar'));
    dock.querySelector('[data-act="quiz"] span').textContent = $('quiz').hidden ? 'Test' : 'Bitir';
  }
  new MutationObserver(dockSync).observe($('planes'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  new MutationObserver(dockSync).observe($('quiz'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(dockSync).observe(body, { attributes: true, attributeFilter: ['class'] });

  // Panel ve çekmece dışına dokununca kapat
  document.addEventListener('pointerdown', (e) => {
    if (!body.classList.contains('drawer') && !body.classList.contains('ayar')) return;
    if (e.target.closest('.panel, .dock, .sheet, .selstrip')) return;
    kapatAlt();
  });

  // Tutamaçtan aşağı çekince alt panel kapanır
  function surukleKapat(tutamac, hedef) {
    let y0 = null;
    let dy = 0;
    tutamac.addEventListener('pointerdown', (e) => {
      y0 = e.clientY;
      dy = 0;
      tutamac.setPointerCapture(e.pointerId);
      hedef.style.transition = 'none';
    });
    tutamac.addEventListener('pointermove', (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      hedef.style.transform = `translateY(${dy}px)`;
    });
    const bit = () => {
      if (y0 === null) return;
      y0 = null;
      hedef.style.transition = '';
      if (dy > 70) kapatAlt();
      setTimeout(() => { hedef.style.transform = ''; }, 30);
    };
    tutamac.addEventListener('pointerup', bit);
    tutamac.addEventListener('pointercancel', bit);
    tutamac.addEventListener('lostpointercapture', bit);
  }
  const panel = document.querySelector('.panel');
  const panelTutamac = document.createElement('div');
  panelTutamac.className = 'sheet-grip panel-grip';
  panelTutamac.setAttribute('aria-hidden', 'true');
  panel.prepend(panelTutamac);
  surukleKapat(panelTutamac, panel);
  surukleKapat(sheet.querySelector('.sheet-grip'), sheet);

  // ---------- Seçili yapı şeridi (telefon): görüntünün altında ad, dokununca ayrıntı paneli ----------
  const serit = document.createElement('button');
  serit.type = 'button';
  serit.className = 'selstrip';
  serit.hidden = true;
  serit.setAttribute('aria-label', 'Seçili yapının ayrıntısını aç');
  $('viewer').appendChild(serit);
  function seritGuncelle() {
    const ad = $('info').querySelector('.name');
    const bos = !ad || $('info').classList.contains('empty') || !$('quiz').hidden;
    serit.hidden = bos;
    if (bos) return;
    const rozet = document.createElement('span');
    rozet.className = 'swatch';
    rozet.style.background = ad.querySelector('.swatch')?.style.background || 'var(--accent)';
    const b = document.createElement('b');
    b.textContent = ad.textContent.trim();
    const ayr = document.createElement('span');
    ayr.className = 'ayr';
    ayr.innerHTML = `Ayrıntı ${UI.icon('chevron')}`;
    serit.replaceChildren(rozet, b, ayr);
  }
  new MutationObserver(seritGuncelle).observe($('info'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  new MutationObserver(seritGuncelle).observe($('quiz'), { attributes: true, attributeFilter: ['hidden'] });
  // Üçlü + 3B'de tek pencere gizli olduğundan şerit üçlü görünümün üst çubuğuna taşınır
  function seritYerles() {
    const yer = body.classList.contains('mpr-aktif') ? $('mpr')?.querySelector('.mpr-bar') : $('viewer');
    if (yer && serit.parentNode !== yer) yer.appendChild(serit);
  }
  new MutationObserver(seritYerles).observe(body, { attributes: true, attributeFilter: ['class'] });
  serit.addEventListener('click', () => {
    body.classList.remove('ayar');
    body.classList.add('drawer');
    panel.scrollTop = 0;
    dockSync();
  });

  // ---------- Telefon modu ----------
  const telMQ = matchMedia('(max-width: 640px), (pointer: coarse) and (max-height: 500px)');
  function telUygula() {
    const tel = telMQ.matches;
    if (tel === body.classList.contains('tel')) return;
    body.classList.toggle('tel', tel);
    body.classList.remove('drawer', 'ayar');
    ayarlaraTasi(tel);
    setFocus(tel);
  }
  telMQ.addEventListener('change', telUygula);

  // ---------- Klavye ----------
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (body.classList.contains('tel')) return;
    if (e.key === 'f' || e.key === 'F') { setFocus(!body.classList.contains('focus')); e.preventDefault(); }
    else if (e.key === 'Escape' && body.classList.contains('focus')) setFocus(false);
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
  // Açılışta panellerin kayarak kapanma animasyonu görünmesin
  body.classList.add('baslangic');
  telUygula();
  setTimeout(() => body.classList.remove('baslangic'), 500);
})();
