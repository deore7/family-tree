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

  let svg, gZoom, gLink, gNode, zoom;
  let root, rootData;
  let onSelect = function () {};
  let width = 0, height = 0;

  function primaryParentId(p) {
    if (p.fatherIds && p.fatherIds.length) return p.fatherIds[0];
    if (p.motherIds && p.motherIds.length) return p.motherIds[0];
    return null;
  }

  // Build nested {id, children} spanning tree rooted at a synthetic couple node.
  function buildData() {
    const childMap = {};
    Store.all().forEach((p) => {
      if (Store.isDummy(p.id)) return;
      const pp = primaryParentId(p);
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
      return { id: id, children: kids };
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
    gNode = gZoom.append("g").attr("class", "nodes");

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
    }
    update(d);
  }

  function personLabel(id) {
    if (id === "__ROOT__") return "Ancestors";
    return Store.fullName(Store.get(id));
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

  function update(source) {
    const tree = d3.tree().nodeSize([DX, DY]);
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

    // avatar ring + circle, centred near the top
    nodeEnter.append("circle")
      .attr("class", "avatar-ring")
      .attr("cx", 0).attr("cy", AV_CY).attr("r", AV_R + 3);
    nodeEnter.append("circle")
      .attr("class", "avatar")
      .attr("cx", 0).attr("cy", AV_CY).attr("r", AV_R);

    nodeEnter.append("text")
      .attr("class", "avatar-initials")
      .attr("x", 0).attr("y", AV_CY + 6)
      .attr("text-anchor", "middle")
      .text((d) => initials(d.data.id));

    // photo image (if any) laid over the circle; removes itself if it fails.
    nodeEnter.each(function (d) {
      const url = photoUrl(d.data.id);
      if (!url) return;
      const g = d3.select(this);
      const clipId = "clip-" + d.data.id;
      g.append("clipPath").attr("id", clipId).append("circle")
        .attr("cx", 0).attr("cy", AV_CY).attr("r", AV_R);
      const img = g.append("image")
        .attr("class", "avatar-photo")
        .attr("href", url)
        .attr("x", -AV_R).attr("y", AV_CY - AV_R)
        .attr("width", AV_R * 2).attr("height", AV_R * 2)
        .attr("preserveAspectRatio", "xMidYMid slice")
        .attr("clip-path", "url(#" + clipId + ")");
      img.node().addEventListener("error", () => img.remove());
    });

    nodeEnter.append("text")
      .attr("class", "name")
      .attr("x", 0).attr("y", AV_CY + AV_R + 24)
      .attr("text-anchor", "middle")
      .text((d) => truncate(personLabel(d.data.id), 18));

    nodeEnter.append("text")
      .attr("class", "sub")
      .attr("x", 0).attr("y", AV_CY + AV_R + 44)
      .attr("text-anchor", "middle")
      .text((d) => subLabel(d.data.id));

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

    nodes.forEach((d) => { d.x0 = d.x; d.y0 = d.y; });
  }

  function subLabel(id) {
    if (id === "__ROOT__") return "default couple";
    const p = Store.get(id);
    if (!p) return "";
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
    const minX = Math.min(...xs) - NODE_W, maxX = Math.max(...xs) + NODE_W;
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
  function focusPerson(id) {
    // Walk up primary-parent chain and expand each ancestor.
    const path = [];
    let cur = Store.get(id);
    const guard = new Set();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      path.unshift(cur.id);
      const pp = primaryParentId(cur);
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

    const target = root.descendants().find((d) => d.data.id === id);
    if (target) centerOn(target, id);
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
    setTimeout(() => gNode.selectAll("g.node").classed("highlight", false), 2000);
  }

  return { init, render, fit, zoomIn: () => zoomBy(1.3), zoomOut: () => zoomBy(1 / 1.3), focusPerson };
})();
