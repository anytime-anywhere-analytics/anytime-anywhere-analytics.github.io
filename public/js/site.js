/* CA³ client layer — no framework. Header state, scroll progress, parallax,
   glide covers, carousel rails, dialogs, the people dome, and Pagefind search. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── header: transparent while over the hero ─────────────── */
  const hdr = $(".hdr");
  if (hdr && hdr.dataset.overHero === "true") {
    const on = () => hdr.classList.toggle("over", scrollY < innerHeight * 0.62);
    on(); addEventListener("scroll", on, { passive: true }); addEventListener("resize", on);
  }

  /* ── scroll progress in place of a scrollbar ─────────────── */
  const prog = $(".sprog");
  if (prog) {
    let t;
    const run = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      prog.style.width = ((h > 0 ? Math.min(1, scrollY / h) : 0) * 100).toFixed(2) + "%";
      prog.classList.remove("idle");
      clearTimeout(t); t = setTimeout(() => prog.classList.add("idle"), 1200);
    };
    run(); addEventListener("scroll", run, { passive: true }); addEventListener("resize", run);
  }

  /* ── parallax + glide covers ─────────────────────────────── */
  if (!reduce) {
    const px = $$("[data-parallax]");
    if (px.length) {
      let raf = 0;
      const run = () => {
        raf = 0;
        px.forEach((el) => {
          const r = el.parentElement.getBoundingClientRect();
          const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
          el.style.transform = `translate3d(0,${(-p * (parseFloat(el.dataset.parallax) || 40)).toFixed(2)}px,0) scale(1.06)`;
        });
      };
      const on = () => { if (!raf) raf = requestAnimationFrame(run); };
      run(); addEventListener("scroll", on, { passive: true }); addEventListener("resize", on);
    }
  }

  /* ── carousels ───────────────────────────────────────────── */
  $$("[data-carousel]").forEach((el) => {
    const rail = el.nextElementSibling, bar = rail && rail.querySelector(".railprog i");
    const sync = () => {
      if (!bar) return;
      const max = el.scrollWidth - el.clientWidth, frac = Math.max(0.18, el.clientWidth / el.scrollWidth);
      bar.style.transform = `translateX(${(max > 0 ? el.scrollLeft / max : 0) * (1 / frac - 1) * 100}%) scaleX(${frac})`;
    };
    el.addEventListener("scroll", sync, { passive: true });
    addEventListener("resize", sync);
    sync();
    rail && $$("[data-rail]", rail).forEach((b) => b.addEventListener("click", () => {
      el.scrollBy({ left: +b.dataset.rail * (el.firstElementChild.offsetWidth + 20), behavior: "smooth" });
    }));
  });

  /* ── dialogs (topic cards, short news posts) ─────────────── */
  document.addEventListener("click", (e) => {
    /* short news rows are real links; with JS they open in place instead */
    const row = e.target.closest("[data-post-modal]");
    if (row && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      const d = document.getElementById(row.dataset.postModal);
      if (d) { e.preventDefault(); d.showModal(); document.body.style.overflow = "hidden"; return; }
    }
    const open = e.target.closest("[data-dialog-open]");
    if (open) { const d = document.getElementById(open.dataset.dialogOpen); if (d) { d.showModal(); document.body.style.overflow = "hidden"; } }
    const close = e.target.closest("[data-dialog-close]");
    if (close) close.closest("dialog").close();
  });
  $$("dialog.modal").forEach((d) => {
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
    d.addEventListener("close", () => { document.body.style.overflow = ""; });
    const sheet = d.querySelector("[data-sheet]"), bar = sheet && sheet.querySelector(".sheetprog");
    const sub = sheet && sheet.querySelector(".sheettop"), head = sheet && sheet.querySelector(".mhead");
    sheet && sheet.addEventListener("scroll", () => {
      const h = sheet.scrollHeight - sheet.clientHeight;
      bar.style.width = ((h > 0 ? sheet.scrollTop / h : 0) * 100).toFixed(2) + "%";
      if (sub) sub.classList.toggle("on", sheet.scrollTop > (head ? head.offsetHeight - 72 : 120));
    }, { passive: true });
  });

  /* ── people dome ─────────────────────────────────────────── */
  const dome = $("[data-dome]");
  if (dome) {
    const sph = $(".sphere", dome), segments = +dome.dataset.segments || 22;
    const rot = { x: 0, y: 0 };
    let vel = 0, dragging = false, moved = false, start = null;
    const apply = () => { sph.style.transform = `translateZ(calc(var(--radius) * -1)) rotateX(${rot.x}deg) rotateY(${rot.y}deg)`; };
    new ResizeObserver(([e]) => {
      const { width: w, height: h } = e.contentRect;
      const basis = w / h >= 1.3 ? w : Math.min(w, h);
      const r = Math.min(Math.max(Math.min(basis * 0.62, h * 1.5), 440), 780);
      dome.style.setProperty("--radius", Math.round(r) + "px");
      dome.style.setProperty("--segx", segments);
      dome.style.setProperty("--segy", segments);
      apply();
    }).observe(dome);
    const step = () => {
      if (!dragging) { vel *= 0.955; rot.y = (rot.y + vel + (reduce ? 0 : 0.018)) % 360; apply(); }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - start.px, dy = e.clientY - start.py;
      if (dx * dx + dy * dy > 36) moved = true;
      rot.x = Math.max(-5, Math.min(5, start.rx - dy / 22));
      rot.y = start.ry + dx / 12;
      vel = (e.clientX - start.last) / 14; start.last = e.clientX;
      apply();
    };
    const up = () => {
      dragging = false; dome.classList.remove("grabbing");
      removeEventListener("pointermove", onMove); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
    };
    dome.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      dragging = true; moved = false; vel = 0;
      start = { px: e.clientX, py: e.clientY, rx: rot.x, ry: rot.y, last: e.clientX };
      dome.classList.add("grabbing");
      addEventListener("pointermove", onMove); addEventListener("pointerup", up); addEventListener("pointercancel", up);
    });
    $$(".face", dome).forEach((a) => a.addEventListener("click", (e) => { if (moved) e.preventDefault(); }));
  }

  /* ── search: Pagefind index, built by `pagefind --site dist` ─ */
  const over = $("[data-search-overlay]"), input = $("[data-search-input]"),
        outEl = $("[data-search-results]"), sugg = $("[data-search-suggested]");
  if (over) {
    let pf = null, sel = 0, rows = [];
    const load = async () => {
      if (pf) return pf;
      try { pf = await import("/pagefind/pagefind.js"); await pf.init(); }
      catch { pf = { search: async () => ({ results: [] }) }; }
      return pf;
    };
    const open = () => {
      over.hidden = false; document.body.style.overflow = "hidden";
      input.focus(); load();
    };
    const close = () => { over.hidden = true; document.body.style.overflow = ""; };
    const render = () => {
      if (!rows.length) { outEl.innerHTML = input.value.trim() ? `<div class="sgroup"><h4>No results</h4><p class="small">Nothing matches “${input.value}”.</p></div>` : ""; return; }
      const groups = [];
      rows.forEach((r) => { let g = groups.find((x) => x.k === r.kind); if (!g) groups.push((g = { k: r.kind, rows: [] })); g.rows.push(r); });
      outEl.innerHTML = groups.map((g) => `<div class="sgroup"><h4>${g.k}</h4>${g.rows.map((r) => {
        const i = rows.indexOf(r);
        return `<a class="sres" href="${r.href}"${i === sel ? " data-on" : ""}><span class="k">${r.kind}</span><span class="t">${r.title}</span><span class="m">${r.meta || ""}</span></a>`;
      }).join("")}</div>`).join("");
    };
    let timer;
    const query = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = input.value.trim();
        sugg.hidden = !!q;
        if (!q) { rows = []; render(); return; }
        const api = await load();
        const res = await api.search(q);
        const data = await Promise.all(res.results.slice(0, 24).map((x) => x.data()));
        rows = data.map((d) => ({
          kind: (d.meta && d.meta.kind) || "Page",
          title: (d.meta && d.meta.title) || d.url,
          meta: (d.meta && d.meta.meta) || "",
          href: d.url,
        }));
        sel = 0; render();
      }, 110);
    };
    input.addEventListener("input", query);
    $$("[data-search-suggest]").forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.searchSuggest; query(); input.focus(); }));
    $$("[data-search-open]").forEach((b) => b.addEventListener("click", open));
    $$("[data-search-close]").forEach((b) => b.addEventListener("click", close));
    addEventListener("keydown", (e) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !/input|textarea/i.test(document.activeElement.tagName))) { e.preventDefault(); open(); return; }
      if (over.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, rows.length - 1); render(); }
      if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      if (e.key === "Enter" && rows[sel]) { e.preventDefault(); location.href = rows[sel].href; }
    });
  }
  /* ── filter rail: collapse only; the bar stays pinned (headroom hide jittered) ───── */
  const rail = $("[data-filters]");
  if (rail) {
    const toggle = $("[data-filters-toggle]", rail), countEl = $("[data-filters-count]", rail);
    toggle && toggle.addEventListener("click", () => {
      const open = rail.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    const sync = () => {
      const n = $$("[data-facet]", rail).filter((b) => b.checked).length;
      if (countEl) countEl.textContent = n ? n + " active" : "All";
    };
    rail.addEventListener("change", sync);
    rail.addEventListener("click", (e) => { if (e.target.closest("[data-clear]")) setTimeout(sync, 0); });
    sync();
    /* facet groups fold; a group arriving with a selection (from a ?pillar= link) starts open */
    $$("[data-fgroup]", rail).forEach((g) => {
      const t = $("[data-fgroup-toggle]", g);
      if ($$("[data-facet]", g).some((b) => b.checked)) g.classList.add("open");
      t && t.setAttribute("aria-expanded", String(g.classList.contains("open")));
      t && t.addEventListener("click", () => { const o = g.classList.toggle("open"); t.setAttribute("aria-expanded", String(o)); });
    });
  }

  /* ── grid motion hero ────────────────────────────────────── */
  const gm = $("[data-gmotion]");
  if (gm) {
    const rows = $$("[data-gmrow]", gm), inertia = [0.6, 0.4, 0.3, 0.2], cur = [];
    let mxf = 0.5;
    addEventListener("pointermove", (e) => {
      const r = gm.getBoundingClientRect();
      mxf = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(r.width, 1)));
    }, { passive: true });
    const step = () => {
      rows.forEach((el, i) => {
        const dir = i % 2 === 0 ? 1 : -1;
        const want = reduce ? 0 : (mxf * 300 - 150) * dir;
        cur[i] = (cur[i] || 0) + (want - (cur[i] || 0)) * (0.055 + inertia[i % inertia.length] * 0.06);
        el.style.transform = `translate3d(${cur[i].toFixed(2)}px,0,0)`;
      });
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ── infinite spiral (people hero) ───────────────────────── */
  const sp = $("[data-spiral]");
  if (sp) {
    const cards = $$(".sitem", sp);
    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
    const modulo = (v, d) => ((v % d) + d) % d;
    const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a || 1), 0, 1); return x * x * (3 - 2 * x); };
    const speed = 0.5, vspace = 58, radius = 170, perspective = 1000, perTurn = 7, centerScale = 1.2, edgeFade = 0.3, edgeBlur = 6;
    const cw = 104, ch = 104;
    let prog = 0, target = 0, auto = 0, hovered = false, visible = true, dragging = false, lastY = 0, moved = false;
    let box = sp.getBoundingClientRect(), prev = performance.now(), lastScroll = scrollY;
    new ResizeObserver(() => { box = sp.getBoundingClientRect(); }).observe(sp);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(sp);
    addEventListener("scroll", () => {
      const d = scrollY - lastScroll; lastScroll = scrollY;
      if (!visible || !d) return;
      target += clamp((d * (speed / 0.55)) / Math.max(vspace * 2, 1), -1.5, 1.5);
    }, { passive: true });
    sp.addEventListener("mouseenter", () => { hovered = true; });
    sp.addEventListener("mouseleave", () => { hovered = false; });
    /* listeners on window, never pointer capture, so a tile stays the click target:
       a tap opens the profile, a real drag (>8px) turns the helix and swallows the click */
    let startPt = { x: 0, y: 0 };
    const onSpMove = (e) => {
      if (!dragging) return;
      const d = e.clientY - lastY; lastY = e.clientY;
      if (Math.hypot(e.clientX - startPt.x, e.clientY - startPt.y) > 8) moved = true;
      target -= d / vspace;
    };
    const stop = () => {
      dragging = false;
      removeEventListener("pointermove", onSpMove); removeEventListener("pointerup", stop); removeEventListener("pointercancel", stop);
    };
    sp.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      dragging = true; moved = false; startPt = { x: e.clientX, y: e.clientY }; lastY = e.clientY; target = prog;
      addEventListener("pointermove", onSpMove); addEventListener("pointerup", stop); addEventListener("pointercancel", stop);
    });
    sp.addEventListener("click", (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
    sp.addEventListener("dragstart", (e) => e.preventDefault());
    const render = (t) => {
      const dt = Math.min((t - prev) / 1000, 0.05); prev = t;
      const want = visible && !reduce && !(dragging || hovered) ? speed : 0;
      auto += (want - auto) * (1 - Math.exp(-dt * 7));
      target += auto * dt;
      prog += (target - prog) * (1 - Math.exp(-dt * (dragging ? 22 : 11)));
      const count = cards.length, half = count / 2;
      const w = Math.max(box.width, 1), hh = Math.max(box.height, 1);
      const fit = Math.min(1, w / (cw * 2.8), hh / (ch * 2.35));
      const r = Math.min(radius, Math.max(72, w * 0.36)) * fit;
      const fadeStart = clamp(1 - edgeFade, 0, 0.98), turnSize = Math.max(perTurn, 1);
      cards.forEach((card, i) => {
        const off = modulo(i - prog + half, count) - half;
        const edge = Math.min(Math.abs(off) / Math.max(half, 1), 1);
        const opacity = 1 - smooth(fadeStart, 1, edge);
        const focus = 1 - Math.min(Math.abs(off) / Math.max(turnSize * 0.65, 1), 1);
        const rad = (off * (360 / turnSize) * Math.PI) / 180;
        const x = Math.sin(rad) * r, z = Math.cos(rad) * r;
        const depthScale = clamp(perspective / Math.max(perspective - z, 1), 0.72, 1.45);
        const scale = (1 + (centerScale - 1) * focus) * fit * depthScale;
        const blur = edgeBlur * smooth(0.35, 1, edge);
        card.style.transform = `translate(-50%,-50%) translate3d(${x}px,${off * vspace * fit}px,0) scale(${scale})`;
        card.style.opacity = opacity.toFixed(3);
        card.style.filter = blur > 0.01 ? `blur(${blur.toFixed(2)}px)` : "none";
        card.style.zIndex = String(Math.round(((z / Math.max(r, 1) + 1) / 2) * 100000) + i);
        card.style.pointerEvents = opacity > 0.25 ? "auto" : "none";
      });
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }
})();
