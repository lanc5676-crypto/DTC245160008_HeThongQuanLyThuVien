CREATE TABLE IF NOT EXISTS books (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  publication_year INTEGER NOT NULL CHECK (publication_year BETWEEN 0 AND 2100),
  genre TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'borrowed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS readers (
  id BIGSERIAL PRIMARY KEY,
  student_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loans (
  id BIGSERIAL PRIMARY KEY,
  reader_id BIGINT REFERENCES readers(id) ON DELETE RESTRICT,
  borrower_name TEXT NOT NULL,
  book_id BIGINT NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  borrowed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  due_at DATE NOT NULL,
  returned_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (returned_at IS NULL OR returned_at >= borrowed_at)
);

ALTER TABLE loans ADD COLUMN IF NOT EXISTS borrower_name TEXT;
ALTER TABLE loans ALTER COLUMN reader_id DROP NOT NULL;
UPDATE loans l SET borrower_name = r.full_name
FROM readers r
WHERE l.reader_id = r.id AND l.borrower_name IS NULL;
UPDATE loans SET borrower_name = 'Độc giả' WHERE borrower_name IS NULL;
ALTER TABLE loans ALTER COLUMN borrower_name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS one_active_loan_per_book
  ON loans(book_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS loans_due_at_active_idx
  ON loans(due_at) WHERE returned_at IS NULL;

INSERT INTO books (title, author, publication_year, genre, status)
SELECT seed.title, seed.author, seed.publication_year, seed.genre, seed.status
FROM (VALUES
  ('Dế Mèn phiêu lưu ký', 'Tô Hoài', 1941, 'Văn học', 'available'),
  ('Tuổi trẻ đáng giá bao nhiêu', 'Rosie Nguyễn', 2018, 'Kỹ năng sống', 'borrowed'),
  ('Nhà giả kim', 'Paulo Coelho', 1988, 'Tiểu thuyết', 'available'),
  ('Clean Code', 'Robert C. Martin', 2008, 'Công nghệ', 'borrowed'),
  ('Mắt biếc', 'Nguyễn Nhật Ánh', 1990, 'Văn học', 'available'),
  ('Sapiens: Lược sử loài người', 'Yuval Noah Harari', 2011, 'Lịch sử', 'borrowed'),
  ('Đắc nhân tâm', 'Dale Carnegie', 1936, 'Kỹ năng sống', 'borrowed'),
  ('Lược sử thời gian', 'Stephen Hawking', 1988, 'Khoa học', 'borrowed'),
  ('Tôi thấy hoa vàng trên cỏ xanh', 'Nguyễn Nhật Ánh', 2010, 'Văn học', 'available'),
  ('Cho tôi xin một vé đi tuổi thơ', 'Nguyễn Nhật Ánh', 2008, 'Văn học', 'available'),
  ('Vừa nhắm mắt vừa mở cửa sổ', 'Nguyễn Ngọc Thuần', 2004, 'Văn học', 'available'),
  ('Đất rừng phương Nam', 'Đoàn Giỏi', 1957, 'Văn học', 'available'),
  ('Lão Hạc', 'Nam Cao', 1943, 'Văn học', 'available'),
  ('Số đỏ', 'Vũ Trọng Phụng', 1936, 'Văn học', 'available'),
  ('Tắt đèn', 'Ngô Tất Tố', 1939, 'Văn học', 'available'),
  ('Không gia đình', 'Hector Malot', 1878, 'Văn học', 'available'),
  ('Ông già và biển cả', 'Ernest Hemingway', 1952, 'Tiểu thuyết', 'available'),
  ('Những người khốn khổ', 'Victor Hugo', 1862, 'Tiểu thuyết', 'available'),
  ('Bố già', 'Mario Puzo', 1969, 'Tiểu thuyết', 'available'),
  ('Tư duy nhanh và chậm', 'Daniel Kahneman', 2011, 'Tâm lý học', 'available'),
  ('Tuần làm việc 4 giờ', 'Timothy Ferriss', 2007, 'Kỹ năng sống', 'available'),
  ('Nhập môn thuật toán', 'Thomas H. Cormen', 2009, 'Công nghệ', 'available'),
  ('Thiết kế hướng đối tượng', 'Erich Gamma và cộng sự', 1994, 'Công nghệ', 'available'),
  ('Nhà đầu tư thông minh', 'Benjamin Graham', 1949, 'Kinh tế', 'available'),
  ('Cây cam ngọt của tôi', 'José Mauro de Vasconcelos', 1968, 'Văn học', 'available')
) AS seed(title, author, publication_year, genre, status)
WHERE NOT EXISTS (
  SELECT 1 FROM books existing WHERE existing.title = seed.title AND existing.author = seed.author
);

INSERT INTO readers (student_code, full_name, class_name, phone) VALUES
  ('SV24001', 'Nguyễn Minh Anh', 'CNTT K24A', '0901234567'),
  ('SV24002', 'Trần Gia Huy', 'CNTT K24B', '0912345678'),
  ('SV24003', 'Lê Khánh Linh', 'QTKD K23A', '0987654321'),
  ('SV24004', 'Phạm Đức Anh', 'CNTT K24A', '0902345678'),
  ('SV24005', 'Võ Ngọc Hà', 'Ngôn ngữ Anh K23B', '0913456789'),
  ('SV24006', 'Đặng Hoàng Long', 'Cơ điện tử K22A', '0924567890'),
  ('SV24007', 'Bùi Thảo Nhi', 'QTKD K24C', '0935678901'),
  ('SV24008', 'Đỗ Quang Minh', 'CNTT K23C', '0946789012'),
  ('SV24009', 'Ngô Phương Thảo', 'Kế toán K24A', '0957890123'),
  ('SV24010', 'Dương Tuấn Kiệt', 'CNTT K22B', '0968901234'),
  ('SV24011', 'Mai Khánh Vy', 'Marketing K23A', '0979012345'),
  ('SV24012', 'Huỳnh Gia Bảo', 'Thiết kế đồ họa K24B', '0980123456')
ON CONFLICT (student_code) DO NOTHING;

INSERT INTO loans (reader_id, borrower_name, book_id, borrowed_at, due_at)
SELECT r.id, r.full_name, b.id, CURRENT_DATE - 10, CURRENT_DATE - 3
FROM readers r, books b
WHERE r.student_code = 'SV24001' AND b.title = 'Tuổi trẻ đáng giá bao nhiêu'
  AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.book_id = b.id AND l.returned_at IS NULL);

INSERT INTO loans (reader_id, borrower_name, book_id, borrowed_at, due_at)
SELECT r.id, r.full_name, b.id, CURRENT_DATE - 2, CURRENT_DATE + 12
FROM readers r, books b
WHERE r.student_code = 'SV24002' AND b.title = 'Clean Code'
  AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.book_id = b.id AND l.returned_at IS NULL);

INSERT INTO loans (reader_id, borrower_name, book_id, borrowed_at, due_at)
SELECT r.id, r.full_name, b.id, CURRENT_DATE - seed.days_ago, CURRENT_DATE + seed.days_until_due
FROM (VALUES
  ('SV24003', 'Sapiens: Lược sử loài người', 4, 10),
  ('SV24004', 'Đắc nhân tâm', 3, 11),
  ('SV24005', 'Lược sử thời gian', 12, -5)
) AS seed(student_code, title, days_ago, days_until_due)
JOIN readers r ON r.student_code = seed.student_code
JOIN books b ON b.title = seed.title
WHERE NOT EXISTS (
  SELECT 1 FROM loans l WHERE l.book_id = b.id AND l.returned_at IS NULL
);

UPDATE books b
SET status = CASE
  WHEN EXISTS (SELECT 1 FROM loans l WHERE l.book_id = b.id AND l.returned_at IS NULL)
    THEN 'borrowed'
  ELSE 'available'
END;
