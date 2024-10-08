import type { Request, Response } from 'express';

export interface FeaturesResponse {
    address?: string,
    autospend: number,
    store: number
}

function withPrefix(value: string | undefined) {
    if (!value) {
        return undefined;
    }

    const prefix = value.startsWith("ecash:") ? "" : "ecash:";
    return prefix + value;
}

function toShare(value: string | undefined, def: number) {
    return Number(value || def);
}

export function getFeatures(): FeaturesResponse {
    return {
        address: withPrefix(process.env.COMMISSION_ADDRESS),
        store: toShare(process.env.COMMISSION_STORE, 5),
        autospend: toShare(process.env.COMMISSION_AUTOSPEND, 20)
    };
}

export default function features(_req: Request, res: Response) {
    res.json(getFeatures());
}
