// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";
import "@aave/core-v3/contracts/interfaces/IPool.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";

// EIP-2771 Context for meta-transactions
abstract contract ERC2771Context {
    address private immutable _trustedForwarder;

    constructor(address trustedForwarder) {
        _trustedForwarder = trustedForwarder;
    }

    function isTrustedForwarder(address forwarder) public view virtual returns (bool) {
        return forwarder == _trustedForwarder;
    }

    function _msgSender() internal view virtual returns (address sender) {
        if (isTrustedForwarder(msg.sender)) {
            assembly {
                sender := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        } else {
            return msg.sender;
        }
    }
}

// Insurance Vault with EIP-4626
contract InsuranceVault is ERC4626, ERC20Permit {
    constructor(IERC20 asset)
        ERC4626(asset)
        ERC20("Insurance Vault Shares", "insShares")
        ERC20Permit("Insurance Vault Shares")
    {}

    function decimals() public pure override(ERC20, ERC4626) returns (uint8) {
        return 6; // USDC decimals
    }
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

contract ArbitrageExecutor is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    IFlashLoanSimpleReceiver,
    ERC2771Context
{
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    IPoolAddressesProvider public ADDRESSES_PROVIDER;
    IPool public POOL;
    InsuranceVault public insuranceVault;

    uint256 public constant MAX_CONTRACT_SIZE = 24576; // 24 KB SpuriousDragon limit
    uint256 public constant MULTI_SIG_THRESHOLD = 2; // 2-of-3 multisig

    mapping(address => bool) public approvedExecutors;
    mapping(bytes32 => uint256) public pauseVotes; // Emergency pause voting
    address[] public pausers;

    event ExecutorApproved(address indexed executor);
    event ExecutorRevoked(address indexed executor);
    event FlashLoanExecuted(address indexed asset, uint256 amount, uint256 premium);
    event ArbitrageCompleted(uint256 profit, uint256 insuranceFee);
    event EmergencyPauseVoted(address indexed pauser, bytes32 proposalId);
    event EmergencyPauseExecuted(bytes32 proposalId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {
        _disableInitializers();
    }

    function initialize(
        address _addressProvider,
        address _insuranceAsset,
        address[] memory _pausers
    ) public initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        require(_pausers.length >= MULTI_SIG_THRESHOLD, "Not enough pausers");

        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressProvider);
        POOL = IPool(ADDRESSES_PROVIDER.getPool());

        insuranceVault = new InsuranceVault(IERC20(_insuranceAsset));

        pausers = _pausers;

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(UPGRADER_ROLE, _msgSender());

        for (uint256 i = 0; i < _pausers.length; i++) {
            _grantRole(PAUSER_ROLE, _pausers[i]);
        }
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {
        // Size check for new implementation
        uint256 size;
        assembly {
            size := extcodesize(newImplementation)
        }
        require(size <= MAX_CONTRACT_SIZE, "Contract size exceeds limit");
    }

    function addExecutor(address executor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        approvedExecutors[executor] = true;
        _grantRole(EXECUTOR_ROLE, executor);
        emit ExecutorApproved(executor);
    }

    function removeExecutor(address executor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        approvedExecutors[executor] = false;
        _revokeRole(EXECUTOR_ROLE, executor);
        emit ExecutorRevoked(executor);
    }

    // Emergency multisig pause (2-of-3)
    function voteEmergencyPause(bytes32 proposalId) external onlyRole(PAUSER_ROLE) {
        pauseVotes[proposalId]++;
        emit EmergencyPauseVoted(_msgSender(), proposalId);

        if (pauseVotes[proposalId] >= MULTI_SIG_THRESHOLD) {
            _pause();
            emit EmergencyPauseExecuted(proposalId);
        }
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function executeFlashLoan(
        address asset,
        uint256 amount,
        bytes calldata params
    ) external onlyRole(EXECUTOR_ROLE) whenNotPaused nonReentrant {
        POOL.flashLoanSimple(address(this), asset, amount, params, 0);
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == address(POOL), "Caller must be Aave Pool");
        require(initiator == address(this), "Initiator must be this contract");

        (
            address[] memory path,
            address[] memory routers,
            uint24[] memory fees,
            uint256 minProfit,
            uint256 deadline
        ) = abi.decode(params, (address[], address[], uint24[], uint256, uint256));

        require(block.timestamp <= deadline, "Transaction expired");

        uint256 currentAmount = amount;

        for (uint256 i = 0; i < path.length - 1; i++) {
            IERC20(path[i]).approve(routers[i], currentAmount);

            ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter.ExactInputSingleParams({
                tokenIn: path[i],
                tokenOut: path[i + 1],
                fee: fees[i],
                recipient: address(this),
                deadline: deadline,
                amountIn: currentAmount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

            currentAmount = ISwapRouter(routers[i]).exactInputSingle(swapParams);
        }

        uint256 totalDebt = amount + premium;
        require(currentAmount >= totalDebt + minProfit, "Insufficient profit");

        uint256 profit = currentAmount - totalDebt;
        uint256 insuranceFee = (profit * 10) / 100; // 10% to insurance vault

        IERC20(asset).transfer(address(insuranceVault), insuranceFee);
        IERC20(asset).approve(address(POOL), totalDebt);

        emit FlashLoanExecuted(asset, amount, premium);
        emit ArbitrageCompleted(profit, insuranceFee);

        return true;
    }

    function ADDRESSES_PROVIDER() external view returns (IPoolAddressesProvider) {
        return ADDRESSES_PROVIDER;
    }

    function POOL() external view returns (IPool) {
        return POOL;
    }

    // EIP-2771 override
    function _msgSender() internal view override(ContextUpgradeable, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    receive() external payable {}
}