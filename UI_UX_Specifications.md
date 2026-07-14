# Time Clock — UI/UX Specifications
## Mobile App (Worker) + Admin Dashboard (Manager)

> This document is the single source of truth for visual design and UX behavior.
> Provide this to any AI agent or developer implementing the UI.

---

# PART 1: DESIGN SYSTEM (Shared)

## 1.1 Brand Colors

```
Primary Blue       #2563EB   (actions, links, active states)
Primary Dark       #1D4ED8   (hover on primary)
Surface Dark       #0F172A   (app background — mobile)
Surface Mid        #1E293B   (cards, panels — mobile)
Surface Light      #F8FAFC   (page background — admin)
Surface White      #FFFFFF   (cards — admin)

Semantic:
  Success Green    #16A34A
  Warning Amber    #D97706
  Error Red        #DC2626
  Info Blue        #0284C7

Status Colors:
  ACTIVE     #16A34A   (green)
  SUBMITTED  #D97706   (amber — awaiting approval)
  APPROVED   #2563EB   (blue)
  REJECTED   #DC2626   (red)
  PENDING    #D97706   (amber)
```

## 1.2 Typography

```
Font Family: Inter (Google Fonts — load via CDN)

Scale:
  Display   32px / bold   (page titles — admin)
  H1        24px / bold   (screen titles — mobile)
  H2        18px / semibold
  H3        16px / semibold
  Body      14px / regular
  Small     12px / regular
  Micro     11px / regular (badges, timestamps)

Line height: 1.5
Letter spacing: -0.01em for headings
```

## 1.3 Spacing System (8px base)

```
4px   xs     (tight gaps, icon padding)
8px   sm     (inner padding, gaps)
12px  md     (card padding small)
16px  base   (standard padding)
20px  lg     (section gaps mobile)
24px  xl     (card padding desktop)
32px  2xl    (section gaps desktop)
48px  3xl    (page padding desktop)
```

## 1.4 Border Radius

```
4px    sm    (badges, tags)
8px    md    (inputs, small cards)
12px   lg    (cards mobile)
16px   xl    (large cards, buttons)
24px   2xl   (FAB, circle buttons)
9999px full  (pills, status badges)
```

## 1.5 Shadows

```
Mobile cards:  none (use border instead)
Admin cards:   box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)
Admin elevated: box-shadow: 0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)
Modals:        box-shadow: 0 20px 25px rgba(0,0,0,0.15)
```

## 1.6 Component Tokens

```
Input height:      44px (mobile) / 36px (admin)
Button height:     52px (primary mobile) / 36px (admin)
Bottom nav height: 64px + safe-area-inset-bottom
Sidebar width:     240px (collapsed: 64px)
Header height:     60px (admin)
Table row height:  48px (admin)
```

---

# PART 2: MOBILE APP (timeclock-app)
## Target: iOS + Android via Capacitor | Dark Theme | Mobile-First

---

## 2.1 Global Layout

```
┌─────────────────────────────┐
│  Status Bar (system)        │
├─────────────────────────────┤
│                             │
│   Screen Content            │  ← flex-1, scrollable
│                             │
│                             │
├─────────────────────────────┤
│   Bottom Navigation         │  ← fixed, 64px + safe area
└─────────────────────────────┘
```

**Background:** `#0F172A` (entire app)
**Safe areas:** Use `env(safe-area-inset-*)` on all edges

---

## 2.2 Auth Screen

**Purpose:** Magic link login — first and only screen before auth.

**Layout:**
```
[Full screen, centered vertically]

  ┌──────────────────┐
  │  [Logo Mark]     │  ← 64px, rounded-2xl, bg #2563EB
  │  Time Clock      │  ← H1, white
  │  by Constralabs  │  ← Small, slate-400
  └──────────────────┘

  [32px gap]

  ┌──────────────────────────────┐
  │ 📧  you@company.com         │  ← Input, bg #1E293B, border slate-700
  └──────────────────────────────┘

  [16px gap]

  ┌──────────────────────────────┐
  │      Send Magic Link         │  ← Primary button, bg #2563EB, 52px tall
  └──────────────────────────────┘

  [12px gap]
  "No password needed. Check your email."  ← Micro, slate-500, centered
```

**Success state (after send):**
```
  [Animated checkmark icon, green]
  "Check your email"          ← H2, white
  "We sent a link to john@..."  ← Body, slate-400
  [Use different email]       ← text button, blue-400
```

