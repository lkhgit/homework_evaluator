import { TREE_NODE_H, TREE_NODE_W, layoutPrerequisiteTree, type TreeLayout } from "./prerequisiteLayout";
import type { GuideStep, StudentGuide } from "./studentGuide";

/**
 * The student handout: one self-contained HTML file with no external
 * requests, so it works opened from a USB stick or attached to an LMS page.
 *
 * The page structure, styles and script below are fixed. The model never
 * writes any of it. Every value that came from an assignment or a model
 * response goes through escapeHtml, and the step data travels as JSON in a
 * non-executable script tag with "<" escaped, so no text can close the tag.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON that is safe to place inside <script type="application/json">. */
function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function stepName(step: GuideStep): string {
  return `${step.number}. ${step.action}`;
}

function renderStaticList(guide: StudentGuide): string {
  const byId = new Map(guide.steps.map((step) => [step.id, step]));
  const names = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((step): step is GuideStep => Boolean(step)).map(stepName);

  return guide.steps
    .map((step) => {
      const before = names(step.prerequisites);
      const after = names(step.dependents);
      return `<li id="list-${escapeHtml(step.id)}">
        <h3>${escapeHtml(stepName(step))}</h3>
        <p class="meta">${escapeHtml(step.environment)}${step.estimatedMinutes ? ` · 약 ${step.estimatedMinutes}분` : ""}</p>
        ${step.excerpt ? `<blockquote>${escapeHtml(step.excerpt)}</blockquote>` : ""}
        <p><strong>먼저 끝내야 할 행동:</strong> ${before.length ? escapeHtml(before.join(", ")) : "없음 — 바로 시작할 수 있어요"}</p>
        <p><strong>이 행동을 끝내야 할 수 있는 행동:</strong> ${after.length ? escapeHtml(after.join(", ")) : "없음"}</p>
      </li>`;
    })
    .join("\n");
}

function renderTree(guide: StudentGuide, layout: TreeLayout): string {
  const byId = new Map(guide.steps.map((step) => [step.id, step]));
  const edges = layout.edges
    .map(
      (edge) =>
        `<path class="edge" data-from="${escapeHtml(edge.from)}" data-to="${escapeHtml(edge.to)}" d="${edge.path}" marker-end="url(#arrow)"/>`,
    )
    .join("");
  const nodes = layout.nodes
    .map((node) => {
      const step = byId.get(node.id)!;
      return `<button type="button" class="node" data-id="${escapeHtml(step.id)}" style="left:${node.x}px;top:${node.y}px;width:${TREE_NODE_W}px;height:${TREE_NODE_H}px" aria-controls="detail" aria-label="${escapeHtml(`${step.number}단계: ${step.action}`)}">
        <span class="num">${String(step.number).padStart(2, "0")}</span>
        <span class="label">${escapeHtml(clip(step.action, 60))}</span>
        <span class="env">${escapeHtml(clip(step.environment, 28))}</span>
      </button>`;
    })
    .join("\n");

  return `<div class="tree" style="width:${layout.width}px;height:${layout.height}px">
    <svg width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" aria-hidden="true">
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z"/></marker></defs>
      ${edges}
    </svg>
    ${nodes}
  </div>`;
}

