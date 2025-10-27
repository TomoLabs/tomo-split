import { PrismaClient } from '@prisma/client'
import { calculateGroupSettlement } from './debtSettlementService'

// Initialize Prisma Client
let prisma: PrismaClient

declare global {
  var __prisma: PrismaClient | undefined
}

// Use DATABASE_URL from environment (for Prisma) or VITE_DATABASE_URL (for Vite apps)
const databaseUrl = process.env.DATABASE_URL || process.env.VITE_DATABASE_URL

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  })
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    })
  }
  prisma = global.__prisma
}

// Types for our application
export interface FriendData {
  id: string
  name: string
  walletId: string
  resolvedAddress?: string
  resolvedENS?: string
  isENS?: boolean
  isSelected?: boolean
  friendAddress?: string
  friendENS?: string
}

export interface GroupData {
  id: string
  name: string
  hash: string
  members: string[]
  createdAt: Date
  isSettled?: boolean
  totalAmount?: number
  yourShare?: number
  isPaid?: boolean
}

export interface SplitData {
  id: string
  groupId: string
  groupName: string
  title: string
  description?: string
  totalAmount: number
  paidBy: string
  paidByName: string
  members: SplitMemberData[]
  createdAt: string
  createdBy: string
  splitType: 'equal' | 'custom'
  currency: string
  isSettled: boolean
  settledAt?: string
  ipfsHash?: string
}

export interface SplitMemberData {
  id: string
  name: string
  walletId: string
  amount: number
  isPaid: boolean
  paidAt?: string
}

export interface UserDues {
  userWallet: string
  totalOwed: number
  totalOwedToUser: number
  netBalance: number
  pendingGroups: {
    groupId: string
    groupName: string
    amountOwed: number
    amountOwedToUser: number
    netAmount: number
    optimalTransactions: {
      from: string
      to: string
      amount: number
      description: string
    }[]
  }[]
  globalOptimalTransactions: {
    from: string
    to: string
    amount: number
    description: string
  }[]
}

class DatabaseService {
  private client = prisma

  // User Operations
  async createOrUpdateUser(walletAddress: string, ensName?: string, displayName?: string) {
    try {
      const user = await this.client.user.upsert({
        where: { walletAddress },
        update: { 
          ensName,
          displayName,
          updatedAt: new Date()
        },
        create: {
          walletAddress,
          ensName,
          displayName
        }
      })
      console.log('✅ User created/updated:', user.id)
      return user
    } catch (error) {
      console.error('❌ Error creating/updating user:', error)
      throw error
    }
  }

  async getUserByWallet(walletAddress: string) {
    try {
      return await this.client.user.findUnique({
        where: { walletAddress },
        include: {
          groupMemberships: {
            include: { group: true }
          },
          splitsCreated: {
            include: { 
              members: { include: { user: true } },
              group: true
            }
          }
        }
      })
    } catch (error) {
      console.error('❌ Error fetching user:', error)
      return null
    }
  }

  // Friend Operations
  async addFriend(userWallet: string, friendData: FriendData) {
    try {
      console.log('🔄 Adding friend to database:', { userWallet, friendData })
      
      // Get or create the user who is adding the friend
      const user = await this.createOrUpdateUser(userWallet)
      
      // Determine friend's wallet address and ENS
      const friendWalletAddress = friendData.resolvedAddress || friendData.friendAddress || friendData.walletId
      const friendENSName = friendData.isENS ? friendData.walletId : (friendData.resolvedENS || friendData.friendENS)
      
      // Get or create the friend user
      const friend = await this.createOrUpdateUser(
        friendWalletAddress,
        friendENSName,
        friendData.name
      )

      // Check if friendship already exists
      const existingFriendship = await this.client.friend.findUnique({
        where: {
          userId_friendId: {
            userId: user.id,
            friendId: friend.id
          }
        }
      })

      if (existingFriendship) {
        console.log('⚠️ Friendship already exists')
        return existingFriendship
      }

      // Create friendship relationship
      const friendship = await this.client.friend.create({
        data: {
          userId: user.id,
          friendId: friend.id,
          nickname: friendData.name,
          friendAddress: friendWalletAddress,
          friendENS: friendENSName,
          isENS: friendData.isENS || false
        },
        include: {
          friend: true
        }
      })

      console.log('✅ Friend added to database:', friendship.id)
      return friendship
    } catch (error) {
      console.error('❌ Error adding friend:', error)
      throw error
    }
  }

