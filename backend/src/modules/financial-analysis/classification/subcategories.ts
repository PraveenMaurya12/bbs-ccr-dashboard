import type { TransactionCategory } from '../financial-analysis.types'

/**
 * The spec's own exact per-category subcategory vocabulary (Part 4 of the
 * task — "Transaction Classification"). Free-text at the Prisma layer (see
 * NormalizedTransaction.subcategory's own doc comment), validated against
 * this list at the application layer instead — same convention
 * CreditAccount.accountType already established, so this list can grow
 * without a migration.
 */
export const SUBCATEGORIES_BY_CATEGORY: Record<TransactionCategory, readonly string[]> = {
  INCOME: ['Salary', 'Business income', 'Gig income', 'Pension', 'Interest', 'Government benefits', 'Other recurring earned income', 'Bonus'],
  BORROWING: ['Personal loan', 'Consumer loan', 'BNPL', 'Finance-company loan', 'Other loan proceeds'],
  EXPENSE: [
    'Rent', 'Utilities', 'Groceries', 'Education', 'Medical', 'Insurance', 'Household',
    'EMI', 'Loan repayment', 'Credit-card payment', 'Insurance premium', 'Investment',
    'Restaurant', 'Shopping', 'Entertainment', 'Travel', 'Subscription',
  ],
  TRANSFERS: ['Self transfer', 'P2P transfer', 'Business transfer', 'Internal transfer'],
  CASH: ['ATM withdrawal', 'Cash deposit'],
  OTHER: ['Refund', 'Investment redemption', 'Asset sale', 'Round trip'],
  UNCLASSIFIED: [],
}

/** D01-style financial subcategories (Rule/Part 4) — kept separate from Essential/Discretionary for F17's double-count prevention and the Debt & EMI section's own reconciliation view. */
export const FINANCIAL_SUBCATEGORIES = ['EMI', 'Loan repayment', 'Credit-card payment', 'Insurance premium', 'Investment']
export const ESSENTIAL_SUBCATEGORIES = ['Rent', 'Utilities', 'Groceries', 'Education', 'Medical', 'Insurance', 'Household']
export const DISCRETIONARY_SUBCATEGORIES = ['Restaurant', 'Shopping', 'Entertainment', 'Travel', 'Subscription']
