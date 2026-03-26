const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const QRCode = require("qrcode");

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
const SETTINGS_PATH = process.env.SETTINGS_PATH
  ? path.resolve(process.env.SETTINGS_PATH)
  : path.join(DATA_DIR, "settings.json");

let launchInfo = {
  url: "",
  localUrl: "",
  surveyUrl: "",
  adminUrl: "",
  qrDataUrl: ""
};

const STUDENTS = [
  { id: 1, name: "김소미", gender: "여" },
  { id: 2, name: "김철호", gender: "남" },
  { id: 3, name: "안세훈", gender: "남" },
  { id: 4, name: "옥승훈", gender: "남" },
  { id: 5, name: "이환희", gender: "남" },
  { id: 6, name: "임선율", gender: "여" },
  { id: 7, name: "전서율", gender: "여" },
  { id: 8, name: "정소윤", gender: "여" },
  { id: 9, name: "최나무", gender: "여" },
  { id: 10, name: "한아윤", gender: "여" },
  { id: 11, name: "황주연", gender: "여" }
];

const NOMINATION_QUESTIONS = [
  { id: "q1", text: "쉬는 시간에 같이 놀고 싶은 친구는?", category: "positive", maxSelections: 3 },
  { id: "q2", text: "모둠 활동을 할 때 함께하면 좋을 것 같은 친구는?", category: "positive", maxSelections: 3 },
  { id: "q3", text: "내가 힘들거나 속상할 때 이야기하고 싶은 친구는?", category: "positive", maxSelections: 3 },
  { id: "q4", text: "공부하거나 활동할 때 도움을 잘 주는 친구는?", category: "positive", maxSelections: 3 },
  { id: "q5", text: "나를 잘 이해해 준다고 느끼는 친구는?", category: "positive", maxSelections: 3 },
  { id: "q6", text: "요즘 더 자주 같이 지내는 친구는?", category: "positive", maxSelections: 3 },
  { id: "q7", text: "예전보다 더 친해졌다고 느끼는 친구는?", category: "positive", maxSelections: 3 },
  { id: "q8", text: "우리 반에서 친구들에게 친절하게 잘 대해 주는 친구는?", category: "positive", maxSelections: 3 },
  { id: "q9", text: "우리 반에서 두루두루 잘 어울리는 친구는?", category: "positive", maxSelections: 3 },
  { id: "q10", text: "함께 활동할 때 조금 불편하거나 어색한 친구가 있나요?", category: "negative", maxSelections: 3 },
  { id: "q11", text: "같이 있으면 다투거나 의견이 잘 안 맞는 친구가 있나요?", category: "negative", maxSelections: 3 },
  { id: "q12", text: "선생님이 더 살펴보면 좋겠다고 생각하는 친구관계가 있나요?", category: "text", maxSelections: 0 }
];

const CHECK_QUESTIONS = [
  { id: "c1", text: "나는 우리 반에 아주 친한 친구가 있다" },
  { id: "c2", text: "나는 우리 반에서 힘들 때 의지할 친구가 있다" },
  { id: "c3", text: "나는 우리 반에서 대체로 편안함을 느낀다" },
  { id: "c4", text: "나는 우리 반 친구들과 잘 어울리는 편이다" }
];

fs.mkdirSync(DATA_DIR, { recursive: true });

