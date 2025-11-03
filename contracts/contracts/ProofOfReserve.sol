
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ProofOfReserve is AutomationCompatibleInterface, Ownable {
    IERC20 public immutable usdc;
    address public vault;
    uint256 public lastCheckTimestamp;
    uint256 public checkInterval = 1 hours;
    
    event ReserveChecked(uint256 lockedUSDC, uint256 totalShares, bool isHealthy);
    event ReserveDeficit(uint256 deficit);

    constructor(address _usdc, address _vault) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        vault = _vault;
        lastCheckTimestamp = block.timestamp;
    }

    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory) {
        upkeepNeeded = (block.timestamp - lastCheckTimestamp) >= checkInterval;
    }

    function performUpkeep(bytes calldata) external override {
        require((block.timestamp - lastCheckTimestamp) >= checkInterval, "Too soon");
        lastCheckTimestamp = block.timestamp;
        
        uint256 lockedUSDC = usdc.balanceOf(vault);
        uint256 totalShares = IVault(vault).totalSupply();
        
        bool isHealthy = lockedUSDC >= totalShares;
        
        emit ReserveChecked(lockedUSDC, totalShares, isHealthy);
        
        if (!isHealthy) {
            emit ReserveDeficit(totalShares - lockedUSDC);
        }
    }
}

interface IVault {
    function totalSupply() external view returns (uint256);
}
