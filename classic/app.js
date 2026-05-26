(function () {
  "use strict";
  const data = window.familyData;
  const canvas = document.getElementById("canvas");
  const detail = document.getElementById("detail");
  const detailName = document.getElementById("detailName");
  const detailInfo = document.getElementById("detailInfo");
  document.getElementById("detailClose").addEventListener("click", hideDetail);

  function colorClass(col) {
    if (col === "rootCol") return "root";
    if (col === "femaleCol") return "female";
    return "male";
  }

  function makeCard(person, isRoot) {
    const card = document.createElement("div");
    card.className = "card " + colorClass(person.col);
    if (isRoot) card.classList.add("root");
    card.textContent = person.name;
    if (person.children && person.children.length) {
      card.classList.add("has-children");
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = person.children.length;
      card.appendChild(badge);
    }
    card.addEventListener("click", function (e) {
      e.stopPropagation();
      showDetail(person);
    });
    return card;
  }

  function makeNode(person, isRoot) {
    const node = document.createElement("div");
    node.className = "node" + (isRoot ? " root" : " child");

    const pair = document.createElement("div");
    pair.className = "pair";

    const card = makeCard(person, isRoot);
    pair.appendChild(card);

    if (person.spouse && person.spouse.name) {
      const link = document.createElement("div");
      link.className = "spouse-link";
      pair.appendChild(link);
      const spouseCard = document.createElement("div");
      spouseCard.className = "card " + colorClass(person.spouse.col);
      spouseCard.textContent = person.spouse.name;
      spouseCard.addEventListener("click", function (e) {
        e.stopPropagation();
        showDetail({ name: person.spouse.name, info: "Spouse of " + person.name });
      });
      pair.appendChild(spouseCard);
    }

    node.appendChild(pair);

    const children = person.children || [];
    if (children.length) {
      const childrenWrap = document.createElement("div");
      childrenWrap.className = "children";
      if (children.length === 1) childrenWrap.classList.add("single-child");
      children.forEach(function (childData) {
        const childNode = makeNode(childData, false);
        childrenWrap.appendChild(childNode);
      });
      node.appendChild(childrenWrap);

      card.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleChildren(card, childrenWrap);
      });
    }

    return node;
  }

  function toggleChildren(card, wrap) {
    const opening = !wrap.classList.contains("open");
    if (opening) {
      card.classList.add("open");
      wrap.classList.add("open");
      // Stagger each direct child's reveal.
      const kids = Array.from(wrap.children).filter(function (el) {
        return el.classList.contains("node");
      });
      kids.forEach(function (kid, i) {
        kid.style.setProperty("--reveal-delay", (260 + i * 90) + "ms");
        // Force reflow so the transition runs after the style change.
        // eslint-disable-next-line no-unused-expressions
        kid.offsetWidth;
        kid.classList.add("revealed");
      });
    } else {
      card.classList.remove("open");
      wrap.classList.remove("open");
      Array.from(wrap.children).forEach(function (kid) {
        kid.classList.remove("revealed");
        // Recursively close descendants so reopening looks fresh.
        kid.querySelectorAll(".children.open").forEach(function (gw) {
          gw.classList.remove("open");
        });
        kid.querySelectorAll(".card.open").forEach(function (gc) {
          gc.classList.remove("open");
        });
        kid.querySelectorAll(".node.child.revealed").forEach(function (gn) {
          gn.classList.remove("revealed");
        });
      });
    }
  }

  function showDetail(person) {
    detailName.textContent = person.name;
    detailInfo.textContent = person.info || "No additional details recorded.";
    detail.hidden = false;
  }
  function hideDetail() { detail.hidden = true; }

  canvas.appendChild(makeNode(data, true));
})();
