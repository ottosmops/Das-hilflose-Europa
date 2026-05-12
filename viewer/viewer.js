"use strict";

const TEI_NS = "http://www.tei-c.org/ns/1.0";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const TEI_PATH = "../das_hilflose_europa.xml";

const state = {
  xml: null,
  registry: {
    person: new Map(),
    place: new Map(),
    bibl: new Map(),
  },
  mentions: new Map(),     // id -> array of DOM nodes that reference it
  noteCounter: 0,
};

// ─── Bootstrap ────────────────────────────────────────────────────────
(async function init() {
  const readingEl = document.getElementById("reading");
  try {
    const res = await fetch(TEI_PATH);
    if (!res.ok) throw new Error(`HTTP ${res.status} – ${TEI_PATH}`);
    const xmlText = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");
    const parserErr = xml.querySelector("parsererror");
    if (parserErr) throw new Error("XML parse error: " + parserErr.textContent.slice(0, 200));
    state.xml = xml;

    buildRegistry(xml);
    renderReading(xml);
    renderIndex();
    wireToolbar();
  } catch (err) {
    readingEl.innerHTML = `<div class="error">
      <p>Konnte das TEI nicht laden.</p>
      <p><code>${escapeHtml(err.message)}</code></p>
      <p>Wenn du die Datei via <code>file://</code> öffnest, blockiert der Browser <code>fetch</code>.<br>
      Starte stattdessen einen kleinen lokalen Server, z.B.:</p>
      <pre>cd ${escapeHtml("Das-hilflose-Europa")}\npython3 -m http.server 8000</pre>
      <p>Und öffne dann <code>http://localhost:8000/viewer/</code>.</p>
    </div>`;
    console.error(err);
  }
})();

// ─── Registry (standOff) ──────────────────────────────────────────────
function buildRegistry(xml) {
  for (const person of teiAll(xml, "person")) {
    const id = xmlId(person);
    if (!id) continue;
    state.registry.person.set(id, parsePerson(person));
  }
  for (const place of teiAll(xml, "place")) {
    const id = xmlId(place);
    if (!id) continue;
    state.registry.place.set(id, parsePlace(place));
  }
  // bibl entries are in listBibl (inside standOff). Inline bibls inside the body are NOT entries.
  const listBibl = teiAll(xml, "listBibl")[0];
  if (listBibl) {
    for (const bibl of teiAll(listBibl, "bibl")) {
      const id = xmlId(bibl);
      if (!id) continue;
      state.registry.bibl.set(id, parseBibl(bibl));
    }
  }
}

function parsePerson(el) {
  const persName = teiAll(el, "persName")[0];
  const label = persName ? persName.textContent.replace(/\s+/g, " ").trim() : "";
  const surname = persName ? (teiAll(persName, "surname")[0]?.textContent || "") : "";
  const forename = persName ? (teiAll(persName, "forename")[0]?.textContent || "") : "";
  return {
    type: "person",
    id: xmlId(el),
    label,
    sortKey: surname || label,
    surname,
    forename,
    birth: dateAttr(teiAll(el, "birth")[0]),
    death: dateAttr(teiAll(el, "death")[0]),
    note: teiAll(el, "note")[0]?.textContent.trim() || "",
    cert: el.getAttribute("cert") || "",
    idnos: parseIdnos(el),
  };
}

function parsePlace(el) {
  const placeName = teiAll(el, "placeName")[0];
  const label = placeName ? placeName.textContent.trim() : "";
  return {
    type: "place",
    id: xmlId(el),
    label,
    sortKey: label,
    note: teiAll(el, "note")[0]?.textContent.trim() || "",
    cert: el.getAttribute("cert") || "",
    idnos: parseIdnos(el),
  };
}

function parseBibl(el) {
  const titles = teiAll(el, "title").map(t => t.textContent.trim()).filter(Boolean);
  const author = teiAll(el, "author")[0]?.textContent.replace(/\s+/g, " ").trim() || "";
  const date = teiAll(el, "date").map(d => d.textContent.trim()).filter(Boolean).join(", ");
  const ref = teiAll(el, "ref")[0];
  return {
    type: "bibl",
    id: xmlId(el),
    label: titles[0] || "",
    sortKey: titles[0] || "",
    titles,
    author,
    authorRef: teiAll(el, "author")[0]?.getAttribute("ref") || "",
    date,
    digitalUrl: ref ? ref.getAttribute("target") : "",
    note: teiAll(el, "note")[0]?.textContent.trim() || "",
    cert: el.getAttribute("cert") || "",
    idnos: parseIdnos(el),
  };
}

