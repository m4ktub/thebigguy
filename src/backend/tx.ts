import { Ecc, toHex } from 'ecash-lib';
import type { Request, Response } from 'express';
import { PRV_KEY } from './constants';
import { createTx } from './contract/tx';
import { queryContract, queryUtxo } from './query';

export interface TxResponse {
    tx: string
}

export default function tx(req: Request, res: Response) {
    // validate and extract parameters
    const { fee, parties } = queryContract(req);
    const utxo = queryUtxo(req);

    // build transaction
    const ecc = new Ecc();
    const tx = createTx(ecc, PRV_KEY, utxo, fee, parties);

    // send response
    res.json({
        tx: toHex(tx.ser())
    } as TxResponse);
}
