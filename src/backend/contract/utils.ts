import {
  OP_0,
  WriterBytes,
  WriterLength,
  pushBytesOp,
  writeOutPoint,
  writeTxOutput,
  type TxInput,
  type TxOutput,
  type Writer
} from 'ecash-lib';

function serializeValues<T>(data: T[], writer: (v: T, w: Writer) => void) {
  const lengthWriter = new WriterLength();
  data.forEach(value => writer(value, lengthWriter));
  const bytesWriter = new WriterBytes(lengthWriter.length);
  data.forEach(value => writer(value, bytesWriter));
  return bytesWriter.data;
}

export function serializePrevouts(inputs: TxInput[]) {
  return serializeValues(inputs.map(i => i.prevOut), writeOutPoint);
}

export function serializeOutputs(outputs: TxOutput[]) {
  return serializeValues(outputs, writeTxOutput);
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
