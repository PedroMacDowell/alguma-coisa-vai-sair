import { useEffect, useMemo, useState } from 'react';

const RECORD_KIND_OPTIONS = [
  { value: 'nota', label: 'Nota' },
  { value: 'trabalho', label: 'Trabalho' },
  { value: 'observacao', label: 'Observacao' },
];

const initialStudentForm = {
  fullName: '',
  enrollmentNumber: '',
  birthDate: '',
  address: '',
  notes: '',
};

const initialGradeForm = {
  kind: 'nota',
  subject: '',
  title: '',
  term: '1 bimestre',
  score: '',
  maxScore: '10',
  note: '',
};

const initialLoginForm = {
  username: '',
  password: '',
};

const SCHOOL_NAME = 'E.M. Rachide da Glória Salim Saker';
const SCHOOL_TAGLINE = 'Niterói';
const SCHOOL_HEADER_LINES = [
  'ESTADO DO RIO DE JANEIRO',
  'PREFEITURA MUNICIPAL DE NITERÓI',
  'SECRETARIA DE EDUCAÇÃO, CIÊNCIA E TECNOLOGIA',
  'FUNDAÇÃO MUNICIPAL DE EDUCAÇÃO DE NITERÓI',
];
const SCHOOL_ADDRESS = 'Rua Jandira Pereira 620/623 - Santa Barbara - Niterói - RJ - CEP 24.141.400';
const SCHOOL_EMAIL = 'emrachidesaker@educacao.niteroi.rj.gov.br';
const SCHOOL_PHONE = '21-99958-3923 / 99757-9268';
const SCHOOL_DECREE = 'Decreto de Criação 2790/77 de 07/01/1977';
const STANDARD_TERMS = [1, 2, 3, 4];

const currencyLike = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function parseTermOrder(term) {
  const match = String(term || '').match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function formatTermHeader(termNumber) {
  return `${termNumber}º bimestre`;
}

function normalizeScore(value, maxScore) {
  const score = Number(value);
  const max = Number(maxScore || 10);
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) {
    return null;
  }
  return Number(((score / max) * 10).toFixed(2));
}

function getBulletinStatus(value) {
  if (value === null || value === undefined) {
    return { label: 'Sem nota', className: 'bulletin-status neutral' };
  }

  if (value >= 6) {
    return { label: 'Aprovado', className: 'bulletin-status approved' };
  }

  if (value >= 4) {
    return { label: 'Recuperação', className: 'bulletin-status recovery' };
  }

  return { label: 'Reprovado', className: 'bulletin-status failed' };
}

function average(values) {
  if (!values.length) {
    return null;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function apiFetch(path, { method = 'GET', body, token } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(`/api${path}`, {
    method,
    headers,
    body,
  }).then(async (response) => {
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(payload.message || 'Não foi possível concluir a operação.');
    }
    return payload;
  });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date);
}

function formatPrintDateTime(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return currencyLike.format(Number.isFinite(number) ? number : 0);
}

