const loginScreen = document.querySelector('#login-screen');
const appShell = document.querySelector('#app-shell');
const dialog = document.querySelector('#form-dialog');
const dialogForm = document.querySelector('#dialog-form');
let toastTimer;
let activeView = 'dashboard';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
  } catch {
    throw new Error('Không kết nối được máy chủ. Hãy chạy ứng dụng và mở http://localhost:8082.');
  }
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Địa chỉ này chưa chạy máy chủ đăng nhập. Hãy mở http://localhost:8082.');
  }
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !url.includes('/auth/')) showLogin();
    throw new Error(data.error || 'Không thể hoàn tất yêu cầu.');
  }
  return data;
}

function showToast(message, isError = false) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3000);
}

function showLogin() {
  appShell.hidden = true;
  loginScreen.hidden = false;
}

function showApp(username) {
  loginScreen.hidden = true;
  appShell.hidden = false;
  document.querySelector('#current-username').textContent = username;
  document.querySelector('#today-date').textContent = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long', day: '2-digit', month: 'long',
  }).format(new Date());
  navigate('dashboard');
}

async function checkSession() {
  try {
    const user = await api('/api/auth/me');
    showApp(user.username);
  } catch (error) {
    if (!error.message.includes('đăng nhập')) showToast(error.message, true);
    showLogin();
  }
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const errorBox = document.querySelector('#login-error');
  errorBox.textContent = '';
  try {
    const user = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
    });
    showApp(user.username);
  } catch (error) {
    errorBox.textContent = error.message;
  }
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
    showLogin();
  } catch (error) {
    showToast(error.message, true);
  }
});

function navigate(view) {
  activeView = view;
  document.querySelectorAll('.view-section').forEach((section) => {
    section.hidden = section.id !== `view-${view}`;
  });
  document.querySelectorAll('.nav-link').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  document.querySelector('#page-crumb').textContent = ({
    dashboard: 'Tổng quan', books: 'Quản lý sách', readers: 'Độc giả',
    loans: 'Mượn & trả', overdue: 'Sách quá hạn',
  })[view];
  loadView(view).catch((error) => showToast(error.message, true));
}

async function loadView(view) {
  if (view === 'dashboard') await loadDashboard();
  if (view === 'books') await loadBooks();
  if (view === 'readers') await loadReaders();
  if (view === 'loans') await loadLoans();
  if (view === 'overdue') await loadOverdue();
}

async function loadDashboard() {
  const [stats, loans] = await Promise.all([api('/api/dashboard'), api('/api/loans')]);
  document.querySelector('#stat-books').textContent = stats.total_books;
  document.querySelector('#stat-available').textContent = stats.available_books;
  document.querySelector('#stat-loans').textContent = stats.active_loans;
  document.querySelector('#stat-readers').textContent = stats.total_readers;
  document.querySelector('#overdue-nav-count').textContent = stats.overdue_loans;
  document.querySelector('#recent-loans').innerHTML = loanTable(loans.slice(0, 5), false);
}

function statusBadge(item) {
  if (item.returned_at) return '<span class="status-pill status-returned">Đã trả</span>';
  if (item.overdue) return '<span class="status-pill status-overdue">Quá hạn</span>';
  return '<span class="status-pill status-borrowed">Đang mượn</span>';
}

function dateText(value) {
  return value ? new Intl.DateTimeFormat('vi-VN').format(new Date(`${String(value).slice(0, 10)}T00:00:00`)) : '—';
}

function loanTable(rows, actions = true) {
  if (!rows.length) return '<div class="empty-state">Chưa có giao dịch mượn sách nào.</div>';
  return `<table><thead><tr><th>SÁCH</th><th>NGƯỜI MƯỢN</th><th>NGÀY MƯỢN</th><th>HẸN TRẢ</th><th>TRẠNG THÁI</th>${actions ? '<th>THAO TÁC</th>' : ''}</tr></thead><tbody>${rows.map((loan) => `<tr><td class="book-title-cell">${escapeHtml(loan.book_title)}<span class="sub-cell">Phiếu #${loan.id}</span></td><td>${escapeHtml(loan.reader_name)}${loan.student_code ? `<span class="sub-cell">${escapeHtml(loan.student_code)}</span>` : ''}</td><td>${dateText(loan.borrowed_at)}</td><td>${dateText(loan.due_at)}</td><td>${statusBadge(loan)}</td>${actions ? `<td>${loan.returned_at ? '—' : `<button class="table-action" data-return-loan="${loan.id}">Xác nhận trả</button>`}</td>` : ''}</tr>`).join('')}</tbody></table>`;
}

