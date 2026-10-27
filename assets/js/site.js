(function () {
  // Mobilmeny
  var btn = document.querySelector('.menu-btn');
  var links = document.querySelector('.nav-links');
  if (btn && links) {
    btn.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { links.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    });
  }

  // År i sidfoten
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // Snöfall i hero (av vid "minska rörelse")
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('canvas[data-snow]').forEach(function (canvas) {
  if (reduce) return;
    var ctx = canvas.getContext('2d');
    var flakes = [];
    var w, h, dpr;
    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(140, w * h / 9000));
      flakes = [];
      for (var i = 0; i < n; i++) flakes.push(make(true));
    }
    function make(anywhere) {
      return { x: Math.random() * w, y: anywhere ? Math.random() * h : -10, r: 0.8 + Math.random() * 2.4, s: 0.3 + Math.random() * 0.9, d: Math.random() * Math.PI * 2, o: 0.35 + Math.random() * 0.55 };
    }
    function tick() {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.y += f.s; f.d += 0.01; f.x += Math.sin(f.d) * 0.35;
        if (f.y > h + 10) flakes[i] = make(false);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,' + f.o + ')'; ctx.fill();
      }
      requestAnimationFrame(tick);
    }
    size(); window.addEventListener('resize', size); requestAnimationFrame(tick);
  });

  // Storleksväljare för vinteravtal
  var switcher = document.querySelector('[data-size-switch]');
  if (switcher) {
    var prices = {
      liten:  { standard: [1299, 6495, 395], premium: [2499, 12495], halk: 1495 },
      mellan: { standard: [1599, 7995, 495], premium: [2999, 14995], halk: 1995 },
      stor:   { standard: [2199, 10995, 695], premium: [3999, 19995], halk: 2495 }
    };
    var fmt = function (n) { return n.toLocaleString('sv-SE').replace(/ /g, ' '); };
    function render(key) {
      var p = prices[key];
      document.querySelectorAll('[data-price]').forEach(function (el) {
        var plan = el.getAttribute('data-price').split('.');
        var v = plan[0] === 'halk' ? p.halk : p[plan[0]][plan[1] === 'season' ? 1 : plan[1] === 'extra' ? 2 : 0];
        el.textContent = fmt(v);
      });
      switcher.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.size === key ? 'true' : 'false'); });
      var sel = document.querySelector('select[name="Storlek"]');
      if (sel) { for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value.toLowerCase().indexOf(key) === 0) sel.selectedIndex = i; }
    }
    switcher.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (b) render(b.dataset.size);
    });
    render('mellan');
  }

  // Välj paket från priskort
  document.querySelectorAll('[data-pick-plan]').forEach(function (a) {
    a.addEventListener('click', function () {
      var sel = document.querySelector('select[name="Paket"]');
      if (sel) sel.value = a.getAttribute('data-pick-plan');
    });
  });

  // Formulär – skickas direkt som mejl via FormSubmit
  document.querySelectorAll('form.lead-form').forEach(function (form) {
    form.querySelectorAll('[data-contact]').forEach(function (i) {
      i.addEventListener('input', function () { form.querySelectorAll('[data-contact]')[0].setCustomValidity(''); });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = form.querySelector('.form-status');
      var submit = form.querySelector('button[type=submit]');
      var contact = form.querySelectorAll('[data-contact]');
      var anyContact = Array.prototype.some.call(contact, function (i) { return i.value.trim() !== ''; });
      if (contact.length) contact[0].setCustomValidity(anyContact ? '' : 'Fyll i telefon eller e-post så vi kan nå dig.');
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      data._subject = form.dataset.subject || 'Ny förfrågan från uppsalafixaren.se';
      data._template = 'table';
      data._captcha = 'false';
      data['Sida'] = location.pathname;
      var params = new URLSearchParams(location.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (k) { if (params.get(k)) data[k] = params.get(k); });
      submit.disabled = true; submit.textContent = 'Skickar …';
      status.className = 'form-status'; status.textContent = '';
      fetch('https://formsubmit.co/ajax/elias.carl.wennberg@gmail.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok && String(res.j.success) === 'true') {
            form.reset();
            status.className = 'form-status ok';
            status.textContent = 'Tack! Vi hör av oss inom 24 timmar, oftast samma dag.';
            if (window.fbq) window.fbq('track', 'Lead');
          } else { throw new Error('fail'); }
        })
        .catch(function () {
          status.className = 'form-status err';
          status.textContent = 'Det gick inte att skicka. Ring oss på 072-714 72 00 så hjälper vi dig direkt.';
        })
        .finally(function () { submit.disabled = false; submit.textContent = form.dataset.button || 'Skicka'; });
    });
  });
})();
