export const formatCurrency = (amountInCents: number): string => {
  return `AED ${(amountInCents / 100).toFixed(2)}`;
};

export const formatCurrencyDirect = (amount: number): string => {
  return `AED ${amount.toFixed(2)}`;
};
