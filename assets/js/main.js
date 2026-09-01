/* ============================================================
 *  主页驱动脚本 —— 一般不需要改动这个文件
 *  内容全部来自 content.js 里的 SITE / UI
 * ============================================================ */
(function () {
  "use strict";

  /* ---------- 语言 ---------- */
  var LANG_KEY = "hp-lang", THEME_KEY = "hp-theme";
  var lang = localStorage.getItem(LANG_KEY) || (navigator.language.indexOf("zh") === 0 ? "zh" : "en");

  // 取双语字段：t({zh,en}) → 当前语言的字符串
  function t(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    return v[lang] != null && v[lang] !== "" ? v[lang] : (v.zh || v.en || "");
  }
  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  // 按 "profile.name" 这样的路径取值
  function pick(path) {
    return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, SITE);
  }

  /* ---------- 各栏目定义（内容为空则自动隐藏）---------- */
  var SECTIONS = [
    { id: "about",        ui: "navAbout",        has: function () { return SITE.about.length; } },
    { id: "research",     ui: "navResearch",     has: function () { return SITE.research.length; } },
    { id: "works",        ui: "navWorks",        has: function () { return (SITE.works || []).length; } },
    { id: "projects",     ui: "navProjects",     has: function () { return SITE.projects.length; } },
    { id: "experience",   ui: "navExperience",   has: function () { return SITE.experience.length; } },
    { id: "publications", ui: "navPublications", has: function () { return SITE.publications.length; } },
    { id: "notes",        ui: "navNotes",        has: function () { return SITE.notes.length; } },
    { id: "contact",      ui: "navContact",      has: function () {
      return Boolean(emailAddress() || (SITE.profile.links && SITE.profile.links.length));
    } }
  ];

  /* ---------- 邮箱反爬虫 ----------
     地址在浏览器里才拼起来，源码与页面文件中都不出现完整的 xxx@xxx.com，
     用正则扫邮箱的爬虫抓不到。 */
  function emailAddress() {
    var p = SITE.profile;
    if (p.email) return p.email;                     // 兼容直接写明文的情况
    var parts = p.emailParts;
    if (!parts || parts.length < 2) return "";
    return parts[0] + String.fromCharCode(64) + parts.slice(1).join(".");
  }

  /* ============================================================
     渲染
     ============================================================ */
  function render() {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = t(SITE.profile.siteTitle);
    var description = t(SITE.profile.description);
    var descriptionMeta = document.querySelector('meta[name="description"]');
    var ogTitleMeta = document.querySelector('meta[property="og:title"]');
    var ogDescriptionMeta = document.querySelector('meta[property="og:description"]');
    var twitterTitleMeta = document.querySelector('meta[name="twitter:title"]');
    var twitterDescriptionMeta = document.querySelector('meta[name="twitter:description"]');
    var ogImageMeta = document.querySelector('meta[property="og:image"]');
    var twitterImageMeta = document.querySelector('meta[name="twitter:image"]');
    if (descriptionMeta) descriptionMeta.content = description;
    if (ogTitleMeta) ogTitleMeta.content = t(SITE.profile.siteTitle);
    if (ogDescriptionMeta) ogDescriptionMeta.content = description;
    if (twitterTitleMeta) twitterTitleMeta.content = t(SITE.profile.siteTitle);
    if (twitterDescriptionMeta) twitterDescriptionMeta.content = description;
    if (ogImageMeta && typeof window !== "undefined") {
      ogImageMeta.content = new URL("public/og.png", window.location.href).href;
    }
    if (twitterImageMeta && typeof window !== "undefined") {
      twitterImageMeta.content = new URL("public/og.png", window.location.href).href;
    }
    $("#langLabel").textContent = lang === "zh" ? "EN" : "中";

    renderNav();
    renderHero();
    renderAbout();
    renderResearch();
    renderWorks();
    renderProjects();
    renderExperience();
    renderPublications();
    renderNotes();
    renderContact();
    renderFooter();

    // 通用：data-ui / data-field 自动填充
    Array.prototype.forEach.call(document.querySelectorAll("[data-ui]"), function (n) {
      n.innerHTML = t(UI[n.getAttribute("data-ui")]);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-field]"), function (n) {
      n.innerHTML = t(pick(n.getAttribute("data-field")));
    });

    // 名字里的 <b> 变成渐变色
    var nameEl = $(".hero-name b");
    if (nameEl) nameEl.className = "accent";

    hideEmptySections();
  }

  function renderNav() {
    var box = $("#navLinks");
    box.innerHTML = "";
    SECTIONS.forEach(function (s) {
      if (!s.has()) return;
      var a = el("a", null, t(UI[s.ui]));
      a.href = "#" + s.id;
      a.dataset.target = s.id;
      box.appendChild(a);
    });
  }

  function renderHero() {
    var p = SITE.profile;

    // 首屏图形：默认是内联在 HTML 里的三叶结线描图，用 currentColor 上色，
    // 所以能跟着深浅色主题变。一旦 profile.avatar 填了图片路径就换成那张图。
    var holder = $("#avatarHolder");
    if (p.avatar) {
      var img = holder.querySelector("img") || document.createElement("img");
      img.src = p.avatar;
      img.alt = t(p.name).replace(/<[^>]+>/g, "");
      if (!img.parentNode) { holder.innerHTML = ""; holder.appendChild(img); }
    }
    var cap = $("#avatarCaption");
    if (cap) cap.style.display = t(p.avatarCaption) ? "" : "none";

    var cv = $("#cvBtn");
    if (p.cv) { cv.href = p.cv; cv.style.display = ""; } else { cv.style.display = "none"; }

    renderSocials($("#socials"), p.links);
    renderSocials($("#socials2"), p.links);

    var addr = emailAddress();
    var mail = $("#mailLink");
    var row = $("#mailRow");
    if (addr) {
      mail.href = "mailto:" + addr;
      mail.textContent = addr;
      row.style.display = "";
      setupCopy(addr);
    } else {
      mail.removeAttribute("href");
      mail.textContent = "";
      row.style.display = "none";
    }

    var sch = $("#scholarLink");
    if (p.scholar) { sch.href = p.scholar; sch.style.display = ""; } else { sch.style.display = "none"; }
  }

  /* 「复制邮箱」按钮：复制成功后短暂变成「已复制」 */
  var copyTimer = null;
  function setupCopy(addr) {
    var btn = $("#copyBtn");
    if (!btn) return;
    btn.textContent = t(UI.copyEmail);
    btn.classList.remove("done");

    btn.onclick = function () {
      function done() {
        btn.textContent = t(UI.copied);
        btn.classList.add("done");
        clearTimeout(copyTimer);
        copyTimer = setTimeout(function () {
          btn.textContent = t(UI.copyEmail);
          btn.classList.remove("done");
        }, 1800);
      }
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = addr;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:-100px;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); } catch (e) { /* 复制不可用则静默忽略 */ }
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(addr).then(done, fallback);
      } else {
        fallback();
      }
    };
  }

  function renderSocials(box, links) {
    box.innerHTML = "";
    box.style.display = links && links.length ? "" : "none";
    (links || []).forEach(function (l) {
      var li = el("li");
      var a = el("a", null, l.label);
      a.href = l.url;
      if (l.url.indexOf("mailto:") !== 0) { a.target = "_blank"; a.rel = "noopener"; }
      li.appendChild(a);
      box.appendChild(li);
    });
  }

  function renderAbout() {
    var box = $("#aboutBody");
    box.innerHTML = "";
    SITE.about.forEach(function (para) { box.appendChild(el("p", null, t(para))); });

    var f = $("#facts");
    f.innerHTML = "";
    SITE.facts.forEach(function (item) {
      var row = el("div", "fact");
      row.appendChild(el("div", "fact-k", t(item.k)));
      var v = el("div", "fact-v", t(item.v));
      if (t(item.sub)) v.appendChild(el("span", "sub", t(item.sub)));
      row.appendChild(v);
      f.appendChild(row);
    });
  }

  var ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

  function renderResearch() {
    var g = $("#researchGrid");
    g.innerHTML = "";
    SITE.research.forEach(function (r, i) {
      var c = el("div", "card reveal");
      c.style.transitionDelay = (i * 80) + "ms";
      c.appendChild(el("div", "card-idx", ROMAN[i] || String(i + 1)));

      var main = el("div");
      main.appendChild(el("h3", null, t(r.title)));
      main.appendChild(el("p", null, t(r.desc)));
      if (r.tags && r.tags.length) {
        var tg = el("div", "tags");
        r.tags.forEach(function (x) { tg.appendChild(el("span", "tag", t(x))); });
        main.appendChild(tg);
      }
      c.appendChild(main);
      g.appendChild(c);
    });
  }

  // 项目：和研究经历同一副骨架（左栏年份 + 右栏正文），
  // 区别只在末尾那排入口链接 —— 站内的程序在本页打开，外链另开一页。
  function renderWorks() {
    var g = $("#workGrid");
    if (!g) return;
    g.innerHTML = "";
    (SITE.works || []).forEach(function (w, i) {
      var c = el("article", "work reveal");
      c.style.transitionDelay = (i * 80) + "ms";
      c.appendChild(el("div", "work-when", t(w.when)));

      var b = el("div", "work-body");
      if (t(w.kind)) b.appendChild(el("div", "work-kind", t(w.kind)));
      b.appendChild(el("h3", null, t(w.title)));
      b.appendChild(el("p", null, t(w.desc)));

      if (w.tags && w.tags.length) {
        var tg = el("div", "tags");
        w.tags.forEach(function (x) { tg.appendChild(el("span", "tag", t(x))); });
        b.appendChild(tg);
      }

      var urls = (w.links || []).filter(function (l) { return l.url; });
      if (urls.length) {
        var row = el("div", "work-links");
        urls.forEach(function (l) {
          var a = el("a", "work-link");
          a.href = l.url;
          a.appendChild(el("span", "work-link-label", t(l.label) || t(UI.openWork)));
          a.appendChild(el("span", "work-link-action", t(UI.openWork)));
          // 程序都是各自独立的页面，一律另开一页 —— 主页不会被顶掉，
          // knot/ 那一份也就可以和它的源目录保持逐字节一致，随时重新拷贝覆盖。
          a.target = "_blank";
          a.rel = "noopener";
          row.appendChild(a);
        });
        b.appendChild(row);
      }

      c.appendChild(b);
      g.appendChild(c);
    });
  }

  var pubFilter = "all";

  function renderPublications() {
    var types = ["all"].concat(
      ["journal", "conference", "preprint"].filter(function (ty) {
        return SITE.publications.some(function (p) { return p.type === ty; });
      })
    );
    var labels = { all: "filterAll", journal: "filterJournal", conference: "filterConference", preprint: "filterPreprint" };

    var fb = $("#pubFilters");
    fb.innerHTML = "";
    types.forEach(function (ty) {
      var b = el("button", "filter" + (ty === pubFilter ? " on" : ""), t(UI[labels[ty]]));
      b.type = "button";
      b.onclick = function () { pubFilter = ty; renderPublications(); };
      fb.appendChild(b);
    });

    var typeName = { journal: "typeJournal", conference: "typeConference", preprint: "typePreprint" };
    var list = $("#pubList");
    list.innerHTML = "";

    SITE.publications
      .slice()
      .sort(function (a, b) { return b.year - a.year; })
      .filter(function (p) { return pubFilter === "all" || p.type === pubFilter; })
      .forEach(function (p, i) {
        var li = el("li", "pub reveal");
        li.style.transitionDelay = Math.min(i * 60, 300) + "ms";

        var yr = el("div", "pub-year", String(p.year));
        yr.appendChild(el("span", "type", t(UI[typeName[p.type]] || {})));
        li.appendChild(yr);

        var body = el("div");
        body.appendChild(el("h3", "pub-title", t(p.title)));
        body.appendChild(el("div", "pub-authors", (p.authors || "").replace(/<b>/g, '<span class="me">').replace(/<\/b>/g, "</span>")));
        body.appendChild(el("div", "pub-venue", t(p.venue)));
        if (p.links && p.links.length) {
          var lb = el("div", "pub-links");
          p.links.forEach(function (l) {
            var a = el("a", null, l.label);
            a.href = l.url; a.target = "_blank"; a.rel = "noopener";
            lb.appendChild(a);
          });
          body.appendChild(lb);
        }
        li.appendChild(body);
        list.appendChild(li);
      });

    observeReveals();
  }

  function renderProjects() {
    var g = $("#projGrid");
    g.innerHTML = "";
    SITE.projects.forEach(function (p, i) {
      var c = el("article", "proj reveal");
      c.style.transitionDelay = (i * 80) + "ms";

      // 时间独立成左侧的一栏，和研究兴趣的编号栏对齐
      c.appendChild(el("div", "proj-when", t(p.when)));

      var b = el("div", "proj-body");
      if (t(p.kind) || p.status === "ongoing") {
        var meta = el("div", "proj-meta");
        if (p.status === "ongoing") {
          meta.appendChild(el("span", "proj-live", "<i></i>" + t(UI.ongoing)));
        }
        if (t(p.kind)) meta.appendChild(el("span", "proj-kind", t(p.kind)));
        b.appendChild(meta);
      }
      b.appendChild(el("h3", null, t(p.title)));
      b.appendChild(el("p", null, t(p.desc)));

      var foot = el("div", "proj-foot");
      var tg = el("div", "tags");
      (p.tags || []).forEach(function (x) { tg.appendChild(el("span", "tag", t(x))); });
      foot.appendChild(tg);
      b.appendChild(foot);

      // 只有真的有论文时才显示「项目成果」；没有就不放空框子。
      var paper = p.paper || p.link;
      if (paper) {
        var output = el("div", "proj-output");
        output.appendChild(el("div", "proj-output-label", t(UI.projectOutput)));
        var a = el("a", "proj-paper");
        a.href = paper; a.target = "_blank"; a.rel = "noopener";
        a.appendChild(el("span", "proj-paper-title", t(p.paperTitle) || t(UI.viewPaper)));
        a.appendChild(el("span", "proj-paper-action", t(UI.viewPaper)));
        output.appendChild(a);
        b.appendChild(output);
      }
      c.appendChild(b);
      g.appendChild(c);
    });
  }

  function renderExperience() {
    var g = $("#experienceList");
    g.innerHTML = "";

    // 统一一张表：所有条目字体字号一致，只按年份倒序排列
    var year = function (x) { return parseInt(String(t(x.when)).match(/\d{4}/) || 0, 10); };
    var items = SITE.experience.slice().sort(function (a, b) { return year(b) - year(a); });

    items.forEach(function (x, i) {
      var row = el("div", "award-row reveal");
      row.style.transitionDelay = Math.min(i * 60, 300) + "ms";
      row.appendChild(el("div", "award-row-year", t(x.when)));
      var body = el("div", "award-row-body");
      body.appendChild(el("div", "award-row-name", t(x.what)));
      if (t(x.where)) body.appendChild(el("div", "award-row-where", t(x.where)));
      row.appendChild(body);
      g.appendChild(row);
    });
  }

  function renderNotes() {
    var g = $("#notesList");
    g.innerHTML = "";
    SITE.notes.forEach(function (n, i) {
      var a = el("a", "note reveal");
      a.style.transitionDelay = (i * 70) + "ms";
      a.href = n.link || "#";
      if (n.link && n.link !== "#") { a.target = "_blank"; a.rel = "noopener"; }
      a.appendChild(el("div", "note-date", n.date));

      var mid = el("div");
      mid.appendChild(el("div", "note-title", t(n.title)));
      if (t(n.desc)) mid.appendChild(el("span", "note-desc", t(n.desc)));
      a.appendChild(mid);
      a.appendChild(el("div", "note-arrow", "→"));
      g.appendChild(a);
    });
  }

  function renderContact() { /* 内容由 data-field / renderHero 处理 */ }

  function renderFooter() {
    $("#copyright").textContent = "© " + new Date().getFullYear() + " " + t(SITE.footer.owner);
    $(".footer-note").textContent = t(SITE.footer.note);
  }

  // 隐藏空栏目，并按「实际可见的栏目」重新编号，
  // 否则删掉中间某一栏后序号会跳号（01 02 03 04 07）。
  function hideEmptySections() {
    var n = 0;
    SECTIONS.forEach(function (s) {
      var node = document.getElementById(s.id);
      if (!node) return;
      var visible = Boolean(s.has());
      node.style.display = visible ? "" : "none";
      if (!visible) return;
      n++;
      var num = node.querySelector(".sec-num");
      if (num) num.textContent = (n < 10 ? "0" : "") + n;
    });
  }

  /* ============================================================
     交互
     ============================================================ */

  /* --- 主题 --- */
  function initTheme() {
    var saved = localStorage.getItem(THEME_KEY);
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(saved || (prefersDark ? "dark" : "light"));

    $("#themeBtn").addEventListener("click", function () {
      setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });
  }
  function setTheme(mode) {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem(THEME_KEY, mode);
  }

  /* --- 语言 --- */
  function initLang() {
    $("#langBtn").addEventListener("click", function () {
      lang = lang === "zh" ? "en" : "zh";
      localStorage.setItem(LANG_KEY, lang);
      render();
      observeReveals();
      // 切换语言时让已在视野内的元素立即显形
      Array.prototype.forEach.call(document.querySelectorAll(".reveal"), function (n) {
        if (n.getBoundingClientRect().top < window.innerHeight) n.classList.add("in");
      });
    });
  }

  /* --- 导航：滚动状态 / 高亮 / 移动端菜单 / 进度条 --- */
  function initNav() {
    var nav = $("#nav"), links = $("#navLinks"), burger = $("#burger"), bar = $("#progress");

    burger.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      burger.setAttribute("aria-expanded", String(open));
    });
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        links.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
      }
    });

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY;
        nav.classList.toggle("scrolled", y > 10);

        var h = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";

        // 高亮当前栏目
        var current = "";
        SECTIONS.forEach(function (s) {
          var node = document.getElementById(s.id);
          if (node && node.style.display !== "none" && node.getBoundingClientRect().top <= 140) current = s.id;
        });
        Array.prototype.forEach.call(links.children, function (a) {
          a.classList.toggle("active", a.dataset.target === current);
        });
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* --- 滚动进场 --- */
  var io = null;
  function observeReveals() {
    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(document.querySelectorAll(".reveal"), function (n) { n.classList.add("in"); });
      return;
    }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    }
    Array.prototype.forEach.call(document.querySelectorAll(".reveal:not(.in)"), function (n) { io.observe(n); });
  }

  /* ---------- 启动 ---------- */
  initTheme();
  render();
  initLang();
  initNav();
  observeReveals();

})();
