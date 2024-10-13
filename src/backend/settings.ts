import type { Request, Response } from 'express';

export interface ChronikSettings {
    urls: string[]
}

export interface SettingsResponse {
    address?: string,
    autospend: number,
    store: number,
    chronik: ChronikSettings
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

function toList(value: string | undefined, def: string[]) {
    if (!value) {
        return def;
    }

    const isBlank = value.trim().length == 0;
    if (isBlank) {
        return def;
    }

    return value.split(",").map(s => s.trim());
}

export function getSettings(): SettingsResponse {
    return {
        address: withPrefix(process.env.COMMISSION_ADDRESS),
        store: toShare(process.env.COMMISSION_STORE, 5),
        autospend: toShare(process.env.COMMISSION_AUTOSPEND, 20),
        chronik: {
            urls: toList(process.env.CHRONIK_URLS, [
                'https://chronik.pay2stay.com/xec2',
                'https://chronik-native1.fabien.cash',
                'https://chronik-native2.fabien.cash',
            ])
        }
    };
}

export default function settings(_req: Request, res: Response) {
    res.json(getSettings());
}
