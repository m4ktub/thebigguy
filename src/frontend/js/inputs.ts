import jquery from 'jquery';
import * as xecaddr from 'ecashaddrjs';

function boundShare(reserved: number, value: number) {
  return Math.max(1, Math.min(value, 1000 - reserved));
}

export function mirrorShares(commissionShareSelector: string, allSharesSelector: string) {
  const commission = jquery<HTMLInputElement>(commissionShareSelector);
  const allShares = jquery<HTMLInputElement>(allSharesSelector);

  const mirrorValues = (source: HTMLInputElement) => {
    // get comission vlaue
    let commissionValue = 0;
    const commissionEl = commission.get(0);
    if (commissionEl) {
      commissionValue = commissionEl.valueAsNumber;
    }

    // get and adjust source value
    let value = boundShare(commissionValue + allShares.length - 2, source.valueAsNumber);
    jquery(source).val(value);

    // adjust value of all other shares
    const otherShares = allShares.get().filter(share => share != source && share != commissionEl);
    otherShares.forEach((other, i) => {
      const last = i == otherShares.length - 1;
      if (last) {
        jquery(other).val(1000 - value - commissionValue);
      } else {
        const otherValue = boundShare(commissionValue + value + otherShares.length - i - 1, other.valueAsNumber);
        jquery(other).val(otherValue);
        value += otherValue;
      }
    });
  };

  // bind change on all shares
  allShares.on('change', (event) => mirrorValues(event.target));
}

function validateAddressInput(inputEl: HTMLElement) {
  const input = jquery(inputEl);
  const status = input.nextAll(".validation");

  const validate = () => {
    input.removeClass("valid invalid");
    status.removeClass("valid invalid");

    const value = input.val() as string;
    if (!value.trim()) {
      status.html("");
    } else {
      const valid = xecaddr.isValidCashAddress(value, "ecash");
      input.addClass(valid ? "valid": "invalid");
      status.addClass(valid ? "valid": "invalid");
      input.val(value.toLowerCase().replace("ecash:", ""));
      status.text(valid ? "✅" : "❌");
    }
  };

  input.on("change", validate);
  input.parents("form").on("reset", () => setTimeout(validate));
}

interface ValidateFormOptions {
  addresses: string,
  shares: string,
  fee: string
}

export function validateForm(controls: ValidateFormOptions) {
  // add validation to addresses
  jquery(controls.addresses).get().forEach(validateAddressInput);

  // include validation of others in the submission itself
  jquery(controls.fee).parents("form").on("submit", event => {
    const addresses = jquery(controls.addresses).get()
    const shares = jquery(controls.shares).get();

    const validAddresses = addresses.every(selector => jquery(selector).hasClass("valid"));
    const validShares = shares.every(selector => jquery(selector).val() !== "");
    const validFee = Number(jquery(controls.fee).val()) >= 1250;

    const valid = validAddresses && validShares && validFee;
    if (valid) {
      return true;
    } else {
      event.preventDefault();
      return false;
    }
  });
}
