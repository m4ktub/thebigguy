The Big Guy
===========

An application built on Node.js and Express that makes it easy for people to generate P2SH addresses that enforce a proportional distribution of coins. Payments to the address can only be spent when the value is sent to specific target addresses and in an assigned proportion. For example, if 100.00 XEC are received, a fee of 12.00 XEC is deducted, and then 90% (72.00 XEC) is transferred to one address and 10% (8.00 XEC) to another. The missing 8.00 XEC are explained by the use of integer math and the use of $1/1000$ units to allow shares from 0.1% to 99.9%.

Running
-------

The website can be run locally without any extra dependencies besides internet connection to download packages and contact the  Chronik server. The usual commands apply:

  * `npm install`
  * `npm run build`
  * `npm run start`

The server can be reached at http://localhost:3000 as will be shown in the console.

Testing
-------

The standard target of `npm run test` will run two kinds of tests:

 * `test:src`: unit tests that are standalone and can be run any time;
 * `test:rpc`: a script that connects to a local `bitcoind`, in`regtest` mode, through `RPC`;

Each of those individual targets can be run separately, which can be useful if a local node is not running. Otherwise, before launching the tests, you need to run:

```
$> bitcoind -regtest -rpcuser=rpcuser -rpcpassword=rpcpass
```
