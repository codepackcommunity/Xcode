// lib/firebase/config.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc, collection, query, where, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Admin configuration - PERMISSIONS ONLY
export const ADMIN_CONFIG = {
  // Admin roles and permissions - kept exactly as you had them
  roles: {
    superadmin: ['*'],
    admin: ['approve_users', 'view_users', 'manage_content'],
    manager: ['view_users', 'manage_content'],
    user: [] // Regular users have no admin permissions
  }
};

// Function to get user role ONLY from database
export const getUserRole = async (userId) => {
  if (!userId) return 'user';
  
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return userData?.role || 'user'; // Return role from database or default to 'user'
    }
    return 'user'; // Default if user doesn't exist in database
  } catch (error) {
    console.error('Error fetching user role from database:', error);
    return 'user'; // Default on error
  }
};

// Helper function to check if user is admin (checks database ONLY)
export const isAdmin = async (userId) => {
  if (!userId) return false;
  
  try {
    const role = await getUserRole(userId);
    return ['superadmin', 'admin', 'manager'].includes(role);
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
};

// Helper function to get user permissions
export const getUserPermissions = async (userId) => {
  const role = await getUserRole(userId);
  return ADMIN_CONFIG.roles[role] || [];
};

// Helper function to check if user has specific permission
export const hasPermission = async (userId, permission) => {
  const role = await getUserRole(userId);
  
  if (role === 'superadmin') return true;
  
  const rolePermissions = ADMIN_CONFIG.roles[role];
  if (!rolePermissions) return false;
  
  return rolePermissions.includes('*') || rolePermissions.includes(permission);
};

// Helper function to check if user has specific role
export const hasRole = async (userId, roleToCheck) => {
  const userRole = await getUserRole(userId);
  return userRole === roleToCheck;
};

// Function to create/update user document in database
export const syncUserToDatabase = async (userId, email, additionalData = {}) => {
  if (!userId || !email) return;
  
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    const userData = {
      email: email.toLowerCase()?.trim(),
      updatedAt: new Date().toISOString(),
      ...additionalData
    };
    
    // If user doesn't exist in database yet, set default role
    if (!userDoc.exists()) {
      userData.role = 'user'; // Default role for new users
      userData.createdAt = new Date().toISOString();
    }
    
    await setDoc(userRef, userData, { merge: true });
    
  } catch (error) {
    console.error('Error syncing user to database:', error);
  }
};

// Function to get user data from database (including role)
export const getUserData = async (userId) => {
  if (!userId) return null;
  
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return {
        id: userDoc.id,
        ...userDoc.data()
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching user data:', error);
    return null;
  }
};

// Function to update user role in database (admin only function)
export const updateUserRoleInDB = async (targetUserId, newRole, currentUserId) => {
  if (!currentUserId || !targetUserId) {
    throw new Error('User IDs are required');
  }
  
  // Check if current user has permission to update roles
  const canUpdateRoles = await hasPermission(currentUserId, 'approve_users');
  
  if (!canUpdateRoles) {
    throw new Error('You do not have permission to update user roles');
  }
  
  if (!['superadmin', 'admin', 'manager', 'user'].includes(newRole)) {
    throw new Error('Invalid role specified');
  }
  
  try {
    const userRef = doc(db, 'users', targetUserId);
    await updateDoc(userRef, {
      role: newRole,
      updatedAt: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error('Error updating user role:', error);
    throw error;
  }
};

// DEPRECATED: Keep for backward compatibility but always returns false
export const isAdminEmail = async (email) => {
  console.warn('isAdminEmail is deprecated. Use isAdmin with userId instead.');
  return false;
};

// DEPRECATED: Keep for backward compatibility but uses database
export const getUserRoleByEmail = async (email) => {
  console.warn('getUserRoleByEmail is deprecated. Use getUserRole with userId instead.');
  
  if (!email) return 'user';
  
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email.toLowerCase()?.trim()));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      return userData?.role || 'user';
    }
    return 'user';
  } catch (error) {
    console.error('Error fetching user role by email:', error);
    return 'user';
  }
};

export default app;