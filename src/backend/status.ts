import type { Request, Response } from 'express';

export default function status(req: Request, res: Response) {
    res.json({ ok: true, since: new Date(Date.now() - process.uptime() * 1000) });
}
