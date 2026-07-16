"""
Shared role-key constants for Time Clock access control.

These lists were previously duplicated as literals across several routers
(entries, approvals, leave, reports) plus an unused set in the subscription
middleware. They are consolidated here so there is exactly one source of truth.
The values are unchanged from the former per-router literals.
"""

# Roles allowed to manage / approve other workers' time in Time Clock.
# Mixes CDefApp role keys (upper-case) with Time Clock ``users.role`` values.
MANAGER_ROLES = ["OWNER", "ADMIN", "MANAGER", "admin", "super_admin", "manager"]

# Roles allowed to manage company-level configuration (rates, settings, team).
ADMIN_ROLES = ["OWNER", "ADMIN"]
