import { Ecc, shaRmd160, toHex } from 'ecash-lib';
import * as xecaddr from 'ecashaddrjs';
import type { NextFunction, Request, Response } from 'express';
import { createScript, createTx, minUnitForAllShares, type Party } from 'thebigguy-contract';
import { PRV_KEY } from './constants';
import { type DbContract, storeContract } from './database';
import { queryContract, queryFeatures } from './query';
import { getSettings, type SettingsResponse } from './settings';

const NULL_TXID = '0000000000000000000000000000000000000000000000000000000000000000';

export interface P2SHResponse {
    address: string;
    hash: string;
    fee: number;
    dustValue: number;
    minValue: number;
    maxValue: number;
    parties: Party[];
    store: boolean;
    autoSpend: boolean;
}

export default function p2sh(req: Request, res: Response, next: NextFunction) {
    // create Ecc instance
    const ecc = new Ecc();

    // prepare response, which also validates contract bounds
    const settings = getSettings();
    const response = p2shInternal(ecc, settings, req.query);

    // setup async response for database chaining
    let async: Promise<any> = Promise.resolve();

    // store contract, if requested
    if (response.store) {
        async = storeContract(response as DbContract);
    }

    // send JSON response and route exception
    async.then(() => res.json(response)).catch(next);
}

export function p2shInternal(ecc: Ecc, settings: SettingsResponse, query: Record<string, any>) {
    // validate and extract parameters
    const { fee, parties } = queryContract(query);
    const requestedFeatures = queryFeatures(query);

    // validate features, if requested
    const requestedStore = requestedFeatures.includes("store");
    const requestedAutoSpend = requestedFeatures.includes("autospend");

    if (requestedFeatures.length > 0) {
        if (!settings.address) {
            throw new Error("Features were requested but the server does not support features.");
        }

        const serverParty = parties.find(party => party.address === settings.address);
        if (!serverParty) {
            throw new Error("Features were requested but the server was not included as a party.");
        }

        let expectedShare = 0;
        expectedShare += requestedStore ? settings.store : 0;
        expectedShare += requestedAutoSpend ? settings.autospend : 0;
        if (serverParty.share != expectedShare) {
            throw new Error("Features were requested but the server was not assigned the expected share.");
        }
    }

    // build contract
    const contractScript = createScript(ecc, PRV_KEY, fee, parties);
    const contractHash = shaRmd160(contractScript.bytecode);
    const contractHashHex = toHex(contractHash);
    const contractAddress = xecaddr.encode("ecash", "P2SH", contractHash);

    const contract: DbContract = {
        address: contractAddress,
        hash: contractHashHex,
        fee,
        parties,
        store: requestedStore,
        autoSpend: requestedAutoSpend
    };

    return prepareP2SHResponse(ecc, contract);
}

export function prepareP2SHResponse(ecc: Ecc, contract: DbContract): P2SHResponse {
    const fee = contract.fee;
    const parties = contract.parties;

    // calculate the minimum value that can still produce at least one share
    const minUnit = minUnitForAllShares(parties);
    const minValue = 1000 * minUnit + fee;

    // calculate the value below which a 1 sat/byte fee cannot be achieved
    // the txid does not affect size and value could be any number below minValue
    const fakeUtxo = { txid: NULL_TXID, outIdx: 0, value: fee };
    const fakeTx = createTx(ecc, PRV_KEY, fakeUtxo, fee, parties);
    const dustValue = fakeTx.serSize();

    return {
        ...contract,
        dustValue,
        minValue,
        maxValue: 0x7fffffff,
    };
}
