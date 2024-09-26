import type { NextFunction, Request, Response } from 'express';
import { DbContract, loadContract } from './database';

export default function hash(req: Request, res: Response, next: NextFunction) {
    // load contract
    loadContract(req.params.hash)
        // handle result
        .then(contract => redirect(contract, res))
        // ensure async exceptions are routed
        .catch(next);
}

function redirect(contract: DbContract | undefined, res: Response) {
    if (!contract) {
        // redirect to index on missing contract
        res.redirect('/');
    } else {
        // compute management query parameters
        const query = computeManageParams(contract);

        // redirect to manage page with parameters
        res.redirect(`/manage/?${query.toString()}`);
    }
}

function computeManageParams(contract: DbContract) {
    const query = new URLSearchParams();

    // add fixed elements
    query.set('fee', contract.fee.toString());

    // add enabled features
    query.append('enable', 'store');
    if (contract.autoSpend) {
        query.append('enable', 'autospend');
    }

    // add addresses and shares
    contract.parties.forEach((p, i) => {
        // The commission address will always be the last element and needs
        // to be address and share number 0. By adding 1 modulus the length
        // we will get 1, 2, 3, ..., 0.
        const num = (i + 1) % contract.parties.length;
        query.set(`address${num}`, removePrefix(p.address));
        query.set(`share${num}`, p.share.toString());
    });

    // return parameters
    return query;
}

function removePrefix(address: string) {
    if (address.startsWith("ecash:")) {
        return address.substring(6);
    } else {
        return address;
    }
}
