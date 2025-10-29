import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { useAptosWallet } from './AptosWalletContext'

export type ChainType = 'EVM' | 'APTOS'

interface MultiChainAccount {
  address: string
  chainType: ChainType
  ensName?: string
  ansName?: string
  displayName?: string
}

interface MultiChainWalletContextType {
  // Current active connection
  currentAccount: MultiChainAccount | null
  isConnected: boolean
  chainType: ChainType | null
  
  // Connection methods
  connectEVM: () => Promise<void>
  connectAptos: () => Promise<void>
  disconnect: () => Promise<void>
  
  // Name resolution
  resolveNameService: (name: string) => Promise<string | null>
  reverseResolveName: (address: string) => Promise<string | null>
  
  // Utility
  switchChain: (chainType: ChainType) => Promise<void>
  isLoading: boolean
}

const MultiChainWalletContext = createContext<MultiChainWalletContextType | undefined>(undefined)

export const useMultiChainWallet = () => {
  const context = useContext(MultiChainWalletContext)
  if (context === undefined) {
    throw new Error('useMultiChainWallet must be used within a MultiChainWalletProvider')
  }
  return context
}

interface MultiChainWalletProviderProps {
  children: ReactNode
}

export const MultiChainWalletProvider: React.FC<MultiChainWalletProviderProps> = ({ 
  children 
}) => {
  const [currentAccount, setCurrentAccount] = useState<MultiChainAccount | null>(null)
  const [chainType, setChainType] = useState<ChainType | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // EVM hooks
  const { address: evmAddress, isConnected: evmConnected } = useAccount()
  const { open: openEVMModal } = useAppKit()
  const { disconnect: disconnectEVM } = useDisconnect()

  // Aptos hooks
  const { 
    account: aptosAccount, 
    isConnected: aptosConnected,
    connect: connectAptosWallet,
    disconnect: disconnectAptos,
    resolveANS,
    reverseResolveANS
  } = useAptosWallet()

  // Update current account based on connections
  useEffect(() => {
    if (evmConnected && evmAddress) {
      setCurrentAccount({
        address: evmAddress,
        chainType: 'EVM'
      })
      setChainType('EVM')
    } else if (aptosConnected && aptosAccount) {
      setCurrentAccount({
        address: aptosAccount.address,
        chainType: 'APTOS'
      })
      setChainType('APTOS')
    } else {
      setCurrentAccount(null)
      setChainType(null)
    }
  }, [evmConnected, evmAddress, aptosConnected, aptosAccount])

  // Connect to EVM wallets
  const connectEVM = async () => {
    setIsLoading(true)
    try {
      // Disconnect Aptos if connected
      if (aptosConnected) {
        await disconnectAptos()
      }
      
      // Open EVM wallet selection
      await openEVMModal?.()
    } catch (error) {
      console.error('❌ Failed to connect EVM wallet:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  // Connect to Aptos wallet
  const connectAptos = async () => {
    setIsLoading(true)
    try {
      // Disconnect EVM if connected
      if (evmConnected) {
        await disconnectEVM()
      }
      
      // Connect to Aptos
      await connectAptosWallet()
    } catch (error) {
      console.error('❌ Failed to connect Aptos wallet:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  // Disconnect current wallet
  const disconnect = async () => {
    setIsLoading(true)
    try {
      if (chainType === 'EVM' && evmConnected) {
        await disconnectEVM()
      } else if (chainType === 'APTOS' && aptosConnected) {
        await disconnectAptos()
      }
      
      setCurrentAccount(null)
      setChainType(null)
    } catch (error) {
      console.error('❌ Failed to disconnect wallet:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  // Switch between chains
  const switchChain = async (newChainType: ChainType) => {
    if (newChainType === chainType) return

    try {
      if (newChainType === 'EVM') {
        await connectEVM()
      } else if (newChainType === 'APTOS') {
        await connectAptos()
      }
    } catch (error) {
      console.error('❌ Failed to switch chain:', error)
      throw error
    }
  }

  // Resolve name service (ENS for EVM, ANS for Aptos)
  const resolveNameService = async (name: string): Promise<string | null> => {
    if (!chainType) return null

    try {
      if (chainType === 'EVM') {
        // TODO: Implement ENS resolution using existing Alchemy service
        console.log('🔄 Resolving ENS name:', name)
        return null
      } else if (chainType === 'APTOS') {
        return await resolveANS(name)
      }
      return null
    } catch (error) {
      console.error('❌ Name service resolution failed:', error)
      return null
    }
  }

  // Reverse resolve name
  const reverseResolveName = async (address: string): Promise<string | null> => {
    if (!chainType) return null

    try {
      if (chainType === 'EVM') {
        // TODO: Implement reverse ENS resolution
        console.log('🔄 Reverse resolving ENS for address:', address)
        return null
      } else if (chainType === 'APTOS') {
        return await reverseResolveANS(address)
      }
      return null
    } catch (error) {
      console.error('❌ Reverse name resolution failed:', error)
      return null
    }
  }

  const value: MultiChainWalletContextType = {
    currentAccount,
    isConnected: Boolean(currentAccount),
    chainType,
    connectEVM,
    connectAptos,
    disconnect,
    resolveNameService,
    reverseResolveName,
    switchChain,
    isLoading
  }

  return (
    <MultiChainWalletContext.Provider value={value}>
      {children}
    </MultiChainWalletContext.Provider>
  )
}