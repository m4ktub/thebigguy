import * as utxolib from '@bitgo/utxo-lib';
import {
  Ecc,
  OP_ADD,
  OP_BIN2NUM,
  OP_DIV,
  OP_EQUALVERIFY,
  OP_GREATERTHANOREQUAL,
  OP_HASH160,
  OP_IF,
  OP_LESSTHAN,
  OP_NIP,
  OP_REVERSEBYTES,
  OP_SPLIT,
  OP_SUB,
  Script,
  fromHex,
  initWasm,
  pushBytesOp,
  shaRmd160,
  toHex
} from 'ecash-lib';
import { expect } from 'expect';
import {
  SCRIPT_NOPAY,
  createScript,
  minUnitForAllShares,
  minUnitForShare,
  quotient,
  type Party
} from './script';
import { pushNumberOp, serializeOutputs } from './utils';

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

describe('constants', () => {
  it('SCRIPT_NOPAY', () => {
    expect(SCRIPT_NOPAY.bytecode).toEqual(fromHex("6a"));
  });
});

describe('utils', () => {
  describe('quotient', () => {
    it('by zero fails', () => {
      expect(() => Number(quotient(1, 0))).toThrow();
    });

    it('dust related', () => {
      expect(Number(quotient(546, 1))).toBe(546);
      expect(Number(quotient(546, 4))).toBe(136);
      expect(Number(quotient(546, 546))).toBe(1);
      expect(Number(quotient(546, 547))).toBe(0);
    });

    it('fixed edge cases', () => {
      expect(Number(quotient(4294967295, 2147483648))).toStrictEqual(1);
      expect(Number(quotient(4294967295, 4294967294))).toStrictEqual(1);
    });

    it('random cases', () => {
      for (let i = 0; i < 10; i++) {
        const v1 = Math.floor(4294967295 * Math.random());
        const v2 = Math.floor(4294967295 * Math.random());
        expect(Number(quotient(v1, v2))).toStrictEqual(Math.floor(v1/v2));
      }
    });
  });

  it('minUnitForShare', () => {
    expect(minUnitForShare(999)).toEqual(1);
    expect(minUnitForShare(546)).toEqual(1);
    expect(minUnitForShare(545)).toEqual(2);
    expect(minUnitForShare(273)).toEqual(2);
    expect(minUnitForShare(272)).toEqual(3);
    expect(minUnitForShare(182)).toEqual(3);
    expect(minUnitForShare(181)).toEqual(4);
    expect(minUnitForShare(137)).toEqual(4);
    expect(minUnitForShare(136)).toEqual(5);
    expect(minUnitForShare(110)).toEqual(5);
    expect(minUnitForShare(109)).toEqual(6);
    expect(minUnitForShare(91)).toEqual(6);
    expect(minUnitForShare(90)).toEqual(7);
    expect(minUnitForShare(78)).toEqual(7);
    expect(minUnitForShare(77)).toEqual(8);
    expect(minUnitForShare(69)).toEqual(8);
    expect(minUnitForShare(68)).toEqual(9);
    expect(minUnitForShare(61)).toEqual(9);
    expect(minUnitForShare(60)).toEqual(10);
    // ...
    expect(minUnitForShare(23)).toEqual(24);
    expect(minUnitForShare(22)).toEqual(25);
    expect(minUnitForShare(21)).toEqual(26);
    expect(minUnitForShare(20)).toEqual(28);
    expect(minUnitForShare(19)).toEqual(29);
    expect(minUnitForShare(18)).toEqual(31);
    expect(minUnitForShare(17)).toEqual(33);
    expect(minUnitForShare(16)).toEqual(35);
    expect(minUnitForShare(15)).toEqual(37);
    expect(minUnitForShare(14)).toEqual(39);
    expect(minUnitForShare(13)).toEqual(42);
    expect(minUnitForShare(12)).toEqual(46);
    expect(minUnitForShare(11)).toEqual(50);
    expect(minUnitForShare(10)).toEqual(55);
    expect(minUnitForShare(9)).toEqual(61);
    expect(minUnitForShare(8)).toEqual(69);
    expect(minUnitForShare(7)).toEqual(78);
    expect(minUnitForShare(6)).toEqual(91);
    expect(minUnitForShare(5)).toEqual(110);
    expect(minUnitForShare(4)).toEqual(137);
    expect(minUnitForShare(3)).toEqual(182);
    expect(minUnitForShare(2)).toEqual(273);
    expect(minUnitForShare(1)).toEqual(546);
  });

  it('minUnitForAllShares', () => {
    expect(minUnitForAllShares(parties(900, 100))).toEqual(1);
    expect(minUnitForAllShares(parties(546, 454))).toEqual(1);
    expect(minUnitForAllShares(parties(545, 455))).toEqual(2);
    expect(minUnitForAllShares(parties(181, 94, 181, 181, /**/ 182, 181))).toEqual(3);
  });
});

