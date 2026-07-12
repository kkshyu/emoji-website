/* 全站共用導覽列行為：滾動陰影、手機漢堡選單、下拉 Esc 收合、登入態文案。
   桌機下拉以 CSS hover/focus-within 處理，本檔僅補行為層。零相依。 */
(function () {
  'use strict';
  var nav = document.getElementById('nav');
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');

  // 已登入時導覽列顯示會員名稱（token payload / 快取 / /api/state）
  var member = document.getElementById('navMember');
  if (member) {
    try {
      var token = localStorage.getItem('tth_token');
      if (token) {
        var show = function (name) {
          if (!name) return;
          try { localStorage.setItem('tth_name', name); } catch (e) {}
          member.textContent = name;
        };
        var fromTok = (function () {
          try {
            var b64 = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4) b64 += '=';
            var bin = atob(b64), bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            var p = JSON.parse(new TextDecoder().decode(bytes));
            return (p && p.name) || '';
          } catch (e) { return ''; }
        })();
        var cached = localStorage.getItem('tth_name') || '';
        if (fromTok || cached) {
          show(fromTok || cached);
        } else {
          member.textContent = member.getAttribute('data-label-authed') || member.textContent;
          fetch('/api/state', { headers: { authorization: 'Bearer ' + token } })
            .then(function (r) {
              if (r.status === 401) {
                try { localStorage.removeItem('tth_token'); localStorage.removeItem('tth_name'); } catch (e) {}
                return null;
              }
              return r.ok ? r.json() : null;
            })
            .then(function (d) { if (d && d.me && d.me.name) show(d.me.name); })
            .catch(function () {});
        }
      }
    } catch (e) { /* private mode 等略過 */ }
  }

  if (nav) {
    addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', scrollY > 8);
    }, { passive: true });
  }

  if (toggle && links) {
    var setMenu = function (open) {
      links.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open
        ? (toggle.dataset.labelClose || 'Close menu')
        : (toggle.dataset.labelOpen || 'Open menu'));
      toggle.textContent = open ? '✕' : '☰';
    };
    toggle.addEventListener('click', function () {
      setMenu(!links.classList.contains('open'));
    });
    // 點選單內連結後收合
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    // Esc 關閉手機選單並收合下拉
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        setMenu(false);
        document.querySelectorAll('.site-nav__dd.open').forEach(function (d) { d.classList.remove('open'); });
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      }
    });
  }

  // 下拉：觸控／窄螢幕改「點擊展開」（桌機可 hover 者交給 CSS，不攔截）
  var touchLike = window.matchMedia('(hover:none), (max-width:900px)');
  document.querySelectorAll('.site-nav__dd-top').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      if (!touchLike.matches) return;              // 桌機：hover 顯示，放行預設行為
      var dd = btn.closest('.site-nav__dd');
      if (!dd) return;
      if (btn.tagName === 'BUTTON') e.preventDefault();
      var willOpen = !dd.classList.contains('open');
      document.querySelectorAll('.site-nav__dd.open').forEach(function (o) { if (o !== dd) o.classList.remove('open'); });
      dd.classList.toggle('open', willOpen);
      btn.setAttribute('aria-expanded', String(willOpen));
    });
  });
  // 點擊下拉以外處收合（桌機點擊模式或觸控）
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.site-nav__dd')) {
      document.querySelectorAll('.site-nav__dd.open').forEach(function (d) { d.classList.remove('open'); });
    }
  });
})();
