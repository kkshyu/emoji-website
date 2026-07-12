/**
 * 空間頁等角樓層目錄：依平面圖繪製 1F–4F，點擊展開詳情（1F 含菜單）。
 * 依賴頁面提供 #space-dir-root、#floor-detail，以及 window.SpaceDirContent 注入。
 */
(function (global) {
  'use strict';

  var I18N = {
    zh: {
      intro: '1F–4F',
      close: '收合',
      menuTitle: '餐飲菜單 Menu',
      areas: {
        1: 'Cafe & Bar · 約 25 坪',
        2: 'Member Plaza · 約 29 坪',
        3: 'Talent Lounge · 約 30 坪',
        4: '支援樓層 · 約 5 坪＋陽台',
      },
      names: {
        1: 'Emoji · Café & Bar',
        2: 'Member Plaza 會員休憩',
        3: 'Talent Lounge 共享辦公',
        4: '支援樓層',
      },
      kickers: {
        1: 'Public hospitality',
        2: 'Members only',
        3: 'Coworking & events',
        4: 'Support · rooftop',
      },
      hints: {
        1: '外帶口、廚房、吧台、座位與駐唱',
        2: '榻榻米、沙發、lattice 席、淋浴',
        3: '移動式桌椅、多面投影、自助吧',
        4: '洗衣與戶外吸菸／水塔陽台',
      },
    },
    en: {
      intro: '1F–4F',
      close: 'Close',
      menuTitle: 'Menu',
      areas: {
        1: 'Cafe & Bar · ~25 ping',
        2: 'Member Plaza · ~29 ping',
        3: 'Talent Lounge · ~30 ping',
        4: 'Support · ~5 ping + terrace',
      },
      names: {
        1: 'Emoji · Café & Bar',
        2: 'Member Plaza',
        3: 'Talent Lounge',
        4: 'Support floor',
      },
      kickers: {
        1: 'Public hospitality',
        2: 'Members only',
        3: 'Coworking & events',
        4: 'Support · rooftop',
      },
      hints: {
        1: 'Takeout, kitchen, bar, seats & stage',
        2: 'Tatami, sofas, lattice berths, shower',
        3: 'Movable desks, projection, snack bar',
        4: 'Laundry & outdoor smoking / tanks',
      },
    },
    ja: {
      intro: '1F–4F',
      close: '閉じる',
      menuTitle: 'メニュー Menu',
      areas: {
        1: 'Cafe & Bar · 約25坪',
        2: 'Member Plaza · 約29坪',
        3: 'Talent Lounge · 約30坪',
        4: 'サポート · 約5坪＋バルコニー',
      },
      names: {
        1: 'Emoji · Café & Bar',
        2: 'メンバープラザ',
        3: 'タレントラウンジ',
        4: 'サポートフロア',
      },
      kickers: {
        1: 'Public hospitality',
        2: 'Members only',
        3: 'Coworking & events',
        4: 'Support · rooftop',
      },
      hints: {
        1: 'テイクアウト・厨房・バー・客席・ステージ',
        2: '畳・ソファ・lattice席・シャワー',
        3: '可動デスク・投影・セルフバー',
        4: '洗濯と屋外喫煙／水塔テラス',
      },
    },
  };

  /** 等角：長屋進深沿 y，面寬沿 x */
  function iso(x, y, z) {
    var cos = 0.866;
    var sin = 0.5;
    return {
      x: (x - y) * cos,
      y: (x + y) * sin - z,
    };
  }

  function poly(pts) {
    return pts.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
  }

  function slabGroup(ox, oy, oz, W, D, H, furnSvg, floorId) {
    var a = iso(ox, oy, oz);
    var b = iso(ox + W, oy, oz);
    var c = iso(ox + W, oy + D, oz);
    var d = iso(ox, oy + D, oz);
    var a2 = iso(ox, oy, oz + H);
    var b2 = iso(ox + W, oy, oz + H);
    var c2 = iso(ox + W, oy + D, oz + H);
    var d2 = iso(ox, oy + D, oz + H);

    var top = poly([a2, b2, c2, d2]);
    var left = poly([d, d2, c2, c]);
    var right = poly([b, b2, c2, c]);

    // accent plant near front (yellow once when active)
    var plant = iso(ox + W * 0.12, oy + D * 0.18, oz + H + 2);

    return (
      '<g class="space-dir__floor" data-floor="' + floorId + '" tabindex="0" role="button" aria-pressed="false">' +
        '<polygon class="slab-side" points="' + left + '"/>' +
        '<polygon class="slab-face" points="' + right + '"/>' +
        '<polygon class="slab-top" points="' + top + '"/>' +
        furnSvg +
        '<circle class="accent-dot" cx="' + plant.x.toFixed(1) + '" cy="' + plant.y.toFixed(1) + '" r="3.2"/>' +
      '</g>'
    );
  }

  /** 家具座標相對樓板局部 (0..W, 0..D)，抬到 oz+H */
  function localIso(ox, oy, oz, W, D, H, lx, ly, lz) {
    return iso(ox + lx * W, oy + ly * D, oz + H + (lz || 0));
  }

  function furn1(ox, oy, oz, W, D, H) {
    var p = function (lx, ly, lz) { return localIso(ox, oy, oz, W, D, H, lx, ly, lz); };
    var takeout = [p(0.08, 0.02), p(0.42, 0.02), p(0.42, 0.1), p(0.08, 0.1)];
    var kitchen = [p(0.08, 0.12), p(0.92, 0.12), p(0.92, 0.28), p(0.08, 0.28)];
    var bar = [p(0.12, 0.34), p(0.82, 0.34), p(0.82, 0.42), p(0.12, 0.42)];
    var seats = '';
    for (var i = 0; i < 3; i++) {
      var y0 = 0.48 + i * 0.1;
      var desk = [p(0.18, y0), p(0.72, y0), p(0.72, y0 + 0.06), p(0.18, y0 + 0.06)];
      seats += '<polygon class="furn" points="' + poly(desk) + '"/>';
    }
    var stage = [p(0.2, 0.82), p(0.8, 0.82), p(0.8, 0.94), p(0.2, 0.94)];
    var stools = [0.22, 0.38, 0.54, 0.7].map(function (x) {
      var c = p(x, 0.46);
      return '<circle class="furn" cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="2"/>';
    }).join('');
    return (
      '<polygon class="furn-fill" points="' + poly(takeout) + '"/>' +
      '<polygon class="furn-fill" points="' + poly(kitchen) + '"/>' +
      '<polygon class="furn" points="' + poly(bar) + '"/>' +
      stools + seats +
      '<polygon class="furn" points="' + poly(stage) + '"/>'
    );
  }

  function furn2(ox, oy, oz, W, D, H) {
    var p = function (lx, ly, lz) { return localIso(ox, oy, oz, W, D, H, lx, ly, lz); };
    var tatami = [p(0.08, 0.04), p(0.92, 0.04), p(0.92, 0.28), p(0.08, 0.28)];
    var sofa = [p(0.1, 0.34), p(0.55, 0.34), p(0.55, 0.72), p(0.1, 0.72)];
    var cells = '';
    for (var i = 0; i < 6; i++) {
      var y0 = 0.34 + i * 0.07;
      var cell = [p(0.62, y0), p(0.92, y0), p(0.92, y0 + 0.055), p(0.62, y0 + 0.055)];
      cells += '<polygon class="furn" points="' + poly(cell) + '"/>';
    }
    var wet = [p(0.55, 0.8), p(0.94, 0.8), p(0.94, 0.96), p(0.55, 0.96)];
    return (
      '<polygon class="furn-fill" points="' + poly(tatami) + '"/>' +
      '<polygon class="furn" points="' + poly(sofa) + '"/>' +
      cells +
      '<polygon class="furn-fill" points="' + poly(wet) + '"/>'
    );
  }

  function furn3(ox, oy, oz, W, D, H) {
    var p = function (lx, ly, lz) { return localIso(ox, oy, oz, W, D, H, lx, ly, lz); };
    var screen = [p(0.08, 0.04), p(0.92, 0.04), p(0.92, 0.08), p(0.08, 0.08)];
    var desks = '';
    for (var row = 0; row < 4; row++) {
      for (var col = 0; col < 2; col++) {
        var x0 = 0.12 + col * 0.4;
        var y0 = 0.14 + row * 0.14;
        var desk = [p(x0, y0), p(x0 + 0.3, y0), p(x0 + 0.3, y0 + 0.08), p(x0, y0 + 0.08)];
        desks += '<polygon class="furn" points="' + poly(desk) + '"/>';
      }
    }
    var snack = [p(0.12, 0.74), p(0.55, 0.74), p(0.55, 0.88), p(0.12, 0.88)];
    var toilet = [p(0.62, 0.78), p(0.94, 0.78), p(0.94, 0.96), p(0.62, 0.96)];
    return (
      '<polygon class="furn-fill" points="' + poly(screen) + '"/>' +
      desks +
      '<polygon class="furn-fill" points="' + poly(snack) + '"/>' +
      '<polygon class="furn" points="' + poly(toilet) + '"/>'
    );
  }

  function furn4(ox, oy, oz, W, D, H) {
    var p = function (lx, ly, lz) { return localIso(ox, oy, oz, W, D, H, lx, ly, lz); };
    var indoor = [p(0.08, 0.08), p(0.7, 0.08), p(0.7, 0.92), p(0.08, 0.92)];
    var balcony = [p(0.72, 0.08), p(0.96, 0.08), p(0.96, 0.92), p(0.72, 0.92)];
    var t1 = p(0.84, 0.35);
    var t2 = p(0.84, 0.65);
    return (
      '<polygon class="furn-fill" points="' + poly(indoor) + '"/>' +
      '<polygon class="furn" points="' + poly(balcony) + '"/>' +
      '<circle class="furn" cx="' + t1.x.toFixed(1) + '" cy="' + t1.y.toFixed(1) + '" r="4"/>' +
      '<circle class="furn" cx="' + t2.x.toFixed(1) + '" cy="' + t2.y.toFixed(1) + '" r="4"/>'
    );
  }

  function buildSvg() {
    var W = 45;
    var D = 200;
    var H = 30;
    var seam = 3;
    var step = H + seam;
    var baseZ = 0;
    var ox = 0;
    var oy = 0;
    var d4 = Math.round(D * 0.35);
    var floors = [
      { id: 1, z: baseZ, W: W, D: D, furn: furn1 },
      { id: 2, z: baseZ + step, W: W, D: D, furn: furn2 },
      { id: 3, z: baseZ + step * 2, W: W, D: D, furn: furn3 },
      { id: 4, z: baseZ + step * 3, W: W, D: d4, furn: furn4 },
    ];

    var parts = floors.map(function (f) {
      return slabGroup(ox, oy, f.z, f.W, f.D, H, f.furn(ox, oy, f.z, f.W, f.D, H), f.id);
    });

    // 細長塔：x 約 -173…39，y 約 4F 頂到 1F 底；實作後若裁切再微調
    return (
      '<svg class="space-dir__svg" viewBox="-200 -160 280 420" role="img" aria-hidden="true">' +
        parts.join('') +
      '</svg>'
    );
  }

  function buildList(t) {
    return [4, 3, 2, 1].map(function (id) {
      return (
        '<li class="space-dir__item" data-floor-item="' + id + '">' +
          '<button type="button" class="space-dir__btn" data-floor="' + id + '" aria-pressed="false" aria-expanded="false">' +
            '<span class="space-dir__no">' + id + 'F</span>' +
            '<span class="space-dir__meta">' +
              '<span class="space-dir__kicker">' + t.kickers[id] + '</span>' +
              '<span class="space-dir__name">' + t.names[id] + '</span>' +
              '<span class="space-dir__hint">' + t.hints[id] + '</span>' +
            '</span>' +
            '<span class="space-dir__chev" aria-hidden="true"></span>' +
          '</button>' +
        '</li>'
      );
    }).join('');
  }

  function mountShell(root, lang) {
    var t = I18N[lang] || I18N.zh;
    root.innerHTML =
      '<div class="wrap space-dir__wrap">' +
        '<p class="space-dir__cue">' + t.intro + '</p>' +
        '<div class="space-dir__grid">' +
          '<div class="space-dir__viz">' + buildSvg() + '</div>' +
          '<div class="space-dir__side">' +
            '<ol class="space-dir__list" aria-label="Floors">' + buildList(t) + '</ol>' +
          '</div>' +
        '</div>' +
      '</div>';
    return t;
  }

  function SpaceDir(opts) {
    this.lang = opts.lang || 'zh';
    this.root = opts.root;
    this.panel = opts.panel;
    this.t = mountShell(this.root, this.lang);
    this.active = null;
    this.content = {};
    this.menuHtml = '';
    if (this.panel) {
      this.panel.classList.remove('wrap');
      this.panel.classList.add('space-panel--accordion');
      // 收合時寄放在目錄根節點，展開時再插入對應樓層 <li>
      this.root.appendChild(this.panel);
    }
    this._bind();
  }

  SpaceDir.prototype._bind = function () {
    var self = this;
    function onPick(floor) {
      self.select(Number(floor));
    }

    this.root.querySelectorAll('.space-dir__floor').forEach(function (el) {
      el.addEventListener('click', function () { onPick(el.getAttribute('data-floor')); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick(el.getAttribute('data-floor'));
        }
      });
    });

    this.root.querySelectorAll('.space-dir__btn').forEach(function (btn) {
      btn.addEventListener('click', function () { onPick(btn.getAttribute('data-floor')); });
    });

    var close = this.panel.querySelector('[data-space-close]');
    if (close) {
      close.addEventListener('click', function () { self.select(null); });
    }
  };

  SpaceDir.prototype.setData = function (content, menuHtml) {
    this.content = content || {};
    this.menuHtml = menuHtml || '';
    if (this.active) this._paintPanel(this.active);
  };

  SpaceDir.prototype.select = function (floor) {
    if (floor === this.active) {
      // toggle close
      floor = null;
    }
    this.active = floor;

    this.root.querySelectorAll('.space-dir__floor').forEach(function (el) {
      var id = Number(el.getAttribute('data-floor'));
      el.classList.toggle('is-active', floor != null && id === floor);
      el.classList.toggle('is-dim', floor != null && id !== floor);
      el.setAttribute('aria-pressed', floor != null && id === floor ? 'true' : 'false');
    });

    this.root.querySelectorAll('.space-dir__btn').forEach(function (btn) {
      var id = Number(btn.getAttribute('data-floor'));
      var on = floor != null && id === floor;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    });

    this.root.querySelectorAll('.space-dir__item').forEach(function (item) {
      var id = Number(item.getAttribute('data-floor-item'));
      item.classList.toggle('is-open', floor != null && id === floor);
    });

    if (floor == null) {
      this.panel.hidden = true;
      this.root.appendChild(this.panel);
      history.replaceState(null, '', location.pathname + location.search);
      return;
    }

    this._paintPanel(floor);
    var item = this.root.querySelector('.space-dir__item[data-floor-item="' + floor + '"]');
    if (item) item.appendChild(this.panel);
    this.panel.hidden = false;
    // hash for deep link: #f1 #menu — 用手風琴展開，不滾動頁面
    var hash = floor === 1 ? '#menu' : ('#f' + floor);
    if (location.hash !== hash) history.replaceState(null, '', hash);
  };

  SpaceDir.prototype._paintPanel = function (floor) {
    var t = this.t;
    var no = this.panel.querySelector('[data-panel-no]');
    var title = this.panel.querySelector('[data-panel-title]');
    var md = this.panel.querySelector('[data-panel-md]');
    var media = this.panel.querySelector('[data-panel-media]');
    var menuWrap = this.panel.querySelector('[data-panel-menu]');
    var menuBody = this.panel.querySelector('[data-panel-menu-body]');
    var menuTitle = this.panel.querySelector('[data-panel-menu-title]');

    if (no) no.textContent = floor + 'F';
    if (title) title.textContent = t.names[floor];

    var key = 'space_' + floor + 'f_' + this.lang;
    var raw = String(this.content[key] || '').trim();
    if (!raw && this.lang === 'zh') raw = String(this.content['space_' + floor + 'f'] || '').trim();
    if (md) {
      if (raw && global.marked) md.innerHTML = global.marked.parse(raw);
      else if (raw) md.textContent = raw;
      else md.innerHTML = '<p class="menu-empty">…</p>';
    }

    var imgUrl = String(this.content['space_' + floor + 'f_image'] || '').trim();
    if (media) {
      if (imgUrl) {
        media.hidden = false;
        var img = media.querySelector('img');
        if (img) img.src = imgUrl;
      } else {
        media.hidden = true;
      }
    }

    if (menuWrap && menuBody) {
      if (floor === 1) {
        menuWrap.hidden = false;
        menuWrap.id = 'menu';
        if (menuTitle) menuTitle.textContent = t.menuTitle;
        menuBody.innerHTML = this.menuHtml || '<p class="menu-empty">…</p>';
      } else {
        menuWrap.hidden = true;
        menuWrap.removeAttribute('id');
        menuBody.innerHTML = '';
      }
    }
    this.panel.setAttribute('data-active-floor', String(floor));
  };

  SpaceDir.prototype.openFromHash = function () {
    var h = (location.hash || '').replace(/^#/, '');
    if (h === 'menu' || h === 'f1') this.select(1);
    else if (/^f[2-4]$/.test(h)) this.select(Number(h.slice(1)));
  };

  global.SpaceDir = SpaceDir;
})(typeof window !== 'undefined' ? window : global);
