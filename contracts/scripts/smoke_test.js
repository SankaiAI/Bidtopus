/**
 * Smoke test against the deployed contract on Arc testnet.
 * Verifies the contract is live and readable. Does not send any transactions.
 *
 * Usage: npx hardhat run scripts/smoke_test.js --network arc
 */
require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const addressPath = path.join(__dirname, "../out/address.json");
  const abiPath = path.join(__dirname, "../out/abi.json");

  if (!fs.existsSync(addressPath) || !fs.existsSync(abiPath)) {
    throw new Error("out/address.json or out/abi.json not found. Deploy first.");
  }

  const { address, settler, usdc, network: deployNetwork } = JSON.parse(fs.readFileSync(addressPath));
  const abi = JSON.parse(fs.readFileSync(abiPath));

  const [signer] = await ethers.getSigners();
  const contract = new ethers.Contract(address, abi, signer);
  const network = await ethers.provider.getNetwork();

  console.log("\n── Deployed contract ────────────────────────────────────────");
  console.log(`  Address:   ${address}`);
  console.log(`  Network:   ${deployNetwork} (chainId: ${network.chainId})`);
  console.log(`  Settler:   ${settler}`);
  console.log(`  USDC:      ${usdc}`);

  // Read on-chain values
  const onChainUsdc = await contract.usdc();
  const onChainSettler = await contract.settler();
  const emergencyDelay = await contract.EMERGENCY_REFUND_DELAY();

  console.log("\n── On-chain reads ───────────────────────────────────────────");
  console.log(`  usdc()                  = ${onChainUsdc}`);
  console.log(`  settler()               = ${onChainSettler}`);
  console.log(`  EMERGENCY_REFUND_DELAY  = ${Number(emergencyDelay) / 86400} days`);

  // Verify deploy manifest matches chain state
  const usdcMatch = onChainUsdc.toLowerCase() === usdc.toLowerCase();
  const settlerMatch = onChainSettler.toLowerCase() === settler.toLowerCase();
  console.log("\n── Verification ─────────────────────────────────────────────");
  console.log(`  USDC address matches manifest:    ${usdcMatch ? "✅" : "❌"}`);
  console.log(`  Settler address matches manifest: ${settlerMatch ? "✅" : "❌"}`);

  // Check status of a random ID returns Unfunded (0)
  const testId = ethers.keccak256(ethers.toUtf8Bytes("smoke-test-id"));
  const status = await contract.getStatus(testId);
  console.log(`  getStatus(unknown id) = ${status} (expected 0 = Unfunded): ${status === 0n ? "✅" : "❌"}`);

  if (!usdcMatch || !settlerMatch || status !== 0n) {
    throw new Error("Smoke test failed — see above.");
  }

  console.log("\n✅ Smoke test passed. Contract is live and responding correctly.\n");
  console.log(`   Explorer: https://testnet.arcscan.app/address/${address}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
