import type { Request, Response } from 'express';

export interface FeaturesResponse {
    address: string,
    autospend: number,
    store: number
}

function removePrefix(value: string | undefined) {
    if (!value) {
        return undefined;
    }

    if (value.startsWith("ecash:")) {
        return value.substring(6);
    }

    return value;
}

function toShare(value: string | undefined, def: number) {
    return Number(value || def);
}

export default function features(_req: Request, res: Response) {
    res.json({
        address: removePrefix(process.env.COMMISSION_ADDRESS),
        store: toShare(process.env.COMMISSION_STORE, 5),
        autospend: toShare(process.env.COMMISSION_AUTOSPEND, 20)
    } as FeaturesResponse);
}
