#!/usr/bin/env python3
"""統一導覽列產生器：全站共用「計畫/Programs」下拉（三計畫）。
處理全部 12 頁（不存在者略過）；替換 <header class="site-nav" id="nav">...</header>（含 <!--NAV--> 佔位）。
可重複執行（idempotent）。"""
import re, os

PUB = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')

PROGRAMS = [('fellow', '/fellow'), ('partner', '/partner'), ('startup', '/startup')]

L = {
 'zh': dict(base='', about='關於聚落', floors='消費方式', proglabel='聚落計畫',
   member='會員登入', cta='追蹤我們', ltop='中文', mopen='開啟選單', mclose='關閉選單',
   baria='言文字——台灣人才聚落 Taiwan Talent Hub 首頁', bsub='台灣人才聚落 · Taiwan Talent Hub',
   prog={'fellow':'創始會員計畫','partner':'合作夥伴計畫','startup':'新創陪跑計畫'}),
 'en': dict(base='/en', about='About', floors='Pricing', proglabel='Programs',
   member='Member login', cta='Follow us', ltop='English', mopen='Open menu', mclose='Close menu',
   baria='Taiwan Talent Hub home', bsub='Taiwan Talent Hub · 台灣人才聚落',
   prog={'fellow':'Founding Member','partner':'Partner Program','startup':'Startup Program'}),
 'ja': dict(base='/ja', about='ハブについて', floors='料金', proglabel='プログラム',
   member='会員ログイン', cta='フォローする', ltop='日本語', mopen='メニューを開く', mclose='メニューを閉じる',
   baria='Taiwan Talent Hub ホーム', bsub='Taiwan Talent Hub · 台湾タレントハブ',
   prog={'fellow':'創始会員プログラム','partner':'パートナープログラム','startup':'スタートアップ支援'}),
}
LANG_ORDER = [('zh','中文'),('en','English'),('ja','日本語')]
LANGARIA = {'zh':'切換語言', 'en':'Change language', 'ja':'言語を切り替え'}

def hreflang(lc): return 'zh-Hant' if lc=='zh' else lc

def build(lang, ptype):
    d = L[lang]; base = d['base']; home = base + '/'
    # 計畫下拉
    prog_items = []
    for key, pth in PROGRAMS:
        ac = ' aria-current="page"' if ptype==key else ''
        prog_items.append(f'          <a href="{base}{pth}"{ac}>{d["prog"][key]}</a>')
    prog_items = '\n'.join(prog_items)
    # 語言下拉（目標：主頁→各語系首頁；計畫頁→各語系同計畫）
    suffix = '' if ptype=='main' else dict(PROGRAMS)[ptype]
    litems = []
    for lc, label in LANG_ORDER:
        tgt = (L[lc]['base'] + '/') if ptype=='main' else (L[lc]['base'] + suffix)
        ac = ' aria-current="page"' if lc==lang else ''
        litems.append(f'          <a href="{tgt}" hreflang="{hreflang(lc)}" lang="{hreflang(lc)}"{ac}>{label}</a>')
    litems = '\n'.join(litems)
    return f'''<header class="site-nav" id="nav">
  <div class="site-nav__inner">
    <a class="brand" href="{home}" aria-label="{d['baria']}">
      <b>言文字</b><span>{d['bsub']}</span>
    </a>
    <nav class="site-nav__links" id="navLinks" aria-label="{d['proglabel']}">
      <a href="{home}#about">{d['about']}</a>
      <a href="{home}#floors">{d['floors']}</a>
      <div class="site-nav__dd">
        <button type="button" class="site-nav__dd-top" aria-haspopup="true" aria-expanded="false">{d['proglabel']} <i class="site-nav__caret" aria-hidden="true">▾</i></button>
        <div class="site-nav__menu">
{prog_items}
        </div>
      </div>
      <a href="/member.html">{d['member']}</a>
      <div class="site-nav__dd site-nav__lang">
        <button type="button" class="site-nav__dd-top" aria-haspopup="true" aria-expanded="false" aria-label="{LANGARIA[lang]}">
          <svg class="site-nav__globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><ellipse cx="12" cy="12" rx="4" ry="9"/></svg>
          <span class="site-nav__lang-label">{d['ltop']}</span>
          <i class="site-nav__caret" aria-hidden="true">▾</i>
        </button>
        <div class="site-nav__menu">
{litems}
        </div>
      </div>
      <a href="https://www.instagram.com/emoji0701" target="_blank" rel="noopener" class="btn">{d['cta']}</a>
    </nav>
    <button class="site-nav__toggle" id="navToggle" aria-label="{d['mopen']}" data-label-open="{d['mopen']}" data-label-close="{d['mclose']}" aria-controls="navLinks" aria-expanded="false">☰</button>
  </div>
</header>'''

FILES = {
 'index.html': ('zh','main'), 'en/index.html': ('en','main'), 'ja/index.html': ('ja','main'),
 'fellow/index.html': ('zh','fellow'), 'en/fellow/index.html': ('en','fellow'), 'ja/fellow/index.html': ('ja','fellow'),
 'partner/index.html': ('zh','partner'), 'en/partner/index.html': ('en','partner'), 'ja/partner/index.html': ('ja','partner'),
 'startup/index.html': ('zh','startup'), 'en/startup/index.html': ('en','startup'), 'ja/startup/index.html': ('ja','startup'),
}

if __name__ == '__main__':
    done, skip = [], []
    for rel,(lang,ptype) in FILES.items():
        path = os.path.join(PUB, rel)
        if not os.path.exists(path): skip.append(rel); continue
        html = open(path, encoding='utf-8').read()
        nav = build(lang, ptype)
        html2, n = re.subn(r'<header class="site-nav" id="nav">.*?</header>', lambda m: nav, html, count=1, flags=re.S)
        if n == 0:
            skip.append(rel + ' (無 site-nav header)'); continue
        open(path,'w',encoding='utf-8').write(html2)
        done.append(rel)
    print('✓ 已更新導覽：', ', '.join(done) or '(無)')
    if skip: print('· 略過：', ', '.join(skip))
