(function chartsModule() {
  let distributionChart;
  let climateChart;

  function destroyChart(instance) {
    if (instance) instance.destroy();
  }

  function renderDistribution(canvas, students, analysis) {
    destroyChart(distributionChart);
    distributionChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: students.map((student) => student.name),
        datasets: [
          { label: "긍정 지명", data: students.map((student) => analysis.metrics[student.id].positiveReceived), backgroundColor: "#00b894" },
          { label: "부정 지명", data: students.map((student) => analysis.metrics[student.id].negativeReceived), backgroundColor: "#e17055" }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }

  function renderClimate(canvas, checkQuestions, analysis) {
    destroyChart(climateChart);
    climateChart = new Chart(canvas, {
      type: "radar",
      data: {
        labels: checkQuestions.map((question) => question.id.toUpperCase()),
        datasets: [{ label: "학급 평균", data: checkQuestions.map((question) => analysis.climateAverages[question.id]), borderColor: "#6c5ce7", backgroundColor: "rgba(108, 92, 231, 0.18)" }]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { r: { min: 0, max: 5, ticks: { stepSize: 1 } } } }
    });
  }

  function renderMatrix(container, students, analysis) {
    const head = students.map((student) => `<th>${student.name}</th>`).join("");
    const rows = students.map((source) => {
      const cells = students.map((target) => {
        const value = analysis.matrix[source.id][target.id];
        const color =
          value > 0 ? `rgba(0,184,148,${Math.min(0.15 + value * 0.14, 0.75)})` :
          value < 0 ? `rgba(225,112,85,${Math.min(0.15 + Math.abs(value) * 0.18, 0.75)})` :
          "rgba(108,92,231,0.04)";
        return `<td style="background:${color}">${value === 0 ? "" : value}</td>`;
      }).join("");
      return `<tr><th>${source.name}</th>${cells}</tr>`;
    }).join("");
    container.innerHTML = `<table class="matrix-table"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  function renderProfiles(container, students, analysis, responses) {
    const responseMap = Object.fromEntries(responses.map((item) => [item.respondentId, item]));
    container.innerHTML = students.map((student) => {
      const metric = analysis.metrics[student.id];
      const mutuals = [...metric.mutuals].map((id) => students.find((item) => item.id === id)?.name).filter(Boolean).join(", ") || "없음";
      const tags = metric.profileTags.length ? metric.profileTags.map((tag) => `<span class="pill">${tag}</span>`).join("") : '<span class="pill">분류 없음</span>';
      return `
        <article class="profile-card">
          <div class="panel-title-row">
            <div>
              <h3>${student.name}</h3>
              <p class="muted">${student.gender} / ${metric.type}</p>
            </div>
            <span class="pill ${metric.needsAttention ? "alert" : "good"}">${metric.needsAttention ? "관심 필요" : "안정"}</span>
          </div>
          <div class="profile-tags">${tags}</div>
          <p>긍정 지명 <strong>${metric.positiveReceived}</strong> / 부정 지명 <strong>${metric.negativeReceived}</strong></p>
          <p>상호 선택 친구: <strong>${mutuals}</strong></p>
          <p>체크 문항 평균: <strong>${metric.checkAverage ? metric.checkAverage.toFixed(1) : "-"}</strong></p>
          <p class="muted">응답 여부: ${responseMap[student.id] ? "완료" : "미응답"}</p>
        </article>
      `;
    }).join("");
  }

  function renderAttention(container, students, analysis) {
    const items = students.filter((student) => analysis.metrics[student.id].needsAttention);
    if (!items.length) {
      container.innerHTML = '<span class="pill good">현재 기준으로 별도 경고 학생이 없습니다.</span>';
      return;
    }
    container.innerHTML = items.map((student) => {
      const metric = analysis.metrics[student.id];
      return `<span class="pill alert">${student.name} · 긍정 ${metric.positiveReceived} / 부정 ${metric.negativeReceived} / 상호 ${metric.mutuals.size}</span>`;
    }).join("");
  }

  window.DashboardCharts = { renderDistribution, renderClimate, renderMatrix, renderProfiles, renderAttention };
})();
