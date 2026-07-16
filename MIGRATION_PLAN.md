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
- [x] [#2 — Phase 1: یکسان‌سازی auth بک‌اند](https://github.com/SamAG8/Tima-Card/issues/2) ✅ پیاده‌سازی شد — `timeclock-api/app/auth.py` به الگوی دو-مسیره (HS256 محلی + fallback ریموت با کش ۳۰۰s) و bootstrap-by-email ارتقا یافت؛ `MANAGER_ROLES`/`ADMIN_ROLES` در `app/roles.py` کنسالید شد؛ **۷۲ تست سبز** (۶۲ قبلی + ۱۰ تست جدید auth).
- [x] [#3 — Phase 2: انتقال بک‌اند](https://github.com/SamAG8/Tima-Card/issues/3) ✅ پیاده‌سازی شد — ۹ روتر زیر `/api/timeclock/*` در `CDefApp/server` سوار شدند، مدل‌های `time_clock` + `AppSubscription` منتقل و مدل `User` توسعه یافت، Alembic از دستکاری جداول TC معاف شد؛ **۱۷۱ تست CDefApp سبز** (۶۲ تست TC + بقیه؛ صفر regression).
- [x] [#4 — Phase 3: ادغام فرانت‌اندها](https://github.com/SamAG8/Tima-Card/issues/4) ✅ پیاده‌سازی شد — اپ کارگر (`/time-clock/`) و پنل ادمین (`/time-clock-admin/`) به‌عنوان بیلدهای base-path در ایمیج ترکیبی CDefApp سوار شدند، صفحات لاگین حذف و به لاگین Punch List ری‌دایرکت شدند (سشن Supabase هم‌مبدأ = یک لاگین)، لینک "Time Clock" به منوی Punch List اضافه شد؛ **هر سه فرانت‌اند build سبز**.

> **وضعیت:** کد هر سه فاز کامل و در سطح build/test راستی‌آزمایی شده. باقی‌مانده: build ایمیج Docker + deploy روی Cloud Run (که فقط زمان deploy قابل تأیید است) و بازنشستگی سرویس‌های قدیمی `timeclock-*` بعد از استیبل‌شدن.

## اصول

1. **هر فاز مستقل deploy می‌شود** — هیچ فازی سیستم فعلی را نمی‌شکند؛ سرویس‌های قدیمی فقط بعد از استیبل شدن جایگزین خاموش می‌شوند
2. **دیتابیس دست نمی‌خورد** — جداول `time_clock` schema همین الان کنار جداول CDefApp هستند؛ انتقال فقط در لایه کد است
3. **منبع حقیقت auth: CDefApp** — هر جا کد auth دو نسخه دارد، نسخه CDefApp (`server/app/services/auth_service.py`) مرجع است
4. کلیدهای Supabase که قبلاً در اسکریپت‌های deploy محلی plaintext بودند، جدا از این پلن باید rotate شوند

## خارج از محدوده (فعلاً)

- اتصال به ConstraAP (پروژه Supabase جدا با مدل `organizations` است — تصمیم جدا می‌خواهد)
- Video Task (طبق [PLAN.md](PLAN.md) آینده است)

---

## جزئیات پیاده‌سازی (برای مرور و deploy)

**تصمیم‌های تأییدشده:** پیشوند API = `/api/timeclock` (کنوانسیون CDefApp، نه `/api/v1`)؛ پنل ادمین = بیلد جدا زیر `/time-clock-admin/`.

### Phase 1 — برنچ `feature/phase1-align-auth` روی `Tima-Card`
- `timeclock-api/app/auth.py` — دو-مسیره: decode محلی HS256 با `SUPABASE_JWT_SECRET` (اگر `sb_`-prefixed نبود) + fallback ریموت `supabase.auth.get_user` با کش ۳۰۰ ثانیه؛ `get_current_user` حالا bootstrap-by-email می‌کند (به‌جای 404).
- `timeclock-api/app/roles.py` (جدید) — `MANAGER_ROLES` و `ADMIN_ROLES` (قبلاً در ۴ روتر + middleware تکرار شده بود).
- `timeclock-api/tests/test_auth.py` (جدید) — ۱۰ تست. **کل: 72 passed.**

### Phase 2 — برنچ `feature/timeclock-backend-merge` روی `CDefApp`
- `server/app/models/timeclock.py` (جدید) — ۱۱ مدل schema `time_clock` + `AppSubscription`.
- `server/app/models/tenancy.py` — مدل `User` با `role`, `has_leave_access`, `has_report_access`, `has_team_report_access` توسعه یافت (additive؛ ستون‌ها از قبل در DB هستند).
- `server/app/routers/timeclock/*` (۹ روتر) + `server/app/services/timeclock/{access,payroll,excel_export}.py` — importها به auth_service/tenancy/timeclock سوییچ شد؛ بدنه‌ها بدون تغییر.
- `server/app/main.py` — ۹ روتر زیر `prefix="/api/timeclock"` رجیستر شدند (۳۴ endpoint).
- `server/alembic/env.py` — `include_object` جداول/ستون‌های TC را از autogenerate معاف می‌کند (DB دست‌نخورده).
- `server/requirements.txt` — `openpyxl`, `pytz`, `httpx`, `google-auth`.
- `server/tests/timeclock/*` — پورت ایزوله (conftest با override دارای teardown). **کل: 171 passed (۲ خطای procore از قبل موجود، بی‌ربط).**

### Phase 3 — همان برنچ `CDefApp`
- `CDefApp/timeclock-app/` و `CDefApp/timeclock-admin/` (منتقل‌شده) به‌صورت **بیلدهای base-path جدا** (نه ادغام کامل در `src`/`defi-admin`) — `vite.config` با `base` از `VITE_BASE_PATH`؛ `BrowserRouter basename`؛ `lib/api.ts` پیشوند `/api/timeclock`.
- `CDefApp/Dockerfile` — دو stage جدید (`timeclock-worker-builder` → `/time-clock/`، `timeclock-admin-builder` → `/time-clock-admin/`) + دو بلاک nginx (additive).
- **مسیریابی بر اساس نقش** (به‌جای آیتم منو): در `src/App.tsx` + `src/lib/timeclockRedirect.ts` — کاربر با `role` = `worker`/`manager` **که ادمین نباشد** (`admin_scope` نه `company_admin`/`super_admin`) بعد از لاگین خودکار به `/time-clock/` می‌رود؛ ادمین‌ها در Punch List می‌مانند. یک ستون `role` هم به `/api/users/me` اضافه شد.
- **اپ کارگر:** در web به لاگین Punch List ری‌دایرکت می‌شود؛ در **native (iOS)** لاگین خودش (`AuthScreen`) را دارد (`Capacitor.isNativePlatform()`). راهنما: `timeclock-app/IOS_BUILD.md` + `build-ios.sh`.
- **پنل ادمین:** لاگین **درجای خودش** (`AuthPage`) دارد (مثل `/admin` و `/super`) — بعد از لاگین مستقیم وارد داشبورد.
- **گاردهای پایداری (UX):** جلوگیری از loop (`tc_relogin` + `isUnderTimeClockPath`)، عدم‌ری‌دایرکت با پروفایل کهنهٔ کاربر قبلی (تطبیق ایمیل در render و effect)، پاک‌شدن `tc_relogin` هنگام `SIGNED_IN`، و splash لودینگ تا آماده‌شدن پروفایلِ کاربرِ جاری.
- **راستی‌آزمایی:** هر سه build سبز، یونیت‌تست redirect ۷/۷، و تست مرورگری end-to-end روی سرو تک-origin (کارگر→Time Clock، ادمین→Punch List، بدون loop/flash).

### باقی‌مانده (deploy-time، خارج از این تغییرات کد)
- `docker build` + deploy روی سرویس `cdefiapp-admin` و تست دود روی `pl.constralabs.ai/{time-clock,time-clock-admin}/`.
- افزودن `https://pl.constralabs.ai/time-clock/**` و `/time-clock-admin/**` به allowlist ری‌دایرکت Supabase Auth (احتیاطی).
- بعد از استیبل: خاموش‌کردن سرویس‌های Cloud Run `timeclock-api`، `timeclock-app`، `timeclock-admin`.
- **دیتابیس دست‌نخورده** — هیچ مایگریشنی لازم نیست؛ همه جداول از قبل در Supabase مشترک‌اند.
