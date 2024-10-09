import * as utxolib from '@bitgo/utxo-lib';
import { Ecc, Script, TxOutput, initWasm, shaRmd160 } from 'ecash-lib';
import { expect } from 'expect';
import { createOutputs } from './payment';
import { SCRIPT_NOPAY, createScript, type Party } from './script';

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

describe('payments', () => {
  const ecpair = utxolib.ECPair.fromWIF('KziSb7DLRHczmBgrGCJMdJ6cw3UnNJz9kLCvRbAXCvBZiXosmqMw', utxolib.networks.ecash);
  const prvKey = new Uint8Array(ecpair.privateKey || []);

  function shares(...shares: number[]): Party[] {
    const addresses = [
      "ecash:qq28cqs6dx23qh4qucnk9v3l2jt4yr242cxqqnw9kc",
      "ecash:qq830d643lw865u0x7mpc4yzsrvt9peccggju7td2v"
    ];

    return shares.map<Party>((share, i) => ({ address: addresses[i], share }));
  }

  function expectOutputs(outputs: TxOutput[], ...checks: Array<{ value: number, script: Script }>) {
    expect(outputs.length).toBe(checks.length);
    checks.forEach((check, i) => {
      expect(BigInt(outputs[i].value)).toBe(BigInt(check.value));
      expect(outputs[i].script).toEqual(check.script);
    });
  }

  it('none', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const contract = createScript(ecc, prvKey, fee, parties);
    const outputs = createOutputs(2999, fee, contract, parties);

    expectOutputs(outputs, { value: 0, script: SCRIPT_NOPAY });
  });

  it('single', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const contract = createScript(ecc, prvKey, fee, parties);

    expectOutputs(createOutputs(3000, fee, contract, parties), {
      value: 900,
      script: Script.fromAddress(parties[0].address)
    });

    expectOutputs(createOutputs(7999, fee, contract, parties), {
      value: 4500,
      script: Script.fromAddress(parties[0].address)
    });
  });

  it('double', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const contract = createScript(ecc, prvKey, fee, parties);

    expectOutputs(createOutputs(8000, fee, contract, parties),
      { value: 5400, script: Script.fromAddress(parties[0].address) },
      { value:  600, script: Script.fromAddress(parties[1].address) }
    );

    expectOutputs(createOutputs(2147483647, fee, contract, parties),
      { value: 1932732900, script: Script.fromAddress(parties[0].address) },
      { value:  214748100, script: Script.fromAddress(parties[1].address) }
    );
  });

  it('edge', () => {
    const fee = 2000;
    const parties = shares(818, 182);
    const contract = createScript(ecc, prvKey, fee, parties);

    expectOutputs(createOutputs(5999, fee, contract, parties),
      { value: 2454, script: Script.fromAddress(parties[0].address) },
      { value:  546, script: Script.fromAddress(parties[1].address) }
    );
  });

  it('split', () => {
    const fee = 2000;
    const parties = shares(900, 100);
    const contract = createScript(ecc, prvKey, fee, parties);
    const outputScript = Script.p2sh(shaRmd160(contract.bytecode));

    expectOutputs(createOutputs(2147483648, fee, contract, parties),
      { value: 1073740824, script: outputScript },
      { value: 1073740824, script: outputScript }
    );

    expectOutputs(createOutputs(2147483649, fee, contract, parties),
      { value: 1073740825, script: outputScript },
      { value: 1073740824, script: outputScript }
    );

    expectOutputs(createOutputs(2100000000000000, fee, contract, parties),
      { value: 1049999999999000, script: outputScript },
      { value: 1049999999999000, script: outputScript }
    );
  });
});
