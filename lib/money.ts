/**
 * Comissão da thesain26 em dólares (unidade maior), como a Whop espera em
 * `application_fee_amount`. O valor precisa ser positivo e menor que o preço.
 */
export function applicationFeeAmount(price: number, percent: number) {
  const raw = Math.round(price * (percent / 100) * 100) / 100;
  let fee = raw < 0.01 ? 0.01 : raw;
  if (fee >= price) {
    fee = Math.round((price - 0.01) * 100) / 100;
  }
  if (!(fee > 0) || fee >= price) {
    throw new Error(
      "O preço precisa deixar margem para a comissão da thesain26.",
    );
  }
  return Number(fee.toFixed(2));
}
