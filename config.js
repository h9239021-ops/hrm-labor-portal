// Supabase connection for HRM 노무관리파트 업무포털.
// Shares the login accounts of the 근로감독 대시보드 project but uses its own portal_* tables
// and its own permission table (portal_access). Every table is protected by Row Level Security
// (see supabase/portal_schema.sql: portal_level / portal_has), so the publishable key is safe to expose.
window.SUPABASE_CONFIG = {
    url: "https://pkvuhwzowniepnfadlky.supabase.co",
    anonKey: "sb_publishable_pnFQ46hbfpaTWZrfpq6ahw_pJiqobW6"
};