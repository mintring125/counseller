(function adminApp() {
  const authPanel = document.getElementById("auth-panel");
  const dashboard = document.getElementById("dashboard");
  if (!authPanel || !dashboard) return;

  const { students, nominationQuestions, checkQuestions } = window.APP_DATA;
  const state = {
    password: sessionStorage.getItem("adminPassword") || "",
    responses: [],
    status: null,
    analysis: null,
    selectedStudentId: students[0]?.id || null,
    profileFocusMode: false,
    filters: { showPositive: true, showNegative: true, questionId: "all" }
  };

  const authForm = document.getElementById("auth-form");
  const passwordInput = document.getElementById("password-input");
  const authMessage = document.getElementById("auth-message");
  const responseCount = document.getElementById("response-count");
  const responseProgress = document.getElementById("response-progress");
  const positiveTotal = document.getElementById("positive-total");
  const negativeTotal = document.getElementById("negative-total");
  const mutualTotal = document.getElementById("mutual-total");
  const refreshButton = document.getElementById("refresh-button");
  const exportButton = document.getElementById("export-button");
  const positiveFilter = document.getElementById("positive-filter");
  const negativeFilter = document.getElementById("negative-filter");
  const questionFilter = document.getElementById("question-filter");
  const sociogramContainer = document.getElementById("sociogram");
  const matrixContainer = document.getElementById("matrix");
  const profilesContainer = document.getElementById("profiles");
  const attentionList = document.getElementById("attention-list");
  const distributionCanvas = document.getElementById("distribution-chart");
  const climateCanvas = document.getElementById("climate-chart");

  function activateTab(tabName) {
    document.querySelectorAll(".tab-button").forEach((item) => {
      item.classList.toggle("active", item.dataset.tab === tabName);
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `tab-${tabName}`);
    });
  }

  function adminHeaders() {
    return { "x-admin-password": state.password };
  }

  async function verifyPassword(password) {
    const response = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (!response.ok) throw new Error("비밀번호가 올바르지 않습니다.");
    state.password = password;
    sessionStorage.setItem("adminPassword", password);
  }

  async function loadDashboard() {
    const [statusResponse, surveyResponse] = await Promise.all([
      fetch("/api/status"),
      fetch("/api/survey", { headers: adminHeaders() })
    ]);
    if (!surveyResponse.ok) throw new Error("응답 데이터를 불러오지 못했습니다.");
    state.status = await statusResponse.json();
    state.responses = await surveyResponse.json();
    state.analysis = window.Analysis.analyzeResponses(state.responses);
    syncSelectedStudent();
    renderDashboard();
  }

  function syncSelectedStudent() {
    const validIds = new Set(students.map((student) => student.id));
    if (state.selectedStudentId && validIds.has(state.selectedStudentId)) return;
    state.selectedStudentId = state.responses[0]?.respondentId || students[0]?.id || null;
  }

  function renderStats() {
    responseCount.textContent = `${state.status.responseCount} / ${state.status.totalStudents}`;
    responseProgress.style.width = `${(state.status.responseCount / state.status.totalStudents) * 100}%`;
    positiveTotal.textContent = String(students.reduce((sum, student) => sum + state.analysis.metrics[student.id].positiveReceived, 0));
    negativeTotal.textContent = String(students.reduce((sum, student) => sum + state.analysis.metrics[student.id].negativeReceived, 0));
    mutualTotal.textContent = String(state.analysis.mutualCount);
  }

  function renderQuestionFilter() {
    questionFilter.innerHTML = ['<option value="all">전체 문항</option>']
      .concat(nominationQuestions.map((question) => `<option value="${question.id}">${question.id.toUpperCase()} · ${question.text}</option>`))
      .join("");
    questionFilter.value = state.filters.questionId;
  }

  function renderDashboard() {
    renderStats();
    renderQuestionFilter();
    window.Sociogram.renderSociogram(sociogramContainer, students, state.analysis, state.filters, {
      onSelectStudent(studentId) {
        state.selectedStudentId = Number(studentId);
        state.profileFocusMode = true;
        activateTab("profiles");
        renderProfilesPanel();
      }
    });
    window.DashboardCharts.renderMatrix(matrixContainer, students, state.analysis);
    renderProfilesPanel();
    window.DashboardCharts.renderDistribution(distributionCanvas, students, state.analysis);
    window.DashboardCharts.renderClimate(climateCanvas, checkQuestions, state.analysis);
    window.DashboardCharts.renderAttention(attentionList, students, state.analysis);
  }

  function renderProfilesPanel() {
    window.DashboardCharts.renderProfiles(
      profilesContainer,
      students,
      state.analysis,
      state.responses,
      state.selectedStudentId,
      state.profileFocusMode
    );

    profilesContainer.querySelectorAll("[data-profile-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedStudentId = Number(button.dataset.profileId);
        renderProfilesPanel();
      });
    });

    const enterFocusButton = profilesContainer.querySelector("[data-enter-focus]");
    if (enterFocusButton) {
      enterFocusButton.addEventListener("click", () => {
        state.profileFocusMode = true;
        renderProfilesPanel();
        /* Enter fullscreen */
        const shell = profilesContainer.querySelector(".profile-detail-shell");
        if (shell && shell.requestFullscreen) {
          shell.requestFullscreen().catch(() => {});
        } else if (shell && shell.webkitRequestFullscreen) {
          shell.webkitRequestFullscreen();
        }
      });
    }

    const exitFocusButton = profilesContainer.querySelector("[data-exit-focus]");
    if (exitFocusButton) {
      exitFocusButton.addEventListener("click", () => {
        state.profileFocusMode = false;
        /* Exit fullscreen */
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitFullscreenElement) {
          document.webkitExitFullscreen();
        }
        renderProfilesPanel();
      });
    }

    /* Ego sociogram filter wiring */
    wireEgoFilters();
  }

  function wireEgoFilters() {
    const egoContainer = profilesContainer.querySelector("#ego-sociogram-container");
    const egoQuestionFilter = profilesContainer.querySelector("#ego-question-filter");
    const egoShowPositive = profilesContainer.querySelector("#ego-show-positive");
    const egoShowNegative = profilesContainer.querySelector("#ego-show-negative");
    if (!egoContainer) return;

    const focusId = Number(egoContainer.dataset.focusId);

    function getEgoFilters() {
      return {
        questionId: egoQuestionFilter ? egoQuestionFilter.value : "all",
        showPositive: egoShowPositive ? egoShowPositive.checked : true,
        showNegative: egoShowNegative ? egoShowNegative.checked : true
      };
    }

    function rerenderEgo() {
      window.Sociogram.renderEgoSociogram(egoContainer, students, state.analysis, focusId, getEgoFilters(), {
        responses: state.responses,
        nominationQuestions: nominationQuestions,
        checkQuestions: checkQuestions
      });
    }

    if (egoQuestionFilter) {
      egoQuestionFilter.addEventListener("change", rerenderEgo);
    }
    if (egoShowPositive) {
      egoShowPositive.addEventListener("change", rerenderEgo);
    }
    if (egoShowNegative) {
      egoShowNegative.addEventListener("change", rerenderEgo);
    }

    /* Initial render */
    rerenderEgo();
  }

  function activateDashboard() {
    authPanel.classList.add("hidden");
    dashboard.classList.remove("hidden");
    loadDashboard().catch((error) => {
      authMessage.textContent = error.message;
      authPanel.classList.remove("hidden");
      dashboard.classList.add("hidden");
    });
  }

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await verifyPassword(passwordInput.value.trim());
      authMessage.textContent = "";
      activateDashboard();
    } catch (error) {
      authMessage.textContent = error.message;
    }
  });

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.tab);
    });
  });

  refreshButton.addEventListener("click", () => {
    if (state.password) loadDashboard().catch((error) => { authMessage.textContent = error.message; });
  });

  exportButton.addEventListener("click", () => {
    if (state.password) window.location.href = `/api/export?password=${encodeURIComponent(state.password)}`;
  });

  positiveFilter.addEventListener("change", () => {
    state.filters.showPositive = positiveFilter.checked;
    renderDashboard();
  });

  negativeFilter.addEventListener("change", () => {
    state.filters.showNegative = negativeFilter.checked;
    renderDashboard();
  });

  questionFilter.addEventListener("change", () => {
    state.filters.questionId = questionFilter.value;
    renderDashboard();
  });

  if (state.password) activateDashboard();
})();
