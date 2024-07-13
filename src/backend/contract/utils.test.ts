import '@jest/globals';
import { toHex, Script, OP_RETURN, fromHex } from 'ecash-lib';
import { outputScriptForAddress, pushNumberOp, serializeOutputs, serializePrevouts } from './utils';

describe('outputScriptForAddress', () => {
  test('p2pkh', () => {
    const addr1 = "ecash:qq28cqs6dx23qh4qucnk9v3l2jt4yr242cxqqnw9kc";
    const addr2 = "etoken:qq28cqs6dx23qh4qucnk9v3l2jt4yr242cg7f3czj0";
    expect(toHex(outputScriptForAddress(addr1).bytecode)).toEqual("76a914147c021a6995105ea0e62762b23f5497520d555688ac");
    expect(toHex(outputScriptForAddress(addr2).bytecode)).toEqual("76a914147c021a6995105ea0e62762b23f5497520d555688ac");
  });

  test('p2sh', () => {
    const addr1 = "ecash:prfhcnyqnl5cgrnmlfmms675w93ld7mvvqd0y8lz07";
    const addr2 = "etoken:prfhcnyqnl5cgrnmlfmms675w93ld7mvvqr3d9f9tf";
    expect(toHex(outputScriptForAddress(addr1).bytecode)).toEqual("a914d37c4c809fe9840e7bfa77b86bd47163f6fb6c6087");
    expect(toHex(outputScriptForAddress(addr2).bytecode)).toEqual("a914d37c4c809fe9840e7bfa77b86bd47163f6fb6c6087");
  });

  test('invalid fails', () => {
    const addr = "ecash:qr0";
    expect(() => outputScriptForAddress(addr)).toThrow();
  });
});

describe('serializePrevouts', () => {
  test('demo', () => {
    const inputs = [{
      prevOut: {
        txid: "0000000000000000000000000000000000000000000000000000000000000001",
        outIdx: 0
      }
    }];

    const result = serializePrevouts(inputs);
    expect(toHex(result)).toEqual("010000000000000000000000000000000000000000000000000000000000000000000000");
  });

  test('other', () => {
    const inputs = [
      {
        prevOut: {
          txid: "c9f6d2785072af21fb9c4652baecd74d76681eea8038f5282763d1892ea5f915",
          outIdx: 1
        }
      },
      {
        prevOut: {
          txid: "c9f6d2785072af21fb9c4652baecd74d76681eea8038f5282763d1892ea5f915",
          outIdx: 71
        }
      }
    ];

    const result = serializePrevouts(inputs);
    expect(toHex(result)).toEqual(
      "15f9a52e89d1632728f53880ea1e68764dd7ecba52469cfb21af725078d2f6c901000000" +
      "15f9a52e89d1632728f53880ea1e68764dd7ecba52469cfb21af725078d2f6c947000000"
    );
  });
});

describe('serializeOutputs', () => {
  test('op_return', () => {
    const outputs = [{ value: 0, script: Script.fromOps([ OP_RETURN ]) }];
    const result = serializeOutputs(outputs);
    expect(toHex(result)).toEqual("0000000000000000016a");
  });

  test('endianess', () => {
    const outputs = [
      {
        value: 9000,
        script: Script.p2pkh(fromHex("147c021a6995105ea0e62762b23f5497520d5556"))
      },
      {
        value: 1000,
        script: Script.p2sh(fromHex("d37c4c809fe9840e7bfa77b86bd47163f6fb6c60"))
      }
    ];

    const result = serializeOutputs(outputs);
    expect(toHex(result)).toEqual(
      "28230000000000001976a914147c021a6995105ea0e62762b23f5497520d555688ac" +
      "e80300000000000017a914d37c4c809fe9840e7bfa77b86bd47163f6fb6c6087"
    );
  });
});

describe('pushNumberOp', () => {
  test('standard', () => {
    const checks = [
      { num: 0, result: "00" },
      { num: 1, result: "51" },
      { num: 128, result: "028000" },
      { num: 255, result: "02ff00" },
      { num: 256, result: "020001" },
      { num: BigInt(3846153846153), result: "06893da2807f03" },
      { num: BigInt(246153846153792), result: "0740628f28e0df00" }
    ];

    checks.forEach(c => {
      const script = Script.fromOps([ pushNumberOp(c.num) ]);
      expect(toHex(script.bytecode)).toEqual(c.result);
    });
  });
});
