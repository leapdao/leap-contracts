#!/usr/bin/env bash

accounts=(
  --account="0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f,990000000000000000000"
  --account="0x7bc8feb5e1ce2927480de19d8bc1dc6874678c016ae53a2eec6a6e9df717bfac,1000000000000000000000000"
  --account="0x94890218f2b0d04296f30aeafd13655eba4c5bbf1770273276fee52cbe3f2cb4,1000000000000000000000000"
  --account="0x12340218f2b0d04296f30aeafd13655eba4c5bbf1770273276fee52cbe3f2cb4,1000000000000000000000000"
)

./node_modules/.bin/testrpc-sc -p 8555 -g 0x01 -l 0xfffffffffffff "${accounts[@]}" > /dev/null &
pid=$!
./node_modules/.bin/solidity-coverage
kill $pid
exit 0
