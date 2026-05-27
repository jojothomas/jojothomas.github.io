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
  const detailMeta = document.getElementById("detailMeta");
  document.getElementById("detailClose").addEventListener("click", function () {
    detail.hidden = true;
    clearSelected();
  });
  document.getElementById("reset").addEventListener("click", reset);

  // Track which bubble currently owns the detail panel (the "selected" one).
  let selectedBubble = null;
  function setSelected(bubbleEl) {
    if (selectedBubble === bubbleEl) return;
    if (selectedBubble) selectedBubble.classList.remove("selected");
    selectedBubble = bubbleEl;
    if (selectedBubble) selectedBubble.classList.add("selected");
  }
  function clearSelected() { setSelected(null); }

  const RADIUS_ROOT = 260;
  const RADIUS_NEXT = 230;
  const ROOT_ARC_DEG = 300;
  const CHILD_ARC_DEG = 140;
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Geometry of bubbles + badges, matched to CSS values.
  const BUBBLE_R = 54;        // half of .bubble (108px)
  const ROOT_BUBBLE_R = 72;   // half of .bubble.root (144px)
  const CORNER_OFFSET = 46;       // distance from bubble center to badge center
  const ROOT_CORNER_OFFSET = 60;
  const BADGE_R = 12;
  const ROOT_BADGE_R = 14;

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
      const spousePerson = {
        name: person.spouse.name,
        info: "Spouse of " + person.name + ".",
        spouseOf: person.name,
      };
      sp.addEventListener("pointerenter", function (e) {
        e.stopPropagation();
        showDetail(spousePerson, sp);
      });
      sp.addEventListener("click", function (e) {
        e.stopPropagation();
        showDetail(spousePerson, sp);
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

    // Hover (or first touch) shows the detail panel. pointerenter does not
    // bubble, so it won't double-fire when crossing into the spouse mini-bubble
    // or the count badge inside this bubble.
    bubble.addEventListener("pointerenter", function () {
      showDetail(state.person, bubble);
    });

    return state;
  }

  function handleClick(state) {
    // Click is reserved for expand/collapse. Hover handles detail display.
    if (state.person.children && state.person.children.length) {
      if (state.expanded) collapse(state);
      else expand(state);
    } else {
      // Leaf person — surface the panel on tap for touch users who skip hover.
      showDetail(state.person, state.bubble);
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

      // Set the LOGICAL target position immediately so badge-collision math
      // sees the final layout, even while the visual transition is in flight.
      childState.x = cx;
      childState.y = cy;

      // Defer only the visual move so the balloon floats out from the parent.
      setTimeout(function () {
        childState.el.style.left = cx + "px";
        childState.el.style.top = cy + "px";
      }, delay);

      setTimeout(function () { drawString(state, childState); }, delay + 120);
    });

    updateAllSpouses();
    updateAllBadges();
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
    updateAllSpouses();
    updateAllBadges();
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
    // If this bubble (or its spouse) currently owns the detail panel, drop it.
    if (selectedBubble && s.el.contains(selectedBubble)) {
      selectedBubble = null;
      detail.hidden = true;
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

  // --- Children-count badge placement ------------------------------------
  //
  // The count badge sits at one of the four bubble corners. As the tree grows
  // deeper, neighboring bubbles can drift over the default top-right corner
  // and hide it. For each bubble with a count, we score every corner by how
  // far the nearest other bubble is, and pick the most clear one.

  function bubbleR(state)  { return state.parentId === null ? ROOT_BUBBLE_R   : BUBBLE_R; }
  function cornerOff(state){ return state.parentId === null ? ROOT_CORNER_OFFSET : CORNER_OFFSET; }
  function badgeR(state)   { return state.parentId === null ? ROOT_BADGE_R    : BADGE_R; }

  const CORNERS = [
    { name: "tr", dx:  1, dy: -1 },
    { name: "tl", dx: -1, dy: -1 },
    { name: "bl", dx: -1, dy:  1 },
    { name: "br", dx:  1, dy:  1 },
  ];

  // Spouse mini-bubble geometry (matches CSS: 48px diameter, centered vertically,
  // pushed out to whichever side has more clearance from neighboring bubbles).
  const SPOUSE_R = 24;
  function spouseSideDir(state) {
    // +1 for right, -1 for left. Default to right when not yet decided.
    return state.spouseSide === "left" ? -1 : 1;
  }
  function spouseObstacle(state) {
    if (!state.person.spouse || !state.person.spouse.name) return null;
    const dir = spouseSideDir(state);
    return { x: state.x + dir * (bubbleR(state) + 4), y: state.y, r: SPOUSE_R };
  }

  function spouseClearanceAt(state, dir) {
    // Distance from the prospective spouse center to the nearest other bubble.
    const sx = state.x + dir * (bubbleR(state) + 4);
    const sy = state.y;
    let minClear = Infinity;
    for (const other of nodes.values()) {
      if (other.id === state.id) continue;
      const oR = bubbleR(other);
      const dist = Math.hypot(other.x - sx, other.y - sy);
      const clear = dist - oR - SPOUSE_R;
      if (clear < minClear) minClear = clear;
    }
    return minClear;
  }

  function pickSpouseSide(state) {
    if (!state.person.spouse || !state.person.spouse.name) return;
    // Small bias toward "right" so the spouse stays put unless the left is
    // meaningfully clearer than the right.
    const rightScore = spouseClearanceAt(state,  1) + 8;
    const leftScore  = spouseClearanceAt(state, -1);
    const side = rightScore >= leftScore ? "right" : "left";
    state.bubble.classList.remove("spouse-left", "spouse-right");
    state.bubble.classList.add("spouse-" + side);
    state.spouseSide = side;
  }

  function updateAllSpouses() {
    for (const state of nodes.values()) {
      pickSpouseSide(state);
    }
  }

  function cornerClearance(state, corner) {
    // Distance from this corner's badge center to the nearest obstacle's edge
    // (other bubbles + this bubble's own spouse). Larger = safer.
    const off = cornerOff(state);
    const bx = state.x + corner.dx * off;
    const by = state.y + corner.dy * off;
    const myR = badgeR(state);
    let minClear = Infinity;
    for (const other of nodes.values()) {
      if (other.id === state.id) continue;
      const oR = bubbleR(other);
      const dist = Math.hypot(other.x - bx, other.y - by);
      const clear = dist - oR - myR;
      if (clear < minClear) minClear = clear;
    }
    const spouse = spouseObstacle(state);
    if (spouse) {
      const dist = Math.hypot(spouse.x - bx, spouse.y - by);
      const clear = dist - spouse.r - myR;
      if (clear < minClear) minClear = clear;
    }
    return minClear;
  }

  function pickBadgeCorner(state) {
    // Tie-breaker bonuses so we prefer TR by default, then TL, then BL, BR.
    const bonus = { tr: 6, tl: 4, bl: 2, br: 0 };
    let best = "tr";
    let bestScore = -Infinity;
    for (const c of CORNERS) {
      const score = cornerClearance(state, c) + bonus[c.name];
      if (score > bestScore) {
        bestScore = score;
        best = c.name;
      }
    }
    state.bubble.classList.remove("badge-tr", "badge-tl", "badge-bl", "badge-br");
    state.bubble.classList.add("badge-" + best);
  }

  function updateAllBadges() {
    for (const state of nodes.values()) {
      if (state.person.children && state.person.children.length) {
        pickBadgeCorner(state);
      }
    }
  }

  function showDetail(person, sourceEl) {
    detailName.textContent = person.name;
    detailInfo.textContent = person.info || "No additional details recorded.";

    // Build the spouse / children meta rows.
    detailMeta.innerHTML = "";
    function addRow(label, value) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      detailMeta.appendChild(dt);
      detailMeta.appendChild(dd);
    }
    if (person.spouse && person.spouse.name) {
      addRow("Spouse", person.spouse.name);
    }
    if (person.spouseOf) {
      addRow("Married to", person.spouseOf);
    }
    if (person.children && person.children.length) {
      addRow("Children", String(person.children.length));
    }

    detail.hidden = false;
    if (sourceEl) setSelected(sourceEl);
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
    selectedBubble = null;
    detail.hidden = true;
    placeNode(data, 0, 0, null, null);
    updateAllSpouses();
    updateAllBadges();
    setPan(0, 0, true);
  }

  reset();
})();
