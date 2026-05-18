// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title OutcomeX PerformanceEscrow
/// @notice Locks USDC for a performance contract and releases or refunds based on outcome.
/// One contract instance manages all escrows, identified by bytes32 contractId.
contract PerformanceEscrow {
    using SafeERC20 for IERC20;

    enum Status { Unfunded, Funded, Released, Refunded }

    struct Escrow {
        address merchant;
        address agent;
        uint256 amount;
        Status status;
    }

    IERC20 public immutable usdc;
    address public immutable settler;

    mapping(bytes32 => Escrow) public escrows;

    event Funded(
        bytes32 indexed contractId,
        address merchant,
        address agent,
        uint256 amount,
        uint256 timestamp
    );
    event Released(
        bytes32 indexed contractId,
        address agent,
        uint256 amount,
        uint256 timestamp
    );
    event Refunded(
        bytes32 indexed contractId,
        address merchant,
        uint256 amount,
        uint256 timestamp
    );

    modifier onlySetter() {
        require(msg.sender == settler, "Not authorized settler");
        _;
    }

    constructor(address _usdc, address _settler) {
        require(_usdc != address(0), "Invalid USDC address");
        require(_settler != address(0), "Invalid settler address");
        usdc = IERC20(_usdc);
        settler = _settler;
    }

    /// @notice Fund an escrow. Merchant must have approved this contract to spend `amount` USDC.
    /// @param contractId  Unique ID for this performance contract (keccak256 of backend UUID)
    /// @param amount      USDC amount in base units (6 decimals on Arc)
    /// @param merchant    Address that deposits USDC and receives refund on failure
    /// @param agent       Address that receives USDC on success
    function fund(
        bytes32 contractId,
        uint256 amount,
        address merchant,
        address agent
    ) external {
        require(amount > 0, "Amount must be greater than 0");
        require(merchant != address(0), "Invalid merchant address");
        require(agent != address(0), "Invalid agent address");
        require(escrows[contractId].status == Status.Unfunded, "Escrow already exists");

        // Check-Effects-Interactions: update state before external token transfer
        escrows[contractId] = Escrow({
            merchant: merchant,
            agent: agent,
            amount: amount,
            status: Status.Funded
        });

        emit Funded(contractId, merchant, agent, amount, block.timestamp);

        usdc.safeTransferFrom(merchant, address(this), amount);
    }

    /// @notice Release escrowed USDC to the agent (success path).
    function release(bytes32 contractId) external onlySetter {
        Escrow storage e = escrows[contractId];
        require(e.status == Status.Funded, "Not funded or already settled");

        // Check-Effects-Interactions
        e.status = Status.Released;
        uint256 amount = e.amount;
        address agent = e.agent;

        emit Released(contractId, agent, amount, block.timestamp);

        usdc.safeTransfer(agent, amount);
    }

    /// @notice Refund escrowed USDC to the merchant (failure path).
    function refund(bytes32 contractId) external onlySetter {
        Escrow storage e = escrows[contractId];
        require(e.status == Status.Funded, "Not funded or already settled");

        // Check-Effects-Interactions
        e.status = Status.Refunded;
        uint256 amount = e.amount;
        address merchant = e.merchant;

        emit Refunded(contractId, merchant, amount, block.timestamp);

        usdc.safeTransfer(merchant, amount);
    }

    function getStatus(bytes32 contractId) external view returns (Status) {
        return escrows[contractId].status;
    }

    function getEscrow(bytes32 contractId)
        external
        view
        returns (
            address merchant,
            address agent,
            uint256 amount,
            Status status
        )
    {
        Escrow storage e = escrows[contractId];
        return (e.merchant, e.agent, e.amount, e.status);
    }
}
