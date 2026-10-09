import {walletChallengePlugin} from './walletChallenge';
import { Session, SessionKit } from "@wharfkit/session";
import { WebRenderer } from "@wharfkit/web-renderer";
import { WalletPluginAnchor } from "@wharfkit/wallet-plugin-anchor";
import { WalletPluginCloudWallet } from "@wharfkit/wallet-plugin-cloudwallet";
import { APIClient, Name } from "@wharfkit/antelope";

const WAX_CHAIN_ID = "1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01af5a41";
const WAX_RPC_URLS = [
  "https://wax.greymass.com",
  "https://wax.api.eosnation.io",
  "https://wax.blacklusion.io",
  "https://wax.eosphere.io"
];

// Pick a random RPC to avoid bottlenecks
const RANDOM_RPC = WAX_RPC_URLS[Math.floor(Math.random() * WAX_RPC_URLS.length)];

const client = new APIClient({ url: RANDOM_RPC });

export const sessionKit = new SessionKit({
  appName: "loreworks",
  chains: [
    {
      id: WAX_CHAIN_ID,
      url: RANDOM_RPC,
    },
  ],
  ui: new WebRenderer(),
  walletPlugins: [
    new WalletPluginAnchor(),
    new WalletPluginCloudWallet({
      supportedChains: [WAX_CHAIN_ID]
    } as any),
  ],
}, {loginPlugins:[walletChallengePlugin]});

export type UserRole = 'scribe' | 'skribus' | 'skiv' | 'reader';

export interface LoreStats {
  submissions: number;
  canonCount: number;
  role: UserRole;
}

export async function checkLoreStats(accountName: string): Promise<LoreStats> {
  try {
    // 1. Check for Writer NFT (art.worlds/lore.worlds)
    const nftResponse = await fetch(`https://wax.api.atomicassets.io/atomicassets/v1/assets?owner=${accountName}&collection_name=art.worlds&schema_name=lore.worlds&limit=1`);
    const nftData = await nftResponse.json();
    const hasWriterNFT = nftData.data && nftData.data.length > 0;

    // 2. Check for Proposals (lore.worlds contract tokelores table)
    const response = await client.v1.chain.get_table_rows({
      json: true,
      code: "lore.worlds",
      scope: "lore.worlds",
      table: "tokelores",
      limit: 500,
    });

    const userProposals = response.rows.filter((row: any) => row.proposer === accountName);
    const submissions = userProposals.length;
    
    const canonCount = userProposals.filter((row: any) => 
      row.status === 'complete' || row.status === 'executed' || row.status === 3 || row.status === 4
    ).length;

    let role: UserRole = 'reader';
    if (hasWriterNFT) {
      role = 'scribe';
    } else if (canonCount >= 1) {
      role = 'skribus';
    } else if (submissions >= 1) {
      role = 'skiv';
    }

    return { submissions, canonCount, role };
  } catch (error) {
    console.error("Error checking lore stats:", error);
    return { submissions: 0, canonCount: 0, role: 'reader' };
  }
}

import { NFTAsset } from '../types';

export async function getUserNFTs(accountName: string): Promise<NFTAsset[]> {
  try {
    // Fetch from both alien.worlds and art.worlds (lore.worlds schema)
    const [alienResponse, loreResponse] = await Promise.all([
      fetch(`https://wax.api.atomicassets.io/atomicassets/v1/assets?owner=${accountName}&collection_name=alien.worlds&limit=100`),
      fetch(`https://wax.api.atomicassets.io/atomicassets/v1/assets?owner=${accountName}&collection_name=art.worlds&schema_name=lore.worlds&limit=100`)
    ]);

    if (!alienResponse.ok || !loreResponse.ok) throw new Error("Failed to fetch NFTs");
    
    const alienData = await alienResponse.json();
    const loreData = await loreResponse.json();
    
    const alienAssets = alienData.data.map((asset: any) => ({
      asset_id: asset.asset_id,
      template_id: asset.template?.template_id || "",
      name: asset.data?.name || asset.template?.immutable_data?.name || "Unknown Asset",
      image: asset.data?.img || asset.template?.immutable_data?.img || "",
      collection: "alien.worlds",
      schema: asset.schema?.schema_name || ""
    }));

    const loreAssets = loreData.data.map((asset: any) => ({
      asset_id: asset.asset_id,
      template_id: asset.template?.template_id || "",
      name: asset.data?.name || asset.template?.immutable_data?.name || "Unknown Asset",
      image: asset.data?.img || asset.template?.immutable_data?.img || "",
      collection: "art.worlds",
      schema: "lore.worlds"
    }));
    
    return [...alienAssets, ...loreAssets];
  } catch (error) {
    console.error("Error fetching user NFTs:", error);
    return [];
  }
}

export async function checkNFTOwnership(accountName: string, templateId: string): Promise<boolean> {
  try {
    // Check both collections if needed, but usually templateId is unique enough
    const response = await fetch(`https://wax.api.atomicassets.io/atomicassets/v1/assets?owner=${accountName}&template_id=${templateId}&limit=1`);
    if (!response.ok) throw new Error("Failed to check NFT ownership");
    const data = await response.json();
    return data.data.length > 0;
  } catch (error) {
    console.error("Error checking NFT ownership:", error);
    return false;
  }
}
