import jquery from 'jquery';
import * as xecaddr from 'ecashaddrjs';

export function mirrorShares(selector1: string, selector2: string) {
  const share1 = jquery<HTMLInputElement>(selector1);
  const share2 = jquery<HTMLInputElement>(selector2);

  const mirrorValues = (from: JQuery<HTMLInputElement>, to: JQuery<HTMLInputElement>) => {
    const el = from.get(0);
    if (!el) {
      return;
    }

    let value = Math.max(1, Math.min(el.valueAsNumber, 999));
    from.val(value);
    to.val(1000 - value);
  };

  share1.on('change', () => mirrorValues(share1, share2));
  share2.on('change', () => mirrorValues(share2, share1));
}

export function validateAddress(inputSelector: string) {
  const input = jquery(inputSelector);
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
  addresses: string[],
  shares: string[],
  fee: string
}

export function validateForm(controls: ValidateFormOptions) {
  // add validation to addresses
  controls.addresses.forEach(validateAddress);

  // include validation of others in the submission itself
  jquery(controls.fee).parents("form").on("submit", event => {
    const validAddresses = controls.addresses.every(selector => jquery(selector).hasClass("valid"));
    const validShares = controls.shares.every(selector => jquery(selector).val() !== "");
    const validFee = Number(jquery(controls.fee).val()) >= 1007;

    const valid = validAddresses && validShares && validFee;
    if (valid) {
      return true;
    } else {
      event.preventDefault();
      return false;
    }
  });
}
