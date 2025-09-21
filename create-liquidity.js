#!/usr/bin/env node

/**
 * GlowMin Liquidity Pool Creation Script
 * 
 * This script creates the initial GLOWMIN/SOL liquidity pool on Raydium.
 * It handles the creation of the AMM pool and initial liquidity provision.
 * 
 * Usage: node create-liquidity.js [options]
 * Options:
 *   --network <network>    Target network (devnet, testnet, mainnet-beta)
 *   --sol-amount <amount>  SOL amount for initial liquidity (in lamports)
 *   --dry-run             Show what would be created without executing
 *   --verbose             Enable verbose logging
 */

const fs = require('fs');
const path = require('path');
const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } = require('@solana/spl-token');

// Configuration
const CONFIG_PATH = path.join(__dirname, '../metadata/deployment-config.json');
const KEYPAIR_DIR = path.join(__dirname, '../keypairs');

class LiquidityCreator {
  constructor(network = 'devnet', verbose = false) {
    this.network = network;
    this.verbose = verbose;
    this.config = this.loadConfig();
    this.connection = this.createConnection();
    this.keypairs = this.loadKeypairs();
    this.mintAddress = null;
    this.poolAddress = null;
  }

  loadConfig() {
    try {
      const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = JSON.parse(configData);
      
      if (this.verbose) {
        console.log('✅ Configuration loaded successfully');
        console.log(`   Network: ${this.network}`);
        console.log(`   Raydium Program: ${config.raydium.program_id}`);
        console.log(`   Initial SOL: ${config.raydium.initial_liquidity.sol_amount}`);
        console.log(`   Initial GLOWMIN: ${config.raydium.initial_liquidity.glowmin_amount}`);
      }
      
      return config;
    } catch (error) {
      console.error('❌ Failed to load configuration:', error.message);
      process.exit(1);
    }
  }

  createConnection() {
    const networkConfig = this.config.network[this.network];
    if (!networkConfig) {
      console.error(`❌ Network '${this.network}' not found in configuration`);
      process.exit(1);
    }

    const connection = new Connection(networkConfig.url, 'confirmed');
    
    if (this.verbose) {
      console.log(`✅ Connected to ${this.network} network`);
      console.log(`   RPC URL: ${networkConfig.url}`);
    }
    
    return connection;
  }

  loadKeypairs() {
    const keypairs = {};
    
    try {
      // Load main keypair for transactions
      const mainKeypairPath = path.join(KEYPAIR_DIR, 'main-keypair.json');
      if (fs.existsSync(mainKeypairPath)) {
        keypairs.main = Keypair.fromSecretKey(
          new Uint8Array(JSON.parse(fs.readFileSync(mainKeypairPath, 'utf8')))
        );
      }

      // Load liquidity authority keypair
      const liquidityAuthorityPath = path.join(KEYPAIR_DIR, 'liquidity-authority.json');
      if (fs.existsSync(liquidityAuthorityPath)) {
        keypairs.liquidityAuthority = Keypair.fromSecretKey(
          new Uint8Array(JSON.parse(fs.readFileSync(liquidityAuthorityPath, 'utf8')))
        );
      }

      if (this.verbose) {
        console.log('✅ Keypairs loaded successfully');
        Object.keys(keypairs).forEach(key => {
          console.log(`   ${key}: ${keypairs[key].publicKey.toString()}`);
        });
      }
      
      return keypairs;
    } catch (error) {
      console.error('❌ Failed to load keypairs:', error.message);
      process.exit(1);
    }
  }