function parseIdnos(el) {
  // Only direct-child idnos (not nested e.g. inside <ref>)
  const out = [];
  for (const child of el.children) {
    if (child.localName === "idno") {
      out.push({
        type: child.getAttribute("type") || "id",
        cert: child.getAttribute("cert") || "",
        value: child.textContent.trim(),
      });
    }
  }
  return out;
}

function dateAttr(el) {
  if (!el) return "";
  return el.getAttribute("when") ||
         el.getAttribute("notBefore") ||
         el.getAttribute("notAfter") ||
         el.getAttribute("from") || "";
}

// ─── Reading column render ────────────────────────────────────────────
function renderReading(xml) {
  const body = teiAll(xml, "body")[0];
  if (!body) return;
  const readingEl = document.getElementById("reading");
  readingEl.innerHTML = "";

  // The body contains a single wrapper div with head, preface, numbered divs.
  // We render children in order.
  for (const child of body.children) {
    readingEl.appendChild(renderNode(child));
  }
}

function renderNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.nodeValue);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return document.createDocumentFragment();
  }
  const name = node.localName;
  switch (name) {
    case "div":      return renderDiv(node);
    case "head":     return renderHead(node);
    case "p":        return renderP(node);
    case "pb":       return renderPb(node);
    case "lb":       return document.createElement("br");
    case "persName": return renderEntity(node, "person");
    case "placeName":return renderEntity(node, "place");
    case "orgName":  return renderEntity(node, "org");
    case "bibl":     return renderBibl(node);
    case "title":    return wrap(node, "em", "title");
    case "foreign":  return wrap(node, "span", "foreign", { lang: node.getAttribute("xml:lang") || "" });
    case "sic":      return wrap(node, "span", "sic");
    case "note":     return renderNote(node);
    case "ref":      return renderRef(node);
    default:         return wrap(node, "span", "tei-" + name);
  }
}

function renderDiv(node) {
  const el = document.createElement("div");
  el.className = "tei-div";
  const type = node.getAttribute("type");
  if (type === "preface") el.classList.add("preface");

  // Special handling for the outermost wrapper that contains the <head> with title
  for (const child of node.childNodes) {
    el.appendChild(renderNode(child));
  }
  return el;
}

function renderHead(node) {
  // If the head contains the document title (uppercase block), render as h1.
  const text = node.textContent;
  if (/HILFLOSE EUROPA/i.test(text)) {
    const h1 = document.createElement("h1");
    h1.className = "tei-title";
    h1.innerHTML = `Das hilflose Europa<small>oder Reise vom hundertsten ins Tausendste<br>von Robert Musil · 1922</small>`;
    return h1;
  }
  const h2 = document.createElement("h2");
  h2.className = "tei-head";
  h2.textContent = "§ " + text.trim();
  return h2;
}

function renderP(node) {
  const p = document.createElement("p");
  for (const child of node.childNodes) {
    p.appendChild(renderNode(child));
  }
  return p;
}

function renderPb(node) {
  const facs = node.getAttribute("facs");
  const a = document.createElement("a");
  a.className = "pb";
  a.title = "Faksimile öffnen";
  if (facs) {
    a.href = facs;
    a.target = "_blank";
    a.rel = "noopener";
  }
  const url = facs || "";
  const m = url.match(/\/(\d{4})\/(?:\s*)image/);
  a.textContent = m ? `S. ${m[1]}` : "[Seite]";
  return a;
}

