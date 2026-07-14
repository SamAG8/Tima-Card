import { supabase } from './supabase';

export type ActiveNowRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  clock_in: string;
  project_name: string | null;
  user_timezone: string;
};

/** All requests go to `VITE_API_BASE_URL` — no client-side mock data. */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';

function assertBaseUrl(): void {
  if (!BASE_URL || BASE_URL === 'undefined') {
    throw new Error(
      'VITE_API_BASE_URL is missing. Set it in timeclock-admin/.env (e.g. VITE_API_BASE_URL=http://localhost:8000) and restart the dev server.',
    );
  }
}

/** FastAPI may return detail as string, array of {loc,msg}, or object. */
function formatApiDetail(detail: unknown): string {
  if (detail == null) return 'Request failed';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item: unknown) => {
        if (item && typeof item === 'object' && 'msg' in item) return String((item as { msg: string }).msg);
        return JSON.stringify(item);
      })
      .join('; ');
  }
  if (typeof detail === 'object' && detail !== null && 'message' in detail) {
    return String((detail as { message: string }).message);
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return 'Request failed';
  }
}

function networkErrorMessage(cause: unknown): Error {
  const raw = cause instanceof Error ? cause.message : String(cause);
  const isUnreachable =
    raw === 'Load failed' ||
    raw === 'Failed to fetch' ||
    raw.includes('NetworkError') ||
    raw.includes('network');
  if (isUnreachable) {
    return new Error(
      `Cannot reach the API at ${BASE_URL || '(not configured)'} — start the backend (uvicorn on port 8000), check the URL, and ensure the browser allows requests to that host.`,
    );
  }
  return cause instanceof Error ? cause : new Error(raw);
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(method: string, path: string, body?: unknown, params?: Record<string, string>): Promise<T> {
  assertBaseUrl();
  const headers = await authHeaders();
  let url: URL;
  try {
    url = new URL(`${BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`);
  } catch {
    throw new Error(`Invalid VITE_API_BASE_URL: ${BASE_URL}`);
  }
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  let res: Response;
  try {
    res = await fetch(url.toString(), { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw networkErrorMessage(e);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText || res.status }));
    const detail = formatApiDetail((err as { detail?: unknown }).detail ?? err);
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getPendingApprovals: (company_id: string) =>
    request<unknown[]>('GET', '/api/v1/approvals/pending', undefined, { company_id }),

  reviewEntry: (body: { company_id: string; time_entry_id: string; result: 'APPROVED' | 'REJECTED'; notes?: string }) =>
    request('POST', '/api/v1/approvals/review', body),

  getPendingLeave: (company_id: string) =>
    request<unknown[]>('GET', '/api/v1/leave/pending', undefined, { company_id }),

  reviewLeave: (body: { company_id: string; leave_request_id: string; result: 'APPROVED' | 'REJECTED'; notes?: string }) =>
    request('POST', '/api/v1/leave/review', body),

  getPayrollReport: (company_id: string, start_date: string, end_date: string) =>
    request('GET', '/api/v1/reports/payroll', undefined, { company_id, start_date, end_date }),

  getCompanyMembers: (company_id: string) =>
    request<unknown[]>('GET', '/api/v1/team/members', undefined, { company_id }),

  getActiveNow: (company_id: string) =>
    request<ActiveNowRow[]>('GET', '/api/v1/team/active-now', undefined, { company_id }),

  getCompanyRates: (company_id: string) =>
    request<unknown[]>('GET', '/api/v1/rates', undefined, { company_id }),

  createRate: (body: { company_id: string; user_id?: string; project_id?: string; hourly_rate: number; currency: string; effective_date: string }) =>
    request('POST', '/api/v1/rates', body),

  getCompanySettings: (company_id: string) =>
    request('GET', `/api/v1/settings/${company_id}`),

  updateCompanySettings: (body: { company_id: string; [key: string]: unknown }) =>
    request('PUT', '/api/v1/settings', body),

  getLeaveTypes: (company_id: string) =>
    request<unknown[]>('GET', '/api/v1/leave/types', undefined, { company_id }),

  getPendingAdjustments: (company_id: string) =>
    request<unknown[]>('GET', '/api/v1/entries/adjustments/pending', undefined, { company_id }),

  reviewAdjustment: (body: { adjustment_id: string; result: 'APPROVED' | 'REJECTED'; review_note?: string }) =>
    request('POST', '/api/v1/entries/adjustments/review', body),

  getBudgetCodes: (company_id: string) =>
    request<unknown[]>('GET', '/api/v1/budget-codes', undefined, { company_id }),

  updateUserPermissions: (body: { user_id: string; role?: string; has_leave_access?: boolean; has_report_access?: boolean; has_team_report_access?: boolean }) =>
    request('POST', '/api/v1/team/update-permissions', body),

  getWorkerManagers: (company_id: string, worker_user_id: string) =>
    request<unknown[]>('GET', '/api/v1/team/managers', undefined, { company_id, worker_user_id }),

  assignManager: (body: { company_id: string; worker_user_id: string; manager_user_id: string }) =>
    request('POST', '/api/v1/team/assign-manager', body),

  removeManager: (body: { company_id: string; worker_user_id: string; manager_user_id: string }) =>
    request('POST', '/api/v1/team/remove-manager', body),

  getTeamEntries: (company_id: string, manager_user_id: string, start_date: string, end_date: string) =>
    request<unknown[]>('GET', '/api/v1/team/entries', undefined, { company_id, manager_user_id, start_date, end_date }),

  adminUpdateEntryTimes: (body: {
    entry_id: string;
    company_id: string;
    clock_in: string;
    clock_out: string;
    admin_note?: string;
  }) =>
    request<{ status: string; entry_id: string }>(
      'PATCH',
      `/api/v1/entries/${body.entry_id}/admin-times`,
      {
        company_id: body.company_id,
        clock_in: body.clock_in,
        clock_out: body.clock_out,
        admin_note: body.admin_note,
      },
    ),

  adminSetEntryStatus: (body: { entry_id: string; company_id: string; status: 'REJECTED' | 'SUBMITTED' }) =>
    request<{ status: string; entry_id: string; result: string }>(
      'PATCH',
      `/api/v1/entries/${body.entry_id}/admin-status`,
      { company_id: body.company_id, status: body.status },
    ),

  downloadPayrollExcel: async (company_id: string, start_date: string, end_date: string): Promise<void> => {
    assertBaseUrl();
    const headers = await authHeaders();
    const url = new URL(`${BASE_URL.replace(/\/$/, '')}/api/v1/reports/payroll/export-excel`);
    url.searchParams.set('company_id', company_id);
    url.searchParams.set('start_date', start_date);
    url.searchParams.set('end_date', end_date);
    let res: Response;
    try {
      res = await fetch(url.toString(), { headers });
    } catch (e) {
      throw networkErrorMessage(e);
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText || res.status }));
      throw new Error(formatApiDetail((err as { detail?: unknown }).detail ?? err) || 'Export failed');
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `payroll_${start_date}_${end_date}.xlsx`;
    a.click();
  },
};
