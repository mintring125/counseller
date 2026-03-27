(function sociogramModule() {
  const layoutCache = new Map();
  let activeSimulation = null;

  function initialPosition(index, total, width, height) {
    const angle = (Math.PI * 2 * index) / Math.max(total, 1);
    const radius = Math.min(width, height) * 0.34;
    return {
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius
    };
  }

  function edgeKey(sourceId, targetId) {
    return `${sourceId}-${targetId}`;
  }

  function nodeVisual(metric, analysis) {
    const { thresholds } = analysis;
    const attentionScore = metric.positiveReceived + metric.negativeReceived + metric.mutuals.size;
    const radius = 22 + Math.min(attentionScore * 1.8, 18);

    if (metric.negativeReceived >= thresholds.negativeTop && metric.positiveReceived <= thresholds.positiveUpperHalf) {
      return {
        radius,
        fill: "#e17055",
        halo: "rgba(225, 112, 85, 0.18)",
        shortLabel: "갈등 주의"
      };
    }

    if (metric.positiveReceived >= thresholds.positiveTop && metric.mutuals.size >= 2) {
      return {
        radius,
        fill: "#00b894",
        halo: "rgba(0, 184, 148, 0.18)",
        shortLabel: "긍정 중심"
      };
    }

    if (metric.positiveReceived >= thresholds.positiveUpperHalf && metric.negativeReceived >= thresholds.negativeUpperHalf) {
      return {
        radius,
        fill: "#f39c12",
        halo: "rgba(243, 156, 18, 0.18)",
        shortLabel: "양가형"
      };
    }

    if (metric.positiveReceived <= thresholds.positiveBottom && metric.negativeReceived <= thresholds.negativeBottom) {
      return {
        radius,
        fill: "#8d99ae",
        halo: "rgba(141, 153, 174, 0.18)",
        shortLabel: "연결 적음"
      };
    }

    return {
      radius,
      fill: "#6c5ce7",
      halo: "rgba(108, 92, 231, 0.18)",
      shortLabel: "일반"
    };
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

    container.insertAdjacentHTML("beforeend", `
      <div class="sociogram-legend-board">
        <span class="sociogram-legend-title">원 의미</span>
        <div class="sociogram-legend-row">
          <span class="sociogram-legend-chip"><span class="legend-dot positive"></span>긍정 중심</span>
          <span class="sociogram-legend-chip"><span class="legend-dot mixed"></span>일반/양가형</span>
          <span class="sociogram-legend-chip"><span class="legend-dot warn"></span>갈등 주의</span>
          <span class="sociogram-legend-chip"><span class="legend-dot low"></span>연결 적음</span>
        </div>
        <p class="sociogram-legend-note">크기: 전체 주목도(긍정 지명 + 부정 지명 + 상호 선택) / 색: 관계 상태</p>
      </div>
    `);

    const width = container.clientWidth || 900;
    const height = 620;
    const svg = d3.select(container).append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", height);

    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("rx", 24)
      .attr("fill", "rgba(255,255,255,0.55)");

    const zoomLayer = svg.append("g");
    const edgeLayer = zoomLayer.append("g");
    const nodeLayer = zoomLayer.append("g");

    svg.call(
      d3.zoom()
        .scaleExtent([0.75, 1.85])
        .on("zoom", (event) => {
          zoomLayer.attr("transform", event.transform);
        })
    );

    const nodes = students.map((student, index) => {
      const cached = layoutCache.get(student.id) || initialPosition(index, students.length, width, height);
      const visual = nodeVisual(analysis.metrics[student.id], analysis);
      return {
        ...student,
        x: cached.x,
        y: cached.y,
        radius: visual.radius,
        fill: visual.fill,
        halo: visual.halo,
        shortLabel: visual.shortLabel
      };
    });

    const simulationEdges = analysis.edges.map((edge) => ({ ...edge }));
    const visibleEdges = filteredEdges.map((edge) => ({ ...edge }));
    const visibleNodeIds = new Set(visibleEdges.flatMap((edge) => [Number(edge.source), Number(edge.target)]));
    const connectedMap = new Map(students.map((student) => [student.id, new Set()]));

    visibleEdges.forEach((edge) => {
      connectedMap.get(Number(edge.source))?.add(Number(edge.target));
      connectedMap.get(Number(edge.target))?.add(Number(edge.source));
    });

    const defs = svg.append("defs");
    [["positive", "#00b894"], ["negative", "#e17055"]].forEach(([type, color]) => {
      defs.append("marker")
        .attr("id", `arrow-${type}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 22)
        .attr("refY", 0)
        .attr("markerWidth", 7)
        .attr("markerHeight", 7)
        .attr("orient", "auto")
        .append("path")
        .attr("fill", color)
        .attr("d", "M0,-5L10,0L0,5");
    });

    activeSimulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(simulationEdges).id((d) => d.id).distance(150).strength(0.28))
      .force("charge", d3.forceManyBody().strength(-760))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d) => d.radius + 28));

    const link = edgeLayer
      .selectAll("line")
      .data(visibleEdges)
      .join("line")
      .attr("class", "sociogram-link")
      .attr("stroke", (d) => (d.type === "positive" ? "#00b894" : "#e17055"))
      .attr("stroke-width", (d) => (d.type === "positive" ? 2.3 : 2))
      .attr("stroke-dasharray", (d) => (d.type === "negative" ? "7 7" : "0"))
      .attr("marker-end", (d) => `url(#arrow-${d.type})`)
      .attr("opacity", 0.38);

    const node = nodeLayer
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", "sociogram-node")
      .style("cursor", typeof options.onSelectStudent === "function" ? "pointer" : "grab")
      .on("mouseenter", (_event, hovered) => {
        const relatedIds = connectedMap.get(hovered.id) || new Set();

        node.style("opacity", (d) => (d.id === hovered.id || relatedIds.has(d.id) ? 1 : 0.28));
        link.attr("opacity", (d) => (
          Number(d.source.id) === hovered.id
          || Number(d.target.id) === hovered.id
          || (relatedIds.has(Number(d.source.id)) && Number(d.target.id) === hovered.id)
          || (relatedIds.has(Number(d.target.id)) && Number(d.source.id) === hovered.id)
            ? 0.92
            : 0.08
        ));
      })
      .on("mouseleave", () => {
        node.style("opacity", 1);
        link.attr("opacity", 0.38);
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

    node.append("circle")
      .attr("r", (d) => d.radius + 6)
      .attr("fill", (d) => d.halo);

    node.append("circle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => {
        const hasVisibleLinks = visibleNodeIds.has(d.id);
        if (!visibleEdges.length) return d.fill;
        return hasVisibleLinks ? d.fill : "#c9d1e8";
      })
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 5)
      .attr("filter", "drop-shadow(0 10px 16px rgba(31,36,51,0.14))");

    node.append("text")
      .text((d) => d.name.slice(0, 1))
      .attr("text-anchor", "middle")
      .attr("dy", 5)
      .attr("font-size", 16)
      .attr("font-weight", 800)
      .attr("fill", "#ffffff");

    const label = node.append("g")
      .attr("class", "sociogram-label")
      .attr("transform", (d) => `translate(0, ${d.radius + 14})`);

    label.append("text")
      .text((d) => d.name)
      .attr("text-anchor", "middle")
      .attr("font-size", 12)
      .attr("font-weight", 700)
      .attr("fill", "#1f2433")
      .attr("dy", 4);

    label.each(function bindLabelBox() {
      const group = d3.select(this);
      const text = group.select("text").node();
      if (!text) return;
      const bbox = text.getBBox();
      group.insert("rect", "text")
        .attr("x", bbox.x - 10)
        .attr("y", bbox.y - 6)
        .attr("width", bbox.width + 20)
        .attr("height", bbox.height + 12)
        .attr("rx", 12)
        .attr("fill", "rgba(255,255,255,0.92)")
        .attr("stroke", "rgba(108,92,231,0.14)");
    });

    node.append("title")
      .text((d) => `${d.name}\n${d.shortLabel}\n긍정 ${analysis.metrics[d.id].positiveReceived} / 부정 ${analysis.metrics[d.id].negativeReceived} / 상호 ${analysis.metrics[d.id].mutuals.size}`);

    if (!visibleEdges.length) {
      svg.append("text")
        .attr("x", width / 2)
        .attr("y", 40)
        .attr("text-anchor", "middle")
        .attr("font-size", 14)
        .attr("font-weight", 700)
        .attr("fill", "#616b86")
        .text("현재 필터에는 관계선이 없지만 학생 노드는 유지됩니다.");
    }

    activeSimulation.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      node.attr("transform", (d) => {
        layoutCache.set(d.id, { x: d.x, y: d.y });
        return `translate(${d.x},${d.y})`;
      });
    });
  }

  window.Sociogram = { renderSociogram };
})();