**Behavior:**
- Email field auto-focuses on mount
- Keyboard: `email` type, `return` key triggers send
- Loading state: spinner replaces button text
- Error: red text below input with shake animation

---

## 2.3 Bottom Navigation

**4 tabs:**

```
┌──────┬──────┬──────┬──────┐
│ 🕐   │ 📋   │ 🌴   │ 👤   │
│Clock │History│Leave │Profile│
└──────┴──────┴──────┴──────┘
```

**Active tab:**
- Icon: `#2563EB` (blue)
- Label: `#2563EB` 11px semibold
- Small dot indicator below icon

**Inactive tab:**
- Icon + label: `#64748B` (slate-500)

**Background:** `#0F172A` with top border `#1E293B`
**Badge:** Red circle (8px) on top-right of icon for pending notifications

---

## 2.4 Clock Screen (Main Screen)

**This is the hero screen. Design for instant comprehension.**

### State A: Not Clocked In

```
┌─────────────────────────────┐
│                             │
│  Good morning, Alex 👋      │  ← H2, white (time-aware greeting)
│  Saturday, March 28         │  ← Body, slate-400
│                             │
│    ┌───────────────────┐    │
│    │                   │    │
│    │   NOT CLOCKED IN  │    │  ← circle, 220px diameter
│    │                   │    │    border: 3px dashed slate-700
│    │   ── : ── : ──    │    │    inner text: slate-500
│    │                   │    │
│    └───────────────────┘    │
│                             │
│  [Project: Downtown Tower ▼]│  ← Project selector pill
│                             │
│  ┌─────────────────────┐    │
│  │   ▶  Clock In       │    │  ← 56px tall, green, full width
│  └─────────────────────┘    │
│                             │
└─────────────────────────────┘
```

### State B: Clocked In (Active)

```
┌─────────────────────────────┐
│                             │
│  Clocked in at 7:43 AM      │  ← Body, green-400
│  Downtown Tower Project     │  ← Small, slate-400
│                             │
│    ┌───────────────────┐    │
│    │                   │    │
│    │   03 : 24 : 17    │    │  ← Monospace, 36px, white
│    │   CLOCKED IN      │    │    circle: border 3px solid green-500
│    │  📍 GPS Verified  │    │    pulse animation on border
│    │                   │    │
│    └───────────────────┘    │
│                             │
│  ─── What did you work on? ─│  ← Section, appears after 30min
│  ┌─────────────────────┐    │
│  │ Add description...  │    │  ← text input, optional
│  └─────────────────────┘    │
│                             │
│  [+ Add Tags]               │  ← tag chips row
│                             │
│  ┌─────────────────────┐    │
│  │   ⬛  Clock Out      │    │  ← 56px tall, red-600, full width
│  └─────────────────────┘    │
│                             │
└─────────────────────────────┘
```

**Animations:**
- Clock-in: Circle border animates from dashed → solid green with pulse
- Timer: Monospace font, updates every second
- GPS badge: subtle pulse dot animation

**Project Selector:**
- Tapping opens a bottom sheet with project list
- Search field at top of sheet
- Currently selected: blue checkmark

---

## 2.5 History Screen

**Header:**
```
"Time History"  [+ Manual Entry →]   ← right-aligned button
```

**Filter row (horizontal scroll):**
```
[All] [Pending] [Approved] [Rejected] [This Week] [This Month]
```
Active filter: blue pill, white text. Inactive: slate-800 pill.

**Entry Card:**
```
┌──────────────────────────────────┐
│ Mon, Mar 28           APPROVED ● │  ← date | status badge
│ 7:43 AM → 4:15 PM  •  8h 32m    │  ← times and duration
│ Downtown Tower                    │  ← project name, slate-400
│                                   │
│ "Installed drywall on level 3..." │  ← description (if exists)
│ [framing] [level-3] [drywall]    │  ← tags as pills
└──────────────────────────────────┘
```

**Status badge styles:**
```
ACTIVE:    green-500 bg/10, green-500 text, "● Active"
SUBMITTED: amber-500 bg/10, amber-500 text, "⏳ Pending"
APPROVED:  blue-500 bg/10, blue-400 text, "✓ Approved"
REJECTED:  red-500 bg/10, red-400 text, "✗ Rejected"
MANUAL:    yellow indicator bar on left edge of card
```

