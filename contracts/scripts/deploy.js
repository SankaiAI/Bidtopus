const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

async function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      if (answer.trim().toLowerCase() !== "yes") {
        console.log("Deployment aborted.");
        process.exit(1);
      }
      resolve();
    });
  });
}

async function main() {
  const USDC_TOKEN_ADDRESS = process.env.USDC_TOKEN_ADDRESS;
  const SETTLER_ADDRESS = process.env.SETTLER_ADDRESS;

  if (!USDC_TOKEN_ADDRESS) throw new Error("USDC_TOKEN_ADDRESS env var required");
  if (!SETTLER_ADDRESS) throw new Error("SETTLER_ADDRESS env var required");

  const network = await hre.ethers.provider.getNetwork();
  const [deployer] = await hre.ethers.getSigners();

  console.log("\nDeploying OutcomeX PerformanceEscrow contract");
  console.log("=============================================");
  console.log(`  USDC token:  ${USDC_TOKEN_ADDRESS}`);
  console.log(`  Settler:     ${SETTLER_ADDRESS}`);
  console.log(`  Network:     ${network.name} (chainId: ${network.chainId})`);
  console.log(`  Deployer:    ${deployer.address}`);
  console.log();

  await confirm("Confirm deployment? (yes/no): ");

  const PerformanceEscrow = await hre.ethers.getContractFactory("PerformanceEscrow");
  const escrow = await PerformanceEscrow.deploy(USDC_TOKEN_ADDRESS, SETTLER_ADDRESS);
  await escrow.waitForDeployment();

  const contractAddress = await escrow.getAddress();
  const deployTx = escrow.deploymentTransaction();
  const receipt = await deployTx.wait();

  console.log("\n✅ Contract deployed successfully!");
  console.log(`  Contract address: ${contractAddress}`);
  console.log(`  Deployment tx:    ${deployTx.hash}`);
  console.log(`  Block number:     ${receipt.blockNumber}`);
  console.log(`  Network:          ${network.name}`);

  // Write ABI and address to out/ for agent and backend consumption
  const outDir = path.join(__dirname, "..", "out");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const artifact = await hre.artifacts.readArtifact("PerformanceEscrow");

  fs.writeFileSync(
    path.join(outDir, "abi.json"),
    JSON.stringify(artifact.abi, null, 2)
  );

  const addressData = {
    address: contractAddress,
    network: network.name,
    chainId: String(network.chainId),
    deployTxHash: deployTx.hash,
    blockNumber: receipt.blockNumber,
    deployedAt: new Date().toISOString(),
    settler: SETTLER_ADDRESS,
    usdc: USDC_TOKEN_ADDRESS,
  };

  fs.writeFileSync(
    path.join(outDir, "address.json"),
    JSON.stringify(addressData, null, 2)
  );

  console.log("\n📄 Output written to contracts/out/");
  console.log("   → abi.json");
  console.log("   → address.json");
  console.log("\nNext steps:");
  console.log("  1. Share contracts/out/ with agent and backend teams");
  console.log("  2. Set ESCROW_CONTRACT_ADDRESS=" + contractAddress + " in agent/.env");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
