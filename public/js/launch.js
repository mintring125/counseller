(function launchApp() {
  const root = document.getElementById("launch-root");
  if (!root) return;

  async function init() {
    const response = await fetch("/api/launch");
    const info = await response.json();

    root.innerHTML = `
      <section class="launch-grid">
        <div class="launch-copy">
          <span class="hero-badge">3학년 2반 교우관계조사</span>
          <div>
            <p class="eyebrow">Teacher Console</p>
            <h1>수업 시작 전에 이 화면을 띄워 두세요</h1>
            <p class="muted">학생들은 QR을 스캔해 설문에 들어가고, 선생님은 관리자 모드에서 응답 현황과 분석 결과를 확인할 수 있습니다.</p>
          </div>
          <div class="launch-links">
            <a class="primary-button launch-link" href="${info.adminUrl}">관리자 모드 열기</a>
            <a class="ghost-button launch-link" href="${info.surveyUrl}" target="_blank" rel="noreferrer">학생용 설문 미리보기</a>
          </div>
        </div>
        <aside class="launch-qr-panel">
          <p class="eyebrow">Student Access</p>
          <h2>아이들이 이 QR을 스캔하면 설문으로 바로 들어갑니다</h2>
          ${info.qrDataUrl ? `<img class="launch-qr" src="${info.qrDataUrl}" alt="학생용 설문 QR 코드" />` : '<div class="empty-state">QR을 생성하지 못했습니다.</div>'}
          <div class="launch-meta">
            <div class="meta-card">
              <span class="stat-label">휴대폰 접속 주소</span>
              <strong>${info.surveyUrl}</strong>
            </div>
          </div>
          <p class="muted">휴대폰이 같은 Wi-Fi에 연결되어 있어야 열립니다. QR이 안 되면 위 주소를 직접 입력해 확인하세요.</p>
        </aside>
      </section>
    `;
  }

  init().catch(() => {
    root.innerHTML = '<div class="empty-state">시작 화면을 불러오지 못했습니다.</div>';
  });
})();
