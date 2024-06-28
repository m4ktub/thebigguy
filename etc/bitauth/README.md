bitauth template
================

The JSON template can be imported to https://ide.bitauth.com/ with the "Import or Restore Template" option. It contains a locking script for a contract with:

* Fee: 2000 sat
* Party 1: ecash:qq28cqs6dx23qh4qucnk9v3l2jt4yr242cxqqnw9kc with a 900 share
* Party 2: ecash:qq830d643lw865u0x7mpc4yzsrvt9peccggju7td2v with a 100 share

The template also contains 4 unlocking scripts, where only the input value varies to cover all cases in the script.

Notes
-----

  * The locking script has `OP_CHECKSIGVERIFY` replaced by `OP_2DROP` for simplicity. That should be the only difference from the internal script.
  * Currently _bitauth_ does not support the XEC VM so the BCH VM 2023 is being used. Having more opcodes available is not particularly problematic but it's important to have in mind that XEC script only supports 32-bit numbers while BCH script supports 64-bit numbers.
