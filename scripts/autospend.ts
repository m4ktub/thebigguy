import { type BlockchainInfo, ChronikClient, type ScriptUtxo } from 'chronik-client';
import { Ecc, initWasm, toHex } from 'ecash-lib';
import { createTx } from 'thebigguy-contract';
import { PRV_KEY } from '../src/backend/constants';
import { type DbContract, getAutoSpendContracts, loadContract } from '../src/backend/database';
import { type P2SHResponse, prepareP2SHResponse } from '../src/backend/p2sh';
import { getSettings } from '../src/backend/settings';

//
// settings
//

const settings = getSettings();

//
// main script
//

const keepAlive = () => { };
const interval = setInterval(keepAlive, 1000);
const terminate = () => clearInterval(interval);

initWasm().then(main).finally(terminate);

//
// support functions
//

async function main() {
  try {
    const ecc = new Ecc();
    console.log("Created ECC instance");

    console.log("Obtaining blockhain info...");
    const chronik = new ChronikClient(settings.chronik.urls);
    const tip = await chronik.blockchainInfo();
    console.log("  height", tip.tipHeight)

    console.log("Obtaining auto spend contracts...");
    const contracts = await getAutoSpendContracts();
    console.log("  total", contracts.length);

    console.log("Processing contracts...");
    for (let i = 0; i < contracts.length; i++) {
      const hash = contracts[i];
      console.log(" ", hash);
      await process(ecc, hash, chronik, tip);
    }

    console.log("Processing completed");
  } catch (reason) {
    console.log("  failed reason", reason);
  }
}

async function process(ecc: Ecc, hash: string, chronik: ChronikClient, tip: BlockchainInfo) {
  try {
    console.log("    loading contract from database...");
    const contract = await loadContract(hash) as DbContract;

    console.log("    loading utxos from blockchain...");
    const result = await chronik.script('p2sh', hash).utxos();
    const parameters = prepareP2SHResponse(ecc, contract);
    const spendable = result.utxos.filter(utxo => isSpendable(parameters, tip, utxo));
    console.log("      total", result.utxos.length, "spendable", spendable.length);

    // stop quickly, if there's no spendable utxo
    if (spendable.length == 0) {
      return;
    }

    // spend utxos
    console.log("    spending utxos...");
    for (let i = 0; i < spendable.length; i++) {
      const utxo = spendable[i];

      try {
        const txid = await spend(ecc, contract, chronik, utxo);
        console.log("      txid", txid.txid);
      } catch (reason) {
        const outpoint = utxo.outpoint;
        console.log("      failed for", outpoint.txid, outpoint.outIdx, "reason", reason);
      }
    }
  }
  catch (reason) {
    console.log("    failed reason", reason);
  }
}

function isSpendable(parameters: P2SHResponse, tip: BlockchainInfo, utxo: ScriptUtxo) {
  // filter small UTXOs
  if (Number(utxo.value) < parameters.dustValue) {
    return false;
  }

  // regular UTXOs are spendable
  if (!utxo.isCoinbase) {
    return true;
  }

  // coinbase utxos need 100 confirmations
  // thi will also fail when blockHeight is -1 (mempool)
  if (tip.tipHeight - utxo.blockHeight + 1 < 100) {
    return false;
  }

  // all conditions have passed
  return true;
}

function spend(ecc: Ecc, contract: DbContract, chronik: ChronikClient, utxo: ScriptUtxo) {
  const outpoint = utxo.outpoint;
  const value = Number(utxo.value);
  const tx = createTx(ecc, PRV_KEY, { ...outpoint, value }, contract.fee, contract.parties);
  const hex = toHex(tx.ser());
  return chronik.broadcastTx(hex);
}
