
#!/bin/bash

# Navigate to project root
cd "$(dirname "$0")/../.."

# Check if .env exists
if [ ! -f .env ]; then
  echo "Error: .env file not found"
  exit 1
fi

# Source environment variables
set -a
source .env
set +a

# Validate required variables
if [ -z "$PRIVATE_KEY" ]; then
  echo "Error: PRIVATE_KEY not set in .env"
  exit 1
fi

if [ -z "$ROUTER_ADDRESS" ]; then
  echo "Error: ROUTER_ADDRESS not set in .env"
  exit 1
fi

# Run the script
echo "Running swap script on Amoy testnet..."
npx hardhat run packages/ai-master/call.js --network amoy
