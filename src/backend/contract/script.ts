import {
  Ecc,
  Int,
  OP_1ADD,
  OP_2DROP,
  OP_2SWAP,
  OP_3DUP,
  OP_ADD,
  OP_AND,
  OP_BIN2NUM,
  OP_CAT,
  OP_CHECKDATASIGVERIFY,
  OP_CHECKSIGVERIFY,
  OP_DIV,
  OP_DROP,
  OP_DUP,
  OP_ELSE,
  OP_ENDIF,
  OP_EQUAL,
  OP_EQUALVERIFY,
  OP_GREATERTHANOREQUAL,
  OP_HASH160,
  OP_HASH256,
  OP_IF,
  OP_LESSTHAN,
  OP_NIP,
  OP_NUM2BIN,
  OP_PICK,
  OP_RETURN,
  OP_ROLL,
  OP_ROT,
  OP_SHA256,
  OP_SIZE,
  OP_SPLIT,
  OP_SUB,
  OP_SWAP,
  Op,
  Script,
  fromHex,
  pushBytesOp
} from 'ecash-lib';
import * as xecaddr from 'ecashaddrjs';
import { outputScriptForAddress, pushNumberOp, serializeOutputs } from './utils';

//
// constants
//

export const SCRIPT_NOPAY = Script.fromOps([OP_RETURN]);

//
// Create the P2SH script.
//
// The script expects the following pushes to the stack:
// - Serialized prevouts, to validate that the tx has a single input
// - Serialized outputs, to validate shares
// - Schnorr signature, to ensure preimage is valid
// - BIP 143 preimage, to
//     1) validate prevouts and outputs, and
//     2) get the input value and the script
//

export interface Party {
  address: string,
  share: number
}