function renderEntity(node, type) {
  const ref = (node.getAttribute("ref") || "").replace(/^#/, "");
  const span = document.createElement("span");
  span.className = `entity entity-${type}`;
  span.dataset.type = type;
  span.dataset.ref = ref;
  const cert = node.getAttribute("cert");
  if (cert) span.dataset.cert = cert;

  for (const child of node.childNodes) {
    span.appendChild(renderNode(child));
  }
  if (ref && state.registry[type]?.has(ref)) {
    span.addEventListener("click", () => showDetail(type, ref, span));
    span.addEventListener("mouseenter", (e) => showTooltip(e, type, ref));
    span.addEventListener("mousemove", moveTooltip);
    span.addEventListener("mouseleave", hideTooltip);
    if (!state.mentions.has(ref)) state.mentions.set(ref, []);
    state.mentions.get(ref).push(span);
  }
  return span;
}

function renderBibl(node) {
  const ref = (node.getAttribute("ref") || "").replace(/^#/, "");
  const span = document.createElement("span");
  span.className = "entity entity-bibl";
  span.dataset.type = "bibl";
  span.dataset.ref = ref;
  for (const child of node.childNodes) {
    span.appendChild(renderNode(child));
  }
  if (ref && state.registry.bibl.has(ref)) {
    span.addEventListener("click", () => showDetail("bibl", ref, span));
    span.addEventListener("mouseenter", (e) => showTooltip(e, "bibl", ref));
    span.addEventListener("mousemove", moveTooltip);
    span.addEventListener("mouseleave", hideTooltip);
    if (!state.mentions.has(ref)) state.mentions.set(ref, []);
    state.mentions.get(ref).push(span);
  }
  return span;
}

function renderNote(node) {
  const resp = node.getAttribute("resp") || "";
  state.noteCounter++;
  const idx = state.noteCounter;

  const marker = document.createElement("span");
  marker.className = "note";
  marker.dataset.resp = resp;
  marker.dataset.idx = idx;
  marker.textContent = `[${idx}]`;
  marker.title = `Anmerkung ${respLabel(resp)}`;

  // The body is rendered as a hidden sibling that toggles on click.
  const body = document.createElement("span");
  body.className = "note-body";
  body.dataset.resp = resp;
  body.dataset.idx = idx;
  const tag = document.createElement("span");
  tag.className = "resp-tag";
  tag.textContent = `Anm. ${idx} · ${respLabel(resp)}`;
  body.appendChild(tag);
  const content = document.createElement("span");
  content.className = "note-content";
  for (const child of node.childNodes) {
    content.appendChild(renderNode(child));
  }
  body.appendChild(document.createTextNode(" "));
  body.appendChild(content);

  marker.addEventListener("click", (ev) => {
    ev.stopPropagation();
    body.classList.toggle("open");
  });

  const frag = document.createDocumentFragment();
  frag.appendChild(marker);
  frag.appendChild(body);
  return frag;
}

function renderRef(node) {
  const target = node.getAttribute("target");
  const a = document.createElement("a");
  a.className = "ref-url";
  if (target) { a.href = target; a.target = "_blank"; a.rel = "noopener"; }
  for (const child of node.childNodes) a.appendChild(renderNode(child));
  return a;
}

function wrap(node, tag, cls, attrs = {}) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const [k, v] of Object.entries(attrs)) if (v) el.setAttribute(k, v);
  for (const child of node.childNodes) el.appendChild(renderNode(child));
  return el;
}

function respLabel(resp) {
  if (!resp) return "anonym";
  if (resp === "ak") return "ak (Editor)";
  if (resp === "#claude") return "claude (KI-Annotation)";
  return resp;
}

// ─── Index sidebar ────────────────────────────────────────────────────
function renderIndex() {
  const sections = [
    { key: "person", listId: "list-persons", countId: "count-persons" },
    { key: "place",  listId: "list-places",  countId: "count-places" },
    { key: "bibl",   listId: "list-bibls",   countId: "count-bibls" },
  ];
  for (const sec of sections) {
    const items = [...state.registry[sec.key].values()];
    items.sort((a, b) => a.sortKey.localeCompare(b.sortKey, "de"));
    const ul = document.getElementById(sec.listId);
    ul.innerHTML = "";
    for (const item of items) {
      const li = document.createElement("li");
      li.dataset.ref = item.id;
      li.dataset.type = sec.key;
      const main = document.createElement("span");
      main.textContent = item.label;
      li.appendChild(main);
      if (sec.key === "person" && (item.birth || item.death)) {
        const meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = ` (${formatLifespan(item.birth, item.death)})`;
        li.appendChild(meta);
      }
      if (sec.key === "bibl" && item.date) {
        const meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = ` · ${item.date}`;
        li.appendChild(meta);
      }
      li.addEventListener("click", () => {
        showDetail(sec.key, item.id, null);
        scrollToFirstMention(item.id);
      });
      ul.appendChild(li);
    }
    document.getElementById(sec.countId).textContent = items.length;
  }

  // Section collapse toggles
  for (const h of document.querySelectorAll(".index-section h2")) {
    h.addEventListener("click", () => h.parentElement.classList.toggle("collapsed"));
  }
}

function formatLifespan(birth, death) {
  const b = (birth || "").slice(0, 4);
  const d = (death || "").slice(0, 4);
  if (b && d) return `${b}–${d}`;
  if (b) return `geb. ${b}`;
  if (d) return `gest. ${d}`;
  return "?";
}

