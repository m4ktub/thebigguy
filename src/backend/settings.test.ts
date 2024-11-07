import { expect } from 'expect';
import { Request, Response } from 'express';
import * as sinon from 'sinon';
import settings from './settings';

function invokeHandler() {
  // stubs
  let req = {} as Request;
  let res = {} as Response;
  const stub = res.json = sinon.stub();

  // invoke handler
  settings(req, res);

  // extract data
  expect(stub.calledOnce).toBe(true);
  return stub.lastCall.firstArg || {};
}

describe('settings endpoint', () => {
  it('returns expected properties', () => {
    // reset environment
    process.env["COMMISSION_ADDRESS"] = undefined;
    process.env["COMMISSION_STORE"] = undefined;
    process.env["COMMISSION_AUTOSPEND"] = undefined;
    process.env["CHRONIK_URLS"] = undefined;

    // invoke
    const data = invokeHandler();

    // validate
    expect(data).toHaveProperty("address");
    expect(data).toHaveProperty("store");
    expect(data).toHaveProperty("autospend");
    expect(data).toHaveProperty("chronik");
    expect(data.chronik).toHaveProperty("urls");
  });

  it('uses environment variables', () => {
    // set test environment
    process.env["COMMISSION_ADDRESS"] = "qp95zyxgtk9468wy6c5sl9t0xzrr500rlvwu4qj4yz";
    process.env["COMMISSION_STORE"] = "100";
    process.env["COMMISSION_AUTOSPEND"] = "101";
    process.env["CHRONIK_URLS"] = "https://a.ws,https://b.ws/";

    // invoke
    const data = invokeHandler();

    // validate
    expect(data.address).toBe("ecash:qp95zyxgtk9468wy6c5sl9t0xzrr500rlvwu4qj4yz");
    expect(data.store).toBe(100);
    expect(data.autospend).toBe(101);
    expect(data.chronik.urls).toStrictEqual(["https://a.ws", "https://b.ws/"]);
  });
});
