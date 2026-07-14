/** Shared types for payroll API (Reports + Dashboard time-entry panel). */

export interface PayrollDetailRow {
  entry_id: string;
  user_id: string;
  project_id: string;
  project_name?: string | null;
  worker_email?: string | null;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  /** Work notes from the worker (clock-out / entry). */
  description?: string | null;
  hours_worked: number;
  hourly_rate?: number | null;
  currency: string;
  total_cost?: number | null;
  budget_code?: string | null;
  budget_code_name?: string | null;
  division?: string | null;
}

export interface WorkerRow {
  user_id: string;
  full_name?: string;
  email?: string;
  total_hours: number;
  total_cost: number;
  currency: string;
  entries: number;
}

export interface ProjectRow {
  project_id: string;
  project_name?: string;
  total_hours: number;
  total_cost: number;
  currency: string;
}

export interface BudgetCodeRow {
  budget_code_id: string | null;
  budget_code: string | null;
  budget_code_name: string | null;
  division: string | null;
  category: string | null;
  total_hours: number;
  total_cost: number;
  currency: string;
  entries: number;
}

export interface DivisionRow {
  division: string | null;
  total_hours: number;
  total_cost: number;
  currency: string;
  entries: number;
}

export interface PayrollReport {
  rows?: PayrollDetailRow[];
  by_worker: WorkerRow[];
  by_project: ProjectRow[];
  by_budget_code: BudgetCodeRow[];
  by_division: DivisionRow[];
  total_entries: number;
  total_hours: number;
  total_cost: number;
  currency: string;
}
