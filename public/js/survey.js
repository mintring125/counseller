(function surveyApp() {
  const root = document.getElementById("survey-root");
  if (!root) return;

  const { students, nominationQuestions, checkQuestions, likertLabels } = window.APP_DATA;
  const state = { status: null, respondent: null, currentStep: 0, nominations: {}, checkItems: {}, loading: false, completed: false };

  nominationQuestions.forEach((question) => {
    state.nominations[question.id] =
      question.category === "text" ? { text: "" } : { selected: [], reason: "", reasonDrawing: "" };
  });
  checkQuestions.forEach((question) => { state.checkItems[question.id] = null; });

  function progressInfo() {
    const total = nominationQuestions.length + checkQuestions.length;
    const current = Math.min(state.currentStep + 1, total);
    return { total, current, percent: Math.round((current / total) * 100) };
  }

  function currentQuestion() {
    return state.currentStep < nominationQuestions.length
      ? nominationQuestions[state.currentStep]
      : checkQuestions[state.currentStep - nominationQuestions.length];
  }

  function canProceed() {
    const question = currentQuestion();
    if (!question) return false;
    if (question.id.startsWith("q")) {
      const answer = state.nominations[question.id];
      return question.category === "text" ? answer.text.trim().length > 0 : true;
    }
    return Boolean(state.checkItems[question.id]);
  }

  async function init() {
    const response = await fetch("/api/status");
    state.status = await response.json();
    render();
  }

  function handleNameSelect(id) {
    state.respondent = students.find((item) => item.id === id) || null;
    render();
  }

  function toggleSelection(questionId, studentId) {
    const answer = state.nominations[questionId];
    const question = nominationQuestions.find((item) => item.id === questionId);
    if (answer.selected.includes(studentId)) {
      answer.selected = answer.selected.filter((id) => id !== studentId);
    } else if (answer.selected.length < question.maxSelections) {
      answer.selected = [...answer.selected, studentId];
    }
    render();
  }

  function updateReason(questionId, value) { state.nominations[questionId].reason = value; }
  function updateText(questionId, value) { state.nominations[questionId].text = value; }
  function updateLikert(questionId, value) { state.checkItems[questionId] = Number(value); render(); }
  function updateReasonDrawing(questionId, value) { state.nominations[questionId].reasonDrawing = value; }
  function goNext() { if (state.currentStep < nominationQuestions.length + checkQuestions.length - 1) { state.currentStep += 1; render(); } }
  function goPrev() { if (state.currentStep > 0) { state.currentStep -= 1; render(); } }

  function setupReasonCanvas(questionId, canvas) {
    const context = canvas.getContext("2d");
    let drawing = false;

    function resizeCanvas() {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const snapshot = state.nominations[questionId].reasonDrawing;
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(ratio, ratio);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#1f2433";
      context.lineWidth = 2.5;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, rect.width, rect.height);

      if (snapshot) {
        const image = new Image();
        image.onload = () => {
          context.drawImage(image, 0, 0, rect.width, rect.height);
        };
        image.src = snapshot;
      }
    }

    function pointFromEvent(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }

    function saveDrawing() {
      updateReasonDrawing(questionId, canvas.toDataURL("image/png"));
    }

    canvas.addEventListener("pointerdown", (event) => {
      drawing = true;
      const point = pointFromEvent(event);
      context.beginPath();
      context.moveTo(point.x, point.y);
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!drawing) return;
      const point = pointFromEvent(event);
      context.lineTo(point.x, point.y);
      context.stroke();
    });

    function stopDrawing(event) {
      if (!drawing) return;
      drawing = false;
      context.closePath();
      saveDrawing();
      if (event && typeof canvas.releasePointerCapture === "function") {
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch (_error) {
        }
      }
    }

    canvas.addEventListener("pointerup", stopDrawing);
    canvas.addEventListener("pointerleave", stopDrawing);
    canvas.addEventListener("pointercancel", stopDrawing);

    resizeCanvas();

    return {
      clear() {
        updateReasonDrawing(questionId, "");
        resizeCanvas();
      }
    };
  }

  async function submitSurvey() {
    state.loading = true;
    render();
    const response = await fetch("/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        respondentId: state.respondent.id,
        respondentName: state.respondent.name,
        nominations: state.nominations,
        checkItems: state.checkItems
      })
    });
    state.loading = false;
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "제출에 실패했습니다." }));
      alert(error.error || "제출에 실패했습니다.");
      render();
      return;
    }
    const statusResponse = await fetch("/api/status");
    state.status = await statusResponse.json();
    state.completed = true;
    render();
  }

  function renderNameStep() {
    const respondedIds = new Set(state.status.respondedIds || []);
    root.innerHTML = `
      <section class="survey-hero">
        <span class="hero-badge">3학년 2반 교우관계 살펴보기</span>
        <div>
          <p class="eyebrow">Step 1</p>
          <h1>나의 이름을 선택해 주세요</h1>
          <p class="muted">이미 설문을 마친 친구는 다시 선택할 수 없습니다.</p>
        </div>
        <div class="name-grid">
          ${students.map((student) => `
            <button class="name-button ${respondedIds.has(student.id) ? "disabled" : ""}" data-name-id="${student.id}" ${respondedIds.has(student.id) ? "disabled" : ""}>
              <span>${student.name}${respondedIds.has(student.id) ? " 완료" : ""}</span>
              <span class="gender-chip ${student.gender === "여" ? "female" : "male"}">${student.gender}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `;
    root.querySelectorAll("[data-name-id]").forEach((button) => {
      button.addEventListener("click", () => handleNameSelect(Number(button.dataset.nameId)));
    });
  }

  function renderNomination(question, answer, progress) {
    root.innerHTML = `
      <section class="question-card">
        <div class="survey-hero">
          <span class="hero-badge">응답자 ${state.respondent.name}</span>
          <div class="progress-box">
            <div class="progress-meta">
              <div>
                <p class="eyebrow">Question ${progress.current}/${progress.total}</p>
                <h1>${question.text}</h1>
              </div>
              <strong>${progress.percent}%</strong>
            </div>
            <div class="progress-track"><div class="progress-bar" style="width:${progress.percent}%"></div></div>
          </div>
        </div>
        <div class="question-panel">
          <div class="choice-caption">
            <span>${answer.selected.length} / ${question.maxSelections}명 선택</span>
          </div>
          <div class="option-grid">
            ${students.filter((student) => student.id !== state.respondent.id).map((student) => `
              <button class="option-button ${answer.selected.includes(student.id) ? `selected ${question.category === "negative" ? "negative" : ""}` : ""}" data-student-id="${student.id}">
                ${student.name}
              </button>
            `).join("")}
          </div>
          <label class="helper-text">이유</label>
          <textarea class="reason-box" placeholder="필요하면 짧게 이유를 적어 주세요.">${answer.reason}</textarea>
          <div class="drawing-head">
            <span class="helper-text">간단한 그림 또는 표시</span>
            <button type="button" class="ghost-button drawing-clear" id="clear-drawing-button">지우기</button>
          </div>
          <canvas class="reason-canvas" id="reason-canvas"></canvas>
        </div>
        <div class="actions-row">
          <button class="ghost-button" id="prev-button" ${state.currentStep === 0 ? "disabled" : ""}>이전</button>
          <button class="primary-button" id="next-button">다음</button>
        </div>
      </section>
    `;
    root.querySelectorAll("[data-student-id]").forEach((button) => {
      button.addEventListener("click", () => toggleSelection(question.id, Number(button.dataset.studentId)));
    });
    root.querySelector(".reason-box").addEventListener("input", (event) => updateReason(question.id, event.target.value));
    const canvasApi = setupReasonCanvas(question.id, root.querySelector("#reason-canvas"));
    root.querySelector("#clear-drawing-button").addEventListener("click", () => canvasApi.clear());
    root.querySelector("#prev-button").addEventListener("click", goPrev);
    root.querySelector("#next-button").addEventListener("click", goNext);
  }

  function renderTextQuestion(question, answer, progress) {
    root.innerHTML = `
      <section class="question-card">
        <div class="survey-hero">
          <span class="hero-badge">응답자 ${state.respondent.name}</span>
          <div class="progress-box">
            <div class="progress-meta">
              <div>
                <p class="eyebrow">Question ${progress.current}/${progress.total}</p>
                <h1>${question.text}</h1>
              </div>
              <strong>${progress.percent}%</strong>
            </div>
            <div class="progress-track"><div class="progress-bar" style="width:${progress.percent}%"></div></div>
          </div>
        </div>
        <div class="question-panel">
          <p class="helper-text">친구 관계 중 선생님이 더 살펴보면 좋겠다고 생각하는 내용을 적어 주세요.</p>
          <textarea class="text-answer" placeholder="예: OO와 OO가 요즘 같이 잘 안 놀아요.">${answer.text}</textarea>
        </div>
        <div class="actions-row">
          <button class="ghost-button" id="prev-button">이전</button>
          <button class="primary-button" id="next-button" ${canProceed() ? "" : "disabled"}>다음</button>
        </div>
      </section>
    `;
    root.querySelector(".text-answer").addEventListener("input", (event) => {
      updateText(question.id, event.target.value);
      root.querySelector("#next-button").disabled = !canProceed();
    });
    root.querySelector("#prev-button").addEventListener("click", goPrev);
    root.querySelector("#next-button").addEventListener("click", goNext);
  }

  function renderLikert(question, progress) {
    root.innerHTML = `
      <section class="question-card">
        <div class="survey-hero">
          <span class="hero-badge">응답자 ${state.respondent.name}</span>
          <div class="progress-box">
            <div class="progress-meta">
              <div>
                <p class="eyebrow">Check Items</p>
                <h1>${question.text}</h1>
              </div>
              <strong>${progress.percent}%</strong>
            </div>
            <div class="progress-track"><div class="progress-bar" style="width:${progress.percent}%"></div></div>
          </div>
        </div>
        <div class="likert-group">
          ${checkQuestions.map((item) => `
            <article class="likert-card">
              <strong>${item.text}</strong>
              <div class="likert-scale">
                ${likertLabels.map((label, index) => `
                  <label>
                    <input type="radio" name="${item.id}" value="${index + 1}" ${state.checkItems[item.id] === index + 1 ? "checked" : ""} />
                    <span>${label}</span>
                  </label>
                `).join("")}
              </div>
            </article>
          `).join("")}
        </div>
        <div class="actions-row">
          <button class="ghost-button" id="prev-button">이전</button>
          <button class="primary-button" id="submit-button" ${Object.values(state.checkItems).every(Boolean) ? "" : "disabled"}>제출하기</button>
        </div>
      </section>
    `;
    root.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        updateLikert(radio.name, radio.value);
        root.querySelector("#submit-button").disabled = !Object.values(state.checkItems).every(Boolean);
      });
    });
    root.querySelector("#prev-button").addEventListener("click", goPrev);
    root.querySelector("#submit-button").addEventListener("click", submitSurvey);
  }

  function renderCompletion() {
    root.innerHTML = `
      <section class="completion-card">
        <span class="hero-badge">응답 완료</span>
        <h1>고마워요, ${state.respondent.name}!</h1>
        <p class="muted">설문이 안전하게 저장되었습니다. 기기를 선생님께 돌려주세요.</p>
      </section>
    `;
  }

  function render() {
    if (!state.status) {
      root.innerHTML = '<div class="empty-state">설문 정보를 불러오는 중입니다...</div>';
      return;
    }
    if (state.completed) {
      renderCompletion();
      return;
    }
    if (state.loading) {
      root.innerHTML = '<div class="empty-state">응답을 저장하는 중입니다...</div>';
      return;
    }
    if (!state.respondent) {
      renderNameStep();
      return;
    }
    const question = currentQuestion();
    const progress = progressInfo();
    if (question.id.startsWith("q")) {
      if (question.category === "text") renderTextQuestion(question, state.nominations[question.id], progress);
      else renderNomination(question, state.nominations[question.id], progress);
      return;
    }
    renderLikert(question, progress);
  }

  init().catch(() => {
    root.innerHTML = '<div class="empty-state">설문 정보를 불러오지 못했습니다.</div>';
  });
})();
