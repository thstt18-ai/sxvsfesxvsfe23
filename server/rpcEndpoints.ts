
export const RPC_ENDPOINTS = {
  polygon: [
    'https://polygon-rpc.com',
    'https://rpc-mainnet.matic.network',
    'https://polygon-bor-rpc.publicnode.com',
    'https://rpc-mainnet.maticvigil.com'
  ],
  amoy: [
    'https://rpc-amoy.polygon.technology',
    'https://polygon-amoy-bor-rpc.publicnode.com'
  ]
};

export function getRpcUrl(chainId: number, preferredUrl?: string): string {
  if (preferredUrl) {
    return preferredUrl;
  }

  const endpoints = chainId === 137 ? RPC_ENDPOINTS.polygon : RPC_ENDPOINTS.amoy;
  
  // Return first endpoint by default
  return endpoints[0];
}

export function getRpcFallbacks(chainId: number): string[] {
  return chainId === 137 ? RPC_ENDPOINTS.polygon : RPC_ENDPOINTS.amoy;
}