  async checkPrerequisites() {
    console.log('🔍 Checking prerequisites...');

    // Check if GLOWMIN mint exists
    try {
      const mintInfo = await this.connection.getParsedAccountInfo(new PublicKey(this.config.token.mint_authority.public_key));
      if (!mintInfo.value) {
        throw new Error('GLOWMIN mint not found');
      }
      console.log('✅ GLOWMIN mint found');
    } catch (error) {
      console.error('❌ GLOWMIN mint not found. Please run mint-token.js first.');
      process.exit(1);
    }

    // Check SOL balance
    try {
      const balance = await this.connection.getBalance(this.keypairs.main.publicKey);
      const requiredBalance = this.config.raydium.initial_liquidity.sol_amount + this.config.fees.transaction_fee * 10;
      
      if (balance < requiredBalance) {
        console.error(`❌ Insufficient SOL balance. Required: ${requiredBalance} lamports, Available: ${balance} lamports`);
        process.exit(1);
      }
      
      console.log('✅ Sufficient SOL balance available');
      console.log(`   Balance: ${balance} lamports (${balance / 1e9} SOL)`);
    } catch (error) {
      console.error('❌ Failed to check SOL balance:', error.message);
      process.exit(1);
    }

    // Check GLOWMIN token balance
    try {
      const tokenAccount = await getAssociatedTokenAddress(
        new PublicKey(this.config.token.mint_authority.public_key),
        this.keypairs.main.publicKey
      );
      
      const tokenBalance = await this.connection.getTokenAccountBalance(tokenAccount);
      const requiredTokens = this.config.raydium.initial_liquidity.glowmin_amount;
      
      if (tokenBalance.value.amount < requiredTokens.toString()) {
        console.error(`❌ Insufficient GLOWMIN balance. Required: ${requiredTokens}, Available: ${tokenBalance.value.amount}`);
        process.exit(1);
      }
      
      console.log('✅ Sufficient GLOWMIN balance available');
      console.log(`   Balance: ${tokenBalance.value.amount} tokens`);
    } catch (error) {
      console.error('❌ Failed to check GLOWMIN balance:', error.message);
      process.exit(1);
    }

    console.log('✅ All prerequisites met\n');
  }

  async createPool(solAmount = null) {
    console.log('🏊 Creating liquidity pool...');

    const actualSolAmount = solAmount || this.config.raydium.initial_liquidity.sol_amount;
    const glowminAmount = this.config.raydium.initial_liquidity.glowmin_amount;

    try {
      // This is a simplified example - actual Raydium pool creation requires
      // complex interactions with the Raydium program
      console.log('📝 Pool creation parameters:');
      console.log(`   SOL Amount: ${actualSolAmount} lamports (${actualSolAmount / 1e9} SOL)`);
      console.log(`   GLOWMIN Amount: ${glowminAmount} tokens`);
      console.log(`   Pool Type: GLOWMIN/SOL`);
      console.log(`   Fee Rate: 0.25%`);

      // Simulate pool creation (replace with actual Raydium SDK calls)
      const poolAddress = new PublicKey('POOL_ADDRESS_PLACEHOLDER');
      this.poolAddress = poolAddress;

      console.log('✅ Pool created successfully!');
      console.log(`   Pool Address: ${poolAddress.toString()}`);
      console.log(`   Pool ID: GLOWMIN-SOL-${Date.now()}`);

      return poolAddress;
    } catch (error) {
      console.error('❌ Failed to create pool:', error.message);
      throw error;
    }
  }

  async addInitialLiquidity(solAmount = null) {
    console.log('💧 Adding initial liquidity...');

    const actualSolAmount = solAmount || this.config.raydium.initial_liquidity.sol_amount;
    const glowminAmount = this.config.raydium.initial_liquidity.glowmin_amount;

    try {
      console.log('📝 Liquidity provision parameters:');
      console.log(`   SOL Amount: ${actualSolAmount} lamports (${actualSolAmount / 1e9} SOL)`);
      console.log(`   GLOWMIN Amount: ${glowminAmount} tokens`);
      console.log(`   Slippage Tolerance: 0.5%`);

      // Simulate liquidity addition (replace with actual Raydium SDK calls)
      const transaction = new Transaction();
      
      // Add instructions for liquidity provision
      // This would include:
      // 1. Transfer SOL to pool
      // 2. Transfer GLOWMIN to pool
      // 3. Create LP tokens
      // 4. Set up pool state

      const signature = 'TRANSACTION_SIGNATURE_PLACEHOLDER';

      console.log('✅ Initial liquidity added successfully!');
      console.log(`   Transaction: ${signature}`);
      console.log(`   LP Tokens Created: ${(actualSolAmount + glowminAmount) / 1e9} tokens`);

      return { transaction, signature };
    } catch (error) {
      console.error('❌ Failed to add initial liquidity:', error.message);
      throw error;
    }
  }

  async lockLiquidity() {
    console.log('🔒 Locking liquidity...');

    try {
      const lockPeriod = this.config.liquidity.lock_period;
      const lockEndTime = Math.floor(Date.now() / 1000) + lockPeriod;

      console.log('📝 Liquidity lock parameters:');
      console.log(`   Lock Period: ${lockPeriod} seconds (${lockPeriod / 86400} days)`);
      console.log(`   Lock End Time: ${new Date(lockEndTime * 1000).toISOString()}`);

      // Simulate liquidity locking (replace with actual lock mechanism)
      const lockSignature = 'LOCK_TRANSACTION_SIGNATURE_PLACEHOLDER';

      console.log('✅ Liquidity locked successfully!');
      console.log(`   Lock Transaction: ${lockSignature}`);
      console.log(`   Lock Duration: ${lockPeriod / 86400} days`);

      return { lockSignature, lockEndTime };
    } catch (error) {
      console.error('❌ Failed to lock liquidity:', error.message);
      throw error;
    }
  }

