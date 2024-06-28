import * as utxolib from '@bitgo/utxo-lib';
import '@jest/globals';
import { Ecc, Int, Script, TxOutput, initWasm, shaRmd160, isPushOp, toHex, sha256d } from 'ecash-lib';
import { createTx } from './tx';
import { Party, SCRIPT_NOPAY, createScript } from './script';
import { outputScriptForAddress } from './utils';

beforeAll(() => {
  return initWasm();
});

describe('createTx', () => {
  const ecpair = utxolib.ECPair.fromWIF('L2vP83Ct244KpL16aCRqdzUp8Rj58d9xVzpuaaHs4STVHQbJERBi', utxolib.networks.ecash);
  const prvKey = new Uint8Array(ecpair.privateKey || []);

  test('validate fee', () => {
    expect(() => createTx(new Ecc(), prvKey, utxo(10000), 1000, shares(900, 100))).toThrow();
  });

  test('no shares', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const tx = createTx(new Ecc(), prvKey, utxo(2999), fee, parties);
    expectOutputs(tx.outputs, { value: 0, script: SCRIPT_NOPAY });
  });

  test('one share', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const tx = createTx(new Ecc(), prvKey, utxo(7999), fee, parties);
    expectOutputs(tx.outputs, {
      value: 4500,
      script: outputScriptForAddress(parties[0].address)
    });
  });

  test('two shares', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const tx = createTx(new Ecc(), prvKey, utxo(8000), fee, parties);
    expectOutputs(tx.outputs,
      { value: 5400, script: outputScriptForAddress(parties[0].address) },
      { value:  600, script: outputScriptForAddress(parties[1].address) }
    );
  });

  test('two shares', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const tx = createTx(new Ecc(), prvKey, utxo(8000), fee, parties);
    expectOutputs(tx.outputs,
      { value: 5400, script: outputScriptForAddress(parties[0].address) },
      { value:  600, script: outputScriptForAddress(parties[1].address) }
    );
  });

  test('input split', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const contract = createScript(prvKey, fee, parties);
    const outputScript = Script.p2sh(shaRmd160(contract.bytecode));
    const tx = createTx(new Ecc(), prvKey, utxo(2147483649), fee, parties);

    expectOutputs(tx.outputs,
      { value: 1073740825, script: outputScript },
      { value: 1073740824, script: outputScript }
    );
  });

  test('input utxo', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const input = utxo(Math.floor(Math.random() * 1000000) + fee);
    const tx = createTx(new Ecc(), prvKey, input, fee, parties);

    expect(tx.inputs.length).toBe(1);
    expect(tx.inputs[0].prevOut.txid).toBe(input.txid);
    expect(tx.inputs[0].prevOut.outIdx).toBe(input.outIdx);
    expect(tx.inputs[0].signData?.value).toBe(input.value);
  });

  test('input script', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const tx = createTx(new Ecc(), prvKey, utxo(8000), fee, parties);

    const opsIter = tx.inputs[0].script?.ops();
    const outputs = opsIter?.next();
    const sig = opsIter?.next();
    const preimage = opsIter?.next();
    const script = opsIter?.next();
    const end = opsIter?.next();

    if (!isPushOp(outputs)) fail();
    if (!isPushOp(sig)) fail();
    if (!isPushOp(preimage)) fail();
    if (!isPushOp(script)) fail();
    expect(end).toBeUndefined();

    expect(outputs.data.length).toBe(68); // 2 * (8 byte + 26 byte)
    expect(sig.data.length).toBe(65);     // 64 byte + 1 byte

    const preimageHex = toHex(preimage.data);
    const scriptHex = toHex(script.data);
    expect(preimageHex.indexOf(scriptHex)).not.toBe(-1);

    const outputsHashHex = toHex(sha256d(outputs.data));
    expect(preimageHex.indexOf(outputsHashHex)).toBe((116 + (3 + script.data.length)) * 2);
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

  return shares.map<Party>((share, i) => ({ address: addresses[i], share }));
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
