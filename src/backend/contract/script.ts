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
  OP_CHECKDATASIG,
  OP_CHECKSIGVERIFY,
  OP_DIV,
  OP_DROP,
  OP_DUP,
  OP_ELSE,
  OP_ENDIF,
  OP_EQUALVERIFY,
  OP_GREATERTHANOREQUAL,
  OP_HASH160,
  OP_HASH256,
  OP_IF,
  OP_LESSTHAN,
  OP_NIP,
  OP_NUM2BIN,
  OP_OVER,
  OP_PICK,
  OP_RETURN,
  OP_REVERSEBYTES,
  OP_ROLL,
  OP_ROT,
  OP_SHA256,
  OP_SPLIT,
  OP_SUB,
  OP_SWAP,
  Op,
  Script,
  fromHex,
  pushBytesOp
} from 'ecash-lib';
import * as xecaddr from 'ecashaddrjs';
import { outputScriptForAddress, pushNumberOp } from './utils';

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
// - BIP 143 preimage split into its parts in multiple pushes. All elements
//   are pushed separately except nLocktime and sighash which are pushed
//   together because they are not needed. The preimage is used to
//     1) validate prevouts and outputs, and
//     2) get the input value and the script
//

export interface Party {
  address: string,
  share: number
}

export function createScript(ecc: Ecc, prvKey: Uint8Array, fee: number, parties: Party[]) {
  // validate number of parties
  if (parties.length < 2 || parties.length > 6) {
    // less than 2 is useless, more than 6 will break the 520 byte push limit for the script
    throw new Error("The contract must have between 2 and 6 parties");
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
  const pubKey = ecc.derivePubkey(prvKey);

  // build script ops
  let ops = [
    //
    // inputs
    // <prevouts> <outputs> <sig,sigflags> <preimage[1,2,3,4,5,6,7,8,9-10]>
    //
    // To work around the 520-push limits, the preimage will be provided as
    // multiple pushes. All preimage parts are pushed individually, except the
    // last two because they are not needed.
    //
    // Since the preimage is split, the verification of the multiple parts is
    // done first and all signature verifications are left to the end.
    //

    //
    // check prevouts SHA256d
    // <prevouts> <outputs> <sig,sigflags> <preimage[1]> <hashPrevouts> ...
    // ... <preimage[3,4,5,6,7,8,9-10]>
    //

    pushNumberOp(11),
    OP_ROLL,
    OP_DUP,
    OP_HASH256,
    pushNumberOp(9),
    OP_PICK,
    OP_EQUALVERIFY,

    //
    // make sure that only one script input is used
    // <outputs> <sig,sigflags> <preimage[1,2,3]> <outpoint> ...
    // ... <preimage[5,6,7,8,9-10]> <prevouts>
    //
    // Ensuring a single script input is needed because a transaction could
    // be made with multiple coins of the same value. The input script for
    // each coin would validate the same outputs but only one coin would be
    // split and all the others would be givne to miners.
    //
    // By matching the preimage outpoint with the first prevout provided as
    // input we limit the number of scripts inputs while allowing for more
    // inputs that can add fees. This is important to make all coins spendable
    // because transactions will be bigger than 546 bytes.
    //

    pushNumberOp(36),
    OP_SPLIT,
    OP_DROP,
    pushNumberOp(6),
    OP_PICK,
    OP_EQUALVERIFY,

    //
    // check outputs SHA256d
    // <outputs> <sig,sigflags> <preimage[1,2,3,4,5,6,7]> <hashOutputs> ...
    // ... <preimage[9-10]>
    //

    OP_OVER,
    pushNumberOp(11),
    OP_ROLL,
    OP_DUP,
    OP_HASH256,
    OP_ROT,
    OP_EQUALVERIFY,

    //
    // bring script and value to top to enable output verification
    // <sig,sigflags> <preimage[1,2,3,4]> <size,scriptCode> <value as bin> ...
    // ... <preimage[7,8,9-10]> <outputs>
    //

    pushNumberOp(5),
    OP_PICK,
    pushNumberOp(5),
    OP_PICK,

    //
    // check for input value overflow (5 bytes of more)
    // ... <outputs> <size,scriptCode> <value as bin>
    //
    // Script numbers are signed and may require a leading 0 byte to mark
    // the number as positive when the most significant bit is set. But
    // script math operations only accept minimally encoded numbers that fit
    // in 4 bytes. This means that shares can only be verified for values
    // no larger than 0x7fffffff (big-endian).
    //
    // To make all inputs spendable there are two paths. When the input
    // value is within range, the shares are computed as expected. But when
    // the input value is out of range, only two outputs, to the contract
    // address, are allowed and their values (plus the fee) must match the
    // input value. This can be done because 64-bit addition can be emulated
    // with lower-bit addition and carry over. Fo this, 24-bit addition is
    // used because any overflow will fit in 4 bytes.
    //

    OP_DUP,
    pushBytesOp(fromHex("00000080ffffffff")),
    OP_AND,
    OP_IF,

      //
      // compute the contract output script
      // ... <outputs> <size,scriptCode> <value as bin>
      //

      pushBytesOp(fromHex("17a914")), // PUSH(23), HASH160, PUSH(20)
      OP_ROT,
      pushNumberOp(3),                // assume length of compact size
      OP_SPLIT,
      OP_NIP,
      OP_HASH160,
      pushBytesOp(fromHex("87")),     // OP_EQUAL
      OP_CAT,
      OP_CAT,

      //
      // validate output destinations, preserve output values
      // ... <outputs> <value as bin> <outputscript>
      //

      OP_ROT,

      pushNumberOp(8),
      OP_SPLIT,
      pushNumberOp(24),
      OP_SPLIT,
      pushNumberOp(8),
      OP_SPLIT,

      OP_ROT,

      // ... <value as bin> <outputscript> <value1 as bin> <value2 as bin> ...
      // ... <script2> <script1>

      OP_DUP,
      pushNumberOp(5),
      OP_ROLL,

      OP_EQUALVERIFY, // <script1> == <contractscript>
      OP_EQUALVERIFY, // <script2> == <script1>

      //
      // validate that the output values plus fee equals input value
      // ... <value as bin> <outputscript> <value1 as bin> <value2 as bin>
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

      OP_EQUALVERIFY,

    OP_ELSE,

      //
      // drop script code, not neded for output verification
      // ... <outputs> <size,scriptCode> <value as bin>
      //

      OP_NIP,

      //
      // can validate shares, start by taking fixed fee from value
      // ... <outputs> <value as bin>
      //

      OP_BIN2NUM,
      pushNumberOp(fee),
      OP_SUB,

      //
      // calculate 1/1000 unit from input value
      // ... <outputs> <value>
      //

      pushNumberOp(1000),
      OP_DIV,

      //
      // check if unit is below the minimum of all shares
      // ... <outputs> <unit>
      //
      // This means that, for all shares, unit times share is smaler than 546.
      //

      OP_DUP,
      pushNumberOp(absoluteMinShare),
      OP_LESSTHAN,
      OP_IF,

        //
        // drop unit, not longer needed for output verification
        // ... <outputs> <unit>
        //

        OP_DROP,

        //
        // check for an empty OP_RETURN
        // ... <outputs>
        //
        // The OP_RETURN is enforced because there's no way to respect the
        // shares and any other distribution would be arbitrary. A future
        // version may allow consolidation to the contract address.
        //

        OP_REVERSEBYTES,
        OP_BIN2NUM,
        pushBytesOp(fromHex("6a01")),
        OP_EQUALVERIFY,

      OP_ELSE,

        //
        // bring outputs to the top, to allow a dynamic number of shares
        // ... <outputs> <unit>
        //

        OP_SWAP
  ];

  // add repeatable logic for each party
  for (let i = 0; i < parties.length; i++) {
    const party = parties[i];
    const outputScript = outputScriptForAddress(party.address);
    const minUnit = minUnitForShare(party.share);

    appendOps(ops, [

        //
        // check if party1 must be present
        // ... <unit> <outputs[1-n]>
        //

        OP_OVER,
        pushNumberOp(minUnit),
        OP_GREATERTHANOREQUAL,
        OP_IF,

          //
          // extract value and output script (save remaining outputs)
          // ... <unit> <outputs[1-n]>
          //

          pushNumberOp(8),
          OP_SPLIT,
          pushNumberOp(1), // first byte is the var size, always minimally encoded (size <= 25)
          OP_SPLIT,
          OP_SWAP,
          OP_SPLIT,
          OP_ROT,
          OP_ROT,

          //
          // check output script, which includes address
          // ... <unit> <outputs[2-n]> <value1 as bin> <outputscript1>
          //

          pushBytesOp(outputScript.bytecode),
          OP_EQUALVERIFY,

          //
          // check that value/share == unit (the reverse of value = share * unit)
          // ... <unit> <outputs[2-n]> <value1 as bin>
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
        // ensure that there are not more outputs
        // ... <unit> <outputs[3-n]>
        //
        // No extra outputs are allowed for safety and because the transaction
        // priority is relevant for the contract. By restricting outputs it's
        // possible to ensure that the fees are never less than the chosen amount.
        //
        // Without this it would be, in principle, possible to abuse high priority
        // contracts and redirect some of the fees to another output.
        //

        OP_1ADD, // only a 0x00 tail is a valid number

        //
        // clean stack by dropping verified tail and unit
        // ... <unit> 1
        //

        OP_2DROP,

      OP_ENDIF,

    OP_ENDIF,

    //
    // reconstruct the preimage from its parts
    // <sig,sigflags> <preimage[1,2,3,4,5,6,7,8,9-10]>
    //

    OP_CAT,
    OP_CAT,
    OP_CAT,
    OP_CAT,
    OP_CAT,
    OP_CAT,
    OP_CAT,
    OP_CAT,

    //
    // add validation public key
    // <sig,sigflags> <preimage>
    //

    pushBytesOp(pubKey),

    //
    // check transaction signature
    // <sig,sigflags> <preimage> <pubkey>
    //

    OP_3DUP,
    OP_NIP,
    OP_CHECKSIGVERIFY,

    //
    // prepare signature for prehash validation by dropping sighas byte
    // <sig,sigflags> <preimage> <pubkey>
    //

    OP_ROT,
    pushNumberOp(64),
    OP_SPLIT,
    OP_DROP,

    //
    // prepare preimage for validation by hashing once
    // <preimage> <pubkey> <sig>
    //

    OP_ROT,
    OP_SHA256,

    //
    // validate preimage hash
    // <pubkey> <sig> <preimagehash>
    //

    OP_ROT,
    OP_CHECKDATASIG, // does the second sha256 before checking

    //
    // end
    // 1
    //
    // All the validations done on prevouts and outputs rests on the preimage
    // being valid. That part is done by the OP_OP_CHECKDATASIG above, but
    // the validation is only meaningful after the previous OP_CHECKSIGVERIFY
    // with the same signature. That's what ensures that the preimage given as
    // input is the actual preimage for the utxo being spent.
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
