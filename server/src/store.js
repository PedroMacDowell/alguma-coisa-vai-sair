const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', 'data', 'school-store.json');
const SECRET = process.env.SCHOOL_SECRET || 'dev-school-secret-change-me';
const KEY = crypto.createHash('sha256').update(String(SECRET)).digest();

const RECORD_KINDS = ['nota', 'trabalho', 'observacao'];

const useMongo = Boolean(process.env.MONGO_URI);
let mongo = null;
if (useMongo) {
  try {
    mongo = require('./db');
  } catch (e) {
    mongo = null;
  }
}

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function assert(condition, message) {
  if (!condition) {
    throw createHttpError(message);
  }
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,;]+/)
      .map(normalizeText)
      .filter(Boolean);
  }

  return [];
}

function parseNumber(value, fieldName) {
  const number = Number(value);
  assert(Number.isFinite(number) && number >= 0, `${fieldName} must be a valid number.`);
  return Number(number.toFixed(2));
}

function encryptText(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptText(payload) {
  const buffer = Buffer.from(String(payload), 'base64');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const data = buffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function maskEnrollment(value) {
  const clean = normalizeText(value);
  if (!clean) {
    return '****';
  }
  return `****${clean.slice(-4)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function toTitleCase(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function createRecord(input) {
  const kind = normalizeText(input.kind || 'nota').toLowerCase();
  assert(RECORD_KINDS.includes(kind), 'Invalid record type.');

  const subject = normalizeText(input.subject);
  const title = normalizeText(input.title);
  const note = normalizeText(input.note);
  const term = normalizeText(input.term);
  const maxScore = input.maxScore === undefined || input.maxScore === '' ? 10 : parseNumber(input.maxScore, 'Max score');
  const score = input.score === undefined || input.score === '' ? null : parseNumber(input.score, 'Score');

  assert(subject, 'Subject is required.');
  assert(title, 'Title is required.');

  if (score !== null) {
    assert(score <= maxScore, 'Score cannot be greater than max score.');
  }

  return {
    id: crypto.randomUUID(),
    kind,
    subject,
    title,
    note,
    term,
    score,
    maxScore,
    createdAt: nowIso(),
  };
}

function createStudentSeed(input) {
  const rawEnrollment = normalizeText(input.enrollmentNumber);
  assert(rawEnrollment, 'Enrollment number is required.');

  return {
    id: input.id || crypto.randomUUID(),
    publicCode: input.publicCode || `ALU-${String(input.sequence || 1).padStart(4, '0')}`,
    fullName: toTitleCase(input.fullName),
    familyNames: normalizeList(input.familyNames).map(toTitleCase),
    address: normalizeText(input.address),
    birthDate: normalizeText(input.birthDate),
    notes: normalizeText(input.notes),
    enrollmentEncrypted: encryptText(rawEnrollment),
    enrollmentLast4: rawEnrollment.slice(-4),
    records: Array.isArray(input.records) ? input.records.map(createRecord) : [],
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso(),
  };
}

function buildSeedStore() {
  return {
    students: [
      createStudentSeed({
        id: 'student-ana-clara',
        sequence: 1,
        publicCode: 'ALU-0001',
        fullName: 'Ana Clara Souza',
        familyNames: ['Marcos Souza', 'Patricia Souza'],
        address: 'Rua das Flores, 123 - Centro - Sao Paulo/SP',
        birthDate: '2012-03-12',
        enrollmentNumber: '20240019',
        notes: 'Frequencia boa e participa bem em sala.',
        records: [
          {
            kind: 'nota',
            subject: 'Matematica',
            title: 'Prova 1',
            note: 'Dominio dos conteudos basicos.',
            term: '1 bimestre',
            score: 9.2,
            maxScore: 10,
          },
          {
            kind: 'trabalho',
            subject: 'Ciencias',
            title: 'Maquete do sistema solar',
            note: 'Entrega no prazo e com capricho.',
            term: '1 bimestre',
            score: 8.7,
            maxScore: 10,
          },
        ],
      }),
      createStudentSeed({
        id: 'student-joao-pedro',
        sequence: 2,
        publicCode: 'ALU-0002',
        fullName: 'Joao Pedro Lima',
        familyNames: ['Fernanda Lima', 'Carlos Lima'],
        address: 'Av. Brasil, 900 - Jardim America - Rio de Janeiro/RJ',
        birthDate: '2011-09-04',
        enrollmentNumber: '20240027',
        notes: 'Precisa reforcar leitura e producao textual.',
        records: [
          {
            kind: 'nota',
            subject: 'Portugues',
            title: 'Redacao',
            note: 'Texto coerente, com pequenas correcoes gramaticais.',
            term: '1 bimestre',
            score: 7.8,
            maxScore: 10,
          },
          {
            kind: 'observacao',
            subject: 'Comportamento',
            title: 'Acompanhamento de sala',
            note: 'Mantem postura respeitosa e colaborativa.',
            term: '1 bimestre',
            score: null,
            maxScore: 10,
          },
        ],
      }),
    ],
    meta: {
      version: 1,
      nextSequence: 3,
    },
  };
}

function ensureStoreShape(store) {
  if (!store || typeof store !== 'object' || !Array.isArray(store.students)) {
    return buildSeedStore();
  }

  store.meta = store.meta && typeof store.meta === 'object' ? store.meta : { version: 1, nextSequence: 1 };
  if (!Number.isInteger(store.meta.nextSequence)) {
    store.meta.nextSequence = store.students.length + 1;
  }

  store.students = store.students.map((student, index) => {
    const fallback = createStudentSeed({
      id: student.id || crypto.randomUUID(),
      sequence: index + 1,
      publicCode: student.publicCode || `ALU-${String(index + 1).padStart(4, '0')}`,
      fullName: student.fullName || 'Aluno',
      familyNames: student.familyNames || [],
      address: student.address || '',
      birthDate: student.birthDate || '',
      enrollmentNumber: student.enrollmentEncrypted ? decryptText(student.enrollmentEncrypted) : student.enrollmentNumber || '0000',
      notes: student.notes || '',
      records: Array.isArray(student.records) ? student.records : [],
      createdAt: student.createdAt || nowIso(),
      updatedAt: student.updatedAt || nowIso(),
    });

    return {
      ...fallback,
      id: student.id || fallback.id,
      publicCode: student.publicCode || fallback.publicCode,
      createdAt: student.createdAt || fallback.createdAt,
      updatedAt: student.updatedAt || fallback.updatedAt,
    };
  });

  return store;
}

let writeQueue = Promise.resolve();

async function atomicWrite(filePath, content) {
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rm(filePath, { force: true });
  await fs.rename(tempPath, filePath);
}

async function readStore() {
  if (useMongo && mongo) {
    await mongo.connect();
    const studentsCol = mongo.getCollection('students');
    const metaCol = mongo.getCollection('meta');
    const students = await studentsCol.find().sort({ createdAt: -1 }).toArray();
    const metaDoc = await metaCol.findOne({ _id: 'meta' });
    const meta = metaDoc || { version: 1, nextSequence: (students && students.length ? students.length + 1 : 1) };
    return ensureStoreShape({ students, meta });
  }

  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return ensureStoreShape(parsed);
  } catch {
    const seed = buildSeedStore();
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await atomicWrite(DATA_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
}

async function writeStore(store) {
  const nextStore = ensureStoreShape(store);

  if (useMongo && mongo) {
    await mongo.connect();
    const studentsCol = mongo.getCollection('students');
    const metaCol = mongo.getCollection('meta');
    // Replace collections (simple sync for small datasets)
    await studentsCol.deleteMany({});
    if (Array.isArray(nextStore.students) && nextStore.students.length) {
      await studentsCol.insertMany(nextStore.students);
    }
    await metaCol.updateOne({ _id: 'meta' }, { $set: nextStore.meta }, { upsert: true });
    return nextStore;
  }

  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await atomicWrite(DATA_FILE, JSON.stringify(nextStore, null, 2));
  });
  await writeQueue;
  return nextStore;
}

function sanitizeRecord(record) {
  return {
    id: record.id,
    kind: record.kind,
    subject: record.subject,
    title: record.title,
    note: record.note,
    term: record.term,
    score: record.score,
    maxScore: record.maxScore,
    createdAt: record.createdAt,
  };
}

function calculateAverage(records) {
  const scored = records.filter((record) => typeof record.score === 'number' && Number.isFinite(record.score));
  if (!scored.length) {
    return 0;
  }

  const total = scored.reduce((sum, record) => sum + (record.score / (record.maxScore || 10)) * 10, 0);
  return Number((total / scored.length).toFixed(2));
}

function sanitizeStudent(student) {
  const records = Array.isArray(student.records) ? student.records.map(sanitizeRecord) : [];
  return {
    id: student.id,
    publicCode: student.publicCode,
    fullName: student.fullName,
    familyNames: Array.isArray(student.familyNames) ? student.familyNames : [],
    address: student.address,
    birthDate: student.birthDate,
    notes: student.notes,
    enrollmentMasked: maskEnrollment(student.enrollmentLast4),
    enrollmentLast4: student.enrollmentLast4,
    recordCount: records.length,
    averageScore: calculateAverage(records),
    records,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
  };
}

function sanitizeStudentList(student) {
  const safe = sanitizeStudent(student);
  return {
    id: safe.id,
    publicCode: safe.publicCode,
    fullName: safe.fullName,
    familyNames: safe.familyNames,
    address: safe.address,
    birthDate: safe.birthDate,
    notes: safe.notes,
    enrollmentMasked: safe.enrollmentMasked,
    recordCount: safe.recordCount,
    averageScore: safe.averageScore,
    createdAt: safe.createdAt,
    updatedAt: safe.updatedAt,
  };
}

function buildDashboard(store) {
  const students = store.students || [];
  const totalRecords = students.reduce((sum, student) => sum + (student.records?.length || 0), 0);
  const overallScores = students.flatMap((student) => (student.records || []).filter((record) => typeof record.score === 'number'));
  const overallAverage = overallScores.length
    ? Number(
        (
          overallScores.reduce((sum, record) => sum + (record.score / (record.maxScore || 10)) * 10, 0) /
          overallScores.length
        ).toFixed(2)
      )
    : 0;

  return {
    totalStudents: students.length,
    totalRecords,
    averageScore: overallAverage,
    studentsWithRecords: students.filter((student) => (student.records || []).length > 0).length,
    recentStudents: students.slice(0, 5).map(sanitizeStudentList),
  };
}

async function createStudent(body) {
  const fullName = normalizeText(body.fullName);
  const familyNames = normalizeList(body.familyNames);
  const address = normalizeText(body.address);
  const enrollmentNumber = normalizeText(body.enrollmentNumber);
  const birthDate = normalizeText(body.birthDate);
  const notes = normalizeText(body.notes);

  assert(fullName, 'Full name is required.');
  assert(enrollmentNumber, 'Enrollment number is required.');
  assert(birthDate, 'Birth date is required.');

  if (useMongo && mongo) {
    await mongo.connect();
    const metaCol = mongo.getCollection('meta');
    const studentsCol = mongo.getCollection('students');
    const metaDoc = (await metaCol.findOne({ _id: 'meta' })) || { version: 1, nextSequence: 1 };
    const seq = metaDoc.nextSequence || 1;
    const student = createStudentSeed({
      id: crypto.randomUUID(),
      sequence: seq,
      fullName,
      familyNames,
      address,
      enrollmentNumber,
      birthDate,
      notes,
      records: [],
    });

    await studentsCol.insertOne(student);
    await metaCol.updateOne({ _id: 'meta' }, { $set: { version: metaDoc.version || 1, nextSequence: seq + 1 } }, { upsert: true });
    return sanitizeStudent(student);
  }

  const store = await readStore();
  const student = createStudentSeed({
    id: crypto.randomUUID(),
    sequence: store.meta.nextSequence,
    fullName,
    familyNames,
    address,
    enrollmentNumber,
    birthDate,
    notes,
    records: [],
  });

  store.meta.nextSequence += 1;
  store.students.unshift(student);
  await writeStore(store);
  return sanitizeStudent(student);
}

async function updateStudent(studentId, body) {
  if (useMongo && mongo) {
    await mongo.connect();
    const studentsCol = mongo.getCollection('students');
    const doc = await studentsCol.findOne({ id: studentId });
    assert(doc, 'Student not found.');

    const updates = {};
    if (body.fullName) updates.fullName = toTitleCase(normalizeText(body.fullName));
    if (body.familyNames !== undefined) updates.familyNames = normalizeList(body.familyNames).map(toTitleCase);
    if (body.address !== undefined) updates.address = normalizeText(body.address);
    if (body.birthDate !== undefined) updates.birthDate = normalizeText(body.birthDate);
    if (body.notes !== undefined) updates.notes = normalizeText(body.notes);
    if (body.enrollmentNumber !== undefined && body.enrollmentNumber !== '') {
      updates.enrollmentEncrypted = encryptText(normalizeText(body.enrollmentNumber));
      updates.enrollmentLast4 = normalizeText(body.enrollmentNumber).slice(-4);
    }
    if (Object.keys(updates).length) {
      updates.updatedAt = nowIso();
      await studentsCol.updateOne({ id: studentId }, { $set: updates });
    }
    const updated = await studentsCol.findOne({ id: studentId });
    return sanitizeStudent(updated);
  }

  const store = await readStore();
  const student = store.students.find((entry) => entry.id === studentId);
  assert(student, 'Student not found.');

  const fullName = normalizeText(body.fullName);
  const familyNames = body.familyNames !== undefined ? normalizeList(body.familyNames) : null;
  const address = body.address !== undefined ? normalizeText(body.address) : null;
  const birthDate = body.birthDate !== undefined ? normalizeText(body.birthDate) : null;
  const notes = body.notes !== undefined ? normalizeText(body.notes) : null;
  const enrollmentNumber = body.enrollmentNumber !== undefined ? normalizeText(body.enrollmentNumber) : null;

  if (fullName) student.fullName = toTitleCase(fullName);
  if (familyNames) student.familyNames = familyNames.map(toTitleCase);
  if (address !== null) student.address = address;
  if (birthDate !== null) student.birthDate = birthDate;
  if (notes !== null) student.notes = notes;
  if (enrollmentNumber) {
    student.enrollmentEncrypted = encryptText(enrollmentNumber);
    student.enrollmentLast4 = enrollmentNumber.slice(-4);
  }

  student.updatedAt = nowIso();
  await writeStore(store);
  return sanitizeStudent(student);
}

async function addRecord(studentId, body) {
  if (useMongo && mongo) {
    await mongo.connect();
    const studentsCol = mongo.getCollection('students');
    const student = await studentsCol.findOne({ id: studentId });
    assert(student, 'Student not found.');
    const record = createRecord(body || {});
    await studentsCol.updateOne({ id: studentId }, { $push: { records: { $each: [record], $position: 0 } }, $set: { updatedAt: nowIso() } });
    return sanitizeRecord(record);
  }

  const store = await readStore();
  const student = store.students.find((entry) => entry.id === studentId);
  assert(student, 'Student not found.');

  const record = createRecord(body || {});
  student.records = Array.isArray(student.records) ? student.records : [];
  student.records.unshift(record);
  student.updatedAt = nowIso();
  await writeStore(store);
  return sanitizeRecord(record);
}

async function listStudents(query = '') {
  const search = normalizeText(query).toLowerCase();
  if (useMongo && mongo) {
    await mongo.connect();
    const studentsCol = mongo.getCollection('students');
    const filter = {};
    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [{ fullName: re }, { publicCode: re }, { address: re }];
    }
    const docs = await studentsCol.find(filter).sort({ createdAt: -1 }).toArray();
    return docs.map(sanitizeStudentList);
  }

  const store = await readStore();
  const students = store.students.filter((student) => {
    if (!search) return true;
    return (
      student.fullName.toLowerCase().includes(search) ||
      student.publicCode.toLowerCase().includes(search) ||
      student.address.toLowerCase().includes(search)
    );
  });
  return students.map(sanitizeStudentList);
}

async function getStudent(studentId) {
  if (useMongo && mongo) {
    await mongo.connect();
    const studentsCol = mongo.getCollection('students');
    const student = await studentsCol.findOne({ id: studentId });
    assert(student, 'Student not found.');
    return sanitizeStudent(student);
  }

  const store = await readStore();
  const student = store.students.find((entry) => entry.id === studentId);
  assert(student, 'Student not found.');
  return sanitizeStudent(student);
}

async function getBulletin(studentId) {
  const student = await getStudent(studentId);
  const recordsByTerm = student.records.reduce((groups, record) => {
    const term = record.term || 'Sem periodo';
    if (!groups[term]) groups[term] = [];
    groups[term].push(record);
    return groups;
  }, {});

  return {
    student,
    recordsByTerm,
    averageScore: student.averageScore,
    generatedAt: nowIso(),
  };
}

module.exports = {
  createHttpError,
  readStore,
  writeStore,
  buildDashboard,
  createStudent,
  updateStudent,
  addRecord,
  listStudents,
  getStudent,
  getBulletin,
  sanitizeStudent,
  sanitizeStudentList,
  sanitizeRecord,
  calculateAverage,
  maskEnrollment,
  encryptText,
  decryptText,
  RECORD_KINDS,
};
