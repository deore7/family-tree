// ---------------------------------------------------------------------------
// Collapsible family tree rendered with D3 (SVG) + pan/zoom.
// The multi-parent DAG is projected to a spanning tree via each person's
// "primary parent" so the layout stays a clean, collapsible tree.
// ---------------------------------------------------------------------------
window.Tree = (function () {
  // Portrait node: round photo on top, name + village below.
  const NODE_W = 150, NODE_H = 134;
  const AV_R = 30;                    // avatar radius
  const AV_CY = -NODE_H / 2 + 40;     // avatar centre (near the top)
  const DX = 178, DY = 200;           // sibling / generation spacing
  const COUPLE_DX = 172;              // gap from a person to their spouse companion

  let svg, gZoom, gLink, gCouple, gNode, gSpouse, zoom;
  let root, rootData;
  let onSelect = function () {};
  let width = 0, height = 0;
  // Spouse-companion maps, rebuilt on every buildData():
  //   companionOf[nodeId]   = spouseId drawn beside that tree node
  //   isCompanion[spouseId] = the tree node id the spouse hangs off
  let companionOf = {}, isCompanion = {};

  // A node shows its spouse companion only while its children are expanded.
  function hasVisibleCompanion(d) {
    return !!(d.data.companionId && d.children && d.children.length);
  }

  // True when a (companion) spouse has at least one real, non-dummy parent in
  // the data — i.e. their own parental family can be expanded to.
  function companionHasParents(id) {
    return Store.parentsOf(id).some((p) => !Store.isDummy(p.id));
  }

  function primaryParentId(p) {
    if (p.fatherIds && p.fatherIds.length) return p.fatherIds[0];
    if (p.motherIds && p.motherIds.length) return p.motherIds[0];
    return null;
  }

  // True when a person descends from a real (non-dummy) primary parent.
  function hasBloodParent(p) {
    const pp = primaryParentId(p);
    return !!(pp && !Store.isDummy(pp) && Store.get(pp));
  }

  // Decide, for each couple, which spouse stays a tree node and which is drawn
  // as a companion beside them. The blood descendant keeps the node; a married-in
  // spouse becomes the companion (so couples sit side by side, children below).
  function assignCouples() {
    companionOf = {}; isCompanion = {};
    Store.all().forEach((p) => {
      if (Store.isDummy(p.id)) return;
      if (companionOf[p.id] || isCompanion[p.id]) return; // already has a role
      const spouses = (p.spouseIds || [])
        .map(Store.get).filter(Boolean).filter((s) => !Store.isDummy(s.id));
      for (const s of spouses) {
        if (companionOf[s.id] || isCompanion[s.id]) continue;
        if (companionOf[p.id] || isCompanion[p.id]) break;
        const pBlood = hasBloodParent(p), sBlood = hasBloodParent(s);
        let nodeId, compId;
        if (pBlood && !sBlood) { nodeId = p.id; compId = s.id; }
        else if (sBlood && !pBlood) { nodeId = s.id; compId = p.id; }
        else if (!pBlood && !sBlood) { // both top-level: pick a stable node
          if (p.id <= s.id) { nodeId = p.id; compId = s.id; }
          else { nodeId = s.id; compId = p.id; }
        } else { continue; } // both blood: keep both in their own lineages
        companionOf[nodeId] = compId;
        isCompanion[compId] = nodeId;
        break;
      }
    });
  }

  // Build nested {id, children} spanning tree rooted at a synthetic couple node.
  function buildData() {
    assignCouples();
    const childMap = {};
    Store.all().forEach((p) => {
      if (Store.isDummy(p.id)) return;
      if (isCompanion[p.id]) return; // companions aren't their own tree nodes
      let pp = primaryParentId(p);
      // If the primary parent is a companion, hang the child off their partner
      // node instead, so no child is lost when a married-in parent is hidden.
      if (pp && isCompanion[pp]) pp = isCompanion[pp];
      // Missing or dummy primary parent → attach at the root couple.
      const key = !pp || Store.isDummy(pp) || !Store.get(pp) ? "__ROOT__" : pp;
      (childMap[key] = childMap[key] || []).push(p.id);
    });

    const visited = new Set();
    function node(id) {
      visited.add(id);
      const kids = (childMap[id] || [])
        .filter((cid) => !visited.has(cid))
        .sort(byBirth)
        .map(node);
      return { id: id, children: kids, companionId: companionOf[id] || null };
    }
    function byBirth(a, b) {
      const pa = Store.get(a), pb = Store.get(b);
      return (pa.dob || "9999").localeCompare(pb.dob || "9999");
    }
    const rootKids = (childMap["__ROOT__"] || [])
      .filter((cid) => !visited.has(cid))
      .sort(byBirth)
      .map(node);
    return { id: "__ROOT__", isRoot: true, children: rootKids };
  }

  function init(containerSel, callbacks) {
    onSelect = (callbacks && callbacks.onSelect) || onSelect;
    const container = d3.select(containerSel);
    container.selectAll("*").remove();

    svg = container.append("svg").attr("class", "tree-svg");
    gZoom = svg.append("g");
    gLink = gZoom.append("g").attr("class", "links");
    gCouple = gZoom.append("g").attr("class", "couples"); // spouse connector lines
    gNode = gZoom.append("g").attr("class", "nodes");
    gSpouse = gZoom.append("g").attr("class", "spouses"); // spouse companion nodes

    zoom = d3.zoom().scaleExtent([0.15, 2.5]).on("zoom", (e) => {
      gZoom.attr("transform", e.transform);
    });
    svg.call(zoom);

    resize();
    window.addEventListener("resize", resize);
  }

  function resize() {
    const node = svg.node();
    if (!node) return;
    const rect = node.parentNode.getBoundingClientRect();
    width = rect.width; height = rect.height;
    svg.attr("width", width).attr("height", height);
  }

  function collapseBeyond(d, depth) {
    if (d.children) {
      if (d.depth >= depth) {
        d._children = d.children;
        d._children.forEach((c) => collapseBeyond(c, depth));
        d.children = null;
      } else {
        d.children.forEach((c) => collapseBeyond(c, depth));
      }
    }
  }

  function render(preserveTransform) {
    const prevTransform = preserveTransform ? d3.zoomTransform(svg.node()) : null;
    rootData = buildData();
    root = d3.hierarchy(rootData, (d) => d.children);
    root.x0 = 0; root.y0 = 0;
    collapseBeyond(root, CONFIG.collapseDepth);
    update(root);
    if (prevTransform) {
      svg.call(zoom.transform, prevTransform);
    } else {
      fit();
    }
  }

  function toggle(d) {
    if (d.children) {
      d._children = d.children; d.children = null;
    } else {
      d.children = d._children; d._children = null;
      // Accordion: expanding one family collapses its siblings so only one
      // family is open at each level under a given parent.
      if (d.parent && d.parent.children) {
        d.parent.children.forEach((sib) => {
          if (sib !== d && sib.children) { sib._children = sib.children; sib.children = null; }
        });
      }
    }
    update(d);
  }

  function personLabel(id) {
    if (id === "__ROOT__") return "Ancestors";
    return Store.fullName(Store.get(id));
  }

  // Name shown on a node. Last-level people (no children currently shown) drop
  // their last name to reduce clutter — except a married-in female, whose last
  // name marks her natal family and is kept.
  function nameLabel(id, lastLevel) {
    if (id === "__ROOT__") return "Ancestors";
    const p = Store.get(id);
    if (!p) return "Unknown";
    const femaleMarriedIn = p.gender === "female" && !!isCompanion[id];
    if (lastLevel && !femaleMarriedIn) {
      return (p.firstName || "").trim() || Store.fullName(p);
    }
    return Store.fullName(p);
  }

  function genderClass(id) {
    if (id === "__ROOT__") return "root";
    const p = Store.get(id);
    return p ? p.gender : "other";
  }

  function initials(id) {
    if (id === "__ROOT__") return "★";
    const p = Store.get(id);
    if (!p) return "?";
    return ((p.firstName[0] || "") + (p.lastName[0] || "")).toUpperCase() || "?";
  }

  function photoUrl(id) {
    const p = Store.get(id);
    if (!p) return null;
    return p._photoPreview || p.photo || null;
  }

  // Append the avatar (ring, circle, initials, optional photo) and the
  // name/sub labels into an entering <g>. `idOf(d)` yields the person id;
  // `nameFn(d)` yields the (possibly last-name-trimmed) display name.
  function appendAvatarAndLabels(enter, idOf, nameFn) {
    enter.append("circle").attr("class", "avatar-ring")
      .attr("cx", 0).attr("cy", AV_CY).attr("r", AV_R + 3);
    enter.append("circle").attr("class", "avatar")
      .attr("cx", 0).attr("cy", AV_CY).attr("r", AV_R);
    enter.append("text").attr("class", "avatar-initials")
      .attr("x", 0).attr("y", AV_CY + 6).attr("text-anchor", "middle")
      .text((d) => initials(idOf(d)));
    enter.each(function (d) {
      const id = idOf(d);
      const url = photoUrl(id);
      if (!url) return;
      const g = d3.select(this);
      const clipId = "clip-" + id;
      g.append("clipPath").attr("id", clipId).append("circle")
        .attr("cx", 0).attr("cy", AV_CY).attr("r", AV_R);
      const img = g.append("image").attr("class", "avatar-photo")
        .attr("href", url)
        .attr("x", -AV_R).attr("y", AV_CY - AV_R)
        .attr("width", AV_R * 2).attr("height", AV_R * 2)
        .attr("preserveAspectRatio", "xMidYMid slice")
        .attr("clip-path", "url(#" + clipId + ")");
      img.node().addEventListener("error", () => img.remove());
    });
    enter.append("text").attr("class", "name")
      .attr("x", 0).attr("y", AV_CY + AV_R + 24).attr("text-anchor", "middle")
      .text((d) => truncate(nameFn(d), 18));
    enter.append("text").attr("class", "sub")
      .attr("x", 0).attr("y", AV_CY + AV_R + 44).attr("text-anchor", "middle")
      .text((d) => subLabel(idOf(d)));
  }

  function update(source) {
    const tree = d3.tree().nodeSize([DX, DY]).separation((a, b) => {
      const base = a.parent === b.parent ? 1 : 2;
      // Reserve a full extra slot next to anyone actually showing a spouse
      // companion (only when their children are expanded) so names don't overlap.
      return base + ((hasVisibleCompanion(a) || hasVisibleCompanion(b)) ? 1 : 0);
    });
    tree(root);

    const nodes = root.descendants();
    const links = root.links();

    // ----- Nodes -----
    const node = gNode.selectAll("g.node").data(nodes, (d) => d.data.id);

    const nodeEnter = node.enter().append("g")
      .attr("class", (d) => "node gender-" + genderClass(d.data.id))
      .attr("transform", () => "translate(" + source.x0 + "," + source.y0 + ")")
      .style("cursor", (d) => (d.data.isRoot ? "default" : "pointer"))
      .on("click", (e, d) => {
        if (d.data.isRoot) return;
        onSelect(d.data.id);
      });

    // avatar ring + circle + initials/photo + name/sub labels
    appendAvatarAndLabels(nodeEnter, (d) => d.data.id,
      (d) => nameLabel(d.data.id, !d.children));

    // expand/collapse toggle (only when node has descendants)
    const toggleG = nodeEnter.append("g")
      .attr("class", "toggle")
      .attr("transform", "translate(0," + (NODE_H / 2) + ")")
      .on("click", (e, d) => { e.stopPropagation(); toggle(d); });
    toggleG.append("circle").attr("r", 9);
    toggleG.append("text").attr("text-anchor", "middle").attr("y", 4);

    const nodeUpdate = nodeEnter.merge(node);
    nodeUpdate.transition().duration(200)
      .attr("transform", (d) => "translate(" + d.x + "," + d.y + ")");
    nodeUpdate.attr("class", (d) =>
      "node gender-" + genderClass(d.data.id) + (d._children ? " collapsed" : ""));

    // Refresh the name: a node's "last level" state (and so whether it shows a
    // last name) changes as it expands/collapses, so re-evaluate on every update.
    nodeUpdate.select("text.name")
      .text((d) => truncate(nameLabel(d.data.id, !d.children), 18));
    nodeUpdate.select("text.sub")
      .text((d) => subLabel(d.data.id));

    nodeUpdate.select(".toggle")
      .style("display", (d) => (d.children || d._children ? null : "none"));
    nodeUpdate.select(".toggle text")
      .text((d) => (d.children ? "–" : "+"));

    node.exit().transition().duration(200)
      .attr("transform", () => "translate(" + source.x + "," + source.y + ")")
      .remove();

    // ----- Links -----
    const link = gLink.selectAll("path.link").data(links, (d) => d.target.data.id);

    const linkEnter = link.enter().append("path")
      .attr("class", "link")
      .attr("d", () => {
        const o = { x: source.x0, y: source.y0 };
        return diagonal(o, o);
      });

    linkEnter.merge(link).transition().duration(200)
      .attr("d", (d) => diagonal(d.source, d.target));

    link.exit().transition().duration(200)
      .attr("d", () => {
        const o = { x: source.x, y: source.y };
        return diagonal(o, o);
      }).remove();

    // ----- Spouse companions (drawn beside their partner + a marriage line) -----
    // Only show a spouse where the member's children are being shown (expanded).
    const couples = nodes
      .filter(hasVisibleCompanion)
      .map((d) => ({ id: d.data.companionId, x: d.x + COUPLE_DX, y: d.y, px: d.x, py: d.y }));

    // marriage connector line (avatar-centre to avatar-centre)
    const cline = gCouple.selectAll("line.couple-link").data(couples, (d) => d.id);
    cline.enter().append("line").attr("class", "couple-link")
      .attr("x1", () => source.x0).attr("y1", () => source.y0 + AV_CY)
      .attr("x2", () => source.x0).attr("y2", () => source.y0 + AV_CY)
      .merge(cline).transition().duration(200)
      .attr("x1", (d) => d.px).attr("y1", (d) => d.py + AV_CY)
      .attr("x2", (d) => d.x).attr("y2", (d) => d.y + AV_CY);
    cline.exit().remove();

    // companion node (same visual as a person, no toggle)
    const sp = gSpouse.selectAll("g.node.spouse").data(couples, (d) => d.id);
    const spEnter = sp.enter().append("g")
      .attr("class", (d) => "node spouse gender-" + genderClass(d.id))
      .attr("transform", () => "translate(" + source.x0 + "," + source.y0 + ")")
      .style("cursor", "pointer")
      .on("click", (e, d) => onSelect(d.id));
    appendAvatarAndLabels(spEnter, (d) => d.id, (d) => nameLabel(d.id, true));

    // "+" to expand this spouse's own parental family (only when linked).
    const spToggle = spEnter.append("g")
      .attr("class", "toggle")
      .attr("transform", "translate(0," + (NODE_H / 2) + ")")
      .on("click", (e, d) => { e.stopPropagation(); focusPerson(d.id, { toParents: true }); });
    spToggle.append("circle").attr("r", 9);
    spToggle.append("text").attr("text-anchor", "middle").attr("y", 4).text("+");

    const spUpdate = spEnter.merge(sp);
    spUpdate.transition().duration(200)
      .attr("transform", (d) => "translate(" + d.x + "," + d.y + ")");
    spUpdate.attr("class", (d) => "node spouse gender-" + genderClass(d.id));
    spUpdate.select(".toggle")
      .style("display", (d) => (companionHasParents(d.id) ? null : "none"));
    sp.exit().remove();

    nodes.forEach((d) => { d.x0 = d.x; d.y0 = d.y; });
  }

  function subLabel(id) {
    if (id === "__ROOT__") return "default couple";
    const p = Store.get(id);
    if (!p) return "";
    if (p.gender === "female") {
      // Married-in wife (companion): show her maher (parental home) village.
      if (isCompanion[id]) {
        return ((p.maher && p.maher.village) || "").trim() || p.village || "";
      }
      // Daughter who married out: show her sasar (in-laws' home) village.
      if (p.married) {
        return ((p.sasar && p.sasar.village) || "").trim() || p.village || "";
      }
    }
    if (p.village) return p.village;
    if (p.dob) return "b. " + p.dob;
    return "";
  }

  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  // vertical S-curve between two {x,y} points
  function diagonal(s, t) {
    return "M" + s.x + "," + (s.y + NODE_H / 2) +
      "C" + s.x + "," + ((s.y + t.y) / 2) +
      " " + t.x + "," + ((s.y + t.y) / 2) +
      " " + t.x + "," + (t.y - NODE_H / 2);
  }

  // ----- Public controls -----
  function fit() {
    if (!root) return;
    const nodes = root.descendants();
    const xs = nodes.map((d) => d.x), ys = nodes.map((d) => d.y);
    const minX = Math.min(...xs) - NODE_W, maxX = Math.max(...xs) + NODE_W + COUPLE_DX;
    const minY = Math.min(...ys) - NODE_H, maxY = Math.max(...ys) + NODE_H;
    const w = maxX - minX, h = maxY - minY;
    const scale = Math.min(2.5, Math.max(0.15, Math.min(width / w, height / h) * 0.95));
    const tx = width / 2 - scale * (minX + maxX) / 2;
    const ty = height / 2 - scale * (minY + maxY) / 2;
    svg.transition().duration(300)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  function zoomBy(k) {
    svg.transition().duration(200).call(zoom.scaleBy, k);
  }

  // Expand every ancestor of a node so it becomes visible, then focus it.
  function focusPerson(id, opts) {
    opts = opts || {};
    // A spouse companion isn't a tree node — normally navigate to its partner,
    // but still highlight the companion itself. When opts.toParents is set
    // (the spouse's "+"), climb the companion's OWN parent chain instead so we
    // reveal and centre on their parental family.
    let navId = isCompanion[id] && !opts.toParents ? isCompanion[id] : id;
    let highlightId = id;
    if (opts.toParents) {
      let pp = primaryParentId(Store.get(id) || {});
      if (pp && !Store.isDummy(pp) && Store.get(pp)) {
        highlightId = pp;
        // A companion parent isn't its own node — centre on their partner node.
        navId = isCompanion[pp] ? isCompanion[pp] : pp;
      }
    }
    // Walk up primary-parent chain and expand each ancestor.
    const path = [];
    let cur = Store.get(navId);
    const guard = new Set();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      path.unshift(cur.id);
      let pp = primaryParentId(cur);
      // Follow the tree structure: a companion parent hangs off their partner.
      if (pp && isCompanion[pp]) pp = isCompanion[pp];
      cur = pp && !Store.isDummy(pp) ? Store.get(pp) : null;
    }
    // Expand along the path from the root.
    function expandChain(d) {
      if (!d) return;
      if (d._children) { d.children = d._children; d._children = null; }
      const nextId = path.shift();
      const child = (d.children || []).find((c) => c.data.id === nextId);
      if (child) expandChain(child);
    }
    // path starts at a top-level person; make sure the root is expanded first.
    if (root._children && !root.children) { root.children = root._children; root._children = null; }
    const topId = path.shift();
    const start = (root.children || []).find((c) => c.data.id === topId);
    if (start) expandChain(start);
    update(root);

    const target = root.descendants().find((d) => d.data.id === navId);
    if (target) centerOn(target, highlightId);
  }

  function centerOn(d, id) {
    const scale = Math.max(0.6, d3.zoomTransform(svg.node()).k);
    const tx = width / 2 - scale * d.x;
    const ty = height / 2 - scale * d.y;
    svg.transition().duration(400)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
      .on("end", () => highlight(id));
  }

  function highlight(id) {
    gNode.selectAll("g.node").classed("highlight", (d) => d.data.id === id);
    gSpouse.selectAll("g.node.spouse").classed("highlight", (d) => d.id === id);
    setTimeout(() => {
      gNode.selectAll("g.node").classed("highlight", false);
      gSpouse.selectAll("g.node.spouse").classed("highlight", false);
    }, 2000);
  }

  return { init, render, fit, zoomIn: () => zoomBy(1.3), zoomOut: () => zoomBy(1 / 1.3), focusPerson };
})();
