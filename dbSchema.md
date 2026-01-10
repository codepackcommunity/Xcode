// ==================== DATABASE STRUCTURE ====================
/*
ALL COLLECTIONS MUST HAVE THESE EXACT STRUCTURES:

1. users (User Management)
   - id (auto)
   - uid (Firebase Auth UID)
   - email
   - fullName
   - role: 'superadmin' | 'manager' | 'sales' | 'dataEntry' | 'user'
   - location: 'Lilongwe' | 'Blantyre' | 'Zomba' | 'Mzuzu' | 'Chitipa' | 'Salima'
   - status: 'pending' | 'approved' | 'rejected'
   - phone: string
   - createdAt: timestamp
   - updatedAt: timestamp
   - approvedBy: uid
   - approvedByName: string
   - approvedAt: timestamp
   - rejectedBy: uid
   - rejectedByName: string
   - rejectedAt: timestamp
   - rejectionReason: string

2. stocks (Inventory Management) - COMPATIBLE WITH INSTALLMENT SYSTEM
   - id (auto)
   - itemCode: string (unique identifier)
   - brand: string
   - model: string
   - category: 'Smartphone' | 'Tablet' | 'Laptop' | 'Accessory' | 'TV' | 'Audio' | 'Other'
   - color: string
   - storage: string
   - quantity: number
   - costPrice: number (in MWK)
   - retailPrice: number (in MWK)
   - wholesalePrice: number (in MWK)
   - discountPercentage: number (0-100)
   - minStockLevel: number
   - reorderQuantity: number
   - location: string
   - supplier: string
   - warrantyPeriod: number (months)
   - description: string
   - createdAt: timestamp
   - updatedAt: timestamp
   - addedBy: uid
   - addedByName: string
   - isActive: boolean (true)

3. sales (Sales Records)
   - id (auto)
   - itemCode: string
   - brand: string
   - model: string
   - category: string
   - color: string
   - storage: string
   - quantity: number
   - costPrice: number
   - salePrice: number
   - discountPercentage: number
   - finalSalePrice: number (salePrice - discount)
   - profit: number (finalSalePrice - costPrice)
   - paymentMethod: 'cash' | 'mobile_money' | 'bank_transfer' | 'installment'
   - customerName: string
   - customerPhone: string
   - customerEmail: string
   - customerAddress: string
   - location: string
   - soldBy: uid
   - soldByName: string
   - soldAt: timestamp
   - receiptNumber: string
   - notes: string

4. stockRequests (Stock Transfers)
   - id (auto)
   - itemCode: string
   - brand: string
   - model: string
   - quantity: number
   - fromLocation: string
   - toLocation: string
   - requestedBy: uid
   - requestedByName: string
   - requestedAt: timestamp
   - status: 'pending' | 'approved' | 'rejected' | 'failed'
   - approvedBy: uid
   - approvedByName: string
   - approvedAt: timestamp
   - rejectedBy: uid
   - rejectedByName: string
   - rejectedAt: timestamp
   - rejectionReason: string
   - sourceStockId: string (reference to stocks.id)

5. stockTransfers (Transfer History)
   - id (auto)
   - requestId: string (reference to stockRequests.id)
   - itemCode: string
   - brand: string
   - model: string
   - quantity: number
   - fromLocation: string
   - toLocation: string
   - transferredBy: uid
   - transferredByName: string
   - transferredAt: timestamp
   - type: 'approved_transfer' | 'rejected_transfer'
   - sourceStockBefore: number
   - sourceStockAfter: number

6. approvalSettings (System Settings)
   - id: 'system_settings' (single document)
   - requireApproval: boolean
   - autoApproveBelow: number
   - allowedLocations: array
   - updatedAt: timestamp
   - updatedBy: uid

7. userApprovalHistory (Audit Log)
   - id (auto)
   - userId: string
   - userEmail: string
   - userName: string
   - action: 'approved' | 'rejected'
   - previousRole: string
   - newRole: string
   - previousLocation: string
   - newLocation: string
   - processedBy: uid
   - processedByName: string
   - processedAt: timestamp
   - notes: string

8. installmentPayments (for compatibility with installment system)
   - id (auto)
   - installmentId: string (reference to installments collection)
   - customerName: string
   - customerPhone: string
   - amount: number
   - paymentType: 'initial' | 'installment' | 'full_payment'
   - paymentDate: timestamp
   - paymentMethod: 'cash' | 'mobile_money' | 'bank_transfer'
   - receiptNumber: string
   - recordedBy: uid
   - recordedByName: string
   - notes: string
   - createdAt: timestamp

9. installments (for compatibility - can be added later)
   - Will use same structure as installment system
*/