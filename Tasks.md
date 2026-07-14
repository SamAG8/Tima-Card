# Time Clock — Task List

## 🤖 AI Budget Code Import
**Feature:** دکمه "Add Code" در BudgetCodesPage قابلیت import هوشمند با Gemini پیدا کنه

### جزئیات:
- یه modal باز بشه با یه textarea بزرگ
- کاربر می‌تونه تا 2000 تا کد رو به‌صورت متن خام (هر خط یه کد، یا CSV، یا هر فرمتی) paste کنه
- Gemini متن رو parse کنه و ساختار استاندارد بده:
  - `code` (کد عددی/متنی)
  - `name` (عنوان)
  - `category` (اگه قابل استنتاج بود)
  - `division` (اگه قابل استنتاج بود)
- Preview نتیجه parse قبل از insert نشون داده بشه
- کاربر بتونه row های اشتباه رو حذف یا ویرایش کنه
- بعد از تایید، batch insert به DB بشن

### فایل‌های مرتبط:
- `timeclock-admin/src/pages/BudgetCodesPage.tsx` — دکمه Add Code اینجاست
- `timeclock-admin/src/lib/api.ts` — endpoint های budget codes
- `timeclock-api/app/routers/ai.py` — Gemini integration اینجاست
- `timeclock-api/app/routers/budget_codes.py` — bulk insert endpoint باید اضافه بشه

---

## بقیه تسک‌ها (در صورت نیاز)

- [ ] تست end-to-end کامل clock in/out با real Supabase auth
- [ ] تست time adjustment request flow (submit → approve در admin)
- [ ] بررسی Dashboard page — داده‌های واقعی نشون بده یا mock؟
- [ ] بررسی Settings page — save/load درست کار میکنه؟