// ─── Detail sidebar ───────────────────────────────────────────────────
function showDetail(type, id, srcEl) {
  const entry = state.registry[type]?.get(id);
  if (!entry) return;

  // highlight in index
  document.querySelectorAll(".index li").forEach(li => {
    li.classList.toggle("active", li.dataset.ref === id);
  });
  // highlight active mentions
  document.querySelectorAll(".entity.active").forEach(el => el.classList.remove("active"));
  if (srcEl) srcEl.classList.add("active");

  const detail = document.getElementById("detail");
  detail.innerHTML = "";

  const header = document.createElement("div");
  header.className = "detail-header";
  const h2 = document.createElement("h2");
  h2.textContent = entry.label;
  header.appendChild(h2);
  const tag = document.createElement("span");
  tag.className = `type-tag ${type}`;
  tag.textContent = type === "person" ? "Person" : type === "place" ? "Ort" : "Werk";
  header.appendChild(tag);
  detail.appendChild(header);

  if (type === "person" && (entry.birth || entry.death)) {
    const span = document.createElement("div");
    span.className = "lifespan";
    span.textContent = formatLifespan(entry.birth, entry.death);
    detail.appendChild(span);
  }
  if (type === "bibl") {
    if (entry.author || entry.date) {
      const meta = document.createElement("div");
      meta.className = "lifespan";
      meta.textContent = [entry.author, entry.date].filter(Boolean).join(" · ");
      detail.appendChild(meta);
    }
    if (entry.titles.length > 1) {
      const ul = document.createElement("ul");
      ul.style.paddingLeft = "1.2rem";
      ul.style.margin = "0.4rem 0";
      ul.style.fontSize = "0.85rem";
      for (const t of entry.titles) {
        const li = document.createElement("li");
        li.style.fontStyle = "italic";
        li.textContent = t;
        ul.appendChild(li);
      }
      detail.appendChild(ul);
    }
  }

  if (entry.note) {
    const n = document.createElement("div");
    n.className = "detail-note";
    if (entry.cert === "medium") n.classList.add("cert-medium");
    n.textContent = entry.note;
    detail.appendChild(n);
  }

  if (entry.idnos.length) {
    const ul = document.createElement("ul");
    ul.className = "ids";
    for (const idno of entry.idnos) {
      const li = document.createElement("li");
      if (idno.cert === "medium") li.classList.add("cert-medium");
      const lab = document.createElement("span");
      lab.className = "id-type";
      lab.textContent = idno.type;
      li.appendChild(lab);
      li.appendChild(document.createTextNode(" "));
      const a = document.createElement("a");
      a.href = idno.value;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = idno.value.replace(/^https?:\/\//, "");
      li.appendChild(a);
      ul.appendChild(li);
    }
    detail.appendChild(ul);
  }
  if (type === "bibl" && entry.digitalUrl) {
    const p = document.createElement("p");
    p.style.marginTop = "0.6rem";
    const a = document.createElement("a");
    a.href = entry.digitalUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Digitalisat ansehen ↗";
    p.appendChild(a);
    detail.appendChild(p);
  }
  if (type === "bibl" && entry.authorRef) {
    const authorId = entry.authorRef.replace(/^#/, "");
    if (state.registry.person.has(authorId)) {
      const p = document.createElement("p");
      p.style.marginTop = "0.6rem";
      p.style.fontSize = "0.83rem";
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = "→ Autor:in im Register anzeigen";
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        showDetail("person", authorId, null);
      });
      p.appendChild(a);
      detail.appendChild(p);
    }
  }

  // Mentions
  const ms = state.mentions.get(id) || [];
  if (ms.length) {
    const wrap = document.createElement("div");
    wrap.className = "mentions";
    const h3 = document.createElement("h3");
    h3.textContent = `${ms.length} Erwähnung${ms.length === 1 ? "" : "en"} im Text`;
    wrap.appendChild(h3);
    const ol = document.createElement("ol");
    ms.forEach((el, i) => {
      const li = document.createElement("li");
      const snippet = makeSnippet(el);
      li.innerHTML = `<span class="snippet">… ${escapeHtml(snippet)} …</span>`;
      li.addEventListener("click", () => scrollAndFlash(el));
      ol.appendChild(li);
    });
    wrap.appendChild(ol);
    detail.appendChild(wrap);
  }
}

