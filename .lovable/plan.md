# Plan: Correct Duplicate Logic with Mandatory Candidate Isolation

Ensure that duplicate alerts, scores, and badges in "Meu Cofre" are strictly tied to an existing candidate receipt. If no candidate is found, all duplicate-related indicators must be removed.

## User Review Required
> [!IMPORTANT]
> The system will perform a one-time cleanup of inconsistent records where a duplicate score exists without a valid candidate link.

## Proposed Changes

### Backend Logic (`src/lib/receipts.functions.ts`)

- **Strict Candidate Enforcement**: In `analyzeReceipt`, if a duplicate is detected, ensure `duplicate_of` and `duplicate_score` are only set if a valid `candidate_receipt_id` is successfully persisted.
- **Score Integrity**: Prohibit default scores (like 50/100). If no comparison is made, the score must be `0` or `null`.
- **Status Mapping**:
  - `duplicate`: Only when `duplicate_of` is NOT null.
  - `pending`: When no duplicate is found.

### Frontend UI (`src/routes/_authenticated/app.vault.tsx`)

- **Comparison Modal Logic**:
  - Sequence: Check `receipt.duplicate_of` -> Search `duplicate_checks` for the highest score for this receipt -> Fallback to re-running detection (if needed).
  - If no candidate is found during modal load, display an error and trigger a background cleanup of the receipt's duplicate status.
- **Visual Feedback**:
  - Show "Lançamento já existente" even if the candidate has no file attached ("Sem comprovante anexado").
  - Map specific badges:
    - "Possível duplicidade": When `duplicate_of` or `duplicate_check` exists AND status is NOT confirmed.
    - "Duplicado": Only when status is manually confirmed (e.g., `duplicate` status).
- **Cleanup on Empty**: If a receipt has a duplicate status/score but no candidate can be found in the database, clear those fields automatically to restore the receipt to the normal flow.

### Integrity Routine

- Implement a server function to reconcile existing receipts:
  - If `duplicate_score > 0` and `duplicate_of` is null -> Try to find a match in `duplicate_checks`.
  - If still null -> Clear `duplicate_score` and set status to `pending`.

## Technical Details

- **Database**: Use `duplicate_checks` as the source of truth for similarity motifs and scores.
- **Queries**: Refine Supabase queries to fetch candidates by `receipt_id` and ensure they still exist in the `receipts` table.
- **Schema**: Update `receipts` table to clear `duplicate_of` and `duplicate_score` if the candidate is deleted.
