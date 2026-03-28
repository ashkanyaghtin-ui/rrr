export const formatCurrency = (amountInCents: number): string => {
  return `AED ${(amountInCents / 100).toFixed(2)}`;
};

export const formatCurrencyDirect = (amountInDollars: number): string => {
  return `AED ${amountInDollars.toFixed(2)}`;
};
