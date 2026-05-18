const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// Converts a string contract ID to bytes32 the same way the agent adapter does.
function toBytes32(str) {
  return ethers.keccak256(ethers.toUtf8Bytes(str));
}

// USDC has 6 decimal places.
function usdc(amount) {
  return ethers.parseUnits(amount.toString(), 6);
}

describe("PerformanceEscrow", function () {
  let escrow;
  let mockUsdc;
  let owner, settler, merchant, agent, other;

  const CONTRACT_ID = toBytes32("contract-abc-123");
  const AMOUNT = usdc(100); // 100 USDC

  beforeEach(async function () {
    [owner, settler, merchant, agent, other] = await ethers.getSigners();

    // Deploy a minimal ERC20 mock for USDC
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUsdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    // Mint 1000 USDC to the merchant
    await mockUsdc.mint(merchant.address, usdc(1000));

    // Deploy the escrow contract
    const PerformanceEscrow = await ethers.getContractFactory("PerformanceEscrow");
    escrow = await PerformanceEscrow.deploy(await mockUsdc.getAddress(), settler.address);

    // Merchant approves the escrow contract to spend USDC
    await mockUsdc.connect(merchant).approve(await escrow.getAddress(), usdc(1000));
  });

  // ── fund() ────────────────────────────────────────────────────────────────

  describe("fund()", function () {
    it("locks USDC and sets status to Funded", async function () {
      await escrow.connect(merchant).fund(CONTRACT_ID, AMOUNT, merchant.address, agent.address);

      expect(await escrow.getStatus(CONTRACT_ID)).to.equal(1); // Status.Funded

      const [eMerchant, eAgent, eAmount, eStatus] = await escrow.getEscrow(CONTRACT_ID);
      expect(eMerchant).to.equal(merchant.address);
      expect(eAgent).to.equal(agent.address);
      expect(eAmount).to.equal(AMOUNT);
      expect(eStatus).to.equal(1);
    });

    it("transfers USDC from merchant to contract", async function () {
      const escrowAddress = await escrow.getAddress();
      const balanceBefore = await mockUsdc.balanceOf(escrowAddress);

      await escrow.connect(merchant).fund(CONTRACT_ID, AMOUNT, merchant.address, agent.address);

      expect(await mockUsdc.balanceOf(escrowAddress)).to.equal(balanceBefore + AMOUNT);
      expect(await mockUsdc.balanceOf(merchant.address)).to.equal(usdc(1000) - AMOUNT);
    });

    it("emits Funded event with correct args", async function () {
      await expect(
        escrow.connect(merchant).fund(CONTRACT_ID, AMOUNT, merchant.address, agent.address)
      )
        .to.emit(escrow, "Funded")
        .withArgs(CONTRACT_ID, merchant.address, agent.address, AMOUNT, anyValue);
    });

    it("reverts if amount is zero", async function () {
      await expect(
        escrow.connect(merchant).fund(CONTRACT_ID, 0, merchant.address, agent.address)
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("reverts if merchant address is zero", async function () {
      await expect(
        escrow.connect(merchant).fund(CONTRACT_ID, AMOUNT, ethers.ZeroAddress, agent.address)
      ).to.be.revertedWith("Invalid merchant address");
    });

    it("reverts if agent address is zero", async function () {
      await expect(
        escrow.connect(merchant).fund(CONTRACT_ID, AMOUNT, merchant.address, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid agent address");
    });

    it("reverts if contract ID already funded", async function () {
      await escrow.connect(merchant).fund(CONTRACT_ID, AMOUNT, merchant.address, agent.address);
      await expect(
        escrow.connect(merchant).fund(CONTRACT_ID, AMOUNT, merchant.address, agent.address)
      ).to.be.revertedWith("Escrow already exists");
    });
  });

  // ── release() ─────────────────────────────────────────────────────────────

  describe("release()", function () {
    beforeEach(async function () {
      await escrow.connect(merchant).fund(CONTRACT_ID, AMOUNT, merchant.address, agent.address);
    });

    it("sends USDC to agent and sets status to Released", async function () {
      const agentBefore = await mockUsdc.balanceOf(agent.address);

      await escrow.connect(settler).release(CONTRACT_ID);

      expect(await mockUsdc.balanceOf(agent.address)).to.equal(agentBefore + AMOUNT);
      expect(await escrow.getStatus(CONTRACT_ID)).to.equal(2); // Status.Released
    });

    it("emits Released event", async function () {
      await expect(escrow.connect(settler).release(CONTRACT_ID))
        .to.emit(escrow, "Released")
        .withArgs(CONTRACT_ID, agent.address, AMOUNT, anyValue);
    });

    it("reverts if caller is not settler", async function () {
      await expect(escrow.connect(other).release(CONTRACT_ID)).to.be.revertedWith(
        "Not authorized settler"
      );
    });

    it("reverts if already released (double-settlement)", async function () {
      await escrow.connect(settler).release(CONTRACT_ID);
      await expect(escrow.connect(settler).release(CONTRACT_ID)).to.be.revertedWith(
        "Not funded or already settled"
      );
    });

    it("reverts if already refunded (double-settlement)", async function () {
      await escrow.connect(settler).refund(CONTRACT_ID);
      await expect(escrow.connect(settler).release(CONTRACT_ID)).to.be.revertedWith(
        "Not funded or already settled"
      );
    });

    it("reverts if escrow not yet funded", async function () {
      const unfundedId = toBytes32("never-funded");
      await expect(escrow.connect(settler).release(unfundedId)).to.be.revertedWith(
        "Not funded or already settled"
      );
    });
  });

  // ── refund() ──────────────────────────────────────────────────────────────

  describe("refund()", function () {
    beforeEach(async function () {
      await escrow.connect(merchant).fund(CONTRACT_ID, AMOUNT, merchant.address, agent.address);
    });

    it("returns USDC to merchant and sets status to Refunded", async function () {
      const merchantBefore = await mockUsdc.balanceOf(merchant.address);

      await escrow.connect(settler).refund(CONTRACT_ID);

      expect(await mockUsdc.balanceOf(merchant.address)).to.equal(merchantBefore + AMOUNT);
      expect(await escrow.getStatus(CONTRACT_ID)).to.equal(3); // Status.Refunded
    });

    it("emits Refunded event", async function () {
      await expect(escrow.connect(settler).refund(CONTRACT_ID))
        .to.emit(escrow, "Refunded")
        .withArgs(CONTRACT_ID, merchant.address, AMOUNT, anyValue);
    });

    it("reverts if caller is not settler", async function () {
      await expect(escrow.connect(other).refund(CONTRACT_ID)).to.be.revertedWith(
        "Not authorized settler"
      );
    });

    it("reverts if already refunded (double-settlement)", async function () {
      await escrow.connect(settler).refund(CONTRACT_ID);
      await expect(escrow.connect(settler).refund(CONTRACT_ID)).to.be.revertedWith(
        "Not funded or already settled"
      );
    });

    it("reverts if already released (double-settlement)", async function () {
      await escrow.connect(settler).release(CONTRACT_ID);
      await expect(escrow.connect(settler).refund(CONTRACT_ID)).to.be.revertedWith(
        "Not funded or already settled"
      );
    });
  });

  // ── getStatus() ───────────────────────────────────────────────────────────

  describe("getStatus()", function () {
    it("returns Unfunded for unknown contract", async function () {
      expect(await escrow.getStatus(toBytes32("unknown"))).to.equal(0);
    });

    it("returns Funded after fund()", async function () {
      await escrow.connect(merchant).fund(CONTRACT_ID, AMOUNT, merchant.address, agent.address);
      expect(await escrow.getStatus(CONTRACT_ID)).to.equal(1);
    });

    it("returns Released after release()", async function () {
      await escrow.connect(merchant).fund(CONTRACT_ID, AMOUNT, merchant.address, agent.address);
      await escrow.connect(settler).release(CONTRACT_ID);
      expect(await escrow.getStatus(CONTRACT_ID)).to.equal(2);
    });

    it("returns Refunded after refund()", async function () {
      await escrow.connect(merchant).fund(CONTRACT_ID, AMOUNT, merchant.address, agent.address);
      await escrow.connect(settler).refund(CONTRACT_ID);
      expect(await escrow.getStatus(CONTRACT_ID)).to.equal(3);
    });
  });

  // ── merchantEmergencyRefund() ─────────────────────────────────────────────

  describe("merchantEmergencyRefund()", function () {
    const THIRTY_DAYS = 30 * 24 * 60 * 60;

    beforeEach(async function () {
      await escrow.connect(merchant).fund(CONTRACT_ID, AMOUNT, merchant.address, agent.address);
    });

    it("returns USDC to merchant after 30-day delay", async function () {
      const merchantBefore = await mockUsdc.balanceOf(merchant.address);

      await ethers.provider.send("evm_increaseTime", [THIRTY_DAYS]);
      await ethers.provider.send("evm_mine");

      await escrow.connect(merchant).merchantEmergencyRefund(CONTRACT_ID);

      expect(await mockUsdc.balanceOf(merchant.address)).to.equal(merchantBefore + AMOUNT);
      expect(await escrow.getStatus(CONTRACT_ID)).to.equal(3); // Refunded
    });

    it("emits EmergencyRefunded event", async function () {
      await ethers.provider.send("evm_increaseTime", [THIRTY_DAYS]);
      await ethers.provider.send("evm_mine");

      await expect(escrow.connect(merchant).merchantEmergencyRefund(CONTRACT_ID))
        .to.emit(escrow, "EmergencyRefunded")
        .withArgs(CONTRACT_ID, merchant.address, AMOUNT, anyValue);
    });

    it("reverts if delay has not elapsed", async function () {
      // Advance time to 1 second before the deadline without mining a block.
      // The transaction itself mines at T + THIRTY_DAYS - 1, which is still < T + THIRTY_DAYS.
      await ethers.provider.send("evm_increaseTime", [THIRTY_DAYS - 1]);

      await expect(
        escrow.connect(merchant).merchantEmergencyRefund(CONTRACT_ID)
      ).to.be.revertedWith("Emergency refund delay not elapsed");
    });

    it("reverts if caller is not the merchant", async function () {
      await ethers.provider.send("evm_increaseTime", [THIRTY_DAYS]);
      await ethers.provider.send("evm_mine");

      await expect(
        escrow.connect(other).merchantEmergencyRefund(CONTRACT_ID)
      ).to.be.revertedWith("Only merchant can call emergency refund");
    });

    it("reverts if already settled by settler before delay elapses", async function () {
      await escrow.connect(settler).release(CONTRACT_ID);

      await ethers.provider.send("evm_increaseTime", [THIRTY_DAYS]);
      await ethers.provider.send("evm_mine");

      await expect(
        escrow.connect(merchant).merchantEmergencyRefund(CONTRACT_ID)
      ).to.be.revertedWith("Not funded or already settled");
    });

    it("reverts on double emergency refund", async function () {
      await ethers.provider.send("evm_increaseTime", [THIRTY_DAYS]);
      await ethers.provider.send("evm_mine");

      await escrow.connect(merchant).merchantEmergencyRefund(CONTRACT_ID);
      await expect(
        escrow.connect(merchant).merchantEmergencyRefund(CONTRACT_ID)
      ).to.be.revertedWith("Not funded or already settled");
    });
  });

  // ── multiple escrows ──────────────────────────────────────────────────────

  describe("multiple escrows", function () {
    it("manages two independent escrows under different contract IDs", async function () {
      const ID_A = toBytes32("contract-A");
      const ID_B = toBytes32("contract-B");

      await mockUsdc.connect(merchant).approve(await escrow.getAddress(), usdc(2000));

      await escrow.connect(merchant).fund(ID_A, usdc(50), merchant.address, agent.address);
      await escrow.connect(merchant).fund(ID_B, usdc(75), merchant.address, agent.address);

      await escrow.connect(settler).release(ID_A);
      await escrow.connect(settler).refund(ID_B);

      expect(await escrow.getStatus(ID_A)).to.equal(2); // Released
      expect(await escrow.getStatus(ID_B)).to.equal(3); // Refunded

      expect(await mockUsdc.balanceOf(agent.address)).to.equal(usdc(50));
    });
  });
});

