(function analysisModule() {
  const { students, nominationQuestions, checkQuestions } = window.APP_DATA;
  const positiveQuestions = nominationQuestions.filter((item) => item.category === "positive");
  const negativeQuestions = nominationQuestions.filter((item) => item.category === "negative");
  const positiveIds = positiveQuestions.map((item) => item.id);
  const negativeIds = negativeQuestions.map((item) => item.id);

  function percentileThreshold(values, ratio, fromTop) {
    const sorted = [...values].sort((a, b) => (fromTop ? b - a : a - b));
    const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
    return sorted[index] ?? 0;
  }

  function createQuestionBuckets(ids) {
    return Object.fromEntries(ids.map((id) => [id, []]));
  }

  function createPeerStats() {
    return Object.fromEntries(
      students.map((student) => [student.id, {
        positiveSent: 0,
        positiveReceived: 0,
        negativeSent: 0,
        negativeReceived: 0
      }])
    );
  }

  function createMetric(student) {
    return {
      student,
      positiveReceived: 0,
      negativeReceived: 0,
      positiveSent: 0,
      negativeSent: 0,
      mutuals: new Set(),
      relatedStudents: new Set(),
      connectorScore: 0,
      checkAverage: 0,
      checkScores: Object.fromEntries(checkQuestions.map((question) => [question.id, 0])),
      profileTags: [],
      needsAttention: false,
      hasResponse: false,
      ownTextNote: "",
      incomingTextMentions: [],
      reasonEntries: [],
      positiveSentByQuestion: createQuestionBuckets(positiveIds),
      negativeSentByQuestion: createQuestionBuckets(negativeIds),
      positiveReceivedByQuestion: createQuestionBuckets(positiveIds),
      negativeReceivedByQuestion: createQuestionBuckets(negativeIds),
      peerStats: createPeerStats(),
      summary: { overview: "", strengths: [], risks: [], focus: [] }
    };
  }

  function registerRelation(metric, otherId) {
    if (metric && otherId && Number(otherId) !== Number(metric.student.id)) {
      metric.relatedStudents.add(Number(otherId));
    }
  }

  function buildSummary(item, thresholds) {
    const strengths = [];
    const risks = [];
    const focus = [];
    const peerValues = Object.values(item.peerStats);
    const topPositiveTarget = Math.max(0, ...peerValues.map((peer) => peer.positiveSent));
    const focusRatio = item.positiveSent ? topPositiveTarget / item.positiveSent : 0;
    let overview = "학급 안에서 중간 수준의 관계 안정도를 보이는 학생입니다.";

    if (item.positiveReceived >= thresholds.positiveTop && item.mutuals.size >= 2) {
      overview = "학급 안에서 신뢰와 친밀감이 함께 확인되는 중심권 학생입니다.";
    } else if (item.positiveReceived >= thresholds.positiveTop) {
      overview = "여러 영역에서 자주 선택받는 학생입니다.";
    } else if (item.negativeReceived >= thresholds.negativeTop) {
      overview = "관계 갈등이나 거리감 신호를 우선 점검할 필요가 있는 학생입니다.";
    } else if (item.positiveReceived <= thresholds.positiveBottom) {
      overview = "직접 연결된 관계가 적어 세심한 관찰이 필요한 학생입니다.";
    }

    if (item.positiveReceived >= thresholds.positiveTop) {
      strengths.push("긍정 지명이 많은 편이라 또래 신뢰 기반이 있습니다.");
    }
    if (item.mutuals.size >= 2) {
      strengths.push("상호 선택 관계가 여러 개 있어 안정적인 친밀권이 보입니다.");
    }
    if (item.connectorScore >= 2 && item.positiveReceived >= thresholds.positiveUpperHalf) {
      strengths.push("여러 친구와 두루 연결되는 브릿지 역할 가능성이 있습니다.");
    }
    if (item.checkAverage >= 4) {
      strengths.push("본인이 느끼는 학급 적응감도 높은 편입니다.");
    }

    if (item.negativeReceived >= thresholds.negativeTop) {
      risks.push("부정 지명이 상대적으로 많아 갈등 또는 거리감 점검이 필요합니다.");
    }
    if (item.positiveReceived <= thresholds.positiveBottom) {
      risks.push("선택받는 관계가 적어 고립 신호를 살펴볼 필요가 있습니다.");
    }
    if (focusRatio >= 0.5 && item.positiveSent >= 3) {
      risks.push("선택이 특정 친구에게 집중되어 관계 의존이 생길 수 있습니다.");
    }
    if (item.checkAverage > 0 && item.checkAverage <= 2.5) {
      risks.push("체크 문항 점수가 낮아 정서적 안정감 확인이 필요합니다.");
    }
    if (!item.hasResponse) {
      risks.push("아직 본인 응답이 없어 관찰 자료 중심으로 해석해야 합니다.");
    }

    if (item.negativeReceived >= thresholds.negativeTop) {
      focus.push("짝 활동과 모둠 활동에서 안전한 조합을 먼저 설계해 보세요.");
    }
    if (focusRatio >= 0.5 && item.positiveSent >= 3) {
      focus.push("특정 친구 의존을 줄이도록 관계를 분산하는 활동이 필요합니다.");
    }
    if (item.connectorScore >= 2 && item.positiveReceived >= thresholds.positiveUpperHalf) {
      focus.push("연결자 역할은 가능하지만 과도한 의존이 몰리지 않게 조정해 주세요.");
    }
    if (item.checkAverage > 0 && item.checkAverage <= 2.5) {
      focus.push("짧은 개별 면담으로 요즘 불편한 관계가 있는지 먼저 확인해 보세요.");
    }
    if (!focus.length) {
      focus.push("현재 자료 기준으로는 정기 관찰과 소규모 협력 활동 유지가 적절합니다.");
    }

    return { overview, strengths, risks, focus };
  }

  function average(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function analyzeResponses(responses) {
    const metrics = Object.fromEntries(students.map((student) => [student.id, createMetric(student)]));
    const edges = [];
    const matrix = Object.fromEntries(
      students.map((student) => [student.id, Object.fromEntries(students.map((item) => [item.id, 0]))])
    );

    responses.forEach((response) => {
      const respondentMetric = metrics[response.respondentId];
      if (!respondentMetric) return;

      respondentMetric.hasResponse = true;
      if (response.nominations?.q12 && typeof response.nominations.q12.text === "string") {
        respondentMetric.ownTextNote = response.nominations.q12.text.trim();
      }

      positiveQuestions.forEach((question) => {
        const nomination = response.nominations?.[question.id];
        const selected = Array.isArray(nomination?.selected)
          ? nomination.selected.map((id) => Number(id)).filter((id) => metrics[id])
          : [];

        respondentMetric.positiveSent += selected.length;
        respondentMetric.positiveSentByQuestion[question.id] = selected;
        if (question.id === "q9") respondentMetric.connectorScore += selected.length;

        const reasonText = typeof nomination?.reason === "string" ? nomination.reason.trim() : "";
        if (reasonText) {
          respondentMetric.reasonEntries.push({
            questionId: question.id,
            questionText: question.text,
            type: "positive",
            text: reasonText
          });
        }

        selected.forEach((targetId) => {
          const targetMetric = metrics[targetId];
          respondentMetric.peerStats[targetId].positiveSent += 1;
          targetMetric.peerStats[response.respondentId].positiveReceived += 1;
          targetMetric.positiveReceived += 1;
          targetMetric.positiveReceivedByQuestion[question.id].push(response.respondentId);
          registerRelation(respondentMetric, targetId);
          registerRelation(targetMetric, response.respondentId);
          matrix[response.respondentId][targetId] += 1;
          edges.push({ source: response.respondentId, target: targetId, type: "positive", questionId: question.id });
        });
      });

      negativeQuestions.forEach((question) => {
        const nomination = response.nominations?.[question.id];
        const selected = Array.isArray(nomination?.selected)
          ? nomination.selected.map((id) => Number(id)).filter((id) => metrics[id])
          : [];

        respondentMetric.negativeSent += selected.length;
        respondentMetric.negativeSentByQuestion[question.id] = selected;

        const reasonText = typeof nomination?.reason === "string" ? nomination.reason.trim() : "";
        if (reasonText) {
          respondentMetric.reasonEntries.push({
            questionId: question.id,
            questionText: question.text,
            type: "negative",
            text: reasonText
          });
        }

        selected.forEach((targetId) => {
          const targetMetric = metrics[targetId];
          respondentMetric.peerStats[targetId].negativeSent += 1;
          targetMetric.peerStats[response.respondentId].negativeReceived += 1;
          targetMetric.negativeReceived += 1;
          targetMetric.negativeReceivedByQuestion[question.id].push(response.respondentId);
          registerRelation(respondentMetric, targetId);
          registerRelation(targetMetric, response.respondentId);
          matrix[response.respondentId][targetId] -= 1;
          edges.push({ source: response.respondentId, target: targetId, type: "negative", questionId: question.id });
        });
      });

      const checkValues = checkQuestions.map((question) => {
        const value = Number(response.checkItems?.[question.id] || 0);
        respondentMetric.checkScores[question.id] = value;
        return value;
      });
      respondentMetric.checkAverage = checkValues.reduce((sum, value) => sum + value, 0) / checkValues.length;
    });

    const positiveValues = students.map((student) => metrics[student.id].positiveReceived);
    const negativeValues = students.map((student) => metrics[student.id].negativeReceived);
    const thresholds = {
      positiveTop: percentileThreshold(positiveValues, 0.25, true),
      positiveBottom: percentileThreshold(positiveValues, 0.25, false),
      positiveMidBottom: percentileThreshold(positiveValues, 0.5, false),
      positiveUpperHalf: percentileThreshold(positiveValues, 0.5, true),
      negativeTop: percentileThreshold(negativeValues, 0.25, true),
      negativeBottom: percentileThreshold(negativeValues, 0.25, false),
      negativeUpperHalf: percentileThreshold(negativeValues, 0.5, true),
      negativeMidBottom: percentileThreshold(negativeValues, 0.5, false)
    };

    const responseMap = Object.fromEntries(responses.map((item) => [item.respondentId, item]));
    responses.forEach((response) => {
      if (!response.nominations) return;

      positiveIds.forEach((questionId) => {
        const nomination = response.nominations[questionId];
        if (!nomination || !Array.isArray(nomination.selected)) return;

        nomination.selected.forEach((targetId) => {
          const targetResponse = responseMap[targetId];
          if (!targetResponse || !targetResponse.nominations) return;

          const selectedBack = positiveIds.some((id) => {
            const targetNomination = targetResponse.nominations[id];
            return targetNomination
              && Array.isArray(targetNomination.selected)
              && targetNomination.selected.includes(response.respondentId);
          });

          if (selectedBack) {
            metrics[response.respondentId].mutuals.add(targetId);
            metrics[targetId].mutuals.add(response.respondentId);
            registerRelation(metrics[response.respondentId], targetId);
            registerRelation(metrics[targetId], response.respondentId);
          }
        });
      });
    });

    responses.forEach((response) => {
      const text = metrics[response.respondentId]?.ownTextNote;
      if (!text) return;

      students.forEach((student) => {
        if (student.id === response.respondentId) return;
        if (!text.includes(student.name)) return;

        metrics[student.id].incomingTextMentions.push({
          sourceId: response.respondentId,
          text
        });
        registerRelation(metrics[student.id], response.respondentId);
      });
    });

    students.forEach((student) => {
      const item = metrics[student.id];
      const positive = item.positiveReceived;
      const negative = item.negativeReceived;
      let type = "Average";

      if (positive >= thresholds.positiveTop && negative <= thresholds.negativeMidBottom) {
        type = "Popular";
      } else if (negative >= thresholds.negativeTop && positive <= thresholds.positiveMidBottom) {
        type = "Rejected";
      } else if (positive >= thresholds.positiveUpperHalf && negative >= thresholds.negativeUpperHalf) {
        type = "Controversial";
      } else if (positive <= thresholds.positiveBottom && negative <= thresholds.negativeBottom) {
        type = "Neglected";
      }

      item.type = type;
      item.needsAttention =
        item.positiveReceived <= 1
        && item.negativeReceived >= 3
        && item.mutuals.size === 0
        && item.checkAverage > 0
        && item.checkAverage <= 2;

      if (item.type === "Popular") item.profileTags.push("긍정 지명 높음");
      if (item.type === "Rejected") item.profileTags.push("갈등 신호");
      if (item.type === "Neglected") item.profileTags.push("관계 관찰 필요");
      if (item.connectorScore >= 2) item.profileTags.push("브릿지 가능");
      if (item.mutuals.size >= 2) item.profileTags.push("상호 선택 다수");

      item.summary = buildSummary(item, thresholds);
    });

    const climateAverages = Object.fromEntries(checkQuestions.map((question) => {
      const values = responses
        .map((response) => Number(response.checkItems?.[question.id] || 0))
        .filter(Boolean);
      const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      return [question.id, average];
    }));

    const benchmarks = {
      overall: {
        positiveReceivedAverage: average(students.map((student) => metrics[student.id].positiveReceived)),
        negativeReceivedAverage: average(students.map((student) => metrics[student.id].negativeReceived)),
        mutualAverage: average(students.map((student) => metrics[student.id].mutuals.size)),
        checkAverage: average(
          students
            .map((student) => metrics[student.id].checkAverage)
            .filter((value) => value > 0)
        )
      },
      nominationQuestions: Object.fromEntries(
        nominationQuestions
          .filter((question) => question.category !== "text")
          .map((question) => {
            const sentCounts = responses.map((response) => {
              const selected = response.nominations?.[question.id]?.selected;
              return Array.isArray(selected) ? selected.length : 0;
            });
            const receivedCounts = students.map((student) => {
              const metric = metrics[student.id];
              const bucket = question.category === "positive"
                ? metric.positiveReceivedByQuestion[question.id]
                : metric.negativeReceivedByQuestion[question.id];
              return bucket.length;
            });

            return [question.id, {
              sentAverage: average(sentCounts),
              receivedAverage: average(receivedCounts)
            }];
          })
      )
    };

    return {
      metrics,
      edges,
      matrix,
      climateAverages,
      benchmarks,
      thresholds,
      mutualCount: Math.floor(students.reduce((sum, student) => sum + metrics[student.id].mutuals.size, 0) / 2)
    };
  }

  window.Analysis = { analyzeResponses };
})();