**Empty state:**
```
[Clock icon, 48px, slate-600]
"No entries yet"
"Clock in to start tracking your time"
```

---

## 2.6 Manual Entry Screen

**Header with back arrow:**
```
← Manual Entry
```

**Alert banner at top:**
```
┌──────────────────────────────────────┐
│ ⚠️  This entry requires manager     │
│     approval before it counts.      │
└──────────────────────────────────────┘
```
Background: amber-500/10, border amber-500/30, text amber-400

**Form:**
```
Date
┌──────────────────────────────┐
│  March 28, 2026         📅   │  ← date picker
└──────────────────────────────┘

Clock In Time        Clock Out Time
┌────────────┐       ┌────────────┐
│  08:00 AM  │       │  04:00 PM  │
└────────────┘       └────────────┘

Calculated: 8h 00m   ← dynamic, shown below time row

Why wasn't this recorded?   ← Label
┌─────────────────────────────────────┐
│ ○  Forgot to clock in               │  ← radio options
│ ○  Did not have my phone            │
│ ○  System or app error              │
│ ○  Other                            │
└─────────────────────────────────────┘

Add a note (optional)
┌─────────────────────────────────────┐
│ Explain what happened...            │
└─────────────────────────────────────┘

What did you work on?
┌─────────────────────────────────────┐
│ Describe your work...               │  ← 3 rows textarea
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│        Submit for Approval          │  ← Primary CTA
└─────────────────────────────────────┘
```

---

## 2.7 Leave Screen

**Structure identical to ADP screenshot provided:**

```
Leave

Balances Overview
Balance available as of  [Mar 28, 2026  📅]

┌──────────────────────────────────────┐
│ Vacation                    10 days ›│
├──────────────────────────────────────┤
│ Sick                         5 days ›│
├──────────────────────────────────────┤
│ CAN Bereavement - Immediate  5 days ›│
├──────────────────────────────────────┤
│ CAN Bereavement - Extended   3 days ›│
├──────────────────────────────────────┤
│ CAN Jury Duty           As required ›│
├──────────────────────────────────────┤
│ Personal                     3 days ›│
│                              +2 more │
└──────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Requests

┌─────────────────────────────────────┐
│         + Request Time Off          │  ← Blue CTA button
└─────────────────────────────────────┘

[Filter by status ▼]               ← dropdown

Past requests list (cards):
┌─────────────────────────────────────┐
│ Vacation  •  Mar 10 → Mar 14       │
│ 5 days                   APPROVED  │
└─────────────────────────────────────┘
```

**Leave Detail (tapping a balance row):**
- Slides up a bottom sheet
- Shows: Total days / Used / Remaining
- Progress bar (blue fill on slate track)
- List of requests for this leave type

**Request Time Off Bottom Sheet:**
```
Leave Type    [Vacation ▼]
Start Date    [Mar 30, 2026 📅]
End Date      [Apr 4, 2026 📅]
              ── 6 business days ──
Notes         [Optional...]
              [Submit Request]
```

---

## 2.8 Profile Screen

```
┌──────────────────────────────────────┐
│   [Avatar initials circle, 64px]    │
│   Alex Johnson                       │  ← H2
│   Worker  •  Downtown Tower          │  ← role & default project
└──────────────────────────────────────┘

Info Section (card):
  Email         alex@company.com
  Timezone      America/Vancouver
  Company       BuildCo Inc.

This Week (card):
  Hours Logged      34.5h
  Days Worked       4 days
  Pending           2 entries

┌─────────────────────────────────────┐
│  Sign Out                           │  ← red text, no bg
└─────────────────────────────────────┘
```

---

## 2.9 Missed Clock-In Notification

**Push notification (native):**
```
Title: ⏰ Missing Time Entry
Body:  You have no record for yesterday (Mar 27).
       Tap to add a manual entry.
```

**In-app banner (appears on Clock screen if missed entries exist):**
```
┌──────────────────────────────────────┐
│ ⚠️  No entry for Mar 27             │
│     Add a manual entry              →│
└──────────────────────────────────────┘
```
Background: amber-500/10, left border 3px amber-500

---

# PART 3: ADMIN DASHBOARD (timeclock-admin)
## Target: Desktop Web | Light/Dark Mode | Desktop-First

---

## 3.1 Global Layout