const STYLE = `
:root{--bg:#ffffff;--paper:#ffffff;--panel:#f5f8fe;--ink:#0f1c33;--muted:#566882;--accent:#1d4ed8;--accent-soft:#e3ecfd;--line:#d6e0f0;--before:#15803d;--before-soft:#dcfce7;--after:#ea580c;--after-soft:#ffedd5;color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif}
main{max-width:1200px;margin:0 auto;padding:32px 16px 64px}
header h1{margin:0 0 8px;color:var(--accent);font-size:clamp(1.6rem,4vw,2.3rem);line-height:1.2}
.objective{margin:0 0 24px;padding:12px 16px;border-left:4px solid var(--accent);background:var(--accent-soft);border-radius:8px}
.objective strong{display:block;color:var(--accent);font-size:.8rem}
.hint{margin:0 0 12px;color:var(--muted);font-size:.9rem}
.tree-wrap{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:4px}
.tree{position:relative}
.tree svg{position:absolute;inset:0}
.edge{fill:none;stroke:var(--line);stroke-width:2;transition:stroke .15s}
marker path{fill:var(--muted)}
.edge.on-before{stroke:var(--before);stroke-width:2.6}
.edge.on-after{stroke:var(--after);stroke-width:2.6}
.node{position:absolute;display:flex;flex-direction:column;gap:2px;padding:10px 12px;text-align:left;border:1.5px solid var(--line);border-radius:12px;background:var(--paper);color:var(--ink);font:inherit;cursor:pointer;overflow:hidden;transition:border-color .15s,box-shadow .15s}
.node:hover{border-color:var(--accent)}
.node:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.node .num{color:var(--accent);font-weight:700;font-size:.8rem}
.node .label{flex:1;font-size:.86rem;font-weight:600;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.node .env{color:var(--muted);font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.node.is-selected{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.node.is-before-far{border-color:var(--before)}
.node.is-after-far{border-color:var(--after)}
.node.is-before{border-color:var(--before);background:var(--before-soft)}
.node.is-after{border-color:var(--after);background:var(--after-soft)}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:10px 0 0;padding:0;list-style:none;color:var(--muted);font-size:.8rem}
.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px;border:1.5px solid}
.k-sel{border-color:var(--accent)!important;background:var(--accent-soft)}.k-before{border-color:var(--before)!important;background:var(--before-soft)}.k-after{border-color:var(--after)!important;background:var(--after-soft)}.k-far{border-color:var(--muted)!important;background:transparent}
.detail{margin-top:20px;display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:16px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px}
.card h2{margin:0 0 10px;font-size:.85rem;letter-spacing:.02em;color:var(--muted)}
.card h3{margin:0 0 6px;font-size:1.15rem;line-height:1.35}
.card .meta{margin:0 0 12px;color:var(--muted);font-size:.85rem}
.card blockquote{margin:0;padding:12px 14px;border-left:4px solid var(--accent);background:var(--accent-soft);border-radius:6px;white-space:pre-wrap}
.card.before h2{color:var(--before)}.card.after h2{color:var(--after)}
.card ul{margin:0;padding:0;list-style:none;display:grid;gap:6px}
.card li button{width:100%;text-align:left;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--ink);font:inherit;cursor:pointer}
.card li button:hover{border-color:var(--accent)}
.empty{color:var(--muted);margin:0}
details{margin-top:28px;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px 18px}
summary{cursor:pointer;font-weight:600}
.full-text{white-space:pre-wrap;margin:12px 0 0}
.all-steps{margin-top:28px}
.all-steps h2{font-size:1.1rem}
.all-steps ol{padding-left:0;list-style:none;display:grid;gap:12px}
.all-steps li{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.all-steps h3{margin:0 0 4px;font-size:1rem}
.all-steps blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid var(--accent);white-space:pre-wrap}
.all-steps p{margin:4px 0}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:820px){.detail{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
@media print{.tree-wrap,.legend,.detail,.hint{display:none}.all-steps li{break-inside:avoid}}
`;

