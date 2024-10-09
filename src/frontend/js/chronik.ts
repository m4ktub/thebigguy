import {
  type BlockchainInfo,
  ChronikClient,
  MsgBlockClient,
  MsgTxClient,
  type ScriptUtxo,
  type Tx,
  type WsMsgClient
} from 'chronik-client';
export type { ScriptUtxo } from 'chronik-client';

const chronik = new ChronikClient(["https://chronik.be.cash/xec"]);

export function broadcastTx(tx: string) {
  return chronik.broadcastTx(tx, false);
}

export async function streamUtxos(hash: string, dustValue: number, receiver: (utxo: ScriptUtxo) => void) {
  // start by getting existing utxos
  const response = await chronik.script('p2sh', hash).utxos();
  const utxos = response.utxos;

  // filter out dust utxos, that are not spendable
  //
  // In this context, dust utxos are those that can't be spend with a fee of at
  // least 1 sat/byte because the tx size will be bigger than the value. From
  // an usability point of view, it's better to ommit those than to constantly
  // present rows for which the user can do nothing.
  //
  const notDustFn = (utxo: ScriptUtxo) => BigInt(utxo.value) >= dustValue
  const nonDustutxos = utxos.filter(notDustFn);

  // split non dust utxos into coinbase and standard utxos
  const [coinbaseUtxos, standardUtxos] = split(nonDustutxos, utxo => utxo.isCoinbase);

  // if there are coinbase utxos, get current block height
  let currentHeight = -1;
  if (coinbaseUtxos.length > 0) {
    const blockchainInfo = await chronik.blockchainInfo();
    currentHeight = blockchainInfo.tipHeight;
  }

  // split coinbase utxos into immature/mature
  const [immatureUtxos, matureUtxos] = splitCoinbaseUtxos(coinbaseUtxos, currentHeight);

  // add mature coinbase utxos to list of standard utxos
  matureUtxos.forEach(utxo => standardUtxos.push(utxo));

  // immediately pass all standard utxos to the receiver
  standardUtxos.forEach(receiver);

  // listen for new transactions and blocks
  const state: ListeningState = {
    hash,
    receiver,
    immatureUtxos,
    mempoolTxs: []
  };

  const ws = chronik.ws({
    onMessage: msg => listenUtxos(msg, state)
  });

  await ws.waitForOpen();

  // subscribe to the specific P2SH address
  ws.subscribeToScript('p2sh', hash);
}

function split<T>(values: T[], filter: (v: T) => boolean): T[][] {
  const accumulator = [[] as T[], [] as T[]]
  return values.reduce((acc, v) => {
    acc[filter(v) ? 0 : 1].push(v);
    return acc;
  }, accumulator);
}

function splitCoinbaseUtxos(coinaseUtxos: ScriptUtxo[], currentHeight: number) {
  const immatureFn = (utxo: ScriptUtxo) => utxo.isCoinbase && currentHeight - utxo.blockHeight < 100;
  return split(coinaseUtxos, immatureFn);
}

interface ListeningState {
  receiver: (utxo: ScriptUtxo) => void,
  hash: string,
  immatureUtxos: ScriptUtxo[],
  mempoolTxs: Tx[]
}

function listenUtxos(msg: WsMsgClient, state: ListeningState) {
  switch (msg.type) {
    case 'Tx':
      listenUtxosFromTx(msg, state);
      break;
    case 'Block':
      listenUtxosFromBlock(msg, state);
      break;
    case 'Error':
      console.error("Received error from Chronik:", msg.msg);
      break;
  }
}

function listenUtxosFromTx(msg: MsgTxClient, state: ListeningState) {
  switch (msg.msgType) {
    case 'TX_CONFIRMED':
      // only process confirmed tx if it was not seen before, othwerwise assume
      // that tx will be confirmed on the next block to avoid requesting the
      // details twice
      const seen = state.mempoolTxs.some(tx => tx.txid === msg.txid);
      if (!seen) {
        chronik.tx(msg.txid).then(tx => extractUtxos(tx, state));
      }
      break;
    case 'TX_ADDED_TO_MEMPOOL':
      // process transaction
      chronik.tx(msg.txid).then(tx => {
        // store transaction for later processing on BlockConnected
        state.mempoolTxs.push(tx);

        // extract matching utxos from tx outputs
        extractUtxos(tx, state);
      });
      break;
  }
}

function listenUtxosFromBlock(msg: MsgBlockClient, state: ListeningState) {
  switch (msg.msgType) {
    case 'BLK_CONNECTED':
      // only get current tip, to avoid unecessary details
      chronik.blockchainInfo().then(info => {
        // process stored mempool txs, assuming confirmation
        processMempool(info, state);

        // process previously immature coinbase utxos
        processImmature(info, state);
      });
      break;
  }
}

async function extractUtxos(tx: Tx, state: ListeningState) {
  // filter outputs that match the hash, it may be 0, 1 or many
  tx.outputs.forEach((output, outIdx) => {
    // for P2SH the output script is HASH160 PUSH(20) <hash> EQUAL
    if (output.outputScript !== `a914${state.hash}87`) {
      return;
    }

    // adapt the output to utxo and pass it to the receiver
    state.receiver({
      outpoint: { txid: tx.txid, outIdx: outIdx },
      value: output.value,
      blockHeight: tx.block?.height || -1,
      isCoinbase: tx.isCoinbase,
      isFinal: false
    });
  });
}

function processMempool(info: BlockchainInfo, state: ListeningState) {
  // assume block was found now
  const nowMs = Date.now();
  const timestamp = Math.floor(nowMs / 1000);

  // process all stored transations
  state.mempoolTxs.forEach(tx => {
    // update tx with block info
    tx.block = {
      timestamp,
      hash: info.tipHash,
      height: info.tipHeight
    };

    // re-extract utxos from updated tx
    extractUtxos(tx, state);
  });

  // clear stored mempool
  state.mempoolTxs = [];
}

async function processImmature(info: BlockchainInfo, state: ListeningState) {
  // split previously immature utxos
  const [immatureUtxos, matureUtxos] = splitCoinbaseUtxos(state.immatureUtxos, info.tipHeight);

  // save utxos that are still immature for later
  state.immatureUtxos = immatureUtxos;

  // pass the utxos that are now mature to the receiver
  matureUtxos.forEach(state.receiver);
}
