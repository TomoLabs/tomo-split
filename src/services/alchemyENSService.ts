import { Alchemy, Network } from 'alchemy-sdk'

interface ENSResolutionResult {
  address: string | null
  error?: string
}

class AlchemyENSService {
  private alchemy: Alchemy | null = null
  private readonly apiKey: string

  constructor() {
    // Get Alchemy API key from environment with fallback to known key
    const envKey = import.meta.env.VITE_ALCHEMY_API_KEY
    
    // Comprehensive environment debugging
    console.log('🔍 Full Environment Debug:')
    console.log('- import.meta.env.VITE_ALCHEMY_API_KEY:', envKey)
    console.log('- Type:', typeof envKey)
    console.log('- Length:', envKey?.length || 0)
    console.log('- All VITE_ vars:', Object.keys(import.meta.env).filter(key => key.startsWith('VITE_')))
    console.log('- All env keys:', Object.keys(import.meta.env))
    
    // Temporary: Use your known API key if env var fails
    if (!envKey) {
      console.warn('⚠️ Environment variable not loaded, using fallback')
      this.apiKey = '50MEA29CwXWWZsSKgblya-mIcfFgT7zD' // Your API key from .env
    } else {
      console.log('✅ Environment variable loaded successfully')
      this.apiKey = envKey
    }
    
    console.log('🔑 Final API Key length:', this.apiKey.length)
    
    if (this.apiKey && this.apiKey.length > 10) {
      console.log('✅ Alchemy API Key found, initializing Alchemy SDK...')
      console.log('🔑 API Key (first 10 chars):', this.apiKey.substring(0, 10) + '...')
      this.initializeAlchemy()
    } else {
      console.error('❌ No valid API key available')
    }
  }

  private initializeAlchemy() {
    try {
      const config = {
        apiKey: this.apiKey,
        network: Network.ETH_MAINNET, // ENS resolution on Ethereum mainnet
      }
      
      this.alchemy = new Alchemy(config)
      console.log('✅ Alchemy SDK initialized for ENS resolution')
    } catch (error) {
      console.error('❌ Failed to initialize Alchemy SDK:', error)
    }
  }

  /**
   * Check if a string is a valid ENS name
   * Following ENS docs: treat all dot-separated strings as potential ENS names
   */
  isENSName(input: string): boolean {
    // Per ENS docs: treat all dot-separated strings as potential ENS names
    const hasValidStructure = /^[a-zA-Z0-9_-]+\.[a-zA-Z]{2,}$/i.test(input.toLowerCase())
    return hasValidStructure && input.includes('.')
  }

  /**
   * Check if a string is a valid Ethereum address
   */
  isEthereumAddress(input: string): boolean {
    try {
      // Simple Ethereum address validation
      return /^0x[a-fA-F0-9]{40}$/.test(input)
    } catch {
      return false
    }
  }

