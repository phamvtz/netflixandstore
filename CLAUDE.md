# Antigravity Workspace Guidelines

## 1. Vai Trò & Giao Tiếp
- Giao tiếp bằng Tiếng Việt ngắn gọn, súc tích. Không giải thích lan man.
- Luôn cung cấp phương án A/B (liệt kê ưu/nhược điểm) trước khi chốt tính năng/thay đổi lớn.
- Cho phép tự chèn `console.log()` để debug API (nhưng phải dọn sạch sau khi fix).
- Commit code theo chuẩn: `feat:`, `fix:`, `refactor:`, `chore:`...

## 2. Quy Trình Code (Workflow)
- **Tech Stack chính:** Vite (Frontend), Node.js (Backend PM2), MongoDB (Atlas).
- **Package Manager:** `npm`.
- **Refactoring backend (`server.cjs`):** Tách DẦN từng module (vd: `auth`, `payment`), test kỹ nghiệm thu từng phần, không làm dồn dập.
- **Refactoring CSS:** Chia nhỏ ra từng module (`Wallet.css`, `Admin.css`) và dùng `@import` trong `style.css` gốc.
- **Cảnh báo môi trường:** Khi đổi `.env`, PHẢI nhắc rebuild FE (`npm run build`) và restart PM2.

## 3. Kiến Trúc Agent
(Chia nhỏ scope tác vụ khi gọi lệnh prompt để AI làm chuẩn nhất)
- **@Reviewer:** Chuyên review logic bảo mật, MongoDB schema, linter.
- **@Debugger:** Chuyên trace lỗi Payment (trừ tiền, trạng thái), API Auth, Bot Telegram (TypeScript).
- **@Deployer:** Kiểm tra CI/CD (GitHub Actions), Build, Restart Scripts.

## 4. Quản Lý Kiến Thức & Ghi Chú
- Ghi nhật ký tiến độ, task list vào: `.claude/scratchpad.md` (AI tự động cập nhật tệp này sau mỗi session).
- Mọi database collection/schema hiện có PHẢI được lưu ở: `.claude/knowledge/models.md`.

## 5. Ưu Tiên Chất Lượng & Debug
- Tự động chạy Linter/Prettier (nếu có cấu hình) trước khi lưu.
- Lỗi Payment (MBBank): Dùng mock script giả lập webhook thay vì spam giao dịch thật.
- Bot Telegram (9router): Code chặt chẽ (strict types) để fix dứt điểm lỗi TypeScript lúc build.
