import jquery from 'jquery';

export function rotate(areaSelector: string, feeSelector: string, intervalSec: number) {
  window.setInterval(() => {
    const fee = Number(jquery(feeSelector).val());
    jquery(areaSelector).html(generate(fee));
  }, intervalSec * 1000);
}

function generate(fee: number) {
  const value = Math.floor(Math.random() * 9_750_000 + 250_000);
  const share1 = Math.floor(Math.random() * 50 + 50);
  const share2 = 100 - share1;

  const unit = Math.floor((value - fee) / 1000);
  const aliceValue = share1 * 10 * unit;
  const bobValue = share2 * 10 * unit;

  return `When <span class="value xec">${formatNumber(value)} XEC</span> is received, Alice
          knows she will get <span class="value xec">${formatNumber(aliceValue)} XEC</span>
          for her <span class="value xec">${share1}%</span> share, and Bob is sure he will
          get <span class="value">${formatNumber(bobValue)} XEC</span>.`;
}

function formatNumber(n: number) {
  if (n == 0) {
    return "0";
  }

  let groups: string[] = [];
  while (n > 0) {
    groups.unshift(String(n % 1000));
    n = Math.floor(n / 1000);
  }

  return groups.map((s, i) => i == 0 ? s : ("000" + s).substring(s.length)).join(" ");
}
