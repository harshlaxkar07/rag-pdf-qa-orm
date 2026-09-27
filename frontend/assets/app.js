/* PDF question answering console — front end for the ingest + ask API. */
(function () {
  "use strict";

  const { $, $$, el, esc, icon, http, toast, bytes, pct } = UI;

  http.base = "";

  let docs = [];
  let totals = { documents: 0, chunks: 0 };

  const EXAMPLES = [
    "Summarise the main ideas in the documents",
    "What architecture is described?",
    "How does the retrieval step work?",
    "List the components and what each one does",
  ];

  /* ---------------- connection ---------------- */
  async function ping() {
    const node = $("#conn");
    const text = $(".conn-text", node);
    try {
      const data = await http.get("/api/health");
      node.className = "conn online";
      text.textContent = data && data.backend ? data.backend : "API connected";
    } catch (_) {
      node.className = "conn offline";
      text.textContent = "API unreachable";
    }
  }

  /* ---------------- library ---------------- */
  async function loadLibrary() {
    try {
      const data = await http.get("/api/stats");
      docs = data.documents || [];
      totals = { documents: docs.length, chunks: data.total_chunks || 0 };
    } catch (_) {
      docs = [];
      totals = { documents: 0, chunks: 0 };
    }
    renderLibrary();
    $("[data-count='docs']").textContent = docs.length;
  }

  function renderLibrary() {
    const chunkCounts = docs.map((d) => d.chunks || 0);
    const avg = chunkCounts.length
      ? Math.round(chunkCounts.reduce((a, b) => a + b, 0) / chunkCounts.length)
      : 0;

    $("#libStats").innerHTML = [
      { label: "Documents", value: totals.documents, hint: "embedded and indexed", ic: "book" },
      { label: "Chunks", value: totals.chunks.toLocaleString(), hint: "retrievable passages", ic: "layers" },
      { label: "Chunks per document", value: avg, hint: "average across the library", ic: "chart" },
    ]
      .map(
        (t) => `<div class="stat">
        <div class="stat-icon">${icon(t.ic, 16)}</div>
        <div class="stat-label">${esc(t.label)}</div>
        <div class="stat-value">${esc(t.value)}</div>
        <div class="stat-hint">${esc(t.hint)}</div></div>`
      )
      .join("");

    $("#libBadge").textContent = `${docs.length} document${docs.length === 1 ? "" : "s"}`;

    const host = $("#libTable");
    if (!docs.length) {
      host.innerHTML = `<div class="empty">
        <div class="empty-icon">${icon("database", 24)}</div>
        <h3>The library is empty</h3>
        <p>Ingest a PDF and it will appear here with its chunk count.</p>
      </div>`;
      return;
    }

    const max = Math.max(...chunkCounts, 1);
    host.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Document</th><th class="num">Size</th><th class="num">Chunks</th><th>Share of the index</th></tr></thead>
        <tbody>${docs
          .map(
            (d) => `
          <tr>
            <td>
              <div class="doc-cell">
                <div class="doc-icon">${icon("fileText", 16)}</div>
                <div class="truncate">${esc(d.filename)}</div>
              </div>
            </td>
            <td class="num nowrap">${esc(bytes(d.file_size))}</td>
            <td class="num">${esc((d.chunks || 0).toLocaleString())}</td>
            <td style="min-width:160px">
              <div class="meter"><span style="width:${((d.chunks || 0) / max) * 100}%"></span></div>
            </td>
          </tr>`
          )
          .join("")}</tbody></table></div>`;
  }

  /* ---------------- ask ---------------- */
  function renderMarkdown(text) {
    const blocks = String(text || "").split(/```/);
    let out = "";

    blocks.forEach((block, i) => {
      if (i % 2 === 1) {
        const lines = block.split("\n");
        if (lines[0] && !lines[0].includes(" ")) lines.shift();
        out += `<pre><code>${esc(lines.join("\n").trim())}</code></pre>`;
        return;
      }

      const html = esc(block)
        .replace(/`([^`\n]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");

      html.split(/\n{2,}/).forEach((para) => {
        const trimmed = para.trim();
        if (!trimmed) return;
        const lines = trimmed.split("\n");
        const bulleted = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        const numbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
        if (bulleted) {
          out += `<ul>${lines.map((l) => `<li>${l.replace(/^\s*[-*•]\s+/, "")}</li>`).join("")}</ul>`;
        } else if (numbered) {
          out += `<ol>${lines.map((l) => `<li>${l.replace(/^\s*\d+[.)]\s+/, "")}</li>`).join("")}</ol>`;
        } else {
          out += `<p>${lines.join("<br>")}</p>`;
        }
      });
    });

    return out || "<p></p>";
  }

  async function ask(e) {
    if (e) e.preventDefault();
    const question = $("#question").value.trim();
    if (!question) {
      toast("Type a question first", "warn");
      return;
    }

    const btn = $("#askBtn");
    btn.classList.add("loading");
    const host = $("#answer");
    host.innerHTML = `
      <div class="card"><div class="card-body">
        <div class="row" style="gap:12px"><span class="spinner"></span>
        <span class="muted">Retrieving passages and composing an answer…</span></div>
        <div class="progress-bar indeterminate mt-2"><span></span></div>
      </div></div>`;

    try {
      const data = await http.post("/api/ask", {
        question,
        top_k: Number($("#topK").value) || 4,
      });
      const sources = data.sources || [];

      host.innerHTML = `
        <div class="stack">
          <div class="card answer-card">
            <div class="card-head">
              <h3>Answer</h3>
              <div class="spacer"></div>
              <span class="badge accent">${sources.length} source${sources.length === 1 ? "" : "s"}</span>
              <button class="btn btn-sm btn-ghost" id="copyAnswer">${icon("copy", 13)} Copy</button>
            </div>
            <div class="card-body"><div class="answer-text">${renderMarkdown(data.answer)}</div></div>
          </div>
          ${
            sources.length
              ? `<div class="card">
                  <div class="card-head">
                    <h3>Retrieved passages</h3>
                    <p>The chunks the answer was written from, ranked by similarity to your question.</p>
                  </div>
                  <div class="card-body stack" style="gap:9px">
                    ${sources.map(sourceHtml).join("")}
                  </div>
                </div>`
              : ""
          }
        </div>`;

      $("#copyAnswer").addEventListener("click", () => UI.copy(data.answer || ""));
      $$("#answer .source-head").forEach((b) =>
        b.addEventListener("click", () => b.closest(".source").classList.toggle("open"))
      );
    } catch (err) {
      host.innerHTML = `<div class="card"><div class="empty">
        <div class="empty-icon" style="background:var(--danger-soft);color:var(--danger)">${icon("alert", 24)}</div>
        <h3>The question could not be answered</h3><p>${esc(err.message)}</p>
      </div></div>`;
      toast(err.message, "error");
    } finally {
      btn.classList.remove("loading");
    }
  }

  function sourceHtml(s, i) {
    const meta = [
      s.page !== null && s.page !== undefined ? `page ${s.page}` : null,
      s.similarity !== null && s.similarity !== undefined ? pct(s.similarity) + " match" : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return `
    <div class="source">
      <button class="source-head" type="button">
        <span class="source-rank">${i + 1}</span>
        <span class="source-name">${esc(s.filename || "Document")}</span>
        ${meta ? `<span class="badge">${esc(meta)}</span>` : ""}
        <span class="source-chev">${icon("chevronRight", 15)}</span>
      </button>
      <div class="source-body">
        <div class="source-content">${esc(s.content || "")}</div>
      </div>
    </div>`;
  }

  /* ---------------- ingest ---------------- */
  function setupIngest() {
    UI.dropzone($("#dropzone"), (files) => [].concat(files).forEach(ingest), {
      accept: "application/pdf",
      multiple: true,
    });
  }

  async function ingest(file) {
    if (!/\.pdf$/i.test(file.name)) {
      toast(`${file.name} is not a PDF`, "warn");
      return;
    }

    const chip = el("div", { class: "file-chip" });
    chip.innerHTML = `
      <div class="fi">${icon("file", 16)}</div>
      <div class="fbody">
        <div class="fname">${esc(file.name)}</div>
        <div class="fmeta">${esc(bytes(file.size))} · embedding…</div>
        <div class="progress-bar indeterminate mt-1"><span></span></div>
      </div>`;
    $("#queue").prepend(chip);

    const form = new FormData();
    form.append("file", file);

    try {
      const data = await http.post("/api/ingest", form);
      chip.querySelector(".fmeta").textContent = `${bytes(file.size)} · ${
        data.chunks ? data.chunks + " chunks indexed" : data.message || "indexed"
      }`;
      chip.querySelector(".progress-bar").remove();
      const fi = chip.querySelector(".fi");
      fi.style.background = "var(--ok-soft)";
      fi.style.color = "var(--ok)";
      fi.innerHTML = icon("check", 16);
      toast(data.message || `${file.name} indexed`, "success");
      loadLibrary();
    } catch (err) {
      chip.querySelector(".fmeta").textContent = err.message;
      chip.querySelector(".fmeta").style.color = "var(--danger)";
      chip.querySelector(".progress-bar").remove();
      const fi = chip.querySelector(".fi");
      fi.style.background = "var(--danger-soft)";
      fi.style.color = "var(--danger)";
      fi.innerHTML = icon("alert", 16);
      toast(err.message, "error");
    }
  }

  /* ---------------- boot ---------------- */
  function init() {
    UI.shell({ start: "ask" });

    $("#askForm").addEventListener("submit", ask);

    $("#examples").innerHTML = EXAMPLES.map(
      (q) => `<button class="chip" type="button">${esc(q)}</button>`
    ).join("");
    $$("#examples .chip").forEach((c) =>
      c.addEventListener("click", () => {
        $("#question").value = c.textContent;
        ask();
      })
    );

    $("#refresh").addEventListener("click", async (e) => {
      e.currentTarget.classList.add("loading");
      await Promise.all([ping(), loadLibrary()]);
      e.currentTarget.classList.remove("loading");
      toast("Library reloaded", "success");
    });

    setupIngest();
    ping();
    loadLibrary();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