function badgeClass(kind) {
  if (kind === 'nota') return 'kind-badge kind-nota';
  if (kind === 'trabalho') return 'kind-badge kind-trabalho';
  return 'kind-badge kind-observacao';
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('teacherToken') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(localStorage.getItem('teacherToken')));
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [students, setStudents] = useState([]);
  const [dashboard, setDashboard] = useState({
    totalStudents: 0,
    totalRecords: 0,
    averageScore: 0,
    recentStudents: [],
  });
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [bulletin, setBulletin] = useState(null);
  const [studentForm, setStudentForm] = useState(initialStudentForm);
  const [gradeForm, setGradeForm] = useState(initialGradeForm);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);
  const [savingGrade, setSavingGrade] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('cadastro');

  useEffect(() => {
    document.documentElement.dataset.contrast = 'more';
  }, []);

  const filteredStudents = useMemo(() => {
    if (!search.trim()) {
      return students;
    }

    const term = search.trim().toLowerCase();
    return students.filter((student) => {
      return (
        student.fullName?.toLowerCase().includes(term) ||
        student.publicCode?.toLowerCase().includes(term) ||
        student.address?.toLowerCase().includes(term)
      );
    });
  }, [students, search]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadBootstrap();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!selectedStudentId) return;
    loadStudent(selectedStudentId);
  }, [selectedStudentId]);

  const bulletinTermEntries = useMemo(() => {
    if (!bulletin?.recordsByTerm) {
      return [];
    }

    return Object.entries(bulletin.recordsByTerm).sort(([termA], [termB]) => {
      const orderDiff = parseTermOrder(termA) - parseTermOrder(termB);
      if (orderDiff !== 0) return orderDiff;
      return String(termA).localeCompare(String(termB), 'pt-BR');
    });
  }, [bulletin]);

  const bulletinSubjectRows = useMemo(() => {
    const subjectMap = new Map();

    bulletinTermEntries.forEach(([term, records]) => {
      const termOrder = parseTermOrder(term);

      records.forEach((record) => {
        const subject = record.subject || 'Sem disciplina';
        if (!subjectMap.has(subject)) {
          subjectMap.set(subject, {
            subject,
            termCells: new Map(),
            scores: [],
          });
        }

        const row = subjectMap.get(subject);
        if (!row.termCells.has(termOrder)) {
          row.termCells.set(termOrder, []);
        }

        const cellRecords = row.termCells.get(termOrder);
        cellRecords.push(record);

        const normalizedScore = normalizeScore(record.score, record.maxScore);
        if (normalizedScore !== null) {
          row.scores.push(normalizedScore);
        }
      });
    });

    return Array.from(subjectMap.values()).sort((a, b) => a.subject.localeCompare(b.subject, 'pt-BR'));
  }, [bulletinTermEntries]);

  const bulletinYear = useMemo(() => {
    const date = new Date(bulletin?.generatedAt || Date.now());
    return Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
  }, [bulletin]);

  const bulletinAverage = bulletin?.averageScore ?? selectedStudent?.averageScore ?? 0;
  const bulletinStatus = getBulletinStatus(Number(bulletinAverage) || null);
  const totalRecords = selectedStudent?.records?.length || 0;
  const totalSubjects = bulletinSubjectRows.length;
  const responsibleName = selectedStudent?.familyNames?.[0] || 'Não informado';
  const issueDate = formatPrintDateTime(bulletin?.generatedAt || Date.now());

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      });
      localStorage.setItem('teacherToken', result.token);
      setToken(result.token);
      setIsAuthenticated(true);
      setMessage('Login efetuado com sucesso.');
      setLoginForm(initialLoginForm);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('teacherToken');
    setToken('');
    setIsAuthenticated(false);
    setStudents([]);
    setSelectedStudentId('');
    setSelectedStudent(null);
    setBulletin(null);
    setMessage('Sessão encerrada.');
  }

  async function loadBootstrap() {
    setLoading(true);
    setError('');
    try {
      const payload = await apiFetch('/bootstrap', { token });
      setStudents(payload.students || []);
      setDashboard(payload.dashboard || dashboard);
      if (payload.students?.length) {
        setSelectedStudentId(payload.students[0].id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadStudent(studentId) {
    if (!studentId) return;
    setLoading(true);
    setError('');
    try {
      const [studentData, bulletinData] = await Promise.all([
        apiFetch(`/students/${studentId}`, { token }),
        apiFetch(`/students/${studentId}/bulletin`, { token }),
      ]);
      setSelectedStudent(studentData);
      setBulletin(bulletinData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStudentSubmit(event) {
    event.preventDefault();
    setSavingStudent(true);
    setError('');
    try {
      const student = await apiFetch('/students', {
        method: 'POST',
        body: JSON.stringify(studentForm),
        token,
      });
      setStudentForm(initialStudentForm);
      setMessage('Aluno cadastrado com sucesso.');
      await loadBootstrap();
      setSelectedStudentId(student.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingStudent(false);
    }
  }

  async function handleGradeSubmit(event) {
    event.preventDefault();
    if (!selectedStudentId) {
      setError('Selecione um aluno antes de lançar notas.');
      return;
    }
    setSavingGrade(true);
    setError('');
    try {
      await apiFetch(`/students/${selectedStudentId}/records`, {
        method: 'POST',
        body: JSON.stringify(gradeForm),
        token,
      });
      setGradeForm(initialGradeForm);
      setMessage('Nota lançada com sucesso.');
      await loadBootstrap();
      await loadStudent(selectedStudentId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingGrade(false);
    }
  }

  const totalScore = (selectedStudent?.records || [])
    .reduce((sum, item) => sum + (Number(item.score) || 0), 0)
    .toFixed(2);

  if (!isAuthenticated) {
    return (
      <div className="app-shell">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />

        <main className="panel soft-panel auth-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Acesso do professor</p>
              <h1>Login para lançar notas</h1>
            </div>
          </div>

          <form className="form-grid" onSubmit={handleLogin}>
            <label>
              Usuário
              <input
                value={loginForm.username}
                onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="professor"
                required
              />
            </label>

            <label>
              Senha
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="123456"
                required
              />
            </label>

            <button className="primary-button" disabled={loading}>
              {loading ? 'Conectando...' : 'Entrar'}
            </button>
          </form>

          <div className="privacy-box">
            <p>Use as credenciais padrão para começar: professor / 123456.</p>
          </div>

          {error ? <div className="toast error">{error}</div> : null}
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="hero">
        <div className="hero-copy-block">
          <p className="eyebrow">Sistema Escolar</p>
          <h1>Cadastro de alunos, boletim e lançamento de notas</h1>
          <p className="hero-copy">
            Faça login como professor, cadastre alunos, lance notas, veja soma das notas e gere boletins com dashboard.
          </p>

          <nav className="nav-tabs" role="tablist" aria-label="Sessões">
            <button
              type="button"
              className={`tab-button ${activeTab === 'cadastro' ? 'active' : ''}`}
              onClick={() => setActiveTab('cadastro')}
            >
              Cadastro de alunos
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === 'lancamento' ? 'active' : ''}`}
              onClick={() => setActiveTab('lancamento')}
            >
              Lançamento
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === 'boletim' ? 'active' : ''}`}
              onClick={() => setActiveTab('boletim')}
            >
              Boletim
            </button>
          </nav>
        </div>
      </header>

      <main className="layout">
        {/* Cadastro de alunos */}
        {activeTab === 'cadastro' && (
          <section className="content-grid">
          <article className="panel soft-panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Cadastro de alunos</p>
                <h2>Registrar novo aluno</h2>
              </div>
            </div>

            <form className="form-grid" onSubmit={handleStudentSubmit}>
              <label>
                Nome completo
                <input
                  value={studentForm.fullName}
                  onChange={(event) => setStudentForm((current) => ({ ...current, fullName: event.target.value }))}
                  placeholder="Nome do aluno"
                  required
                />
              </label>

              <label>
                Matrícula
                <input
                  value={studentForm.enrollmentNumber}
                  onChange={(event) =>
                    setStudentForm((current) => ({ ...current, enrollmentNumber: event.target.value }))
                  }
                  placeholder="Número da matrícula"
                  required
                />
              </label>

              <label>
                Data de nascimento
                <input
                  type="date"
                  value={studentForm.birthDate}
                  onChange={(event) => setStudentForm((current) => ({ ...current, birthDate: event.target.value }))}
                  required
                />
              </label>

              <label>
                Endereço
                <input
                  value={studentForm.address}
                  onChange={(event) => setStudentForm((current) => ({ ...current, address: event.target.value }))}
                  placeholder="Rua, nº, bairro, cidade"
                  required
                />
              </label>

              <label className="full-span">
                Notas gerais
                <textarea
                  rows="4"
                  value={studentForm.notes}
                  onChange={(event) => setStudentForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Observações sobre o acompanhamento do aluno"
                />
              </label>

              <button className="primary-button" disabled={savingStudent}>
                {savingStudent ? 'Salvando...' : 'Cadastrar aluno'}
              </button>
            </form>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Alunos cadastrados</p>
                <h2>Buscar e selecionar</h2>
              </div>
            </div>

            <label className="search-field">
              Buscar aluno
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome, código interno ou endereço"
              />
            </label>

            <div className="student-list">
              {filteredStudents.map((student) => {
                const active = student.id === selectedStudentId;
                return (
                  <button
                    type="button"
                    key={student.id}
                    className={`student-card ${active ? 'active' : ''}`}
                    onClick={() => setSelectedStudentId(student.id)}
                  >
                    <div className="student-card-head">
                      <strong>{student.fullName}</strong>
                      <span>{student.publicCode}</span>
                    </div>
                    <div className="student-card-body">
                      <span>{student.address || 'Sem endereço'}</span>
                      <span>Nascimento: {formatDate(student.birthDate)}</span>
                      <span>{student.recordCount || 0} registros</span>
                    </div>
                  </button>
                );
              })}
              {!filteredStudents.length ? <p className="empty-state">Nenhum aluno encontrado.</p> : null}
            </div>
          </article>
          </section>
        )}

        {/* Lançamento de notas */}
        {activeTab === 'lancamento' && (
          <section className="dashboard-grid">
            <article className="panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Lançar notas</p>
                <h2>Aluno selecionado</h2>
              </div>
              <button type="button" className="ghost-button" onClick={handleLogout}>
                Sair
              </button>
            </div>

            {selectedStudent ? (
              <>
                <div className="student-summary student-summary-row">
                  <div className="student-summary-item">
                    <span className="summary-label">Aluno</span>
                    <strong>{selectedStudent.fullName}</strong>
                  </div>
                  <div className="student-summary-item">
                    <span className="summary-label">Matrícula</span>
                    <strong>{selectedStudent.enrollmentMasked}</strong>
                  </div>
                  <div className="student-summary-item">
                    <span className="summary-label">Soma das notas</span>
                    <strong>{formatCurrency(totalScore)}</strong>
                  </div>
                </div>

                <form className="form-grid record-form" onSubmit={handleGradeSubmit}>
                  <label>
                    Tipo
                    <select
                      value={gradeForm.kind}
                      onChange={(event) => setGradeForm((current) => ({ ...current, kind: event.target.value }))}
                    >
                      {RECORD_KIND_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Disciplina
                    <input
                      value={gradeForm.subject}
                      onChange={(event) => setGradeForm((current) => ({ ...current, subject: event.target.value }))}
                      placeholder="Matemática, Português..."
                      required
                    />
                  </label>

                  <label>
                    Título
                    <input
                      value={gradeForm.title}
                      onChange={(event) => setGradeForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Prova 1, Trabalho..."
                      required
                    />
                  </label>

                  <label>
                    Período
                    <input
                      value={gradeForm.term}
                      onChange={(event) => setGradeForm((current) => ({ ...current, term: event.target.value }))}
                      placeholder="1 bimestre"
                      required
                    />
                  </label>

                  <label>
                    Nota
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={gradeForm.score}
                      onChange={(event) => setGradeForm((current) => ({ ...current, score: event.target.value }))}
                      placeholder="0.00"
                    />
                  </label>

                  <label>
                    Nota máxima
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={gradeForm.maxScore}
                      onChange={(event) => setGradeForm((current) => ({ ...current, maxScore: event.target.value }))}
                    />
                  </label>

                  <label className="full-span">
                    Observação
                    <textarea
                      rows="3"
                      value={gradeForm.note}
                      onChange={(event) => setGradeForm((current) => ({ ...current, note: event.target.value }))}
                      placeholder="Comentário sobre a nota"
                    />
                  </label>

                  <button className="primary-button" disabled={savingGrade}>
                    {savingGrade ? 'Salvando...' : 'Lançar nota'}
                  </button>
                </form>

                <div className="records-table">
                  {selectedStudent.records?.length ? (
                    selectedStudent.records.map((record) => (
                      <div key={record.id} className="record-row">
                        <div className="record-main">
                          <span className={badgeClass(record.kind)}>{record.kind}</span>
                          <strong>{record.subject}</strong>
                          <p>{record.title}</p>
                        </div>
                        <div className="record-meta">
                          <span>{record.term || 'Sem período'}</span>
                          <span>
                            {record.score === null || record.score === undefined
                              ? 'Sem nota'
                              : `${formatCurrency(record.score)} / ${formatCurrency(record.maxScore || 10)}`}
                          </span>
                          <small>{record.note || 'Sem observação'}</small>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">Nenhum registro lançado para este aluno.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="empty-state">Selecione um aluno para visualizar o boletim.</p>
            )}
            </article>
          </section>
        )}

        {/* Boletim */}
        {activeTab === 'boletim' && (
          <section className="dashboard-grid">
            <article className="panel bulletin-panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Boletim</p>
                <h2>Gerar relatório</h2>
              </div>
            </div>

            <div className="bulletin-sheet" id="print-sheet">
              {selectedStudent && bulletin ? (
                <>
                  <header className="bulletin-government-header">
                    <img className="bulletin-crest" src="/niteroi-logo.png" alt="Brasão de Niterói" />
                    <div className="bulletin-government-lines">
                      {SCHOOL_HEADER_LINES.map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </div>
                  </header>

                  <section className="bulletin-school-block">
                    <div className="bulletin-school-row">
                      <span>UNIDADE ESCOLAR</span>
                      <strong>{SCHOOL_NAME}</strong>
                      <span className="bulletin-school-decree">{SCHOOL_DECREE}</span>
                    </div>
                    <div className="bulletin-school-row bulletin-school-row--wide">
                      <span>ENDEREÇO</span>
                      <strong>{SCHOOL_ADDRESS}</strong>
                    </div>
                    <div className="bulletin-school-row">
                      <span>E-MAIL</span>
                      <strong>{SCHOOL_EMAIL}</strong>
                      <span className="bulletin-school-phone">{SCHOOL_PHONE}</span>
                    </div>
                    <div className="bulletin-school-row">
                      <span>ALUNO</span>
                      <strong>{selectedStudent.fullName}</strong>
                      <span className="bulletin-school-period">{bulletinYear}</span>
                    </div>
                    <div className="bulletin-school-row">
                      <span>FILIAÇÃO</span>
                      <strong>{selectedStudent.familyNames?.join(', ') || 'Não informado'}</strong>
                    </div>
                    <div className="bulletin-school-row">
                      <span>NASCIDO EM</span>
                      <strong>{formatDate(selectedStudent.birthDate)}</strong>
                    </div>
                  </section>

                  <h3 className="bulletin-doc-title">HISTÓRICO ESCOLAR</h3>

                  <div className="bulletin-student-card bulletin-student-card--compact">
                    <div className="bulletin-info-item">
                      <span>Matrícula</span>
                      <strong>{selectedStudent.enrollmentMasked}</strong>
                    </div>
                    <div className="bulletin-info-item">
                      <span>Responsável</span>
                      <strong>{responsibleName}</strong>
                    </div>
                    <div className="bulletin-info-item">
                      <span>Período letivo</span>
                      <strong>{bulletinYear}</strong>
                    </div>
                    <div className="bulletin-info-item">
                      <span>Média geral</span>
                      <strong>{formatCurrency(bulletinAverage || 0)}</strong>
                    </div>
                    <div className="bulletin-info-item">
                      <span>Situação geral</span>
                      <strong>{bulletinStatus.label}</strong>
                    </div>
                    <div className="bulletin-info-item">
                      <span>Endereço do aluno</span>
                      <strong>{selectedStudent.address || 'Não informado'}</strong>
                    </div>
                  </div>

                  <div className="bulletin-table-card">
                    <div className="bulletin-table-head bulletin-table-head--formal">
                      <span>Disciplinas</span>
                      {STANDARD_TERMS.map((termNumber) => (
                        <span key={termNumber}>{formatTermHeader(termNumber)}</span>
                      ))}
                      <span>Média final</span>
                      <span>Situação</span>
                    </div>

                    <div className="bulletin-table-body">
                      {bulletinSubjectRows.length ? (
                        bulletinSubjectRows.map((row) => {
                          const rowAverage = average(row.scores);
                          const rowStatus = getBulletinStatus(rowAverage);

                          return (
                            <div key={row.subject} className="bulletin-table-row bulletin-table-row--formal">
                              <div className="bulletin-subject-cell">
                                <strong>{row.subject}</strong>
                              </div>

                              {STANDARD_TERMS.map((termNumber) => {
                                const cellRecords = row.termCells.get(termNumber) || [];
                                const cellScores = cellRecords
                                  .map((record) => normalizeScore(record.score, record.maxScore))
                                  .filter((score) => score !== null);
                                const cellAverage = average(cellScores);

                                return (
                                  <div key={termNumber} className={`bulletin-grade-cell ${cellAverage === null ? 'is-empty' : ''}`}>
                                    {cellAverage === null ? '—' : formatCurrency(cellAverage)}
                                  </div>
                                );
                              })}

                              <div className="bulletin-grade-cell bulletin-grade-cell--summary">
                                {rowAverage === null ? '—' : formatCurrency(rowAverage)}
                              </div>

                              <div className={rowStatus.className}>{rowStatus.label}</div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="bulletin-empty bulletin-empty--large">Sem registros para imprimir.</div>
                      )}
                    </div>
                  </div>

                  <div className="bulletin-lower-grid">
                    <section className="bulletin-summary-card">
                      <div className="bulletin-section-title">Resumo</div>
                      <div className="bulletin-summary-grid">
                        <div className="bulletin-summary-item">
                          <span>Média geral do aluno</span>
                          <strong>{formatCurrency(bulletinAverage || 0)}</strong>
                        </div>
                        <div className="bulletin-summary-item">
                          <span>Total de lançamentos</span>
                          <strong>{totalRecords}</strong>
                        </div>
                        <div className="bulletin-summary-item">
                          <span>Disciplinas lançadas</span>
                          <strong>{totalSubjects}</strong>
                        </div>
                        <div className="bulletin-summary-item">
                          <span>Situação geral</span>
                          <strong>{bulletinStatus.label}</strong>
                        </div>
                      </div>
                    </section>

                    <aside className="bulletin-legend-card">
                      <div className="bulletin-section-title">Legenda</div>
                      <ul className="bulletin-legend-list">
                        <li>
                          <span className="bulletin-legend-chip approved">Aprovado</span>
                          <p>Média igual ou maior que 6,0.</p>
                        </li>
                        <li>
                          <span className="bulletin-legend-chip recovery">Recuperação</span>
                          <p>Média entre 4,0 e 5,9.</p>
                        </li>
                        <li>
                          <span className="bulletin-legend-chip failed">Reprovado</span>
                          <p>Média menor que 4,0.</p>
                        </li>
                      </ul>
                    </aside>
                  </div>

                  <section className="bulletin-notes-card">
                    <div className="bulletin-section-title">Observações</div>
                    <p>{selectedStudent.notes || 'Sem observações registradas.'}</p>
                  </section>

                  <footer className="bulletin-footer">
                    <div className="bulletin-footer-date">
                      <span>Data de emissão</span>
                      <strong>{issueDate}</strong>
                    </div>

                    <div className="bulletin-signature">
                      <span className="bulletin-signature-line" />
                      <strong>Coordenação Pedagógica</strong>
                    </div>

                    <div className="bulletin-signature">
                      <span className="bulletin-signature-line" />
                      <strong>Direção Escolar</strong>
                    </div>
                  </footer>
                </>
              ) : (
                <div className="bulletin-empty bulletin-empty--large">Selecione um aluno para visualizar o boletim.</div>
              )}
            </div>
            </article>
          </section>
        )}

        {/* Dashboard removed per user request */}
      </main>

      <section className="panel status-band">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Resumo geral</p>
            <h2>Estatísticas rápidas</h2>
          </div>
        </div>

        <div className="status-grid">
          <div className="status-card">
            <span>Total de alunos</span>
            <strong>{dashboard.totalStudents}</strong>
          </div>
          <div className="status-card">
            <span>Total de lançamentos</span>
            <strong>{dashboard.totalRecords}</strong>
          </div>
          <div className="status-card">
            <span>Média geral</span>
            <strong>{formatCurrency(dashboard.averageScore)}</strong>
          </div>
        </div>

        <div className="privacy-box" style={{marginTop: '16px'}}>
          <p>O professor precisa se autenticar para cadastrar alunos e lançar notas.</p>
        </div>
      </section>

      {loading ? <div className="toast neutral">Carregando dados...</div> : null}
      {error ? <div className="toast error">{error}</div> : null}
      {message ? <div className="toast success">{message}</div> : null}
    </div>
  );
}

export default App;