function makeSnippet(el) {
  // Find enclosing paragraph and trim around the mention
  const p = el.closest("p") || el.parentElement;
  const text = p ? p.textContent.replace(/\s+/g, " ") : el.textContent;
  const target = el.textContent.replace(/\s+/g, " ");
  const idx = text.indexOf(target);
  if (idx < 0) return target;
  const start = Math.max(0, idx - 35);
  const end = Math.min(text.length, idx + target.length + 35);
  return text.slice(start, end);
}

function scrollToFirstMention(id) {
  const list = state.mentions.get(id);
  if (list && list.length) scrollAndFlash(list[0]);
}

function scrollAndFlash(el) {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("target-flash");
  // force reflow to restart the animation
  void el.offsetWidth;
  el.classList.add("target-flash");
}

// ─── Tooltip ──────────────────────────────────────────────────────────
const tooltip = document.getElementById("tooltip");
function showTooltip(ev, type, id) {
  const entry = state.registry[type]?.get(id);
  if (!entry) return;
  let html = `<div class="tt-title">${escapeHtml(entry.label)}</div>`;
  if (type === "person") {
    const span = formatLifespan(entry.birth, entry.death);
    if (span && span !== "?") html += `<div class="tt-meta">${span}</div>`;
  } else if (type === "bibl") {
    const meta = [entry.author, entry.date].filter(Boolean).join(" · ");
    if (meta) html += `<div class="tt-meta">${escapeHtml(meta)}</div>`;
  }
  if (entry.note) html += `<div class="tt-note">${escapeHtml(entry.note.slice(0, 180))}${entry.note.length > 180 ? "…" : ""}</div>`;
  html += `<div class="tt-hint">Klick für Register</div>`;
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  moveTooltip(ev);
}
function moveTooltip(ev) {
  if (tooltip.hidden) return;
  const pad = 14;
  let x = ev.clientX + pad;
  let y = ev.clientY + pad;
  const r = tooltip.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
}
function hideTooltip() { tooltip.hidden = true; }

// ─── Toolbar wiring ───────────────────────────────────────────────────
function wireToolbar() {
  const reading = document.getElementById("reading");

  for (const cb of document.querySelectorAll(".filter input[type=checkbox]")) {
    cb.addEventListener("change", () => {
      const f = cb.dataset.filter;
      reading.classList.toggle(`no-${f}`, !cb.checked);
    });
  }
  const noteSel = document.getElementById("note-filter");
  noteSel.addEventListener("change", () => {
    reading.classList.remove("notes-ak", "notes-claude", "notes-none");
    if (noteSel.value !== "all") reading.classList.add(`notes-${noteSel.value}`);
  });

  const search = document.getElementById("search");
  let timer;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => doSearch(search.value.trim()), 180);
  });
}

function doSearch(q) {
  const reading = document.getElementById("reading");
  // Remove old marks
  for (const m of reading.querySelectorAll("mark.match")) {
    const parent = m.parentNode;
    parent.replaceChild(document.createTextNode(m.textContent), m);
    parent.normalize();
  }
  if (!q || q.length < 2) return;

  const re = new RegExp(escapeRegExp(q), "gi");
  const walker = document.createTreeWalker(reading, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      // Skip page-break labels and section headers — but DO search inside notes
      if (node.parentElement.closest(".tei-head, .pb, .resp-tag")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const textNodes = [];
  let n;
  while ((n = walker.nextNode())) textNodes.push(n);

  let firstMatch = null;
  const notesToOpen = new Set();
  for (const node of textNodes) {
    const matches = [...node.nodeValue.matchAll(re)];
    if (!matches.length) continue;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    for (const m of matches) {
      frag.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex, m.index)));
      const mk = document.createElement("mark");
      mk.className = "match";
      mk.textContent = m[0];
      frag.appendChild(mk);
      if (!firstMatch) firstMatch = mk;
      lastIndex = m.index + m[0].length;
    }
    frag.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex)));
    const noteBody = node.parentElement.closest(".note-body");
    node.parentNode.replaceChild(frag, node);
    if (noteBody) notesToOpen.add(noteBody);
  }
  notesToOpen.forEach(nb => nb.classList.add("open"));
  if (firstMatch) firstMatch.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ─── Utility ──────────────────────────────────────────────────────────
function teiAll(root, localName) {
  // getElementsByTagNameNS handles namespace declaration on TEI root.
  return [...root.getElementsByTagNameNS(TEI_NS, localName)];
}
function xmlId(el) {
  return el.getAttributeNS(XML_NS, "id") || el.getAttribute("xml:id") || "";
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
