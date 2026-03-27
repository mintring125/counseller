(function chartsModule() {
  const { nominationQuestions, checkQuestions } = window.APP_DATA;
  const climateLabelMap = {
    c1: "친한 친구",
    c2: "의지할 친구",
    c3: "반에서 편안함",
    c4: "친구들과 어울림"
  };
  const typeLabels = {
    Popular: "인기 많음",
    Rejected: "걱정 필요",
    Controversial: "반응이 갈림",
    Neglected: "관계가 적음",
    Average: "보통"
  };

  let distributionChart;
  let climateChart;
  let profileCheckChart;

  function destroyChart(instance) {
    if (instance) instance.destroy();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function studentLookup(students) {
    return Object.fromEntries(students.map((student) => [student.id, student]));
  }

  function climateLabel(question) {
    return climateLabelMap[question.id] || question.text;
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
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 900,
          easing: "easeOutQuart"
        },
        animations: {
          y: {
            from(context) {
              return context.chart?.scales?.y?.getPixelForValue(0) ?? 0;
            }
          }
        },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function renderClimate(canvas, checkItems, analysis) {
    destroyChart(climateChart);
    climateChart = new Chart(canvas, {
      type: "radar",
      data: {
        labels: checkItems.map((question) => climateLabel(question)),
        datasets: [{
          label: "학급 평균",
          data: checkItems.map((question) => analysis.climateAverages[question.id]),
          borderColor: "#6c5ce7",
          backgroundColor: "rgba(108, 92, 231, 0.18)"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { r: { min: 0, max: 5, ticks: { stepSize: 1 } } }
      }
    });
  }

  function renderMatrix(container, students, analysis) {
    const head = students.map((student) => `<th>${escapeHtml(student.name)}</th>`).join("");
    const rows = students.map((source) => {
      const cells = students.map((target) => {
        const value = analysis.matrix[source.id][target.id];
        const color =
          value > 0 ? `rgba(0,184,148,${Math.min(0.15 + value * 0.14, 0.75)})`
            : value < 0 ? `rgba(225,112,85,${Math.min(0.15 + Math.abs(value) * 0.18, 0.75)})`
              : "rgba(108,92,231,0.04)";
        return `<td style="background:${color}">${value === 0 ? "" : value}</td>`;
      }).join("");
      return `<tr><th>${escapeHtml(source.name)}</th>${cells}</tr>`;
    }).join("");
    container.innerHTML = `<table class="matrix-table"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  function collectPeerTotals(metric, students) {
    return students
      .filter((student) => student.id !== metric.student.id)
      .map((student) => {
        const peer = metric.peerStats[student.id];
        return {
          student,
          positiveSent: peer.positiveSent,
          positiveReceived: peer.positiveReceived,
          negativeSent: peer.negativeSent,
          negativeReceived: peer.negativeReceived,
          total:
            peer.positiveSent
            + peer.positiveReceived
            + peer.negativeSent
            + peer.negativeReceived
        };
      });
  }

  function renderPeerCards(items, emptyText, tone) {
    if (!items.length) {
      return `<div class="detail-empty">${escapeHtml(emptyText)}</div>`;
    }

    return `
      <div class="peer-card-list">
        ${items.map((item) => `
          <div class="peer-card ${tone}">
            <strong>${escapeHtml(item.student.name)}</strong>
            <span>${item.captionHtml || escapeHtml(item.caption)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderNamePills(ids, lookup, emptyText) {
    if (!ids.length) {
      return `<span class="mini-pill muted">${escapeHtml(emptyText)}</span>`;
    }

    return ids.map((id) => `
      <span class="mini-pill">${escapeHtml(lookup[id]?.name || `학생 ${id}`)}</span>
    `).join("");
  }

  function renderSignalChips(chips) {
    if (!chips.length) {
      return '<span class="signal-chip neutral">기본 프로필</span>';
    }

    return chips.map((chip) => `
      <span class="signal-chip ${chip.tone || "neutral"}">${escapeHtml(chip.label)}</span>
    `).join("");
  }

  function formatAverage(value) {
    return Number.isFinite(value) ? value.toFixed(1) : "-";
  }

  function deltaInfo(value, average, preferLow = false) {
    const delta = value - average;
    const abs = Math.abs(delta);
    const tone = abs < 0.15
      ? "neutral"
      : preferLow
        ? delta > 0 ? "warn" : "good"
        : delta > 0 ? "good" : "warn";

    const label = abs < 0.15
      ? "평균 수준"
      : `${delta > 0 ? "+" : "-"}${abs.toFixed(1)}`;

    return { tone, label };
  }

  function renderComparePills(value, average, preferLow = false) {
    const delta = deltaInfo(value, average, preferLow);
    return `
      <div class="compare-pill-row">
        <span class="compare-pill neutral">평균 ${formatAverage(average)}</span>
        <span class="compare-pill ${delta.tone}">${delta.label}</span>
      </div>
    `;
  }

  function renderCompareOrPending(value, average, preferLow, hasValue) {
    if (!hasValue) {
      return `
        <div class="compare-pill-row">
          <span class="compare-pill neutral">평균 ${formatAverage(average)}</span>
          <span class="compare-pill neutral">응답 없음</span>
        </div>
      `;
    }

    return renderComparePills(value, average, preferLow);
  }

  function buildKeywordChips(metric, analysis, directConnections) {
    const chips = [];
    const thresholds = analysis.thresholds;
    const peerValues = Object.values(metric.peerStats);
    const topPositiveTarget = Math.max(0, ...peerValues.map((peer) => peer.positiveSent));
    const focusRatio = metric.positiveSent ? topPositiveTarget / metric.positiveSent : 0;

    chips.push({ label: typeLabels[metric.type] || metric.type, tone: "neutral" });
    if (metric.positiveReceived >= thresholds.positiveTop) chips.push({ label: "긍정 중심", tone: "good" });
    if (metric.mutuals.size >= 2) chips.push({ label: `상호 선택 ${metric.mutuals.size}`, tone: "good" });
    if (metric.connectorScore >= 2) chips.push({ label: "브릿지", tone: "info" });
    if (metric.negativeReceived >= thresholds.negativeTop) chips.push({ label: "갈등 신호", tone: "warn" });
    if (metric.positiveReceived <= thresholds.positiveBottom) chips.push({ label: "고립 주의", tone: "warn" });
    if (focusRatio >= 0.5 && metric.positiveSent >= 3) chips.push({ label: "관계 집중", tone: "warn" });
    if (metric.checkAverage >= 4) chips.push({ label: "적응 안정", tone: "good" });
    if (metric.checkAverage > 0 && metric.checkAverage <= 2.5) chips.push({ label: "정서 확인", tone: "warn" });
    if (directConnections.length >= 5) chips.push({ label: "직접 연결 넓음", tone: "info" });
    if (metric.incomingTextMentions.length || metric.ownTextNote) chips.push({ label: "서술 메모 있음", tone: "neutral" });
    if (!metric.hasResponse) chips.push({ label: "미응답", tone: "warn" });

    return chips.slice(0, 8);
  }

  function buildSpotlightCards(metric, analysis, directConnections) {
    const thresholds = analysis.thresholds;
    const peerValues = Object.values(metric.peerStats);
    const topPositiveTarget = Math.max(0, ...peerValues.map((peer) => peer.positiveSent));
    const focusRatio = metric.positiveSent ? topPositiveTarget / metric.positiveSent : 0;

    let positionValue = typeLabels[metric.type] || metric.type;
    let positionMeta = `긍정 ${metric.positiveReceived} · 부정 ${metric.negativeReceived}`;
    if (metric.positiveReceived >= thresholds.positiveTop && metric.mutuals.size >= 2) {
      positionValue = "친구들이 많이 찾음";
    } else if (metric.negativeReceived >= thresholds.negativeTop) {
      positionValue = "걱정이 보임";
    } else if (metric.positiveReceived <= thresholds.positiveBottom) {
      positionValue = "관계가 적은 편";
    }

    let styleValue = "보통";
    let styleMeta = `직접 연결 ${directConnections.length}명`;
    if (metric.mutuals.size >= 2) {
      styleValue = "서로 친함";
      styleMeta = `상호 선택 ${metric.mutuals.size}명`;
    } else if (metric.connectorScore >= 2) {
      styleValue = "여러 친구와 어울림";
      styleMeta = "여러 친구를 잇는 흐름";
    } else if (focusRatio >= 0.5 && metric.positiveSent >= 3) {
      styleValue = "한 친구에게 집중";
      styleMeta = "선택이 특정 친구에 집중";
    } else if (directConnections.length <= 2) {
      styleValue = "관계가 적음";
      styleMeta = "직접 연결이 적은 편";
    }

    let counselingValue = "관찰 유지";
    let counselingMeta = "현재 흐름을 안정적으로 유지";
    if (metric.negativeReceived >= thresholds.negativeTop) {
      counselingValue = "갈등 완충";
      counselingMeta = "안전한 짝과 활동 조합 우선";
    } else if (focusRatio >= 0.5 && metric.positiveSent >= 3) {
      counselingValue = "관계 분산";
      counselingMeta = "특정 친구 의존 줄이기";
    } else if (metric.positiveReceived <= thresholds.positiveBottom) {
      counselingValue = "친구 연결 넓히기";
      counselingMeta = "작은 성공 관계 늘리기";
    } else if (metric.checkAverage > 0 && metric.checkAverage <= 2.5) {
      counselingValue = "정서 확인";
      counselingMeta = "요즘 불편함 먼저 듣기";
    }

    return [
      { label: "관계 위치", value: positionValue, meta: positionMeta, tone: "neutral" },
      { label: "연결 스타일", value: styleValue, meta: styleMeta, tone: "info" },
      { label: "상담 초점", value: counselingValue, meta: counselingMeta, tone: counselingValue === "관찰 유지" ? "good" : "warn" }
    ];
  }

  function renderQuestionRows(metric, lookup, analysis) {
    const reasonMap = Object.fromEntries(metric.reasonEntries.map((entry) => [entry.questionId, entry]));
    const rows = nominationQuestions
      .filter((question) => question.category !== "text")
      .map((question) => {
        const isPositive = question.category === "positive";
        const sentIds = isPositive ? metric.positiveSentByQuestion[question.id] : metric.negativeSentByQuestion[question.id];
        const receivedIds = isPositive ? metric.positiveReceivedByQuestion[question.id] : metric.negativeReceivedByQuestion[question.id];
        const reasonEntry = reasonMap[question.id];
        const questionBenchmark = analysis.benchmarks.nominationQuestions[question.id];

        if (!sentIds.length && !receivedIds.length && !reasonEntry) {
          return "";
        }

        const sentLabel = isPositive ? "이 학생이 선택한 친구" : "이 학생이 불편하다고 응답한 친구";
        const receivedLabel = isPositive ? "이 학생을 선택한 친구" : "이 학생을 불편하다고 응답한 친구";
        return `
          <article class="question-story ${isPositive ? "positive" : "negative"}">
            <div class="question-story-head">
              <span class="question-badge ${isPositive ? "positive" : "negative"}">${escapeHtml(question.id.toUpperCase())}</span>
              <div>
                <strong>${escapeHtml(question.text)}</strong>
                <p class="muted">${sentIds.length + receivedIds.length}개의 직접 연결이 잡혔습니다.</p>
              </div>
            </div>
            <div class="question-story-grid">
              <div class="question-story-block">
                <span class="story-label">${sentLabel}</span>
                ${renderComparePills(sentIds.length, questionBenchmark.sentAverage, isPositive ? false : true)}
                <div class="mini-pill-row">${renderNamePills(sentIds, lookup, "없음")}</div>
              </div>
              <div class="question-story-block">
                <span class="story-label">${receivedLabel}</span>
                ${renderComparePills(receivedIds.length, questionBenchmark.receivedAverage, isPositive ? false : true)}
                <div class="mini-pill-row">${renderNamePills(receivedIds, lookup, "없음")}</div>
              </div>
            </div>
            ${reasonEntry ? `<p class="question-reason">응답 메모: ${escapeHtml(reasonEntry.text)}</p>` : ""}
          </article>
        `;
      })
      .filter(Boolean)
      .join("");

    return rows || '<div class="detail-empty">직접 연결이 확인된 문항 정보가 아직 없습니다.</div>';
  }

  function renderNotes(metric, lookup) {
    const notes = [];

    if (metric.ownTextNote) {
      notes.push(`
        <article class="note-card">
          <span class="note-label">학생 본인 서술</span>
          <p>${escapeHtml(metric.ownTextNote)}</p>
        </article>
      `);
    }

    if (metric.incomingTextMentions.length) {
      notes.push(`
        <article class="note-card">
          <span class="note-label">다른 학생 메모에서 언급됨</span>
          <div class="note-stack">
            ${metric.incomingTextMentions.map((entry) => `
              <div class="note-item">
                <strong>${escapeHtml(lookup[entry.sourceId]?.name || `학생 ${entry.sourceId}`)}</strong>
                <p>${escapeHtml(entry.text)}</p>
              </div>
            `).join("")}
          </div>
        </article>
      `);
    }

    if (metric.reasonEntries.length) {
      notes.push(`
        <article class="note-card">
          <span class="note-label">선택 이유 메모</span>
          <div class="note-stack">
            ${metric.reasonEntries.slice(0, 6).map((entry) => `
              <div class="note-item">
                <strong>${escapeHtml(entry.questionId.toUpperCase())} · ${escapeHtml(entry.questionText)}</strong>
                <p>${escapeHtml(entry.text)}</p>
              </div>
            `).join("")}
          </div>
        </article>
      `);
    }

    return notes.join("") || '<div class="detail-empty">저장된 서술 메모가 없습니다.</div>';
  }

  function renderProfileCheckChart(canvas, metric, analysis) {
    destroyChart(profileCheckChart);
    profileCheckChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: checkQuestions.map((question) => question.text),
        datasets: [
          {
            label: `${metric.student.name} 점수`,
            data: checkQuestions.map((question) => metric.checkScores[question.id] || 0),
            backgroundColor: "#6c5ce7",
            borderRadius: 10
          },
          {
            label: "학급 평균",
            data: checkQuestions.map((question) => analysis.climateAverages[question.id] || 0),
            backgroundColor: "rgba(0, 206, 201, 0.72)",
            borderRadius: 10
          }
        ]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: {
            min: 0,
            max: 5,
            ticks: { stepSize: 1 }
          }
        }
      }
    });
  }

  function renderDetail(metric, analysis, students, responses, focusMode) {
    const lookup = studentLookup(students);
    const responseMap = Object.fromEntries(responses.map((item) => [item.respondentId, item]));
    const peerTotals = collectPeerTotals(metric, students);
    const directConnections = peerTotals
      .filter((item) => item.total > 0 || metric.relatedStudents.has(item.student.id))
      .sort((a, b) => b.total - a.total || a.student.name.localeCompare(b.student.name))
      .map((item) => {
        const captionParts = [];
        if (item.positiveReceived) captionParts.push(`받은 <span class="relation-word positive">긍정</span> ${item.positiveReceived}`);
        if (item.positiveSent) captionParts.push(`보낸 <span class="relation-word positive">긍정</span> ${item.positiveSent}`);
        if (item.negativeReceived) captionParts.push(`받은 <span class="relation-word negative">부정</span> ${item.negativeReceived}`);
        if (item.negativeSent) captionParts.push(`보낸 <span class="relation-word negative">부정</span> ${item.negativeSent}`);
        if (!captionParts.length) captionParts.push("서술 메모 연결");
        return { student: item.student, captionHtml: captionParts.join(" · "), caption: "" };
      });
    const topIncoming = peerTotals
      .filter((item) => item.positiveReceived > 0)
      .sort((a, b) => b.positiveReceived - a.positiveReceived || a.student.name.localeCompare(b.student.name))
      .slice(0, 4)
      .map((item) => ({ student: item.student, caption: `${item.positiveReceived}회 선택` }));
    const topOutgoing = peerTotals
      .filter((item) => item.positiveSent > 0)
      .sort((a, b) => b.positiveSent - a.positiveSent || a.student.name.localeCompare(b.student.name))
      .slice(0, 4)
      .map((item) => ({ student: item.student, caption: `${item.positiveSent}회 선택` }));
    const tensionIncoming = peerTotals
      .filter((item) => item.negativeReceived > 0)
      .sort((a, b) => b.negativeReceived - a.negativeReceived || a.student.name.localeCompare(b.student.name))
      .slice(0, 4)
      .map((item) => ({ student: item.student, caption: `${item.negativeReceived}회 거리감 응답` }));
    const tensionOutgoing = peerTotals
      .filter((item) => item.negativeSent > 0)
      .sort((a, b) => b.negativeSent - a.negativeSent || a.student.name.localeCompare(b.student.name))
      .slice(0, 4)
      .map((item) => ({ student: item.student, caption: `${item.negativeSent}회 직접 응답` }));
    const mutuals = [...metric.mutuals]
      .map((id) => lookup[id])
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((student) => ({ student, caption: "상호 선택 관계" }));
    const keywordChips = buildKeywordChips(metric, analysis, directConnections);
    const spotlightCards = buildSpotlightCards(metric, analysis, directConnections);
    const overallBenchmarks = analysis.benchmarks.overall;

    return `
      <section class="profile-detail-shell ${focusMode ? "focus-mode" : ""}">
        <div class="profile-detail-hero">
          <div>
            <p class="eyebrow">${focusMode ? "Consultation Mode" : "Student Profile"}</p>
            <h3>${escapeHtml(metric.student.name)}</h3>
            <p class="muted">${escapeHtml(metric.student.gender)} · ${escapeHtml(typeLabels[metric.type] || metric.type)} · ${responseMap[metric.student.id] ? "응답 완료" : "미응답"}</p>
          </div>
          <div class="profile-detail-actions">
            ${focusMode ? '<button type="button" class="ghost-button" data-exit-focus>학생 목록 보기</button>' : '<button type="button" class="primary-button" data-enter-focus>개별 상담 모드</button>'}
            <span class="pill ${metric.needsAttention ? "alert" : "good"}">${metric.needsAttention ? "관심 필요" : "안정"}</span>
          </div>
        </div>

        ${focusMode ? '<div class="consultation-banner">개별 상담 모드에서는 선택한 학생과 직접 연결된 정보만 표시합니다.</div>' : ""}

        <div class="detail-stat-grid">
          <article class="detail-stat-card">
            <span class="stat-label">긍정 지명</span>
            <strong>${metric.positiveReceived}</strong>
            ${renderComparePills(metric.positiveReceived, overallBenchmarks.positiveReceivedAverage)}
          </article>
          <article class="detail-stat-card">
            <span class="stat-label">상호 선택</span>
            <strong>${metric.mutuals.size}</strong>
            ${renderComparePills(metric.mutuals.size, overallBenchmarks.mutualAverage)}
          </article>
          <article class="detail-stat-card negative">
            <span class="stat-label">부정 지명</span>
            <strong>${metric.negativeReceived}</strong>
            ${renderComparePills(metric.negativeReceived, overallBenchmarks.negativeReceivedAverage, true)}
          </article>
          <article class="detail-stat-card">
            <span class="stat-label">체크 평균</span>
            <strong>${metric.checkAverage ? metric.checkAverage.toFixed(1) : "-"}</strong>
            ${renderCompareOrPending(metric.checkAverage || 0, overallBenchmarks.checkAverage, false, metric.checkAverage > 0)}
          </article>
        </div>

        <article class="keyword-board">
          <div class="panel-title-row">
            <div>
              <p class="eyebrow">Keywords</p>
              <h4>핵심 키워드</h4>
            </div>
          </div>
          <div class="signal-chip-row">${renderSignalChips(keywordChips)}</div>
        </article>

        <div class="spotlight-grid">
          ${spotlightCards.map((card) => `
            <article class="spotlight-card ${card.tone}">
              <span class="spotlight-label">${escapeHtml(card.label)}</span>
              <strong>${escapeHtml(card.value)}</strong>
              <p>${escapeHtml(card.meta)}</p>
            </article>
          `).join("")}
        </div>

        <div class="insight-grid compact">
          <article class="insight-card compact">
            <span class="note-label">핵심 해석</span>
            <strong>${escapeHtml(metric.summary.overview)}</strong>
          </article>
          <article class="insight-card compact">
            <span class="note-label">강점 단어</span>
            <div class="mini-pill-row">${metric.summary.strengths.length ? metric.summary.strengths.map((text) => `<span class="mini-pill strong">${escapeHtml(text)}</span>`).join("") : '<span class="mini-pill muted">강점 신호 대기</span>'}</div>
          </article>
          <article class="insight-card compact">
            <span class="note-label">우선 확인</span>
            <div class="mini-pill-row">${metric.summary.risks.length ? metric.summary.risks.map((text) => `<span class="mini-pill warn">${escapeHtml(text)}</span>`).join("") : '<span class="mini-pill good">큰 위험 신호 없음</span>'}</div>
          </article>
        </div>

        <div class="profile-section-grid">
          <article class="detail-panel-card">
            <div class="panel-title-row">
              <div>
                <p class="eyebrow">Direct Links</p>
                <h4>직접 연결된 친구</h4>
              </div>
              <span class="mini-pill">${directConnections.length}명</span>
            </div>
            ${renderPeerCards(directConnections, "직접 연결된 친구가 아직 없습니다.", "neutral")}
          </article>

          <article class="detail-panel-card">
            <div class="panel-title-row">
              <div>
                <p class="eyebrow">Mutual</p>
                <h4>상호 선택</h4>
              </div>
            </div>
            ${renderPeerCards(mutuals, "상호 선택 관계가 없습니다.", "good")}
          </article>

          <article class="detail-panel-card">
            <div class="panel-title-row">
              <div>
                <p class="eyebrow">Positive Flow</p>
                <h4>학생을 자주 찾는 친구</h4>
              </div>
            </div>
            ${renderPeerCards(topIncoming, "이 학생을 반복해서 선택한 친구가 없습니다.", "good")}
          </article>

          <article class="detail-panel-card">
            <div class="panel-title-row">
              <div>
                <p class="eyebrow">Positive Flow</p>
                <h4>학생이 자주 찾는 친구</h4>
              </div>
            </div>
            ${renderPeerCards(topOutgoing, "이 학생이 반복해서 선택한 친구가 없습니다.", "neutral")}
          </article>

          <article class="detail-panel-card">
            <div class="panel-title-row">
              <div>
                <p class="eyebrow">Tension</p>
                <h4>학생에게 향한 거리감 신호</h4>
              </div>
            </div>
            ${renderPeerCards(tensionIncoming, "현재 기록된 거리감 신호가 없습니다.", "warn")}
          </article>

          <article class="detail-panel-card">
            <div class="panel-title-row">
              <div>
                <p class="eyebrow">Tension</p>
                <h4>학생이 직접 말한 거리감 신호</h4>
              </div>
            </div>
            ${renderPeerCards(tensionOutgoing, "이 학생이 직접 표시한 거리감 신호가 없습니다.", "warn")}
          </article>
        </div>

        <article class="detail-panel-card">
          <div class="panel-title-row">
            <div>
              <p class="eyebrow">Self Report</p>
              <h4>체크 문항 비교</h4>
            </div>
          </div>
          <div class="canvas-wrap profile-check-wrap">
            <canvas id="profile-check-chart"></canvas>
          </div>
        </article>

        <article class="detail-panel-card">
          <div class="panel-title-row">
            <div>
              <p class="eyebrow">Question Story</p>
              <h4>문항별 직접 관계</h4>
            </div>
          </div>
          <div class="question-story-list">
            ${renderQuestionRows(metric, lookup, analysis)}
          </div>
        </article>

        <article class="detail-panel-card">
          <div class="panel-title-row">
            <div>
              <p class="eyebrow">Notes</p>
              <h4>메모와 서술 응답</h4>
            </div>
          </div>
          <div class="note-grid">
            ${renderNotes(metric, lookup)}
          </div>
        </article>
      </section>
    `;
  }

  function renderProfiles(container, students, analysis, responses, selectedStudentId, focusMode) {
    const selectedStudent = students.find((student) => student.id === selectedStudentId) || students[0];
    if (!selectedStudent) {
      container.innerHTML = '<div class="empty-state">학생 정보가 없습니다.</div>';
      return;
    }

    const metric = analysis.metrics[selectedStudent.id];
    const selectorCards = students.map((student) => {
      const item = analysis.metrics[student.id];
      const tags = item.profileTags.length
        ? item.profileTags.slice(0, 2).map((tag) => `<span class="mini-pill">${escapeHtml(tag)}</span>`).join("")
        : '<span class="mini-pill muted">기본 프로필</span>';

      return `
        <button type="button" class="profile-selector-card ${student.id === selectedStudent.id ? "active" : ""}" data-profile-id="${student.id}">
          <div class="profile-selector-head">
            <div>
              <strong>${escapeHtml(student.name)}</strong>
              <p>${escapeHtml(student.gender)} · ${escapeHtml(typeLabels[item.type] || item.type)}</p>
            </div>
            <span class="pill ${item.needsAttention ? "alert" : "good"}">${item.needsAttention ? "주의" : "안정"}</span>
          </div>
          <div class="selector-metrics">
            <span>긍정 ${item.positiveReceived}</span>
            <span>상호 ${item.mutuals.size}</span>
            <span>부정 ${item.negativeReceived}</span>
          </div>
          <div class="mini-pill-row">${tags}</div>
        </button>
      `;
    }).join("");

    const detailHtml = renderDetail(metric, analysis, students, responses, focusMode);

    container.innerHTML = focusMode
      ? `<div class="profile-focus-layout">${detailHtml}</div>`
      : `
        <div class="profile-workspace">
          <aside class="profile-selector-panel">
            <div class="panel-title-row">
              <div>
                <p class="eyebrow">Students</p>
                <h3>학생 선택</h3>
              </div>
              <span class="mini-pill">${students.length}명</span>
            </div>
            <div class="profile-selector-list">${selectorCards}</div>
          </aside>
          <div class="profile-detail-panel">${detailHtml}</div>
        </div>
      `;

    const profileCanvas = container.querySelector("#profile-check-chart");
    if (profileCanvas) {
      renderProfileCheckChart(profileCanvas, metric, analysis);
    }
  }

  function renderAttention(container, students, analysis) {
    const items = students.filter((student) => analysis.metrics[student.id].needsAttention);
    if (!items.length) {
      container.innerHTML = '<span class="pill good">현재 기준으로 별도 경고 학생이 없습니다.</span>';
      return;
    }
    container.innerHTML = items.map((student) => {
      const metric = analysis.metrics[student.id];
      return `<span class="pill alert">${escapeHtml(student.name)} · 긍정 ${metric.positiveReceived} / 부정 ${metric.negativeReceived} / 상호 ${metric.mutuals.size}</span>`;
    }).join("");
  }

  window.DashboardCharts = {
    renderDistribution,
    renderClimate,
    renderMatrix,
    renderProfiles,
    renderAttention
  };
})();
