import { supabase } from './supabase';

/** All requests go to `VITE_API_BASE_URL` — no client-side mock data. */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';

function assertBaseUrl(): void {
  if (!BASE_URL || BASE_URL === 'undefined') {
    throw new Error(
      'VITE_API_BASE_URL is missing. Set it in timeclock-app/.env (e.g. VITE_API_BASE_URL=http://localhost:8000) and restart the dev server.',
    );
  }
}

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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<T> {
  assertBaseUrl();
  const headers = await authHeaders();
  let url: URL;
  try {
    url = new URL(`${BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`);
  } catch {
    throw new Error(`Invalid VITE_API_BASE_URL: ${BASE_URL}`);
  }
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw networkErrorMessage(e);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText || res.status }));
    const detail = formatApiDetail((err as { detail?: unknown }).detail ?? err);
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  clockIn: (body: {
    company_id: string;
    project_id: string;
    user_timezone: string;
    lat?: number;
    lng?: number;
  }) => request('POST', '/api/v1/entries/clock-in', body),

  clockOut: (body: {
    company_id: string;
    description?: string;
    tags?: string[];
    budget_code_id?: string;
    ai_summary?: string;
    lat?: number;
    lng?: number;
  }) => request('POST', '/api/v1/entries/clock-out', body),

  getActiveEntry: (company_id: string) =>
    request<{ clocked_in: boolean; entry: unknown }>('GET', '/api/v1/entries/active', undefined, { company_id }),

  getMyEntries: (company_id: string) =>
    request<unknown[]>('GET', '/api/v1/entries/my', undefined, { company_id }),

  createManualEntry: (body: {
    company_id: string;
    project_id: string;
    work_date: string;
    clock_in: string;
    clock_out: string;
    user_timezone: string;
    manual_reason: string;
    manual_note?: string;
    description?: string;
    tags?: string[];
  }) => request('POST', '/api/v1/entries/manual', body),

  getLeaveTypes: (company_id: string) =>
    request<unknown[]>('GET', '/api/v1/leave/types', undefined, { company_id }),

  getLeaveBalances: (company_id: string, year?: number) =>
    request<unknown[]>('GET', '/api/v1/leave/balances', undefined, {
      company_id,
      ...(year ? { year: String(year) } : {}),
    }),

  getMyLeaveRequests: (company_id: string) =>
    request<unknown[]>('GET', '/api/v1/leave/my-requests', undefined, { company_id }),

  requestLeave: (body: {
    company_id: string;
    leave_type_id: string;
    start_date: string;
    end_date: string;
    notes?: string;
  }) => request('POST', '/api/v1/leave/request', body),

  getPendingApprovals: (company_id: string) =>
    request<unknown[]>('GET', '/api/v1/approvals/pending', undefined, { company_id }),

  reviewEntry: (body: {
    company_id: string;
    time_entry_id: string;
    result: 'APPROVED' | 'REJECTED';
    notes?: string;
  }) => request('POST', '/api/v1/approvals/review', body),

  analyzeWork: (body: { description: string; company_id: string; project_name?: string; duration_minutes?: number }) =>
    request<{ budget_code_id: string | null; budget_code: string | null; budget_code_name: string | null; summary: string | null }>(
      'POST',
      '/api/v1/ai/analyze-work',
      body,
    ),

  getBudgetCodes: (company_id: string) =>
    request<{ id: string; code: string; name: string; category: string; division: string }[]>(
      'GET',
      '/api/v1/budget-codes',
      undefined,
      { company_id },
    ),

  requestTimeAdjustment: (body: {
    company_id: string;
    time_entry_id: string;
    adjustment_type: 'CLOCK_IN' | 'CLOCK_OUT' | 'BOTH';
    original_clock_in?: string;
    original_clock_out?: string;
    requested_clock_in?: string;
    requested_clock_out?: string;
    reason?: string;
  }) => request('POST', '/api/v1/budget-codes/request-adjustment', body),

  downloadPayrollExcel: async (
    company_id: string,
    start_date: string,
    end_date: string,
  ): Promise<void> => {
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