async function loadBooks() {
  const query = document.querySelector('#books-search').value;
  const books = await api(`/api/books?q=${encodeURIComponent(query)}`);
  document.querySelector('#books-count').textContent = `${books.length} cuốn sách`;
  document.querySelector('#books-table').innerHTML = books.length ? `<table><thead><tr><th>MÃ ID</th><th>TÊN SÁCH</th><th>TÁC GIẢ</th><th>NĂM XB</th><th>THỂ LOẠI</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>${books.map((book) => `<tr><td>#${book.id}</td><td class="book-title-cell">${escapeHtml(book.title)}</td><td>${escapeHtml(book.author)}</td><td>${book.publication_year}</td><td>${escapeHtml(book.genre)}</td><td><span class="status-pill status-${book.status}">${book.status === 'available' ? 'Sẵn có' : 'Đang mượn'}</span></td><td><button class="table-action" data-edit-book="${book.id}">Sửa</button> <button class="table-action danger" data-delete-book="${book.id}">Xóa</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">Không tìm thấy cuốn sách phù hợp.</div>';
}

async function loadReaders() {
  const query = document.querySelector('#readers-search').value;
  const readers = await api(`/api/readers?q=${encodeURIComponent(query)}`);
  document.querySelector('#readers-count').textContent = `${readers.length} độc giả`;
  document.querySelector('#readers-table').innerHTML = readers.length ? `<table><thead><tr><th>MÃ ĐỘC GIẢ</th><th>HỌ VÀ TÊN</th><th>LỚP</th><th>SỐ ĐIỆN THOẠI</th><th>THAO TÁC</th></tr></thead><tbody>${readers.map((reader) => `<tr><td>${escapeHtml(reader.student_code)}</td><td class="book-title-cell">${escapeHtml(reader.full_name)}</td><td>${escapeHtml(reader.class_name)}</td><td>${escapeHtml(reader.phone)}</td><td><button class="table-action" data-edit-reader="${reader.id}">Cập nhật</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">Chưa có thông tin độc giả phù hợp.</div>';
}

async function loadLoans() {
  const loans = await api('/api/loans');
  document.querySelector('#loans-table').innerHTML = loanTable(loans);
}

async function loadOverdue() {
  const loans = await api('/api/loans?overdue=true');
  document.querySelector('#overdue-table').innerHTML = loans.length ? loanTable(loans) : '<div class="empty-state">Thật tuyệt! Hiện không có sách quá hạn.</div>';
}

function openDialog(title, eyebrow, fields, values = {}, onSave) {
  document.querySelector('#dialog-title').textContent = title;
  document.querySelector('#dialog-eyebrow').textContent = eyebrow;
  dialogForm.innerHTML = fields.map((field) => {
    const value = values[field.name] ?? field.value ?? '';
    const className = field.wide ? ' class="span-two"' : '';
    if (field.type === 'select') {
      return `<label${className}>${field.label}<select name="${field.name}" ${field.required === false ? '' : 'required'}>${field.options.map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></label>`;
    }
    return `<label${className}>${field.label}<input name="${field.name}" type="${field.type || 'text'}" value="${escapeHtml(value)}" ${field.required === false ? '' : 'required'} ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.step ? `step="${field.step}"` : ''}></label>`;
  }).join('') + '<div class="dialog-actions"><button type="button" class="button button-secondary" data-action="close-dialog">Hủy</button><button type="submit" class="button button-primary">Lưu thông tin</button></div>';
  dialogForm.onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(dialogForm));
    try {
      await onSave(data);
      dialog.close();
      showToast('Đã lưu thông tin thành công.');
      await Promise.all([loadView(activeView), activeView === 'dashboard' ? Promise.resolve() : loadDashboard()]);
    } catch (error) {
      showToast(error.message, true);
    }
  };
  dialog.showModal();
}

