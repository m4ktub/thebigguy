import { Ecc, toHex } from 'ecash-lib';
import type { Request, Response } from 'express';
import { PRV_KEY } from './constants';
import { createTx } from 'thebigguy-contract';
import { queryContract, queryUtxo } from './query';

export interface TxResponse {
    tx: string
}

export default function tx(req: Request, res: Response) {
    const ecc = new Ecc();

    // build transaction
    const tx = txInternal(ecc, req.query);

    // send response
    res.json(tx);
}

export function txInternal(ecc: Ecc, query: Record<string, any>): TxResponse {
    // validate and extract parameters
    const { fee, parties } = queryContract(query);
    const utxo = queryUtxo(query);

    // build transaction
    const tx = createTx(ecc, PRV_KEY, utxo, fee, parties);

    return { tx: toHex(tx.ser()) } as TxResponse;
}
