# WAO – Từ vựng & TOEIC

## Chạy

```bash
python3 server.py            # mở http://localhost:8000
python3 server.py --port 9000
python3 server.py --host 0.0.0.0   # cho điện thoại/máy khác trong cùng mạng LAN truy cập
```
Chỉ cần Python 3.8+ (thư viện chuẩn, không cài gì thêm).

**Dữ liệu lưu ở đâu?**
- Chạy qua `server.py`: mọi thứ (tiến độ từ vựng, thống kê TOEIC, lịch sử bài làm, cài đặt) lưu trong
  `userdata/progress.json`. Mỗi ngày tự sao lưu một bản vào `userdata/backups/` (giữ 30 bản).
  Muốn chuyển sang máy khác: copy file `userdata/progress.json`, hoặc dùng Xuất / Nhập trong trang Tiến độ.
- Mở thẳng `index.html` (không có server): vẫn dùng được, nhưng dữ liệu chỉ nằm trong trình duyệt —
  dùng **Tiến độ → Xuất / Nhập tiến độ (.json)** để chuyển.

Nhập file sẽ **thay thế** toàn bộ dữ liệu hiện tại (có hỏi xác nhận trước).

- **Trang chủ**: mục tiêu mỗi ngày, chuỗi ngày học, lối tắt, từ của ngày.
- **Thư viện**: tìm kiếm Anh/Việt, lọc theo từ loại & trạng thái; bấm thẻ để xem chi tiết.
- **Flashcard**: thẻ lật, tự chấm Đúng / Sai (phím ← →, hoặc vuốt trên điện thoại), xem chi tiết (X).
- **TOEIC**: Part 5 (chọn dạng câu hỏi, chế độ Luyện tập hoặc Thi thử 30 giây/câu) và Part 6 (đoạn văn 4 chỗ trống, có câu chèn câu).
- **Tiến độ**: mức độ thuộc từ, độ chính xác theo dạng câu TOEIC, 14 ngày gần đây, **lịch sử từng bài làm** (bấm để xem lại chi tiết), xuất/nhập.

## Dữ liệu từ vựng & câu hỏi
Sửa file trong `data/`, sau đó chạy `node build.mjs` để sinh lại `data.js` (chỉ cần Node khi sửa dữ liệu) (bộ build tự báo lỗi cú pháp, câu thiếu đáp án, lựa chọn trùng…).

### Từ vựng — `data/vocab/*.txt`
```
# word | /ipa/
fam: evaluation (n) nghĩa; evaluator (n) nghĩa
tip: Mẹo TOEIC
@v
1. nghĩa tiếng Việt | Câu ví dụ có *từ mục tiêu*. | Dịch tiếng Việt.
col: cụm từ = nghĩa; cụm khác = nghĩa
prep: cấu trúc/giới từ = nghĩa
syn: a, b
ant: c, d
use: ghi chú cách dùng
```
Từ loại: `n v adj adv prep conj pron det phr`.

### Part 5 — `data/toeic/part5-*.txt`
```
@ wordform
The software will ------- reduce costs.
- significant
+ significantly
- significance
- signify
= Giải thích
~ Bản dịch
```
Dạng: `wordform tense voice verbform agreement prep conj pron relative compare quant vocab`.

### Part 6 — `data/toeic/part6.txt`
Xem chú thích đầu file. Mỗi đoạn có 4 chỗ trống `[1]`–`[4]`, trong đó 1 câu dạng `sentence`.