async function addBook(book) {
  openDialog('Thêm sách mới', 'KHO TRI THỨC', [
    { name: 'title', label: 'Tên sách', wide: true },
    { name: 'author', label: 'Tác giả' },
    { name: 'publication_year', label: 'Năm xuất bản', type: 'number', min: 0, step: '1', value: new Date().getFullYear() },
    { name: 'genre', label: 'Thể loại', wide: true },
  ], book || {}, async (data) => {
    await api(book ? `/api/books/${book.id}` : '/api/books', { method: book ? 'PUT' : 'POST', body: JSON.stringify(data) });
  });
}

async function addReader(reader) {
  openDialog(reader ? 'Cập nhật độc giả' : 'Thêm độc giả mới', 'THẺ THƯ VIỆN', [
    { name: 'student_code', label: 'Mã sinh viên / độc giả' },
    { name: 'full_name', label: 'Họ và tên' },
    { name: 'class_name', label: 'Lớp' },
    { name: 'phone', label: 'Số điện thoại', type: 'tel' },
  ], reader || {}, async (data) => {
    await api(reader ? `/api/readers/${reader.id}` : '/api/readers', { method: reader ? 'PUT' : 'POST', body: JSON.stringify(data) });
  });
}

async function openLoan() {
  try {
    const books = await api('/api/books');
    const availableBooks = books.filter((book) => book.status === 'available');
    if (!availableBooks.length) return showToast('Hiện không có sách sẵn có để cho mượn.', true);
    const due = new Date();
    due.setDate(due.getDate() + 14);
    openDialog('Tạo phiếu mượn mới', 'GIAO DỊCH MƯỢN', [
      { name: 'borrower_name', label: 'Tên người mượn', wide: true },
      { name: 'book_id', label: 'Chọn sách', wide: true, type: 'select', options: availableBooks.map((book) => ({ value: book.id, label: `${book.title} · ${book.author}` })) },
      { name: 'due_at', label: 'Ngày hẹn trả', wide: true, type: 'date', value: due.toISOString().slice(0, 10) },
    ], {}, async (data) => api('/api/loans', { method: 'POST', body: JSON.stringify(data) }));
  } catch (error) {
    showToast(error.message, true);
  }
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.view) return navigate(target.dataset.view);
  if (target.dataset.action === 'close-dialog') return dialog.close();
  if (target.dataset.action === 'add-book') return addBook();
  if (target.dataset.action === 'add-reader') return addReader();
  if (target.dataset.action === 'open-loan') return openLoan();
  if (target.dataset.editBook) {
    try {
      const books = await api('/api/books');
      const book = books.find((item) => String(item.id) === target.dataset.editBook);
      if (book) addBook(book);
    } catch (error) { showToast(error.message, true); }
  }
  if (target.dataset.deleteBook) {
    if (!window.confirm('Bạn có chắc muốn xóa sách này?')) return;
    try {
      await api(`/api/books/${target.dataset.deleteBook}`, { method: 'DELETE' });
      showToast('Đã xóa sách.');
      await loadBooks();
      await loadDashboard();
    } catch (error) { showToast(error.message, true); }
  }
  if (target.dataset.editReader) {
    try {
      const readers = await api('/api/readers');
      const reader = readers.find((item) => String(item.id) === target.dataset.editReader);
      if (reader) addReader(reader);
    } catch (error) { showToast(error.message, true); }
  }
  if (target.dataset.returnLoan) {
    try {
      await api(`/api/loans/${target.dataset.returnLoan}/return`, { method: 'POST' });
      showToast('Đã xác nhận trả sách.');
      await Promise.all([loadView(activeView), loadDashboard()]);
    } catch (error) { showToast(error.message, true); }
  }
});

document.querySelectorAll('#books-search, #readers-search').forEach((input) => {
  let timer;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const load = input.id === 'books-search' ? loadBooks : loadReaders;
      load().catch((error) => showToast(error.message, true));
    }, 180);
  });
});

checkSession();
