// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
struct PackedUserOperation { address sender; uint256 nonce; bytes initCode; bytes callData; bytes32 accountGasLimits; uint256 preVerificationGas; bytes32 gasFees; bytes paymasterAndData; bytes signature; }
/// Accept-all paymaster for local chains; its EntryPoint deposit is funded by DevWallet's sponsor.
contract DevWalletPaymaster {
    function validatePaymasterUserOp(PackedUserOperation calldata, bytes32, uint256) external pure returns (bytes memory context, uint256 validationData) { return ("", 0); }
    function postOp(uint8, bytes calldata, uint256, uint256) external {}
}
