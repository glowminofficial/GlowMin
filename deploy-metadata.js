#!/usr/bin/env node

/**
 * GlowMin Token Metadata Deployment Script
 * 
 * This script deploys token metadata to the Solana blockchain.
 * It reads configuration from deployment-config.json and metadata from token-metadata.json
 * 
 * Usage: node deploy-metadata.js [options]
 * Options:
 *   --network <network>    Target network (devnet, testnet, mainnet-beta)
 *   --dry-run             Show what would be deployed without executing
 *   --verbose             Enable verbose logging
 */

const fs = require('fs');
const path = require('path');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { createMetadataAccountV3 } = require('@metaplex-foundation/mpl-token-metadata');
const { Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');

// Configuration
const CONFIG_PATH = path.join(__dirname, '../metadata/deployment-config.json');
const METADATA_PATH = path.join(__dirname, '../metadata/token-metadata.json');
const KEYPAIR_DIR = path.join(__dirname, '../keypairs');

class MetadataDeployer {
  constructor(network = 'devnet', verbose = false) {
    this.network = network;
    this.verbose = verbose;
    this.config = this.loadConfig();
    this.metadata = this.loadMetadata();
    this.connection = this.createConnection();
    this.keypairs = this.loadKeypairs();
  }

  loadConfig() {
    try {
      const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = JSON.parse(configData);
      
      if (this.verbose) {
        console.log('✅ Configuration loaded successfully');
        console.log(`   Network: ${this.network}`);
        console.log(`   Token: ${config.token.name} (${config.token.symbol})`);
      }
      
      return config;
    } catch (error) {
      console.error('❌ Failed to load configuration:', error.message);
      process.exit(1);
    }
  }

  loadMetadata() {
    try {
      const metadataData = fs.readFileSync(METADATA_PATH, 'utf8');
      const metadata = JSON.parse(metadataData);
      
      if (this.verbose) {
        console.log('✅ Metadata loaded successfully');
        console.log(`   Name: ${metadata.name}`);
        console.log(`   Symbol: ${metadata.symbol}`);
        console.log(`   Description: ${metadata.description.substring(0, 50)}...`);
      }
      
      return metadata;
    } catch (error) {
      console.error('❌ Failed to load metadata:', error.message);
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

      // Load metadata update authority keypair
      const metadataAuthorityPath = path.join(KEYPAIR_DIR, 'metadata-authority.json');
      if (fs.existsSync(metadataAuthorityPath)) {
        keypairs.metadataAuthority = Keypair.fromSecretKey(
          new Uint8Array(JSON.parse(fs.readFileSync(metadataAuthorityPath, 'utf8')))
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

  async checkNetworkHealth() {
    try {
      const version = await this.connection.getVersion();
      const slot = await this.connection.getSlot();
      
      if (this.verbose) {
        console.log('✅ Network health check passed');
        console.log(`   Solana Version: ${version['solana-core']}`);
        console.log(`   Current Slot: ${slot}`);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Network health check failed:', error.message);
      return false;
    }
  }

  async deployMetadata(dryRun = false) {
    console.log('\n🚀 Starting GlowMin metadata deployment...\n');

    // Health check
    const isHealthy = await this.checkNetworkHealth();
    if (!isHealthy) {
      console.error('❌ Network health check failed. Aborting deployment.');
      process.exit(1);
    }

    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No actual deployment will occur\n');
      this.showDeploymentPlan();
      return;
    }

    try {
      // Create metadata account
      console.log('📝 Creating metadata account...');
      
      const metadataAccount = await createMetadataAccountV3(
        this.connection,
        this.keypairs.metadataAuthority,
        {
          mint: this.keypairs.mintAuthority.publicKey,
          mintAuthority: this.keypairs.mintAuthority,
          updateAuthority: this.keypairs.metadataAuthority,
          metadataData: {
            name: this.metadata.name,
            symbol: this.metadata.symbol,
            uri: this.metadata.social.website + '/metadata/token-metadata.json',
            sellerFeeBasisPoints: 0,
            creators: this.metadata.properties.creators,
            collection: this.metadata.collection,
            uses: null
          },
          isMutable: true,
          collectionDetails: null
        }
      );

      console.log('✅ Metadata account created successfully!');
      console.log(`   Metadata Account: ${metadataAccount.toString()}`);
      console.log(`   Mint: ${this.keypairs.mintAuthority.publicKey.toString()}`);
      console.log(`   Update Authority: ${this.keypairs.metadataAuthority.publicKey.toString()}`);

      // Save deployment info
      this.saveDeploymentInfo(metadataAccount);

      console.log('\n🎉 GlowMin metadata deployment completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Verify metadata on Solana Explorer');
      console.log('2. Update deployment-config.json with metadata account address');
      console.log('3. Proceed with token minting if not already done');

    } catch (error) {
      console.error('❌ Metadata deployment failed:', error.message);
      
      if (this.verbose) {
        console.error('Full error details:', error);
      }
      
      process.exit(1);
    }
  }

  showDeploymentPlan() {
    console.log('📋 Deployment Plan:');
    console.log(`   Network: ${this.network}`);
    console.log(`   Token Name: ${this.metadata.name}`);
    console.log(`   Token Symbol: ${this.metadata.symbol}`);
    console.log(`   Mint Authority: ${this.keypairs.mintAuthority?.publicKey.toString() || 'Not loaded'}`);
    console.log(`   Metadata Authority: ${this.keypairs.metadataAuthority?.publicKey.toString() || 'Not loaded'}`);
    console.log(`   Metadata URI: ${this.metadata.social.website}/metadata/token-metadata.json`);
    console.log(`   Collection: ${this.metadata.collection.name}`);
  }

  saveDeploymentInfo(metadataAccount) {
    const deploymentInfo = {
      timestamp: new Date().toISOString(),
      network: this.network,
      metadataAccount: metadataAccount.toString(),
      mint: this.keypairs.mintAuthority.publicKey.toString(),
      updateAuthority: this.keypairs.metadataAuthority.publicKey.toString(),
      metadataUri: this.metadata.social.website + '/metadata/token-metadata.json'
    };

    const infoPath = path.join(__dirname, `../deployments/metadata-${this.network}-${Date.now()}.json`);
    
    // Ensure deployments directory exists
    const deploymentsDir = path.dirname(infoPath);
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    fs.writeFileSync(infoPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`📄 Deployment info saved to: ${infoPath}`);
  }
}

// CLI Interface
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    network: 'devnet',
    dryRun: false,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--network':
        options.network = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        console.log(`
Usage: node deploy-metadata.js [options]

Options:
  --network <network>    Target network (devnet, testnet, mainnet-beta)
  --dry-run             Show what would be deployed without executing
  --verbose             Enable verbose logging
  --help                Show this help message

Examples:
  node deploy-metadata.js --network devnet
  node deploy-metadata.js --network mainnet-beta --verbose
  node deploy-metadata.js --dry-run
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
  
  console.log('🌟 GlowMin Metadata Deployment Script');
  console.log('=====================================\n');

  const deployer = new MetadataDeployer(options.network, options.verbose);
  await deployer.deployMetadata(options.dryRun);
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

module.exports = { MetadataDeployer };
