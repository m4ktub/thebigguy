import { Ecc, initWasm, Int, shaRmd160, toHex } from 'ecash-lib';
import * as xecaddr from 'ecashaddrjs';
import { PRV_KEY } from '../src/backend/constants';
import { createScript, quotient } from '../src/backend/contract/script';
import { createTx, Utxo } from '../src/backend/contract/tx';

//
// gather environment
//

const rpcPort = Number(process.env.RPC_PORT || 18443);
const rpcUser = process.env.RPC_USER || "rpcuser";
const rpcPass = process.env.RPC_USER || "rpcpass";

//
// constants
//

const SEND_OVER_FLOW_VALUE = 41_234_567_89;
const SEND_FULL_DIST_VALUE = 1_234_567_89;
const SEND_SEMI_DIST_VALUE = 30_00;
const SEND_OP_RETURN_VALUE = 29_99;
const CONTRACT_FEE = 20_00;
const WALLET_FEES = 20_00;

const WALLET_NAME = "tbg";
const WALLET_MIN_VALUE =
  SEND_OVER_FLOW_VALUE +
  SEND_FULL_DIST_VALUE +
  SEND_SEMI_DIST_VALUE +
  SEND_OP_RETURN_VALUE +
  WALLET_FEES

//
// utils
//

function rpc<T>(method: string, params: any[]): Promise<T> {
  const auth = btoa(`${rpcUser}:${rpcPass}`);
  const id = `${method}.${Date.now()}.${Math.random()}`;

  return fetch(`http://localhost:${rpcPort}`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`
    },
    body: JSON.stringify({ id, method, params })
  }).then(res => {
    if (res.status == 401) {
      throw new Error(`Authentication failed with ${rpcUser}:${rpcPass}`);
    }

    return res.json();
  }).then(data => {
    // check error response
    if (data.error) {
      throw new Error(JSON.stringify(data.error));
    }

    return data.result as T;
  });
}

function xec(amount: Int): number {
  return Number(amount) / 100;
}

//
// create or load wallet
//

type WalletNames = string[];

interface WalletDir {
  wallets: Array<{ name: string }>
}

interface Wallet {
  name: string
}

function getWalletName(w: Wallet) {
  return w.name;
}

const wallet = rpc<WalletNames>("listwallets", [])
  .then(names => {
    if (names.includes(WALLET_NAME)) {
      console.log(`Wallet ${WALLET_NAME} already loaded. Reusing...`);
      return WALLET_NAME;
    } else {
      return rpc<WalletDir>("listwalletdir", []).then(dir => {
        const exists = dir.wallets.map(getWalletName).includes(WALLET_NAME);
        if (exists) {
          console.log(`Wallet ${WALLET_NAME} exists. Loading wallet...`);
          return rpc<Wallet>("loadwallet", [WALLET_NAME]).then(getWalletName);
        } else {
          console.log(`Wallet ${WALLET_NAME} is missing. Creating wallet...`);
          return rpc<Wallet>("createwallet", [WALLET_NAME]).then(getWalletName);
        }
      });
    }
  });

//
// ensure the wallet has funds
//

interface WalletInfo {
  walletname: string;
  balance: number;
  txcount: number;
}

type Txs = string[];

const info = wallet
  .then(_wallet => {
    return rpc<WalletInfo>("getwalletinfo", []).then(info => {
      if (info.balance >= xec(WALLET_MIN_VALUE)) {
        console.log(`Wallet has sufficient balance: ${info.balance} XEC`);
        return info;
      } else {
        console.log(`Wallet has insufficient balance: ${info.balance} XEC`);
        console.log(`Generating new coins to wallet...`);
        return rpc<string>("getnewaddress", [])
          .then(address => rpc<Txs>("generatetoaddress", [101, address]))
          .then(_txs => rpc<WalletInfo>("getwalletinfo", []));
      }
    });
  }).then(info => {
    if (info.balance < xec(WALLET_MIN_VALUE)) {
      throw new Error("Could not generate enough coins. Try restarting bitcoind " +
        "with a clean regtest directory.")
    }

    return info;
  });

//
// create contract
//

const contract = info
  .then(() => initWasm())
  .then(() => {
    console.log("Getting addresses for parties...")
    return Promise.all([
      rpc<string>("getnewaddress", []),
      rpc<string>("getnewaddress", [])
    ]).then(addresses => {
      console.log("  ", addresses[0]);
      console.log("  ", addresses[1]);
      return addresses;
    });
  }).then(addresses => {
    const ecc = new Ecc();
    const fee = CONTRACT_FEE;
    const parties = [
      { address: addresses[0], share: 900 },
      { address: addresses[1], share: 100 }
    ];

    const script = createScript(ecc, PRV_KEY, fee, parties);
    const hash = shaRmd160(script.bytecode);
    const address = xecaddr.encode("ecregtest", "P2SH", hash);

    console.log(`Created contract at address ${address}`);
    console.log(`   #1: ${parties[0].address}\t${parties[0].share}`);
    console.log(`   #2: ${parties[1].address}\t${parties[1].share}`);
    console.log(`  fee: ${xec(fee).toFixed(2)} XEC`);

    return { ecc, fee, parties, script, address };
  });

//
// send coins to contract address
//

interface TxOut {
  value: number;
}

