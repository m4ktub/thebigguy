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

Deploying
---------

The application can be deployed ExpressJS being used directly as web server. That may require the setup of HTTPS certificates and running NodeJS with a privileged user so that it can open the HTTP/HTTPS ports.

### Service

The `etc/systemd` folder contains templates that can be used on a standard Ubuntu system. The `tbg.service` file provides a simple  _systemd_ service unit that launches the server and restarts on failure. The `env.conf` file provides a template for the environment variables that control the service. 

| Variable             | Description |
| -------------------- | ------------- |
| `PORT`               |  The HTTP port to use or `3000` if not specified. |
| `HTTPS_PORT`         |  The HTTPS port to use. When specified the `HTTPS_KEY` and `HTTPS_CERT` must also be specified. |
| `LOG_ACCESS_FILE`    |  The path to the HTTP access log. If specified the server will log requests in Apache's combined format. |
| `HTTPS_KEY`          |  The path to private key to the HTTPS certificate. |
| `HTTPS_CERT`         |  The path to the HTTPS certificate for the host. |
| `DATABASE_PATH`      |  The path to the SQLite database file or `dist/etc/database`, if not specified. The database will be created automatically. |
| `COMMISSION_ADDRESS` |  The XEC address for the application's commission address. If not specified then features that require persistence will not be active. When specified, this address will be added as an extra party to the contract. |

### Autospend

The `tbg-autospend.timer` and `tbg-autospend.service` also provide templates for _systemd_ units that automatically run a script to process auto spend contracts. The script connects to Chronik service so firewalls should not prevent those external connections.

By default the timer triggers every 10 minutes meaning that all contracts should be processed in less time. The same `env.conf` file can be used for the location of the database file. If the timer is not installed, the auto-spend script can also be run manually with:

```bash
export DATABASE_PATH=/home/ubuntu/data/contracts.db
npx ts-node /home/ubuntu/thebigguy/scripts/autospend.ts
```
