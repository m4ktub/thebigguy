import * as utxolib from '@bitgo/utxo-lib';
import { fail } from 'assert';
import { Ecc, Int, Script, TxOutput, initWasm, isPushOp, sha256d, shaRmd160, toHex } from 'ecash-lib';
import { expect } from 'expect';
import { Party, SCRIPT_NOPAY, createScript } from './script';
import { createTx } from './tx';

//
// initialize ECC
//

var ecc: Ecc;

before(() => {
  return initWasm().then(() => ecc = new Ecc());
});

//
// register tests
//

describe('createTx', () => {
  const ecpair = utxolib.ECPair.fromWIF('L2vP83Ct244KpL16aCRqdzUp8Rj58d9xVzpuaaHs4STVHQbJERBi', utxolib.networks.ecash);
  const prvKey = new Uint8Array(ecpair.privateKey || []);

  it('validate fee', () => {
    expect(() => createTx(ecc, prvKey, utxo(10000), 1000, shares(900, 100))).toThrow();
  });

  it('no shares', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const tx = createTx(ecc, prvKey, utxo(2999), fee, parties);
    expectOutputs(tx.outputs, { value: 0, script: SCRIPT_NOPAY });
  });

  it('one share', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const tx = createTx(ecc, prvKey, utxo(7999), fee, parties);
    expectOutputs(tx.outputs, {
      value: 4500,
      script: Script.fromAddress(parties[0].address)
    });
  });

  it('two shares', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const tx = createTx(ecc, prvKey, utxo(8000), fee, parties);
    expectOutputs(tx.outputs,
      { value: 5400, script: Script.fromAddress(parties[0].address) },
      { value:  600, script: Script.fromAddress(parties[1].address) }
    );
  });

  it('two shares', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const tx = createTx(ecc, prvKey, utxo(8000), fee, parties);
    expectOutputs(tx.outputs,
      { value: 5400, script: Script.fromAddress(parties[0].address) },
      { value:  600, script: Script.fromAddress(parties[1].address) }
    );
  });

  it('input split', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const contract = createScript(ecc, prvKey, fee, parties);
    const outputScript = Script.p2sh(shaRmd160(contract.bytecode));
    const tx = createTx(ecc, prvKey, utxo(2147483649), fee, parties);

    expectOutputs(tx.outputs,
      { value: 1073740825, script: outputScript },
      { value: 1073740824, script: outputScript }
    );
  });

  it('input utxo', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const input = utxo(Math.floor(Math.random() * 1000000) + fee);
    const tx = createTx(ecc, prvKey, input, fee, parties);

    expect(tx.inputs.length).toBe(1);
    expect(tx.inputs[0].prevOut.txid).toBe(input.txid);
    expect(tx.inputs[0].prevOut.outIdx).toBe(input.outIdx);
    expect(tx.inputs[0].signData?.value).toBe(input.value);
  });

  it('input script', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const tx = createTx(ecc, prvKey, utxo(8000), fee, parties);

    const opsIter = tx.inputs[0].script?.ops();
    const prevouts = opsIter?.next();
    const outputs = opsIter?.next();
    const sig = opsIter?.next();
    const preimage1 = opsIter?.next();
    const preimage2 = opsIter?.next();
    const preimage3 = opsIter?.next();
    const preimage4 = opsIter?.next();
    const preimage5 = opsIter?.next();
    const preimage6 = opsIter?.next();
    const preimage7 = opsIter?.next();
    const preimage8 = opsIter?.next();
    const preimage9 = opsIter?.next();
    const script = opsIter?.next();
    const end = opsIter?.next();

    // check stack
    if (!isPushOp(prevouts)) fail("not pushop: prevouts");
    if (!isPushOp(outputs)) fail("not pushop: outputs");
    if (!isPushOp(sig)) fail("not pushop: signature");
    if (!isPushOp(preimage1)) fail("not pushop: preimage1");
    if (!isPushOp(preimage2)) fail("not pushop: preimage2");
    if (!isPushOp(preimage3)) fail("not pushop: preimage3");
    if (!isPushOp(preimage4)) fail("not pushop: preimage4");
    if (!isPushOp(preimage5)) fail("not pushop: preimage5");
    if (!isPushOp(preimage6)) fail("not pushop: preimage6");
    if (!isPushOp(preimage7)) fail("not pushop: preimage7");
    if (!isPushOp(preimage8)) fail("not pushop: preimage8");
    if (!isPushOp(preimage9)) fail("not pushop: preimage9");
    if (!isPushOp(script)) fail("not pushop: script");
    expect(end).toBeUndefined();

    // validate basic known sizes
    expect(prevouts.data.length).toBe(36); // 1 * (32 bytes + 4 bytes)
    expect(outputs.data.length).toBe(68);  // 2 * (8 bytes + 26 bytes)
    expect(sig.data.length).toBe(65);      // 64 bytes + 1 byte

    // validate preimage parts that are directly used
    const prevoutsHashHex = toHex(sha256d(prevouts.data));
    expect(toHex(preimage2.data)).toBe(prevoutsHashHex);

    const outpointHex = toHex(preimage4.data);
    expect(toHex(prevouts.data).indexOf(outpointHex)).toBe(0);

    const preimageScriptHex = toHex(preimage5.data);
    const scriptHex = toHex(script.data);
    expect([2, 6]).toContain(preimageScriptHex.indexOf(scriptHex));

    expect(toHex(preimage6.data)).toBe("401f000000000000");

    const outputsHashHex = toHex(sha256d(outputs.data));
    expect(toHex(preimage8.data)).toBe(outputsHashHex);

    // ensure that the last part is concatenation of nLocktime and sighash
    expect(toHex(preimage9.data)).toBe("0000000041000000");
  });
});

//
// helpers
//

function shares(...shares: number[]): Party[] {
  const addresses = [
    "ecash:qq28cqs6dx23qh4qucnk9v3l2jt4yr242cxqqnw9kc",
    "ecash:qq830d643lw865u0x7mpc4yzsrvt9peccggju7td2v"
  ];

  return shares.map<Party>((share, i) => {
    return { address: addresses[i], share };
  });
}

function utxo(value: Int) {
  return {
    txid: '0000000000000000000000000000000000000000000000000000000000000001',
    outIdx: 0,
    value: value
  };
}

function expectOutputs(outputs: TxOutput[], ...checks: Array<{ value: number, script: Script }>) {
  expect(outputs.length).toBe(checks.length);
  checks.forEach((check, i) => {
    expect(BigInt(outputs[i].value)).toBe(BigInt(check.value));
    expect(outputs[i].script).toEqual(check.script);
  });
}
