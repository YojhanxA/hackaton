// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Traza Educativa · Registro público de anclajes
/// @notice Guarda la huella (raíz Merkle SHA-256) del historial de cambios de la plataforma.
///         No guarda datos de sedes ni de personas: solo huellas de 32 bytes.
///         Un anclaje no se puede modificar ni borrar, ni siquiera por el propietario.
contract TrazaAnclaje {
    struct Anclaje {
        uint32 bloques;   // cuántos bloques del historial cubre la huella
        uint64 cuando;    // marca de tiempo de la red al anclar
        address quien;    // cuenta que firmó el anclaje
    }

    /// Cuenta que desplegó el contrato (la Secretaría). Solo ella autoriza otras cuentas.
    address public immutable propietario;
    /// Cuentas que pueden anclar (por ejemplo, profesionales SEM o el servidor).
    mapping(address => bool) public autorizados;
    /// Raíces ancladas, en orden de llegada.
    bytes32[] public raices;
    mapping(bytes32 => Anclaje) private anclajes;

    event Anclado(bytes32 indexed raiz, uint32 bloques, address indexed quien, uint64 cuando);
    event Autorizacion(address indexed cuenta, bool autorizada);

    error NoAutorizado();
    error YaAnclado(bytes32 raiz);
    error DatosInvalidos();

    constructor() {
        propietario = msg.sender;
        autorizados[msg.sender] = true;
        emit Autorizacion(msg.sender, true);
    }

    /// @notice Autoriza o retira una cuenta para anclar. Solo el propietario.
    function autorizar(address cuenta, bool autorizada) external {
        if (msg.sender != propietario) revert NoAutorizado();
        if (cuenta == address(0)) revert DatosInvalidos();
        autorizados[cuenta] = autorizada;
        emit Autorizacion(cuenta, autorizada);
    }

    /// @notice Publica la huella de los primeros `bloques` bloques del historial.
    function anclar(bytes32 raiz, uint32 bloques) external {
        if (!autorizados[msg.sender]) revert NoAutorizado();
        if (raiz == bytes32(0) || bloques == 0) revert DatosInvalidos();
        if (anclajes[raiz].cuando != 0) revert YaAnclado(raiz);
        anclajes[raiz] = Anclaje(bloques, uint64(block.timestamp), msg.sender);
        raices.push(raiz);
        emit Anclado(raiz, bloques, msg.sender, uint64(block.timestamp));
    }

    /// @notice Devuelve el anclaje de una huella. `cuando == 0` significa que nunca se ancló.
    function consultar(bytes32 raiz) external view returns (uint32 bloques, uint64 cuando, address quien) {
        Anclaje memory a = anclajes[raiz];
        return (a.bloques, a.cuando, a.quien);
    }

    /// @notice Número de anclajes registrados.
    function total() external view returns (uint256) {
        return raices.length;
    }
}