describe('createScript', () => {
  const ecpair = utxolib.ECPair.fromWIF('L2vP83Ct244KpL16aCRqdzUp8Rj58d9xVzpuaaHs4STVHQbJERBi', utxolib.networks.ecash);
  const pubKey = new Uint8Array(ecpair.publicKey)
  const prvKey = new Uint8Array(ecpair.privateKey || []);

  it('validate arguments', () => {
    // number of parties
    expect(() => createScript(ecc, prvKey, 10000, parties())).toThrow();
    expect(() => createScript(ecc, prvKey, 10000, parties(1000))).toThrow();
    expect(() => createScript(ecc, prvKey, 10000, parties(250, 250, 250, 250))).toThrow();
    expect(createScript(ecc, prvKey, 10000, parties(500, 500))).toBeInstanceOf(Script);
    expect(createScript(ecc, prvKey, 10000, parties(400, 300, 300))).toBeInstanceOf(Script);

    // fee too high
    expect(() => createScript(ecc, prvKey, 2113929217 + 1, parties(500, 500))).toThrow();

    // no floats on shares
    expect(() => createScript(ecc, prvKey, 2000, parties(500.1, 499.9))).toThrow();

    // shares between 1 and 999
    expect(() => createScript(ecc, prvKey, 2000, parties(500, 500, 0))).toThrow();
    expect(() => createScript(ecc, prvKey, 2000, parties(500, 501, -1))).toThrow();

    // valid shares add to 1000
    expect(() => createScript(ecc, prvKey, 2000, parties(400, 400))).toThrow();

    // private key must be valid
    expect(() => createScript(ecc, new Uint8Array(32), 2000, parties(500, 500))).toThrow();
  });

  it('constants are present', () => {
    const fee = 12345;
    const tparties = parties(123, 877);
    const script = createScript(ecc, prvKey, fee, tparties);
    const hex = toHex(script.bytecode);

    // public key to check signatures
    const pubKeyHex = toHex(Script.fromOps([pushBytesOp(pubKey)]).bytecode);

    // fee subtracted from input value, when distributing
    const feeSubHex = toHex(Script.fromOps([pushNumberOp(fee), OP_SUB]).bytecode);

    // fee added to output values, when splitting
    const feeAddHex = toHex(Script.fromOps([pushNumberOp(fee), OP_ADD]).bytecode);

    // check of smallest unit to choose between OP_RETURN or other outputs
    const smallestUnitHex = toHex(Script.fromOps([pushNumberOp(1), OP_LESSTHAN, OP_IF]).bytecode);

    // check comparison of outputs with no pay script, by treating the reverse as number
    const noPaySer = serializeOutputs([{ value: 0, script: SCRIPT_NOPAY }]);
    const noPayAsNumSer = noPaySer.reverse().filter(v => v > 0);
    const noPayOutputHex = toHex(Script.fromOps([
      OP_REVERSEBYTES, OP_BIN2NUM, pushBytesOp(noPayAsNumSer), OP_EQUALVERIFY
    ]).bytecode);

    // check if output is present, division of value by share, and correct output address
    const minUnit1Hex = toHex(Script.fromOps([pushNumberOp(5), OP_GREATERTHANOREQUAL, OP_IF]).bytecode);
    const share1Hex = toHex(Script.fromOps([pushNumberOp(tparties[0].share), OP_DIV]).bytecode);
    const address1Bytecode = Script.fromAddress(tparties[0].address).bytecode;
    const address1Hex = toHex(Script.fromOps([pushBytesOp(address1Bytecode), OP_EQUALVERIFY]).bytecode);

    // check if output is present, division of value by share, and correct output address
    const minUnit2Hex = toHex(Script.fromOps([pushNumberOp(1), OP_GREATERTHANOREQUAL, OP_IF]).bytecode);
    const share2Hex = toHex(Script.fromOps([pushNumberOp(tparties[1].share), OP_DIV]).bytecode);
    const address2Bytecode = Script.fromAddress(tparties[1].address).bytecode;
    const address2Hex = toHex(Script.fromOps([pushBytesOp(address2Bytecode), OP_EQUALVERIFY]).bytecode);

    // make sure all excerpts are present
    expect(hex.indexOf(pubKeyHex)).not.toBe(-1);
    expect(hex.indexOf(feeSubHex)).not.toBe(-1);
    expect(hex.indexOf(feeAddHex)).not.toBe(-1);
    expect(hex.indexOf(smallestUnitHex)).not.toBe(-1);
    expect(hex.indexOf(noPayOutputHex)).not.toBe(-1);
    expect(hex.indexOf(minUnit1Hex)).not.toBe(-1);
    expect(hex.indexOf(share1Hex)).not.toBe(-1);
    expect(hex.indexOf(address1Hex)).not.toBe(-1);
    expect(hex.indexOf(minUnit2Hex)).not.toBe(-1);
    expect(hex.indexOf(share2Hex)).not.toBe(-1);
    expect(hex.indexOf(address2Hex)).not.toBe(-1);
  });

  /**
   * The script size is assumed in the script for simplicy but since the size
   * is encoded in the compact size convention, it can be either 1 or 3 bytes.
   * Since the script needs to be hashed to calculate the output script and
   * validate outputs, it's important to check that the correct number of bytes
   * are split from the prefix before hashing.
   */
  it('varint script size', () => {
    const script = createScript(ecc, prvKey, 2000, parties(900, 100));
    const hex = toHex(script.bytecode);

    const varIntLength = script.bytecode.length <= 0xfc ? 1 : 3;
    const splitHashHex = toHex(Script.fromOps([
      pushNumberOp(varIntLength),
      OP_SPLIT,
      OP_NIP,
      OP_HASH160
    ]).bytecode);

    expect(hex.indexOf(splitHashHex)).not.toBe(-1);
  });

  /**
   * Added for release v1.
   *
   * Once released, any error in this test means that an unintended change was
   * done to the script. That is no acceptable because it would make previous
   * contracts unusable by generating a new P2SH address for the same inputs.
   */
  it('v1 stability', () => {
    const script1 = createScript(ecc, prvKey, 2000, parties(900, 100));
    const hash201 = toHex(shaRmd160(script1.bytecode));
    expect(hash201).toEqual("8b4c585d05e90b9663459b49c75dc063a4ef5f7b");

    const script2 = createScript(ecc, prvKey, 2001, parties(900, 100));
    const hash202 = toHex(shaRmd160(script2.bytecode));
    expect(hash202).toEqual("3805c831755d5da30ef0495332d666eec4810a10");

    const script3 = createScript(ecc, prvKey, 2000, parties(899, 101));
    const hash203 = toHex(shaRmd160(script3.bytecode));
    expect(hash203).toEqual("0e7e2d1eb5c23803b74168b917ee9e2ac85a85af");
  });
});

//
// helpers
//

function parties(...shares: number[]): Party[] {
  const addresses = [
    "ecash:qq28cqs6dx23qh4qucnk9v3l2jt4yr242cxqqnw9kc",
    "ecash:qq830d643lw865u0x7mpc4yzsrvt9peccggju7td2v",
    "ecash:qq0exytv2e3ylet2yz5wxzhpwlftw05rgg4eu0yqwc",
    "ecash:qzv2r6z3d5qgxh9zdsnh2k59mlsa6lawlsh7fvxudj",
    "ecash:qru9mar7gxd26z5qzwqa0hk66cawu43ygv96x4x4vw",
    "ecash:qztuj8cek66xwwuzfm4xgnf6z0kyk3pt0geaw0l36y",
    "ecash:qpdy206vvlupz49nr2t0jhf2emau7xkk4usmdwht77"
  ];

  return shares.map<Party>((share, i) => {
    return { address: addresses[i], share };
  });
}
