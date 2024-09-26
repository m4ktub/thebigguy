import jquery from 'jquery';
import { type P2SHResponse } from '../../backend/p2sh';
import { type TxResponse } from '../../backend/tx';
import { type Utxo, broadcastTx, streamUtxos } from './chronik';
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
    .then(data => maybeAddEmptyRow(options, data));
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

  // if the contract was stored, change location to the short version
  if (data.store) {
    window.history.pushState({}, "", `/h/${data.hash}`);
  }

  return data;
}

async function loadUtxos(options: PageOptions, data: P2SHResponse) {
  // find table and body
  const table = jquery(options.outputs.table);
  const tbody = table.find("tbody");

  // find row template
  const rowSelector = options.outputs.tpl["row"];
  const rowTemplate = jquery(rowSelector);

  // keep count, to clear table on first utxo
  let count = 0;

  // start stream of utxos
  const streaming = streamUtxos(data.hash, data.dustValue, utxo => {
    // update count
    count++;

    // on first utxo, clear existing rows
    if (count == 1) {
      tbody.find("tr").remove();
    }

    // add or update row for utxo
    const rowId = `utxo-${utxo.outpoint.txid}-${utxo.outpoint.outIdx}`;
    addRowTemplate(tbody, rowTemplate, rowId, row => {
      updateRow(options, data, utxo, row);
    });
  });

  // after resolving the initial utxos, make sure we continue with data
  return streaming.then(() => data);
}

function maybeAddEmptyRow(options: PageOptions, _data: P2SHResponse) {
  // find table and body
  const table = jquery(options.outputs.table);
  const tbody = table.find("tbody");

  // check for added utxo rows
  const hasOutpoints = tbody.find("tr[data-id]:first").length > 0;
  if (hasOutpoints) {
    // skip any changes
    return;
  }

  // remove any existing placeholder rows
  tbody.find("tr").remove();

  // add the empty template
  const emptySelector = options.outputs.tpl["empty"];
  addRowTemplate(tbody, jquery(emptySelector));
}

function addRowTemplate(
  tbody: JQuery<HTMLTableSectionElement>,
  rowTemplate: JQuery<HTMLElement>,
  rowId?: string,
  updater?: (row: JQuery<Node>) => void
) {
  let row: JQuery<Node> | undefined = undefined;
  let newRow = false;

  // if row id is provided, try to find existing
  if (rowId) {
    row = tbody.find(`tr[data-id='${rowId}']`);
  }

  // if not found, create new row from template
  if (!row?.length) {
    // check template node is valid
    const tplNode = rowTemplate.get(0);
    if (!(tplNode instanceof HTMLTemplateElement)) {
      throw new Error("Row template is not a template element");
    }

    // clone template
    row = jquery(tplNode.content.cloneNode(true));
    newRow = true;

    // set row id, if provided
    if (rowId) {
      // find the row element because the clone contains fragments
      row.find("tr").attr("data-id", rowId);
    }
  }

  // execute row update function, if provided
  if (updater) {
    updater(row);
  }

  // add row to table, if new
  if (newRow) {
    row.appendTo(tbody);
  }
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
