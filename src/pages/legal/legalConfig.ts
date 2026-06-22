/**
 * Single source of truth for the legal entity that owns this app.
 * Update these values once and they propagate to Terms, Refund and Privacy pages.
 *
 * IMPORTANT: Paddle's go-live readiness check requires that these pages identify
 * the seller and disclose Paddle as the Merchant of Record / data sharing recipient.
 */
export const LEGAL = {
  businessName: "Cambridge Math Quest",
  contactEmail: "support@cambridge-math-quest.lovable.app",
  // Country of the seller. Affects governing-law clause.
  countryOfBusiness: "South Africa",
  // Refund window in days. Must be 14–90 to satisfy Paddle.
  refundWindowDays: 14,
  productSummary: "an online Cambridge AS & A-Level Mathematics 9709 practice platform",
};