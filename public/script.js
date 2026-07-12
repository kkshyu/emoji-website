// ponytail: 原生 API，零相依。導覽列（滾動陰影＋手機選單）已移至共用 nav.js。
  // 進場 reveal 與試營運倒數留在本檔。
  // 試營運倒數：2026-10-13 00:00 台北時間；歸零後停在 0（試營運開始後記得改版）
  const target = new Date('2026-10-13T00:00:00+08:00');
  const cd = document.getElementById('countdown');
  if (cd) {
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
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, {threshold:0, rootMargin:'0px 0px 22% 0px'});
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