```
┌──────────────────────────────────────────────────────────┐
│  Sidebar (240px)  │           Main Content Area          │
│                   │  ┌────────────────────────────────┐  │
│  [Logo]           │  │  Header (60px)                 │  │
│  ─────────────    │  │  Page Title   [Search] [User]  │  │
│  Dashboard        │  ├────────────────────────────────┤  │
│  Approvals  [3]   │  │                                │  │
│  Workers          │  │   Page Content                 │  │
│  Leave            │  │                                │  │
│  Reports          │  │                                │  │
│  Settings         │  │                                │  │
│                   │  └────────────────────────────────┘  │
│  [User]           │                                      │
│  [Sign out]       │                                      │
└──────────────────────────────────────────────────────────┘
```

**Light mode background:** `#F8FAFC`
**Card background:** `#FFFFFF`
**Sidebar background:** `#0F172A` (always dark)

---

## 3.2 Sidebar

**Width:** 240px expanded, 64px collapsed (icon only)
**Always dark**, regardless of theme toggle.

```
┌────────────────────────┐
│  🕐  Time Clock        │  ← Logo mark + name, 16px bold white
│      Admin Panel       │  ← 11px slate-400
├────────────────────────┤
│                        │
│  ⬡ Dashboard           │  ← nav item
│  ✓ Approvals      [3] │  ← badge for count
│  👥 Workers            │
│  🌴 Leave              │
│  📊 Reports            │
│  ⚙️  Settings          │
│                        │
├────────────────────────┤
│  [Avatar] Alex J.      │  ← user info
│  admin@company.com     │
│  [Sign Out]            │
└────────────────────────┘
```

**Active item:** left border 3px `#2563EB`, bg `#1E3A8A/20`, text white
**Inactive:** slate-400, hover: slate-200 bg

**Badge:** Rounded pill, red-500 bg, white text, 18px height

---

## 3.3 Top Header

```
┌────────────────────────────────────────────────────────┐
│ Dashboard                     🔍 Search...   🌙  👤   │
│ Overview of your team today                            │
└────────────────────────────────────────────────────────┘
```

- Left: Page title (H1) + subtitle (slate-500)
- Right: Global search input, dark mode toggle, user avatar
- Bottom border: `#E2E8F0`

---

## 3.4 Dashboard Page

### KPI Cards Row (top)

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  🟢 ACTIVE NOW   │ │  ⏱  TODAY HOURS  │ │  ⏳ APPROVALS    │ │  🌴 LEAVE TODAY  │
│      12          │ │     94.5h        │ │       3          │ │       2          │
│  workers clocked │ │  across 8 proj.  │ │  need review     │ │  workers off     │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘
```

**Card spec:**
- Background: white (light) / `#1E293B` (dark)
- Top colored bar: 4px, color matches semantic (green/blue/amber/slate)
- Icon: 40px circle, colored bg/10
- Number: 32px bold
- Subtitle: 12px slate-500

### Live Activity Table (below KPI cards)

**Title:** "Currently Clocked In" + auto-refresh every 60s indicator

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Worker          │  Project            │  Clocked In  │  Duration │ Status│
├──────────────────┼─────────────────────┼──────────────┼───────────┼───────┤
│  ● Alex J.       │  Downtown Tower     │  7:43 AM     │  4h 12m   │  OK   │
│  ● Maria S.      │  Westside Condos    │  8:01 AM     │  3h 54m   │  OK   │
│  ⚠ Tom K.        │  Downtown Tower     │  7:15 AM     │  4h 40m   │  ~OT  │
└───────────────────────────────────────────────────────────────────────────┘
```

- Green dot: active
- Amber dot + ~OT badge: approaching overtime (> 7.5h)
- Rows are clickable → opens worker detail slide-over

### Alerts Panel (right column or below table)

```
┌────────────────────────────────────────────────┐
│ ⚠️  Alerts                                    │
├────────────────────────────────────────────────┤
│ ● Tom K. is at 4h 40m — approaching overtime   │
│ ● Maria S. has no clock-out from yesterday      │
│ ● 3 manual entries awaiting your approval       │
└────────────────────────────────────────────────┘
```

---

## 3.5 Approvals Page

### Tab Navigation

```
[Manual Entries (2)]  [Leave Requests (1)]  [Overtime Requests (0)]
```
Active tab: blue text + bottom border. Badges with counts.

### Manual Entries Tab

**Action bar:**
```
[🔍 Search by name...]   [Date: This Week ▼]   [Bulk Approve ✓]  [Bulk Reject ✗]
```

**Table:**
```
┌───┬────────────┬──────────┬───────────┬───────────┬──────────────┬────────────────┐
│ ☐ │  Worker    │  Date    │  Clock In │  Clock Out│  Reason      │  Actions       │
├───┼────────────┼──────────┼───────────┼───────────┼──────────────┼────────────────┤
│ ☐ │ Alex J.    │ Mar 27   │  8:00 AM  │  4:00 PM  │ Forgot       │ [✓][✗][Edit]  │
│ ☐ │ Tom K.     │ Mar 26   │  7:30 AM  │  5:00 PM  │ No phone     │ [✓][✗][Edit]  │
└───┴────────────┴──────────┴───────────┴───────────┴──────────────┴────────────────┘
```

**Row behavior:**
- Hover: `#F8FAFC` bg tint (light), `#1E293B` bg (dark)
- Checkbox: appears on hover or if any row is selected
- `[✓]` button: green, icon only (CheckCircle), tooltip "Approve"
- `[✗]` button: red bg/10, red text, icon only, tooltip "Reject"
- `[Edit]` button: slate ghost button — opens slide-over

