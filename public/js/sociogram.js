(function sociogramModule() {
  const layoutCache = new Map();
  let activeSimulation = null;

  function initialPosition(index, total, width, height) {
    const angle = (Math.PI * 2 * index) / Math.max(total, 1);
    const radius = Math.min(width, height) * 0.32;
    return {
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius
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

    const width = container.clientWidth || 900;
    const height = 560;
    const svg = d3.select(container).append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", height);

    const nodes = students.map((student, index) => {
      const cached = layoutCache.get(student.id) || initialPosition(index, students.length, width, height);
      return {
        ...student,
        x: cached.x,
        y: cached.y,
        radius: 18 + Math.min(analysis.metrics[student.id].positiveReceived * 2, 20)
      };
    });

    const simulationEdges = analysis.edges.map((edge) => ({ ...edge }));
    const visibleEdges = filteredEdges.map((edge) => ({ ...edge }));

    const defs = svg.append("defs");
    [["positive", "#00b894"], ["negative", "#e17055"]].forEach(([type, color]) => {
      defs.append("marker")
        .attr("id", `arrow-${type}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 18)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("fill", color)
        .attr("d", "M0,-5L10,0L0,5");
    });

    activeSimulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(simulationEdges).id((d) => d.id).distance(120).strength(0.32))
      .force("charge", d3.forceManyBody().strength(-520))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d) => d.radius + 10));

    const link = svg.append("g")
      .selectAll("line")
      .data(visibleEdges)
      .join("line")
      .attr("stroke", (d) => (d.type === "positive" ? "#00b894" : "#e17055"))
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", (d) => (d.type === "negative" ? "6 6" : "0"))
      .attr("marker-end", (d) => `url(#arrow-${d.type})`)
      .attr("opacity", 0.8);

    const node = svg.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", "sociogram-node")
      .style("cursor", typeof options.onSelectStudent === "function" ? "pointer" : "grab")
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
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => (d.gender === "남" ? "#74b9ff" : "#fd79a8"))
      .attr("stroke", "#fff")
      .attr("stroke-width", 4);

    node.append("text")
      .text((d) => d.name)
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .attr("font-size", 12)
      .attr("font-weight", 700)
      .attr("fill", "#1f2433");

    node.append("title")
      .text((d) => `${d.name}\n긍정 ${analysis.metrics[d.id].positiveReceived} / 부정 ${analysis.metrics[d.id].negativeReceived}`);

    if (!visibleEdges.length) {
      svg.append("text")
        .attr("x", width / 2)
        .attr("y", 36)
        .attr("text-anchor", "middle")
        .attr("font-size", 14)
        .attr("font-weight", 700)
        .attr("fill", "#616b86")
        .text("현재 필터에 맞는 관계선은 없지만 학생 위치는 유지됩니다.");
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