  async getFriends(userWallet: string): Promise<FriendData[]> {
    try {
      console.log('🔄 Fetching friends for user:', userWallet)
      
      const user = await this.getUserByWallet(userWallet)
      if (!user) {
        console.log('❌ User not found for wallet:', userWallet)
        return []
      }

      const friendships = await this.client.friend.findMany({
        where: { userId: user.id },
        include: { friend: true },
        orderBy: { createdAt: 'desc' }
      })

      const friends = friendships.map(friendship => ({
        id: friendship.id,
        name: friendship.nickname || friendship.friend.displayName || 
              (friendship.friendENS || `${friendship.friendAddress.slice(0, 6)}...${friendship.friendAddress.slice(-4)}`),
        walletId: friendship.isENS ? (friendship.friendENS || friendship.friend.ensName || friendship.friendAddress) : friendship.friendAddress,
        resolvedAddress: friendship.friendAddress,
        resolvedENS: friendship.friendENS,
        isENS: friendship.isENS,
        isSelected: false,
        friendAddress: friendship.friendAddress,
        friendENS: friendship.friendENS
      }))

      console.log(`✅ Fetched ${friends.length} friends from database`)
      return friends
    } catch (error) {
      console.error('❌ Error fetching friends:', error)
      return []
    }
  }

  async removeFriend(userWallet: string, friendId: string) {
    try {
      const user = await this.getUserByWallet(userWallet)
      if (!user) throw new Error('User not found')

      await this.client.friend.delete({
        where: {
          userId_friendId: {
            userId: user.id,
            friendId: friendId
          }
        }
      })

      console.log('✅ Friend removed:', friendId)
    } catch (error) {
      console.error('❌ Error removing friend:', error)
      throw error
    }
  }

  // Group Operations
  async createGroup(creatorWallet: string, name: string, memberWallets: string[]) {
    try {
      console.log('🔄 Creating group:', { creatorWallet, name, memberWallets })
      
      const creator = await this.createOrUpdateUser(creatorWallet)

      // Get all member users (ensure they exist in database)
      const memberUsers = await Promise.all(
        memberWallets.map(async (wallet) => {
          return await this.createOrUpdateUser(wallet)
        })
      )

      console.log(`🔄 Creating group with:`)
      console.log(`   👤 Creator ID: ${creator.id}`)
      console.log(`   👥 Member Users:`, memberUsers.map(u => ({ id: u.id, wallet: u.walletAddress })))
      
      // Check if creator is already in a group with any of these members
      const uniqueMembers = memberUsers.filter(u => u.id !== creator.id)
      console.log(`   🧭 Unique Members (excluding creator):`, uniqueMembers.map(u => ({ id: u.id, wallet: u.walletAddress })))

      // Create the group with creator and members
      const group = await this.client.group.create({
        data: {
          name,
          creatorId: creator.id,
          members: {
            create: [
              // Add creator as admin
              {
                userId: creator.id,
                role: 'ADMIN'
              },
              // Add other members (exclude creator to avoid duplicate)
              ...uniqueMembers.map(member => ({
                userId: member.id,
                role: 'MEMBER' as const
              }))
            ]
          }
        },
        include: {
          members: { 
            include: { 
              user: true 
            } 
          }
        }
      })

      console.log('✅ Group created:', group.id, 'with', group.members.length, 'members')
      return group
    } catch (error) {
      console.error('❌ Error creating group:', error)
      throw error
    }
  }

