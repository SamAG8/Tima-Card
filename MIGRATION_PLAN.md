# پلن: ادغام Time Clock در CDefApp با لاگین یکپارچه

> پیگیری زنده روی GitHub Issues: [Epic #5](https://github.com/SamAG8/Tima-Card/issues/5) · [Phase 0 #1](https://github.com/SamAG8/Tima-Card/issues/1) · [Phase 1 #2](https://github.com/SamAG8/Tima-Card/issues/2) · [Phase 2 #3](https://github.com/SamAG8/Tima-Card/issues/3) · [Phase 3 #4](https://github.com/SamAG8/Tima-Card/issues/4)

## پس‌زمینه

Time Clock الان سه سرویس جدا است (`timeclock-app`, `timeclock-admin`, `timeclock-api`) که هر سه به **همان پروژه Supabase مربوط به CDefApp** وصل‌اند. یعنی:

- ✅ استخر کاربران از قبل مشترک است — کاربر CDefApp با همان ایمیل/پسورد می‌تواند وارد Time Clock شود
- ❌ ولی کد auth، مدل‌های `public` schema، و کلاینت Supabase در هر دو پروژه **تکراری** نوشته شده‌اند
- ❌ و Time Clock به‌عنوان سرویس‌های جدا deploy می‌شود (۳ سرویس Cloud Run اضافه)

**هدف نهایی:** Time Clock بخشی از خود CDefApp شود — یک لاگین، یک بک‌اند، بدون کد تکراری — و انتقال به‌صورت تدریجی و کم‌ریسک انجام شود.

## نگاشت معماری

```
وضعیت فعلی                            وضعیت هدف
─────────────                          ─────────────
timeclock-api   (FastAPI جدا)   →     CDefApp/server/app/routers/timeclock/
timeclock-app   (React جدا)     →     CDefApp/src/  (سکشن Time Clock)
timeclock-admin (React جدا)     →     CDefApp/defi-admin/src/  (سکشن Time Clock)

auth.py + shared.py + supabase.ts تکراری  →  حذف؛ استفاده از نسخه CDefApp
جداول schema `time_clock` در دیتابیس       →  بدون تغییر (همین الان در همان DB است)
```

## فازها (به ترتیب اجرا)

- [x] [#1 — Phase 0: تست دود لاگین مشترک](https://github.com/SamAG8/Tima-Card/issues/1) ✅ انجام شد — لاگین اپ کارگر + پنل ادمین با اکانت واقعی تست شد، پروفایل/company_id از `public.users`+`memberships` درست resolve شد، ۵ endpoint واقعی با توکن 200 برگرداندند.
- [ ] [#2 — Phase 1: یکسان‌سازی auth بک‌اند](https://github.com/SamAG8/Tima-Card/issues/2) با الگوی `auth_service.py` در CDefApp (fast-path محلی JWT + کش + auto-bootstrap کاربر)
- [ ] [#3 — Phase 2: انتقال بک‌اند](https://github.com/SamAG8/Tima-Card/issues/3) به `server/` در CDefApp + حذف کدهای تکراری
- [ ] [#4 — Phase 3: ادغام فرانت‌اندها](https://github.com/SamAG8/Tima-Card/issues/4) + حذف صفحات لاگین جدا

## اصول

1. **هر فاز مستقل deploy می‌شود** — هیچ فازی سیستم فعلی را نمی‌شکند؛ سرویس‌های قدیمی فقط بعد از استیبل شدن جایگزین خاموش می‌شوند
2. **دیتابیس دست نمی‌خورد** — جداول `time_clock` schema همین الان کنار جداول CDefApp هستند؛ انتقال فقط در لایه کد است
3. **منبع حقیقت auth: CDefApp** — هر جا کد auth دو نسخه دارد، نسخه CDefApp (`server/app/services/auth_service.py`) مرجع است
4. کلیدهای Supabase که قبلاً در اسکریپت‌های deploy محلی plaintext بودند، جدا از این پلن باید rotate شوند

## خارج از محدوده (فعلاً)

- اتصال به ConstraAP (پروژه Supabase جدا با مدل `organizations` است — تصمیم جدا می‌خواهد)
- Video Task (طبق [PLAN.md](PLAN.md) آینده است)
