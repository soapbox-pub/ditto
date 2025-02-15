import bolt11 from 'light-bolt11-decoder';

/** Decodes the invoice and returns the amount in millisatoshis */
function getAmount(invoice: string | undefined): string | undefined {
  if (!invoice) return;

  try {
    const amount = (bolt11.decode(invoice).sections as { name: string; value: string }[]).find(
      ({ name }) => name === 'amount',
    )?.value;
    return amount;
  } catch {
    return;
  }
}

export { getAmount };