function writeJsonAtomic(targetPath, payload) {
  const directory = path.dirname(targetPath);
  const tempPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`
  );
  const serialized = JSON.stringify(payload, null, 2);

  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(tempPath, serialized, "utf8");
  fs.renameSync(tempPath, targetPath);
}

function ensureSettings() {
  const defaultSettings = {
    adminPassword: "1234",
    host: ""
  };

  if (!fs.existsSync(SETTINGS_PATH)) {
    writeJsonAtomic(SETTINGS_PATH, defaultSettings);
    return defaultSettings;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    return {
      adminPassword:
        typeof parsed.adminPassword === "string" && parsed.adminPassword.trim()
          ? parsed.adminPassword.trim()
          : defaultSettings.adminPassword,
      host: typeof parsed.host === "string" ? parsed.host.trim() : defaultSettings.host
    };
  } catch (_error) {
    writeJsonAtomic(SETTINGS_PATH, defaultSettings);
    return defaultSettings;
  }
}

const SETTINGS = ensureSettings();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || SETTINGS.adminPassword;

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR));

function getConfig() {
  return {
    students: STUDENTS,
    nominationQuestions: NOMINATION_QUESTIONS,
    checkQuestions: CHECK_QUESTIONS
  };
}

function getStudentById(id) {
  return STUDENTS.find((student) => student.id === Number(id));
}

function readResponses() {
  const files = fs.readdirSync(DATA_DIR).filter((file) => file.endsWith(".json"));
  return files
    .map((file) => {
      const filePath = path.join(DATA_DIR, file);
      try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.respondentId - b.respondentId);
}

function safeStudentName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function formatTimestampForFilename(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function responsePath(student, timestamp = new Date()) {
  const safeName = safeStudentName(student.name);
  return path.join(DATA_DIR, `${safeName}_${formatTimestampForFilename(timestamp)}.json`);
}

function findResponsePathsForStudent(student) {
  const safeName = safeStudentName(student.name);
  return fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.endsWith(".json"))
    .filter((file) => file.startsWith(`${student.id}_`) || file.startsWith(`${safeName}_`))
    .map((file) => path.join(DATA_DIR, file))
    .sort();
}

function findLatestResponsePath(student) {
  const matches = findResponsePathsForStudent(student);
  return matches.length ? matches[matches.length - 1] : null;
}

function validateResponse(payload) {
  if (!payload || typeof payload !== "object") {
    return "응답 데이터가 없습니다.";
  }

  const student = getStudentById(payload.respondentId);
  if (!student || payload.respondentName !== student.name) {
    return "응답자 정보가 올바르지 않습니다.";
  }

  const nominations = payload.nominations || {};
  for (const question of NOMINATION_QUESTIONS) {
    const answer = nominations[question.id];
    if (!answer) {
      return `${question.id} 응답이 누락되었습니다.`;
    }

    if (question.category === "text") {
      if (typeof answer.text !== "string") {
        return `${question.id} 서술형 응답 형식이 올바르지 않습니다.`;
      }
      continue;
    }

    if (!Array.isArray(answer.selected)) {
      return `${question.id} 선택 응답 형식이 올바르지 않습니다.`;
    }

    if (answer.selected.length > question.maxSelections) {
      return `${question.id} 최대 선택 수를 초과했습니다.`;
    }

    const unique = new Set(answer.selected);
    if (unique.size !== answer.selected.length) {
      return `${question.id} 중복 선택이 있습니다.`;
    }

    for (const selectedId of answer.selected) {
      if (Number(selectedId) === Number(payload.respondentId)) {
        return `${question.id}에서 자기 자신은 선택할 수 없습니다.`;
      }
      if (!getStudentById(selectedId)) {
        return `${question.id}에 존재하지 않는 학생이 포함되었습니다.`;
      }
    }
  }

  const checkItems = payload.checkItems || {};
  for (const question of CHECK_QUESTIONS) {
    const value = Number(checkItems[question.id]);
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return `${question.id} 점수가 올바르지 않습니다.`;
    }
  }

  return null;
}

function requireAdmin(req, res, next) {
  const password = req.get("x-admin-password") || req.query.password;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "관리자 비밀번호가 올바르지 않습니다." });
  }
  return next();
}

function getStatus() {
  const responses = readResponses();
  const respondedIds = responses.map((item) => item.respondentId);
  return {
    totalStudents: STUDENTS.length,
    responseCount: responses.length,
    remainingCount: STUDENTS.length - responses.length,
    respondedIds,
    pendingIds: STUDENTS.filter((student) => !respondedIds.includes(student.id)).map((student) => student.id)
  };
}

app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "launch.html"));
});

app.get("/survey", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "survey.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

app.get("/api/config", (_req, res) => {
  res.json(getConfig());
});

app.get("/api/launch", (_req, res) => {
  res.json(launchInfo);
});

app.get("/api/status", (_req, res) => {
  res.json(getStatus());
});

app.post("/api/admin/verify", (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false });
  }
  return res.json({ ok: true });
});

app.post("/api/survey", (req, res) => {
  const validationError = validateResponse(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const student = getStudentById(req.body.respondentId);
  if (readResponses().some((item) => item.respondentId === student.id)) {
    return res.status(409).json({ error: "이미 응답을 완료한 학생입니다." });
  }

  const savedAt = new Date();
  const saved = {
    respondentId: student.id,
    respondentName: student.name,
    timestamp: savedAt.toISOString(),
    nominations: req.body.nominations,
    checkItems: req.body.checkItems
  };

  const targetPath = responsePath(student, savedAt);
  writeJsonAtomic(targetPath, saved);
  return res.status(201).json({ ok: true });
});

app.get("/api/survey", requireAdmin, (_req, res) => {
  res.json(readResponses());
});

app.get("/api/survey/:id", requireAdmin, (req, res) => {
  const response = readResponses().find((item) => item.respondentId === Number(req.params.id));
  if (!response) {
    return res.status(404).json({ error: "응답을 찾을 수 없습니다." });
  }
  return res.json(response);
});

app.delete("/api/survey/:id", requireAdmin, (req, res) => {
  const student = getStudentById(req.params.id);
  if (!student) {
    return res.status(404).json({ error: "학생을 찾을 수 없습니다." });
  }

  const targetPath = findLatestResponsePath(student);
  if (!targetPath || !fs.existsSync(targetPath)) {
    return res.status(404).json({ error: "삭제할 응답이 없습니다." });
  }

  fs.unlinkSync(targetPath);
  return res.json({ ok: true });
});

app.get("/api/export", requireAdmin, (_req, res) => {
  const payload = {
    exportedAt: new Date().toISOString(),
    config: getConfig(),
    status: getStatus(),
    responses: readResponses()
  };
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"survey-export.json\"");
  res.send(JSON.stringify(payload, null, 2));
});

function getLocalAddress() {
  if (SETTINGS.host) {
    return SETTINGS.host;
  }

  const interfaces = os.networkInterfaces();
  const candidates = [];
  const preferredPrefixes = [
    "192.168.",
    "10.",
    "172.16.",
    "172.17.",
    "172.18.",
    "172.19.",
    "172.20.",
    "172.21.",
    "172.22.",
    "172.23.",
    "172.24.",
    "172.25.",
    "172.26.",
    "172.27.",
    "172.28.",
    "172.29.",
    "172.30.",
    "172.31."
  ];

  for (const infos of Object.values(interfaces)) {
    if (!infos) {
      continue;
    }
    for (const info of infos) {
      if (info.family === "IPv4" && !info.internal) {
        candidates.push(info.address);
      }
    }
  }

  for (const prefix of preferredPrefixes) {
    const match = candidates.find((address) => address.startsWith(prefix));
    if (match) {
      return match;
    }
  }

  if (candidates.length) {
    return candidates[0];
  }

  return "localhost";
}

async function printQr(url) {
  try {
    const qr = await QRCode.toString(url, { type: "terminal", small: true });
    console.log(qr);
  } catch (error) {
    console.log("QR 코드 생성에 실패했습니다:", error.message);
  }
}

app.listen(PORT, async () => {
  const address = getLocalAddress();
  const url = `http://${address}:${PORT}`;
  const localUrl = `http://localhost:${PORT}`;
  const surveyUrl = `${url}/survey`;
  const adminUrl = `${url}/admin`;
  let qrDataUrl = "";

  try {
    qrDataUrl = await QRCode.toDataURL(surveyUrl, { margin: 1, width: 320 });
  } catch (_error) {
    qrDataUrl = "";
  }

  launchInfo = {
    url,
    localUrl,
    surveyUrl,
    adminUrl,
    qrDataUrl
  };

  console.log("");
  console.log("교우관계조사 서버가 시작되었습니다.");
  console.log(`교사용 시작 화면: ${localUrl}`);
  console.log(`휴대폰/태블릿 접속 주소: ${url}`);
  console.log(`학생용 설문: ${surveyUrl}`);
  console.log(`관리자 대시보드: ${adminUrl}`);
  console.log(`관리자 비밀번호: ${ADMIN_PASSWORD}`);
  console.log("");
  console.log("학생들이 스캔할 QR 코드:");
  await printQr(surveyUrl);
});