  async getGroups(userWallet: string): Promise<GroupData[]> {
    try {
      const user = await this.getUserByWallet(userWallet)
      if (!user) return []

      const memberships = await this.client.groupMember.findMany({
        where: { userId: user.id },
        include: {
          group: {
            include: {
              members: { include: { user: true } },
              splits: {
                include: { members: true }
              }
            }
          }
        }
      })

      return memberships.map(membership => {
        const group = membership.group
        const totalSplits = group.splits.length
        const settledSplits = group.splits.filter(s => s.status === 'SETTLED').length
        
        // Calculate user's share from active splits
        const userSplits = group.splits.flatMap(split => 
          split.members.filter(member => member.userId === user.id)
        )
        const totalOwed = userSplits.reduce((sum, member) => 
          sum + (member.isPaid ? 0 : Number(member.amount)), 0
        )

        return {
          id: group.id,
          name: group.name,
          hash: `grp_${group.id.slice(0, 8)}`,
          members: group.members.map(m => m.user.ensName || m.user.walletAddress),
          createdAt: group.createdAt,
          isSettled: settledSplits === totalSplits && totalSplits > 0,
          totalAmount: group.splits.reduce((sum, s) => sum + Number(s.totalAmount), 0),
          yourShare: totalOwed,
          isPaid: totalOwed === 0
        }
      })
    } catch (error) {
      console.error('❌ Error fetching groups:', error)
      return []
    }
  }

  // Split Operations
  async createSplit(splitData: SplitData) {
    try {
      const creator = await this.createOrUpdateUser(splitData.createdBy)
      
      const split = await this.client.split.create({
        data: {
          groupId: splitData.groupId,
          creatorId: creator.id,
          title: splitData.title,
          description: splitData.description,
          totalAmount: splitData.totalAmount,
          currency: splitData.currency,
          splitType: splitData.splitType.toUpperCase() as any,
          status: splitData.isSettled ? 'SETTLED' : 'ACTIVE',
          paidBy: splitData.paidBy,
          ipfsHash: splitData.ipfsHash,
          members: {
            create: await Promise.all(
              splitData.members.map(async (member) => {
                const user = await this.createOrUpdateUser(member.walletId)
                return {
                  userId: user.id,
                  amount: member.amount,
                  isPaid: member.isPaid,
                  paidAt: member.paidAt ? new Date(member.paidAt) : null
                }
              })
            )
          }
        },
        include: {
          members: { include: { user: true } },
          group: true
        }
      })

      console.log('✅ Split created:', split.id)
      return split
    } catch (error) {
      console.error('❌ Error creating split:', error)
      throw error
    }
  }

