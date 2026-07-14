# UI/UX Specifications: Time Clock - Admin Dashboard

## Overview
This document serves as a prompt and specification for an AI UI/UX developer. The goal is to build a robust, desktop-optimized web application (React/Vite) for managers and administrators to oversee timesheets, manage workers, and generate payroll reports. The design should emphasize data density, clear hierarchy, and efficient workflows.

## General Design Guidelines
- **Theme:** Clean, professional dashboard look (often light mode for data density, but a dark mode toggle is appreciated).
- **Layout:** Sidebar navigation on the left, main content area on the right. Top header for user profile and global search/actions.
- **Tables:** Data tables are central to this app. They must support sorting, filtering, and bulk actions.
- **Modals/Slide-overs:** Use slide-over panels for editing details to keep context without navigating away.

---

## 1. Authentication
**Purpose:** Secure admin login.
**UI Elements:**
- Standard Email/Password or Magic Link login.
- Professional branding, clearly marked as "Admin Portal".

---

## 2. Dashboard (Overview)
**Purpose:** High-level overview of exactly what is happening today.
**UI Elements:**
- **KPI Cards (Top):**
  - Active Workers Right Now (number).
  - Total Hours Logged Today.
  - Pending Approvals (Manual Entries + Leave Requests).
- **Real-Time Map / Activity List:**
  - List of currently clocked-in workers, showing: Name, Project Location, Clock-In Time, Duration so far.
  - Status indicator if they are close to overtime.
- **Alerts Panel:**
  - Missed clock-outs.
  - Workers approaching maximum weekly hours.

---

## 3. Workers Management
**Purpose:** Add, edit, and manage payroll rates for the workforce.
**UI Elements:**
- **Action Bar:** `+ Add Worker` button, Search bar, Sub-contractor vs Employee filter.
- **Data Table:**
  - Columns: Name, Role, Email, Base Rate, O/T Rate, Current Status.
  - Row Actions: Edit, View Timesheets, Deactivate.
- **Worker Detail Slide-over (When a row is clicked):**
  - **Profile tab:** Personal details, role assignment.
  - **Rates tab:** Edit hourly rates, define specific project overrides.
  - **Managers tab:** Assign which managers can approve this worker's time.

---

## 4. Approvals (Timesheets & Leave)
**Purpose:** The inbox for managers to approve or reject time and leave.
**UI Elements:**
- **Tabs:** `Manual Entries`, `Leave Requests`, `Overtime Requests`.
- **Manual Entries Tab (Table):**
  - Columns: Worker Name, Date, Requested In, Requested Out, Reason (Forgot, System Error), Notes.
  - Actions: `Approve` (Green check), `Reject` (Red X), `Edit & Approve`.
- **Leave Requests Tab (Table):**
  - Columns: Worker Name, Type (Sick/Vacation), Dates, Total Hours, Notes.
  - Contextual Info: Show worker's remaining balance on hover or in a small badge.
  - Actions: `Approve`, `Reject`.

---

## 5. Reports & Payroll
**Purpose:** Extracting data for accounting and payroll processing.
**UI Elements:**
- **Parameters Form (Top Card):**
  - **Date Range Picker:** "Last Week", "This Month", Custom Range.
  - **Filters:** By Project, By Worker Role.
- **Report Preview (Data Table):**
  - Summarized table showing: Worker Name, Regular Hours, Overtime Hours, Total Pay (if admin has permission to see rates).
- **Export Actions:**
  - `Export to Excel/CSV` button (prominent).
  - `Export to PDF` (Detailed timesheet printouts).

---

## 6. Company Settings
**Purpose:** Global configuration for the platform.
**UI Elements:**
- **Vertical Tabs (Left side of content area):**
  - **General:** Company Name, Timezone.
  - **Time Tracking:** 
    - Auto-clock-out rules (e.g., "Auto clock out after 14 hours").
    - Geofence restrictions (toggle hard/soft blocks).
  - **Payroll Rules:**
    - Overtime thresholds (e.g., Daily > 8h, Weekly > 40h).
  - **Leave Types:** 
    - Manage standard categories (Sick, Vacation, Unpaid).
