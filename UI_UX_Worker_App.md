# UI/UX Specifications: Time Clock - Worker Application

## Overview
This document serves as a prompt and specification for an AI UI/UX developer. The goal is to build a mobile-first, highly responsive web application (PWA ready) for construction and field workers to track their time, request leave, and manage their timesheets. The design should be modern, clean, with large tap targets suitable for outdoor use.

## General Design Guidelines
- **Theme:** Dark mode by default (slate/navy tones with distinct, highly visible accent colors for primary actions).
- **Typography:** Sans-serif, highly legible (e.g., Inter, Roboto).
- **Navigation:** Bottom navigation bar for core routes (Clock, History, Leave, Profile).
- **Feedback:** Visual and haptic (if possible) feedback for all button presses, especially tracking time.

---

## 1. Authentication Screen
**Purpose:** Secure login for workers using Supabase Magic Links or Email/Password.
**UI Elements:**
- **Logo/Branding:** Company logo prominently displayed.
- **Form Fields:** 
  - Email input (large text, easy to tap).
- **Action Buttons:**
  - `Send Magic Link` (Primary button, distinct color).
- **States:**
  - Loading spinner while sending the link.
  - Success message: "Check your email for the login link."

---

## 2. Main Clock Screen (Home)
**Purpose:** The central screen for starting and stopping work, and viewing current status.
**UI Elements:**
- **Header:** 
  - Current Date and Time (large, dynamic).
  - Welcome message: "Hello, [User Name]".
- **Current Status Card:**
  - Status indicator (e.g., Green = "Clocked In", Red = "Clocked Out", Amber = "On Break").
  - Current assigned project name.
  - Duration of current shift (e.g., `04:23:45` updating in real-time).
- **Primary Actions (The "Big Button"):**
  - **Clock In:** Massive, extremely prominent circular or rounded button (Green or vibrant Blue).
  - **Clock Out:** Distinct from Clock In (e.g., Red or outline style) to prevent accidental taps.
  - **Take Break:** Secondary action button below the main clock.
- **Contextual Info:**
  - Geofence status indicator (e.g., "📍 At Site: First&Royal" or "⚠️ Outside Geofence").
- **Missed Entry Prompt:**
  - If the system detects a missed clock-out from the previous day, a banner displays: "You missed a clock-out yesterday. `Fix it here`."

---

## 3. Manual Entry Screen
**Purpose:** Allows workers to log time if they forgot their phone, had system errors, etc.
**UI Elements:**
- **Header:** "Submit Manual Entry" with a back button.
- **Form Fields:**
  - Date Picker (defaults to today).
  - Start Time & End Time pickers.
  - **Reason Dropdown/Chips:** "Forgot to clock in", "No Phone", "System Error", "Other".
  - **Notes Textarea:** Optional explanation field.
- **Action Buttons:**
  - `Submit for Approval` (Primary button).
- **Feedback:**
  - Text explaining: "Manual entries require manager approval before being added to your timesheet."

---

## 4. History Screen (Timesheets)
**Purpose:** Review past shifts and hours worked.
**UI Elements:**
- **Summary Metrics (Top):**
  - This Week's Total Hours.
  - Today's Total Hours.
- **List View (Recent Entries):**
  - Grouped by Day/Date.
  - Each item shows: Project Name, Clock In Time, Clock Out Time, Total Duration.
  - **Status Badges:** `Approved`, `Pending` (for manual entries), `Rejected`.
- **Filtering:**
  - Simple tabs or dropdown for "This Week", "Last Week", "This Month".

---

## 5. Leave Requests Screen
**Purpose:** Request time off and view balances.
**UI Elements:**
- **Balances Section:**
  - Cards showing available hours for: Vacation, Sick Leave, Unpaid Time Off.
- **Request Form:**
  - Leave Type dropdown.
  - "From Date" and "To Date".
  - Optional Notes.
  - `Submit Leave Request` button.
- **Pending/History List:**
  - List of recent requests with status (`Pending`, `Approved`, `Declined`).

---

## 6. Profile & Settings
**Purpose:** Manage user account and app settings.
**UI Elements:**
- **User Info:** Avatar, Name, Role, Current Rate Type.
- **Preferences:**
  - Theme toggle (Dark/Light).
  - Notification toggles.
- **System Actions:**
  - `Logout` button (Red, bottom of screen).
  - App version text indicator.