**Manual entry reason badge:**
```
FORGOT       → amber pill
NO_PHONE     → slate pill
SYSTEM_ERROR → red pill
OTHER        → slate pill
```

**Approval Slide-Over (from Edit or row click):**
```
[Slide in from right, 480px wide, overlay with dim]

┌──────────────────────────────────────┐
│ Review Time Entry           [✕ Close]│
├──────────────────────────────────────┤
│ Alex Johnson                          │
│ Mar 27, 2026                          │
│                                       │
│ Clock In    8:00 AM                   │
│ Clock Out   4:00 PM                   │
│ Duration    8h 00m                    │
│ Project     Downtown Tower            │
│                                       │
│ ┌──────────────────────────────────┐ │
│ │ ⚠️ Manual Entry — Forgot        │ │  ← reason banner
│ └──────────────────────────────────┘ │
│                                       │
│ Manager Note (optional)               │
│ ┌──────────────────────────────────┐ │
│ │ Add a note...                    │ │
│ └──────────────────────────────────┘ │
│                                       │
│ [Approve ✓]        [Reject ✗]        │
└──────────────────────────────────────┘
```

### Leave Requests Tab

**Table:**
```
┌───┬────────────┬──────────────┬───────────────┬────────┬─────────────┬──────────┐
│ ☐ │  Worker    │  Leave Type  │  Dates        │  Days  │  Balance    │ Actions  │
├───┼────────────┼──────────────┼───────────────┼────────┼─────────────┼──────────┤
│ ☐ │ Sarah M.   │ Vacation     │ Apr 1 – Apr 5 │  5     │  7 days left│[✓][✗]   │
└───┴────────────┴──────────────┴───────────────┴────────┴─────────────┴──────────┘
```

Balance column: amber text if low (< 2 days), green if healthy

---

## 3.6 Workers Page

### Action Bar

```
[+ Add Worker]    [🔍 Search by name or email...]    [Role: All ▼]    [Status: Active ▼]
```

### Workers Table

```
┌──────────────────┬──────────┬───────────────────────┬──────────────┬────────┬──────────┐
│  Name            │  Role    │  Email                │  Base Rate   │ Status │ Actions  │
├──────────────────┼──────────┼───────────────────────┼──────────────┼────────┼──────────┤
│  [Av] Alex J.    │ Worker   │ alex@company.com       │ $28/h CAD    │ ● Active│ [···]   │
│  [Av] Sarah M.   │ Manager  │ sarah@company.com      │ $45/h CAD    │ ● Active│ [···]   │
│  [Av] Tom K.     │ Worker   │ tom@company.com        │ Not set  ⚠   │ ● Active│ [···]   │
└──────────────────┴──────────┴───────────────────────┴──────────────┴────────┴──────────┘
```

- Avatar: 32px circle with initials, colored bg
- `[···]` opens dropdown: Edit, View Timesheets, Deactivate
- "Not set ⚠" in rate column: amber text, indicates missing rate (affects payroll)
- Clicking a row opens the Worker Detail Slide-Over

### Worker Detail Slide-Over (480px)

**Tabs inside slide-over:**

