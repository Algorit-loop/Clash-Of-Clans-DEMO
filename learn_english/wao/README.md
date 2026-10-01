# WAO – Học từ vựng TOEIC

Mở `index.html` bằng trình duyệt (không cần server, không cần mạng). Tiến độ lưu trong localStorage.

- **Thư viện**: tìm kiếm, lọc theo nguồn/từ loại/trạng thái, bấm vào từ để xem chi tiết.
- **Luyện tập**: flashcard xáo trộn → Hiện nghĩa → Đúng / Sai-bỏ qua → Xem chi tiết (X).
- **Điền từ**: câu hỏi trắc nghiệm kiểu TOEIC Part 5 sinh từ các câu ví dụ.
- **Tiến độ**: thống kê, từ hay sai, xuất/nhập file sao lưu.

## Thêm / sửa từ
Dữ liệu nằm trong `data/*.txt` (`core-*` = từ từ voca.txt, `extra-*` = từ mở rộng).
Sau khi sửa chạy `node build.mjs` để sinh lại `data.js`. Cú pháp mỗi từ:

```
# word | /ipa/ | seen: dạng đã gặp (tuỳ chọn)
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
