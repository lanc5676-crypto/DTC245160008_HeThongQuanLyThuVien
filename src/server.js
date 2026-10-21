require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const promClient = require('@prometheus-io/client');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || 'local-demo-secret-change-before-deploying';
const logDirectory = process.env.LOG_DIR || path.join(__dirname, '..', 'logs');
const logFile = path.join(logDirectory, 'app.log');

try {
  fs.mkdirSync(logDirectory, { recursive: true });
} catch (error) {
  console.error(JSON.stringify({ level: 'error', event: 'log_directory_create_failed', message: error.message }));
}

function log(level, event, details = {}) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...details });
  if (level === 'error') console.error(line);
  else console.log(line);
  try {
    fs.appendFileSync(logFile, `${line}\n`);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'log_file_write_failed', message: error.message }));
  }
}

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });
const requestDuration = new promClient.Histogram({
  name: 'library_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  if (!req.body || typeof req.body !== 'object') req.body = {};
  next();
});
app.use(cookieParser());
app.use((req, res, next) => {
  const startedAt = Date.now();
  const end = requestDuration.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.route?.path || req.path, status_code: String(res.statusCode) });
    log(res.statusCode >= 500 ? 'error' : 'info', 'http_request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - startedAt,
    });
  });
  next();
});

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requireAuth(req, res, next) {
  const token = req.cookies.library_session;
  if (!token) return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch (error) {
    log('warn', 'auth_token_rejected', { message: error.message });
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }
}

function requiredText(body, field, label) {
  const value = typeof body[field] === 'string' ? body[field].trim() : '';
  if (!value) throw Object.assign(new Error(`${label} không được để trống.`), { status: 400 });
  return value;
}

async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
  if (!user.rowCount || !(await bcrypt.compare(password, user.rows[0].password_hash))) {
    log('warn', 'login_failed', { username: username || 'unknown' });
    return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
  }
  const token = jwt.sign({ id: user.rows[0].id, username: user.rows[0].username }, jwtSecret, { expiresIn: '8h' });
  res.cookie('library_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 8 * 60 * 60 * 1000,
  });
  log('info', 'login_succeeded', { username });
  return res.json({ username });
}));

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('library_session', { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true' });
  log('info', 'logout');
  res.status(204).end();
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ username: req.user.username }));

