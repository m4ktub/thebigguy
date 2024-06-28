import { shaRmd160, toHex } from 'ecash-lib';
import * as xecaddr from 'ecashaddrjs';
import type { Request, Response } from 'express';
import { PRV_KEY } from './constants';
import { type Party, createScript, minUnitForAllShares } from './contract/script';
import { queryContract } from './query';

export interface P2SHResponse {
    address: string;
    hash: string;
    fee: number;
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

    // send response
    res.json({
        address: contractAddress,
        hash: toHex(contractHash),
        fee,
        parties,
        minValue,
        maxValue: 0x7fffffff
    } as P2SHResponse);
}
