## 2024-05-18 - Un-memoized Filter Functions
**Learning:** React components returning dynamic arrays via inline functions (like `getFilteredLeads()`) are an anti-pattern when rendering lists because they defeat React reconciliation (always triggering re-renders) and block the main thread unnecessarily. This is especially bad in large CRM lists like `Clients` and `Leads`.
**Action:** Use `React.useMemo` to cache the array reference until dependencies genuinely change.
