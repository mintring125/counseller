(function analysisModule() {
  const { students, nominationQuestions, checkQuestions } = window.APP_DATA;
  const positiveIds = nominationQuestions.filter((item) => item.category === "positive").map((item) => item.id);
  const negativeIds = nominationQuestions.filter((item) => item.category === "negative").map((item) => item.id);

  function percentileThreshold(values, ratio, fromTop) {
    const sorted = [...values].sort((a, b) => (fromTop ? b - a : a - b));
    const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
    return sorted[index] ?? 0;
  }

  function analyzeResponses(responses) {
    const metrics = Object.fromEntries(
      students.map((student) => [student.id, {
        student,
        positiveReceived: 0,
        negativeReceived: 0,
        positiveSent: 0,
        negativeSent: 0,
        mutuals: new Set(),
        connectorScore: 0,
        checkAverage: 0,
        profileTags: [],
        needsAttention: false
      }])
    );

    const edges = [];
    const matrix = Object.fromEntries(students.map((student) => [student.id, Object.fromEntries(students.map((item) => [item.id, 0]))]));

    responses.forEach((response) => {
      if (!response.nominations) return;
      positiveIds.forEach((id) => {
        const nomination = response.nominations[id];
        if (!nomination || !Array.isArray(nomination.selected)) return;
        const selected = nomination.selected;
        metrics[response.respondentId].positiveSent += selected.length;
        if (id === "q9") metrics[response.respondentId].connectorScore += selected.length;
        selected.forEach((targetId) => {
          if (!metrics[targetId]) return;
          metrics[targetId].positiveReceived += 1;
          matrix[response.respondentId][targetId] += 1;
          edges.push({ source: response.respondentId, target: targetId, type: "positive", questionId: id });
        });
      });
      negativeIds.forEach((id) => {
        const nomination = response.nominations[id];
        if (!nomination || !Array.isArray(nomination.selected)) return;
        const selected = nomination.selected;
        metrics[response.respondentId].negativeSent += selected.length;
        selected.forEach((targetId) => {
          if (!metrics[targetId]) return;
          metrics[targetId].negativeReceived += 1;
          matrix[response.respondentId][targetId] -= 1;
          edges.push({ source: response.respondentId, target: targetId, type: "negative", questionId: id });
        });
      });
      const checkValues = checkQuestions.map((question) => Number(response.checkItems[question.id] || 0));
      metrics[response.respondentId].checkAverage = checkValues.reduce((sum, value) => sum + value, 0) / checkValues.length;
    });

    const positiveValues = students.map((student) => metrics[student.id].positiveReceived);
    const negativeValues = students.map((student) => metrics[student.id].negativeReceived);
    const positiveTop = percentileThreshold(positiveValues, 0.25, true);
    const positiveBottom = percentileThreshold(positiveValues, 0.25, false);
    const positiveMidBottom = percentileThreshold(positiveValues, 0.5, false);
    const negativeTop = percentileThreshold(negativeValues, 0.25, true);
    const negativeBottom = percentileThreshold(negativeValues, 0.25, false);
    const positiveUpperHalf = percentileThreshold(positiveValues, 0.5, true);
    const negativeUpperHalf = percentileThreshold(negativeValues, 0.5, true);
    const negativeMidBottom = percentileThreshold(negativeValues, 0.5, false);

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
            const targetNom = targetResponse.nominations[id];
            return targetNom && Array.isArray(targetNom.selected) && targetNom.selected.includes(response.respondentId);
          });
          if (selectedBack) {
            metrics[response.respondentId].mutuals.add(targetId);
            metrics[targetId].mutuals.add(response.respondentId);
          }
        });
      });
    });

    students.forEach((student) => {
      const item = metrics[student.id];
      const positive = item.positiveReceived;
      const negative = item.negativeReceived;
      let type = "Average";

      if (positive >= positiveTop && negative <= negativeMidBottom) type = "Popular";
      else if (negative >= negativeTop && positive <= positiveMidBottom) type = "Rejected";
      else if (positive >= positiveUpperHalf && negative >= negativeUpperHalf) type = "Controversial";
      else if (positive <= positiveBottom && negative <= negativeBottom) type = "Neglected";

      item.type = type;
      item.needsAttention = item.positiveReceived <= 1 && item.negativeReceived >= 3 && item.mutuals.size === 0 && item.checkAverage > 0 && item.checkAverage <= 2;

      if (item.type === "Popular") item.profileTags.push("⭐ 인기아");
      if (item.type === "Rejected") item.profileTags.push("⚠️ 거부 위험");
      if (item.type === "Neglected") item.profileTags.push("👻 고립 위험");
      if (item.connectorScore >= 2) item.profileTags.push("🌉 연결자");
      if (item.mutuals.size >= 2) item.profileTags.push("🤝 상호선택 다수");
    });

    const climateAverages = Object.fromEntries(checkQuestions.map((question) => {
      const values = responses.map((response) => Number(response.checkItems[question.id] || 0)).filter(Boolean);
      const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      return [question.id, average];
    }));

    return {
      metrics,
      edges,
      matrix,
      climateAverages,
      mutualCount: Math.floor(students.reduce((sum, student) => sum + metrics[student.id].mutuals.size, 0) / 2)
    };
  }

  window.Analysis = { analyzeResponses };
})();
