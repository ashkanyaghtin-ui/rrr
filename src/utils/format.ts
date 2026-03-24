export const formatCurrency = (amountInCents: number): string => {
  return `AED ${(amountInCents / 100).toFixed(2)}`;
};
