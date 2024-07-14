import { Ecc, shaRmd160, toHex } from 'ecash-lib';
import * as xecaddr from 'ecashaddrjs';
import type { Request, Response } from 'express';
import { PRV_KEY } from './constants';
import { type Party, createScript, minUnitForAllShares } from './contract/script';
import { createTx } from './contract/tx';
import { queryContract } from './query';

const NULL_TXID = '0000000000000000000000000000000000000000000000000000000000000000';

export interface P2SHResponse {
    address: string;
    hash: string;
    fee: number;
    dustValue: number;
    minValue: number;
    maxValue: number;
    parties: Party[];
}

export default function p2sh(req: Request, res: Response) {
    // validate and extract parameters
    const { fee, parties } = queryContract(req);

    // build contract
    const contract = createScript(PRV_KEY, fee, parties);
    const contractHash = shaRmd160(contract.bytecode);
    const contractAddress = xecaddr.encode("ecash", "P2SH", contractHash);

    // calculate the minimum value that can still produce at least one share
    const minUnit = minUnitForAllShares(parties);
    const minValue = 1000 * minUnit + fee;

    // calculate the value below which a 1 sat/byte fee cannot be achieved
    // the txid does not affect size and value could be any number below minValue
    const fakeUtxo = { txid: NULL_TXID, outIdx: 0, value: fee };
    const fakeTx = createTx(new Ecc(), PRV_KEY, fakeUtxo, fee, parties);
    const dustValue = fakeTx.serSize();

    // send response
    res.json({
        address: contractAddress,
        hash: toHex(contractHash),
        fee,
        parties,
        dustValue,
        minValue,
        maxValue: 0x7fffffff
    } as P2SHResponse);
}