```
[Profile]  [Rates]  [Managers]  [Timesheets]
```

**Profile Tab:**
```
[Avatar, 64px]
Alex Johnson
alex@company.com
Phone: +1 604 123 4567

Role           [Worker ▼]
Status         ● Active
Joined         Jan 15, 2026
Timezone       America/Vancouver
```

**Rates Tab:**
```
Current Rate
$28.00 / hour  CAD
Effective from Jan 15, 2026
                              [Edit Rate]

Rate History:
Jan 15 – present    $28.00/h
Oct 1 – Jan 14      $25.00/h

Project Overrides:
No overrides set.              [+ Add Override]
```

**Managers Tab:**
```
Reports to:
  [Av] Sarah M.  (Manager)          [Remove]

[ + Assign Manager ]
```

**Timesheets Tab:**
```
[Date range: This Month ▼]

Week of Mar 24–28:  38.5h   ● All Approved
Week of Mar 17–21:  40.0h   ⚠ 1 Pending

[View full timesheet →]
```

### Add Worker Modal (not slide-over — centered modal)

```
First Name *        Last Name *
[_______________]   [_______________]

Email *
[_______________________________]

Role *              Hourly Rate
[Worker ▼]         [28.00]  [CAD ▼]

[Cancel]                    [Send Invite]
```

---

## 3.7 Reports & Payroll Page

### Parameters Card (sticky top)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Date Range                                                          │
│  [Last Week] [This Month] [Last Month] [Custom...]                  │
│                                                                      │
│  Filter by Project: [All ▼]    Filter by Worker: [All ▼]           │
│                                                                      │
│  [Generate Report]                  [Export Excel ↓] [Export PDF ↓]│
└──────────────────────────────────────────────────────────────────────┘
```

**Date range presets:** pill buttons, active = blue filled

### Summary Cards (after generation)

```
┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ Total Hours    │ │ Total Cost     │ │ Workers        │
│   348.5h       │ │  $9,758 CAD    │ │    12          │
└────────────────┘ └────────────────┘ └────────────────┘
```

### Grouped Report Table

**Toggle:** [By Worker] [By Project] [Detailed]

**By Worker view:**
```
┌─────────────────┬─────────────┬──────────────┬──────────────┬────────────┐
│  Worker         │  Reg. Hours │  OT Hours    │  Avg Rate    │  Total Pay │
├─────────────────┼─────────────┼──────────────┼──────────────┼────────────┤
│ ▶ Alex J.       │  38.5h      │  0.0h        │  $28/h       │  $1,078    │
│   Mar 24        │   7.5h      │  –           │  $28/h       │  $210      │
│   Mar 25        │   8.0h      │  –           │  $28/h       │  $224      │
│   ...           │   ...       │              │              │            │
├─────────────────┼─────────────┼──────────────┼──────────────┼────────────┤
│ TOTAL           │  348.5h     │  12.0h       │   –          │  $9,758    │
└─────────────────┴─────────────┴──────────────┴──────────────┴────────────┘
```

- Expandable rows (accordion) for per-day breakdown
- OT hours: amber text color
- Total row: bold, light blue bg

---

## 3.8 Settings Page

### Layout: Vertical tabs on left

```
┌──────────────────┬──────────────────────────────────────────────────┐
│ General          │  General Settings                                 │
│ Time Tracking    │                                                    │
│ Payroll Rules    │  Company Timezone                                  │
│ Leave Types      │  [America/Toronto ▼]                              │
│ Notifications    │                                                    │
│                  │  Default Currency                                  │
│                  │  [CAD ▼]                                          │
│                  │                                                    │
│                  │  ─────────────────────────────────                │
│                  │  Danger Zone                                       │
│                  │  [Deactivate Company Account]  ← red, outlined    │
└──────────────────┴──────────────────────────────────────────────────┘
```

**Time Tracking tab:**
```
Auto Clock-Out
  After how many hours? [14 ▼]
  Toggle: [─────●] Enable auto clock-out

Geofencing
  Toggle: [●─────] Enabled
  Radius: [500m ▼]
  Mode:   ○ Soft (warn only)  ● Hard (block)