  async getUserDues(userWallet: string): Promise<UserDues> {
    try {
      const user = await this.getUserByWallet(userWallet)
      if (!user) {
        return { 
          userWallet, 
          totalOwed: 0, 
          totalOwedToUser: 0, 
          netBalance: 0, 
          pendingGroups: [],
          globalOptimalTransactions: []
        }
      }

      const splitMembers = await this.client.splitMember.findMany({
        where: { userId: user.id },
        include: {
          split: {
            include: { group: true }
          }
        }
      })

      let totalOwed = 0
      let totalOwedToUser = 0
      const groupDues = new Map<string, {
        groupId: string
        groupName: string
        amountOwed: number
        amountOwedToUser: number
      }>()

      for (const member of splitMembers) {
        const split = member.split
        if (split.status === 'SETTLED') continue

        const groupId = split.groupId
        const groupName = split.group.name
        
        if (!groupDues.has(groupId)) {
          groupDues.set(groupId, {
            groupId,
            groupName,
            amountOwed: 0,
            amountOwedToUser: 0
          })
        }

        const group = groupDues.get(groupId)!
        
        if (!member.isPaid) {
          const amount = Number(member.amount)
          totalOwed += amount
          group.amountOwed += amount
        }

        // If user paid for this split, calculate what others owe them
        if (split.paidBy === userWallet) {
          const unpaidMembers = await this.client.splitMember.findMany({
            where: {
              splitId: split.id,
              isPaid: false,
              NOT: { userId: user.id }
            }
          })
          
          const amountOwedToUser = unpaidMembers.reduce(
            (sum, unpaidMember) => sum + Number(unpaidMember.amount), 0
          )
          
          totalOwedToUser += amountOwedToUser
          group.amountOwedToUser += amountOwedToUser
        }
      }

      // Get all splits for the user to calculate optimal settlements
      const userSplits = await this.client.split.findMany({
        where: {
          OR: [
            { paidBy: userWallet },
            { members: { some: { userId: user.id } } }
          ],
          status: { not: 'SETTLED' }
        },
        include: {
          group: true,
          members: {
            include: { user: true }
          }
        }
      })

      // Calculate optimal transactions per group
      const groupSplitsMap = new Map<string, any[]>()
      for (const split of userSplits) {
        if (!groupSplitsMap.has(split.groupId)) {
          groupSplitsMap.set(split.groupId, [])
        }
        groupSplitsMap.get(split.groupId)!.push(split)
      }

      const pendingGroups = Array.from(groupDues.values())
        .filter(group => group.amountOwed > 0 || group.amountOwedToUser > 0)
        .map(group => {
          const groupSplits = groupSplitsMap.get(group.groupId) || []
          const settlement = calculateGroupSettlement(groupSplits)
          
          return {
            ...group,
            netAmount: group.amountOwedToUser - group.amountOwed,
            optimalTransactions: settlement.transactions.filter(t => 
              t.from === userWallet || t.to === userWallet
            )
          }
        })

      // Calculate global optimal transactions across all groups
      const allSplits = userSplits
      const globalSettlement = calculateGroupSettlement(allSplits)

      return {
        userWallet,
        totalOwed,
        totalOwedToUser,
        netBalance: totalOwedToUser - totalOwed,
        pendingGroups,
        globalOptimalTransactions: globalSettlement.transactions.filter(t => 
          t.from === userWallet || t.to === userWallet
        )
      }
    } catch (error) {
      console.error('❌ Error calculating user dues:', error)
      return { 
        userWallet,
        totalOwed: 0, 
        totalOwedToUser: 0, 
        netBalance: 0, 
        pendingGroups: [], 
        globalOptimalTransactions: [] 
      }
    }
  }

  // Payment Operations
  async recordPayment(
    splitId: string,
    fromUserWallet: string,
    amount: number,
    method: string = 'MANUAL',
    transactionId?: string
  ) {
    try {
      const fromUser = await this.createOrUpdateUser(fromUserWallet)

      const payment = await this.client.payment.create({
        data: {
          splitId,
          fromUserId: fromUser.id,
          amount,
          method: method as any,
          status: 'COMPLETED',
          transactionId,
          description: `Payment for split ${splitId}`
        }
      })

      // Update split member as paid
      await this.client.splitMember.updateMany({
        where: {
          splitId,
          userId: fromUser.id
        },
        data: {
          isPaid: true,
          paidAt: new Date()
        }
      })

      console.log('✅ Payment recorded:', payment.id)
      return payment
    } catch (error) {
      console.error('❌ Error recording payment:', error)
      throw error
    }
  }

  // ENS Cache Operations
  async cacheENSResolution(ensName: string, walletAddress: string | null) {
    try {
      const expiresAt = new Date()
      expiresAt.setMinutes(expiresAt.getMinutes() + 5) // 5 minute cache

      await this.client.eNSCache.upsert({
        where: { ensName },
        update: {
          walletAddress,
          isValid: !!walletAddress,
          lastResolved: new Date(),
          expiresAt
        },
        create: {
          ensName,
          walletAddress,
          isValid: !!walletAddress,
          expiresAt
        }
      })
    } catch (error) {
      console.error('❌ Error caching ENS:', error)
    }
  }

  async getCachedENSResolution(ensName: string) {
    try {
      const cached = await this.client.eNSCache.findUnique({
        where: { ensName }
      })

      if (cached && cached.expiresAt > new Date()) {
        return {
          address: cached.walletAddress,
          error: cached.isValid ? null : 'ENS name not found'
        }
      }

      return null
    } catch (error) {
      console.error('❌ Error getting cached ENS:', error)
      return null
    }
  }

  // Utility method to close connection
  async disconnect() {
    await this.client.$disconnect()
  }
}

export const databaseService = new DatabaseService()
export { prisma }
export default databaseService
