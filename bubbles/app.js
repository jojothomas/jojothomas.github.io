(function () {
  "use strict";
  const data = window.familyData;
  const world = document.getElementById("world");
  const strings = document.getElementById("strings");
  const viewport = document.getElementById("viewport");
  const stage = document.getElementById("stage");
  const detail = document.getElementById("detail");
  const detailName = document.getElementById("detailName");
  const detailInfo = document.getElementById("detailInfo");
  document.getElementById("detailClose").addEventListener("click", function () {
    detail.hidden = true;
  });
  document.getElementById("reset").addEventListener("click", reset);

  const RADIUS_ROOT = 260;
  const RADIUS_NEXT = 230;
  const ROOT_ARC_DEG = 300;
  const CHILD_ARC_DEG = 140;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const nodes = new Map();
  let nextId = 0;

  function colorClass(col) {
    if (col === "rootCol") return "root";
    if (col === "femaleCol") return "female";
    return "male";
  }
  function rand(min, max) { return min + Math.random() * (max - min); }

  function placeNode(person, x, y, parentId, angleFromParent) {
    const id = ++nextId;
    const el = document.createElement("div");
    el.className = "node";
    el.style.left = x + "px";
    el.style.top = y + "px";

    // Randomized bob so each balloon drifts independently.
    const float = document.createElement("div");
    float.className = "float";
    float.style.setProperty("--bob-x", rand(-6, -3).toFixed(2) + "px");
    float.style.setProperty("--bob-y", rand(-5, -2).toFixed(2) + "px");
    float.style.setProperty("--bob-dur", rand(3.8, 6.4).toFixed(2) + "s");
    float.style.animationDelay = (-rand(0, 5)).toFixed(2) + "s";

    const pop = document.createElement("div");
    pop.className = "pop";

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

    pop.appendChild(bubble);
    float.appendChild(pop);
    el.appendChild(float);
    world.appendChild(el);

    const state = {
      id, person, el, bubble, x, y, parentId, angleFromParent,
      expanded: false,
      childIds: [],
      stringFromParent: null,
    };
    nodes.set(id, state);

    requestAnimationFrame(function () { el.classList.add("visible"); });

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

    let centerAngle, arcDeg;
    if (state.parentId === null) {
      centerAngle = -Math.PI / 2;
      arcDeg = ROOT_ARC_DEG;
    } else {
      centerAngle = state.angleFromParent;
      arcDeg = CHILD_ARC_DEG;
    }
    const arcRad = (arcDeg * Math.PI) / 180;
    const startAngle = centerAngle - arcRad / 2;
    const step = n === 1 ? 0 : arcRad / (n - 1);
    const radius = state.parentId === null ? RADIUS_ROOT : RADIUS_NEXT;

    kids.forEach(function (childPerson, i) {
      const angle = n === 1 ? centerAngle : startAngle + step * i;
      const cx = state.x + Math.cos(angle) * radius;
      const cy = state.y + Math.sin(angle) * radius;
      const delay = 140 + i * 130;

      const childState = placeNode(childPerson, state.x, state.y, state.id, angle);
      state.childIds.push(childState.id);

      // Wait a beat, then float the balloon out to its position.
      setTimeout(function () {
        childState.x = cx;
        childState.y = cy;
        childState.el.style.left = cx + "px";
        childState.el.style.top = cy + "px";
      }, delay);

      setTimeout(function () { drawString(state, childState); }, delay + 120);
    });

    centerOn(state.x, state.y);
  }

  function drawString(from, to) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("class", "string");
    const offset = 4000;
    // Curved string with a slight perpendicular sag toward "down" (positive y).
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Perpendicular vector, biased so the curve always bows downward (gravity).
    let px = -dy / len;
    let py = dx / len;
    if (py < 0) { px = -px; py = -py; }
    const bow = 26;
    const cx = mx + px * bow;
    const cy = my + py * bow;
    const d =
      "M " + (from.x + offset) + " " + (from.y + offset) +
      " Q " + (cx + offset) + " " + (cy + offset) +
      " " + (to.x + offset) + " " + (to.y + offset);
    path.setAttribute("d", d);
    strings.appendChild(path);
    const totalLen = path.getTotalLength();
    path.style.strokeDasharray = totalLen;
    path.style.strokeDashoffset = totalLen;
    // eslint-disable-next-line no-unused-expressions
    path.getBoundingClientRect();
    requestAnimationFrame(function () {
      path.classList.add("drawn");
      path.style.strokeDashoffset = 0;
    });
    to.stringFromParent = path;
  }

  function collapse(state) {
    state.expanded = false;
    state.bubble.classList.remove("open");
    state.childIds.forEach(removeSubtree);
    state.childIds = [];
  }

  function removeSubtree(id) {
    const s = nodes.get(id);
    if (!s) return;
    if (s.expanded) s.childIds.forEach(removeSubtree);
    if (s.stringFromParent) {
      const line = s.stringFromParent;
      line.style.strokeDashoffset = line.style.strokeDasharray;
      setTimeout(function () { line.remove(); }, 520);
    }
    s.el.classList.remove("visible");
    const parent = nodes.get(s.parentId);
    if (parent) {
      s.el.style.left = parent.x + "px";
      s.el.style.top = parent.y + "px";
    }
    setTimeout(function () { s.el.remove(); }, 740);
    nodes.delete(id);
  }

  function showDetail(person) {
    detailName.textContent = person.name;
    detailInfo.textContent = person.info || "No additional details recorded.";
    detail.hidden = false;
  }

  // --- Pan ---------------------------------------------------------------

  let panX = 0, panY = 0;
  function setPan(x, y, animate) {
    panX = x; panY = y;
    viewport.style.transition = animate ? "transform 760ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
    viewport.style.transform = "translate(" + x + "px, " + y + "px)";
  }
  function centerOn(x, y) { setPan(-x, -y, true); }

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

  function reset() {
    world.innerHTML = "";
    strings.innerHTML = "";
    nodes.clear();
    nextId = 0;
    placeNode(data, 0, 0, null, null);
    setPan(0, 0, true);
  }

  reset();
})();
