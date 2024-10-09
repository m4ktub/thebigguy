import { expect } from 'expect';
import { Request, Response } from 'express';
import * as sinon from 'sinon';
import status from './status';

describe('status endpoint', () => {
  it('expected properties', () => {
    let req = {} as Request;
    let res = {} as Response;

    const stub = res.json = sinon.stub();

    status(req, res);

    expect(stub.calledOnce).toBe(true);
    let data = stub.lastCall.firstArg || {};

    expect(data).toHaveProperty("ok");
    expect(data).toHaveProperty("since");
    expect([ true, false ]).toContain(data.ok);
    expect(data.since).toBeInstanceOf(Date);
  });
});
