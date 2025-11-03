// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract FlashbotVault is UUPSUpgradeable, AccessControlUpgradeable, PausableUpgradeable {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    IERC20 public usdc;
    AggregatorV3Interface public proofOfReserveFeed;

    uint256 public totalShares;
    uint256 public totalAssets;

    mapping(address => uint256) public shares;

    event Deposit(address indexed user, uint256 amount, uint256 shares);
    event Withdraw(address indexed user, uint256 amount, uint256 shares);
    event ReserveBreach(uint256 lockedUSDC, uint256 totalShares);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _usdc,
        address _proofOfReserveFeed,
        address _multisig1,
        address _multisig2,
        address _multisig3
    ) public initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __Pausable_init();

        usdc = IERC20(_usdc);
        proofOfReserveFeed = AggregatorV3Interface(_proofOfReserveFeed);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, _multisig1);
        _grantRole(PAUSER_ROLE, _multisig2);
        _grantRole(PAUSER_ROLE, _multisig3);
        _grantRole(UPGRADER_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function deposit(uint256 amount) external whenNotPaused {
        require(amount > 0, "Amount must be > 0");

        uint256 sharesToMint = totalShares == 0
            ? amount
            : (amount * totalShares) / totalAssets;

        usdc.transferFrom(msg.sender, address(this), amount);

        shares[msg.sender] += sharesToMint;
        totalShares += sharesToMint;
        totalAssets += amount;

        emit Deposit(msg.sender, amount, sharesToMint);
    }

    function withdraw(uint256 shareAmount) external whenNotPaused {
        require(shares[msg.sender] >= shareAmount, "Insufficient shares");

        uint256 amountToWithdraw = (shareAmount * totalAssets) / totalShares;

        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;
        totalAssets -= amountToWithdraw;

        usdc.transfer(msg.sender, amountToWithdraw);

        emit Withdraw(msg.sender, amountToWithdraw, shareAmount);
    }

    function batchDeposit(address[] calldata users, uint256[] calldata amounts) external whenNotPaused onlyRole(DEFAULT_ADMIN_ROLE) {
        require(users.length == amounts.length, "Length mismatch");

        for (uint256 i = 0; i < users.length; i++) {
            uint256 amount = amounts[i];
            uint256 sharesToMint = totalShares == 0
                ? amount
                : (amount * totalShares) / totalAssets;

            usdc.transferFrom(users[i], address(this), amount);
            shares[users[i]] += sharesToMint;
            totalShares += sharesToMint;
            totalAssets += amount;

            emit Deposit(users[i], amount, sharesToMint);
        }
    }

    function batchWithdraw(address[] calldata users, uint256[] calldata shareAmounts) external whenNotPaused onlyRole(DEFAULT_ADMIN_ROLE) {
        require(users.length == shareAmounts.length, "Length mismatch");

        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            uint256 shareAmount = shareAmounts[i];
            require(shares[user] >= shareAmount, "Insufficient shares");

            uint256 amountToWithdraw = (shareAmount * totalAssets) / totalShares;
            shares[user] -= shareAmount;
            totalShares -= shareAmount;
            totalAssets -= amountToWithdraw;

            usdc.transfer(user, amountToWithdraw);
            emit Withdraw(user, amountToWithdraw, shareAmount);
        }
    }

    function checkProofOfReserve() external view returns (bool isHealthy, uint256 reserveRatio) {
        uint256 lockedUSDC = usdc.balanceOf(address(this));
        isHealthy = lockedUSDC >= totalShares;
        reserveRatio = totalShares > 0 ? (lockedUSDC * 10000) / totalShares : 0;

        if (!isHealthy) {
            // In production, this would trigger an event
            // emit ReserveBreach(lockedUSDC, totalShares);
        }
    }
}