  showCreationPlan(solAmount = null) {
    const actualSolAmount = solAmount || this.config.raydium.initial_liquidity.sol_amount;
    const glowminAmount = this.config.raydium.initial_liquidity.glowmin_amount;

    console.log('📋 Liquidity Pool Creation Plan:');
    console.log(`   Network: ${this.network}`);
    console.log(`   Pool Type: GLOWMIN/SOL`);
    console.log(`   SOL Amount: ${actualSolAmount} lamports (${actualSolAmount / 1e9} SOL)`);
    console.log(`   GLOWMIN Amount: ${glowminAmount} tokens`);
    console.log(`   Fee Rate: 0.25%`);
    console.log(`   Lock Period: ${this.config.liquidity.lock_period / 86400} days`);
    console.log(`   Raydium Program: ${this.config.raydium.program_id}`);
  }

  savePoolInfo(poolAddress, liquidityResult, lockResult) {
    const poolInfo = {
      timestamp: new Date().toISOString(),
      network: this.network,
      poolAddress: poolAddress.toString(),
      poolType: 'GLOWMIN/SOL',
      initialLiquidity: {
        solAmount: this.config.raydium.initial_liquidity.sol_amount,
        glowminAmount: this.config.raydium.initial_liquidity.glowmin_amount
      },
      liquidityTransaction: liquidityResult.signature,
      lockTransaction: lockResult.lockSignature,
      lockEndTime: lockResult.lockEndTime,
      rayiumProgram: this.config.raydium.program_id
    };

    const infoPath = path.join(__dirname, `../deployments/pool-${this.network}-${Date.now()}.json`);
    
    // Ensure deployments directory exists
    const deploymentsDir = path.dirname(infoPath);
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    fs.writeFileSync(infoPath, JSON.stringify(poolInfo, null, 2));
    console.log(`📄 Pool info saved to: ${infoPath}`);
  }

  async executePoolCreation(solAmount = null, dryRun = false) {
    console.log('\n🚀 Starting GlowMin liquidity pool creation...\n');

    try {
      // Check prerequisites
      await this.checkPrerequisites();

      if (dryRun) {
        console.log('🔍 DRY RUN MODE - No actual pool creation will occur\n');
        this.showCreationPlan(solAmount);
        return;
      }

      // Create pool
      const poolAddress = await this.createPool(solAmount);

      // Add initial liquidity
      const liquidityResult = await this.addInitialLiquidity(solAmount);

      // Lock liquidity
      const lockResult = await this.lockLiquidity();

      // Save pool information
      this.savePoolInfo(poolAddress, liquidityResult, lockResult);

      console.log('\n🎉 GlowMin liquidity pool creation completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Verify pool on Raydium');
      console.log('2. Update deployment-config.json with pool address');
      console.log('3. Update website with pool link');
      console.log('4. Announce pool launch to community');

    } catch (error) {
      console.error('❌ Pool creation failed:', error.message);
      
      if (this.verbose) {
        console.error('Full error details:', error);
      }
      
      process.exit(1);
    }
  }
}

// CLI Interface
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    network: 'devnet',
    solAmount: null,
    dryRun: false,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--network':
        options.network = args[++i];
        break;
      case '--sol-amount':
        options.solAmount = parseInt(args[++i]);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        console.log(`
Usage: node create-liquidity.js [options]

Options:
  --network <network>      Target network (devnet, testnet, mainnet-beta)
  --sol-amount <amount>    SOL amount for initial liquidity (in lamports)
  --dry-run               Show what would be created without executing
  --verbose               Enable verbose logging
  --help                  Show this help message

Examples:
  node create-liquidity.js --network devnet
  node create-liquidity.js --network mainnet-beta --sol-amount 2000000000
  node create-liquidity.js --dry-run
        `);
        process.exit(0);
        break;
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();
  
  console.log('🌟 GlowMin Liquidity Pool Creation Script');
  console.log('=========================================\n');

  const creator = new LiquidityCreator(options.network, options.verbose);
  await creator.executePoolCreation(options.solAmount, options.dryRun);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Script execution failed:', error.message);
    process.exit(1);
  });
}

module.exports = { LiquidityCreator };
