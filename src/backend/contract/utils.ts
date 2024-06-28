import { OP_0, Script, WriterBytes, WriterLength, pushBytesOp, writeTxOutput, type TxOutput } from 'ecash-lib';
import * as xecaddr from 'ecashaddrjs';

export function outputScriptForAddress(address: string): Script {
  const decodedAddress = xecaddr.decode(address, false);
  const hash160 = decodedAddress.hash as Uint8Array;

  switch (decodedAddress.type) {
    case 'P2PKH': return Script.p2pkh(hash160);
    case 'P2SH': return Script.p2sh(hash160);
    default:
      throw new Error(`Unexpected address type ${decodedAddress.type} from ecashaddrjs`);
  }
}

export function serializeOutputs(outputs: TxOutput[]) {
  const lengthWriter = new WriterLength();
  outputs.forEach(o => writeTxOutput(o, lengthWriter));
  const outputWriter = new WriterBytes(lengthWriter.length);
  outputs.forEach(o => writeTxOutput(o, outputWriter));
  return outputWriter.data;
}

// https://github.com/Bitcoin-ABC/bitcoin-abc/blob/master/src/script/script.h#L363
export function pushNumberOp(n: number | bigint) {
  const bn = BigInt(n)

  if (bn == BigInt(0)) {
    return OP_0;
  }

  let bytes: number[] = [];
  let neg = n < 0;
  let absvalue = neg ? ~bn + BigInt(1) : bn;

  while (absvalue) {
    bytes.push(Number(absvalue & BigInt(0xff)));
    absvalue >>= BigInt(8);
  }

  let last = bytes[bytes.length - 1];
  if (last & 0x80) {
    bytes.push(neg ? 0x80 : 0x00);
  } else if (neg) {
    bytes[bytes.length - 1] = last | 0x80;
  }

  return pushBytesOp(Uint8Array.from(bytes));
}
