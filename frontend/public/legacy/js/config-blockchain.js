/* =========================================================
   Traza Educativa · CONFIGURACIÓN DE LA BLOCKCHAIN
   Todo lo de la red está aquí y en ningún otro archivo.
   Después de desplegar el contrato, pega su dirección en `contrato`.
   ========================================================= */
window.TRAZA_RED = {
  nombre: 'Polygon Amoy',
  tipo: 'red de prueba',
  chainId: 80002,
  rpc: 'https://rpc-amoy.polygon.technology',
  explorador: 'https://amoy.polygonscan.com',
  moneda: { name: 'POL', symbol: 'POL', decimals: 18 },
  contrato: ''   // ← dirección del contrato TrazaAnclaje, p. ej. '0x1234…abcd'
};

/* Para usar Ethereum Sepolia en lugar de Polygon Amoy, reemplaza el bloque anterior por:
window.TRAZA_RED = {
  nombre: 'Ethereum Sepolia', tipo: 'red de prueba', chainId: 11155111,
  rpc: 'https://ethereum-sepolia-rpc.publicnode.com', explorador: 'https://sepolia.etherscan.io',
  moneda: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 }, contrato: ''
};
*/
