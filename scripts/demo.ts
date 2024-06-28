import * as utxolib from '@bitgo/utxo-lib';
import * as msgsig from 'bitcoinjs-message';
import * as xeclib from 'ecash-lib';
import * as xecaddr from 'ecashaddrjs';
import { PRV_KEY } from '../src/backend/constants';
import { createTx } from '../src/backend/contract/tx';

//
// demo request
//

const request = {
  // the contract addresses and the share of each
  address1: "ecash:qq28cqs6dx23qh4qucnk9v3l2jt4yr242cxqqnw9kc", share1: 900,
  address2: "ecash:qq830d643lw865u0x7mpc4yzsrvt9peccggju7td2v", share2: 100,

  // the minium fee (the effective fee will be between 2000 and 2999)
  fee: 2000,

  // An authorization from each address in the form of a signature.
  // The message to sign is: "<address>\t<share>/1000\n" (without the last \n)
  signature1: "ILC3W7jR5JurfKdUNXPL5RJEf3jt3mZTSrVJsodzYB4ed39RyucD9SjsyUiZohXH7d/YHzHSaWgtnriC7B0EjUU=",
  signature2: "IFR8S0VBmy/aqGhSxfPoFzD5sGNDhfbi6LuJtRpMSquAbopEWSXVjADc8ReC7g+WUSrYhytSqslido8aKA4Iv10="
};

// validate that shares add to 1000
if (request.share1 + request.share2 != 1000) {
  throw new Error("Shares must add to 1000");
}

// validate the signatures
function checkAuth(msg: string, address: string, signature: string) {
  const prefix = utxolib.networks.ecash.messagePrefix;
  if (! msgsig.verify(msg, xecaddr.toLegacy(address), signature, prefix)) {
    throw new Error(`Authorization signature invalid for address ${address}`);
  }
}

const authMsg = [
  `${request.address1}\t${request.share1}/1000`,
  `${request.address2}\t${request.share2}/1000`
].join("\n");

checkAuth(authMsg, request.address1, request.signature1);
checkAuth(authMsg, request.address2, request.signature2);

//
// initialize ECC
//

xeclib.initWasm();

const ecc = new xeclib.Ecc();

//
// create spending transaction
//

const utxo = {
  txid: '0000000000000000000000000000000000000000000000000000000000000001',
  outIdx: 0,
  value: 36378418
};

const signedTx = createTx(ecc, PRV_KEY, utxo, request.fee, [
  {
    address: request.address1,
    share: request.share1
  },
  {
    address: request.address2,
    share: request.share2
  }
]);

//
// print details
//
// The transaction will have a spend script which is 4 pushes
// - serialize outputs
// - signature
// - preimage of single input
// - script, as required for P2SH
//
const redeemScript = signedTx.inputs[0].script as xeclib.Script
const opsIter = redeemScript.ops();

const outputs = opsIter.next() as xeclib.PushOp;
const sig = opsIter.next() as xeclib.PushOp;
const preimage = opsIter.next() as xeclib.PushOp;
const script = opsIter.next() as xeclib.PushOp;

console.log("       tx:", signedTx.serSize(), xeclib.toHex(signedTx.ser()));
console.log();
console.log("  outputs:", outputs.data.length, xeclib.toHex(outputs.data));
console.log("      sig:", sig.data.length, xeclib.toHex(sig.data));
console.log(" preimage:", preimage.data.length, xeclib.toHex(preimage.data));
console.log();
console.log("  address:", xecaddr.encode("ecash", "P2SH", xeclib.shaRmd160(script.data)))
console.log("   script:", script.data.length, xeclib.toHex(script.data));
