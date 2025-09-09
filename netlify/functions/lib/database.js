// Firebase connection utility
import admin from 'firebase-admin';

let db;

export function getFirestore() {
  if (!db) {
    if (!admin.apps.length) {
      // Initialize Firebase Admin with service account
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    
    db = admin.firestore();
  }
  
  return db;
}

// Helper function to handle database errors
export function handleError(error) {
  console.error('Database error:', error);
  return {
    statusCode: 500,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
    body: JSON.stringify({ 
      error: 'Database error',
      message: error.message 
    }),
  };
}

// Helper function for successful responses
export function successResponse(data) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
    body: JSON.stringify(data),
  };
}

// Handle CORS preflight requests
export function handleCORS() {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
    body: '',
  };
}
