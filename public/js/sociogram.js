(function sociogramModule() {
  const layoutCache = new Map();
  let activeSimulation = null;

  function initialPosition(index, total, width, height) {
    const angle = (Math.PI * 2 * index) / Math.max(total, 1) - Math.PI / 2;
    const radius = Math.min(width, height) * 0.32;
    return {
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius
    };
  }

  function nodeVisual(metric, analysis) {
    const { thresholds } = analysis;
    /* Score based on total nominations received across all questions — larger score = bigger node */
    const nominationScore = metric.positiveReceived * 1.2 + metric.negativeReceived * 0.8 + metric.mutuals.size * 1.5;
    const radius = 26 + Math.min(nominationScore * 1.6, 22);

    if (metric.negativeReceived >= thresholds.negativeTop && metric.positiveReceived <= thresholds.positiveUpperHalf) {
      return {
        radius,
        fillStart: "#e17055",
        fillEnd: "#d63031",
        halo: "rgba(225, 112, 85, 0.22)",
        glow: "rgba(225, 112, 85, 0.4)",
        shortLabel: "갈등 주의"
      };
    }

    if (metric.positiveReceived >= thresholds.positiveTop && metric.mutuals.size >= 2) {
      return {
        radius,
        fillStart: "#00b894",
        fillEnd: "#00a381",
        halo: "rgba(0, 184, 148, 0.22)",
        glow: "rgba(0, 184, 148, 0.4)",
        shortLabel: "긍정 중심"
      };
    }

    if (metric.positiveReceived >= thresholds.positiveUpperHalf && metric.negativeReceived >= thresholds.negativeUpperHalf) {
      return {
        radius,
        fillStart: "#f39c12",
        fillEnd: "#e67e22",
        halo: "rgba(243, 156, 18, 0.22)",
        glow: "rgba(243, 156, 18, 0.4)",
        shortLabel: "반응이 갈림"
      };
    }

    if (metric.positiveReceived <= thresholds.positiveBottom && metric.negativeReceived <= thresholds.negativeBottom) {
      return {
        radius,
        fillStart: "#a0aabe",
        fillEnd: "#8d99ae",
        halo: "rgba(141, 153, 174, 0.22)",
        glow: "rgba(141, 153, 174, 0.35)",
        shortLabel: "연결 적음"
      };
    }

    return {
      radius,
      fillStart: "#6c5ce7",
      fillEnd: "#5a4bd1",
      halo: "rgba(108, 92, 231, 0.22)",
      glow: "rgba(108, 92, 231, 0.4)",
      shortLabel: "일반"
    };
  }

  /* Aggregate parallel edges between the same pair into one visual link */
  function aggregateEdges(filteredEdges, mutualSets) {
    const map = new Map();

    filteredEdges.forEach((edge) => {
      const sId = Number(edge.source);
      const tId = Number(edge.target);
      const key = `${Math.min(sId, tId)}-${Math.max(sId, tId)}`;
      if (!map.has(key)) {
        map.set(key, {
          source: sId,
          target: tId,
          positiveCount: 0,
          negativeCount: 0,
          isMutual: false,
          directions: new Set()
        });
      }
      const agg = map.get(key);
      if (edge.type === "positive") agg.positiveCount++;
      else agg.negativeCount++;
      agg.directions.add(`${sId}-${tId}`);
    });

    /* Mark mutual connections */
    map.forEach((agg) => {
      const a = agg.source;
      const b = agg.target;
      if (mutualSets.has(a) && mutualSets.get(a).has(b)) {
        agg.isMutual = true;
      }
    });

    return [...map.values()];
  }

  function renderSociogram(container, students, analysis, filters, options = {}) {
    container.innerHTML = "";
    if (activeSimulation) {
      activeSimulation.stop();
      activeSimulation = null;
    }

    if (!analysis.edges.length) {
      container.innerHTML = '<div class="empty-state">응답이 쌓이면 관계망이 여기에 표시됩니다.</div>';
      return;
    }

    const filteredEdges = analysis.edges.filter((edge) => {
      if (filters.questionId !== "all" && edge.questionId !== filters.questionId) return false;
      if (edge.type === "positive" && !filters.showPositive) return false;
      if (edge.type === "negative" && !filters.showNegative) return false;
      return true;
    });

    /* Legend */
    container.insertAdjacentHTML("beforeend", `
      <div class="sociogram-legend-board">
        <span class="sociogram-legend-title">범례</span>
        <div class="sociogram-legend-row">
          <span class="sociogram-legend-chip"><span class="legend-dot positive"></span>긍정 중심</span>
          <span class="sociogram-legend-chip"><span class="legend-dot mixed"></span>보통/반응 갈림</span>
          <span class="sociogram-legend-chip"><span class="legend-dot warn"></span>갈등 주의</span>
          <span class="sociogram-legend-chip"><span class="legend-dot low"></span>연결 적음</span>
        </div>
        <div class="sociogram-legend-row" style="margin-top:4px">
          <span class="sociogram-legend-chip"><span class="legend-line-sample positive-line"></span>긍정 관계</span>
          <span class="sociogram-legend-chip"><span class="legend-line-sample negative-line"></span>부정 관계</span>
          <span class="sociogram-legend-chip"><span class="legend-line-sample mutual-line"></span>상호 선택</span>
        </div>
        <p class="sociogram-legend-note">원 크기: 전체 주목도 / 색: 관계 상태 / 선 두께: 지명 빈도 / 굵은 금색: 상호 선택</p>
      </div>
    `);

    const width = container.clientWidth || 900;
    const height = 680;
    const svg = d3.select(container).append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", height)
      .style("border-radius", "24px")
      .style("overflow", "hidden");

    /* Background */
    const bgGrad = svg.append("defs").append("radialGradient")
      .attr("id", "sociogram-bg-grad")
      .attr("cx", "50%").attr("cy", "50%").attr("r", "60%");
    bgGrad.append("stop").attr("offset", "0%").attr("stop-color", "rgba(108, 92, 231, 0.06)");
    bgGrad.append("stop").attr("offset", "100%").attr("stop-color", "rgba(255, 255, 255, 0.7)");

    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("rx", 24)
      .attr("fill", "url(#sociogram-bg-grad)");

    const defs = svg.select("defs");

    /* Glow filter */
    const glowFilter = defs.append("filter").attr("id", "node-glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    glowFilter.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", "6").attr("result", "blur");
    glowFilter.append("feMerge").selectAll("feMergeNode").data(["blur", "SourceGraphic"]).join("feMergeNode").attr("in", d => d);

    /* Edge glow filter */
    const edgeGlow = defs.append("filter").attr("id", "edge-glow").attr("x", "-20%").attr("y", "-20%").attr("width", "140%").attr("height", "140%");
    edgeGlow.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", "2").attr("result", "blur");
    edgeGlow.append("feMerge").selectAll("feMergeNode").data(["blur", "SourceGraphic"]).join("feMergeNode").attr("in", d => d);

    /* Node gradients (one per student) */
    const nodes = students.map((student, index) => {
      const cached = layoutCache.get(student.id) || initialPosition(index, students.length, width, height);
      const visual = nodeVisual(analysis.metrics[student.id], analysis);

      const gradId = `node-grad-${student.id}`;
      const grad = defs.append("radialGradient").attr("id", gradId).attr("cx", "35%").attr("cy", "35%").attr("r", "65%");
      grad.append("stop").attr("offset", "0%").attr("stop-color", visual.fillStart).attr("stop-opacity", 1);
      grad.append("stop").attr("offset", "100%").attr("stop-color", visual.fillEnd).attr("stop-opacity", 1);

      return {
        ...student,
        x: cached.x,
        y: cached.y,
        radius: visual.radius,
        fillStart: visual.fillStart,
        fillEnd: visual.fillEnd,
        halo: visual.halo,
        glow: visual.glow,
        shortLabel: visual.shortLabel,
        gradId
      };
    });

    /* Arrow markers */
    [
      ["positive", "#00b894", "#00a381"],
      ["negative", "#e17055", "#d63031"],
      ["mutual", "#f9a825", "#f57f17"]
    ].forEach(([type, color, dark]) => {
      defs.append("marker")
        .attr("id", `arrow-${type}`)
        .attr("viewBox", "0 -6 12 12")
        .attr("refX", 10)
        .attr("refY", 0)
        .attr("markerWidth", 8)
        .attr("markerHeight", 8)
        .attr("orient", "auto")
        .append("path")
        .attr("fill", color)
        .attr("d", "M0,-5L10,0L0,5Z")
        .attr("stroke", dark)
        .attr("stroke-width", 0.5);
    });

    /* Build mutual sets for aggregation */
    const mutualSets = new Map();
    students.forEach(s => {
      mutualSets.set(s.id, analysis.metrics[s.id].mutuals);
    });

    const aggregatedLinks = aggregateEdges(filteredEdges, mutualSets);

    const zoomLayer = svg.append("g");
    const edgeLayer = zoomLayer.append("g").attr("class", "edge-layer");
    const nodeLayer = zoomLayer.append("g").attr("class", "node-layer");

    svg.call(
      d3.zoom()
        .scaleExtent([0.5, 2.5])
        .on("zoom", (event) => {
          zoomLayer.attr("transform", event.transform);
        })
    );

    /* Use full edges for simulation force */
    const simulationEdges = analysis.edges.map((edge) => ({ ...edge }));

    const visibleNodeIds = new Set(filteredEdges.flatMap((edge) => [Number(edge.source), Number(edge.target)]));
    const connectedMap = new Map(students.map((student) => [student.id, new Set()]));

    filteredEdges.forEach((edge) => {
      connectedMap.get(Number(edge.source))?.add(Number(edge.target));
      connectedMap.get(Number(edge.target))?.add(Number(edge.source));
    });

    /* Simulation */
    activeSimulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(simulationEdges).id((d) => d.id).distance(160).strength(0.25))
      .force("charge", d3.forceManyBody().strength(-820))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d) => d.radius + 30))
      .force("x", d3.forceX(width / 2).strength(0.04))
      .force("y", d3.forceY(height / 2).strength(0.04));

    /* Curved edge paths */
    const linkGroup = edgeLayer.selectAll("g.link-group")
      .data(aggregatedLinks)
      .join("g")
      .attr("class", "link-group");

    /* Glow path (underneath) */
    linkGroup.append("path")
      .attr("class", "sociogram-link-glow")
      .attr("fill", "none")
      .attr("stroke", (d) => {
        if (d.isMutual) return "rgba(249, 168, 37, 0.3)";
        if (d.negativeCount > 0 && d.positiveCount === 0) return "rgba(225, 112, 85, 0.2)";
        return "rgba(0, 184, 148, 0.2)";
      })
      .attr("stroke-width", (d) => {
        const total = d.positiveCount + d.negativeCount;
        return d.isMutual ? total * 2.5 + 6 : total * 1.5 + 3;
      })
      .attr("opacity", 0);

    /* Main edge path */
    const linkPath = linkGroup.append("path")
      .attr("class", "sociogram-link")
      .attr("fill", "none")
      .attr("stroke", (d) => {
        if (d.isMutual) return "#f9a825";
        if (d.negativeCount > 0 && d.positiveCount === 0) return "#e17055";
        if (d.positiveCount > 0 && d.negativeCount > 0) return "#f39c12";
        return "#00b894";
      })
      .attr("stroke-width", (d) => {
        const total = d.positiveCount + d.negativeCount;
        if (d.isMutual) return Math.min(total * 1.2 + 2.5, 6);
        return Math.min(total * 0.8 + 1.5, 4.5);
      })
      .attr("stroke-dasharray", (d) => {
        if (d.negativeCount > 0 && d.positiveCount === 0) return "8 5";
        return "none";
      })
      .attr("marker-end", (d) => {
        if (d.isMutual) return "url(#arrow-mutual)";
        if (d.negativeCount > 0 && d.positiveCount === 0) return "url(#arrow-negative)";
        return "url(#arrow-positive)";
      })
      .attr("opacity", 0.7)
      .attr("filter", (d) => d.isMutual ? "url(#edge-glow)" : null)
      .attr("stroke-linecap", "round");

    /* Edge count labels */
    const edgeLabel = linkGroup.append("text")
      .attr("class", "sociogram-edge-label")
      .attr("text-anchor", "middle")
      .attr("dy", -6)
      .attr("font-size", 10)
      .attr("font-weight", 700)
      .attr("fill", (d) => {
        if (d.isMutual) return "#e65100";
        if (d.negativeCount > 0 && d.positiveCount === 0) return "#a4462d";
        return "#007d65";
      })
      .attr("opacity", 0)
      .text((d) => {
        const total = d.positiveCount + d.negativeCount;
        if (total <= 1) return "";
        return total;
      });

    /* Node groups */
    const node = nodeLayer
      .selectAll("g.node-group")
      .data(nodes)
      .join("g")
      .attr("class", "node-group")
      .style("cursor", typeof options.onSelectStudent === "function" ? "pointer" : "grab");

    /* Hover interaction */
    node
      .on("mouseenter", (_event, hovered) => {
        const relatedIds = connectedMap.get(hovered.id) || new Set();

        node.transition().duration(200)
          .style("opacity", (d) => (d.id === hovered.id || relatedIds.has(d.id) ? 1 : 0.15));

        linkGroup.each(function(d) {
          const isRelated =
            d.source === hovered.id || d.target === hovered.id ||
            (typeof d.source === "object" && d.source.id === hovered.id) ||
            (typeof d.target === "object" && d.target.id === hovered.id);

          d3.select(this).select(".sociogram-link")
            .transition().duration(200)
            .attr("opacity", isRelated ? 1 : 0.06)
            .attr("stroke-width", function() {
              const total = d.positiveCount + d.negativeCount;
              const base = d.isMutual ? Math.min(total * 1.2 + 2.5, 6) : Math.min(total * 0.8 + 1.5, 4.5);
              return isRelated ? base * 1.4 : base;
            });

          d3.select(this).select(".sociogram-link-glow")
            .transition().duration(200)
            .attr("opacity", isRelated ? 0.7 : 0);

          d3.select(this).select(".sociogram-edge-label")
            .transition().duration(200)
            .attr("opacity", isRelated ? 1 : 0);
        });

        /* Pulse the hovered node */
        d3.select(_event.currentTarget).select(".node-halo")
          .transition().duration(300)
          .attr("r", hovered.radius + 14)
          .attr("fill-opacity", 0.35);
      })
      .on("mouseleave", () => {
        node.transition().duration(300).style("opacity", 1);

        linkGroup.each(function(d) {
          const total = d.positiveCount + d.negativeCount;
          const base = d.isMutual ? Math.min(total * 1.2 + 2.5, 6) : Math.min(total * 0.8 + 1.5, 4.5);
          d3.select(this).select(".sociogram-link").transition().duration(300).attr("opacity", 0.7).attr("stroke-width", base);
          d3.select(this).select(".sociogram-link-glow").transition().duration(300).attr("opacity", 0);
          d3.select(this).select(".sociogram-edge-label").transition().duration(300).attr("opacity", 0);
        });

        node.select(".node-halo")
          .transition().duration(300)
          .attr("r", (d) => d.radius + 8)
          .attr("fill-opacity", 0.2);
      })
      .call(d3.drag()
        .on("start", (event, d) => {
          if (!event.active) activeSimulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) activeSimulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }));

    if (typeof options.onSelectStudent === "function") {
      node.on("click", (event, d) => {
        if (event.defaultPrevented) return;
        options.onSelectStudent(d.id);
      });
    }

    /* Shadow under node */
    node.append("circle")
      .attr("class", "node-shadow")
      .attr("r", (d) => d.radius + 2)
      .attr("fill", "rgba(31, 36, 51, 0.1)")
      .attr("cx", 3)
      .attr("cy", 4);

    /* Halo ring */
    node.append("circle")
      .attr("class", "node-halo")
      .attr("r", (d) => d.radius + 8)
      .attr("fill", (d) => d.halo)
      .attr("fill-opacity", 0.2)
      .attr("stroke", (d) => d.glow)
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.3);

    /* Main circle with gradient */
    node.append("circle")
      .attr("class", "node-circle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => {
        const hasVisibleLinks = visibleNodeIds.has(d.id);
        if (!filteredEdges.length) return `url(#${d.gradId})`;
        return hasVisibleLinks ? `url(#${d.gradId})` : "#d5dae6";
      })
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 3.5)
      .attr("filter", "drop-shadow(0 6px 12px rgba(31,36,51,0.18))");

    /* Inner highlight for 3D effect */
    node.append("circle")
      .attr("class", "node-highlight")
      .attr("r", (d) => d.radius * 0.55)
      .attr("cx", (d) => -d.radius * 0.15)
      .attr("cy", (d) => -d.radius * 0.2)
      .attr("fill", "rgba(255, 255, 255, 0.2)")
      .attr("pointer-events", "none");

    /* Full name text inside node */
    node.append("text")
      .attr("class", "node-name-inner")
      .text((d) => d.name)
      .attr("text-anchor", "middle")
      .attr("dy", 2)
      .attr("font-size", (d) => {
        const nameLen = d.name.length;
        if (nameLen <= 2) return Math.max(d.radius * 0.6, 13);
        if (nameLen === 3) return Math.max(d.radius * 0.48, 12);
        return Math.max(d.radius * 0.38, 11);
      })
      .attr("font-weight", 800)
      .attr("fill", "#ffffff")
      .attr("pointer-events", "none")
      .style("text-shadow", "0 1px 3px rgba(0,0,0,0.3)");

    /* Status badge above node — only for non-"일반" status */
    const statusLabel = node.filter((d) => d.shortLabel !== "일반")
      .append("g")
      .attr("class", "sociogram-label")
      .attr("transform", (d) => `translate(0, ${-(d.radius + 14)})`);

    /* Connector line */
    statusLabel.append("line")
      .attr("x1", 0)
      .attr("y1", (d) => d.radius + 2)
      .attr("x2", 0)
      .attr("y2", 6)
      .attr("stroke", "rgba(31,36,51,0.12)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2 2");

    /* Status text only (no name) */
    statusLabel.append("text")
      .text((d) => d.shortLabel)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("font-weight", 700)
      .attr("fill", (d) => d.fillStart)
      .attr("dy", 4);

    /* Background pill for the status label */
    statusLabel.each(function bindLabelBox() {
      const group = d3.select(this);
      const text = group.select("text").node();
      if (!text) return;
      const bbox = text.getBBox();
      group.insert("rect", "text")
        .attr("x", bbox.x - 8)
        .attr("y", bbox.y - 4)
        .attr("width", bbox.width + 16)
        .attr("height", bbox.height + 8)
        .attr("rx", 8)
        .attr("fill", "rgba(255,255,255,0.94)")
        .attr("stroke", (d) => d.glow)
        .attr("stroke-width", 1)
        .attr("filter", "drop-shadow(0 2px 4px rgba(31,36,51,0.06))");
    });

    /* Tooltip */
    node.append("title")
      .text((d) => `${d.name}\n${d.shortLabel}\n긍정 ${analysis.metrics[d.id].positiveReceived} / 부정 ${analysis.metrics[d.id].negativeReceived} / 상호 ${analysis.metrics[d.id].mutuals.size}`);

    if (!filteredEdges.length) {
      svg.append("text")
        .attr("x", width / 2)
        .attr("y", 40)
        .attr("text-anchor", "middle")
        .attr("font-size", 14)
        .attr("font-weight", 700)
        .attr("fill", "#616b86")
        .text("현재 필터에는 관계선이 없지만 학생 노드는 유지됩니다.");
    }

    /* Curved path generator */
    function buildCurvedPath(d) {
      const sx = typeof d.source === "object" ? d.source.x : nodes.find(n => n.id === d.source)?.x || 0;
      const sy = typeof d.source === "object" ? d.source.y : nodes.find(n => n.id === d.source)?.y || 0;
      const tx = typeof d.target === "object" ? d.target.x : nodes.find(n => n.id === d.target)?.x || 0;
      const ty = typeof d.target === "object" ? d.target.y : nodes.find(n => n.id === d.target)?.y || 0;

      const dx = tx - sx;
      const dy = ty - sy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      /* Target node radius for arrow positioning */
      const tNode = nodes.find(n => n.id === (typeof d.target === "object" ? d.target.id : d.target));
      const tRadius = tNode ? tNode.radius + 8 : 30;

      /* Shorten line to stop at node edge */
      const ratio = Math.max(0, (dist - tRadius) / dist);
      const endX = sx + dx * ratio;
      const endY = sy + dy * ratio;

      /* Curve amount — more for mutual links */
      const curvature = d.isMutual ? 0.15 : 0.08;
      const mx = (sx + endX) / 2 - dy * curvature;
      const my = (sy + endY) / 2 + dx * curvature;

      return `M${sx},${sy} Q${mx},${my} ${endX},${endY}`;
    }

    function buildEdgeLabelPos(d) {
      const sx = typeof d.source === "object" ? d.source.x : nodes.find(n => n.id === d.source)?.x || 0;
      const sy = typeof d.source === "object" ? d.source.y : nodes.find(n => n.id === d.source)?.y || 0;
      const tx = typeof d.target === "object" ? d.target.x : nodes.find(n => n.id === d.target)?.x || 0;
      const ty = typeof d.target === "object" ? d.target.y : nodes.find(n => n.id === d.target)?.y || 0;
      const dx = tx - sx;
      const dy = ty - sy;
      const curvature = d.isMutual ? 0.15 : 0.08;
      return {
        x: (sx + tx) / 2 - dy * curvature,
        y: (sy + ty) / 2 + dx * curvature
      };
    }

    /* Tick */
    activeSimulation.on("tick", () => {
      linkGroup.select(".sociogram-link")
        .attr("d", buildCurvedPath);
      linkGroup.select(".sociogram-link-glow")
        .attr("d", buildCurvedPath);
      edgeLabel
        .attr("x", (d) => buildEdgeLabelPos(d).x)
        .attr("y", (d) => buildEdgeLabelPos(d).y);

      node.attr("transform", (d) => {
        layoutCache.set(d.id, { x: d.x, y: d.y });
        return `translate(${d.x},${d.y})`;
      });
    });

    /* Intro animation: fade-in nodes */
    node.style("opacity", 0)
      .transition()
      .delay((d, i) => i * 60)
      .duration(500)
      .style("opacity", 1);

    linkGroup.style("opacity", 0)
      .transition()
      .delay(400)
      .duration(600)
      .style("opacity", 1);
  }

  /* ───── Ego (personal) sociogram for student profile ───── */
  let egoSimulation = null;

  function renderEgoSociogram(container, students, analysis, focusStudentId, filters) {
    container.innerHTML = "";
    if (egoSimulation) {
      egoSimulation.stop();
      egoSimulation = null;
    }

    const egoFilters = filters || { questionId: "all", showPositive: true, showNegative: true };

    if (!analysis.edges.length) {
      container.innerHTML = '<div class="empty-state">응답이 쌓이면 개인 관계망이 여기에 표시됩니다.</div>';
      return;
    }

    const focusMetric = analysis.metrics[focusStudentId];
    if (!focusMetric) return;

    /* Filter edges: connected to focus student + question/type filters */
    const egoEdges = analysis.edges.filter((edge) => {
      if (Number(edge.source) !== focusStudentId && Number(edge.target) !== focusStudentId) return false;
      if (egoFilters.questionId !== "all" && edge.questionId !== egoFilters.questionId) return false;
      if (edge.type === "positive" && !egoFilters.showPositive) return false;
      if (edge.type === "negative" && !egoFilters.showNegative) return false;
      return true;
    });

    if (!egoEdges.length) {
      container.innerHTML = '<div class="empty-state">현재 필터 조건에 해당하는 관계가 없습니다.</div>';
      return;
    }

    /* Connected student IDs */
    const connectedIds = new Set();
    connectedIds.add(focusStudentId);
    egoEdges.forEach((edge) => {
      connectedIds.add(Number(edge.source));
      connectedIds.add(Number(edge.target));
    });

    const egoStudents = students.filter((s) => connectedIds.has(s.id));

    const width = container.clientWidth || 700;
    const height = 460;

    const svg = d3.select(container).append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", height)
      .style("border-radius", "20px")
      .style("overflow", "hidden");

    const defs = svg.append("defs");

    /* Background */
    const bgGrad = defs.append("radialGradient")
      .attr("id", "ego-bg-grad")
      .attr("cx", "50%").attr("cy", "50%").attr("r", "60%");
    bgGrad.append("stop").attr("offset", "0%").attr("stop-color", "rgba(108, 92, 231, 0.05)");
    bgGrad.append("stop").attr("offset", "100%").attr("stop-color", "rgba(255, 255, 255, 0.6)");

    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("rx", 20)
      .attr("fill", "url(#ego-bg-grad)");

    /* Arrow markers */
    [
      ["ego-positive", "#00b894"],
      ["ego-negative", "#e17055"],
      ["ego-mutual", "#f9a825"]
    ].forEach(([id, color]) => {
      defs.append("marker")
        .attr("id", id)
        .attr("viewBox", "0 -6 12 12")
        .attr("refX", 10).attr("refY", 0)
        .attr("markerWidth", 7).attr("markerHeight", 7)
        .attr("orient", "auto")
        .append("path")
        .attr("fill", color)
        .attr("d", "M0,-5L10,0L0,5Z");
    });

    /* Focus student visual */
    const focusVisual = nodeVisual(focusMetric, analysis);

    /* Node gradient for focus student */
    const focusGradId = "ego-focus-grad";
    const focusGrad = defs.append("radialGradient").attr("id", focusGradId).attr("cx", "35%").attr("cy", "35%").attr("r", "65%");
    focusGrad.append("stop").attr("offset", "0%").attr("stop-color", focusVisual.fillStart);
    focusGrad.append("stop").attr("offset", "100%").attr("stop-color", focusVisual.fillEnd);

    /* Build nodes */
    const nodes = egoStudents.map((student, index) => {
      const isFocus = student.id === focusStudentId;
      const r = isFocus ? focusVisual.radius : 22;
      const angle = (Math.PI * 2 * index) / Math.max(egoStudents.length, 1) - Math.PI / 2;
      const orbitR = Math.min(width, height) * 0.30;
      return {
        ...student,
        x: isFocus ? width / 2 : width / 2 + Math.cos(angle) * orbitR,
        y: isFocus ? height / 2 : height / 2 + Math.sin(angle) * orbitR,
        radius: r,
        isFocus
      };
    });

    /* Aggregate edges */
    const mutualSets = new Map();
    students.forEach(s => mutualSets.set(s.id, analysis.metrics[s.id].mutuals));
    const aggEdges = aggregateEdges(egoEdges, mutualSets);

    const zoomLayer = svg.append("g");
    const edgeLayer = zoomLayer.append("g");
    const nodeLayer = zoomLayer.append("g");

    svg.call(
      d3.zoom()
        .scaleExtent([0.6, 2])
        .on("zoom", (event) => zoomLayer.attr("transform", event.transform))
    );

    const simEdges = egoEdges.map(e => ({ ...e }));

    egoSimulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(simEdges).id(d => d.id).distance(130).strength(0.3))
      .force("charge", d3.forceManyBody().strength(-600))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(d => d.radius + 24));

    /* Edge paths */
    const linkGroup = edgeLayer.selectAll("g.ego-link")
      .data(aggEdges)
      .join("g")
      .attr("class", "ego-link");

    linkGroup.append("path")
      .attr("fill", "none")
      .attr("stroke", d => {
        if (d.isMutual) return "#f9a825";
        if (d.negativeCount > 0 && d.positiveCount === 0) return "#e17055";
        return "#00b894";
      })
      .attr("stroke-width", d => {
        const total = d.positiveCount + d.negativeCount;
        return d.isMutual ? Math.min(total * 1.2 + 2.5, 5.5) : Math.min(total * 0.8 + 1.5, 4);
      })
      .attr("stroke-dasharray", d => (d.negativeCount > 0 && d.positiveCount === 0) ? "7 5" : "none")
      .attr("marker-end", d => {
        if (d.isMutual) return "url(#ego-mutual)";
        if (d.negativeCount > 0 && d.positiveCount === 0) return "url(#ego-negative)";
        return "url(#ego-positive)";
      })
      .attr("opacity", 0.75)
      .attr("stroke-linecap", "round");

    /* Node groups */
    const node = nodeLayer.selectAll("g.ego-node")
      .data(nodes)
      .join("g")
      .attr("class", "ego-node")
      .style("cursor", "grab")
      .call(d3.drag()
        .on("start", (event, d) => {
          if (!event.active) egoSimulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event, d) => {
          if (!event.active) egoSimulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        }));

    /* Halo for focus node */
    node.filter(d => d.isFocus).append("circle")
      .attr("r", d => d.radius + 10)
      .attr("fill", focusVisual.halo)
      .attr("fill-opacity", 0.25)
      .attr("stroke", focusVisual.glow)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.4);

    /* Main circle */
    node.append("circle")
      .attr("r", d => d.radius)
      .attr("fill", d => d.isFocus ? `url(#${focusGradId})` : "#c9d1e8")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", d => d.isFocus ? 3.5 : 2.5)
      .attr("filter", d => d.isFocus ? "drop-shadow(0 6px 12px rgba(31,36,51,0.18))" : "drop-shadow(0 3px 6px rgba(31,36,51,0.1))");

    /* 3D highlight for focus */
    node.filter(d => d.isFocus).append("circle")
      .attr("r", d => d.radius * 0.5)
      .attr("cx", d => -d.radius * 0.15)
      .attr("cy", d => -d.radius * 0.2)
      .attr("fill", "rgba(255,255,255,0.18)")
      .attr("pointer-events", "none");

    /* Name text inside all nodes */
    node.append("text")
      .text(d => d.name)
      .attr("text-anchor", "middle")
      .attr("dy", 2)
      .attr("font-size", d => {
        const len = d.name.length;
        if (d.isFocus) {
          if (len <= 2) return Math.max(d.radius * 0.55, 13);
          if (len === 3) return Math.max(d.radius * 0.44, 12);
          return Math.max(d.radius * 0.36, 11);
        }
        return len <= 2 ? 11 : len === 3 ? 10 : 9;
      })
      .attr("font-weight", d => d.isFocus ? 800 : 700)
      .attr("fill", d => d.isFocus ? "#ffffff" : "#4a5068")
      .attr("pointer-events", "none")
      .style("text-shadow", d => d.isFocus ? "0 1px 3px rgba(0,0,0,0.3)" : "none");

    /* Status label — ONLY for focus student */
    const focusNode = node.filter(d => d.isFocus);
    const statusG = focusNode.append("g")
      .attr("class", "ego-status-label")
      .attr("transform", d => `translate(0, ${-(d.radius + 12)})`);

    statusG.append("text")
      .text(focusVisual.shortLabel)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("font-weight", 700)
      .attr("fill", focusVisual.fillStart)
      .attr("dy", 4);

    statusG.each(function() {
      const g = d3.select(this);
      const t = g.select("text").node();
      if (!t) return;
      const bb = t.getBBox();
      g.insert("rect", "text")
        .attr("x", bb.x - 7)
        .attr("y", bb.y - 3)
        .attr("width", bb.width + 14)
        .attr("height", bb.height + 6)
        .attr("rx", 7)
        .attr("fill", "rgba(255,255,255,0.94)")
        .attr("stroke", focusVisual.glow)
        .attr("stroke-width", 1);
    });

    /* Tooltip */
    node.append("title")
      .text(d => d.isFocus
        ? `${d.name}\n${focusVisual.shortLabel}\n긍정 ${focusMetric.positiveReceived} / 부정 ${focusMetric.negativeReceived} / 상호 ${focusMetric.mutuals.size}`
        : d.name
      );

    /* Curved path */
    function buildEgoCurve(d) {
      const sx = typeof d.source === "object" ? d.source.x : nodes.find(n => n.id === d.source)?.x || 0;
      const sy = typeof d.source === "object" ? d.source.y : nodes.find(n => n.id === d.source)?.y || 0;
      const tx = typeof d.target === "object" ? d.target.x : nodes.find(n => n.id === d.target)?.x || 0;
      const ty = typeof d.target === "object" ? d.target.y : nodes.find(n => n.id === d.target)?.y || 0;
      const dx = tx - sx, dy = ty - sy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const tNode = nodes.find(n => n.id === (typeof d.target === "object" ? d.target.id : d.target));
      const tR = tNode ? tNode.radius + 6 : 24;
      const ratio = Math.max(0, (dist - tR) / dist);
      const ex = sx + dx * ratio, ey = sy + dy * ratio;
      const curv = d.isMutual ? 0.12 : 0.06;
      const mx = (sx + ex) / 2 - dy * curv, my = (sy + ey) / 2 + dx * curv;
      return `M${sx},${sy} Q${mx},${my} ${ex},${ey}`;
    }

    egoSimulation.on("tick", () => {
      linkGroup.select("path").attr("d", buildEgoCurve);
      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    /* Intro animation */
    node.style("opacity", 0).transition().delay((d, i) => i * 50).duration(400).style("opacity", 1);
    linkGroup.style("opacity", 0).transition().delay(300).duration(500).style("opacity", 1);
  }

  window.Sociogram = { renderSociogram, renderEgoSociogram };
})();
