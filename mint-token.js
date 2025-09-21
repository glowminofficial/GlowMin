#!/usr/bin/env node

/**
 * GlowMin Token Minting Script
 * 
 * This script mints GLOWMIN tokens according to the tokenomics defined in the configuration.
 * It handles initial token distribution, liquidity allocation, and community distribution.
 * 
 * Usage: node mint-token.js [options]
 * Options:
 *   --network <network>    Target network (devnet, testnet, mainnet-beta)
 *   --amount <amount>      Amount to mint (in smallest units)
 *   --dry-run             Show what would be minted without executing
 *   --verbose             Enable verbose logging
 */

const fs = require('fs');
const path = require('path');
const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const { createMint, getOrCreateAssociatedTokenAccount, mintTo, setAuthority, AuthorityType } = require('@solana/spl-token');

// Configuration
const CONFIG_PATH = path.join(__dirname, '../metadata/deployment-config.json');
const KEYPAIR_DIR = path.join(__dirname, '../keypairs');

class TokenMinter {
  constructor(network = 'devnet', verbose = false) {
    this.network = network;
    this.verbose = verbose;
    this.config = this.loadConfig();
    this.connection = this.createConnection();
    this.keypairs = this.loadKeypairs();
    this.mintAddress = null;
  }

  loadConfig() {
    try {
      const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = JSON.parse(configData);
      
      if (this.verbose) {
        console.log('✅ Configuration loaded successfully');
        console.log(`   Network: ${this.network}`);
        console.log(`   Token: ${config.token.name} (${config.token.symbol})`);
        console.log(`   Decimals: ${config.token.decimals}`);
        console.log(`   Total Supply: ${config.token.total_supply}`);
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
      // Load mint authority keypair
      const mintAuthorityPath = path.join(KEYPAIR_DIR, 'mint-authority.json');
      if (fs.existsSync(mintAuthorityPath)) {
        keypairs.mintAuthority = Keypair.fromSecretKey(
          new Uint8Array(JSON.parse(fs.readFileSync(mintAuthorityPath, 'utf8')))
        );
      }

      // Load freeze authority keypair
      const freezeAuthorityPath = path.join(KEYPAIR_DIR, 'freeze-authority.json');
      if (fs.existsSync(freezeAuthorityPath)) {
        keypairs.freezeAuthority = Keypair.fromSecretKey(
          new Uint8Array(JSON.parse(fs.readFileSync(freezeAuthorityPath, 'utf8')))
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

  async createTokenMint() {
    try {
      console.log('🪙 Creating token mint...');
      
      const mint = await createMint(
        this.connection,
        this.keypairs.mintAuthority,
        this.keypairs.mintAuthority.publicKey,
        this.keypairs.freezeAuthority.publicKey,
        this.config.token.decimals
      );

      this.mintAddress = mint;
      
      console.log('✅ Token mint created successfully!');
      console.log(`   Mint Address: ${mint.toString()}`);
      console.log(`   Decimals: ${this.config.token.decimals}`);
      console.log(`   Mint Authority: ${this.keypairs.mintAuthority.publicKey.toString()}`);
      console.log(`   Freeze Authority: ${this.keypairs.freezeAuthority.publicKey.toString()}`);

      return mint;
    } catch (error) {
      console.error('❌ Failed to create token mint:', error.message);
      throw error;
    }
  }

  async createTokenAccount(owner) {
    try {
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.keypairs.mintAuthority,
        this.mintAddress,
        owner
      );

      if (this.verbose) {
        console.log(`✅ Token account created/found for ${owner.toString()}`);
        console.log(`   Token Account: ${tokenAccount.address.toString()}`);
      }

      return tokenAccount.address;
    } catch (error) {
      console.error(`❌ Failed to create token account for ${owner.toString()}:`, error.message);
      throw error;
    }
  }

  async mintTokens(to, amount) {
    try {
      const tokenAccount = await this.createTokenAccount(to);
      
      const signature = await mintTo(
        this.connection,
        this.keypairs.mintAuthority,
        this.mintAddress,
        tokenAccount,
        this.keypairs.mintAuthority,
        amount
      );

      if (this.verbose) {
        console.log(`✅ Minted ${amount} tokens to ${to.toString()}`);
        console.log(`   Transaction: ${signature}`);
      }

      return { tokenAccount, signature };
    } catch (error) {
      console.error(`❌ Failed to mint tokens to ${to.toString()}:`, error.message);
      throw error;
    }
  }

  async distributeTokens(dryRun = false) {
    console.log('\n🎯 Starting token distribution...\n');

    const distributions = this.calculateDistributions();
    
    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No actual minting will occur\n');
      this.showDistributionPlan(distributions);
      return;
    }

    const results = [];

    for (const distribution of distributions) {
      try {
        console.log(`📦 Distributing ${distribution.name}...`);
        console.log(`   Amount: ${distribution.amount} tokens`);
        console.log(`   Recipient: ${distribution.recipient.toString()}`);
        
        const result = await this.mintTokens(distribution.recipient, distribution.amount);
        results.push({
          ...distribution,
          tokenAccount: result.tokenAccount.toString(),
          signature: result.signature
        });

        console.log(`✅ ${distribution.name} distribution completed`);
        
        // Add delay between distributions to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Failed to distribute ${distribution.name}:`, error.message);
        results.push({
          ...distribution,
          error: error.message
        });
      }
    }

    this.saveDistributionResults(results);
    return results;
  }

  calculateDistributions() {
    const totalSupply = this.config.token.total_supply;
    
    return [
      {
        name: 'Liquidity Pool',
        amount: BigInt(Math.floor(totalSupply * 0.4)), // 40%
        recipient: this.keypairs.mintAuthority.publicKey, // Will be moved to liquidity pool
        purpose: 'Initial liquidity provision'
      },
      {
        name: 'Community',
        amount: BigInt(Math.floor(totalSupply * 0.3)), // 30%
        recipient: this.keypairs.mintAuthority.publicKey, // Will be distributed to community
        purpose: 'Community rewards and airdrops'
      },
      {
        name: 'Team',
        amount: BigInt(Math.floor(totalSupply * 0.15)), // 15%
        recipient: this.keypairs.mintAuthority.publicKey, // Team wallet
        purpose: 'Team allocation with vesting'
      },
      {
        name: 'Marketing',
        amount: BigInt(Math.floor(totalSupply * 0.1)), // 10%
        recipient: this.keypairs.mintAuthority.publicKey, // Marketing wallet
        purpose: 'Marketing campaigns and partnerships'
      },
      {
        name: 'Reserve',
        amount: BigInt(Math.floor(totalSupply * 0.05)), // 5%
        recipient: this.keypairs.mintAuthority.publicKey, // Reserve wallet
        purpose: 'Future development and emergency fund'
      }
    ];
  }

  showDistributionPlan(distributions) {
    console.log('📋 Token Distribution Plan:');
    console.log(`   Total Supply: ${this.config.token.total_supply}`);
    console.log(`   Mint Address: ${this.mintAddress?.toString() || 'Will be created'}`);
    console.log('\n   Distributions:');
    
    distributions.forEach((dist, index) => {
      console.log(`   ${index + 1}. ${dist.name}`);
      console.log(`      Amount: ${dist.amount.toString()} tokens`);
      console.log(`      Percentage: ${(Number(dist.amount) / this.config.token.total_supply * 100).toFixed(1)}%`);
      console.log(`      Purpose: ${dist.purpose}`);
      console.log('');
    });
  }

  async revokeMintAuthority() {
    try {
      console.log('🔒 Revoking mint authority...');
      
      await setAuthority(
        this.connection,
        this.keypairs.mintAuthority,
        this.mintAddress,
        this.keypairs.mintAuthority,
        AuthorityType.MintTokens,
        null
      );

      console.log('✅ Mint authority revoked successfully!');
      console.log('   Token is now non-mintable');
    } catch (error) {
      console.error('❌ Failed to revoke mint authority:', error.message);
      throw error;
    }
  }

  saveDistributionResults(results) {
    const distributionInfo = {
      timestamp: new Date().toISOString(),
      network: this.network,
      mintAddress: this.mintAddress.toString(),
      totalSupply: this.config.token.total_supply,
      distributions: results
    };

    const infoPath = path.join(__dirname, `../deployments/minting-${this.network}-${Date.now()}.json`);
    
    // Ensure deployments directory exists
    const deploymentsDir = path.dirname(infoPath);
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    fs.writeFileSync(infoPath, JSON.stringify(distributionInfo, null, 2));
    console.log(`📄 Distribution results saved to: ${infoPath}`);
  }

  async executeMinting(amount = null, dryRun = false) {
    console.log('\n🚀 Starting GlowMin token minting...\n');

    try {
      // Create token mint
      await this.createTokenMint();

      if (amount) {
        // Mint specific amount
        console.log(`💰 Minting ${amount} tokens...`);
        const result = await this.mintTokens(this.keypairs.mintAuthority.publicKey, BigInt(amount));
        console.log(`✅ Minting completed!`);
        console.log(`   Token Account: ${result.tokenAccount.toString()}`);
        console.log(`   Transaction: ${result.signature}`);
      } else {
        // Full tokenomics distribution
        await this.distributeTokens(dryRun);
      }

      if (!dryRun && !amount) {
        // Revoke mint authority after full distribution
        await this.revokeMintAuthority();
      }

      console.log('\n🎉 GlowMin token minting completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Verify token on Solana Explorer');
      console.log('2. Deploy metadata if not already done');
      console.log('3. Create liquidity pool');
      console.log('4. Update deployment-config.json with mint address');

    } catch (error) {
      console.error('❌ Token minting failed:', error.message);
      
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
    amount: null,
    dryRun: false,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--network':
        options.network = args[++i];
        break;
      case '--amount':
        options.amount = BigInt(args[++i]);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        console.log(`
Usage: node mint-token.js [options]

Options:
  --network <network>    Target network (devnet, testnet, mainnet-beta)
  --amount <amount>      Amount to mint (in smallest units)
  --dry-run             Show what would be minted without executing
  --verbose             Enable verbose logging
  --help                Show this help message

Examples:
  node mint-token.js --network devnet
  node mint-token.js --network mainnet-beta --amount 1000000000000
  node mint-token.js --dry-run
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
  
  console.log('🌟 GlowMin Token Minting Script');
  console.log('==============================\n');

  const minter = new TokenMinter(options.network, options.verbose);
  await minter.executeMinting(options.amount, options.dryRun);
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

module.exports = { TokenMinter };