export function createScript(prvKey: Uint8Array, fee: number, parties: Party[]) {
  // validate number of parties
  if (parties.length < 2 || parties.length > 3) {
    // less than 2 is useless, more than 3 will break the 520 byte push limit for the preimage
    throw new Error("The contract must have between 2 and 3 parties");
  }

  // ensure a minimum fee of 1 sat/byte
  //
  // Each P2PKH party adds no more than 167 bytes to the transaction.
  // A 2-party 500/500 P2PKH with 2000 fee will produce a 1066 byte transaction.
  // A 3-party 400/300/300 will produce a 1233 byte transaction.
  //
  const minFee = 732 + (167 * parties.length);
  if (fee < minFee) {
    throw new Error(`The fee must be at least 1 sat per byte, that is, ${minFee} or more`);
  }

  // validate maximum fee to avoid problems with OP_NUM2BIN, after addition
  //
  // When the input value needs to be split the script will validate outputs by adding
  // the values and the fee. Since the maximum positive value that can be minimally encoded
  // is 0x7fffffff, and the addition is done on 24-bit numbers, then the fee cannot be
  // larger than 0x7fffffff - 0xffffff - 0xffffff.
  //
  if (fee > 2113929217) {
    throw new Error(`The fee cannot be larger than 2113929217 to avoid math overflows`);
  }

  // validate parties
  for (let i = 0; i < parties.length; i++) {
    const p = parties[i];

    // avoid etoken and addresses with other purposes
    const decodedAddress = xecaddr.decode(p.address, false);
    if (decodedAddress.prefix !== "ecash") {
      throw new Error(`Only ecash addresses are acceptable, got ${decodedAddress.prefix} for ${p.address}`);
    }

    // make sure numbers are integer numbers
    const isIntShare = p.share % 1 === 0
    if (!isIntShare || p.share <= 0) {
      throw new Error(`All shares must be a positive integer, got "${p.share}" for "${p.address}"`);
    }

    // make sure shares are in the expected range
    if (p.share < 1 || p.share > 999) {
      throw new Error(`Shares must be a value between 1 and 999, got "${p.share}" for "${p.address}"`);
    }
  }

  // validate total shares
  const totalShares = parties.reduce((v, p) => v + p.share, 0);
  if (totalShares != 1000) {
    throw new Error(`Shares must add to 1000, got ${totalShares}`);
  }

  // find the smallest unit from all shares (from the largest share)
  //
  // This is used to check when an OP_RETURN is expected because if the largest
  // cannot get a payment above token level then no other share will. It avoids
  // keeping state, while checking outputs, or allow an optional tail.
  const absoluteMinShare = minUnitForAllShares(parties);

  // extract public key to include in script, also validates that private key is acceptable
  const ecc = new Ecc();
  const pubKey = ecc.derivePubkey(prvKey);

  // build script ops
  let ops = [
    //
    // make the script specific to a particular prv/pub key
    //

    pushBytesOp(pubKey),

    //
    // start by checking transaction signature
    // <prevouts> <outputs> <sig,sigflags> <preimage> <pubkey>
    //

    OP_3DUP,
    OP_NIP,
    OP_CHECKSIGVERIFY,

    //
    // check preimage with same signature
    // <prevouts> <outputs> <sig,sigflags> <preimage> <pubkey>
    //

    OP_ROT,
    pushNumberOp(64),
    OP_SPLIT,
    OP_DROP,

    // <prevouts> <outputs> <preimage> <pubkey> <sig>

    pushNumberOp(2),
    OP_PICK,

    // <prevouts> <outputs> <preimage> <pubkey> <sig> <preimage>

    OP_SHA256,
    OP_ROT,

    // <prevouts> <outputs> <preimage> <sig> <sha256(preimage)> <pubkey>

    OP_CHECKDATASIGVERIFY, // does the second sha256 before checking

    //
    // extract hashprevouts, script, value, and hashoutputs from preimage
    // <prevouts> <outputs> <preimage>
    //
    // The script code is variable so we count 52 bytes back for the value.
    //

    pushNumberOp(4),  // drop nVersion
    OP_SPLIT,
    OP_NIP,

    pushNumberOp(32), // split hashPrevouts
    OP_SPLIT,

    pushNumberOp(68), // drop hashSequence, outpoint
    OP_SPLIT,
    OP_NIP,

    // <prevouts> <outputs> <hashprevouts> <size,script><value><nsequence><hashoutputs><nlocktime><sighash>

    OP_SIZE,          // split script (counting from end)
    pushNumberOp(52),
    OP_SUB,
    OP_SPLIT,

    // <prevouts> <outputs> <hashprevouts> <size,script> <value><nsequence><hashoutputs><nlocktime><sighash>

    pushNumberOp(8),  // split value
    OP_SPLIT,

    pushNumberOp(4),  // drop nSequence
    OP_SPLIT,
    OP_NIP,

    pushNumberOp(32), // split hashOutputs
    OP_SPLIT,

    OP_DROP,          // drop nlocktime, sighash

    //
    // check outputs SHA256d
    // <prevouts> <outputs> <hashprevouts> <size,script> <value as bin> <hashoutputs>
    //

    pushNumberOp(4),
    OP_PICK,
    OP_HASH256,
    OP_EQUALVERIFY,

    //
    // validate single input by checking prevouts length
    // <prevouts> <outputs> <hashprevouts> <size,script> <value as bin>
    //
    // Ensuring a single input is needed because a transaction could be made
    // with multiple coins of the same value. The input script for each coin
    // would validate the same outputs but only one coin would be split and
    // all the others would add to fees.
    //

    pushNumberOp(4),
    OP_ROLL,
    OP_SIZE,
    pushNumberOp(36),
    OP_EQUALVERIFY,

    //
    // check prevouts SHA256d
    // <outputs> <hashprevouts> <size,script> <value as bin> <prevouts>
    //

    OP_HASH256,
    pushNumberOp(3),
    OP_ROLL,
    OP_EQUALVERIFY,

    //
    // check for input value overflow (5 bytes of more)
    // <outputs> <size,script> <value as bin>
    //
    // Script numbers are signed and may require a leading 0 byte to mark
    // the number as positive when the most significant bit is set. But
    // script math operatos only accept minimally encoded numbers that fit
    // in 4 bytes. This means that shares can only be verified for values
    // no larger than 0x7fffffff (big-endian).
    //
    // To make all inputs spendable there are two paths. When the input
    // value is within range, the shares are computed as expected. But when
    // the input value is out of range, only two outputs to the contract
    // address are allowed and their values (plus the fee) must match the
    // input value. This can be done because 64-bit additional can be
    // emulated with lower-bit addition and carry over. To avoid issues
    // with the leading zero, 24-bit addition is used.
    //

    OP_DUP,
    pushBytesOp(fromHex("00000080ffffffff")),
    OP_AND,
    OP_IF,

      //
      // can only validate split, start by computing the contract script
      // <outputs> <size,script> <value as bin>
      //

      pushBytesOp(fromHex("17a914")), // PUSH(23), HASH160, PUSH(20)
      OP_ROT,
      pushNumberOp(3),                // the number of bytes to encode the script size
      OP_SPLIT,
      OP_NIP,                         // drop size byte
      OP_HASH160,
      pushBytesOp(fromHex("87")),     // OP_EQUAL
      OP_CAT,
      OP_CAT,

      //
      // validate output destinations, preserve output values
      // <outputs> <value as bin> <contractscript>
      //

      OP_ROT,

      pushNumberOp(8),
      OP_SPLIT,
      pushNumberOp(24), // script must always be [0x17, <23 bytes for P2SH>]
      OP_SPLIT,
      pushNumberOp(8),
      OP_SPLIT,

      OP_ROT,

      // <value as bin> <contractscript> <value1 as bin> <value2 as bin> <script1> <script2>

      OP_DUP,
      pushNumberOp(5),
      OP_ROLL,

      OP_EQUALVERIFY, // <script2> == <contractscript>
      OP_EQUALVERIFY, // <script1> == <script2>

      //
      // validate that output values plus fee equals input value
      // <value as bin> <value1 as bin> <value2 as bin>
      //

      pushNumberOp(3),
      OP_SPLIT,
      OP_SWAP,
      pushBytesOp(fromHex("00")),
      OP_CAT,
      OP_BIN2NUM,
      OP_ROT,

      pushNumberOp(3),
      OP_SPLIT,
      OP_SWAP,
      pushBytesOp(fromHex("00")),
      OP_CAT,
      OP_BIN2NUM,
      OP_ROT,

      OP_ADD,            // add bits 0 - 23

      pushNumberOp(fee),
      OP_ADD,            // add fee, can be at most 2113929217

      pushNumberOp(4),
      OP_NUM2BIN,
      pushNumberOp(3),
      OP_SPLIT,
      OP_BIN2NUM,        // carryover for bits 24 - 47
      OP_2SWAP,

      pushNumberOp(3),
      OP_SPLIT,
      OP_SWAP,
      pushBytesOp(fromHex("00")),
      OP_CAT,
      OP_BIN2NUM,
      OP_ROT,

      pushNumberOp(3),
      OP_SPLIT,
      OP_SWAP,
      pushBytesOp(fromHex("00")),
      OP_CAT,
      OP_BIN2NUM,
      OP_ROT,

      OP_ADD,            // add bits 24 - 27
      pushNumberOp(3),
      OP_ROLL,
      OP_ADD,            // add carryover for bits 24 - 47

      pushNumberOp(4),
      OP_NUM2BIN,
      pushNumberOp(3),
      OP_SPLIT,
      OP_BIN2NUM,        // carryover for bits 48 - 63
      OP_2SWAP,

      OP_BIN2NUM,        // will always have a leading 0
      OP_SWAP,
      OP_BIN2NUM,        // will always have a leading 0

      OP_ADD,            // add bits 48 - 63
      OP_ADD,            // add carryover for bits 48 - 63

      pushNumberOp(2),
      OP_NUM2BIN,

      OP_CAT,            // join bits 24 - 63
      OP_CAT,            // join bits 0 - 63

      OP_EQUAL,

      //
      // end
      // 1
      //
      // The result of OP_EQUAL determines the success of the script, that is,
      // the transaction is finally valid if the sum the outputs and the fee
      // produced the input value.
      //

    OP_ELSE,

      //
      // can validate shares, start by taking fixed fee from value
      // <outputs> <size,script> <value as bin>
      //

      OP_BIN2NUM,
      pushNumberOp(fee),
      OP_SUB,

      //
      // calculate 1/1000 unit from input value
      // <outputs> <size,script> <outputvalue>
      //

      pushNumberOp(1000),
      OP_DIV,

      //
      // check if unit is below the minimum for every share
      // <outputs> <size,script> <unit>
      //

      OP_DUP,
      pushNumberOp(absoluteMinShare),
      OP_LESSTHAN,
      OP_IF,

        //
        // drop unit and script, check for a single OP_RETURN output
        // <outputs> <size,script> <unit>
        //
        // The OP_RETURN is enforced because there's no way to respect the shares
        // and any other split would be arbitrary. A future version may allow
        // consolidation to the input/contract address.
        //
        OP_2DROP,
        pushBytesOp(serializeOutputs([{ value: 0, script: SCRIPT_NOPAY }])),
        OP_EQUAL,

        //
        // end
        // 1
        //
        // The result of OP_EQUAL determines the success of the script, that is,
        // the transaction is finally valid if the there is an empty OP_RETURN.
        //

      OP_ELSE,

        //
        // bring outputs to the top, to allow for dynamic number of shares
        // <outputs> <size,script> <unit>
        //

        OP_ROT
  ];

  // add repeatable logic for each party
  for (let i = 0; i < parties.length; i++) {
    const party = parties[i];
    const outputScript = outputScriptForAddress(party.address);
    const minUnit = minUnitForShare(party.share);

    appendOps(ops, [
        //
        // check if party must be present
        // <size,script> <unit> <outputs[i:]>
        //

        pushNumberOp(1),
        OP_PICK,
        pushNumberOp(minUnit),
        OP_GREATERTHANOREQUAL,
        OP_IF,

          //
          // extract value and script (save remaining outputs)
          // <size,script> <unit> <outputs[i:]>
          //

          pushNumberOp(8), // value
          OP_SPLIT,
          pushNumberOp(1), // first byte is the var size, always minimally encoded (size <= 25)
          OP_SPLIT,
          OP_SWAP,
          OP_SPLIT,
          OP_ROT,          // save tail for next iteration
          OP_ROT,

          //
          // check script, which includes address
          // <size,script> <unit> <outputs[i+1:]> <value1 as bin> <script1>
          //

          pushBytesOp(outputScript.bytecode),
          OP_EQUALVERIFY,

          //
          // check that value/share == unit (the reverse of value = share * unit)
          // <size,script> <unit> <outputs[i+1:]> <value1 as bin>
          //

          OP_BIN2NUM,
          pushNumberOp(party.share),
          OP_DIV,
          pushNumberOp(2),
          OP_PICK,
          OP_EQUALVERIFY,

        OP_ENDIF,
    ]);
  }

  // append common ending
  appendOps(ops, [

        //
        // drop the 0x tail and unit
        // <size,script> <unit> <outputs[n:]>
        //
        // No extra outputs are allowed for safety and because the transaction
        // priority is relevant for the contract. By restricting outputs it's
        // possible to ensure that the fees are never less than the chosen amount.
        //
        // Without this it would be, in principle, possible to abuse high priority
        // contracts and redirect some of the fees to another output.
        //

        OP_1ADD, // only a 0x00 tail is a valid number
        OP_ROT,
        OP_ROT,

        // 1 <size,script> <unit>

        OP_2DROP,

        //
        // end
        // 1
        //
        // The result of OP_1ADD ends up determining the success of the script.
        // If there are more outputs, the op will fail and the script will not
        // reach this point. If there are no more outputs then 0x will be
        // interpreted as 0 and the op will produce the expected 1. The other
        // elements are dropped because of the clean stack rule.
        //

      OP_ENDIF,

    OP_ENDIF,

    //
    // end
    // 1
    //

  ]);

  // return script from ops
  return Script.fromOps(ops);
}

//
// utility functions
//

export function quotient(numerator: Int, divisor: Int) {
  // integer division, avoid working with floats
  const bigNum = BigInt(numerator);
  const bigDiv = BigInt(divisor);
  return (bigNum - bigNum % bigDiv) / bigDiv;
}

export function minUnitForShare(share: number) {
  // get how many units are needed to reach the dust level
  const shareUnit = quotient(546, share);
  // adjust units up if not perfectly divisible, basically Math.ceil(546/share)
  return Number(shareUnit) + (546 % share == 0 ? 0 : 1);
}

export function minUnitForAllShares(parties: Party[]) {
  const largestShare = parties.reduce((v, p) => Math.max(v, p.share), 0);
  return minUnitForShare(largestShare);
}

function appendOps(ops1: Op[], ops2: Op[]) {
  ops2.forEach(op => ops1.push(op));
}
