import '@jest/globals';
import express from 'express';
import type { Request, Response }  from 'express';

import status from './status';

describe('status endpoint', () => {
  test('expected properties', () => {
    let req: Request = Object.create(express.request);
    let res: Response = Object.create(express.response);

    jest.spyOn(res, 'json').mockReturnValue(res);

    status(req, res);

    expect(jest.mocked(res.json)).toHaveBeenCalled();
    let data = (jest.mocked(res.json).mock.lastCall || [{}])[0];

    expect(data).toHaveProperty("ok");
    expect(data).toHaveProperty("since");
    expect([ true, false ]).toContain(data.ok);
    expect(data.since).toBeInstanceOf(Date);
  });
});
