require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Run `arc-canteen rpc-url` after `arc-canteen login` to get the Arc testnet RPC URL.
// Set it as ARC_RPC_URL in contracts/.env before deploying.
const ARC_RPC_URL = process.env.ARC_RPC_URL || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x" + "0".repeat(64);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    arc: {
      url: ARC_RPC_URL,
      accounts: [DEPLOYER_PRIVATE_KEY],
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
