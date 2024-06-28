import jquery from 'jquery';

export function bool2html(value: boolean) {
  return jquery("<data></data>")
    .attr("value", value.toString())
    .text(value ? "✅" : " ")
    .get(0) as HTMLElement;
}

export function xec2html(value: string | number | bigint) {
  var num = BigInt(value) / BigInt(100);
  var dec = Number(BigInt(value) % BigInt(100));
  var numText = num.toLocaleString();
  var decText = (dec / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return jquery("<data></data>")
    .attr("value", value.toString())
    .text(`${numText}${decText.substring(1)} XEC`)
    .get(0) as HTMLElement;
}

export function addr2html(value: string) {
  const explorerLink = `https://explorer.e.cash/address/${value}`;

  return jquery("<a></a>")
    .attr("href", explorerLink)
    .attr("target", "_blank")
    .text(value)
    .get(0) as HTMLElement;
}

export function share2html(value: string | number) {
  const num = Number(value) / 1000;
  const text = num.toLocaleString(undefined, {
    style: "percent",
    maximumFractionDigits: 2
  });

  return jquery("<data></data>")
    .attr("value", value)
    .text(text)
    .get(0) as HTMLElement;
}

export function blockHeight2html(value: string | number) {
  const num = Number(value);

  if (num < 0) {
    return jquery("<span></span>")
      .text("mempool")
      .get(0) as HTMLElement;
  }
  else {
    const text = num.toLocaleString();
    const data = jquery("<data></data>").attr("value", value).text(text)
    const explorerLink = `https://explorer.e.cash/block-height/${value}`;

    return jquery("<a></a>")
      .attr("href", explorerLink)
      .attr("target", "_blank")
      .html(data[0])
      .get(0) as HTMLElement;
  }
}

export function outpoint2html(txid: string, idx: number) {
  const text = `${txid.substring(0, 8)}...:${idx}`;
  const explorerLink = `https://explorer.e.cash/tx/${txid}`;

  return jquery("<a></a>")
    .attr("href", explorerLink)
    .attr("target", "_blank")
    .text(text)
    .get(0) as HTMLElement;
}

export function txid2html(txid: string) {
  const text = `${txid.substring(0, 8)}...`;
  const explorerLink = `https://explorer.e.cash/tx/${txid}`;

  return jquery("<a></a>")
    .attr("href", explorerLink)
    .attr("target", "_blank")
    .text(text)
    .get(0) as HTMLElement;
}
