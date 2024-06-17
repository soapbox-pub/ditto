import bolt11 from 'bolt11';

/** Decodes the invoice and returns the amount in millisatoshis */
function getAmount(invoice: string | undefined): string | undefined {
  if (!invoice) return;

  try {
    const decoded = bolt11.decode(invoice);
    return decoded?.millisatoshis ?? undefined;
  } catch {
    return;
  }
}

export { getAmount };
