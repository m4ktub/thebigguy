import * as xecaddr from 'ecashaddrjs';
import type { Request } from 'express';
import type { Party } from 'thebigguy-contract';

function queryParty(req: Request, i: number): Party | null {
    const queryAddress = req.query[`address${i}`];
    const queryShare = req.query[`share${i}`];

    if (!queryAddress || !queryShare) {
        return null;
    }

    const { prefix, type, hash } = xecaddr.decode(queryAddress.toString(), false);
    if (prefix !== "ecash") {
        throw new Error("All addresses must be valid ecash addresses");
    }

    const parsedShare = Number(queryShare.toString());
    if (isNaN(parsedShare) || parsedShare < 1 || parsedShare > 999) {
        throw new Error("All shares must be integer numbers between 1 and 999");
    }

    return {
        address: xecaddr.encode(prefix, type, hash),
        share: parsedShare
    };
}

export function queryContract(req: Request) {
    // validate fee
    const queryFee = req.query.fee;
    if (!queryFee) {
        throw new Error("The fee parameter must be specified");
    }

    const fee = Number(queryFee.toString());
    if (isNaN(fee) || fee < 1200) {
        throw new Error("The specified fee is invalid or too low");
    }

    if (fee > 100000) {
        throw new Error("The specified fee is too high");
    }

    // validate and accumulate parties, commission at the end
    let parties = [1, 2, 0].map(i => queryParty(req, i)).filter(p => p != null);

    // validate number of parties
    if (parties.length < 2 || parties.length > 3) {
        throw new Error("Must only provide 2 or 3 addresses for the contract");
    }

    // result
    return { fee, parties };
}

export function queryUtxo(req: Request) {
    // validate utxo
    const queryUtxo = req.query.utxo;
    if (!queryUtxo) {
        throw new Error("The utxo parameter must be specified");
    }

    const queryUtxoParts = queryUtxo.toString().split(":");
    if (queryUtxoParts.length != 2) {
        throw new Error("The utxo parameter must \"<txid>:<number>\"");
    }

    const parsedTxId = queryUtxoParts[0];
    if (!parsedTxId.match(/^[0-9a-f]{64}$/i)) {
        throw new Error(`Invalid txid in utxo, given "${queryUtxoParts[0]}"`);
    }

    const parsedOutIdx = Number(queryUtxoParts[1]);
    if (isNaN(parsedOutIdx) || parsedOutIdx < 0) {
        throw new Error(`Invalid ouptut index in utxo, given "${queryUtxoParts[1]}"`);
    }

    // validate value
    const queryValue = req.query.value;
    if (!queryValue) {
        throw new Error("The value parameter must be specified");
    }

    if (!queryValue.toString().match(/^\d+$/)) {
        throw new Error(`Invalid value specified, given "${queryValue}"`);
    }

    const parsedValue = Number(queryValue.toString());

    // result
    return {
        txid: parsedTxId,
        outIdx: parsedOutIdx,
        value: parsedValue
    };
}

export function queryFeatures(req: Request) {
    var features: string[] = [];

    const enabled = req.query['enable'];
    if (!enabled) {
        return features;
    }

    if (typeof enabled == "string") {
        features.push(enabled);
    } else if (Array.isArray(enabled) && enabled.every(o => typeof o == "string")) {
        enabled.forEach(s => features.push(s));
    }

    return features;
}
