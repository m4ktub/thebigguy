import { ChronikClient } from 'chronik-client';
export { type ScriptUtxos, type Utxo } from 'chronik-client';

const chronik = new ChronikClient("https://chronik.be.cash/xec");

export function scriptUtxos(hash: string) {
  return chronik.script('p2sh', hash).utxos();
}

export function broadcastTx(tx: string) {
  return chronik.broadcastTx(tx, false);
}
