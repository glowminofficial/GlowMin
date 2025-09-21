#!/bin/bash

# GlowMin Complete Deployment Script
# This script orchestrates the complete deployment of GlowMin token and liquidity pool

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NETWORK="devnet"
VERBOSE=false
DRY_RUN=false
SOL_AMOUNT=""

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

show_help() {
    echo "GlowMin Complete Deployment Script"
    echo "=================================="
    echo ""
    echo "Usage: ./deploy-all.sh [options]"
    echo ""
    echo "Options:"
    echo "  --network <network>      Target network (devnet, testnet, mainnet-beta)"
    echo "  --sol-amount <amount>    SOL amount for initial liquidity (in lamports)"
    echo "  --dry-run               Show what would be deployed without executing"
    echo "  --verbose               Enable verbose logging"
    echo "  --help                  Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./deploy-all.sh --network devnet"
    echo "  ./deploy-all.sh --network mainnet-beta --sol-amount 2000000000"
    echo "  ./deploy-all.sh --dry-run"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js v16 or higher."
        exit 1
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        log_error "Node.js version 16 or higher is required. Current version: $(node --version)"
        exit 1
    fi
    
    # Check if Solana CLI is installed
    if ! command -v solana &> /dev/null; then
        log_error "Solana CLI is not installed. Please install Solana CLI tools."
        exit 1
    fi
    
    # Check if npm packages are installed
    if [ ! -d "$SCRIPT_DIR/../node_modules" ]; then
        log_warning "Node modules not found. Installing dependencies..."
        cd "$PROJECT_ROOT"
        npm install
        cd "$SCRIPT_DIR"
    fi
    
    # Check if keypairs directory exists
    if [ ! -d "$SCRIPT_DIR/../keypairs" ]; then
        log_error "Keypairs directory not found. Please create keypairs first."
        log_info "Run: node cli-scripts/generate-keypairs.js"
        exit 1
    fi
    
    log_success "All prerequisites met"
}

generate_keypairs() {
    log_info "Generating keypairs..."
    
    if [ -f "$SCRIPT_DIR/../keypairs/mint-authority.json" ]; then
        log_warning "Keypairs already exist. Skipping generation."
        return
    fi
    
    node generate-keypairs.js --network "$NETWORK"
    
    if [ $? -eq 0 ]; then
        log_success "Keypairs generated successfully"
    else
        log_error "Failed to generate keypairs"
        exit 1
    fi
}

deploy_metadata() {
    log_info "Deploying token metadata..."
    
    local dry_run_flag=""
    local verbose_flag=""
    
    if [ "$DRY_RUN" = true ]; then
        dry_run_flag="--dry-run"
    fi
    
    if [ "$VERBOSE" = true ]; then
        verbose_flag="--verbose"
    fi
    
    node deploy-metadata.js --network "$NETWORK" $dry_run_flag $verbose_flag
    
    if [ $? -eq 0 ]; then
        log_success "Metadata deployment completed"
    else
        log_error "Metadata deployment failed"
        exit 1
    fi
}

mint_tokens() {
    log_info "Minting GLOWMIN tokens..."
    
    local dry_run_flag=""
    local verbose_flag=""
    
    if [ "$DRY_RUN" = true ]; then
        dry_run_flag="--dry-run"
    fi
    
    if [ "$VERBOSE" = true ]; then
        verbose_flag="--verbose"
    fi
    
    node mint-token.js --network "$NETWORK" $dry_run_flag $verbose_flag
    
    if [ $? -eq 0 ]; then
        log_success "Token minting completed"
    else
        log_error "Token minting failed"
        exit 1
    fi
}

create_liquidity() {
    log_info "Creating liquidity pool..."
    
    local dry_run_flag=""
    local verbose_flag=""
    local sol_amount_flag=""
    
    if [ "$DRY_RUN" = true ]; then
        dry_run_flag="--dry-run"
    fi
    
    if [ "$VERBOSE" = true ]; then
        verbose_flag="--verbose"
    fi
    
    if [ -n "$SOL_AMOUNT" ]; then
        sol_amount_flag="--sol-amount $SOL_AMOUNT"
    fi
    
    node create-liquidity.js --network "$NETWORK" $sol_amount_flag $dry_run_flag $verbose_flag
    
    if [ $? -eq 0 ]; then
        log_success "Liquidity pool creation completed"
    else
        log_error "Liquidity pool creation failed"
        exit 1
    fi
}

verify_deployment() {
    log_info "Verifying deployment..."
    
    node verify-deployment.js --network "$NETWORK"
    
    if [ $? -eq 0 ]; then
        log_success "Deployment verification completed"
    else
        log_warning "Deployment verification failed or incomplete"
    fi
}

backup_metadata() {
    log_info "Backing up metadata to IPFS..."
    
    node backup-metadata.js --network "$NETWORK"
    
    if [ $? -eq 0 ]; then
        log_success "Metadata backup completed"
    else
        log_warning "Metadata backup failed"
    fi
}

show_deployment_summary() {
    log_info "Deployment Summary"
    echo "=================="
    echo "Network: $NETWORK"
    echo "Dry Run: $DRY_RUN"
    echo "Verbose: $VERBOSE"
    if [ -n "$SOL_AMOUNT" ]; then
        echo "SOL Amount: $SOL_AMOUNT lamports ($((SOL_AMOUNT / 1000000000)) SOL)"
    fi
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_warning "This was a dry run. No actual deployment occurred."
    else
        log_success "Deployment completed successfully!"
        echo ""
        log_info "Next steps:"
        echo "1. Verify deployment on Solana Explorer"
        echo "2. Update website with token and pool addresses"
        echo "3. Announce launch to community"
        echo "4. Monitor network health and metrics"
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --network)
            NETWORK="$2"
            shift 2
            ;;
        --sol-amount)
            SOL_AMOUNT="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
main() {
    echo "🌟 GlowMin Complete Deployment Script"
    echo "===================================="
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Generate keypairs if needed
    generate_keypairs
    
    # Deploy metadata
    deploy_metadata
    
    # Mint tokens
    mint_tokens
    
    # Create liquidity pool
    create_liquidity
    
    # Verify deployment
    verify_deployment
    
    # Backup metadata
    backup_metadata
    
    # Show summary
    show_deployment_summary
}

# Handle errors
trap 'log_error "Script failed at line $LINENO"' ERR

# Run main function
main
