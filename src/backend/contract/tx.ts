import {
  ALL_ANYONECANPAY_BIP143,
  Ecc,
  Int,
  Script,
  Tx,
  TxBuilder,
  UnsignedTx,
  UnsignedTxInput,
  flagSignature,
  pushBytesOp,
  sha256d
} from "ecash-lib";
import { createOutputs } from "./payment";
import { createScript, type Party } from "./script";
import { serializeOutputs } from "./utils";

export interface Utxo {
  txid: string,
  outIdx: number,
  value: Int
}

export function createTx(ecc: Ecc, prvKey: Uint8Array, utxo: Utxo, fee: number, parties: Party[]) {
  // produce contract script
  const contract = createScript(prvKey, fee, parties);

  // create transaction with dynamic outputs based on value
  const tx = new Tx({
    outputs: createOutputs(utxo.value, fee, contract, parties),
    inputs: [
      {
        prevOut: {
          txid: utxo.txid,
          outIdx: utxo.outIdx,
        },
        signData: {
            value: utxo.value,
            redeemScript: contract
        }
      }
    ]
  });

  // produce serialized outputs
  const serializedOutputs = serializeOutputs(tx.outputs);

  // get the ANYONECANPAY BIP 143 preimage for the input
  //
  // The ANYONECANPAY flag is used because transactions will always have more
  // than 546 bytes. This means there can be outputs for which a 1 sat per byte
  // fee can't be ensured making it difficult to propagate the transaction.
  // This way, at least, it's possible to build a transaction with more inputs
  // which can only add fees because the outputs are fixed by the script.
  //
  const sigHashType = ALL_ANYONECANPAY_BIP143;
  const unsignedTx = UnsignedTx.fromTx(tx);
  const unsignedTxInput = new UnsignedTxInput({ inputIdx: 0, unsignedTx });
  const inputPreimage = unsignedTxInput.sigHashPreimage(sigHashType);

  // sign the preimage (double SHA256, as per BIP 143)
  //
  // This is the key aspect since the signature can be used both for CHECKSIG and
  // CHEKDATASIG. In combination, it ensures that the bytes given as input can be
  // treated as the same preimage used for transaction validation. In turn, this
  // allows trusting other provided inputs like the outputs and their values.
  //
  const signature = flagSignature(
    ecc.schnorrSign(prvKey, sha256d(inputPreimage.bytes)),
    sigHashType
  );

  // produce the P2SH spend script (inputs + script)
  const spendScript = Script.fromOps([
    pushBytesOp(serializedOutputs),
    pushBytesOp(signature),
    pushBytesOp(inputPreimage.bytes),
    pushBytesOp(inputPreimage.redeemScript.bytecode),
  ]);

  // produce signed transaction
  //
  // The signatory is precomputed in the previous preimage signature. This
  // process validates fees and dust, and produces a new transaction that
  // includes the redeem script for the input.
  //
  const signedTx = new TxBuilder({
    outputs: tx.outputs,
    inputs: [{
      input: tx.inputs[0],
      signatory: (_ecc, _txIn) => spendScript
    }]
  }).sign(ecc);

  // make a final verification of the fee
  const minFee = signedTx.serSize();
  if (fee < minFee) {
    throw new Error(`The fee must be at least 1 sat per byte, that is, ${minFee} or more`);
  }

  // return signed transaction
  return signedTx;
}