app.get('/api/dashboard', requireAuth, asyncRoute(async (req, res) => {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM books) AS total_books,
      (SELECT COUNT(*) FROM books WHERE status = 'available') AS available_books,
      (SELECT COUNT(*) FROM loans WHERE returned_at IS NULL) AS active_loans,
      (SELECT COUNT(*) FROM readers) AS total_readers,
      (SELECT COUNT(*) FROM loans WHERE returned_at IS NULL AND due_at < CURRENT_DATE) AS overdue_loans
  `);
  res.json(result.rows[0]);
}));

app.get('/api/books', requireAuth, asyncRoute(async (req, res) => {
  const search = `%${String(req.query.q || '').trim()}%`;
  const result = await pool.query(
    `SELECT id, title, author, publication_year, genre, status FROM books
     WHERE title ILIKE $1 OR author ILIKE $1 OR genre ILIKE $1 OR CAST(id AS TEXT) ILIKE $1
     ORDER BY id DESC`,
    [search],
  );
  res.json(result.rows);
}));

app.post('/api/books', requireAuth, asyncRoute(async (req, res) => {
  const title = requiredText(req.body, 'title', 'Tên sách');
  const author = requiredText(req.body, 'author', 'Tác giả');
  const genre = requiredText(req.body, 'genre', 'Thể loại');
  const year = Number(req.body.publication_year);
  if (!Number.isInteger(year) || year < 0 || year > 2100) throw Object.assign(new Error('Năm xuất bản không hợp lệ.'), { status: 400 });
  const result = await pool.query(
    'INSERT INTO books (title, author, publication_year, genre) VALUES ($1, $2, $3, $4) RETURNING *',
    [title, author, year, genre],
  );
  log('info', 'book_created', { book_id: result.rows[0].id, title });
  res.status(201).json(result.rows[0]);
}));

app.put('/api/books/:id', requireAuth, asyncRoute(async (req, res) => {
  const title = requiredText(req.body, 'title', 'Tên sách');
  const author = requiredText(req.body, 'author', 'Tác giả');
  const genre = requiredText(req.body, 'genre', 'Thể loại');
  const year = Number(req.body.publication_year);
  if (!Number.isInteger(year) || year < 0 || year > 2100) throw Object.assign(new Error('Năm xuất bản không hợp lệ.'), { status: 400 });
  const result = await pool.query(
    'UPDATE books SET title = $1, author = $2, publication_year = $3, genre = $4 WHERE id = $5 RETURNING *',
    [title, author, year, genre, req.params.id],
  );
  if (!result.rowCount) throw Object.assign(new Error('Không tìm thấy sách.'), { status: 404 });
  log('info', 'book_updated', { book_id: req.params.id });
  res.json(result.rows[0]);
}));

app.delete('/api/books/:id', requireAuth, asyncRoute(async (req, res) => {
  const result = await pool.query('DELETE FROM books WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rowCount) throw Object.assign(new Error('Không tìm thấy sách.'), { status: 404 });
  log('info', 'book_deleted', { book_id: req.params.id });
  res.status(204).end();
}));

app.get('/api/readers', requireAuth, asyncRoute(async (req, res) => {
  const search = `%${String(req.query.q || '').trim()}%`;
  const result = await pool.query(
    `SELECT id, student_code, full_name, class_name, phone FROM readers
     WHERE student_code ILIKE $1 OR full_name ILIKE $1 OR class_name ILIKE $1
     ORDER BY id DESC`,
    [search],
  );
  res.json(result.rows);
}));

app.post('/api/readers', requireAuth, asyncRoute(async (req, res) => {
  const values = [
    requiredText(req.body, 'student_code', 'Mã độc giả'),
    requiredText(req.body, 'full_name', 'Họ tên'),
    requiredText(req.body, 'class_name', 'Lớp'),
    requiredText(req.body, 'phone', 'Số điện thoại'),
  ];
  const result = await pool.query(
    'INSERT INTO readers (student_code, full_name, class_name, phone) VALUES ($1, $2, $3, $4) RETURNING *',
    values,
  );
  log('info', 'reader_created', { reader_id: result.rows[0].id, student_code: values[0] });
  res.status(201).json(result.rows[0]);
}));

app.put('/api/readers/:id', requireAuth, asyncRoute(async (req, res) => {
  const values = [
    requiredText(req.body, 'student_code', 'Mã độc giả'),
    requiredText(req.body, 'full_name', 'Họ tên'),
    requiredText(req.body, 'class_name', 'Lớp'),
    requiredText(req.body, 'phone', 'Số điện thoại'),
    req.params.id,
  ];
  const result = await pool.query(
    'UPDATE readers SET student_code = $1, full_name = $2, class_name = $3, phone = $4 WHERE id = $5 RETURNING *',
    values,
  );
  if (!result.rowCount) throw Object.assign(new Error('Không tìm thấy độc giả.'), { status: 404 });
  log('info', 'reader_updated', { reader_id: req.params.id });
  res.json(result.rows[0]);
}));

app.get('/api/loans', requireAuth, asyncRoute(async (req, res) => {
  const overdueOnly = req.query.overdue === 'true';
  const result = await pool.query(
    `SELECT l.id, l.reader_id, l.book_id, l.borrowed_at, l.due_at, l.returned_at,
            b.title AS book_title, l.borrower_name AS reader_name, r.student_code,
            (l.returned_at IS NULL AND l.due_at < CURRENT_DATE) AS overdue
     FROM loans l JOIN books b ON b.id = l.book_id LEFT JOIN readers r ON r.id = l.reader_id
     WHERE ($1::boolean = false OR (l.returned_at IS NULL AND l.due_at < CURRENT_DATE))
     ORDER BY l.returned_at NULLS FIRST, l.due_at ASC`,
    [overdueOnly],
  );
  res.json(result.rows);
}));

app.post('/api/loans', requireAuth, asyncRoute(async (req, res) => {
  const borrowerName = requiredText(req.body, 'borrower_name', 'Tên người mượn');
  const readerId = req.body.reader_id ? Number(req.body.reader_id) : null;
  const bookId = Number(req.body.book_id);
  const dueAt = typeof req.body.due_at === 'string' ? req.body.due_at : '';
  if ((readerId !== null && (!Number.isInteger(readerId) || readerId < 1)) ||
      !Number.isInteger(bookId) || bookId < 1) {
    throw Object.assign(new Error('Vui lòng nhập tên người mượn và chọn sách hợp lệ.'), { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueAt) || Number.isNaN(Date.parse(`${dueAt}T00:00:00Z`))) {
    throw Object.assign(new Error('Ngày hẹn trả không hợp lệ.'), { status: 400 });
  }
  const loan = await transaction(async (client) => {
    const book = await client.query('SELECT id, title, status FROM books WHERE id = $1 FOR UPDATE', [bookId]);
    if (!book.rowCount) throw Object.assign(new Error('Không tìm thấy sách.'), { status: 404 });
    if (book.rows[0].status !== 'available') throw Object.assign(new Error('Sách này hiện không có sẵn.'), { status: 409 });
    if (readerId !== null) {
      const reader = await client.query('SELECT id FROM readers WHERE id = $1', [readerId]);
      if (!reader.rowCount) throw Object.assign(new Error('Không tìm thấy độc giả.'), { status: 404 });
    }
    const created = await client.query(
      'INSERT INTO loans (reader_id, borrower_name, book_id, due_at) VALUES ($1, $2, $3, $4) RETURNING *',
      [readerId, borrowerName, bookId, dueAt],
    );
    await client.query("UPDATE books SET status = 'borrowed' WHERE id = $1", [bookId]);
    return created.rows[0];
  });
  log('info', 'loan_created', { loan_id: loan.id, book_id: bookId });
  res.status(201).json(loan);
}));

app.post('/api/loans/:id/return', requireAuth, asyncRoute(async (req, res) => {
  const loan = await transaction(async (client) => {
    const result = await client.query('SELECT id, book_id, returned_at FROM loans WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!result.rowCount) throw Object.assign(new Error('Không tìm thấy phiếu mượn.'), { status: 404 });
    if (result.rows[0].returned_at) throw Object.assign(new Error('Phiếu mượn này đã được trả.'), { status: 409 });
    const updated = await client.query('UPDATE loans SET returned_at = CURRENT_DATE WHERE id = $1 RETURNING *', [req.params.id]);
    await client.query("UPDATE books SET status = 'available' WHERE id = $1", [result.rows[0].book_id]);
    return updated.rows[0];
  });
  log('info', 'loan_returned', { loan_id: loan.id, book_id: loan.book_id });
  res.json(loan);
}));

app.get('/metrics', asyncRoute(async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use((error, req, res, next) => {
  log('error', 'request_failed', {
    method: req.method,
    path: req.path,
    status: error.status || (error.code === '23505' ? 409 : 500),
    message: error.message,
    database_code: error.code,
  });
  if (res.headersSent) return next(error);
  if (error.code === '23505') return res.status(409).json({ error: 'Dữ liệu đã tồn tại, vui lòng kiểm tra lại.' });
  if (error.code === '23503') return res.status(409).json({ error: 'Không thể xóa dữ liệu đang được sử dụng.' });
  return res.status(error.status || 500).json({
    error: error.status ? error.message : 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại.',
  });
});

async function start() {
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'init.sql'), 'utf8'));
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin12345';
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [username, passwordHash],
  );
  app.listen(port, '0.0.0.0', () => log('info', 'server_started', { port, admin_username: username }));
}

pool.on('error', (error) => log('error', 'database_pool_error', { message: error.message }));
start().catch((error) => {
  log('error', 'startup_failed', { message: error.message, database_code: error.code });
  process.exitCode = 1;
});
