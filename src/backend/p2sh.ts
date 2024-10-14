import { Ecc, shaRmd160, toHex } from 'ecash-lib';
import * as xecaddr from 'ecashaddrjs';
import type { NextFunction, Request, Response } from 'express';
import { PRV_KEY } from './constants';
import { type Party, createScript, minUnitForAllShares } from './contract/script';
import { createTx } from './contract/tx';
import { type DbContract, storeContract } from './database';
import { getSettings } from './settings';
import { queryContract, queryFeatures } from './query';

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

    // validate and extract parameters
    const { fee, parties } = queryContract(req);
    const requestedFeatures = queryFeatures(req);
    const requestedStore = requestedFeatures.includes("store");
    const requestedAutoSpend = requestedFeatures.includes("autospend");

    // validate features, if requested
    if (requestedFeatures.length > 0) {
        const features = getSettings();
        if (!features.address) {
            throw new Error("Features were requested but the server does not support features.");
        }

        const serverParty = parties.find(party => party.address === features.address);
        if (!serverParty) {
            throw new Error("Features were requested but the server was not included as a party.");
        }

        let expectedShare = 0;
        expectedShare += requestedStore ? features.store : 0;
        expectedShare += requestedAutoSpend ? features.autospend : 0;
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

    // prepare response, which also validates contract bounds
    const response = prepareP2SHResponse(ecc, contract);

    // setup async response for database chaining
    let async: Promise<any> = Promise.resolve();

    // store contract, if requested
    if (requestedStore) {
        async = storeContract(contract);
    }

    // send JSON response and route exception
    async.then(() => res.json(response)).catch(next);
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
