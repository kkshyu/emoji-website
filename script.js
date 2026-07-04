// ponytail: 三個小互動全用原生 API，零相依
  // 1) nav 滾動陰影  2) 手機選單  3) 進場 reveal
  const nav = document.getElementById('nav');
  addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8), {passive:true});

  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  const setMenu = open => {
    links.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-label', open ? toggle.dataset.labelClose : toggle.dataset.labelOpen);
    toggle.textContent = open ? '✕' : '☰';
  };
  toggle.addEventListener('click', () => setMenu(!links.classList.contains('open')));
  links.addEventListener('click', e => { if (e.target.tagName === 'A') setMenu(false); });

  // 試營運倒數：2026-09-01 00:00 台北時間；歸零後停在 0（試營運開始後記得改版）
  const target = new Date('2026-09-01T00:00:00+08:00');
  const cd = document.getElementById('countdown');
  const cdEls = Object.fromEntries([...cd.querySelectorAll('[data-u]')].map(el => [el.dataset.u, el]));
  const pad = n => String(n).padStart(2, '0');
  const tick = () => {
    let ms = Math.max(0, target - Date.now());
    cdEls.d.textContent = Math.floor(ms / 864e5); ms %= 864e5;
    cdEls.h.textContent = pad(Math.floor(ms / 36e5)); ms %= 36e5;
    cdEls.m.textContent = pad(Math.floor(ms / 6e4)); ms %= 6e4;
    cdEls.s.textContent = pad(Math.floor(ms / 1e3));
  };
  tick(); setInterval(tick, 1000);

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, {threshold:0.12, rootMargin:'0px 0px -8% 0px'});
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
