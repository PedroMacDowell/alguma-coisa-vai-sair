const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const {
  createHttpError,
  readStore,
  buildDashboard,
  calculateAverage,
  createStudent,
  updateStudent,
  addRecord,
  listStudents,
  getStudent,
  getBulletin,
} = require('./store');

const PORT = process.env.PORT || 3001;
const TEACHER_USERNAME = process.env.TEACHER_USERNAME;
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD;
const TEACHER_TOKEN = process.env.TEACHER_TOKEN;

if (!TEACHER_USERNAME || !TEACHER_PASSWORD || !TEACHER_TOKEN) {
  console.error('Defina TEACHER_USERNAME, TEACHER_PASSWORD e TEACHER_TOKEN nas variaveis de ambiente (veja .env.example).');
  process.exit(1);
}

const app = express();

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

function createAuthToken() {
  return TEACHER_TOKEN;
}

function requireAuth(req, res, next) {
  const authorization = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (authorization !== TEACHER_TOKEN) {
    return next(createHttpError('Acesso negado. Faça login primeiro.', 401));
  }
  next();
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'school-register-api' });
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (username === TEACHER_USERNAME && password === TEACHER_PASSWORD) {
      return res.json({
        token: createAuthToken(),
        teacher: {
          username: TEACHER_USERNAME,
          name: 'Professor',
        },
      });
    }
    next(createHttpError('Credenciais inválidas.', 401));
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ username: TEACHER_USERNAME, name: 'Professor' });
});

app.get('/api/bootstrap', requireAuth, async (req, res, next) => {
  try {
    const store = await readStore();
    res.json({
      students: store.students.map((student) => ({
        id: student.id,
        publicCode: student.publicCode,
        fullName: student.fullName,
        familyNames: student.familyNames,
        address: student.address,
        birthDate: student.birthDate,
        notes: student.notes,
        enrollmentMasked: `****${student.enrollmentLast4 || ''}`,
        recordCount: student.records?.length || 0,
        averageScore: calculateAverage(student.records || []),
        updatedAt: student.updatedAt,
      })),
      dashboard: buildDashboard(store),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/students', requireAuth, async (req, res, next) => {
  try {
    const students = await listStudents(req.query.q || '');
    res.json(students);
  } catch (error) {
    next(error);
  }
});

app.post('/api/students', requireAuth, async (req, res, next) => {
  try {
    const student = await createStudent(req.body || {});
    res.status(201).json(student);
  } catch (error) {
    next(error);
  }
});

app.get('/api/students/:id', requireAuth, async (req, res, next) => {
  try {
    const student = await getStudent(req.params.id);
    res.json(student);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/students/:id', requireAuth, async (req, res, next) => {
  try {
    const student = await updateStudent(req.params.id, req.body || {});
    res.json(student);
  } catch (error) {
    next(error);
  }
});

app.post('/api/students/:id/records', requireAuth, async (req, res, next) => {
  try {
    const record = await addRecord(req.params.id, req.body || {});
    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
});

app.get('/api/students/:id/bulletin', requireAuth, async (req, res, next) => {
  try {
    const bulletin = await getBulletin(req.params.id);
    res.json(bulletin);
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard', requireAuth, async (req, res, next) => {
  try {
    const store = await readStore();
    res.json(buildDashboard(store));
  } catch (error) {
    next(error);
  }
});

app.use((req, res, next) => {
  next(createHttpError('Route not found.', 404));
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    message: error.message || 'Unexpected server error.',
  });
});

app.listen(PORT, () => {
  console.log(`School register API running on http://localhost:${PORT}`);
});
