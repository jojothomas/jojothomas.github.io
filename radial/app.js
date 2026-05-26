(function () {
  "use strict";
  const data = window.familyData;
  const world = document.getElementById("world");
  const links = document.getElementById("links");
  const viewport = document.getElementById("viewport");
  const stage = document.getElementById("stage");
  const detail = document.getElementById("detail");
  const detailName = document.getElementById("detailName");
  const detailInfo = document.getElementById("detailInfo");
  document.getElementById("detailClose").addEventListener("click", function () {
    detail.hidden = true;
  });
  document.getElementById("reset").addEventListener("click", reset);

  const RADIUS_FIRST = 230;
  const RADIUS_NEXT = 200;
  const ROOT_ARC_DEG = 300;       // spread for the root's children
  const CHILD_ARC_DEG = 150;      // spread for any non-root expansion
  const SVG_NS = "http://www.w3.org/2000/svg";

  /** Per-node visual state, keyed by a stable id we assign. */
  const nodes = new Map();
  let nextId = 0;

  function colorClass(col) {
    if (col === "rootCol") return "root";
    if (col === "femaleCol") return "female";
    return "male";
  }

  function placeNode(person, x, y, parentId, angleFromParent) {
    const id = ++nextId;
    const el = document.createElement("div");
    el.className = "node";
    el.style.left = x + "px";
    el.style.top = y + "px";

    const bubble = document.createElement("div");
    bubble.className = "bubble " + colorClass(person.col);
    if (parentId === null) bubble.classList.add("root");
    bubble.textContent = person.name;

    const childCount = (person.children || []).length;
    if (childCount) {
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = childCount;
      bubble.appendChild(count);
    }

    if (person.spouse && person.spouse.name) {
      const sp = document.createElement("div");
      sp.className = "spouse " + colorClass(person.spouse.col);
      sp.textContent = person.spouse.name;
      sp.addEventListener("click", function (e) {
        e.stopPropagation();
        showDetail({ name: person.spouse.name, info: "Spouse of " + person.name });
      });
      bubble.appendChild(sp);
    }

    el.appendChild(bubble);
    world.appendChild(el);

    const state = {
      id,
      person,
      el,
      bubble,
      x,
      y,
      parentId,
      angleFromParent,  // direction from parent in radians; null for root
      expanded: false,
      childIds: [],
      linkFromParent: null,
    };
    nodes.set(id, state);

    // Reveal with a tick of delay so the transition runs.
    requestAnimationFrame(function () {
      el.classList.add("visible");
    });

    bubble.addEventListener("click", function (e) {
      e.stopPropagation();
      handleClick(state);
    });

    return state;
  }

  function handleClick(state) {
    if (state.expanded) {
      collapse(state);
    } else if (state.person.children && state.person.children.length) {
      expand(state);
    } else {
      showDetail(state.person);
    }
  }

  function expand(state) {
    const kids = state.person.children;
    const n = kids.length;
    state.expanded = true;
    state.bubble.classList.add("open");

    // Determine the arc center direction: opposite of where we came from.
    let centerAngle;
    let arcDeg;
    if (state.parentId === null) {
      centerAngle = -Math.PI / 2; // upward
      arcDeg = ROOT_ARC_DEG;
    } else {
      centerAngle = state.angleFromParent; // continue outward
      arcDeg = CHILD_ARC_DEG;
    }
    const arcRad = (arcDeg * Math.PI) / 180;
    const startAngle = centerAngle - arcRad / 2;
    const step = n === 1 ? 0 : arcRad / (n - 1);
    const radius = state.parentId === null ? RADIUS_FIRST : RADIUS_NEXT;

    kids.forEach(function (childPerson, i) {
      const angle = n === 1 ? centerAngle : startAngle + step * i;
      const cx = state.x + Math.cos(angle) * radius;
      const cy = state.y + Math.sin(angle) * radius;

      // Stagger the child's reveal so the bloom feels organic.
      const delay = 120 + i * 110;
      const childState = placeNode(childPerson, state.x, state.y, state.id, angle);
      state.childIds.push(childState.id);

      // Hold child at parent position briefly, then animate to target.
      setTimeout(function () {
        childState.x = cx;
        childState.y = cy;
        childState.el.style.left = cx + "px";
        childState.el.style.top = cy + "px";
      }, delay);

      // Draw connector after position transition starts.
      setTimeout(function () {
        drawLink(state, childState);
      }, delay + 80);
    });

    centerOn(state.x, state.y);
  }

  function drawLink(from, to) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("class", "link");
    const offset = 4000;
    // Quadratic curve via control point biased perpendicular to the line.
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const bow = Math.min(40, len * 0.22);
    const cx = mx + px * bow;
    const cy = my + py * bow;
    const d =
      "M " + (from.x + offset) + " " + (from.y + offset) +
      " Q " + (cx + offset) + " " + (cy + offset) +
      " " + (to.x + offset) + " " + (to.y + offset);
    path.setAttribute("d", d);
    // Calibrate dash length to actual path length.
    links.appendChild(path);
    const totalLen = path.getTotalLength();
    path.style.strokeDasharray = totalLen;
    path.style.strokeDashoffset = totalLen;
    // Force reflow before transitioning.
    // eslint-disable-next-line no-unused-expressions
    path.getBoundingClientRect();
    requestAnimationFrame(function () {
      path.classList.add("drawn");
      path.style.strokeDashoffset = 0;
    });
    to.linkFromParent = path;
  }

  function collapse(state) {
    state.expanded = false;
    state.bubble.classList.remove("open");
    state.childIds.forEach(function (cid) {
      removeSubtree(cid);
    });
    state.childIds = [];
  }

  function removeSubtree(id) {
    const s = nodes.get(id);
    if (!s) return;
    if (s.expanded) {
      s.childIds.forEach(removeSubtree);
    }
    if (s.linkFromParent) {
      const link = s.linkFromParent;
      link.style.strokeDashoffset = link.style.strokeDasharray;
      setTimeout(function () { link.remove(); }, 420);
    }
    s.el.classList.remove("visible");
    // Slide back toward parent for a smooth implode.
    const parent = nodes.get(s.parentId);
    if (parent) {
      s.el.style.left = parent.x + "px";
      s.el.style.top = parent.y + "px";
    }
    setTimeout(function () { s.el.remove(); }, 620);
    nodes.delete(id);
  }

  function showDetail(person) {
    detailName.textContent = person.name;
    detailInfo.textContent = person.info || "No additional details recorded.";
    detail.hidden = false;
  }

  // --- Pan & center ------------------------------------------------------

  let panX = 0, panY = 0;
  function setPan(x, y, animate) {
    panX = x; panY = y;
    viewport.style.transition = animate ? "transform 700ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
    viewport.style.transform = "translate(" + x + "px, " + y + "px)";
  }
  function centerOn(x, y) {
    setPan(-x, -y, true);
  }

  // Drag to pan.
  let dragging = false, dragStart = null, panStart = null;
  stage.addEventListener("pointerdown", function (e) {
    if (e.target.closest(".bubble") || e.target.closest(".spouse")) return;
    dragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    panStart = { x: panX, y: panY };
    stage.classList.add("dragging");
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    setPan(panStart.x + (e.clientX - dragStart.x), panStart.y + (e.clientY - dragStart.y), false);
  });
  stage.addEventListener("pointerup", function () {
    dragging = false;
    stage.classList.remove("dragging");
  });
  stage.addEventListener("pointercancel", function () {
    dragging = false;
    stage.classList.remove("dragging");
  });

  // --- Bootstrap ---------------------------------------------------------

  function reset() {
    world.innerHTML = "";
    links.innerHTML = "";
    nodes.clear();
    nextId = 0;
    placeNode(data, 0, 0, null, null);
    setPan(0, 0, true);
  }

  reset();
})();