// Fixed behaviour. Reads the embedded data and builds every label with
// textContent, so no step text is ever parsed as markup.
const SCRIPT = `
(function(){
  var data = JSON.parse(document.getElementById("guide-data").textContent);
  var byId = {}; data.steps.forEach(function(s){ byId[s.id] = s; });
  var nodes = Array.prototype.slice.call(document.querySelectorAll(".node"));
  var edges = Array.prototype.slice.call(document.querySelectorAll(".edge"));
  var live = document.getElementById("live");
  function el(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
  function name(s){ return s.number + ". " + s.action; }
  function fillList(id, ids, emptyText){
    var box = document.getElementById(id); box.textContent = "";
    var list = ids.map(function(x){ return byId[x]; }).filter(Boolean);
    if(!list.length){ box.appendChild(el("p", "empty", emptyText)); return; }
    var ul = el("ul");
    list.forEach(function(s){
      var li = el("li"); var b = el("button", null, name(s)); b.type = "button";
      b.addEventListener("click", function(){ select(s.id, true); });
      li.appendChild(b); ul.appendChild(li);
    });
    box.appendChild(ul);
  }
  function select(id, focus){
    var s = byId[id]; if(!s) return;
    var before = {}, after = {}, near = {};
    s.ancestors.forEach(function(x){ before[x] = 1; });
    s.descendants.forEach(function(x){ after[x] = 1; });
    s.prerequisites.forEach(function(x){ near[x] = 1; });
    s.dependents.forEach(function(x){ near[x] = 1; });
    nodes.forEach(function(n){
      var nid = n.getAttribute("data-id");
      n.classList.toggle("is-selected", nid === id);
      n.classList.toggle("is-before", !!before[nid] && !!near[nid]);
      n.classList.toggle("is-after", !!after[nid] && !!near[nid]);
      n.classList.toggle("is-before-far", !!before[nid] && !near[nid]);
      n.classList.toggle("is-after-far", !!after[nid] && !near[nid]);
      if(nid === id){ n.setAttribute("aria-current", "step"); } else { n.removeAttribute("aria-current"); }
      if(nid === id && focus){ n.focus({ preventScroll: true }); n.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }
    });
    edges.forEach(function(e){
      var f = e.getAttribute("data-from"), t = e.getAttribute("data-to");
      e.classList.toggle("on-before", (before[f] && (before[t] || t === id)) ? true : false);
      e.classList.toggle("on-after", ((f === id || after[f]) && after[t]) ? true : false);
    });
    document.getElementById("d-title").textContent = name(s);
    document.getElementById("d-meta").textContent = s.environment + (s.estimatedMinutes ? " · 약 " + s.estimatedMinutes + "분" : "");
    var q = document.getElementById("d-excerpt"); q.textContent = s.excerpt || "과제 본문에 이 행동을 따로 설명한 문장이 없어요.";
    fillList("d-before", s.prerequisites, "없음 — 바로 시작할 수 있어요.");
    fillList("d-after", s.dependents, "이 행동에 기대는 다음 행동은 없어요.");
    live.textContent = name(s) + " 선택됨. 먼저 할 행동 " + s.prerequisites.length + "개, 다음 행동 " + s.dependents.length + "개.";
  }
  nodes.forEach(function(n){ n.addEventListener("click", function(){ select(n.getAttribute("data-id"), false); }); });
  document.getElementById("detail").hidden = false;
  document.getElementById("tree-area").hidden = false;
  if(data.steps.length) select(data.steps[0].id, false);
})();
`;

export function renderStudentHtml(guide: StudentGuide, layout: TreeLayout = layoutPrerequisiteTree(guide)): string {
  const data = {
    steps: guide.steps.map((step) => ({
      id: step.id,
      number: step.number,
      action: step.action,
      environment: step.environment,
      estimatedMinutes: step.estimatedMinutes,
      excerpt: step.excerpt,
      prerequisites: step.prerequisites,
      dependents: step.dependents,
      ancestors: step.ancestors,
      descendants: step.descendants,
    })),
  };

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(guide.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <header>
    <h1>${escapeHtml(guide.title)}</h1>
    <p class="objective"><strong>학습 목표</strong>${escapeHtml(guide.objective)}</p>
  </header>

  <section id="tree-area" aria-labelledby="tree-title" hidden>
    <h2 id="tree-title" class="sr-only">과제 단계 지도</h2>
    <p class="hint">왼쪽에 있는 행동을 끝내야 오른쪽 행동을 할 수 있어요. 단계를 누르면 자세한 내용이 아래에 나와요.</p>
    <div class="tree-wrap">${renderTree(guide, layout)}</div>
    <ul class="legend" aria-hidden="true">
      <li><i class="k-sel"></i>선택한 행동</li>
      <li><i class="k-before"></i>바로 앞에 끝내야 하는 행동</li>
      <li><i class="k-after"></i>바로 다음에 할 수 있는 행동</li>
      <li><i class="k-far"></i>더 멀리 연결된 행동(테두리만)</li>
    </ul>
  </section>

  <section id="detail" class="detail" aria-live="off" hidden>
    <article class="card">
      <h2>① 이 단계에서 할 일</h2>
      <h3 id="d-title"></h3>
      <p id="d-meta" class="meta"></p>
      <blockquote id="d-excerpt"></blockquote>
    </article>
    <article class="card before">
      <h2>② 먼저 끝내야 하는 행동</h2>
      <div id="d-before"></div>
    </article>
    <article class="card after">
      <h2>③ 이 행동을 끝내야 할 수 있는 행동</h2>
      <div id="d-after"></div>
    </article>
  </section>
  <p id="live" class="sr-only" aria-live="polite"></p>

  <details>
    <summary>전체 과제 보기</summary>
    <p class="full-text">${escapeHtml(guide.revisedText)}</p>
  </details>

  <section class="all-steps" aria-labelledby="all-title">
    <h2 id="all-title">모든 단계 한눈에 보기</h2>
    <ol>
${renderStaticList(guide)}
    </ol>
  </section>
</main>
<script type="application/json" id="guide-data">${safeJson(data)}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

