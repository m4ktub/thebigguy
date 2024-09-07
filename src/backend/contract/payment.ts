import { Int, Script, TxOutput, shaRmd160 } from "ecash-lib";
import { SCRIPT_NOPAY, quotient, type Party } from "./script";

export function createOutputs(value: Int, fee: number, contract: Script, parties: Party[]): TxOutput[] {
  const inputValue = BigInt(value);
  const outputValue = inputValue - BigInt(fee)
  const outputs = [];

  // check for minimally encoding errors in script math
  //
  // eCash script math opcodes only support 32-bit numbers. Since numbers are
  // signed this means that the maximum value that can be directly used must
  // be no greater than 0x7fffffff.
  //
  if (inputValue > 0x7fffffff) {
    // the share math won't work so the script detects than and validates that
    // all outputs are back to the contract and the values add up
    const contractP2sh = Script.p2sh(shaRmd160(contract.bytecode));

    // splitting in half is the simplest way to get to validatable utxos
    const halfValue = quotient(outputValue, 2);

    // this ensures that input = fee + output1 + output2, when input is odd
    outputs.push({ value: outputValue - halfValue, script: contractP2sh });
    outputs.push({ value: halfValue              , script: contractP2sh });
  } else {
    // the share math will work so the script will validate output amounts
    // based on the contract shares and a unit of 1/1000th of the output value
    const valueUnit = quotient(outputValue, 1000);

    // add one output per party...
    for (let i = 0; i < parties.length; i++) {
      const party = parties[i];
      const partyValue = BigInt(party.share) * valueUnit;

      // ... but skip values below dust
      if (partyValue < 546) {
        continue;
      }

      outputs.push({
        value: partyValue,
        script: Script.fromAddress(party.address)
      });
    }

    // if no party got a share, then add the expected OP_RETURN
    if (outputs.length == 0) {
      outputs.push({ value: 0, script: SCRIPT_NOPAY });
    }
  }

  return outputs;
}
