import { Ecc, initWasm } from 'ecash-lib';
import jquery from 'jquery';
import { p2shInternal, type P2SHResponse } from '../../backend/p2sh';
import { getSettingsBrowser, type SettingsResponse } from '../../backend/settings';
import { txInternal } from '../../backend/tx';
import { broadcastTx, streamUtxos, type ScriptUtxo } from './chronik';
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
  commission: string;
}

interface OutputsSelectors {
  table: string;
  tpl: Record<string, string>;
}

export function load(options: PageOptions) {
  // convert search query into record
  const query = queryFrom(new URLSearchParams(location.search));

  // chain details with loading of utxos
  const settings = getSettingsBrowser();
  return initWasm()
    .then(() => p2shInternal(new Ecc(), settings, query))
    .then(data => updateDetails(options, data))
    .then(data => loadUtxos(options, settings, data))
    .then(data => maybeAddEmptyRow(options, data));
}

function queryFrom(params: URLSearchParams) {
  const query: Record<string, any> = {};
  for (const [key, value] of params.entries()) {
    query[key] = value;
  }

  return query;
}

async function updateDetails(options: PageOptions, data: P2SHResponse) {
  // get elements
  const feeEl = jquery(options.details.fee);
  const party1AddressEl = jquery(options.details.party1Address);
  const party1ShareEl = jquery(options.details.party1Share);
  const party2AddressEl = jquery(options.details.party2Address);
  const party2ShareEl = jquery(options.details.party2Share);
  const contractAddressEl = jquery(options.details.contractAddress);

  // set values
  feeEl.html(xec2html(data.fee));
  party1AddressEl.html(addr2html(data.parties[0].address));
  party1ShareEl.html(share2html(data.parties[0].share));
  party2AddressEl.html(addr2html(data.parties[1].address));
  party2ShareEl.html(share2html(data.parties[1].share));
  contractAddressEl.html(addr2html(data.address));

  return data;
}

async function loadUtxos(options: PageOptions, settings: SettingsResponse, data: P2SHResponse) {
  // find table and body
  const table = jquery(options.outputs.table);
  const tbody = table.find("tbody");

  // find row template
  const rowSelector = options.outputs.tpl["row"];
  const rowTemplate = jquery(rowSelector);

  // keep count, to clear table on first utxo
  let count = 0;

  // start stream of utxos
  const streaming = streamUtxos(settings.chronik.urls, data.hash, data.dustValue, utxo => {
    // update count
    count++;

    // on first utxo, clear existing rows
    if (count == 1) {
      tbody.find("tr").remove();
    }

    // add or update row for utxo
    const rowId = `utxo-${utxo.outpoint.txid}-${utxo.outpoint.outIdx}`;
    addRowTemplate(tbody, rowTemplate, rowId, row => {
      updateRow(options, settings, data, utxo, row);
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

function updateRow(_options: PageOptions, settings: SettingsResponse, data: P2SHResponse, utxo: ScriptUtxo, row: JQuery<Node>) {
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
    row.find(".button button").on("click", (event) => processUtxo(event, settings, data, utxo));
  }
}

function processUtxo(event: JQuery.ClickEvent, settings: SettingsResponse, data: P2SHResponse, utxo: ScriptUtxo) {
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
  const params = new URLSearchParams();
  params.set("utxo", `${utxo.outpoint.txid}:${utxo.outpoint.outIdx}`);
  params.set("value", utxo.value.toString());
  params.set("fee", data.fee.toString());
  data.parties.forEach((party, i) => {
    const n = party.address === settings.address ? 0 : i + 1;
    params.set(`address${n}`, party.address);
    params.set(`share${n}`, party.share.toString());
  });

  // create and broadcast transaction
  const ecc = new Ecc();
  const query = queryFrom(params);

  return Promise.resolve(txInternal(ecc, query))
    .then(data => broadcastTx(data.tx))
    .then(data => {
      td.html(txid2html(data.txid));
    });
}
