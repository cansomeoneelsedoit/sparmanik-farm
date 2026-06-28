/**
 * Canonical expense categories, farm-tuned for Indonesian field purchases.
 * Shared by the single-expense dialog, the sheet-import review table, and the
 * AI OCR prompts so the suggestions, the dropdown, and the model all agree.
 * `category` on Expense is still free text — users can type their own — these
 * are just the offered options.
 */
export const EXPENSE_CATEGORIES = [
  "Materials",
  "Tools",
  "Chemicals",
  "Wages",
  "Food",
  "Transport",
  "Fuel",
  "Contractor",
  "Utilities",
  "Repairs",
  "Permits / fees",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
