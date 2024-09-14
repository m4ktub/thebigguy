import * as xecaddr from 'ecashaddrjs';
import jquery from 'jquery';
import type { FeaturesResponse } from '../../backend/features';

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
      commissionValue = Number(commissionEl.value);
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
  commission.on('change', () => mirrorValues(allShares.get(0) as HTMLInputElement))
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
  fee: string,
  commission: {
    address: string,
    share: string
  }
}

function prepareCommissionSubmit(controls: ValidateFormOptions) {
  const commissionAddress = jquery(controls.commission.address);
  const commissionShare = jquery(controls.commission.share);

  if (Number(commissionShare.val()) > 0) {
    commissionAddress.prop('disabled', false);
    commissionShare.prop('disabled', false);
  }
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
      // enable commission if a share was established
      prepareCommissionSubmit(controls);

      // accept form submission
      return true;
    } else {
      // deny form submission
      event.preventDefault();
      return false;
    }
  });
}

interface FeaturesOptions {
  commission: {
    omitted: string,
    address: string,
    share: string
  },
  store: string,
  autospend: string
}

export function features(options: FeaturesOptions) {
  fetch('/api/features')
    .then(res => res.json() as Promise<FeaturesResponse>)
    .then(data => enableFeatures(data, options))
    .catch(_error => disableFeatures(options));
}

function enableFeatures(data: FeaturesResponse, options: FeaturesOptions) {
  // check for a missing address in a successful response
  if (!data.address) {
    disableFeatures(options);
  }

  // proceed with enabling
  const storeShare = data.store;
  const autoSpendShare = data.autospend;
  const storeCheckbox = jquery(options.store);
  const autoSpendCheckbox = jquery(options.autospend);
  const commissionShareInput = jquery(options.commission.share);
  const commissionContainer = jquery(options.commission.omitted);

  // set commission address
  jquery(options.commission.address).val(data.address);

  // enable checkboxes and establish dependencies
  function updateCheckbox(changed: JQuery<HTMLElement>, other: JQuery<HTMLElement>, state: boolean) {
    if (changed.prop('checked') == state) {
      other.prop('checked', state);
    }
  }

  function updateShare() {
    let commission = 0;
    commission += storeCheckbox.prop('checked') ? storeShare : 0;
    commission += autoSpendCheckbox.prop('checked') ? autoSpendShare : 0;

    commissionShareInput.val(commission).trigger('change');
    if (commission > 0) {
      commissionContainer.removeClass("omitted");
    } else {
      commissionContainer.addClass("omitted");
    }
  }

  storeCheckbox.on('change', () => {
    updateCheckbox(storeCheckbox, autoSpendCheckbox, false);
    updateShare();
  });

  autoSpendCheckbox.on('change', () => {
    updateCheckbox(autoSpendCheckbox, storeCheckbox, true);
    updateShare();
  });
}

function disableFeatures(options: FeaturesOptions) {
  jquery(options.store).prop('disabled', true);
  jquery(options.autospend).prop('disabled', true);
}
