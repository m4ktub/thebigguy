import jquery from 'jquery';
import { type P2SHResponse } from '../../backend/p2sh';
import { type TxResponse } from '../../backend/tx';
import { type Utxo, scriptUtxos, broadcastTx } from './chronik';
import { addr2html, blockHeight2html, bool2html, outpoint2html, share2html, txid2html, xec2html } from './format';

interface PageOptions {
  details: DetailsSelectors;
  outputs: OutputsSelectors;
}

interface DetailsSelectors {
  contractAddress: string;
  party1Address: string;
  party2Address: string;
  party1Share: string;
  party2Share: string;
  fee: string;
}

interface OutputsSelectors {
  table: string;
  tpl: Record<string, string>;
}

export function load(options: PageOptions) {
  return fetch(`/api/p2sh${location.search}`)
    .then(res => res.json() as Promise<P2SHResponse>)
    .then(data => updateDetails(options, data))
    .then(data => loadUtxos(options, data))
    .then(data => addOutputRows(options, data.p2sh, data.utxos));
}

function addOutputRows(options: PageOptions, data: P2SHResponse, utxos: Utxo[]) {
  // find table
  const table = jquery(options.outputs.table);
  const tbody = table.find("tbody");

  // remove existing rows
  tbody.find("tr").remove();

  // filter out dust utxos
  //
  // In this context, dust utxos are those that can't be spend with a fee of at
  // least 1 sat/byte because the tx size will be bigger than the value. From
  // an usability point of view, it's better to ommit those than to constantly
  // present rows for which the user can do nothing.
  //
  const filteredUtxos = utxos.filter(utxo => BigInt(utxo.value) < data.dustValue);

  // find template row
  const tplName = filteredUtxos.length == 0 ? "empty" : "row";
  const tplNode = jquery(options.outputs.tpl[tplName]).get(0);
  if (!(tplNode instanceof HTMLTemplateElement)) {
    return;
  }

  // add rows to table
  if (filteredUtxos.length == 0) {
    jquery(tplNode.content.cloneNode(true)).appendTo(tbody);
  }
  else {
    filteredUtxos.forEach(utxo => {
      const newRow = jquery(tplNode.content.cloneNode(true));
      updateRow(options, data, utxo, newRow);

      newRow.appendTo(tbody);
    });
  }
}

function updateDetails(options: PageOptions, data: P2SHResponse) {
  const feeEl = jquery(options.details.fee);
  const party1AddressEl = jquery(options.details.party1Address);
  const party1ShareEl = jquery(options.details.party1Share);
  const party2AddressEl = jquery(options.details.party2Address);
  const party2ShareEl = jquery(options.details.party2Share);
  const contractAddressEl = jquery(options.details.contractAddress);

  feeEl.html(xec2html(data.fee));
  party1AddressEl.html(addr2html(data.parties[0].address));
  party1ShareEl.html(share2html(data.parties[0].share));
  party2AddressEl.html(addr2html(data.parties[1].address));
  party2ShareEl.html(share2html(data.parties[1].share));
  contractAddressEl.html(addr2html(data.address));

  return data;
}

function loadUtxos(_options: PageOptions, data: P2SHResponse) {
  return scriptUtxos(data.hash)
    .then(scriptUtxos => {
      return {
        utxos: scriptUtxos.flatMap(su => su.utxos),
        p2sh: data
      };
    });
}

function updateRow(_options: PageOptions, data: P2SHResponse, utxo: Utxo, row: JQuery<Node>) {
  // update values
  row.find(".value.block").html(blockHeight2html(utxo.blockHeight));
  row.find(".value.coinbase").html(bool2html(utxo.isCoinbase));
  row.find(".value.outpoint").html(outpoint2html(utxo.outpoint.txid, utxo.outpoint.outIdx));
  row.find(".value.xec").html(xec2html(utxo.value));

  // update value class, button, note based on value
  if (BigInt(utxo.value) < data.minValue) {
    row.find(".value.xec").addClass("small");
    row.find(".button button").text("Burn");
    row.find(".button .note").text("The value is too small to distribute. Spend the output and let miners get the fees.");
  } else if (BigInt(utxo.value) <= data.maxValue) {
    row.find(".value.xec").addClass("normal");
    row.find('.button button').text("Distribute")
    row.find('.button .note').text("Distribute the value according to each party's share.");
  } else {
    row.find(".value.xec").addClass("big");
    row.find('.button button').text("Split");
    row.find('.button .note').text("The value is too large to distribute directly. Split the value in half.");
  }

  // arm click handler, if the button is not disabled
  if (!row.find(".button button").prop("disabled")) {
    row.find(".button button").on("click", (event) => processUtxo(event, data, utxo));
  }
}

function processUtxo(event: JQuery.ClickEvent, _data: P2SHResponse, utxo: Utxo) {
  // prevent actual click
  event.preventDefault();

  // get elements
  const button = jquery(event.target);
  const td = button.parents('td').first();
  const spinner = td.find(".spinner-ready");
  const note = td.find(".note");

  // set processing status
  button.prop("disabled", true);
  spinner.addClass("spinner");
  note.text("Processing...");

  // build tx creation parameters
  const params = new URLSearchParams(location.search);
  params.append("utxo", `${utxo.outpoint.txid}:${utxo.outpoint.outIdx}`);
  params.append("value", utxo.value);

  // create and broadcast transaction
  return fetch(`/api/tx?${params.toString()}`)
    .then(res => res.json() as Promise<TxResponse>)
    .then(data => broadcastTx(data.tx))
    .then(data => {
      td.html(txid2html(data.txid));
    });
}
