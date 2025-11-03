
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IArbitrageExecutor {
    function executeArbitrage(
        address asset,
        uint256 amount,
        bytes calldata params
    ) external;

    function authorizeExecutor(address executor, bool authorized) external;
}