function sendAndGetUtxo(address: string, value: number): Promise<Utxo> {
  const xecValue = xec(value);
  return rpc<string>("sendtoaddress", [address, xecValue])
    .then(txid => {
      return rpc<TxOut>("gettxout", [txid, 0])
        .then(out => {
          return {
            txid: txid,
            outIdx: out.value === xecValue ? 0 : 1,
            value: value
          };
        });
    });
}

const status0 = contract
  .then(contract => {
    console.log(`Sending multipe coins to ${contract.address}...`);

    // use "send" instead of "sendtoaddress" to ensure the value is at idx 0
    return Promise.all([
      sendAndGetUtxo(contract.address, SEND_OVER_FLOW_VALUE),
      sendAndGetUtxo(contract.address, SEND_FULL_DIST_VALUE),
      sendAndGetUtxo(contract.address, SEND_SEMI_DIST_VALUE),
      sendAndGetUtxo(contract.address, SEND_OP_RETURN_VALUE)
    ]).then(sentTxs => {
      console.log("  sent:", sentTxs[0].txid, xec(sentTxs[0].value).toFixed(2), "XEC");
      console.log("  sent:", sentTxs[1].txid, xec(sentTxs[1].value).toFixed(2), "XEC");
      console.log("  sent:", sentTxs[2].txid, xec(sentTxs[2].value).toFixed(2), "XEC");
      console.log("  sent:", sentTxs[3].txid, xec(sentTxs[3].value).toFixed(2), "XEC");

      return {
        contract,
        utxo: {
          overflow: sentTxs[0],
          fullDist: sentTxs[1],
          semiDist: sentTxs[2],
          opReturn: sentTxs[3]
        },
        transactions: [] as string[]
      };
    });
  });

//
// split big value sent to address
//

const status1 = status0
  .then(status => {
    console.log(`Spending coin with ${xec(SEND_OVER_FLOW_VALUE).toFixed(2)} XEC...`);

    const { ecc, fee, parties } = status.contract;
    const tx = createTx(ecc, PRV_KEY, status.utxo.overflow, fee, parties);
    const txHex = toHex(tx.ser());

    return rpc<string>("sendrawtransaction", [txHex])
      .then(txid => {
        console.log("  sent: " + txid);

        status.transactions.push(txid);
        return status;
      });
  });

//
// distributing split coin sent to address
//

const status2 = status1
  .then(status => {
    console.log("Creating distribution transaction for outputs of split...");

    const splitValue = BigInt(SEND_OVER_FLOW_VALUE - CONTRACT_FEE);
    const splitValueHalf = quotient(splitValue, 2);

    const splitUtxo0 = {
      txid: status.transactions[0],
      outIdx: 0,
      value: splitValue - splitValueHalf
    };

    const splitUtxo1 = {
      txid: status.transactions[0],
      outIdx: 1,
      value: splitValueHalf
    };

    const { ecc, fee, parties } = status.contract;
    const tx0 = createTx(ecc, PRV_KEY, splitUtxo0, fee, parties);
    const txHex0 = toHex(tx0.ser());
    const tx1 = createTx(ecc, PRV_KEY, splitUtxo1, fee, parties);
    const txHex1 = toHex(tx1.ser());

    return Promise.all([
      rpc<string>("sendrawtransaction", [txHex0]),
      rpc<string>("sendrawtransaction", [txHex1]),
    ]).then(txids => {
      console.log("  sent: " + txids[0]);
      console.log("  sent: " + txids[1]);

      status.transactions.push(...txids);
      return status;
    });
  });

//
// distributing specific coin sent to address
//

const status3 = status2
  .then(status => {
    console.log(`Spending coin with ${xec(SEND_FULL_DIST_VALUE).toFixed(2)} XEC...`);

    const { ecc, fee, parties } = status.contract;
    const tx = createTx(ecc, PRV_KEY, status.utxo.fullDist, fee, parties);
    const txHex = toHex(tx.ser());

    return rpc<string>("sendrawtransaction", [txHex])
      .then(txid => {
        console.log("  sent: " + txid);

        status.transactions.push(txid);
        return status;
      });
  });

//
// semi distributing specific coin sent to address
//

const status4 = status3
  .then(status => {
    console.log(`Spending coin with ${xec(SEND_SEMI_DIST_VALUE).toFixed(2)} XEC...`);

    const { ecc, fee, parties } = status.contract;
    const tx = createTx(ecc, PRV_KEY, status.utxo.semiDist, fee, parties);
    const txHex = toHex(tx.ser());

    return rpc<string>("sendrawtransaction", [txHex])
      .then(txid => {
        console.log("  sent: " + txid);

        status.transactions.push(txid);
        return status;
      });
  });

//
// spending value to low to generate any share
//

const status5 = status4
  .then(status => {
    console.log(`Spending coin with ${xec(SEND_OP_RETURN_VALUE).toFixed(2)} XEC...`);

    const { ecc, fee, parties } = status.contract;
    const tx = createTx(ecc, PRV_KEY, status.utxo.opReturn, fee, parties);
    const txHex = toHex(tx.ser());

    return rpc<string>("sendrawtransaction", [txHex])
      .then(txid => {
        console.log("  sent: " + txid);

        status.transactions.push(txid);
        return status;
      });
  });

//
// dump final details
//

status5.then(status => {
  const { contract, utxo, transactions } = status;

  console.log("All transactions created without errors.");
  console.log();
  console.log("Details: ", {
    address: contract.address,
    parties: contract.parties,
    fee: contract.fee,
    utxo,
    transactions
  });
});
