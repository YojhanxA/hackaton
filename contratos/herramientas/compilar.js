const solc = require('solc'), fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.argv[2], 'utf8');
const input = { language: 'Solidity', sources: { 'TrazaAnclaje.sol': { content: src } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.methodIdentifiers'] } } } };
const out = JSON.parse(solc.compile(JSON.stringify(input)));
(out.errors || []).forEach(e => console.log(e.severity, e.formattedMessage));
const c = out.contracts['TrazaAnclaje.sol'].TrazaAnclaje;
fs.writeFileSync(process.argv[3], JSON.stringify({ contrato: 'TrazaAnclaje', compilador: 'solc ' + solc.version(), evmVersion: 'paris', optimizador: 200, abi: c.abi, bytecode: '0x' + c.evm.bytecode.object }, null, 2));
console.log(c.evm.methodIdentifiers);
console.log('bytecode bytes', c.evm.bytecode.object.length / 2);