```

**Payroll Rules tab:**
```
Daily Overtime After       [8] hours
Weekly Overtime After      [40] hours
Overtime Multiplier        [1.5] x
```

**Leave Types tab:**
```
┌──────────────────────────────────────────────────┐
│  Type Name          Days/Year    Unlimited  Edit  │
├──────────────────────────────────────────────────┤
│  Vacation           10           No         [✎]  │
│  Sick               5            No         [✎]  │
│  CAN Bereavement    5            No         [✎]  │
│  CAN Jury Duty      –            Yes        [✎]  │
└──────────────────────────────────────────────────┘
[+ Add Leave Type]
```

---

## 3.9 Dark Mode

**Toggle:** Moon icon in header, switches entire admin to dark palette.

```
Light → Dark mapping:
  Page bg:       #F8FAFC  →  #0F172A
  Card bg:       #FFFFFF  →  #1E293B
  Border:        #E2E8F0  →  #334155
  Text primary:  #0F172A  →  #F8FAFC
  Text muted:    #64748B  →  #94A3B8
  Input bg:      #F8FAFC  →  #0F172A
  Input border:  #E2E8F0  →  #334155
```

Persist preference to `localStorage`.

---

# PART 4: INTERACTION PATTERNS

## 4.1 Mobile Gestures

| Gesture | Action |
|---------|--------|
| Swipe right on history card | Quick approve (manager view) |
| Swipe left on history card | View detail |
| Pull down | Refresh |
| Long press clock button | Cancel/undo |
| Pinch on calendar | Zoom week ↔ month |

## 4.2 Loading States

**Mobile:**
- Skeleton loaders (animated shimmer) for card lists
- Spinner inside buttons during action
- Full-screen loader only for initial auth check

**Admin:**
- Table skeleton: 3 ghost rows with shimmer
- KPI cards: skeleton pulse
- Never block entire page with overlay spinner

## 4.3 Toast Notifications

**Position:** Mobile = top center. Admin = bottom right.

```
Success:  [✓] "Clocked in at 7:43 AM"         ← green, 3s auto-dismiss
Error:    [✗] "Failed to clock in. Retry."     ← red, 5s + manual dismiss
Info:     [ℹ] "Entry submitted for approval"   ← blue, 3s
Warning:  [⚠] "No GPS signal — proceeding..."  ← amber, 4s
```

## 4.4 Empty States

Every table and list must have an empty state:
- Icon (48px, slate-400)
- Title: "No [items] yet"
- Subtitle: action prompt
- Optional CTA button

## 4.5 Confirmation Dialogs

For destructive actions only (reject, deactivate, delete):
```
Modal, centered, 400px max:
  Title: "Reject this entry?"
  Body:  "Alex J. will be notified and asked to resubmit."
  [Cancel]   [Reject Entry]   ← destructive button: red
```

---

# PART 5: IMPLEMENTATION NOTES FOR DEVELOPERS

## 5.1 Component Libraries to Use

```
tailwindcss v4         (utility CSS)
lucide-react           (icons — consistent set)
@radix-ui/react-*      (accessible primitives: Dialog, Tabs, Select, Toast)
react-router-dom v7    (routing)
motion (framer-motion) (animations)
```

Do NOT use a component library (no shadcn, no MUI, no Chakra) — build from primitives for full design control.

## 5.2 Tailwind Config Additions Needed

```js
// tailwind.config.js
theme: {
  extend: {
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'monospace'],  // for the clock timer
    },
    animation: {
      'pulse-border': 'pulse-border 2s ease-in-out infinite',
      'shimmer': 'shimmer 1.5s infinite',
    }
  }
}
```

## 5.3 Key Accessibility Requirements

- All interactive elements: minimum 44×44px touch target
- Color is never the only indicator of state (always pair with icon/label)
- All form inputs have visible labels (not just placeholder)
- Focus rings visible: `focus-visible:ring-2 focus-visible:ring-blue-500`
- Contrast ratio: minimum 4.5:1 for body text

## 5.4 Animation Principles

- Clock pulse: `box-shadow 0 0 0 0 rgba(22,163,74,0.4)` → `0 0 0 12px rgba(22,163,74,0)`, 2s ease infinite
- Page transitions: fade 150ms ease
- Slide-over: slide-in-from-right 250ms ease-out
- Modal: fade + scale 0.95→1.0, 200ms ease-out
- Toast: slide up + fade in 200ms, fade out 300ms
- Skeleton: linear-gradient shimmer 1.5s infinite

---

*End of UI/UX Specifications*
*Version 1.0 — March 28, 2026*
