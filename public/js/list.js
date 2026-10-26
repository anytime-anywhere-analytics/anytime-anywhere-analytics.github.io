/* Faceted list behaviour for /publications/ and /people/.
   Rows are server-rendered with data-* facets; this filters, sorts, and pages them,
   and reads ?pillar= / ?testbed= off the URL so research-area links arrive pre-filtered. */
(() => {
  const root = document.querySelector("[data-list]");
  if (!root) return;
  const per = +root.dataset.per || 8;
  const rows = [...root.querySelectorAll("[data-row]")];
  const boxes = [...root.querySelectorAll("[data-facet]")];
  const sortSel = root.querySelector("[data-sort]");
  const qInput = root.querySelector("[data-filter]");
  const countEl = root.querySelector("[data-count]");
  const activeEl = root.querySelector("[data-active]");
  const pagerEl = root.querySelector("[data-pager]");
  const noun = root.dataset.noun || "results";
  let page = 1;

  const params = new URLSearchParams(location.search);
  boxes.forEach((b) => { if (params.get(b.dataset.facet) === b.value) b.checked = true; });

  const chosen = () => {
    const m = {};
    boxes.filter((b) => b.checked).forEach((b) => (m[b.dataset.facet] = m[b.dataset.facet] || []).push(b.value));
    return m;
  };

  const apply = () => {
    const sel = chosen();
    const q = (qInput && qInput.value.trim().toLowerCase()) || "";
    let keep = rows.filter((r) =>
      Object.entries(sel).every(([k, vs]) => (r.dataset[k] || "").split("|").some((v) => vs.includes(v))) &&
      (!q || (r.dataset.text || r.textContent).toLowerCase().includes(q)));

    if (sortSel) {
      const s = sortSel.value;
      keep.sort((a, b) => s === "Title" ? (a.dataset.title || "").localeCompare(b.dataset.title || "")
        : s === "Year, ascending" ? (+a.dataset.year) - (+b.dataset.year)
        : (+b.dataset.year) - (+a.dataset.year));
    }

    const pages = Math.max(1, Math.ceil(keep.length / per));
    page = Math.min(page, pages);
    rows.forEach((r) => { r.hidden = true; });
    keep.slice((page - 1) * per, page * per).forEach((r, i) => { r.hidden = false; r.style.order = i; });

    if (countEl) countEl.textContent = keep.length ? `${(page - 1) * per + 1}–${Math.min(page * per, keep.length)} of ${keep.length} ${noun}` : "No results";
    if (activeEl) {
      const chips = Object.values(sel).flat();
      activeEl.innerHTML = chips.length
        ? chips.map((c) => `<span class="chip on">${c}</span>`).join("") + `<button class="chip" data-clear>Clear all</button>`
        : "";
    }
    if (pagerEl) {
      pagerEl.innerHTML = pages <= 1 ? "" : `
        <button class="iconbtn" data-go="1" ${page === 1 ? "disabled" : ""} aria-label="First page">|‹</button>
        <button class="iconbtn" data-go="${page - 1}" ${page === 1 ? "disabled" : ""} aria-label="Previous page">‹</button>
        ${Array.from({ length: Math.min(pages, 3) }, (_, i) => `<button class="np" data-go="${i + 1}" ${page === i + 1 ? 'aria-current="true"' : ""}>${i + 1}</button>`).join("")}
        ${pages > 3 ? '<span style="padding:0 4px;color:var(--ink-48)">…</span>' : ""}
        <button class="iconbtn" data-go="${page + 1}" ${page === pages ? "disabled" : ""} aria-label="Next page">›</button>
        <button class="iconbtn" data-go="${pages}" ${page === pages ? "disabled" : ""} aria-label="Last page">›|</button>
        <span>of ${pages} pages</span>`;
    }
  };

  boxes.forEach((b) => b.addEventListener("change", () => { page = 1; apply(); }));
  sortSel && sortSel.addEventListener("change", apply);
  qInput && qInput.addEventListener("input", () => { page = 1; apply(); });
  root.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go && !go.disabled) { page = +go.dataset.go; apply(); scrollTo({ top: root.offsetTop - 80, behavior: "smooth" }); }
    if (e.target.closest("[data-clear]")) { boxes.forEach((b) => (b.checked = false)); page = 1; apply(); }
  });
  apply();
})();