  /**
   * Resolve ENS name to wallet address using Alchemy SDK
   * Following Alchemy's official documentation
   */
  async resolveENSToAddress(ensName: string): Promise<ENSResolutionResult> {
    console.log(`🔄 Starting Alchemy ENS resolution for: ${ensName}`)
    
    if (!this.alchemy) {
      console.error('❌ Alchemy SDK not initialized')
      return {
        address: null,
        error: 'Alchemy SDK not initialized. Please check your API key.'
      }
    }

    if (!this.isENSName(ensName)) {
      console.error(`❌ Invalid ENS name format: ${ensName}`)
      return {
        address: null,
        error: 'Invalid ENS name format'
      }
    }

    const normalizedName = ensName.toLowerCase().trim()

    try {
      console.log(`🔍 Getting OWNER wallet address for ENS: ${normalizedName}`)
      
      // Method 1: Try to get the owner directly using ethers (most reliable)
      try {
        const ethers = await import('ethers')
        const provider = new ethers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${this.apiKey}`)
        
        // Direct owner lookup via ENS registry
        console.log(`🔄 Looking up owner via ENS registry for ${normalizedName}`)
        
        // ENS Registry contract address
        const ensRegistryAddress = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
        
        // Create contract instance for ENS registry
        const ensRegistryABI = [
          'function owner(bytes32 node) view returns (address)'
        ]
        
        const ensRegistry = new ethers.Contract(ensRegistryAddress, ensRegistryABI, provider)
        
        // Convert ENS name to namehash
        const namehash = ethers.namehash(normalizedName)
        
        // Get the owner from registry
        const ownerFromRegistry = await ensRegistry.owner(namehash)
        
        if (ownerFromRegistry && this.isEthereumAddress(ownerFromRegistry) && ownerFromRegistry !== '0x0000000000000000000000000000000000000000') {
          console.log(`✅ Found OWNER via registry for ${normalizedName}: ${ownerFromRegistry}`)
          return {
            address: ownerFromRegistry
          }
        }
        
      } catch (ownerError) {
        console.log(`❌ Owner lookup failed:`, ownerError)
      }
      
      // If we reach here, owner lookup failed
      return {
        address: null,
        error: 'ENS name not found or invalid'
      }
    } catch (error: any) {
      console.error('❌ Alchemy ENS resolution error:', error)
      
      // Handle specific Alchemy errors
      if (error.code === 'NETWORK_ERROR') {
        return {
          address: null,
          error: 'Network error. Please check your connection and try again.'
        }
      }
      
      if (error.code === 'INVALID_ARGUMENT') {
        return {
          address: null,
          error: 'Invalid ENS name provided.'
        }
      }
      
      if (error.message?.includes('rate limit')) {
        return {
          address: null,
          error: 'Rate limit exceeded. Please try again in a moment.'
        }
      }
      
      return {
        address: null,
        error: 'Failed to resolve ENS name. Please check the name and try again.'
      }
    }
  }

  /**
   * Resolve address back to ENS name using Alchemy SDK (reverse resolution)
   */
  async resolveAddressToENS(address: string): Promise<string | null> {
    console.log(`🔄 Starting Alchemy reverse ENS resolution for: ${address}`)
    
    if (!this.alchemy) {
      console.error('❌ Alchemy SDK not initialized')
      return null
    }

    if (!this.isEthereumAddress(address)) {
      console.error(`❌ Invalid Ethereum address: ${address}`)
      return null
    }

    try {
      console.log(`🔍 Looking up ENS name for address with Alchemy SDK: ${address}`)
      
      // Use Alchemy's lookupAddress method for reverse resolution
      const ensName = await this.alchemy.core.lookupAddress(address)
      
      if (!ensName) {
        console.warn(`⚠️ No ENS name found for address: ${address}`)
        return null
      }

      console.log(`✅ Alchemy address ${address} resolved to ENS: ${ensName}`)
      
      return ensName
    } catch (error) {
      console.error('❌ Alchemy reverse ENS resolution error:', error)
      return null
    }
  }

  /**
   * Validate and process wallet input (ENS or address) using Alchemy SDK
   */
  async processWalletInput(input: string): Promise<{
    walletId: string
    resolvedAddress?: string
    resolvedENS?: string
    isENS: boolean
    error?: string
  }> {
    const trimmedInput = input.trim()
    console.log(`🔄 Processing wallet input with Alchemy: "${trimmedInput}"`)

    // If it's already a valid Ethereum address, try reverse resolution to find ENS
    if (this.isEthereumAddress(trimmedInput)) {
      console.log(`✅ Input is valid Ethereum address, attempting reverse ENS lookup...`)
      
      try {
        const ensName = await this.resolveAddressToENS(trimmedInput)
        return {
          walletId: trimmedInput,
          resolvedENS: ensName || undefined,
          isENS: false
        }
      } catch (error) {
        console.log(`⚠️ Reverse ENS lookup failed, but address is valid`)
        return {
          walletId: trimmedInput,
          isENS: false
        }
      }
    }

    // If it looks like an ENS name, try to resolve it
    if (this.isENSName(trimmedInput)) {
      console.log(`📝 Input looks like ENS name, attempting resolution...`)
      const result = await this.resolveENSToAddress(trimmedInput)
      
      if (result.error) {
        console.log(`❌ ENS resolution failed: ${result.error}`)
        return {
          walletId: trimmedInput,
          isENS: true,
          error: result.error
        }
      }

      console.log(`✅ ENS resolution successful`)
      return {
        walletId: trimmedInput, // Keep the ENS name as display
        resolvedAddress: result.address!, // Store the resolved address
        isENS: true
      }
    }

    // If it ends with .eth but doesn't match pattern, still try to resolve it
    if (trimmedInput.toLowerCase().endsWith('.eth')) {
      console.log(`🔍 Input ends with .eth, forcing ENS resolution attempt...`)
      const result = await this.resolveENSToAddress(trimmedInput)
      
      if (result.error) {
        return {
          walletId: trimmedInput,
          isENS: true,
          error: result.error
        }
      }

      return {
        walletId: trimmedInput,
        resolvedAddress: result.address!,
        isENS: true
      }
    }

    console.log(`❌ Input doesn't match any valid format`)
    return {
      walletId: trimmedInput,
      isENS: false,
      error: 'Please enter a valid Ethereum address or ENS name'
    }
  }
}

// Export singleton instance
export const alchemyENSService = new AlchemyENSService()
export default alchemyENSService
