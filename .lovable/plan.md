# Plan - Fix Reports Runtime Error (ZodError: Invalid UUID)

Fix the `ZodError: Invalid UUID` occurring in the Reports screen by correcting the frontend state management and implementing centralized normalization for all UUID filters.

## User Review Required

> [!IMPORTANT]
> The audit summary for the previous task (Multi-select filters) and the new task (ZodError fix) will be updated in the hidden technical section of the Landing Page.

- Do you want to allow "All Profiles" in the consolidated ledger view, or should it remain strictly isolated per profile? (The instructions suggest allowing "All" for general summaries but isolating for institutional reports). I will implement normalization that allows `null` (All) where appropriate.

## Proposed Changes

### 1. Centralized Normalization Helpers
- Create `normalizeOptionalUuid` and `normalizeUuidArray` in `src/routes/_authenticated/app.reports.tsx` to handle "all", "", and invalid strings.

### 2. Frontend State Correction (`src/routes/_authenticated/app.reports.tsx`)
- Change initial `profileId` state from `""` to `"all"`.
- Implement `normalizedProfileId` and `normalizedPropertyId` variables.
- Update `runModelReport` to validate `normalizedProfileId` before calling `loadReportDataset`.
- Fix `useQuery` for `ledger` and `selectedBrand` to use `enabled: Boolean(normalizedProfileId)` and use the normalized values in the `queryKey` and `queryFn`.
- Add an error boundary or descriptive error message to the page to prevent "Blank Screen" on query failures.

### 3. Logic Refinement
- Ensure all multi-select filters (Properties, Categories, Recipients) are filtered to exclude non-UUID values before being sent to the server.
- Coerce empty or "all" values to `null` for Supabase compatibility.

### 4. Technical Audit Log (`src/routes/index.tsx`)
- Update the hidden section of the Landing Page with the 20-point audit summary requested.

## Verification Plan

### Automated/Playwright
- **Test 1: Page Load:** Open Reports page from scratch, verify no `Invalid UUID` console errors and no blank screen.
- **Test 2: Payload Verification:** Intercept network requests and verify:
  - Initial load (All Profiles) sends `profileId: null`.
  - Profile selection sends `profileId: UUID`.
  - Switching back to "All" sends `profileId: null`.
- **Test 3: Model Reports:** Click "Relatório Mensal" with no profile selected, verify toast error "Selecione um perfil...".
- **Test 4: Error Handling:** Mock a failed query and verify the UI shows an error message instead of crashing.

### Manual Verification
- Perform the "Troca de Perfil" test: All -> Holding -> Pessoal -> All.
- Test multi-select filters to ensure no `["all"]` is sent in the array.
