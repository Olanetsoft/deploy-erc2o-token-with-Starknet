import dotenv from "dotenv";
import fs from "fs";
import readline from "readline";
import { Account, Contract, ec, json, stark, Provider, number } from "starknet";

dotenv.config();

// Initialize provider
const url = process.env.STARKNET_TESTNET_ENDPOINT;

console.log("Using Infura Starknet provider: ", url);

const provider = new Provider({
  rpc: {
    nodeUrl: url,
  },
});

console.log("Reading OpenZeppelin Account Contract...");

const compiledOZAccount = json.parse(
  fs.readFileSync("./contracts/OZAccount.json").toString("ascii")
);

// Generate public and private key pair.
const privateKey = stark.randomAddress();

const starkKeyPair = ec.genKeyPair(privateKey);
const starkKeyPub = ec.getStarkKey(starkKeyPair);

// Log the Public and Private key pair.
console.log(`Private key: ${privateKey}`);
console.log(`Public key: ${starkKeyPub}`);

// Deploy the Account contract and wait for it to be verified on StarkNet.
console.log(
  `////////////////////////////////////////////////////////////////////////////////
    Deployment Tx - Account Contract to StarkNet...
   ////////////////////////////////////////////////////////////////////////////////`
);
const accountResponse = await provider.deployContract({
  contract: compiledOZAccount,
  constructorCalldata: [starkKeyPub],
  addressSalt: starkKeyPub,
});

console.log("Account address ", accountResponse.contract_address);

console.log(
  `See account on the explorer: https://goerli.voyager.online/contract/${accountResponse.contract_address}`
);

console.log(
  `Follow the tx status on: https://goerli.voyager.online/tx/${accountResponse.transaction_hash}`
);

console.log(
  `////////////////////////////////////////////////////////////////////////////////
    Waiting for Tx to be Accepted on Starknet - OpenZeppelin Account Deployment...
   ////////////////////////////////////////////////////////////////////////////////`
);

await provider.waitForTransaction(accountResponse.transaction_hash);

console.log("Account contract deployed successfully!");

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

const ans = await askQuestion(
  "Did you add funds to your Account? Hit enter if yes"
);

// Use your new account address
const account = new Account(
  provider,
  accountResponse.contract_address,
  starkKeyPair
);

console.log("Reading ERC20 Contract...");

const compiledErc20 = json.parse(
  fs.readFileSync("./contracts/ERC20.json").toString("ascii")
);

// Deploy an ERC20 contract and wait for it to be verified on StarkNet.
console.log(
  `////////////////////////////////////////////////////////////////////////////////
     Deployment Tx - ERC20 Contract to StarkNet...
   ////////////////////////////////////////////////////////////////////////////////`
);

const erc20Response = await provider.deployContract({
  contract: compiledErc20,
});

// Wait for the deployment transaction to be accepted on StarkNet
console.log("Waiting for Tx to be Accepted on Starknet - ERC20 Deployment...");

await provider.waitForTransaction(erc20Response.transaction_hash);

// Get the erc20 contract address
const erc20Address = erc20Response.contract_address;

console.log("ERC20 Address: ", erc20Address);

// Create a new erc20 contract object
const erc20 = new Contract(compiledErc20.abi, erc20Address, provider);

erc20.connect(account);

// Mint 500 tokens to account address
console.log(
  `////////////////////////////////////////////////////////////////////////////////
    Invoke Tx - Minting 500 tokens to ${account.address}...
   ////////////////////////////////////////////////////////////////////////////////`
);

const { transaction_hash: mintTxHash } = await erc20.mint(
  account.address,
  "500",
  {
    // transaction can be rejected if maxFee is lower than actual
    // Error: REJECTED: FEE_TRANSFER_FAILURE
    // Actual fee exceeded max fee.
    maxFee: "999999995330000",
  }
);

// Wait for the invoke transaction to be accepted on StarkNet
console.log(`Waiting for Tx to be Accepted on Starknet - Minting...`);

await provider.waitForTransaction(mintTxHash);

// Check balance - should be 500
console.log(`Calling StarkNet for account balance...`);

const balanceBeforeTransfer = await erc20.balance_of(account.address);

console.log(
  `account Address ${account.address} has a balance of:`,
  number.toBN(balanceBeforeTransfer.res, 16).toString()
);

// Execute transfer of ERC20 tokens
console.log(`Invoke Tx - Transfer 20 tokens back to erc20 contract...`);
const { code, transaction_hash: transferTxHash } = await account.execute(
  {
    contractAddress: erc20Address,
    entrypoint: "transfer",
    calldata: [erc20Address, "20"],
  },
  undefined,
  {
    maxFee: "999999995330000",
  }
);

// Wait for the invoke transaction to be accepted on StarkNet
console.log(
  `////////////////////////////////////////////////////////////////////////////////
    Waiting for Tx to be Accepted on Starknet - Transfer...
   ////////////////////////////////////////////////////////////////////////////////`
);

await provider.waitForTransaction(transferTxHash);

// Check balance after transfer - should be 480
console.log(`Calling StarkNet for account balance...`);
const balanceAfterTransfer = await erc20.balance_of(account.address);

console.log(
  `account Address ${account.address} has a balance of:`,
  number.toBN(balanceAfterTransfer.res, 16).toString()
);
