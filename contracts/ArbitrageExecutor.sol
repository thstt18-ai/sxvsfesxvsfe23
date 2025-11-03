
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/upgradeable/metatx/ERC2771ContextUpgradeable.sol";

interface ISwapRouter {
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external returns (uint256 amountOut);
}

contract ArbitrageExecutor is 
    Initializable,
    FlashLoanSimpleReceiverBase, 
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    ERC2771ContextUpgradeable
{
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    struct ArbitrageParams {
        SwapData buySwap;
        SwapData sellSwap;
        uint256 minProfit;
    }

    struct SwapData {
        address router;
        bytes data;
    }

    uint256 public totalProfitUsd;
    uint256 public totalExecutions;
    uint256 public maxSlippage;
    address public trustedForwarder;

    event ArbitrageExecuted(
        address indexed asset,
        uint256 amount,
        uint256 profit,
        address indexed executor
    );

    event ExecutorAuthorized(address indexed executor, bool authorized);
    event SlippageUpdated(uint256 newSlippage);
    event EmergencyWithdraw(address indexed token, uint256 amount, address indexed to);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _addressProvider) 
        FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider))
    {
        _disableInitializers();
    }

    function initialize(
        address _poolAddressProvider,
        address _usdcAddress,
        address[] memory _pausers
    ) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        
        // Initialize ERC2771Context with zero address (will set later)
        __ERC2771Context_init(address(0));

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EXECUTOR_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);

        // Grant pauser role to multisig members
        for (uint i = 0; i < _pausers.length; i++) {
            _grantRole(PAUSER_ROLE, _pausers[i]);
        }

        maxSlippage = 50; // 0.5% default
    }

    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyRole(UPGRADER_ROLE) 
    {}

    modifier onlyExecutor() {
        require(hasRole(EXECUTOR_ROLE, msg.sender), "Not authorized executor");
        _;
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override nonReentrant whenNotPaused returns (bool) {
        require(msg.sender == address(POOL), "Caller must be Pool");
        require(initiator == address(this), "Initiator must be this contract");

        ArbitrageParams memory arbParams = abi.decode(params, (ArbitrageParams));

        // Execute buy swap
        IERC20(asset).approve(arbParams.buySwap.router, amount);
        (bool buySuccess, bytes memory buyData) = arbParams.buySwap.router.call(
            arbParams.buySwap.data
        );
        require(buySuccess, "Buy swap failed");

        // Execute sell swap
        uint256 intermediateAmount = abi.decode(buyData, (uint256));
        (bool sellSuccess, bytes memory sellData) = arbParams.sellSwap.router.call(
            arbParams.sellSwap.data
        );
        require(sellSuccess, "Sell swap failed");

        uint256 finalAmount = abi.decode(sellData, (uint256));
        uint256 totalDebt = amount + premium;

        require(finalAmount >= totalDebt + arbParams.minProfit, "Insufficient profit");

        // Approve repayment
        IERC20(asset).approve(address(POOL), totalDebt);

        uint256 profit = finalAmount - totalDebt;
        totalProfitUsd += profit;
        totalExecutions++;

        emit ArbitrageExecuted(asset, amount, profit, tx.origin);

        return true;
    }

    function executeArbitrage(
        address asset,
        uint256 amount,
        ArbitrageParams calldata params
    ) external onlyExecutor whenNotPaused {
        bytes memory encodedParams = abi.encode(params);
        POOL.flashLoanSimple(address(this), asset, amount, encodedParams, 0);
    }

    function authorizeExecutor(address executor, bool authorized) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        if (authorized) {
            _grantRole(EXECUTOR_ROLE, executor);
        } else {
            _revokeRole(EXECUTOR_ROLE, executor);
        }
        emit ExecutorAuthorized(executor, authorized);
    }

    function setMaxSlippage(uint256 _maxSlippage) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(_maxSlippage <= 1000, "Slippage too high"); // max 10%
        maxSlippage = _maxSlippage;
        emit SlippageUpdated(_maxSlippage);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function emergencyWithdraw(address token, uint256 amount, address to) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(to != address(0), "Invalid recipient");
        IERC20(token).transfer(to, amount);
        emit EmergencyWithdraw(token, amount, to);
    }

    function getStats() external view returns (
        uint256 profit,
        uint256 executions,
        uint256 slippage
    ) {
        return (totalProfitUsd, totalExecutions, maxSlippage);
    }

    // === Meta-TX Support (EIP-2771) ===
    
    function setTrustedForwarder(address forwarder) external onlyRole(DEFAULT_ADMIN_ROLE) {
        trustedForwarder = forwarder;
    }

    function _msgSender() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (address) {
        return ERC2771ContextUpgradeable._msgSender();
    }

    function _msgData() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }

    function _contextSuffixLength() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (uint256) {
        return ERC2771ContextUpgradeable._contextSuffixLength();
    }

    // === Gasless Arbitrage with EIP-2612 Permit ===
    
    /**
     * @dev Execute arbitrage with permit (EIP-2612) - NO approve needed, NO gas from user
     * @param asset The asset to borrow via flash loan
     * @param amount The amount to borrow
     * @param params Arbitrage parameters
     * @param deadline Permit deadline
     * @param v Permit signature v
     * @param r Permit signature r
     * @param s Permit signature s
     */
    function executeArbitrageWithPermit(
        address asset,
        uint256 amount,
        ArbitrageParams calldata params,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external onlyExecutor whenNotPaused {
        // Use permit to approve this contract without separate transaction
        IERC20Permit(asset).permit(
            _msgSender(),
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );
        
        // Execute arbitrage
        bytes memory encodedParams = abi.encode(params);
        POOL.flashLoanSimple(address(this), asset, amount, encodedParams, 0);
    }
}
