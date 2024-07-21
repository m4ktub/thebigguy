import {
  ALL_BIP143,
  Ecc,
  Script,
  Tx,
  TxBuilder,
  UnsignedTx,
  UnsignedTxInput,
  flagSignature,
  pushBytesOp,
  sha256d,
  type Int
} from "ecash-lib";
import { createOutputs } from "./payment";
import { createScript, type Party } from "./script";
import { serializeOutputs, serializePrevouts } from "./utils";

export interface Utxo {
  txid: string,
  outIdx: number,
  value: Int
}

export function createTx(ecc: Ecc, prvKey: Uint8Array, utxo: Utxo, fee: number, parties: Party[]) {
  // produce contract script
  const contract = createScript(ecc, prvKey, fee, parties);

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

  // produce serialized previouts
  const serializedPrevouts = serializePrevouts(tx.inputs);

  // produce serialized outputs
  const serializedOutputs = serializeOutputs(tx.outputs);

  // get the ALL_BIP143 preimage for the input
  //
  // The ALL_BIP143 flag must be used because the script needs to receive both
  // the prevouts and outputs as input and those need to be validated against
  // hashPrevouts and hashOutputs.
  //
  const sigHashType = ALL_BIP143;
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
    pushBytesOp(serializedPrevouts),
    pushBytesOp(serializedOutputs),
    pushBytesOp(signature),
    pushBytesOp(inputPreimage.bytes.slice(0, 4)),
    pushBytesOp(inputPreimage.bytes.slice(4, 36)),
    pushBytesOp(inputPreimage.bytes.slice(36, 68)),
    pushBytesOp(inputPreimage.bytes.slice(68, 104)),
    pushBytesOp(inputPreimage.bytes.slice(104, -52)),
    pushBytesOp(inputPreimage.bytes.slice(-52, -44)),
    pushBytesOp(inputPreimage.bytes.slice(-44, -40)),
    pushBytesOp(inputPreimage.bytes.slice(-40, -8)),
    pushBytesOp(inputPreimage.bytes.slice(-8)),
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
